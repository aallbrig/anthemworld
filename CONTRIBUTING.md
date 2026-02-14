# Contributing to Anthem World

Thank you for your interest in contributing to Anthem World! This document provides guidelines and instructions for development.

## Development Setup

### Prerequisites

- **Hugo** (extended version 0.112.0+)
- **Go** 1.21+
- **Node.js** 18+ and npm (for Playwright tests)
- **Git**

### Initial Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd anthemworld
   ```

2. Install Hugo:
   ```bash
   # Linux
   sudo apt install hugo
   
   # macOS
   brew install hugo
   
   # Verify installation
   hugo version
   ```

3. Install Go:
   ```bash
   # Linux
   sudo apt install golang
   
   # macOS
   brew install go
   
   # Verify installation
   go version
   ```

4. Install Node.js and Playwright dependencies:
   ```bash
   cd tests/playwright
   npm install
   npx playwright install
   cd ../..
   ```

## Hugo Site Development

### Running the Development Server

From the repository root:

```bash
hugo server -s hugo/site -D --bind 0.0.0.0
```

The site will be available at http://localhost:1313

Options:
- `-s hugo/site`: Specify source directory
- `-D` or `--buildDrafts`: Include draft content
- `--bind 0.0.0.0`: Allow external connections
- `--disableFastRender`: Full rebuild on changes

### Building for Production

From the repository root:

```bash
hugo -s hugo/site
```

Output will be in `hugo/site/public/`

### Hugo Directory Structure

```
hugo/site/
├── archetypes/       # Content templates
├── content/          # Markdown content files
│   ├── _index.md     # Homepage
│   ├── map.md        # Map page
│   └── countries.md  # Countries table page
├── layouts/          # HTML templates
│   ├── _default/     # Default templates
│   │   ├── baseof.html    # Base template
│   │   ├── list.html      # List template
│   │   └── single.html    # Single page template
│   ├── partials/     # Reusable components
│   │   ├── header.html
│   │   ├── footer.html
│   │   ├── nav.html
│   │   └── qrcode.html
│   └── shortcodes/   # Custom shortcodes
├── static/           # Static files
│   ├── css/
│   ├── js/
│   │   ├── map.js
│   │   ├── countries-table.js
│   │   └── qrcode-widget.js
│   └── data/
│       └── countries.geojson
├── data/             # Data files (YAML/JSON/TOML)
└── config.toml       # Hugo configuration
```

### Adding Pages

From the repository root:

1. Create content file:
   ```bash
   hugo new mypage.md -s hugo/site
   ```

2. Edit the front matter and content:
   ```markdown
   ---
   title: "My Page"
   date: 2026-02-14
   draft: false
   ---
   
   Page content here...
   ```

3. The page will be available at `/mypage/`

### Working with Templates

Hugo uses Go templates. Key concepts:

- **Base template** (`baseof.html`): Defines overall structure
- **Blocks**: Can be overridden by specific templates
- **Partials**: Reusable components included with `{{ partial "name.html" . }}`
- **Variables**: Access with `{{ .Var }}`
- **Context**: `.` represents current context, pass with `{{ partial "name.html" . }}`

Example template:
```html
{{ define "main" }}
  <h1>{{ .Title }}</h1>
  <div>{{ .Content }}</div>
{{ end }}
```

### Bootstrap Integration

Bootstrap 5 is loaded via CDN in the base template. Use Bootstrap classes directly:

```html
<div class="container">
  <div class="row">
    <div class="col-md-6">
      Content
    </div>
  </div>
