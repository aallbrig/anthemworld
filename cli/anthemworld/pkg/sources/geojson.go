package sources

import (
	"context"
	"database/sql"
	"encoding/json"
	_ "embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/anthemworld/cli/pkg/httpclient"
	"github.com/anthemworld/cli/pkg/jobs"
)

//go:embed geojson.schema.sql
var geoJSONSchema string

// GeoJSONSource downloads country boundaries from datasets/geo-countries
type GeoJSONSource struct {
	id   string
	name string
	url  string
}

// NewGeoJSONSource creates a new GeoJSON data source
func NewGeoJSONSource() *GeoJSONSource {
	return &GeoJSONSource{
		id:   "geo-countries-geojson",
		name: "GeoJSON Country Boundaries",
		url:  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
	}
}

func (g *GeoJSONSource) ID() string   { return g.id }
func (g *GeoJSONSource) Name() string { return g.name }
func (g *GeoJSONSource) Type() string { return "geography" }
func (g *GeoJSONSource) URL() string  { return g.url }

const geoJSONSchemaVersion = 1

// GetSchema returns the SQL schema for GeoJSON-specific tables
func (g *GeoJSONSource) GetSchema() string {
	return geoJSONSchema
}

func (g *GeoJSONSource) GetSchemaVersion() int {
	return geoJSONSchemaVersion
}

func (g *GeoJSONSource) GetTables() []string {
	return []string{"geojson_countries", "geojson_metadata"}
}

func (g *GeoJSONSource) ApplySchema(db *sql.DB) error {
	_, err := db.Exec(g.GetSchema())
	return err
}

