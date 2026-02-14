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

