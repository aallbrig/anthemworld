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

const geojsonSchemaVersion = 1

const geojsonSchema = `
CREATE TABLE IF NOT EXISTS geojson_metadata (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO geojson_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO geojson_metadata (key, value) VALUES ('last_download', '');
INSERT OR IGNORE INTO geojson_metadata (key, value) VALUES ('record_count', '0');
`

const geojsonDownloadURL = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"

// GeoJSONSource downloads country boundary GeoJSON data.
type GeoJSONSource struct {
	id   string
	name string
	url  string
}

// NewGeoJSONSource creates a new GeoJSON country boundaries data source.
func NewGeoJSONSource() *GeoJSONSource {
	return &GeoJSONSource{
		id:   "geojson-countries",
		name: "GeoJSON Country Boundaries",
		url:  geojsonDownloadURL,
	}
}

func (g *GeoJSONSource) ID() string   { return g.id }
func (g *GeoJSONSource) Name() string { return g.name }
func (g *GeoJSONSource) Type() string { return "country-boundaries" }
func (g *GeoJSONSource) URL() string  { return g.url }

func (g *GeoJSONSource) GetSchema() string        { return geojsonSchema }
func (g *GeoJSONSource) GetSchemaVersion() int    { return geojsonSchemaVersion }
func (g *GeoJSONSource) GetTables() []string      { return []string{"geojson_metadata"} }

func (g *GeoJSONSource) ApplySchema(db *sql.DB) error {
	stmts := strings.Split(g.GetSchema(), ";")
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

func (g *GeoJSONSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='geojson_metadata')`).Scan(&exists)
	return exists, err
}

func (g *GeoJSONSource) HealthCheck(ctx context.Context) HealthStatus {
	client := &http.Client{Timeout: 10 * time.Second}
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, "HEAD", g.url, nil)
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

// geojsonFeatureCollection is a minimal GeoJSON FeatureCollection.
type geojsonFeatureCollection struct {
	Type     string           `json:"type"`
	Features []geojsonFeature `json:"features"`
}

type geojsonFeature struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Geometry   json.RawMessage        `json:"geometry"`
}

// Download fetches GeoJSON country boundaries and stores geometry in the countries table.
func (g *GeoJSONSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting GeoJSON country boundaries download")

	if err := g.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", g.url, nil)
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
		return fmt.Errorf("server returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	var fc geojsonFeatureCollection
	if err := json.Unmarshal(body, &fc); err != nil {
		return fmt.Errorf("failed to parse GeoJSON: %w", err)
	}

	logger.Infof("Parsed %d country features", len(fc.Features))

	updated := 0
	skipped := 0
	for _, feature := range fc.Features {
		// Extract ISO 3166-1 alpha-3 code from properties
		iso3 := ""
		for _, key := range []string{"ISO_A3", "iso_a3", "ISO3", "iso3", "ADM0_A3"} {
			if v, ok := feature.Properties[key]; ok {
				if s, ok := v.(string); ok && s != "" && s != "-99" {
					iso3 = strings.ToLower(s)
					break
				}
			}
		}
		if iso3 == "" {
			skipped++
			continue
		}

		geometryJSON, err := json.Marshal(feature.Geometry)
		if err != nil || feature.Geometry == nil {
			skipped++
			continue
		}

		// Check if geojson_geometry column exists (added by migration 2)
		_, err = db.Exec(`
			UPDATE countries SET geojson_geometry = ?, updated_at = CURRENT_TIMESTAMP
			WHERE LOWER(iso_alpha3) = ?
		`, string(geometryJSON), iso3)
		if err != nil {
			logger.Errorf("Failed to update geometry for %s: %v", iso3, err)
			skipped++
			continue
		}
		updated++
	}

	_, _ = db.Exec(`INSERT OR REPLACE INTO geojson_metadata (key, value, updated_at) VALUES ('last_download', ?, CURRENT_TIMESTAMP)`,
		time.Now().Format(time.RFC3339))
	_, _ = db.Exec(`INSERT OR REPLACE INTO geojson_metadata (key, value, updated_at) VALUES ('record_count', ?, CURRENT_TIMESTAMP)`,
		fmt.Sprintf("%d", updated))

	logger.Infof("✓ Updated geometry for %d countries, skipped %d", updated, skipped)
	return nil
}

func (g *GeoJSONSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{SchemaVersion: geojsonSchemaVersion}
	exists, err := g.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}
	var countStr string
	_ = db.QueryRow(`SELECT value FROM geojson_metadata WHERE key = 'record_count'`).Scan(&countStr)
	fmt.Sscanf(countStr, "%d", &stats.RecordCount)
	_ = db.QueryRow(`SELECT value FROM geojson_metadata WHERE key = 'last_download'`).Scan(&stats.LastUpdated)
	return stats, nil
}

func (g *GeoJSONSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := g.SchemaExists(db)
	if err != nil || !exists {
		return true, err
	}
	var countStr string
	if err := db.QueryRow(`SELECT value FROM geojson_metadata WHERE key = 'record_count'`).Scan(&countStr); err != nil {
		return true, nil
	}
	var count int
	fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil
	}
	var lastDownload string
	if err := db.QueryRow(`SELECT value FROM geojson_metadata WHERE key = 'last_download'`).Scan(&lastDownload); err != nil {
		return true, nil
	}
	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil
	}
	return time.Since(lastTime) > 30*24*time.Hour, nil
}
