# Research Documentation

## Data Sources

### Country List Sources

#### United Nations Member States
- **Source**: UN Official Website / UN API
- **URL**: https://www.un.org/en/about-us/member-states
- **Data Available**: 193 UN member states (matches our requirement)
- **Format**: HTML/JSON (if API available)
- **Health Check**: HTTP GET to endpoint, expect 200 status
- **Notes**: Most authoritative source for internationally recognized countries

#### REST Countries API
- **Source**: REST Countries (https://restcountries.com/)
- **URL**: https://restcountries.com/v3.1/all
- **Data Available**: Comprehensive country data including names, codes, capitals, flags
- **Format**: JSON
- **Health Check**: GET /v3.1/all, expect 200 and valid JSON
- **Rate Limits**: None documented (consider caching)
- **Notes**: Open source, actively maintained, includes ISO codes

#### World Countries JSON (GitHub)
- **Source**: mluqmaan/world-countries-json
- **URL**: https://github.com/mluqmaan/world-countries-json/blob/main/countries.json
- **Data Available**: Comprehensive JSON with country names, capitals, currencies, languages, coordinates
- **Format**: JSON (static file)
- **Health Check**: GET raw.githubusercontent.com URL
- **Rate Limits**: GitHub CDN limits
- **Notes**: Well-structured, includes lat/lon for mapping, no API required

#### Countries States Cities Database
- **Source**: dr5hn/countries-states-cities-database (GitHub)
- **URL**: https://github.com/dr5hn/countries-states-cities-database
- **Data Available**: Countries with states/cities, includes coordinates, flags
- **Format**: JSON, SQL, XML, YAML, CSV
- **Notes**: Very comprehensive, includes sub-national data

#### World Bank Country API
- **Source**: World Bank Data API
- **URL**: https://api.worldbank.org/v2/country?format=json
- **Data Available**: Country codes, names, regions
- **Format**: JSON/XML
- **Health Check**: GET with format=json, expect 200
- **Notes**: Reliable, governmental source

### Country Metadata Sources

#### Wikipedia API (MediaWiki)
- **Source**: Wikipedia REST API / Action API
- **URL**: https://en.wikipedia.org/api/rest_v1/
- **Data Available**: 
  - National anthem names (from infobox data)
  - Anthem adoption dates
  - Country founding dates
  - Historical information
- **Format**: JSON
- **Health Check**: GET /page/summary/{country_name}, expect 200
- **Rate Limits**: 200 requests/second per IP
- **Approach**: 
  1. Query country page: `/page/summary/Country_Name`
  2. Parse infobox data for anthem information
  3. May need to query separate anthem pages
- **Notes**: Structured data via Wikidata might be more reliable

#### Wikidata Query Service (SPARQL)
- **Source**: Wikidata SPARQL endpoint
- **URL**: https://query.wikidata.org/sparql
- **Data Available**:
  - National anthem (P85)
  - Inception/founding date (P571)
  - Anthem composition date
- **Format**: JSON/XML
- **Health Check**: Simple SPARQL query, expect 200
- **Example Query**:
  ```sparql
  SELECT ?country ?countryLabel ?anthem ?anthemLabel ?anthemDate
  WHERE {
    ?country wdt:P31 wd:Q6256 .  # Instance of country
    ?country wdt:P85 ?anthem .    # Has national anthem
    OPTIONAL { ?anthem wdt:P571 ?anthemDate }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
  }
  ```
- **Notes**: Most structured and reliable for this use case

### Geographic Data Sources (Country Boundaries)

**For clickable country polygons on the map, we need GeoJSON/TopoJSON data with country boundaries.**

#### Natural Earth Data ⭐ RECOMMENDED
- **Source**: Natural Earth (naturalearthdata.com)
- **URL**: https://www.naturalearthdata.com/downloads/
- **Data Available**: High-quality country boundaries in multiple resolutions
- **Format**: Shapefile, GeoJSON
- **Resolutions**: 
  - 1:10m (high detail, ~50MB) - Best for zoom levels
  - 1:50m (medium detail, ~5MB) - Good balance
  - 1:110m (low detail, ~1MB) - Fast loading, suitable for world view
- **Download**: Direct download of GeoJSON files
- **Health Check**: HTTP GET to download endpoint
- **Notes**: 
  - Public domain cartographic data
  - Used by professional GIS applications
  - Includes country codes (ISO 3166)
  - Clean, accurate boundaries
  - **This is the best source for clickable country polygons**

#### GeoJSON Country Boundaries (GitHub) ⭐ EASY TO USE
- **Source**: datasets/geo-countries (GitHub)
- **URL**: https://github.com/datasets/geo-countries
- **Data Available**: Country boundaries in GeoJSON format
- **Format**: GeoJSON (ready to use with Leaflet)
- **File**: `data/countries.geojson` (direct download)
- **Notes**: 
  - Pre-processed and ready to use
  - Includes country names and ISO codes
  - Simplified boundaries (good for web)
  - Can be directly loaded in Leaflet
  - **Easiest to integrate immediately**

#### World Atlas TopoJSON
- **Source**: topojson/world-atlas (GitHub)  
- **URL**: https://github.com/topojson/world-atlas
- **Data Available**: Country boundaries in TopoJSON (more compact than GeoJSON)
- **Format**: TopoJSON
- **File Sizes**: 
  - 110m resolution: ~200KB
  - 50m resolution: ~500KB
  - 10m resolution: ~2MB
- **Notes**: 
  - Smaller file sizes than GeoJSON (80% reduction)
  - Needs conversion to GeoJSON for Leaflet (use `topojson-client`)
  - Excellent for performance
  - Includes country codes

#### Leaflet.GeoJSON.Encoded
- **Source**: Leaflet plugin
- **URL**: https://github.com/jieter/Leaflet.encoded
- **Notes**: Plugin to load encoded polylines (even smaller files)

#### restcountries.com Boundaries
- **Source**: REST Countries API
- **URL**: https://restcountries.com/v3.1/all
- **Data Available**: Some geometry data via `maps` property
- **Notes**: Limited boundary data, better for metadata

**Recommendation for Implementation**:
1. **Quick start**: Use `datasets/geo-countries` - ready to go
2. **Best quality**: Use Natural Earth Data 1:50m resolution
3. **Best performance**: Use topojson/world-atlas with TopoJSON

**Implementation Example**:
```javascript
// Load GeoJSON countries
fetch('/data/countries.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: '#0d6efd', fillOpacity: 0.3 },
      onEachFeature: (feature, layer) => {
        // Make clickable
        layer.on('click', () => {
          showCountryPopup(feature.properties.name);
        });
      }
    }).addTo(map);
  });
```
- **Source**: Natural Earth (naturalearthdata.com)
- **URL**: https://www.naturalearthdata.com/downloads/
- **Data Available**: High-quality country boundaries in multiple resolutions
- **Format**: Shapefile, GeoJSON
- **Resolutions**: 1:10m, 1:50m, 1:110m
- **Health Check**: HTTP GET to download endpoint
- **Notes**: Public domain, cartographically accurate, used by professional GIS

#### GeoJSON Country Boundaries (GitHub)
- **Source**: datasets/geo-countries (GitHub)
- **URL**: https://github.com/datasets/geo-countries
- **Data Available**: Country boundaries in GeoJSON format
- **Format**: GeoJSON
- **Notes**: Pre-processed, ready to use with Leaflet

#### World Atlas TopoJSON
- **Source**: topojson/world-atlas (GitHub)  
- **URL**: https://github.com/topojson/world-atlas
- **Data Available**: Country boundaries in TopoJSON (more compact than GeoJSON)
- **Format**: TopoJSON
- **Notes**: Smaller file sizes, can be converted to GeoJSON

## National Anthem Audio Sources

#### Wikimedia Commons
- **Source**: Wikimedia Commons
- **URL**: https://commons.wikimedia.org/
- **Data Available**: Audio recordings of national anthems
- **Format**: OGG, MP3, WAV files
- **API**: MediaWiki API for file metadata and URLs
- **Health Check**: Query API for known anthem file
- **Search Strategy**: 
  - Search for "National anthem of [Country]"
  - Filter by audio file type
  - Check licensing (most are public domain or CC)
- **Notes**: Largest free source, varying quality

#### National Anthem World Archive
- **Source**: nationalanthems.info (if exists)
- **Notes**: Need to verify existence and licensing terms

#### YouTube Audio Library / Creative Commons
- **Source**: YouTube with CC license filter
- **API**: YouTube Data API v3
- **Data Available**: Official anthem recordings
- **Health Check**: API key validation endpoint
- **Rate Limits**: 10,000 units/day
- **Notes**: Requires API key, good for backup source

#### Internet Archive
- **Source**: archive.org
- **URL**: https://archive.org/
- **API**: Archive.org API
- **Data Available**: Historical anthem recordings
- **Format**: Various audio formats
- **Health Check**: API endpoint test
- **Notes**: Public domain focus, good for historical versions

### Data Source Health Monitoring

Each data source should implement:
1. **Reachability**: Can we connect to the endpoint?
2. **Response Time**: How long does a typical request take?
3. **Data Validity**: Does the response match expected schema?
4. **Rate Limit Status**: Are we approaching limits?
5. **Last Successful Fetch**: Timestamp of last successful data retrieval
6. **Error Count**: Track failures for alerting

Health check implementation in CLI:
```bash
worldanthem data sources
# Output:
# Data Sources Status:
# ✓ REST Countries API     [HEALTHY] Response: 145ms, Last fetch: 2026-02-13
# ✓ Wikidata SPARQL        [HEALTHY] Response: 423ms, Last fetch: 2026-02-13
# ✗ Wikimedia Commons API  [DEGRADED] Response: 2.3s, Errors: 3/10
# ✓ Internet Archive       [HEALTHY] Response: 234ms, Last fetch: 2026-02-12
```

---

## JSON Schema Design

### Overview
The data should be split into multiple JSON files to optimize loading and updates. An index file points to individual data files.

### Schema Structure

#### index.json (Entry Point)
```json
{
  "meta": {
    "version": "1.0.0",
    "generated_at": "2026-02-14T02:00:00Z",
    "total_countries": 193,
    "schema_version": "1.0"
  },
  "files": {
    "countries": "countries.json",
    "anthems": "anthems.json",
    "audio": "audio.json",
    "geography": "geography.json"
  },
  "checksums": {
    "countries": "sha256:abc123...",
    "anthems": "sha256:def456...",
    "audio": "sha256:ghi789...",
    "geography": "sha256:jkl012..."
  }
}
```

#### countries.json (Basic Country Data)
```json
{
  "meta": {
    "generated_at": "2026-02-14T02:00:00Z",
    "source": "REST Countries API + Wikidata",
    "count": 193
  },
  "countries": [
    {
      "id": "usa",
      "name": "United States of America",
      "common_name": "United States",
      "iso_alpha2": "US",
      "iso_alpha3": "USA",
      "un_member": true,
      "independence_date": "1776-07-04",
      "capital": "Washington, D.C.",
      "region": "Americas",
      "subregion": "Northern America"
    }
  ]
}
```

#### anthems.json (National Anthem Information)
```json
{
  "meta": {
    "generated_at": "2026-02-14T02:00:00Z",
    "source": "Wikidata + Wikipedia",
    "count": 193
  },
  "anthems": [
    {
      "country_id": "usa",
      "name": "The Star-Spangled Banner",
      "native_name": "The Star-Spangled Banner",
      "composer": "John Stafford Smith",
      "lyricist": "Francis Scott Key",
      "adopted_date": "1931-03-03",
      "written_date": "1814-09-14",
      "description": "Short description of the anthem history",
      "wikidata_id": "Q44384",
      "wikipedia_url": "https://en.wikipedia.org/wiki/The_Star-Spangled_Banner"
    }
  ]
}
```

#### audio.json (Audio File References)
```json
{
  "meta": {
    "generated_at": "2026-02-14T02:00:00Z",
    "source": "Wikimedia Commons",
    "count": 193
  },
  "recordings": [
    {
      "country_id": "usa",
      "anthem_id": "usa",
      "recordings": [
        {
          "id": "usa_official_1",
          "title": "Official Recording - Instrumental",
          "url": "https://upload.wikimedia.org/wikipedia/commons/.../anthem.ogg",
          "format": "ogg",
          "duration_seconds": 90,
          "type": "instrumental",
          "license": "Public Domain",
          "source": "Wikimedia Commons",
          "quality": "high",
          "file_size_bytes": 1234567
        },
        {
          "id": "usa_official_2",
          "title": "Official Recording - Vocal",
          "url": "https://upload.wikimedia.org/wikipedia/commons/.../anthem_vocal.ogg",
          "format": "ogg",
          "duration_seconds": 95,
          "type": "vocal",
          "license": "Public Domain",
          "source": "Wikimedia Commons",
          "quality": "high",
          "file_size_bytes": 2345678
        }
      ]
    }
  ]
}
```

#### geography.json (Geographic Boundaries for Map)
```json
{
  "meta": {
    "generated_at": "2026-02-14T02:00:00Z",
    "source": "Natural Earth Data / OpenStreetMap",
    "format": "GeoJSON",
    "count": 193
  },
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "usa",
      "properties": {
        "country_id": "usa",
        "name": "United States of America",
        "iso_alpha3": "USA"
      },
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [[[[-125.0, 49.0], ...]]]
      }
    }
  ]
}
```

### Database Schema (SQLite)

#### countries table
```sql
CREATE TABLE countries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    common_name TEXT,
    iso_alpha2 TEXT,
    iso_alpha3 TEXT,
    un_member BOOLEAN,
    independence_date TEXT,
    capital TEXT,
    region TEXT,
    subregion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### anthems table
```sql
CREATE TABLE anthems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_id TEXT NOT NULL,
    name TEXT NOT NULL,
    native_name TEXT,
    composer TEXT,
    lyricist TEXT,
    adopted_date TEXT,
    written_date TEXT,
    description TEXT,
    wikidata_id TEXT,
    wikipedia_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (country_id) REFERENCES countries(id)
);
```

#### audio_recordings table
```sql
CREATE TABLE audio_recordings (
    id TEXT PRIMARY KEY,
    country_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    format TEXT,
    duration_seconds INTEGER,
    type TEXT, -- 'instrumental', 'vocal', 'historical'
    license TEXT,
    source TEXT,
    quality TEXT,
    file_size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (country_id) REFERENCES countries(id)
);
```

#### jobs table
```sql
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'discover', 'download', 'format'
    status TEXT NOT NULL, -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    records_processed INTEGER DEFAULT 0,
    records_total INTEGER,
    metadata TEXT, -- JSON blob for job-specific data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### data_sources table
