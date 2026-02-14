-- Schema Version 2: Data sources and jobs enhancement
-- This migration adds support for sophisticated data source management and job tracking

-- Update data_sources table with additional metadata
ALTER TABLE data_sources ADD COLUMN rate_limit_per_second INTEGER DEFAULT 10;
ALTER TABLE data_sources ADD COLUMN requires_auth BOOLEAN DEFAULT 0;
ALTER TABLE data_sources ADD COLUMN health_check_endpoint TEXT;
ALTER TABLE data_sources ADD COLUMN download_strategy TEXT DEFAULT 'file'; -- 'file' or 'api'
ALTER TABLE data_sources ADD COLUMN priority INTEGER DEFAULT 100; -- Higher priority sources override lower

-- Update countries table to store GeoJSON geometry
ALTER TABLE countries ADD COLUMN geojson_geometry TEXT; -- Store geometry as JSON TEXT

-- Job logs table for detailed job tracking
CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    level TEXT NOT NULL,           -- INFO, WARN, ERROR
    message TEXT NOT NULL,
    source_id TEXT,                -- Which data source (optional)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Indexes for job logs
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(level);

-- Record schema version
INSERT INTO schema_version (version, description) VALUES (2, 'Data sources and jobs enhancement');
