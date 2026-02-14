# GitHub Copilot Instructions

## Project Overview
Anthem World is a web application that displays an interactive world map with 193 UN-recognized countries. Users can click on countries to view and play their national anthems.

## Technology Stack
- **Frontend**: Hugo static site generator with Bootstrap 5
- **Map**: Leaflet.js with OpenStreetMap
- **CLI**: Go application with SQLite database
- **Testing**: Playwright for end-to-end tests

## Code Style Guidelines

### Go (CLI)
- Follow standard Go conventions and `gofmt` formatting
- Use meaningful variable names
- Add comments for exported functions and types
- Use context for cancellation and timeouts
- Handle errors explicitly, never ignore them
- Keep functions focused and modular

### JavaScript/Hugo
- Use ES6+ syntax
- Prefer `const` over `let`, avoid `var`
- Use template literals for string interpolation
- Comment complex logic
- Keep functions small and focused

### SQL
- Use snake_case for table and column names
- Include indexes for foreign keys
- Add timestamps (created_at, updated_at) to tables
- Use meaningful constraint names

## Project Structure
- `/hugo/site/` - Hugo static site
- `/cli/worldanthem/` - Go CLI application
- `/data/schema/` - Database schema files
- `/tests/playwright/` - Playwright tests
- `/docs/` - Documentation and research

## Development Workflow
1. Database changes should update schema files in `/data/schema/`
2. Run tests before committing changes
3. Update documentation when adding features
4. Use semantic commit messages

## Data Sources
- REST Countries API for country data
- Wikidata SPARQL for anthem metadata
- Wikimedia Commons for audio files
- See `/docs/research.md` for detailed information

## Common Tasks
- **Run Hugo dev server**: `cd hugo/site && hugo server -D`
- **Build CLI**: `cd cli/worldanthem && go build`
- **Run tests**: `cd tests/playwright && npm test`
- **Format code**: `gofmt -w .` (Go), `prettier --write .` (JS/HTML)

## Important Notes
- The CLI manages data in `~/.local/share/anthemworld/data.db`
- All data operations should be idempotent
- Rate limiting is enforced per data source
- Job system uses worker pools for parallelization