</div>
```

### Map Widget Development

The map uses Leaflet.js with OpenStreetMap tiles.

**Location**: `static/js/map.js`

Key functions:
- `initMap()`: Initialize the map
- `loadCountries()`: Load GeoJSON country boundaries
- `onCountryClick(e)`: Handle country click events

To modify map behavior:
1. Edit `static/js/map.js`
2. Update GeoJSON data in `static/data/countries.geojson` if needed
3. Test clicking countries to ensure popups work

### Countries Table Development

The table uses DataTables for search/filter functionality.

**Location**: `static/js/countries-table.js`

Features:
- Client-side search
- Sortable columns
- Responsive design
- Audio player widgets

### QR Code Widget

The QR code widget dynamically generates codes for the current page.

**Location**: `static/js/qrcode-widget.js`

Uses the `qrcode.js` library loaded via CDN.

## CLI Development

### Building the CLI

From the repository root:

```bash
go build -o bin/worldanthem ./cli/worldanthem
```

The binary will be created at `./bin/worldanthem`

For development with live reload:
```bash
go run ./cli/worldanthem/main.go [command]
```

Example commands:
```bash
# Build to bin/
go build -o bin/worldanthem ./cli/worldanthem

# Run directly
go run ./cli/worldanthem/main.go status
go run ./cli/worldanthem/main.go data status

# Or use the built binary
./bin/worldanthem status
```

### Project Structure

```
cli/worldanthem/
├── main.go           # Entry point, command setup
├── cmd/              # Command implementations
│   ├── status.go
│   ├── data.go
│   └── jobs.go
├── pkg/              # Packages
│   ├── db/           # Database operations
│   │   ├── db.go
│   │   ├── schema.go
│   │   └── migrations.go
│   ├── jobs/         # Job system
│   │   ├── worker.go
│   │   ├── queue.go
│   │   └── types.go
│   ├── sources/      # Data source clients
│   │   ├── restcountries.go
│   │   ├── wikidata.go
│   │   └── wikimedia.go
│   └── config/       # Configuration
│       └── config.go
├── go.mod
└── go.sum
```

### Adding a New Command

1. Create command file in `cli/worldanthem/cmd/`:
   ```go
   package cmd
   
   import (
       "github.com/spf13/cobra"
   )
   
   var myCmd = &cobra.Command{
       Use:   "mycommand",
       Short: "Short description",
       Long:  "Long description",
       Run: func(cmd *cobra.Command, args []string) {
           // Implementation
       },
   }
   
   func init() {
       rootCmd.AddCommand(myCmd)
   }
   ```

2. Register in `main.go` if not using `init()`

3. Build and test from repository root:
   ```bash
   go build -o bin/worldanthem ./cli/worldanthem
   ./bin/worldanthem mycommand --help
   ```

### Database Operations

The CLI uses SQLite with the `mattn/go-sqlite3` driver.

**Database path**: `~/.local/share/anthemworld/data.db`

Example query:
```go
import "database/sql"

func getCountries(db *sql.DB) ([]Country, error) {
    rows, err := db.Query("SELECT id, name FROM countries")
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var countries []Country
    for rows.Next() {
        var c Country
        if err := rows.Scan(&c.ID, &c.Name); err != nil {
            return nil, err
        }
        countries = append(countries, c)
    }
    return countries, rows.Err()
}
```

### Schema Migrations

Schema files are in `/data/schema/`. The CLI applies migrations automatically on first run.

To add a migration:
1. Create `001_initial.sql`, `002_add_column.sql`, etc.
2. Update `pkg/db/migrations.go` to apply new migrations
3. Track version in `schema_version` table

### Testing the CLI

From the repository root:

```bash
go test ./cli/worldanthem/...
```

For verbose output:
```bash
go test ./cli/worldanthem/... -v
```

Run specific package tests:
```bash
go test ./cli/worldanthem/pkg/db/... -v
```

Write tests alongside code:
```go
// myfile_test.go
package mypackage

import "testing"

