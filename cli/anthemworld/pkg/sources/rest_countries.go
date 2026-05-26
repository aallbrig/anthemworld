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

	"github.com/anthemworld/cli/pkg/httpclient"
	"github.com/anthemworld/cli/pkg/jobs"
)

//go:embed rest_countries.schema.sql
var restCountriesSchema string

// RestCountriesSource downloads country data from restcountries.com API
type RestCountriesSource struct {
	id   string
	name string
	url  string
}

// NewRestCountriesSource creates a new REST Countries API data source
func NewRestCountriesSource() *RestCountriesSource {
	return &RestCountriesSource{
		id:   "rest-countries-api",
		name: "REST Countries API",
		url:  "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,capital,region,subregion,independent,unMember",
	}
}

func (r *RestCountriesSource) ID() string   { return r.id }
func (r *RestCountriesSource) Name() string { return r.name }
func (r *RestCountriesSource) Type() string { return "country-metadata" }
func (r *RestCountriesSource) URL() string  { return r.url }

const restCountriesSchemaVersion = 1

// GetSchema returns the SQL schema for REST Countries-specific tables
func (r *RestCountriesSource) GetSchema() string {
	return restCountriesSchema
}

func (r *RestCountriesSource) GetSchemaVersion() int {
	return restCountriesSchemaVersion
}

func (r *RestCountriesSource) GetTables() []string {
	return []string{"rest_countries_metadata"}
}

