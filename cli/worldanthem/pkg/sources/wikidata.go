package sources

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/anthemworld/cli/pkg/jobs"
)

const wikidataSchemaVersion = 1

const wikidataSchema = `
CREATE TABLE IF NOT EXISTS wikidata_metadata (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO wikidata_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO wikidata_metadata (key, value) VALUES ('last_download', '');
INSERT OR IGNORE INTO wikidata_metadata (key, value) VALUES ('record_count', '0');
`

// WikidataSource downloads national anthem metadata from Wikidata SPARQL.
type WikidataSource struct {
	id   string
	name string
	url  string
}

// NewWikidataSource creates a new Wikidata data source.
func NewWikidataSource() *WikidataSource {
	return &WikidataSource{
		id:   "wikidata-sparql",
		name: "Wikidata SPARQL",
		url:  "https://query.wikidata.org/sparql",
	}
}

func (w *WikidataSource) ID() string   { return w.id }
func (w *WikidataSource) Name() string { return w.name }
func (w *WikidataSource) Type() string { return "anthem-metadata" }
func (w *WikidataSource) URL() string  { return w.url }

func (w *WikidataSource) GetSchema() string        { return wikidataSchema }
func (w *WikidataSource) GetSchemaVersion() int    { return wikidataSchemaVersion }
func (w *WikidataSource) GetTables() []string      { return []string{"wikidata_metadata"} }

func (w *WikidataSource) ApplySchema(db *sql.DB) error {
	stmts := strings.Split(w.GetSchema(), ";")
	for _, stmt := range stmts {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("failed to apply schema statement: %w", err)
		}
	}
	return nil
}

func (w *WikidataSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='wikidata_metadata')`).Scan(&exists)
	return exists, err
}

func (w *WikidataSource) HealthCheck(ctx context.Context) HealthStatus {
	client := &http.Client{Timeout: 10 * time.Second}
	testURL := w.url + "?query=SELECT+%3Fitem+WHERE+%7B+%3Fitem+wdt%3AP31+wd%3AQ6256+%7D+LIMIT+1&format=json"
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, "GET", testURL, nil)
	if err != nil {
		return HealthStatus{Healthy: false, Message: err.Error()}
	}
	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")
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

// wikidataSPARQLResponse is the envelope for a Wikidata SPARQL JSON response.
type wikidataSPARQLResponse struct {
	Results struct {
		Bindings []map[string]struct {
			Type  string `json:"type"`
			Value string `json:"value"`
		} `json:"bindings"`
	} `json:"results"`
}

// sparqlVal extracts the string value of a binding by key.
func sparqlVal(row map[string]struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}, key string) string {
	if v, ok := row[key]; ok {
		return v.Value
	}
	return ""
}

// Download fetches anthem metadata from Wikidata SPARQL and stores it in the anthems table.
func (w *WikidataSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting Wikidata SPARQL download")

	if err := w.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	// SPARQL query: national anthems with ISO country codes
	sparql := `
