package sources

import (
	"context"
	"database/sql"

	"github.com/anthemworld/cli/pkg/jobs"
)

// HealthStatus represents the health of a data source
type HealthStatus struct {
	Healthy      bool
	StatusCode   int
	Message      string
	ResponseTime int64 // milliseconds
}

// DataStats represents statistics about downloaded data
type DataStats struct {
	RecordCount   int
	StorageBytes  int64
	LastUpdated   string
	SchemaVersion int
}

// DataSource represents a source of data (API, file, etc.)
type DataSource interface {
	ID() string
	Name() string
	Type() string
	URL() string
	Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error
	HealthCheck(ctx context.Context) HealthStatus
	
	// Schema management
	GetSchema() string                             // Returns SQL to create source-specific tables
	GetSchemaVersion() int                         // Returns current schema version
	GetTables() []string                           // Returns list of table names created by this source
	ApplySchema(db *sql.DB) error                  // Applies schema to database
	SchemaExists(db *sql.DB) (bool, error)         // Checks if schema is applied
	
	// Data management
	GetDataStats(db *sql.DB) (DataStats, error)    // Returns statistics about stored data
	NeedsUpdate(db *sql.DB) (bool, error)          // Checks if data should be re-downloaded
}
