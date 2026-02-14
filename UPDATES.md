# Recent Updates (2026-02-14)

## Build System Improvements

### Go Workspace Configuration
- Created Go workspace (`go.work`) at repository root
- Enables building CLI from anywhere in the repo: `go build -o bin/worldanthem ./cli/worldanthem`
- No longer need to `cd` into `cli/worldanthem` directory

### Binary Output Directory
- Added `bin/` directory to .gitignore
- CLI now builds to `./bin/worldanthem` from repo root
- Keeps project root clean and organized

### Documentation Updates
All documentation now uses repository root commands:

**Hugo:**
```bash
# OLD (required cd)
cd hugo/site && hugo server -D

# NEW (from repo root)
hugo server -s hugo/site -D
```

**CLI:**
```bash
# OLD (required cd)
cd cli/worldanthem && go build

# NEW (from repo root)
go build -o bin/worldanthem ./cli/worldanthem
./bin/worldanthem status
```

**Tests:**
```bash
# OLD
cd cli/worldanthem && go test ./...

# NEW (from repo root)
go test ./cli/worldanthem/... -v
```

## Enhanced Data Sources

Added comprehensive data sources to `docs/research.md`:

### New Country Data Sources
- **mluqmaan/world-countries-json** (GitHub) - Static JSON file with comprehensive country data
- **dr5hn/countries-states-cities-database** (GitHub) - Includes sub-national data

### New Geographic Data Sources
- **Natural Earth Data** - Professional-grade country boundaries (multiple resolutions)
- **datasets/geo-countries** (GitHub) - Pre-processed GeoJSON
- **topojson/world-atlas** (GitHub) - Compact TopoJSON format

These sources provide:
- Ready-to-use JSON files (no API required for some)
- Multiple resolution options for maps
- Coordinates for placing markers
- Geographic boundaries for country polygons

## Files Updated
- ✅ `.gitignore` - Added `bin/`
- ✅ `.gitattributes` - Mark `go.work` as generated
- ✅ `go.work` - Created Go workspace
- ✅ `CONTRIBUTING.md` - All commands use repo root
- ✅ `README.md` - Updated quick start commands
- ✅ `QUICK_START.md` - Updated all command examples
- ✅ `docs/research.md` - Added 5+ new data sources
- ✅ `plan.md` - Updated with completed items

## Quick Commands Reference

All from repository root:

```bash
# Build everything
go build -o bin/worldanthem ./cli/worldanthem
hugo -s hugo/site

# Development
hugo server -s hugo/site -D          # Website dev server
go run ./cli/worldanthem/main.go status  # Run CLI without building

# Testing
go test ./cli/worldanthem/... -v     # Go tests
cd tests/playwright && npm test      # E2E tests

# CLI usage
./bin/worldanthem status
./bin/worldanthem data status
./bin/worldanthem --help
```

## Benefits

1. **Consistent workflow** - All commands from repo root
2. **Cleaner builds** - Binaries go to `bin/` (gitignored)
3. **Better documentation** - No confusion about working directories
4. **More data sources** - Better options for implementation
5. **Go workspace** - Proper module management from root

## Next Steps

Same priorities as before:
1. Implement `data download` using the researched data sources
2. Generate JSON files for website consumption
3. Load full 193 countries on map and table
4. Add audio playback functionality

See TODO.md for complete roadmap.
