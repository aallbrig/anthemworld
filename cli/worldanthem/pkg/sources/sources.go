package sources

import (
	"context"
	"database/sql"

	"github.com/anthemworld/cli/pkg/jobs"
)

// HealthStatus holds the result of a data source health check.
type HealthStatus struct {
	Healthy      bool
	StatusCode   int
	Message      string
	ResponseTime int64
}

// DataStats holds summary statistics for a data source.
type DataStats struct {
	SchemaVersion int
	RecordCount   int
	StorageBytes  int64
	LastUpdated   string
}

// DataSource is the interface that all data sources must implement.
type DataSource interface {
	// Identification
	ID() string
	Name() string
	Type() string
	URL() string

	// Schema management
	GetSchema() string
	GetSchemaVersion() int
	GetTables() []string
	ApplySchema(db *sql.DB) error
	SchemaExists(db *sql.DB) (bool, error)

	// Data management
	GetDataStats(db *sql.DB) (DataStats, error)
	NeedsUpdate(db *sql.DB) (bool, error)
	Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error

	// Health
	HealthCheck(ctx context.Context) HealthStatus
}
