-- Factbook source schema
-- Tracks downloads from factbook/factbook.json (CIA World Factbook data)

CREATE TABLE IF NOT EXISTS factbook_metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO factbook_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO factbook_metadata (key, value) VALUES ('last_download', '');
INSERT OR IGNORE INTO factbook_metadata (key, value) VALUES ('record_count', '0');

-- Add factbook_code to countries (CIA 2-letter code, e.g. "us", "fr")
-- Needed to link back to flag/map images in factbook/media
ALTER TABLE countries ADD COLUMN factbook_code TEXT;

-- Add anthem enrichment columns
ALTER TABLE anthems ADD COLUMN anthem_title_en TEXT;    -- English title/translation, e.g. "(Song of Marseille)"
ALTER TABLE anthems ADD COLUMN anthem_history  TEXT;    -- Rich CIA history paragraph

-- Add country enrichment columns
ALTER TABLE countries ADD COLUMN national_symbols TEXT;
ALTER TABLE countries ADD COLUMN national_colors  TEXT;