func (g *GeoJSONSource) SchemaExists(db *sql.DB) (bool, error) {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM sqlite_master 
		WHERE type='table' AND name='geojson_countries'
	`).Scan(&count)
	
	if err != nil {
		return false, err
	}
	
	return count > 0, nil
}

// Download downloads and processes the GeoJSON file
func (g *GeoJSONSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Infof("Downloading GeoJSON from %s", g.url)
	
	// 0. Ensure schema exists
	exists, err := g.SchemaExists(db)
	if err != nil {
		return fmt.Errorf("failed to check schema: %w", err)
	}
	
	if !exists {
		logger.Infof("Applying GeoJSON schema...")
		if err := g.ApplySchema(db); err != nil {
			return fmt.Errorf("failed to apply schema: %w", err)
		}
		logger.Infof("Schema applied successfully")
	}
	
	// 1. Download file
	client := httpclient.New(httpclient.WithTimeout(60 * time.Second))
	resp, err := client.Get(ctx, g.url)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	// 2. Read response
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	logger.Infof("Downloaded %d bytes", len(data))

	// 3. Cache to disk
	cacheDir := filepath.Join(os.Getenv("HOME"), ".cache", "anthemworld")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		logger.Warnf("Failed to create cache directory: %v", err)
	} else {
		cacheFile := filepath.Join(cacheDir, "countries.geojson")
		if err := os.WriteFile(cacheFile, data, 0644); err != nil {
			logger.Warnf("Failed to cache file: %v", err)
		} else {
			logger.Infof("Cached to %s", cacheFile)
		}
	}

	// 4. Parse GeoJSON
	var geojson struct {
		Type     string `json:"type"`
		Features []struct {
			Type       string                 `json:"type"`
			ID         interface{}            `json:"id"` // Can be string or number
			Properties map[string]interface{} `json:"properties"`
			Geometry   map[string]interface{} `json:"geometry"`
		} `json:"features"`
	}

	if err := json.Unmarshal(data, &geojson); err != nil {
		return fmt.Errorf("failed to parse GeoJSON: %w", err)
	}

	logger.Infof("Parsed %d country features", len(geojson.Features))

	// 5. Store in database (idempotent with UPSERT)
	inserted := 0
	updated := 0
	skipped := 0

	for _, feature := range geojson.Features {
		// Extract ISO code from id field or properties
		var isoA3 string
		if feature.ID != nil {
			// johan/world.geo.json uses id field
			if idStr, ok := feature.ID.(string); ok {
				isoA3 = idStr
			}
		}
		
		// Fallback to properties if id not set
		if isoA3 == "" {
			if val, ok := feature.Properties["ISO3166-1-Alpha-3"]; ok {
				isoA3, _ = val.(string)
			} else if val, ok := feature.Properties["ISO_A3"]; ok {
				isoA3, _ = val.(string)
			} else if val, ok := feature.Properties["iso_a3"]; ok {
				isoA3, _ = val.(string)
			}
		}

		// Skip invalid codes
		if isoA3 == "" || isoA3 == "-99" || len(isoA3) != 3 {
			skipped++
			continue
		}

		// Extract country name
		var name string
		if val, ok := feature.Properties["NAME"]; ok {
			name, _ = val.(string)
		} else if val, ok := feature.Properties["name"]; ok {
			name, _ = val.(string)
		} else if val, ok := feature.Properties["ADMIN"]; ok {
			name, _ = val.(string)
		}

		if name == "" {
			name = isoA3 // Fallback to code
		}

		// Extract geometry details
		geometryType := "Unknown"
		if gType, ok := feature.Geometry["type"].(string); ok {
			geometryType = gType
		}
		
		// Serialize geometry
		geometryJSON, _ := json.Marshal(feature.Geometry)
		
		// Calculate coordinate count (for complexity metric)
		coordCount := countCoordinates(feature.Geometry)
		
		// Calculate bounding box
		bbox := calculateBBox(feature.Geometry)
		
		// Check if country already exists
		var existingCount int
		_ = db.QueryRow(`SELECT COUNT(*) FROM geojson_countries WHERE iso_code = ?`, isoA3).Scan(&existingCount)
		
		// UPSERT into geojson_countries table (idempotent)
		_, err := db.Exec(`
			INSERT INTO geojson_countries (
				iso_code, name, feature_type, geometry_type, geometry,
				bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat,
				coordinate_count, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(iso_code) DO UPDATE SET
				name = excluded.name,
				feature_type = excluded.feature_type,
				geometry_type = excluded.geometry_type,
				geometry = excluded.geometry,
				bbox_min_lon = excluded.bbox_min_lon,
				bbox_min_lat = excluded.bbox_min_lat,
				bbox_max_lon = excluded.bbox_max_lon,
				bbox_max_lat = excluded.bbox_max_lat,
				coordinate_count = excluded.coordinate_count,
				updated_at = CURRENT_TIMESTAMP
		`, isoA3, name, feature.Type, geometryType, string(geometryJSON),
		   bbox[0], bbox[1], bbox[2], bbox[3], coordCount)

		if err != nil {
			logger.Warnf("Failed to upsert %s: %v", isoA3, err)
			skipped++
			continue
		}
		
		if existingCount > 0 {
			updated++
		} else {
			inserted++
		}
	}

	logger.Infof("Inserted %d countries, updated %d countries, skipped %d", inserted, updated, skipped)
	
	// Update metadata to track last download
	_, err = db.Exec(`
		INSERT OR REPLACE INTO geojson_metadata (key, value, updated_at)
		VALUES ('last_download', ?, CURRENT_TIMESTAMP)
	`, time.Now().Format(time.RFC3339))
	
	if err != nil {
		logger.Warnf("Failed to update metadata: %v", err)
	}

	return nil
}

// Helper function to count coordinates in geometry
func countCoordinates(geometry map[string]interface{}) int {
	coords, ok := geometry["coordinates"]
	if !ok {
		return 0
	}
	
	return countCoordsRecursive(coords)
}

func countCoordsRecursive(data interface{}) int {
	switch v := data.(type) {
	case []interface{}:
		if len(v) == 2 {
			// Check if this is a coordinate pair [lon, lat]
			if _, ok1 := v[0].(float64); ok1 {
				if _, ok2 := v[1].(float64); ok2 {
					return 1
				}
			}
		}
		// Otherwise recurse into array
		count := 0
		for _, item := range v {
			count += countCoordsRecursive(item)
		}
		return count
	default:
		return 0
	}
}

// Helper function to calculate bounding box
func calculateBBox(geometry map[string]interface{}) [4]float64 {
	bbox := [4]float64{180, 90, -180, -90} // minLon, minLat, maxLon, maxLat
	
	coords, ok := geometry["coordinates"]
	if !ok {
		return bbox
	}
	
	updateBBox(coords, &bbox)
	return bbox
}

func updateBBox(data interface{}, bbox *[4]float64) {
	switch v := data.(type) {
	case []interface{}:
		if len(v) == 2 {
			// Check if this is a coordinate pair [lon, lat]
			if lon, ok1 := v[0].(float64); ok1 {
				if lat, ok2 := v[1].(float64); ok2 {
					if lon < bbox[0] {
						bbox[0] = lon
					}
					if lat < bbox[1] {
						bbox[1] = lat
					}
					if lon > bbox[2] {
						bbox[2] = lon
					}
					if lat > bbox[3] {
						bbox[3] = lat
					}
					return
				}
			}
		}
		// Otherwise recurse into array
		for _, item := range v {
			updateBBox(item, bbox)
		}
	}
}

// HealthCheck checks if the GeoJSON source is accessible
func (g *GeoJSONSource) HealthCheck(ctx context.Context) HealthStatus {
	c := httpclient.New(httpclient.WithTimeout(10 * time.Second))
	start := time.Now()
	resp, err := c.Head(ctx, g.url)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return HealthStatus{Healthy: false, Message: err.Error(), ResponseTime: elapsed}
	}
	defer resp.Body.Close()
	healthy := resp.StatusCode >= 200 && resp.StatusCode < 300
	msg := "OK"
	if !healthy {
		msg = fmt.Sprintf("Unexpected status code: %d", resp.StatusCode)
	}
	return HealthStatus{Healthy: healthy, StatusCode: resp.StatusCode, Message: msg, ResponseTime: elapsed}
}

// GetDataStats returns statistics about stored GeoJSON data
func (g *GeoJSONSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{}
	
	// Check if schema exists
	exists, err := g.SchemaExists(db)
	if err != nil {
		return stats, err
	}
	
	if !exists {
		return stats, nil // No data yet
	}
	
	// Get record count
	err = db.QueryRow(`SELECT COUNT(*) FROM geojson_countries`).Scan(&stats.RecordCount)
	if err != nil {
		return stats, fmt.Errorf("failed to count records: %w", err)
	}
	
	// Get storage size (approximate)
	var pageCount, pageSize int64
	_ = db.QueryRow(`PRAGMA page_count`).Scan(&pageCount)
	_ = db.QueryRow(`PRAGMA page_size`).Scan(&pageSize)
	
	// Calculate size of geojson_countries table specifically
	var tableSize int64
	err = db.QueryRow(`
		SELECT SUM(LENGTH(iso_code) + LENGTH(name) + LENGTH(geometry) + 100) 
		FROM geojson_countries
	`).Scan(&tableSize)
	
	if err != nil {
		tableSize = pageCount * pageSize / 10 // Rough estimate
	}
	
	stats.StorageBytes = tableSize
	
	// Get last updated timestamp
	var lastUpdated string
	err = db.QueryRow(`
		SELECT MAX(updated_at) FROM geojson_countries
	`).Scan(&lastUpdated)
	
	if err == nil {
		stats.LastUpdated = lastUpdated
	}
	
	stats.SchemaVersion = g.GetSchemaVersion()
	
	return stats, nil
}

// NeedsUpdate checks if data should be re-downloaded
func (g *GeoJSONSource) NeedsUpdate(db *sql.DB) (bool, error) {
	// Check if schema exists
	exists, err := g.SchemaExists(db)
	if err != nil {
		return false, err
	}
	
	if !exists {
		return true, nil // Schema doesn't exist, need to download
	}
	
	// Check if table is empty
	var count int
	err = db.QueryRow(`SELECT COUNT(*) FROM geojson_countries`).Scan(&count)
	if err != nil {
		return false, err
	}
	
	if count == 0 {
		return true, nil // No data, need to download
	}
	
	// Check last download time from metadata
	var lastDownload string
	err = db.QueryRow(`
		SELECT value FROM geojson_metadata WHERE key = 'last_download'
	`).Scan(&lastDownload)
	
	if err != nil {
		// No last download record, but we have data, so don't force re-download
		return false, nil
	}
	
	// Parse timestamp and check if it's older than 30 days
	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return false, nil // Can't parse, assume fresh enough
	}
	
	age := time.Since(lastTime)
	if age > 30*24*time.Hour {
		return true, nil // Data is stale (> 30 days old)
	}
	
	return false, nil // Data is fresh
}
