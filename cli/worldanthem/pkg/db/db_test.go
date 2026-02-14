package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func setupTestDB(t *testing.T) (*sql.DB, func()) {
	// Create temp directory for test database
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}

	// Initialize schema
	if err := initSchema(db); err != nil {
		db.Close()
		t.Fatalf("Failed to initialize schema: %v", err)
	}

	cleanup := func() {
		db.Close()
		os.RemoveAll(tmpDir)
	}

	return db, cleanup
}

func TestGetDataStats(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	stats, err := GetDataStats(db)
	if err != nil {
		t.Fatalf("GetDataStats failed: %v", err)
	}

	if !stats.DatabaseExists {
		t.Error("Expected DatabaseExists to be true")
	}

	if !stats.SchemaApplied {
		t.Error("Expected SchemaApplied to be true")
	}

	if stats.SchemaVersion != CurrentSchemaVersion {
		t.Errorf("Expected SchemaVersion %d, got %d", CurrentSchemaVersion, stats.SchemaVersion)
	}

	if !stats.SchemaUpToDate {
		t.Error("Expected SchemaUpToDate to be true")
	}

	if stats.CountryCount != 0 {
		t.Errorf("Expected CountryCount 0, got %d", stats.CountryCount)
	}
}

func TestGetRunningJobs(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	// Initially should have no running jobs
	jobs, err := GetRunningJobs(db)
	if err != nil {
		t.Fatalf("GetRunningJobs failed: %v", err)
	}

	if len(jobs) != 0 {
		t.Errorf("Expected 0 running jobs, got %d", len(jobs))
	}

	// Insert a running job
	_, err = db.Exec(`
		INSERT INTO jobs (id, type, status, started_at)
		VALUES ('test-job-1', 'download', 'RUNNING', datetime('now'))
	`)
	if err != nil {
		t.Fatalf("Failed to insert test job: %v", err)
	}

	// Should now have one running job
	jobs, err = GetRunningJobs(db)
	if err != nil {
		t.Fatalf("GetRunningJobs failed: %v", err)
	}

	if len(jobs) != 1 {
		t.Errorf("Expected 1 running job, got %d", len(jobs))
	}

	if jobs[0].ID != "test-job-1" {
		t.Errorf("Expected job ID 'test-job-1', got '%s'", jobs[0].ID)
	}

	if jobs[0].Type != "download" {
		t.Errorf("Expected job type 'download', got '%s'", jobs[0].Type)
	}
}

func TestGetLastCompletedJob(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	// Initially should have no completed jobs
	job, err := GetLastCompletedJob(db)
	if err != nil {
		t.Fatalf("GetLastCompletedJob failed: %v", err)
	}

	if job != nil {
		t.Error("Expected no completed job, got one")
	}

	// Insert a completed job
	_, err = db.Exec(`
		INSERT INTO jobs (id, type, status, started_at, completed_at)
		VALUES ('test-job-1', 'download', 'COMPLETED', datetime('now'), datetime('now'))
	`)
	if err != nil {
		t.Fatalf("Failed to insert test job: %v", err)
	}

	// Should now have a completed job
	job, err = GetLastCompletedJob(db)
	if err != nil {
		t.Fatalf("GetLastCompletedJob failed: %v", err)
	}

	if job == nil {
		t.Fatal("Expected completed job, got nil")
	}

	if job.ID != "test-job-1" {
		t.Errorf("Expected job ID 'test-job-1', got '%s'", job.ID)
	}

	if job.Status != "COMPLETED" {
		t.Errorf("Expected job status 'COMPLETED', got '%s'", job.Status)
	}
}