func TestMyFunction(t *testing.T) {
    result := MyFunction()
    if result != expected {
        t.Errorf("got %v, want %v", result, expected)
    }
}
```

## Playwright Tests

### Running Tests

From the repository root:

```bash
cd tests/playwright
npm test                    # Run all tests
npm test -- --headed        # Run with browser visible
npm test -- --debug         # Debug mode
npm test -- map.spec.js     # Run specific test
```

### Test Structure

```
tests/playwright/
├── tests/
│   ├── basic.spec.js         # Basic page tests
│   ├── map.spec.js           # Map widget tests
│   ├── countries.spec.js     # Countries table tests
│   └── performance.spec.js   # Performance tests
├── playwright.config.js      # Playwright configuration
└── package.json
```

### Writing Tests

Example test:
```javascript
const { test, expect } = require('@playwright/test');

test('homepage loads successfully', async ({ page }) => {
  await page.goto('http://localhost:1313');
  await expect(page).toHaveTitle(/Anthem World/);
  
  // Check for no console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  
  expect(errors).toHaveLength(0);
});
```

### Test Requirements

All pages must:
- Load in under 2 seconds
- Have no console errors
- Have no failing XHR/fetch requests
- Be accessible (WCAG AA)

## Code Style

### Go Style Guide

- Use `gofmt` for formatting (run automatically by most editors)
- Follow [Effective Go](https://golang.org/doc/effective_go.html)
- Use meaningful variable names (`country` not `c`)
- Keep functions short and focused
- Add godoc comments for exported symbols:
  ```go
  // GetCountry retrieves a country by ID from the database.
  func GetCountry(db *sql.DB, id string) (*Country, error) {
      // ...
  }
  ```

### JavaScript Style Guide

- Use ES6+ syntax
- Prefer `const` over `let`, never use `var`
- Use template literals: `` `Hello ${name}` ``
- Use arrow functions for callbacks
- Add JSDoc comments for complex functions:
  ```javascript
  /**
   * Initialize the map with country boundaries
   * @param {string} containerId - DOM element ID
   * @returns {L.Map} Leaflet map instance
   */
  function initMap(containerId) {
      // ...
  }
  ```

### SQL Style Guide

- Use lowercase keywords
- Use snake_case for identifiers
- Include indexes for foreign keys
- Add comments for complex queries:
  ```sql
  -- Get countries with no anthem data
  select c.id, c.name
  from countries c
  left join anthems a on c.id = a.country_id
  where a.id is null;
  ```

## Git Workflow

### Commit Messages

Use semantic commit messages:
- `feat: add country search functionality`
- `fix: correct map popup positioning`
- `docs: update CLI usage examples`
- `test: add map widget interaction tests`
- `refactor: simplify data source health checks`
- `chore: update dependencies`

### Branch Strategy

- `main`: Production-ready code
- `develop`: Integration branch
- `feature/name`: New features
- `fix/name`: Bug fixes

## Common Tasks

### Adding a New Country Data Field

1. Update database schema in `/data/schema/`
2. Add migration in CLI (`cli/worldanthem/pkg/db/`)
3. Update Go structs in `cli/worldanthem/pkg/db/`
4. Update JSON schema in data format command
5. Update Hugo templates to display field
6. Update tests

### Adding a New Data Source

1. Research the API (add to `/docs/research.md`)
2. Create client in `cli/worldanthem/pkg/sources/`
3. Add to data sources table initialization
4. Implement health check
5. Add to job system
6. Update documentation

### Updating Hugo Theme

1. Modify templates in `hugo/site/layouts/`
2. Update CSS in `hugo/site/static/css/`
3. Test on multiple screen sizes
4. Run accessibility checks
5. Update documentation if needed

### Building Everything

From repository root:

```bash
# Build CLI
go build -o bin/worldanthem ./cli/worldanthem

# Build Hugo site
hugo -s hugo/site

# Run tests
go test ./cli/worldanthem/... -v
cd tests/playwright && npm test
```

## Getting Help

- Review documentation in `/docs/`
- Check existing tests for examples
- Look at similar implementations in the codebase
- Open an issue for questions or bugs

## Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes
3. Run tests: `go test ./...` and `npm test`
4. Update documentation if needed
5. Commit with semantic messages
6. Push and create a pull request
7. Address review feedback

## Questions?

Open an issue or discussion on GitHub for any questions!
