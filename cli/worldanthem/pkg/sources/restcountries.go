package sources

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/anthemworld/cli/pkg/jobs"
)

const restCountriesSchemaVersion = 1

// restCountriesSchema creates the metadata table used by this source.
const restCountriesSchema = `
CREATE TABLE IF NOT EXISTS restcountries_metadata (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO restcountries_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO restcountries_metadata (key, value) VALUES ('last_download', '');
INSERT OR IGNORE INTO restcountries_metadata (key, value) VALUES ('record_count', '0');
`

// RestCountriesSource downloads country metadata from the REST Countries API.
type RestCountriesSource struct {
	id   string
	name string
	url  string
}

// NewRestCountriesSource creates a new REST Countries data source.
func NewRestCountriesSource() *RestCountriesSource {
	return &RestCountriesSource{
		id:   "rest-countries",
		name: "REST Countries API",
		url:  "https://restcountries.com/v3.1/all",
	}
}

func (r *RestCountriesSource) ID() string   { return r.id }
func (r *RestCountriesSource) Name() string { return r.name }
func (r *RestCountriesSource) Type() string { return "country-metadata" }
func (r *RestCountriesSource) URL() string  { return r.url }

func (r *RestCountriesSource) GetSchema() string        { return restCountriesSchema }
func (r *RestCountriesSource) GetSchemaVersion() int    { return restCountriesSchemaVersion }
func (r *RestCountriesSource) GetTables() []string      { return []string{"restcountries_metadata"} }

func (r *RestCountriesSource) ApplySchema(db *sql.DB) error {
	stmts := strings.Split(r.GetSchema(), ";")
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

func (r *RestCountriesSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='restcountries_metadata')`).Scan(&exists)
	return exists, err
}

func (r *RestCountriesSource) HealthCheck(ctx context.Context) HealthStatus {
	client := &http.Client{Timeout: 10 * time.Second}
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, "GET", r.url+"?fields=name,cca2,cca3", nil)
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

// restCountry represents the relevant fields from the REST Countries API response.
type restCountry struct {
	Name struct {
		Common   string `json:"common"`
		Official string `json:"official"`
	} `json:"name"`
	CCA2      string `json:"cca2"`
	CCA3      string `json:"cca3"`
	UNMember  bool   `json:"unMember"`
	Capital   []string `json:"capital"`
	Region    string `json:"region"`
	Subregion string `json:"subregion"`
}

// Download fetches all countries from the REST Countries API and upserts them.
func (r *RestCountriesSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting REST Countries API download")

	if err := r.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET",
		r.url+"?fields=name,cca2,cca3,unMember,capital,region,subregion", nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	var countries []restCountry
	if err := json.Unmarshal(body, &countries); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	logger.Infof("Received %d countries from REST Countries API", len(countries))

	inserted := 0
	updated := 0
	for _, c := range countries {
		id := strings.ToLower(c.CCA3)
		if id == "" {
			id = strings.ToLower(c.CCA2)
		}
		if id == "" {
			continue
		}

		capital := ""
		if len(c.Capital) > 0 {
			capital = c.Capital[0]
		}

		var existing int
		_ = db.QueryRow(`SELECT COUNT(*) FROM countries WHERE id = ?`, id).Scan(&existing)
		if existing > 0 {
			_, err = db.Exec(`
				UPDATE countries
				SET common_name = ?, iso_alpha2 = ?, iso_alpha3 = ?,
				    un_member = ?, capital = ?, region = ?, subregion = ?,
				    updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, c.Name.Common, c.CCA2, c.CCA3, c.UNMember, capital, c.Region, c.Subregion, id)
			if err != nil {
				logger.Errorf("Failed to update country %s: %v", id, err)
				continue
			}
			updated++
		} else {
			_, err = db.Exec(`
				INSERT INTO countries (id, name, common_name, iso_alpha2, iso_alpha3, un_member,
				                      capital, region, subregion, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`, id, c.Name.Official, c.Name.Common, c.CCA2, c.CCA3, c.UNMember,
				capital, c.Region, c.Subregion)
			if err != nil {
				logger.Errorf("Failed to insert country %s: %v", id, err)
				continue
			}
			inserted++
		}
	}

	count := inserted + updated
	_, _ = db.Exec(`INSERT OR REPLACE INTO restcountries_metadata (key, value, updated_at) VALUES ('last_download', ?, CURRENT_TIMESTAMP)`,
		time.Now().Format(time.RFC3339))
	_, _ = db.Exec(`INSERT OR REPLACE INTO restcountries_metadata (key, value, updated_at) VALUES ('record_count', ?, CURRENT_TIMESTAMP)`,
		fmt.Sprintf("%d", count))

	logger.Infof("✓ Inserted %d, updated %d countries", inserted, updated)
	return nil
}

func (r *RestCountriesSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{SchemaVersion: restCountriesSchemaVersion}
	exists, err := r.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}
	var countStr string
	_ = db.QueryRow(`SELECT value FROM restcountries_metadata WHERE key = 'record_count'`).Scan(&countStr)
	fmt.Sscanf(countStr, "%d", &stats.RecordCount)
	_ = db.QueryRow(`SELECT value FROM restcountries_metadata WHERE key = 'last_download'`).Scan(&stats.LastUpdated)
	return stats, nil
}

func (r *RestCountriesSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := r.SchemaExists(db)
	if err != nil || !exists {
		return true, err
	}
	var countStr string
	if err := db.QueryRow(`SELECT value FROM restcountries_metadata WHERE key = 'record_count'`).Scan(&countStr); err != nil {
		return true, nil
	}
	var count int
	fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil
	}
	var lastDownload string
	if err := db.QueryRow(`SELECT value FROM restcountries_metadata WHERE key = 'last_download'`).Scan(&lastDownload); err != nil {
		return true, nil
	}
	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil
	}
	return time.Since(lastTime) > 30*24*time.Hour, nil
}
