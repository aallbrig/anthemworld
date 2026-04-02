package jobs

import (
	"database/sql"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.Exec(`
		CREATE TABLE jobs (
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
		CREATE TABLE job_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			job_id TEXT NOT NULL,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			source_id TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestCleanupStaleJobs(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Insert a stale RUNNING job (started 2 hours ago)
	staleTime := time.Now().Add(-2 * time.Hour).Format(time.RFC3339)
	_, err := db.Exec(`INSERT INTO jobs (id, type, status, started_at, metadata) VALUES ('stale-1', 'download', 'RUNNING', ?, '{}')`, staleTime)
	if err != nil {
		t.Fatal(err)
	}

	// Insert a fresh RUNNING job (started 5 minutes ago)
	freshTime := time.Now().Add(-5 * time.Minute).Format(time.RFC3339)
	_, err = db.Exec(`INSERT INTO jobs (id, type, status, started_at, metadata) VALUES ('fresh-1', 'download', 'RUNNING', ?, '{}')`, freshTime)
	if err != nil {
		t.Fatal(err)
	}

	// Insert a COMPLETED job (should not be touched)
	_, err = db.Exec(`INSERT INTO jobs (id, type, status, started_at, completed_at, metadata) VALUES ('done-1', 'download', 'COMPLETED', ?, ?, '{}')`, staleTime, staleTime)
	if err != nil {
		t.Fatal(err)
	}

	// Run cleanup
	cleaned, err := CleanupStaleJobs(db, 1*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if cleaned != 1 {
		t.Errorf("expected 1 stale job cleaned, got %d", cleaned)
	}

	// Verify stale job is now FAILED
	var status, errMsg string
	err = db.QueryRow(`SELECT status, error_message FROM jobs WHERE id = 'stale-1'`).Scan(&status, &errMsg)
	if err != nil {
		t.Fatal(err)
	}
	if status != "FAILED" {
		t.Errorf("stale job status = %q, want FAILED", status)
	}
	if errMsg == "" {
		t.Error("stale job should have an error message")
	}

	// Verify fresh RUNNING job is untouched
	err = db.QueryRow(`SELECT status FROM jobs WHERE id = 'fresh-1'`).Scan(&status)
	if err != nil {
		t.Fatal(err)
	}
	if status != "RUNNING" {
		t.Errorf("fresh job status = %q, want RUNNING", status)
	}

	// Verify COMPLETED job is untouched
	err = db.QueryRow(`SELECT status FROM jobs WHERE id = 'done-1'`).Scan(&status)
	if err != nil {
		t.Fatal(err)
	}
	if status != "COMPLETED" {
		t.Errorf("completed job status = %q, want COMPLETED", status)
	}
}

func TestCleanupStaleJobs_NoStaleJobs(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	cleaned, err := CleanupStaleJobs(db, 1*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if cleaned != 0 {
		t.Errorf("expected 0 stale jobs cleaned, got %d", cleaned)
	}
}

func TestUpdateJobMetadata(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	_, err := db.Exec(`INSERT INTO jobs (id, type, status, metadata) VALUES ('j1', 'download', 'RUNNING', '{}')`)
	if err != nil {
		t.Fatal(err)
	}

	err = UpdateJobMetadata(db, "j1", map[string]interface{}{
		"checkpoint": "rest-countries",
		"progress":   42,
	})
	if err != nil {
		t.Fatal(err)
	}

	var metaJSON string
	err = db.QueryRow(`SELECT metadata FROM jobs WHERE id = 'j1'`).Scan(&metaJSON)
	if err != nil {
		t.Fatal(err)
	}

	if metaJSON == "{}" || metaJSON == "" {
		t.Error("metadata was not updated")
	}
}
