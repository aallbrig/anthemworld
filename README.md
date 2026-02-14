# Anthem World 🌍🎵

An interactive web application showcasing the national anthems of all 193 UN-recognized countries through an interactive world map.

## Features

- 🗺️ **Interactive World Map**: Click on any country to view its information
- 🎵 **National Anthems**: Listen to each country's national anthem
- 📊 **Searchable Table**: Browse and search all countries and their anthems
- 📱 **QR Code Sharing**: Generate QR codes for easy page sharing
- 🔍 **Data Management CLI**: Powerful command-line tool for data discovery and management

## Quick Start

### View the Website

1. Install Hugo (extended version):
   ```bash
   # On Linux
   sudo apt install hugo
   ```

2. Run the development server from repository root:
   ```bash
   hugo server -s hugo/site -D
   ```

3. Open http://localhost:1313 in your browser

### Use the CLI

1. Install Go 1.21+:
   ```bash
   # On Linux
   sudo apt install golang
   ```

2. Build the CLI from repository root:
   ```bash
   go build -o bin/worldanthem ./cli/worldanthem
   ```

3. Run commands:
   ```bash
   ./bin/worldanthem --help
   ./bin/worldanthem status
   ./bin/worldanthem data discover
   ```

## Project Structure

```
anthemworld/
├── .github/              # GitHub configuration
├── bin/                  # Built binaries (gitignored)
├── hugo/site/            # Hugo static site
│   ├── content/          # Content files
│   ├── layouts/          # Hugo templates
│   ├── static/           # Static assets (CSS, JS, images)
│   └── data/             # Data files
├── cli/worldanthem/      # Go CLI application
│   ├── cmd/              # CLI commands
│   ├── pkg/              # Packages (db, jobs, sources)
│   └── main.go           # Entry point
├── data/schema/          # Database schema files
├── tests/playwright/     # End-to-end tests
└── docs/                 # Documentation
```

## CLI Commands

### Status Commands
```bash
# Overall status
worldanthem status

# Data status
worldanthem data status

# Jobs status
worldanthem jobs status
```

### Data Management
```bash
# Discover data sources
worldanthem data discover

# Check data source health
worldanthem data sources

# Download data (TODO)
worldanthem data download

# Format data to JSON
worldanthem data format --output ./output --format json
```

### Database
The CLI stores data in: `~/.local/share/anthemworld/data.db`

Database includes:
- Country information (193 countries)
- National anthem metadata
- Audio file references
- Job execution history
- Data source health status

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development instructions.

### Run Tests

From repository root:

```bash
# CLI tests
go test ./cli/worldanthem/... -v

# Playwright tests
cd tests/playwright
npm install
npm test
```

### Data Sources

The project uses multiple open data sources:
- **REST Countries API** - Country list and basic data
- **Wikidata SPARQL** - Anthem metadata and dates
- **Wikimedia Commons** - Audio recordings

See [docs/research.md](docs/research.md) for detailed information about data sources and architecture.

## Technology Stack

- **Frontend**: Hugo (static site generator), Bootstrap 5, Leaflet.js
- **CLI**: Go 1.21+, SQLite
- **Testing**: Playwright
- **Data**: GeoJSON, JSON, SQLite

## License

TBD

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Roadmap

See [TODO.md](TODO.md) for planned features and improvements.
