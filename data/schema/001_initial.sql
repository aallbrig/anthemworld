-- Schema Version 1: Initial schema
-- Applied automatically on first database creation

-- This file documents the initial database schema for the Anthem World project.
-- The schema is applied automatically by the CLI when creating a new database.

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Countries table
-- Stores information about all 193 UN-recognized countries
CREATE TABLE IF NOT EXISTS countries (
    id TEXT PRIMARY KEY,                    -- Lowercase country code (e.g., 'usa', 'gbr')
    name TEXT NOT NULL,                     -- Official country name
    common_name TEXT,                       -- Common name (e.g., 'United States')
    iso_alpha2 TEXT,                        -- ISO 3166-1 alpha-2 code (e.g., 'US')
    iso_alpha3 TEXT,                        -- ISO 3166-1 alpha-3 code (e.g., 'USA')
    un_member BOOLEAN,                      -- Is a UN member state
    independence_date TEXT,                 -- Date of independence (ISO 8601)
    capital TEXT,                           -- Capital city
    region TEXT,                            -- Geographic region
    subregion TEXT,                         -- Geographic subregion
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- National anthems table
-- Stores metadata about each country's national anthem
CREATE TABLE IF NOT EXISTS anthems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_id TEXT NOT NULL,               -- References countries.id
    name TEXT NOT NULL,                     -- English name of anthem
    native_name TEXT,                       -- Native language name
    composer TEXT,                          -- Composer name
    lyricist TEXT,                          -- Lyricist name
    adopted_date TEXT,                      -- Date anthem was adopted (ISO 8601)
    written_date TEXT,                      -- Date anthem was written (ISO 8601)
    description TEXT,                       -- Historical description
    wikidata_id TEXT,                       -- Wikidata entity ID
    wikipedia_url TEXT,                     -- Wikipedia article URL
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (country_id) REFERENCES countries(id)
);

-- Audio recordings table
-- Stores references to audio files for each anthem
CREATE TABLE IF NOT EXISTS audio_recordings (
    id TEXT PRIMARY KEY,                    -- Unique recording ID
    country_id TEXT NOT NULL,               -- References countries.id
    title TEXT NOT NULL,                    -- Recording title/description
    url TEXT NOT NULL,                      -- Audio file URL
    format TEXT,                            -- Audio format (mp3, ogg, wav)
    duration_seconds INTEGER,               -- Duration in seconds
    type TEXT,                              -- Type: 'instrumental', 'vocal', 'historical'
    license TEXT,                           -- License information
    source TEXT,                            -- Source (e.g., 'Wikimedia Commons')
    quality TEXT,                           -- Quality: 'low', 'medium', 'high'
    file_size_bytes INTEGER,                -- File size in bytes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (country_id) REFERENCES countries(id)
);

-- Jobs table
-- Tracks background jobs for data download and processing
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,                    -- Unique job ID (UUID)
    type TEXT NOT NULL,                     -- Job type: 'discover', 'download', 'format'
    status TEXT NOT NULL,                   -- Status: 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    started_at TIMESTAMP,                   -- Job start time
    completed_at TIMESTAMP,                 -- Job completion time
    error_message TEXT,                     -- Error message if failed
    records_processed INTEGER DEFAULT 0,    -- Number of records processed
    records_total INTEGER,                  -- Total records to process
    metadata TEXT,                          -- JSON metadata for job-specific data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data sources table
-- Tracks health and status of external data sources
CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,                    -- Unique source ID
    name TEXT NOT NULL,                     -- Human-readable name
    url TEXT NOT NULL,                      -- Base URL
    type TEXT,                              -- Type: 'countries', 'anthems', 'audio'
    status TEXT,                            -- Status: 'HEALTHY', 'DEGRADED', 'DOWN'
    last_check_at TIMESTAMP,                -- Last health check time
    last_success_at TIMESTAMP,              -- Last successful request time
    response_time_ms INTEGER,               -- Average response time
    error_count INTEGER DEFAULT 0,          -- Consecutive error count
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_anthems_country ON anthems(country_id);
CREATE INDEX IF NOT EXISTS idx_audio_country ON audio_recordings(country_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