SELECT ?country ?countryLabel ?anthem ?anthemLabel ?composerLabel ?lyricistLabel ?inceptionDate ?wikidataID
WHERE {
  ?country wdt:P31 wd:Q6256 .
  ?country wdt:P85 ?anthem .
  OPTIONAL { ?anthem wdt:P86 ?composer . }
  OPTIONAL { ?anthem wdt:P676 ?lyricist . }
  OPTIONAL { ?anthem wdt:P571 ?inceptionDate . }
  BIND(STRAFTER(STR(?anthem), "http://www.wikidata.org/entity/") AS ?wikidataID)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY ?countryLabel
`

	client := &http.Client{Timeout: 120 * time.Second}

	apiURL := fmt.Sprintf("%s?query=%s&format=json", w.url, url.QueryEscape(strings.TrimSpace(sparql)))
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/sparql-results+json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("SPARQL endpoint returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	var result wikidataSPARQLResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse SPARQL response: %w", err)
	}

	bindings := result.Results.Bindings
	logger.Infof("Received %d anthem records from Wikidata", len(bindings))

	inserted := 0
	skipped := 0
	for _, row := range bindings {
		countryLabel := sparqlVal(row, "countryLabel")
		anthemLabel := sparqlVal(row, "anthemLabel")
		wikidataID := sparqlVal(row, "wikidataID")
		composerLabel := sparqlVal(row, "composerLabel")
		lyricistLabel := sparqlVal(row, "lyricistLabel")
		inceptionDate := sparqlVal(row, "inceptionDate")

		if countryLabel == "" || anthemLabel == "" {
			skipped++
			continue
		}

		// Find country ID in DB by name or Wikidata QID
		var countryID string
		err := db.QueryRow(`
			SELECT id FROM countries
			WHERE LOWER(name) = LOWER(?) OR LOWER(common_name) = LOWER(?)
			LIMIT 1
		`, countryLabel, countryLabel).Scan(&countryID)
		if err != nil {
			// Try partial match
			err = db.QueryRow(`
				SELECT id FROM countries
				WHERE LOWER(name) LIKE '%' || LOWER(?) || '%'
				   OR LOWER(?) LIKE '%' || LOWER(name) || '%'
				LIMIT 1
			`, countryLabel, countryLabel).Scan(&countryID)
		}
		if err != nil || countryID == "" {
			skipped++
			continue
		}

		// Truncate inception date to year only if it looks like a full datetime
		adoptedDate := ""
		if len(inceptionDate) >= 4 {
			adoptedDate = inceptionDate[:4]
		}

		// Upsert anthem
		var existingID int
		err = db.QueryRow(`SELECT id FROM anthems WHERE country_id = ? LIMIT 1`, countryID).Scan(&existingID)
		if err == nil {
			// Update existing
			_, _ = db.Exec(`
				UPDATE anthems SET wikidata_id = ?, name = CASE WHEN ? != '' AND (name = '' OR name IS NULL) THEN ? ELSE name END,
				    composer = CASE WHEN ? != '' THEN ? ELSE composer END,
				    lyricist = CASE WHEN ? != '' THEN ? ELSE lyricist END,
				    adopted_date = CASE WHEN ? != '' THEN ? ELSE adopted_date END,
				    updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, wikidataID,
				anthemLabel, anthemLabel,
				composerLabel, composerLabel,
				lyricistLabel, lyricistLabel,
				adoptedDate, adoptedDate,
				existingID)
		} else {
			// Insert new
			_, err = db.Exec(`
				INSERT INTO anthems (country_id, name, composer, lyricist, adopted_date, wikidata_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`, countryID, anthemLabel,
				nullIfWikidataEmpty(composerLabel),
				nullIfWikidataEmpty(lyricistLabel),
				nullIfWikidataEmpty(adoptedDate),
				wikidataID)
			if err != nil {
				logger.Errorf("Failed to insert anthem for %s: %v", countryLabel, err)
				continue
			}
			inserted++
		}
	}

	_, _ = db.Exec(`INSERT OR REPLACE INTO wikidata_metadata (key, value, updated_at) VALUES ('last_download', ?, CURRENT_TIMESTAMP)`,
		time.Now().Format(time.RFC3339))
	_, _ = db.Exec(`INSERT OR REPLACE INTO wikidata_metadata (key, value, updated_at) VALUES ('record_count', ?, CURRENT_TIMESTAMP)`,
		fmt.Sprintf("%d", inserted))

	logger.Infof("✓ Inserted %d anthems, skipped %d", inserted, skipped)
	return nil
}

func nullIfWikidataEmpty(s string) interface{} {
	if s == "" || strings.HasPrefix(s, "http") {
		return nil
	}
	return s
}

func (w *WikidataSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{SchemaVersion: wikidataSchemaVersion}
	exists, err := w.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}
	var countStr string
	_ = db.QueryRow(`SELECT value FROM wikidata_metadata WHERE key = 'record_count'`).Scan(&countStr)
	fmt.Sscanf(countStr, "%d", &stats.RecordCount)
	_ = db.QueryRow(`SELECT value FROM wikidata_metadata WHERE key = 'last_download'`).Scan(&stats.LastUpdated)
	return stats, nil
}

func (w *WikidataSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := w.SchemaExists(db)
	if err != nil || !exists {
		return true, err
	}
	var countStr string
	if err := db.QueryRow(`SELECT value FROM wikidata_metadata WHERE key = 'record_count'`).Scan(&countStr); err != nil {
		return true, nil
	}
	var count int
	fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil
	}
	var lastDownload string
	if err := db.QueryRow(`SELECT value FROM wikidata_metadata WHERE key = 'last_download'`).Scan(&lastDownload); err != nil {
		return true, nil
	}
	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil
	}
	return time.Since(lastTime) > 30*24*time.Hour, nil
}
