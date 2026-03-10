-- GeoJSON data source schema v1
-- Table for storing country boundary data from GeoJSON

CREATE TABLE IF NOT EXISTS geojson_countries (
    iso_code TEXT PRIMARY KEY,           -- ISO 3-letter code (e.g., "USA", "GBR")
    name TEXT NOT NULL,                  -- Country name
    feature_type TEXT NOT NULL,          -- GeoJSON feature type (usually "Feature")
    geometry_type TEXT NOT NULL,         -- Geometry type ("Polygon", "MultiPolygon")
    geometry JSON NOT NULL,              -- Full GeoJSON geometry object
    bbox_min_lon REAL,                   -- Bounding box (for quick spatial queries)
    bbox_min_lat REAL,
    bbox_max_lon REAL,
    bbox_max_lat REAL,
    coordinate_count INTEGER,            -- Number of coordinate pairs (for complexity)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_geojson_countries_name ON geojson_countries(name);
CREATE INDEX IF NOT EXISTS idx_geojson_countries_geometry_type ON geojson_countries(geometry_type);
CREATE INDEX IF NOT EXISTS idx_geojson_countries_updated ON geojson_countries(updated_at);

-- Metadata table to track schema version and download info
CREATE TABLE IF NOT EXISTS geojson_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize metadata
INSERT OR REPLACE INTO geojson_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR REPLACE INTO geojson_metadata (key, value) VALUES ('source_url', 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
