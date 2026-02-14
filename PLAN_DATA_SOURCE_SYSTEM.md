# Plan: Sophisticated Data Source Management System

## ✅ COMPLETED: mkdir -p for data format

**Implementation:**
- Updated `cli/worldanthem/cmd/data.go` to use `os.MkdirAll()`
- Added directory creation with 0755 permissions
- Added write permission test
- Tested successfully: `./bin/worldanthem data format --output ./tmp/test/nested` ✅

**Result:** Users can now specify any nested output path, and all directories will be created automatically.

```bash
# These all work now:
worldanthem data format --output ./tmp
worldanthem data format --output ./hugo/site/static/data
worldanthem data format --output /any/absolute/path
```

---

## 🎯 Goal: Dynamic Data Source Management

Create a sophisticated system where:
1. **Data sources registered in database** with schemas and health endpoints
2. **Health checks** via `data sources status` command
3. **Downloads** via `data download` command (including GeoJSON)
4. **Status roll-up**: `data sources` → `data status` → `status`
5. **Job tracking** in database with detailed logs
6. **JSON export** for frontend consumption

### Architecture

```
Commands:
  status
    ├─> data status
    │     ├─> Database info & counts
    │     └─> data sources status
    │           └─> Health check all sources
    └─> jobs status
          └─> Active & completed jobs

  data download
    └─> Orchestrator
          ├─> Health check
          ├─> Create job
          ├─> Worker pool (rate-limited)
          ├─> Download from sources
          └─> Update database

  data format --output <dir>
    └─> Export JSON files
          ├─> anthems.json
          ├─> audio.json
          ├─> countries-metadata.json
          ├─> countries.geojson
          └─> index.json
```

### Data Sources (5 initial)

1. **REST Countries API** → countries table
2. **Wikidata SPARQL** → anthems table
3. **Wikimedia Commons** → audio_recordings table
4. **GeoJSON Boundaries** → countries.geojson_geometry column
5. **World Countries JSON** → countries native names enrichment

---

## Database Schema Changes

### New Tables

**data_source_schemas** - Field mappings per source
```sql
CREATE TABLE IF NOT EXISTS data_source_schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    target_table TEXT NOT NULL,
    field_mappings TEXT NOT NULL,  -- JSON
    transform_rules TEXT,          -- JSON (optional)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES data_sources(id)
);
```

**job_logs** - Detailed logging
```sql
CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    level TEXT NOT NULL,           -- INFO, WARN, ERROR
    message TEXT NOT NULL,
    source_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

### Schema Updates

**data_sources** - Enhanced
```sql
ALTER TABLE data_sources ADD COLUMN rate_limit_per_second INTEGER DEFAULT 10;
ALTER TABLE data_sources ADD COLUMN requires_auth BOOLEAN DEFAULT 0;
ALTER TABLE data_sources ADD COLUMN health_check_endpoint TEXT;
ALTER TABLE data_sources ADD COLUMN download_strategy TEXT DEFAULT 'api';
```

**countries** - Add geometry
```sql
ALTER TABLE countries ADD COLUMN geojson_geometry TEXT;
```

---

## Implementation Phases

### Phase 1: Foundation (4-6 hours)

**Create:**
- [ ] Database migration file `002_data_sources.sql`
- [ ] `pkg/sources/` package
- [ ] `DataSource` interface
- [ ] `Registry` struct
- [ ] 5 initial data source definitions

**Interface:**
```go
type DataSource interface {
    ID() string
    Name() string
    Type() string
    URL() string
    HealthCheck(ctx context.Context) error
    Download(ctx context.Context, job *Job) error
    GetSchema() SchemaMapping
    GetRateLimit() int
}
```

**Command:**
```bash
$ worldanthem data sources