// HealthCheck verifies the REST Countries API is accessible
func (r *RestCountriesSource) HealthCheck(ctx context.Context) HealthStatus {
	c := httpclient.New(httpclient.WithTimeout(10 * time.Second))

	start := time.Now()
	resp, err := c.Head(ctx, r.url)
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

// RestCountryData represents a country from the REST Countries API
type RestCountryData struct {
	Name struct {
		Common   string `json:"common"`
		Official string `json:"official"`
	} `json:"name"`
	CCA2   string `json:"cca2"` // ISO alpha-2
	CCA3   string `json:"cca3"` // ISO alpha-3
	Region string `json:"region"`
	Subregion string `json:"subregion,omitempty"`
	Capital   []string `json:"capital,omitempty"`
	Independent bool `json:"independent"`
	UnMember    bool `json:"unMember"`
}

// Download fetches country data from REST Countries API and stores it
func (r *RestCountriesSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting REST Countries API download")

	// Ensure schema exists
	if err := r.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	// Fetch data from API
	logger.Infof("Fetching data from %s", r.url)
	c := httpclient.New()

	resp, err := c.Get(ctx, r.url)
	if err != nil {
		return fmt.Errorf("failed to fetch data: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse JSON response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	var countries []RestCountryData
	if err := json.Unmarshal(body, &countries); err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	logger.Infof("Received %d countries from API", len(countries))

	// Filter for UN members only (193 countries)
	unMembers := make([]RestCountryData, 0, 193)
	for _, country := range countries {
		if country.UnMember {
			unMembers = append(unMembers, country)
		}
	}

	logger.Infof("Filtered to %d UN member countries", len(unMembers))

	// Begin transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Insert/update countries
	inserted := 0
	updated := 0

	for _, country := range unMembers {
		// Use lowercase cca3 as ID
		countryID := strings.ToLower(country.CCA3)
		capital := ""
		if len(country.Capital) > 0 {
			capital = country.Capital[0]
		}

		// Check if country exists
		var exists bool
		err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM countries WHERE id = ?)", countryID).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check country existence: %w", err)
		}

		if exists {
			// Update existing country
			_, err = tx.Exec(`
				UPDATE countries 
				SET name = ?, common_name = ?, iso_alpha2 = ?, iso_alpha3 = ?, 
				    un_member = ?, capital = ?, region = ?, subregion = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`, country.Name.Official, country.Name.Common, country.CCA2, country.CCA3,
				country.UnMember, capital, country.Region, country.Subregion, countryID)
			if err != nil {
				return fmt.Errorf("failed to update country %s: %w", countryID, err)
			}
			updated++
		} else {
			// Insert new country
			_, err = tx.Exec(`
				INSERT INTO countries (id, name, common_name, iso_alpha2, iso_alpha3, un_member, capital, region, subregion)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, countryID, country.Name.Official, country.Name.Common, country.CCA2, country.CCA3,
				country.UnMember, capital, country.Region, country.Subregion)
			if err != nil {
				return fmt.Errorf("failed to insert country %s: %w", countryID, err)
			}
			inserted++
		}
	}

	// Update metadata
	_, err = tx.Exec(`
		INSERT OR REPLACE INTO rest_countries_metadata (key, value, updated_at)
		VALUES ('last_download', ?, CURRENT_TIMESTAMP)
	`, time.Now().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("failed to update metadata: %w", err)
	}

	_, err = tx.Exec(`
		INSERT OR REPLACE INTO rest_countries_metadata (key, value, updated_at)
		VALUES ('record_count', ?, CURRENT_TIMESTAMP)
	`, fmt.Sprintf("%d", len(unMembers)))
	if err != nil {
		return fmt.Errorf("failed to update record count: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	logger.Infof("✓ Inserted %d countries, updated %d countries", inserted, updated)
	return nil
}

// ApplySchema creates the REST Countries-specific tables
func (r *RestCountriesSource) ApplySchema(db *sql.DB) error {
	_, err := db.Exec(r.GetSchema())
	return err
}

// SchemaExists checks if the REST Countries schema is applied
func (r *RestCountriesSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM sqlite_master 
			WHERE type='table' AND name='rest_countries_metadata'
		)
	`).Scan(&exists)
	return exists, err
}

// GetDataStats returns statistics about REST Countries data
func (r *RestCountriesSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{
		SchemaVersion: restCountriesSchemaVersion,
	}

	// Check if schema exists
	exists, err := r.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}

	// Get record count
	var countStr string
	err = db.QueryRow(`
		SELECT value FROM rest_countries_metadata WHERE key = 'record_count'
	`).Scan(&countStr)
	if err != nil && err != sql.ErrNoRows {
		return stats, err
	}
	_, _ = fmt.Sscanf(countStr, "%d", &stats.RecordCount)

	// Get last updated timestamp
	err = db.QueryRow(`
		SELECT value FROM rest_countries_metadata WHERE key = 'last_download'
	`).Scan(&stats.LastUpdated)
	if err != nil && err != sql.ErrNoRows {
		return stats, err
	}

	// Calculate storage (approximate)
	var pageCount, pageSize int64
	_ = db.QueryRow("PRAGMA page_count").Scan(&pageCount)
	_ = db.QueryRow("PRAGMA page_size").Scan(&pageSize)
	stats.StorageBytes = (pageCount * pageSize) / int64(len(AllSources)+1) // Rough estimate

	return stats, nil
}

// NeedsUpdate checks if REST Countries data should be re-downloaded
func (r *RestCountriesSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := r.SchemaExists(db)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil // Schema not applied, needs download
	}

	// Check if we have data
	var countStr string
	err = db.QueryRow(`
		SELECT value FROM rest_countries_metadata WHERE key = 'record_count'
	`).Scan(&countStr)
	if err == sql.ErrNoRows {
		return true, nil // No data yet
	}
	if err != nil {
		return false, err
	}

	var count int
	_, _ = fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil // Empty table
	}

	// Check if data is older than 30 days
	var lastDownload string
	err = db.QueryRow(`
		SELECT value FROM rest_countries_metadata WHERE key = 'last_download'
	`).Scan(&lastDownload)
	if err == sql.ErrNoRows {
		return true, nil // Never downloaded
	}
	if err != nil {
		return false, err
	}

	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil // Invalid timestamp, re-download
	}

	age := time.Since(lastTime)
	return age > 30*24*time.Hour, nil // Update if older than 30 days
}
