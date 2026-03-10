-- REST Countries API source schema
-- Stores metadata from restcountries.com API

CREATE TABLE IF NOT EXISTS rest_countries_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize metadata
INSERT OR IGNORE INTO rest_countries_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO rest_countries_metadata (key, value) VALUES ('last_download', '');
INSERT OR IGNORE INTO rest_countries_metadata (key, value) VALUES ('record_count', '0');
