package sources

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/anthemworld/cli/pkg/jobs"
)

//go:embed factbook.schema.sql
var factbookSchema string

// factbookRegions lists all region directory paths in factbook/factbook.json
var factbookRegions = []string{
	"africa",
	"australia-oceania",
	"central-america-n-caribbean",
	"central-asia",
	"east-n-southeast-asia",
	"europe",
	"middle-east",
	"north-america",
	"south-america",
	"south-asia",
}

const factbookRawBase = "https://raw.githubusercontent.com/factbook/factbook.json/master"
const factbookAPIBase = "https://api.github.com/repos/factbook/factbook.json/contents"

// FactbookSource downloads anthem history and country enrichment from CIA World Factbook
type FactbookSource struct {
	id   string
	name string
	url  string
}

// NewFactbookSource creates a new Factbook data source
func NewFactbookSource() *FactbookSource {
	return &FactbookSource{
		id:   "factbook-json",
		name: "CIA World Factbook (JSON)",
		url:  "https://github.com/factbook/factbook.json",
	}
}

func (f *FactbookSource) ID() string   { return f.id }
func (f *FactbookSource) Name() string { return f.name }
func (f *FactbookSource) Type() string { return "country-enrichment" }
func (f *FactbookSource) URL() string  { return f.url }

const factbookSchemaVersion = 1

func (f *FactbookSource) GetSchema() string        { return factbookSchema }
func (f *FactbookSource) GetSchemaVersion() int    { return factbookSchemaVersion }
func (f *FactbookSource) GetTables() []string      { return []string{"factbook_metadata"} }

func (f *FactbookSource) HealthCheck(ctx context.Context) HealthStatus {
	client := &http.Client{Timeout: 10 * time.Second}
	testURL := factbookRawBase + "/north-america/us.json"
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, "HEAD", testURL, nil)
	if err != nil {
		return HealthStatus{Healthy: false, Message: err.Error()}
	}
	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return HealthStatus{Healthy: false, Message: err.Error(), ResponseTime: elapsed}
	}
	defer resp.Body.Close()
	healthy := resp.StatusCode >= 200 && resp.StatusCode < 300
	msg := "OK"
	if !healthy {
		msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return HealthStatus{Healthy: healthy, StatusCode: resp.StatusCode, Message: msg, ResponseTime: elapsed}
}

// factbookDirEntry is one file entry from the GitHub contents API
type factbookDirEntry struct {
	Name        string `json:"name"`
	DownloadURL string `json:"download_url"`
}

// factbookProfile is the subset of fields we care about in each country JSON
type factbookProfile struct {
	Government struct {
		CountryName struct {
			ConvLongForm  struct{ Text string `json:"text"` } `json:"conventional long form"`
			ConvShortForm struct{ Text string `json:"text"` } `json:"conventional short form"`
		} `json:"Country name"`
		NationalAnthem struct {
			Title  struct{ Text string `json:"text"` } `json:"title"`
			Lyrics struct{ Text string `json:"text"` } `json:"lyrics/music"`
			History struct{ Text string `json:"text"` } `json:"history"`
		} `json:"National anthem(s)"`
		NationalSymbols struct {
			Text string `json:"text"`
		} `json:"National symbol(s)"`
		NationalColors struct {
			Text string `json:"text"`
		} `json:"National color(s)"`
	} `json:"Government"`
}

