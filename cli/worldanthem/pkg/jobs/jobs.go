package jobs

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

// CreateJob inserts a new job record and returns its ID.
func CreateJob(db *sql.DB, jobType string, metadata map[string]interface{}) (string, error) {
	id := uuid.New().String()

	var metaJSON []byte
	if len(metadata) > 0 {
		var err error
		metaJSON, err = json.Marshal(metadata)
		if err != nil {
			return "", fmt.Errorf("failed to marshal metadata: %w", err)
		}
	}

	_, err := db.Exec(`
		INSERT INTO jobs (id, type, status, metadata, created_at)
		VALUES (?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)
	`, id, jobType, string(metaJSON))
	if err != nil {
		return "", fmt.Errorf("failed to create job: %w", err)
	}

	return id, nil
}

// StartJob marks a job as RUNNING and records its start time.
func StartJob(db *sql.DB, jobID string) error {
	_, err := db.Exec(`
		UPDATE jobs SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, jobID)
	return err
}

// CompleteJob marks a job as COMPLETED and records its completion time.
func CompleteJob(db *sql.DB, jobID string) error {
	_, err := db.Exec(`
		UPDATE jobs SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, jobID)
	return err
}

// FailJob marks a job as FAILED with an error message.
func FailJob(db *sql.DB, jobID string, errMsg string) {
	_, _ = db.Exec(`
		UPDATE jobs SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP, error_message = ?
		WHERE id = ?
	`, errMsg, jobID)
}

// JobLogger writes log entries to the job_logs table.
type JobLogger struct {
	db    *sql.DB
	jobID string
}

// NewJobLogger creates a new JobLogger for the given job.
func NewJobLogger(db *sql.DB, jobID string) *JobLogger {
	return &JobLogger{db: db, jobID: jobID}
}

func (l *JobLogger) log(level, msg string) {
	_, _ = l.db.Exec(`
		INSERT INTO job_logs (job_id, level, message, created_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
	`, l.jobID, level, msg)
}

// Info logs an informational message.
func (l *JobLogger) Info(msg string) {
	l.log("INFO", msg)
}

// Infof logs a formatted informational message.
func (l *JobLogger) Infof(format string, args ...interface{}) {
	l.Info(fmt.Sprintf(format, args...))
}

// Warn logs a warning message.
func (l *JobLogger) Warn(msg string) {
	l.log("WARN", msg)
}

// Warnf logs a formatted warning message.
func (l *JobLogger) Warnf(format string, args ...interface{}) {
	l.Warn(fmt.Sprintf(format, args...))
}

// Error logs an error message.
func (l *JobLogger) Error(msg string) {
	l.log("ERROR", msg)
}

// Errorf logs a formatted error message.
func (l *JobLogger) Errorf(format string, args ...interface{}) {
	l.Error(fmt.Sprintf(format, args...))
}
