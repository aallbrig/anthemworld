# 🚀 Anthem World - Quick Start Guide

Get up and running with Anthem World in 5 minutes!

## Prerequisites
- Hugo (extended version): `sudo apt install hugo`
- Go 1.21+: `sudo apt install golang`
- Node.js 18+: `sudo apt install nodejs npm`

## 1. View the Website (30 seconds)

From repository root:

```bash
hugo server -s hugo/site -D
```

Open http://localhost:1313 in your browser

**What you'll see:**
- ✅ Homepage with project overview
- ✅ Interactive map with sample countries (click the markers!)
- ✅ Searchable countries table (try searching "United States")
- ✅ QR codes in footer (scan to share the page)

## 2. Try the CLI (1 minute)

From repository root:

```bash
# Build the CLI
go build -o bin/worldanthem ./cli/worldanthem

# Check overall status
./bin/worldanthem status

# View data status
./bin/worldanthem data status

# See all commands
./bin/worldanthem --help
```

**Database location:** `~/.local/share/anthemworld/data.db`

## 3. Run the Tests (2 minutes)

### CLI Tests

From repository root:

```bash
go test ./cli/worldanthem/... -v
```

Expected output:
```
✅ TestGetDataStats - PASS
✅ TestGetRunningJobs - PASS  
✅ TestGetLastCompletedJob - PASS
```

### Playwright Tests
```bash
cd tests/playwright
npm install    # First time only
npm test
```

Tests will:
- ✅ Launch Hugo server automatically
- ✅ Test all pages load under 2 seconds
- ✅ Verify no console errors
- ✅ Check map and table functionality
- ✅ Validate QR code generation

## Project Structure at a Glance

```
anthemworld/
├── bin/                    # Built binaries (gitignored)
├── hugo/site/          # Website (Hugo)
│   ├── content/        # Pages (Markdown)
│   ├── layouts/        # Templates (HTML)
│   └── static/         # Assets (CSS, JS)
├── cli/worldanthem/    # CLI tool (Go)
│   ├── cmd/            # Commands
│   └── pkg/db/         # Database layer
├── tests/playwright/   # End-to-end tests
├── data/schema/        # Database schema
└── docs/              # Documentation & research
```

## Key Files

- **README.md** - Project overview and features
- **CONTRIBUTING.md** - Development guide (comprehensive!)
- **TODO.md** - Feature roadmap
- **docs/research.md** - Data sources & architecture
- **IMPLEMENTATION_SUMMARY.md** - What's been built

## Next Steps

### For Users
1. Explore the website - click countries on the map!
2. Try searching in the countries table
3. Scan the QR codes with your phone

### For Developers
1. Read **CONTRIBUTING.md** for development workflow
2. Check **TODO.md** for features to implement
3. Review **docs/research.md** for data architecture
4. Look at existing code for patterns and style

### To Add Real Data
The site currently has sample data. To add all 193 countries:

1. Implement `worldanthem data download` command
   - Connect to REST Countries API
   - Query Wikidata for anthem metadata
   - Fetch audio from Wikimedia Commons

2. Generate JSON files with `worldanthem data format`

3. Update website to load JSON files

See TODO.md for detailed implementation plan!

## Common Commands

All commands from repository root:

```bash
# Website
hugo server -s hugo/site -D    # Development server
hugo -s hugo/site               # Build for production

# CLI
go build -o bin/worldanthem ./cli/worldanthem  # Build binary
go test ./cli/worldanthem/... -v               # Run tests
./bin/worldanthem status                       # Check system status

# Tests
cd tests/playwright
npm test                   # Run all tests
npm test -- --headed       # Visual mode
npm test -- map.spec.js    # Run specific test
```

## Troubleshooting

**Hugo server won't start?**
- Check Hugo version: `hugo version` (need v0.112.0+)
- Try: `hugo server -s hugo/site --bind 127.0.0.1`

**CLI build fails?**
- Ensure Go 1.21+: `go version`
- Run from repository root: `go mod tidy -C cli/worldanthem`

**Tests fail?**
- Ensure Hugo server is running: `hugo server -s hugo/site -D`
- Check port 1313 is available
- Run: `npx playwright install chromium`

**Database issues?**
- Check: `~/.local/share/anthemworld/data.db`
- Delete and rebuild: `rm ~/.local/share/anthemworld/data.db`
- Run: `./bin/worldanthem status` to recreate

## Need Help?

1. Check CONTRIBUTING.md for detailed guides
2. Review IMPLEMENTATION_SUMMARY.md for architecture
3. See docs/research.md for data sources
4. Look at existing code and tests for examples

## What's Working Now?

✅ Hugo site with 3 pages (home, map, countries)
✅ Interactive map with Leaflet + OpenStreetMap  
✅ Searchable/sortable countries table with DataTables
✅ QR code generation on all pages
✅ Go CLI with SQLite database
✅ Database auto-creation with schema
✅ Status commands (overall, data, jobs)
✅ Comprehensive test suite
✅ Full documentation

## What's Next?

⏳ Data download implementation (CLI)
⏳ JSON export from database  
⏳ Load full 193 countries on website
⏳ Audio playback functionality
⏳ Country detail pages
⏳ Advanced search and filtering

See TODO.md for the complete roadmap!

---

**Built:** 2026-02-14  
**Status:** MVP Complete ✅  
**Ready for:** Data integration & feature enhancement

Happy exploring! 🌍🎵
