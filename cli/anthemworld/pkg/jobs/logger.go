package jobs

import (
	"database/sql"
	"fmt"
)

// JobLogger provides convenient logging for jobs
type JobLogger struct {
	db    *sql.DB
	jobID string
}

// NewJobLogger creates a new job logger
func NewJobLogger(db *sql.DB, jobID string) *JobLogger {
	return &JobLogger{
		db:    db,
		jobID: jobID,
	}
}

// Info logs an info message
func (l *JobLogger) Info(message string) {
	LogJob(l.db, l.jobID, "INFO", message)
	fmt.Printf("[INFO] %s\n", message)
}

// Warn logs a warning message
func (l *JobLogger) Warn(message string) {
	LogJob(l.db, l.jobID, "WARN", message)
	fmt.Printf("[WARN] %s\n", message)
}

// Error logs an error message
func (l *JobLogger) Error(message string) {
	LogJob(l.db, l.jobID, "ERROR", message)
	fmt.Printf("[ERROR] %s\n", message)
}

// Infof logs a formatted info message
func (l *JobLogger) Infof(format string, args ...interface{}) {
	message := fmt.Sprintf(format, args...)
	l.Info(message)
}

// Warnf logs a formatted warning message
func (l *JobLogger) Warnf(format string, args ...interface{}) {
	message := fmt.Sprintf(format, args...)
	l.Warn(message)
}

// Errorf logs a formatted error message
func (l *JobLogger) Errorf(format string, args ...interface{}) {
	message := fmt.Sprintf(format, args...)
	l.Error(message)
}
