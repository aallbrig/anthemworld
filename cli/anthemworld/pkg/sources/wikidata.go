package sources

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/anthemworld/cli/pkg/httpclient"
	"github.com/anthemworld/cli/pkg/jobs"
)

//go:embed wikidata.schema.sql
var wikidataSchema string

const wikidataSPARQLQuery = `
SELECT ?country ?countryLabel ?countryCode ?anthem ?anthemLabel ?composer ?composerLabel ?lyricist ?lyricistLabel ?adopted
WHERE {
  ?country wdt:P31 wd:Q6256;
           wdt:P297 ?countryCode;
           wdt:P85 ?anthem.
  OPTIONAL { ?anthem wdt:P86 ?composer }
  OPTIONAL { ?anthem wdt:P676 ?lyricist }
  OPTIONAL { ?anthem wdt:P571 ?adopted }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
`

// WikidataSource downloads anthem metadata from Wikidata SPARQL endpoint
type WikidataSource struct {
	id   string
	name string
	url  string
}

// NewWikidataSource creates a new Wikidata SPARQL data source
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

const wikidataSchemaVersion = 1

func (w *WikidataSource) GetSchema() string {
	return wikidataSchema
}

func (w *WikidataSource) GetSchemaVersion() int {
	return wikidataSchemaVersion
}

func (w *WikidataSource) GetTables() []string {
	return []string{"wikidata_metadata"}
}

// HealthCheck verifies the Wikidata SPARQL endpoint is accessible
func (w *WikidataSource) HealthCheck(ctx context.Context) HealthStatus {
	// Simple test query
	testQuery := "SELECT ?item WHERE { ?item wdt:P31 wd:Q6256 } LIMIT 1"
	reqURL := fmt.Sprintf("%s?query=%s&format=json", w.url, url.QueryEscape(testQuery))

	c := httpclient.New(httpclient.WithTimeout(10 * time.Second))

	start := time.Now()
	resp, err := c.Get(ctx, reqURL)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		return HealthStatus{
			Healthy:      false,
			StatusCode:   0,
			Message:      fmt.Sprintf("Connection failed: %v", err),
			ResponseTime: elapsed,
		}
	}
	defer resp.Body.Close()

	healthy := resp.StatusCode >= 200 && resp.StatusCode < 300
	message := "OK"
	if !healthy {
		message = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	return HealthStatus{
		Healthy:      healthy,
		StatusCode:   resp.StatusCode,
		Message:      message,
		ResponseTime: elapsed,
	}
}

// WikidataResult represents the SPARQL query result structure
type WikidataResult struct {
	Results struct {
		Bindings []struct {
			CountryCode struct {
				Value string `json:"value"`
			} `json:"countryCode"`
			CountryLabel struct {
				Value string `json:"value"`
			} `json:"countryLabel"`
			AnthemLabel struct {
				Value string `json:"value"`
			} `json:"anthemLabel"`
			Anthem struct {
				Value string `json:"value"`
			} `json:"anthem"`
			Composer struct {
				Value string `json:"value"`
			} `json:"composer,omitempty"`
			ComposerLabel struct {
				Value string `json:"value"`
			} `json:"composerLabel,omitempty"`
			Lyricist struct {
				Value string `json:"value"`
			} `json:"lyricist,omitempty"`
			LyricistLabel struct {
				Value string `json:"value"`
			} `json:"lyricistLabel,omitempty"`
			Adopted struct {
				Value string `json:"value"`
			} `json:"adopted,omitempty"`
		} `json:"bindings"`
	} `json:"results"`
}