```sql
CREATE TABLE data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT, -- 'countries', 'anthems', 'audio'
    status TEXT, -- 'HEALTHY', 'DEGRADED', 'DOWN'
    last_check_at TIMESTAMP,
    last_success_at TIMESTAMP,
    response_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### schema_version table
```sql
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);
```

---

## Parallelized Job System Design

### Overview
The job system should efficiently download data from multiple sources concurrently while tracking progress and handling failures gracefully.

### Job Types

1. **discover**: Find available data sources and validate connectivity
2. **download_countries**: Fetch country list and basic metadata
3. **download_anthems**: Fetch anthem information for all countries
4. **download_audio**: Fetch audio file metadata and URLs
5. **download_geography**: Fetch geographic boundary data
6. **validate**: Verify data integrity and completeness
7. **format**: Convert database data to JSON files

### Parallelization Strategy

#### Worker Pool Pattern
```
Main Job Controller
├── Worker Pool (configurable size, default: 10)
│   ├── Worker 1: Download country data (batch 1-20)
│   ├── Worker 2: Download country data (batch 21-40)
│   ├── Worker 3: Download anthem data (batch 1-20)
│   ├── Worker 4: Download anthem data (batch 21-40)
│   └── ... (up to N workers)
└── Job Queue (persisted in SQLite)
```

#### Implementation Details

**Job Phases:**
1. **Planning Phase**: Break down main job into sub-jobs
   - Example: "download_anthems" → 10 sub-jobs of 19-20 countries each
2. **Execution Phase**: Workers pick up sub-jobs from queue
3. **Aggregation Phase**: Combine results from all sub-jobs
4. **Completion Phase**: Mark main job as complete

**Concurrency Control:**
- Use Go goroutines with worker pool pattern
- Channel-based communication for job distribution
- Context for cancellation and timeouts
- Rate limiting per data source (respect API limits)

**Error Handling:**
- Retry failed sub-jobs with exponential backoff
- Track partial failures (e.g., 190/193 countries succeeded)
- Store detailed error messages per sub-job
- Continue processing other jobs even if one fails

**Progress Tracking:**
```go
type Job struct {
    ID              string
    Type            string
    Status          string    // PENDING, RUNNING, COMPLETED, FAILED
    ParentJobID     *string   // For sub-jobs
    StartedAt       time.Time
    CompletedAt     *time.Time
    RecordsTotal    int
    RecordsProcessed int
    ErrorMessage    *string
    Metadata        map[string]interface{}
}
```

### Job Dependencies

```
discover (must complete first)
    ↓
