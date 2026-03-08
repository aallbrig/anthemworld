-- Wikimedia Commons source schema
-- Tracks downloads from Wikimedia Commons (audio files)

CREATE TABLE IF NOT EXISTS wikimedia_metadata (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO wikimedia_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO wikimedia_metadata (key, value) VALUES ('last_download', '');
INSERT OR IGNORE INTO wikimedia_metadata (key, value) VALUES ('record_count', '0');