Registered Data Sources
=======================
1. rest-countries          REST Countries API
2. wikidata-sparql         Wikidata Query Service
3. wikimedia-commons       Wikimedia Commons API
4. geo-countries-geojson   GeoJSON Boundaries
5. world-countries-json    World Countries JSON
```

### Phase 2: Health Checks (2-3 hours)

**Create:**
- [ ] `pkg/sources/health.go`
- [ ] HTTP client with timeouts
- [ ] Health check per source type
- [ ] Store results in database
- [ ] `data sources status` command
- [ ] Update `data status` to call it

**Output:**
```bash
$ worldanthem data sources status

Data Sources Health
===================
✓ REST Countries API         HEALTHY (142ms)
✓ Wikidata SPARQL           HEALTHY (256ms)
✓ Wikimedia Commons         HEALTHY (98ms)
✓ GeoJSON Countries         HEALTHY (312ms)
✗ World Countries JSON      DOWN (timeout)

Overall: 4/5 sources healthy
Last checked: 2026-02-14 18:00:00 UTC
```

### Phase 3: Download Infrastructure (6-8 hours)

**Create:**
- [ ] `pkg/download/` package
- [ ] Worker pool pattern
- [ ] Rate limiter per source
- [ ] Job creation & tracking
- [ ] Job logs to database
- [ ] Download orchestrator
- [ ] `data download` command

**Usage:**
```bash
# Download all
worldanthem data download

# Download specific sources
worldanthem data download --sources rest-countries,geojson

# Dry run
worldanthem data download --dry-run
```

**Output:**
```bash
$ worldanthem data download

Starting download from 5 sources...

✓ Health check passed (4/5 sources healthy)

Creating job [job_abc123]...

[1/4] rest-countries: Downloading countries...
      Progress: 193/193 (100%) ✓ Complete

[2/4] geo-countries-geojson: Downloading boundaries...
      Progress: 100% ✓ Complete
      Stored 193 geometries

Job completed in 3m 42s
Records: 542
```

### Phase 4: GeoJSON Integration (3-4 hours)

**Create:**
- [ ] `pkg/sources/geojson.go`
- [ ] Download to cache (`~/.cache/anthemworld/`)
- [ ] Parse GeoJSON features
- [ ] Extract ISO codes
- [ ] Store geometry in database
- [ ] Handle missing countries

**Logic:**
```go
func (g *GeoJSONSource) Download(ctx context.Context, job *Job) error {
    // 1. Download file
    resp, _ := http.Get(g.url)
    
    // 2. Cache locally
    cacheFile := filepath.Join(cacheDir, "countries.geojson")
    os.WriteFile(cacheFile, data, 0644)
    
    // 3. Parse
    var geojson GeoJSON
    json.Unmarshal(data, &geojson)
    
    // 4. Store in DB
    for _, feature := range geojson.Features {
        isoCode := feature.Properties["ISO_A3"]
        geometry, _ := json.Marshal(feature.Geometry)
        
        db.Exec(`
            UPDATE countries 
            SET geojson_geometry = ?
            WHERE iso_alpha3 = ?
        `, string(geometry), isoCode)
    }
    
    return nil
}
```

### Phase 5: Data Export (3-4 hours)

**Create:**
- [ ] `pkg/format/` package
- [ ] JSON export per table
- [ ] Generate `index.json` manifest
- [ ] Export GeoJSON (reconstruct from DB)
- [ ] Update `data format` command

**Files Generated:**
```
hugo/site/static/data/
├── index.json              # Manifest
├── anthems.json           # Indexed by ISO code
├── audio.json             # Indexed by audio ID
├── countries-metadata.json
└── countries.geojson      # Reconstructed
```

**anthems.json Example:**
```json
{
  "USA": {
    "country_code": "USA",
    "anthem_name": "The Star-Spangled Banner",
    "composer": "John Stafford Smith",
    "adopted_date": "1931-03-03",
    "audio_ids": ["usa_001", "usa_002"]
  }
}
```

### Phase 6: Job Management (4-5 hours)

**Create:**
- [ ] Job progress tracking
- [ ] Real-time updates
- [ ] `jobs logs <job_id>` command
- [ ] Enhanced `jobs status` output

**Output:**
```bash
$ worldanthem jobs status

