# Implementation Notes

## Health Check System

### Overview
Each data source implements a `HealthCheck()` method that verifies the source is accessible and returns appropriate status information.

### Architecture

**Interface Definition** (`pkg/sources/source.go`):
```go
type HealthStatus struct {
    Healthy      bool
    StatusCode   int
    Message      string
    ResponseTime int64 // milliseconds
}

type DataSource interface {
    // ... other methods ...
    HealthCheck(ctx context.Context) HealthStatus
}
```

**GeoJSON Implementation** (`pkg/sources/geojson.go`):
- Performs HTTP HEAD request to URL
- Returns healthy if status code 200-299
- Tracks response time in milliseconds
- Gracefully handles connection failures
- Returns descriptive error messages

### Usage

```bash
# Check all data sources
$ worldanthem data sources

# Full system status (includes sources)
$ worldanthem status
```

### Example Output

```
Data Sources Status
===================

[1] GeoJSON Country Boundaries
    ID:   geo-countries-geojson
    Type: geography
    URL:  https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json
    Health: ✓ Healthy (148ms)
    Status Code: 200
```

### Adding New Data Sources

When implementing a new data source:

1. **Implement the HealthCheck method:**
```go
func (s *MySource) HealthCheck(ctx context.Context) HealthStatus {
    // Define what "healthy" means for your source
    // Examples:
    // - HTTP endpoint returns 2xx
    // - Authentication succeeds
    // - Rate limits not exceeded
    // - Required fields present in response
    
    return HealthStatus{
        Healthy:      true,
        StatusCode:   200,
        Message:      "OK",
        ResponseTime: 123,
    }
}
```

2. **Register in AllSources** (`pkg/sources/registry.go`):
```go
var AllSources = []DataSource{
    NewGeoJSONSource(),
    NewMySource(), // Add your source here
}
```

3. **Automatically appears in status output!**

### Testing

Unit tests verify health checks work correctly:

```bash
$ cd cli/worldanthem
$ go test -v ./pkg/sources/
```

Tests cover:
- ✅ Healthy source (200 OK)
- ✅ Unhealthy source (404 Not Found)
- ✅ Connection failures
- ✅ Response time tracking

### Design Decisions

**Why each source defines its own health check?**
- Different sources have different requirements
- API sources might check authentication
- File sources might verify file exists
- SPARQL endpoints might do a lightweight query
- Allows flexibility without complex framework

**Why HEAD request instead of GET?**
- Faster (no body download)
- Less bandwidth
- Still validates URL accessibility
- Most CDNs support HEAD requests

**Why track response time?**
- Helps identify performance issues
- Can set alerts if response time > threshold
- Useful for debugging slow sources

### Future Enhancements

- **Caching**: Cache health status for N seconds
- **Retries**: Retry failed checks with exponential backoff
- **Alerts**: Notify if source unhealthy for > X minutes
- **Metrics**: Track uptime percentage over time
- **Parallel**: Check all sources concurrently (currently sequential)


## Source-Specific Schema System

### Overview
Each data source defines its own database schema, independent of other sources. This allows sources to store optimized data structures without interfering with each other.

### Architecture

**DataSource Interface Extensions** (`pkg/sources/source.go`):
```go
type DataStats struct {
    RecordCount   int
    StorageBytes  int64
    LastUpdated   string
    SchemaVersion int
}

type DataSource interface {
    // Schema management
    GetSchema() string                          // SQL to create tables
    GetSchemaVersion() int                      // Version number
    ApplySchema(db) error                       // Apply schema
    SchemaExists(db) (bool, error)              // Check if applied
    
    // Data management
    GetDataStats(db) (DataStats, error)         // Statistics
    NeedsUpdate(db) (bool, error)               // Freshness check
}
```

**GeoJSON Schema** (`pkg/sources/geojson.go`):
```sql
CREATE TABLE geojson_countries (
    iso_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    geometry_type TEXT NOT NULL,          -- Polygon or MultiPolygon
    geometry JSON NOT NULL,               -- Full GeoJSON geometry
    bbox_min_lon REAL,                    -- Bounding box for queries
    bbox_min_lat REAL,
    bbox_max_lon REAL,
    bbox_max_lat REAL,
    coordinate_count INTEGER,             -- Complexity metric
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE geojson_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP
);
```

### Features

**1. Idempotent Downloads**
- Uses SQLite's `INSERT ... ON CONFLICT ... DO UPDATE`
- Same data downloaded twice → same record count
- Timestamps update to track freshness

**2. Data Statistics**
- Record count: Number of countries stored
- Storage size: Approximate bytes used
- Last updated: Most recent update timestamp
- Schema version: Track schema changes over time

**3. Freshness Checking**
- `NeedsUpdate()` returns true if:
  - Schema doesn't exist
  - Table is empty
  - Data is older than 30 days
- Prevents unnecessary re-downloads

**4. Geometric Analysis**
- Calculates bounding box (min/max lon/lat)
- Counts coordinate pairs (polygon complexity)
- Stores geometry type (Polygon vs MultiPolygon)
- Enables spatial queries in future

### Example Output

```bash
$ worldanthem data sources
[1] GeoJSON Country Boundaries
    Schema: ✓ Applied (v1)
    Data: 177 records, ~0.2 MB, updated 2026-02-14 18:58:19
    Health: ✓ Healthy (104ms)
```

### Sample Data

```sql
sqlite> SELECT iso_code, name, geometry_type, coordinate_count 
        FROM geojson_countries 
        WHERE iso_code IN ('USA', 'GBR', 'JPN');

USA | United States of America | MultiPolygon | 443 coords
GBR | United Kingdom           | MultiPolygon | 56 coords
JPN | Japan                    | MultiPolygon | 65 coords
```

### Design Decisions

**Why source-specific tables?**
- Avoid conflicts between data sources
- Each source can optimize for its data structure
- Easy to add/remove sources without migrations
- Clear ownership of data

**Why store full geometry?**
- Enables future spatial queries
- Can generate custom GeoJSON exports
- Can calculate distance/overlap in future
- No loss of precision from source

**Why track coordinate count?**
- Measure polygon complexity
- Identify simplified vs detailed geometries
- Useful for performance optimization
- Can choose appropriate zoom levels

**Why 30-day freshness?**
- Country boundaries change rarely
- Balance between freshness and API load
- Can be configured per source
- User can force re-download anytime

### Future Enhancements

- **Schema migrations**: Version upgrades for existing tables
- **Compression**: GZIP geometry JSON to save space
- **Indexes**: Add spatial indexes when needed
- **Partitioning**: Split large datasets by region
- **Validation**: Check geometry validity on insert
- **Deduplication**: Merge duplicate records from sources