// Download fetches anthem history and country enrichment from factbook.json
func (f *FactbookSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting CIA World Factbook download")

	if err := f.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	client := &http.Client{Timeout: 30 * time.Second}

	updated := 0
	skipped := 0
	errors := 0

	for _, region := range factbookRegions {
		logger.Infof("Processing region: %s", region)

		entries, err := f.listRegionFiles(ctx, client, region)
		if err != nil {
			logger.Infof("Error listing %s: %v", region, err)
			errors++
			continue
		}

		for _, entry := range entries {
			if !strings.HasSuffix(entry.Name, ".json") {
				continue
			}
			ciaCode := strings.TrimSuffix(entry.Name, ".json")

			profile, err := f.fetchProfile(ctx, client, region, ciaCode)
			if err != nil {
				errors++
				continue
			}

			// Determine which country this is by matching name
			countryID, err := f.matchCountry(db, ciaCode, profile)
			if err != nil || countryID == "" {
				skipped++
				continue
			}

			// Parse anthem title and optional English translation
			rawTitle := stripHTML(profile.Government.NationalAnthem.Title.Text)
			anthemName, anthemTitleEn := parseAnthemTitle(rawTitle)

			history := stripHTML(profile.Government.NationalAnthem.History.Text)
			symbols := stripHTML(profile.Government.NationalSymbols.Text)
			colors := stripHTML(profile.Government.NationalColors.Text)

			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				errors++
				continue
			}

			// Store factbook_code and enrichment on country
			_, err = tx.Exec(`
				UPDATE countries
				SET factbook_code = ?, national_symbols = ?, national_colors = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, ciaCode, nullIfEmpty(symbols), nullIfEmpty(colors), countryID)
			if err != nil {
				tx.Rollback()
				errors++
				continue
			}

			// Update anthem with history, English title, and clean name
			_, err = tx.Exec(`
				UPDATE anthems
				SET anthem_history = ?,
				    anthem_title_en = ?,
				    name = CASE WHEN ? != '' AND (name = '' OR name IS NULL) THEN ? ELSE name END,
				    updated_at = CURRENT_TIMESTAMP
				WHERE country_id = ?
			`, nullIfEmpty(history), nullIfEmpty(anthemTitleEn), anthemName, anthemName, countryID)
			if err != nil {
				tx.Rollback()
				errors++
				continue
			}

			if err = tx.Commit(); err != nil {
				errors++
				continue
			}
			updated++
		}
		// Brief pause between regions to be polite
		time.Sleep(500 * time.Millisecond)
	}

	_, _ = db.Exec(`INSERT OR REPLACE INTO factbook_metadata (key, value, updated_at) VALUES ('last_download', ?, CURRENT_TIMESTAMP)`, time.Now().Format(time.RFC3339))
	_, _ = db.Exec(`INSERT OR REPLACE INTO factbook_metadata (key, value, updated_at) VALUES ('record_count', ?, CURRENT_TIMESTAMP)`, fmt.Sprintf("%d", updated))

	logger.Infof("✓ Updated %d countries, skipped %d, %d errors", updated, skipped, errors)
	return nil
}

func (f *FactbookSource) listRegionFiles(ctx context.Context, client *http.Client, region string) ([]factbookDirEntry, error) {
	url := fmt.Sprintf("%s/%s", factbookAPIBase, region)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var entries []factbookDirEntry
	return entries, json.Unmarshal(body, &entries)
}

func (f *FactbookSource) fetchProfile(ctx context.Context, client *http.Client, region, ciaCode string) (*factbookProfile, error) {
	url := fmt.Sprintf("%s/%s/%s.json", factbookRawBase, region, ciaCode)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d for %s/%s", resp.StatusCode, region, ciaCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var profile factbookProfile
	return &profile, json.Unmarshal(body, &profile)
}

// matchCountry finds a country in our DB that matches the factbook profile.
// Priority: exact CIA code match (for known mappings), then name matching.
func (f *FactbookSource) matchCountry(db *sql.DB, ciaCode string, profile *factbookProfile) (string, error) {
	// Some CIA codes match ISO alpha-2 directly
	var countryID string
	err := db.QueryRow(`SELECT id FROM countries WHERE LOWER(iso_alpha2) = LOWER(?) LIMIT 1`, ciaCode).Scan(&countryID)
	if err == nil {
		return countryID, nil
	}

	// Try matching by conventional long form name
	longName := profile.Government.CountryName.ConvLongForm.Text
	shortName := profile.Government.CountryName.ConvShortForm.Text

	for _, name := range []string{longName, shortName} {
		if name == "" || name == "none" || name == "NA" {
			continue
		}
		name = cleanCountryName(name)
		err = db.QueryRow(`
			SELECT id FROM countries
			WHERE LOWER(name) = LOWER(?) OR LOWER(common_name) = LOWER(?)
			LIMIT 1`, name, name).Scan(&countryID)
		if err == nil {
			return countryID, nil
		}
		// Try partial match (handle "Republic of X" vs "X")
		err = db.QueryRow(`
			SELECT id FROM countries
			WHERE LOWER(name) LIKE '%' || LOWER(?) || '%'
			   OR LOWER(?) LIKE '%' || LOWER(name) || '%'
			LIMIT 1`, name, name).Scan(&countryID)
		if err == nil {
			return countryID, nil
		}
	}
	return "", nil
}

// parseAnthemTitle splits e.g. `"La Marseillaise" (The Song of Marseille)` into
// name="La Marseillaise" and titleEn="The Song of Marseille"
func parseAnthemTitle(raw string) (name, titleEn string) {
	// Remove surrounding quotes from the main name
	raw = strings.TrimSpace(raw)
	// Find opening paren for English translation
	parenIdx := strings.Index(raw, "(")
	if parenIdx > 0 {
		name = strings.Trim(raw[:parenIdx], `"' `)
		titleEn = strings.Trim(raw[parenIdx:], "()")
		titleEn = strings.TrimSpace(titleEn)
	} else {
		name = strings.Trim(raw, `"' `)
	}
	return
}

// stripHTML removes basic HTML tags and decodes common entities
func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	result := b.String()
	// Decode common HTML entities
	replacer := strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`,
		"&ldquo;", `"`, "&rdquo;", `"`, "&lsquo;", "'", "&rsquo;", "'",
		"&nbsp;", " ", "&#39;", "'",
	)
	result = replacer.Replace(result)
	// Collapse runs of whitespace
	var out strings.Builder
	prevSpace := false
	for _, r := range result {
		if unicode.IsSpace(r) {
			if !prevSpace {
				out.WriteRune(' ')
			}
			prevSpace = true
		} else {
			out.WriteRune(r)
			prevSpace = false
		}
	}
	return strings.TrimSpace(out.String())
}

func cleanCountryName(s string) string {
	// Remove trailing note markers like "(2023 est.)"
	if idx := strings.Index(s, "("); idx > 0 {
		s = s[:idx]
	}
	return strings.TrimSpace(s)
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (f *FactbookSource) ApplySchema(db *sql.DB) error {
	// Execute each statement separately; some may fail if column already exists
	stmts := strings.Split(f.GetSchema(), ";")
	for _, stmt := range stmts {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			// Ignore "duplicate column" errors from ALTER TABLE
			if !strings.Contains(err.Error(), "duplicate column") {
				// Log but don't fail for schema-only errors
				_ = err
			}
		}
	}
	return nil
}

func (f *FactbookSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='factbook_metadata')`).Scan(&exists)
	return exists, err
}

func (f *FactbookSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{SchemaVersion: factbookSchemaVersion}
	exists, err := f.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}
	var countStr string
	_ = db.QueryRow(`SELECT value FROM factbook_metadata WHERE key = 'record_count'`).Scan(&countStr)
	fmt.Sscanf(countStr, "%d", &stats.RecordCount)
	_ = db.QueryRow(`SELECT value FROM factbook_metadata WHERE key = 'last_download'`).Scan(&stats.LastUpdated)
	return stats, nil
}

func (f *FactbookSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := f.SchemaExists(db)
	if err != nil || !exists {
		return true, err
	}
	var countStr string
	if err := db.QueryRow(`SELECT value FROM factbook_metadata WHERE key = 'record_count'`).Scan(&countStr); err != nil {
		return true, nil
	}
	var count int
	fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil
	}
	var lastDownload string
	if err := db.QueryRow(`SELECT value FROM factbook_metadata WHERE key = 'last_download'`).Scan(&lastDownload); err != nil {
		return true, nil
	}
	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil
	}
	return time.Since(lastTime) > 30*24*time.Hour, nil
}