--- Jobs Status ---
Status: RUNNING (1 active job)

Active Jobs:
  [Job abc123] data-download
    Progress: 145/193 (75%)
    Current: wikimedia-commons
    Started: 17:55:00 UTC
    Duration: 5m 23s
    
    Completed:
      ✓ rest-countries (193 countries)
      ✓ geo-countries-geojson (193 geometries)

$ worldanthem jobs logs abc123

[17:55:00] INFO  Starting download job
[17:55:01] INFO  Health check: 4/5 sources healthy
[17:55:02] INFO  rest-countries: Starting download
[17:55:27] INFO  rest-countries: Downloaded 193 countries
[17:55:28] INFO  geo-countries-geojson: Downloading file
[17:55:45] INFO  geo-countries-geojson: Parsed 193 features
...
```

---

## Package Structure

```
cli/worldanthem/
├── cmd/
│   ├── data.go          # ✅ Updated with mkdir -p
│   └── jobs.go          # Job commands
├── pkg/
│   ├── db/
│   │   ├── db.go       # Database layer
│   │   └── migrations.go # NEW
│   ├── sources/        # NEW PACKAGE
│   │   ├── registry.go
│   │   ├── source.go
│   │   ├── health.go
│   │   ├── rest_countries.go
│   │   ├── wikidata.go
│   │   ├── wikimedia.go
│   │   └── geojson.go
│   ├── download/       # NEW PACKAGE
│   │   ├── orchestrator.go
│   │   ├── worker.go
│   │   └── ratelimit.go
│   └── format/         # NEW PACKAGE
│       ├── json.go
│       └── export.go
```

---

## Workflow Examples

### Fresh Install
```bash
# 1. Check status
worldanthem status
# Shows: Database not created, no data

# 2. Check sources health
worldanthem data sources status
# Shows: 4/5 sources healthy

# 3. Download data
worldanthem data download
# Downloads from all healthy sources
# Creates job, tracks progress
# Stores in SQLite

# 4. Check status again
worldanthem status
# Shows: 193 countries, 187 anthems, 245 audio files

# 5. Export for frontend
worldanthem data format --output hugo/site/static/data
# Generates:
#   - anthems.json
#   - audio.json
#   - countries-metadata.json
#   - countries.geojson
#   - index.json

# 6. Run Hugo
hugo server -s hugo/site -D
# Map now has clickable boundaries with anthem data!
```

---

## Timeline

- **Phase 1**: 4-6 hours
- **Phase 2**: 2-3 hours  
- **Phase 3**: 6-8 hours
- **Phase 4**: 3-4 hours
- **Phase 5**: 3-4 hours
- **Phase 6**: 4-5 hours

**Total**: ~25-35 hours

---

## Benefits

✅ **Status Roll-up**: Everything visible via `status` command  
✅ **Health Monitoring**: Know which sources work  
✅ **Job Tracking**: Full download visibility  
✅ **Extensible**: Easy to add new sources  
✅ **Robust**: Rate limiting, retries, errors handled  
✅ **GeoJSON Integrated**: Boundaries in database  
✅ **Frontend Ready**: JSON export for static site  
✅ **Single Source**: Database is truth, files are export  

---

## Design Decisions

**Q: Store GeoJSON in database or file?**  
A: **Database** (as TEXT column). Export to file for frontend. Single source of truth.

**Q: How to handle data conflicts?**  
A: Add `source_priority` column. Higher priority overrides.

**Q: Support incremental updates?**  
A: Phase 2 feature. Full download for MVP.

**Q: Authentication?**  
A: Add `auth_type` and `auth_config` columns. Support env vars.

---

## Next Steps

1. Review and approve this plan
2. Start Phase 1 (Foundation)
3. Create database migrations
4. Implement data source registry
5. Build incrementally, test each phase

**Status**: ✅ Ready to implement
