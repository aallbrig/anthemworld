package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

const (
	CurrentSchemaVersion = 2
)

func GetDBPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	
	// Linux: ~/.local/share/anthemworld/data.db
	dataDir := filepath.Join(homeDir, ".local", "share", "anthemworld")
	return filepath.Join(dataDir, "data.db")
}

func GetDB() (*sql.DB, error) {
	dbPath := GetDBPath()
	
	// Create directory if it doesn't exist
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}
	
	// Check if database file exists
	_, err := os.Stat(dbPath)
	isNewDB := os.IsNotExist(err)
	
	// Open database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}
	
	// Initialize schema if new database
	if isNewDB {
		if err := initSchema(db); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to initialize schema: %w", err)
		}
	} else {
		// Apply migrations if needed
		if err := applyMigrations(db); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to apply migrations: %w", err)
		}
	}
	
	return db, nil
}

func initSchema(db *sql.DB) error {
	schema := `
	-- Schema version tracking
	CREATE TABLE IF NOT EXISTS schema_version (
		version INTEGER PRIMARY KEY,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		description TEXT
	);

	-- Countries
	CREATE TABLE IF NOT EXISTS countries (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		common_name TEXT,
		iso_alpha2 TEXT,
		iso_alpha3 TEXT,
		un_member BOOLEAN,
		independence_date TEXT,
		capital TEXT,
		region TEXT,
		subregion TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	-- National anthems
	CREATE TABLE IF NOT EXISTS anthems (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		country_id TEXT NOT NULL,
		name TEXT NOT NULL,
		native_name TEXT,
		composer TEXT,
		lyricist TEXT,
		adopted_date TEXT,
		written_date TEXT,
		description TEXT,
		wikidata_id TEXT,
		wikipedia_url TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (country_id) REFERENCES countries(id)
	);

	-- Audio recordings
	CREATE TABLE IF NOT EXISTS audio_recordings (
		id TEXT PRIMARY KEY,
		country_id TEXT NOT NULL,
		title TEXT NOT NULL,
		url TEXT NOT NULL,
		format TEXT,
		duration_seconds INTEGER,
		type TEXT,
		license TEXT,
		source TEXT,
		quality TEXT,
		file_size_bytes INTEGER,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (country_id) REFERENCES countries(id)
	);

	-- Jobs
	CREATE TABLE IF NOT EXISTS jobs (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		status TEXT NOT NULL,
		started_at TIMESTAMP,
		completed_at TIMESTAMP,
		error_message TEXT,
		records_processed INTEGER DEFAULT 0,
		records_total INTEGER,
		metadata TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	-- Data sources
	CREATE TABLE IF NOT EXISTS data_sources (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		url TEXT NOT NULL,
		type TEXT,
		status TEXT,
		last_check_at TIMESTAMP,
		last_success_at TIMESTAMP,
		response_time_ms INTEGER,
		error_count INTEGER DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	-- Indexes
	CREATE INDEX IF NOT EXISTS idx_anthems_country ON anthems(country_id);
	CREATE INDEX IF NOT EXISTS idx_audio_country ON audio_recordings(country_id);
	CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
	CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
	`

	if _, err := db.Exec(schema); err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}

	// Insert schema version
	_, err := db.Exec("INSERT INTO schema_version (version, description) VALUES (?, ?)",
		CurrentSchemaVersion, "Initial schema with migrations applied")
	if err != nil {
		return fmt.Errorf("failed to insert schema version: %w", err)
	}

	return nil
}

// applyMigrations applies any pending schema migrations
func applyMigrations(db *sql.DB) error {
	// Get current schema version
	var currentVersion int
	err := db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version").Scan(&currentVersion)
	if err != nil {
		return fmt.Errorf("failed to get schema version: %w", err)
	}

	// If already at current version, nothing to do
	if currentVersion >= CurrentSchemaVersion {
		return nil
	}

	// Apply migration 2 if needed
	if currentVersion < 2 {
		migration2 := `
		-- Update data_sources table
		ALTER TABLE data_sources ADD COLUMN rate_limit_per_second INTEGER DEFAULT 10;
		ALTER TABLE data_sources ADD COLUMN requires_auth BOOLEAN DEFAULT 0;
		ALTER TABLE data_sources ADD COLUMN health_check_endpoint TEXT;
		ALTER TABLE data_sources ADD COLUMN download_strategy TEXT DEFAULT 'file';
		ALTER TABLE data_sources ADD COLUMN priority INTEGER DEFAULT 100;

		-- Update countries table
		ALTER TABLE countries ADD COLUMN geojson_geometry TEXT;

		-- Job logs table
		CREATE TABLE IF NOT EXISTS job_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			job_id TEXT NOT NULL,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			source_id TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (job_id) REFERENCES jobs(id)
		);

		CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
		CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(level);

		INSERT INTO schema_version (version, description) VALUES (2, 'Data sources and jobs enhancement');
		`

		if _, err := db.Exec(migration2); err != nil {
			return fmt.Errorf("failed to apply migration 2: %w", err)
		}
	}

	return nil
}

type DataStats struct {
	DatabaseExists  bool
	SchemaApplied   bool
	SchemaVersion   int
	SchemaUpToDate  bool
	CountryCount    int
	AnthemCount     int
	AudioCount      int
	JobCount        int
}

func GetDataStats(db *sql.DB) (*DataStats, error) {
	stats := &DataStats{
		DatabaseExists: true,
		SchemaApplied:  true,
	}

	// Get schema version
	err := db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version").Scan(&stats.SchemaVersion)
	if err != nil {
		stats.SchemaApplied = false
		stats.SchemaVersion = 0
	}

	stats.SchemaUpToDate = stats.SchemaVersion >= CurrentSchemaVersion

	// Get counts
	_ = db.QueryRow("SELECT COUNT(*) FROM countries").Scan(&stats.CountryCount)
	_ = db.QueryRow("SELECT COUNT(*) FROM anthems").Scan(&stats.AnthemCount)
	_ = db.QueryRow("SELECT COUNT(*) FROM audio_recordings").Scan(&stats.AudioCount)
	_ = db.QueryRow("SELECT COUNT(*) FROM jobs").Scan(&stats.JobCount)

	return stats, nil
}

type Job struct {
	ID               string
	Type             string
	Status           string
	StartedAt        string
	CompletedAt      *string
	ErrorMessage     *string
	RecordsProcessed int
	RecordsTotal     *int
}

func GetRunningJobs(db *sql.DB) ([]Job, error) {
	rows, err := db.Query(`
		SELECT id, type, status, started_at, completed_at, error_message, 
		       records_processed, records_total
		FROM jobs 
		WHERE status = 'RUNNING'
		ORDER BY started_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var job Job
		err := rows.Scan(&job.ID, &job.Type, &job.Status, &job.StartedAt,
			&job.CompletedAt, &job.ErrorMessage, &job.RecordsProcessed, &job.RecordsTotal)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}

	return jobs, rows.Err()
}

func GetLastCompletedJob(db *sql.DB) (*Job, error) {
	var job Job
	err := db.QueryRow(`
		SELECT id, type, status, started_at, completed_at, error_message,
		       records_processed, records_total
		FROM jobs 
		WHERE status IN ('COMPLETED', 'FAILED')
		ORDER BY completed_at DESC
		LIMIT 1
	`).Scan(&job.ID, &job.Type, &job.Status, &job.StartedAt,
		&job.CompletedAt, &job.ErrorMessage, &job.RecordsProcessed, &job.RecordsTotal)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &job, nil
}