download_countries (parallel)
    ↓
┌─────────────────┬──────────────────┐
↓                 ↓                  ↓
download_anthems  download_audio     download_geography
(parallel)        (parallel)         (parallel)
    ↓                 ↓                  ↓
    └─────────────────┴──────────────────┘
                      ↓
                  validate
                      ↓
                   format
```

### Job Execution Example

**Command**: `worldanthem data download`

**Execution Flow**:
1. Create main job: `job_main_001`
2. Create sub-jobs:
   - `job_countries_001` (countries 1-50)
   - `job_countries_002` (countries 51-100)
   - `job_countries_003` (countries 101-150)
   - `job_countries_004` (countries 151-193)
3. Spawn 4 workers (or configurable)
4. Each worker:
   - Pulls job from queue
   - Fetches data from source
   - Writes to database
   - Updates job status
5. Monitor progress: `worldanthem jobs status`
   ```
   Jobs Status:
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   RUNNING (4 active jobs)
   
   [████████████████░░░░] job_countries_001  80% (40/50)
   [███████████░░░░░░░░░] job_countries_002  55% (27/50)
   [██████████████░░░░░░] job_countries_003  70% (35/50)
   [████████░░░░░░░░░░░░] job_countries_004  40% (17/43)
   
   Overall: 119/193 countries (62%)
   Estimated time remaining: 45 seconds
   ```

### Rate Limiting

**Per-Source Limits**:
- REST Countries API: 10 req/second
- Wikidata SPARQL: 5 req/second (conservative)
- Wikimedia Commons: 10 req/second
- Wikipedia API: 200 req/second (use lower limit: 20 req/sec)

**Implementation**:
- Token bucket algorithm per data source
- Shared rate limiter across workers
- Configurable in data sources table

### Recovery & Resumption

**Crash Recovery**:
- Jobs marked RUNNING but not updated for >5 minutes → mark as FAILED
- Sub-jobs can be retried independently
- Idempotent operations (safe to re-run)

**Resume Command**:
```bash
worldanthem jobs resume <job_id>
# Re-run failed sub-jobs from a previous attempt
```

### Configuration

**Config File** (`~/.config/anthemworld/config.json`):
```json
{
  "worker_pool_size": 10,
  "max_retries": 3,
  "retry_backoff_seconds": 5,
  "request_timeout_seconds": 30,
  "rate_limits": {
    "rest_countries": 10,
    "wikidata": 5,
    "wikimedia_commons": 10,
    "wikipedia": 20
  }
}
```

---

## Future Considerations

### Incremental Updates
- Track last update timestamp per country
- Only fetch changed data on subsequent runs
- Use ETags/Last-Modified headers when available

### Caching Strategy
- Cache data source responses for 24 hours
- Store raw responses for debugging
- Invalidate cache on explicit refresh command

### Data Quality Checks
- Validate all countries have anthem data
- Check audio file accessibility
- Verify geographic boundaries completeness
- Flag missing or suspicious data

### Multi-language Support
- Store anthem names in multiple languages
- Use Wikidata's multi-language labels
- Plan for i18n in website

### Historical Data
- Track changes to anthems over time
- Store multiple versions if country changed anthem
- Preserve historical recordings