// Download fetches anthem metadata from Wikidata and stores it
func (w *WikidataSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting Wikidata SPARQL download")

	// Ensure schema exists
	if err := w.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	// Execute SPARQL query
	logger.Infof("Querying Wikidata SPARQL endpoint: %s", w.url)

	reqURL := fmt.Sprintf("%s?query=%s&format=json", w.url, url.QueryEscape(wikidataSPARQLQuery))

	c := httpclient.New(httpclient.WithTimeout(60 * time.Second))

	resp, err := c.Get(ctx, reqURL)
	if err != nil {
		return fmt.Errorf("failed to query Wikidata: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Wikidata returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse JSON response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	var result WikidataResult
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	bindings := result.Results.Bindings
	logger.Infof("Received %d anthem records from Wikidata", len(bindings))

	// Begin transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Insert/update anthems
	inserted := 0
	updated := 0
	skipped := 0

	for _, binding := range bindings {
		// Get country code (ISO alpha-2, convert to lowercase alpha-3 ID)
		countryCode := binding.CountryCode.Value
		
		// Look up country by ISO alpha-2 code
		var countryID string
		err := tx.QueryRow("SELECT id FROM countries WHERE iso_alpha2 = ?", countryCode).Scan(&countryID)
		if err == sql.ErrNoRows {
			// Country not found, skip
			skipped++
			continue
		}
		if err != nil {
			return fmt.Errorf("failed to lookup country %s: %w", countryCode, err)
		}

		anthemName := binding.AnthemLabel.Value
		if anthemName == "" {
			skipped++
			continue
		}

		composer := ""
		if binding.ComposerLabel.Value != "" {
			composer = binding.ComposerLabel.Value
		}

		lyricist := ""
		if binding.LyricistLabel.Value != "" {
			lyricist = binding.LyricistLabel.Value
		}

		adoptedDate := ""
		if binding.Adopted.Value != "" {
			// Parse date (Wikidata returns ISO 8601)
			adoptedDate = binding.Adopted.Value
			// Extract just the date part (YYYY-MM-DD)
			if len(adoptedDate) > 10 {
				adoptedDate = adoptedDate[:10]
			}
		}

		wikidataID := ""
		if binding.Anthem.Value != "" {
			// Extract Wikidata ID from URL (e.g., http://www.wikidata.org/entity/Q44384 -> Q44384)
			parts := strings.Split(binding.Anthem.Value, "/")
			if len(parts) > 0 {
				wikidataID = parts[len(parts)-1]
			}
		}

		wikipediaURL := ""
		if wikidataID != "" {
			wikipediaURL = fmt.Sprintf("https://en.wikipedia.org/wiki/%s", strings.ReplaceAll(anthemName, " ", "_"))
		}

		// Check if anthem already exists for this country
		var existingAnthemID int
		err = tx.QueryRow("SELECT id FROM anthems WHERE country_id = ?", countryID).Scan(&existingAnthemID)
		
		if err == sql.ErrNoRows {
			// Insert new anthem
			_, err = tx.Exec(`
				INSERT INTO anthems (country_id, name, composer, lyricist, adopted_date, wikidata_id, wikipedia_url)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`, countryID, anthemName, composer, lyricist, adoptedDate, wikidataID, wikipediaURL)
			if err != nil {
				return fmt.Errorf("failed to insert anthem for %s: %w", countryID, err)
			}
			inserted++
		} else if err == nil {
			// Update existing anthem
			_, err = tx.Exec(`
				UPDATE anthems 
				SET name = ?, composer = ?, lyricist = ?, adopted_date = ?, wikidata_id = ?, wikipedia_url = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, anthemName, composer, lyricist, adoptedDate, wikidataID, wikipediaURL, existingAnthemID)
			if err != nil {
				return fmt.Errorf("failed to update anthem for %s: %w", countryID, err)
			}
			updated++
		} else {
			return fmt.Errorf("failed to check anthem existence: %w", err)
		}
	}

	// Update metadata
	_, err = tx.Exec(`
		INSERT OR REPLACE INTO wikidata_metadata (key, value, updated_at)
		VALUES ('last_download', ?, CURRENT_TIMESTAMP)
	`, time.Now().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("failed to update metadata: %w", err)
	}

	_, err = tx.Exec(`
		INSERT OR REPLACE INTO wikidata_metadata (key, value, updated_at)
		VALUES ('record_count', ?, CURRENT_TIMESTAMP)
	`, fmt.Sprintf("%d", len(bindings)))
	if err != nil {
		return fmt.Errorf("failed to update record count: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	logger.Infof("✓ Inserted %d anthems, updated %d anthems, skipped %d", inserted, updated, skipped)
	return nil
}

func (w *WikidataSource) ApplySchema(db *sql.DB) error {
	_, err := db.Exec(w.GetSchema())
	return err
}

func (w *WikidataSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM sqlite_master 
			WHERE type='table' AND name='wikidata_metadata'
		)
	`).Scan(&exists)
	return exists, err
}

func (w *WikidataSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{
		SchemaVersion: wikidataSchemaVersion,
	}

	exists, err := w.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}

	var countStr string
	err = db.QueryRow(`
		SELECT value FROM wikidata_metadata WHERE key = 'record_count'
	`).Scan(&countStr)
	if err != nil && err != sql.ErrNoRows {
		return stats, err
	}
	_, _ = fmt.Sscanf(countStr, "%d", &stats.RecordCount)

	err = db.QueryRow(`
		SELECT value FROM wikidata_metadata WHERE key = 'last_download'
	`).Scan(&stats.LastUpdated)
	if err != nil && err != sql.ErrNoRows {
		return stats, err
	}

	var pageCount, pageSize int64
	_ = db.QueryRow("PRAGMA page_count").Scan(&pageCount)
	_ = db.QueryRow("PRAGMA page_size").Scan(&pageSize)
	stats.StorageBytes = (pageCount * pageSize) / int64(len(AllSources)+1)

	return stats, nil
}

func (w *WikidataSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := w.SchemaExists(db)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}

	var countStr string
	err = db.QueryRow(`
		SELECT value FROM wikidata_metadata WHERE key = 'record_count'
	`).Scan(&countStr)
	if err == sql.ErrNoRows {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	var count int
	_, _ = fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil
	}

	var lastDownload string
	err = db.QueryRow(`
		SELECT value FROM wikidata_metadata WHERE key = 'last_download'
	`).Scan(&lastDownload)
	if err == sql.ErrNoRows {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil
	}

	age := time.Since(lastTime)
	return age > 30*24*time.Hour, nil
}
