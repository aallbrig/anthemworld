package jobs

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Job represents a background job for data operations
type Job struct {
	ID               string
	Type             string
	Status           string
	StartedAt        *time.Time
	CompletedAt      *time.Time
	ErrorMessage     string
	RecordsProcessed int
	RecordsTotal     int
	Metadata         map[string]interface{}
}

// CleanupStaleJobs marks RUNNING jobs older than maxAge as FAILED.
// This prevents zombie jobs from blocking future runs after a crash or kill.
func CleanupStaleJobs(db *sql.DB, maxAge time.Duration) (int, error) {
	cutoff := time.Now().Add(-maxAge).Format(time.RFC3339)
	result, err := db.Exec(`
		UPDATE jobs
		SET status = 'FAILED',
		    completed_at = CURRENT_TIMESTAMP,
		    error_message = 'Marked as failed: stale RUNNING job exceeded max age'
		WHERE status = 'RUNNING'
		  AND started_at < ?
	`, cutoff)
	if err != nil {
		return 0, err
	}
	n, _ := result.RowsAffected()
	return int(n), nil
}

// UpdateJobMetadata merges the given key-value pairs into the job's metadata JSON.
func UpdateJobMetadata(db *sql.DB, jobID string, updates map[string]interface{}) error {
	var metadataJSON string
	err := db.QueryRow(`SELECT COALESCE(metadata, '{}') FROM jobs WHERE id = ?`, jobID).Scan(&metadataJSON)
	if err != nil {
		return err
	}

	var existing map[string]interface{}
	if err := json.Unmarshal([]byte(metadataJSON), &existing); err != nil {
		existing = make(map[string]interface{})
	}

	for k, v := range updates {
		existing[k] = v
	}

	merged, err := json.Marshal(existing)
	if err != nil {
		return err
	}

	_, err = db.Exec(`UPDATE jobs SET metadata = ? WHERE id = ?`, string(merged), jobID)
	return err
}

// CreateJob creates a new job in the database
func CreateJob(db *sql.DB, jobType string, metadata map[string]interface{}) (string, error) {
	jobID := uuid.New().String()
	metadataJSON, _ := json.Marshal(metadata)

	_, err := db.Exec(`
		INSERT INTO jobs (id, type, status, metadata)
		VALUES (?, ?, 'PENDING', ?)
	`, jobID, jobType, string(metadataJSON))

	return jobID, err
}

// StartJob marks a job as running
func StartJob(db *sql.DB, jobID string) error {
	_, err := db.Exec(`
		UPDATE jobs 
		SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, jobID)
	return err
}

// UpdateJobProgress updates the progress counters for a job
func UpdateJobProgress(db *sql.DB, jobID string, current, total int) error {
	_, err := db.Exec(`
		UPDATE jobs 
		SET records_processed = ?, records_total = ?
		WHERE id = ?
	`, current, total, jobID)
	return err
}

// CompleteJob marks a job as completed
func CompleteJob(db *sql.DB, jobID string) error {
	_, err := db.Exec(`
		UPDATE jobs 
		SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, jobID)
	return err
}

// FailJob marks a job as failed with an error message
func FailJob(db *sql.DB, jobID string, errorMsg string) error {
	_, err := db.Exec(`
		UPDATE jobs 
		SET status = 'FAILED', 
			completed_at = CURRENT_TIMESTAMP,
			error_message = ?
		WHERE id = ?
	`, errorMsg, jobID)
	return err
}

// LogJob writes a log message for a job
func LogJob(db *sql.DB, jobID, level, message string) error {
	_, err := db.Exec(`
		INSERT INTO job_logs (job_id, level, message)
		VALUES (?, ?, ?)
	`, jobID, level, message)
	return err
}

// GetJob retrieves a job by ID
func GetJob(db *sql.DB, jobID string) (*Job, error) {
	job := &Job{}
	var metadataJSON string

	err := db.QueryRow(`
		SELECT id, type, status, started_at, completed_at, 
		       error_message, records_processed, records_total, metadata
		FROM jobs
		WHERE id = ?
	`, jobID).Scan(
		&job.ID, &job.Type, &job.Status, &job.StartedAt, &job.CompletedAt,
		&job.ErrorMessage, &job.RecordsProcessed, &job.RecordsTotal, &metadataJSON,
	)

	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal([]byte(metadataJSON), &job.Metadata)
	return job, nil
}

// GetActiveJobs retrieves all running jobs
func GetActiveJobs(db *sql.DB) ([]*Job, error) {
	rows, err := db.Query(`
		SELECT id, type, status, started_at, completed_at,
		       error_message, records_processed, records_total, metadata
		FROM jobs
		WHERE status = 'RUNNING'
		ORDER BY started_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*Job
	for rows.Next() {
		job := &Job{}
		var metadataJSON string

		err := rows.Scan(
			&job.ID, &job.Type, &job.Status, &job.StartedAt, &job.CompletedAt,
			&job.ErrorMessage, &job.RecordsProcessed, &job.RecordsTotal, &metadataJSON,
		)
		if err != nil {
			return nil, err
		}

		_ = json.Unmarshal([]byte(metadataJSON), &job.Metadata)
		jobs = append(jobs, job)
	}

	return jobs, nil
}

// GetLastCompletedJob retrieves the most recently completed job
func GetLastCompletedJob(db *sql.DB) (*Job, error) {
	job := &Job{}
	var metadataJSON string

	err := db.QueryRow(`
		SELECT id, type, status, started_at, completed_at,
		       error_message, records_processed, records_total, metadata
		FROM jobs
		WHERE status IN ('COMPLETED', 'FAILED')
		ORDER BY completed_at DESC
		LIMIT 1
	`).Scan(
		&job.ID, &job.Type, &job.Status, &job.StartedAt, &job.CompletedAt,
		&job.ErrorMessage, &job.RecordsProcessed, &job.RecordsTotal, &metadataJSON,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal([]byte(metadataJSON), &job.Metadata)
	return job, nil
}

// FormatDuration formats a duration in a human-readable way
func FormatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm %ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%dh %dm", int(d.Hours()), int(d.Minutes())%60)
}
