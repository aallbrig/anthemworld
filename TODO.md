# TODO List

## High Priority

- [ ] Implement `data download` command in CLI to fetch data from all sources
- [ ] Implement `data format` command to export SQLite → JSON for frontend
- [ ] Download GeoJSON country boundaries (datasets/geo-countries or Natural Earth Data)
- [ ] Create data-loader.js for merging GeoJSON + CLI JSON files
- [ ] Load GeoJSON on map for clickable country polygons (replace sample markers)
- [ ] Build popup with graceful fallback (works before and after anthem data available)
- [ ] Add native country names to country data
- [ ] Customize OpenStreetMap tiles to show only country names (investigate Stamen, MapBox, or custom tiles)
- [ ] Add audio file URL to map popup widget when clicking countries
- [ ] Implement efficient index.json loading strategy to reduce initial page load
- [ ] Add page to list countries in searchable table with DataTables
- [ ] Create job resumption functionality for failed downloads
- [ ] Implement rate limiting per data source in CLI

## Features

### Game Feature (Hot or Not for Anthems)
- [ ] Create game page at `/game` with dual anthem players
- [ ] Implement 5-second minimum listen requirement before voting
- [ ] Create leaderboard page at `/leaderboard` with rankings
- [ ] Design and implement ELO ranking system
- [ ] Track user country via IP geolocation
- [ ] Set up AWS SAM infrastructure in `./sam/game/`
- [ ] Set up AWS SAM infrastructure in `./sam/leaderboard/`
- [ ] Create DynamoDB tables (rankings, votes, sessions, matchup history)
- [ ] Implement Lambda functions (session, matchup, vote)
- [ ] Create API Gateway endpoints
- [ ] Build game frontend with audio controls
- [ ] Build leaderboard frontend with real-time updates
- [ ] Add vote analytics and insights
- [ ] Implement matchmaking algorithm (similar ELO scores)
- [ ] Add privacy features (IP hashing, session expiry)
- [ ] Create game analytics dashboard
- [ ] Add social sharing features
- [ ] Implement user sessions and tracking
- [ ] Add detailed country stats pages from game data
- [ ] See `docs/game.md` for complete feature specification

## Features

### Data Management
- [ ] Implement `data download` command - fetch from REST Countries, Wikidata, Wikimedia Commons
- [ ] Implement `data format` command - export SQLite to JSON files for frontend
- [ ] Generate anthems.json (anthem metadata indexed by ISO country code)
- [ ] Generate audio.json (audio file URLs indexed by audio ID)
- [ ] Generate countries-metadata.json (extended country info indexed by ISO code)
- [ ] Generate index.json (data manifest with metadata and stats)
- [ ] Add data validation checks before formatting to JSON
- [ ] Implement CLI output directory flag: `--output hugo/site/static/data`
- [ ] Add `data refresh` command to update existing data
- [ ] Implement incremental updates (only fetch changed data)
- [ ] Create cache system for API responses
- [ ] Add `data clean` command to remove old/invalid data
- [ ] Support for multiple audio recordings per anthem (instrumental, vocal, historical)

### Map Features
- [ ] Download and integrate GeoJSON country boundaries (datasets/geo-countries)
- [ ] Replace sample markers with clickable country polygons
- [ ] Create data-loader.js to handle multiple data sources (GeoJSON + CLI JSON files)
- [ ] Implement data merging by ISO 3166-1 alpha-3 country codes
- [ ] Build popup rendering with graceful fallback when anthem data not available
- [ ] Implement country highlighting on hover
- [ ] Add country names in native language (from CLI-generated metadata)
- [ ] Add audio player widget to popup (when audio.json available)
- [ ] Display anthem metadata in popup (name, composer, adoption date)
- [ ] Optimize map tile loading for country-name-only view
- [ ] Add map filtering (by region, by date, etc.)
- [ ] Create custom map style focusing on countries
- [ ] Add zoom restrictions to prevent over-zooming
- [ ] Implement smooth pan animations between countries
- [ ] Add "fly to country" feature from search
- [ ] Add loading spinner while data loads
- [ ] Add error handling for failed data loads

### Game & Leaderboard (NEW)
- [ ] Design game UI mockups
- [ ] Set up AWS SAM project structure
- [ ] Create Lambda functions for game logic
- [ ] Implement ELO ranking algorithm
- [ ] Build DynamoDB schema
- [ ] Create API endpoints (matchup, vote, leaderboard)
- [ ] Implement IP geolocation service
- [ ] Build game frontend with audio controls
- [ ] Add 5-second listen timer
- [ ] Create voting interface
- [ ] Build leaderboard display
- [ ] Add real-time ranking updates
- [ ] Implement session management
- [ ] Add analytics tracking
- [ ] Create stats visualization
- [ ] Add social sharing
- [ ] Implement privacy controls
- [ ] Deploy to AWS
- [ ] Set up CloudFront CDN
- [ ] Configure monitoring and alerts

### CLI Enhancements
- [ ] Add `jobs resume <job_id>` command
- [ ] Add `jobs cancel <job_id>` command
- [ ] Implement progress bars for long-running operations
- [ ] Add `config` command to manage CLI settings
- [ ] Create `data export` command for different formats (CSV, Excel)
- [ ] Add `data stats` command for detailed statistics
- [ ] Implement `data backup` and `data restore` commands
- [ ] Add shell completion (bash, zsh, fish)

### Testing
- [ ] Add unit tests for all CLI commands
- [ ] Increase Playwright test coverage to 90%+
- [ ] Add visual regression tests for map and table
- [ ] Test on multiple browsers (Chrome, Firefox, Safari)
- [ ] Add mobile responsiveness tests
- [ ] Create load tests for concurrent CLI operations
- [ ] Add integration tests for data source APIs

## Technical Debt

- [ ] Optimize GeoJSON file size (simplify polygons)
- [ ] Add compression for JSON data files
- [ ] Implement lazy loading for country data
- [ ] Add caching headers for static assets
- [ ] Optimize database queries with proper indexes
- [ ] Add database connection pooling in CLI
- [ ] Refactor job system to use interfaces for testability
- [ ] Add structured logging throughout CLI
- [ ] Implement proper error types instead of string errors

## Documentation

- [ ] Add architecture diagram to docs
- [ ] Create video tutorial for using the website
- [ ] Write CLI command reference documentation
- [ ] Add API documentation for data sources
- [ ] Create contributor guide with examples
- [ ] Document deployment process
- [ ] Add troubleshooting guide
- [ ] Create FAQ section

## Data Quality

- [ ] Verify all 193 countries have complete data
- [ ] Add data quality scoring system
- [ ] Implement data completeness dashboard
- [ ] Create data validation rules
- [ ] Add automated data quality tests
- [ ] Handle countries with multiple anthems
- [ ] Add historical anthem versions
- [ ] Include unofficial/regional anthems

## DevOps

- [ ] Set up CI/CD pipeline
- [ ] Add automated testing on pull requests
- [ ] Configure automated deployments
- [ ] Set up monitoring and alerting
- [ ] Add performance monitoring
- [ ] Implement automated backups
- [ ] Create Docker containers for easy deployment
- [ ] Add Kubernetes manifests

## Accessibility

- [ ] Add ARIA labels to all interactive elements
- [ ] Ensure keyboard navigation works throughout site
- [ ] Test with screen readers (NVDA, JAWS)
- [ ] Add high contrast mode
- [ ] Ensure all images have alt text
- [ ] Test color contrast ratios (WCAG AA)
- [ ] Add skip navigation links
- [ ] Ensure focus indicators are visible

## Performance

- [ ] Add service worker for offline support
- [ ] Implement CDN for static assets
- [ ] Optimize images (WebP format, lazy loading)
- [ ] Add resource hints (preconnect, prefetch)
- [ ] Minimize CSS and JavaScript
- [ ] Implement code splitting for large JS files
- [ ] Add loading skeletons for better perceived performance
- [ ] Optimize Hugo build time

## Security

- [ ] Add Content Security Policy headers
- [ ] Implement Subresource Integrity for CDN resources
- [ ] Add rate limiting to prevent abuse
- [ ] Sanitize all user inputs
- [ ] Add security headers (HSTS, X-Frame-Options, etc.)
- [ ] Regular security audits of dependencies
- [ ] Implement API key rotation for data sources
- [ ] Add CAPTCHA for any form submissions

## Future Ideas

- [ ] Mobile app (React Native or Flutter)
- [ ] API for third-party integrations
- [ ] User accounts and favorites
- [ ] Community contributions (user-submitted recordings)
- [ ] Anthem lyrics display with synchronized highlighting
- [ ] Historical facts about each anthem
- [ ] Quiz/game mode to learn anthems
- [ ] Spotify/Apple Music integration
- [ ] Educational resources for schools
- [ ] Print-friendly country fact sheets

## Known Issues

- [ ] None yet (this is a new project!)

## Completed

- [x] Create initial project structure
- [x] Set up Hugo site
- [x] Create CLI framework
- [x] Add database schema
- [x] Set up Playwright tests
- [x] Create documentation structure
- [x] Add .gitignore files for Hugo, Go, Node.js
- [x] Create README.md with project overview
- [x] Create CONTRIBUTING.md with developer instructions  
- [x] Create .github/copilot-instructions.md
- [x] Initialize Hugo site in hugo/site directory
- [x] Add Bootstrap 5 via CDN
- [x] Create navigation bar component
- [x] Create footer component with dynamic current page link
- [x] Integrate Leaflet map widget with OpenStreetMap
- [x] Add map click handlers for countries
- [x] Add popup widget displaying country name
- [x] Create countries table page with DataTables
- [x] Add search/filter functionality to table
- [x] Set up Go CLI project structure
- [x] Implement SQLite database with OS-specific path
- [x] Create database schema in data/schema/
- [x] Implement data discover subcommand (placeholder)
- [x] Implement data status subcommand
- [x] Implement data format subcommand (placeholder)
- [x] Implement jobs status subcommand
- [x] Implement top-level status subcommand
- [x] Add --help documentation for all CLI commands
- [x] Write CLI unit tests
- [x] Set up Playwright test structure
- [x] Add test: no console errors on any page
- [x] Add test: pages load under 2 seconds
- [x] Add test: no failing XHR requests
- [x] Add test: map widget interaction works
- [x] Configure Playwright test runner
- [x] Document Hugo setup in CONTRIBUTING.md
- [x] Document CLI usage in README.md
- [x] Document Playwright test execution
- [x] Add QR code widget implementation
- [x] Create docs/research.md with data sources
- [x] Design JSON schema for data download
- [x] Design parallelized job system architecture
- [x] Document data source health check requirements

### Map Data Integration
- [ ] Download GeoJSON from datasets/geo-countries
- [ ] Process and add native country names to GeoJSON
- [ ] Optimize GeoJSON file size for web delivery
- [ ] Implement GeoJSON loading in map.js
- [ ] Test click handlers on country polygons
- [ ] Add country boundary styling (borders, fill)
- [ ] Implement country search functionality
- [ ] Add minimap for navigation

### OpenStreetMap Customization
- [ ] Research tile providers with minimal detail
- [ ] Test Stamen.TonerLite for minimalist view
- [ ] Evaluate MapBox custom styles (requires API key)
- [ ] Test Thunderforest.Transport tiles
- [ ] Implement CSS filters to reduce map noise
- [ ] Add toggle between detailed and simple map views
- [ ] Configure tile caching for performance
- [ ] Add fallback tile sources

### Game Feature - Phase 1 (MVP)
- [ ] Set up AWS account and SAM CLI
- [ ] Create sam/game/ directory structure
- [ ] Create sam/leaderboard/ directory structure
- [ ] Write CloudFormation templates
- [ ] Implement session Lambda function
- [ ] Implement matchup Lambda function
- [ ] Implement vote Lambda function
- [ ] Create DynamoDB tables with proper indexes
- [ ] Set up API Gateway with CORS
- [ ] Test Lambda functions locally with sam local
- [ ] Deploy to AWS dev environment

### Game Feature - Phase 2 (Frontend)
- [ ] Create hugo/site/content/game.md page
- [ ] Build dual audio player interface
- [ ] Implement 5-second listen timer
- [ ] Add vote button with disabled state
- [ ] Create country information cards
- [ ] Add loading states and animations
- [ ] Implement error handling
- [ ] Add session persistence
- [ ] Test audio playback across browsers
- [ ] Optimize for mobile devices

### Game Feature - Phase 3 (Leaderboard)
- [ ] Create hugo/site/content/leaderboard.md page
- [ ] Build leaderboard table component
- [ ] Add real-time ranking updates
- [ ] Implement search and filtering
- [ ] Add detailed country stats modal
- [ ] Create ELO history graphs
- [ ] Add global statistics dashboard
- [ ] Implement pagination for rankings
- [ ] Add export functionality (CSV/JSON)
- [ ] Create embeddable leaderboard widget

### Game Feature - Phase 4 (Analytics)
- [ ] Set up CloudWatch dashboards
- [ ] Track vote patterns and trends
- [ ] Analyze geographic preferences
- [ ] Create admin analytics interface
- [ ] Implement A/B testing framework
- [ ] Add user engagement metrics
- [ ] Create reports for insights
- [ ] Set up automated email reports
- [ ] Add anomaly detection for voting patterns
- [ ] Create public statistics page

### Game Feature - Phase 5 (Enhancements)
- [ ] Add user accounts (optional)
- [ ] Implement achievement system
- [ ] Create daily challenges
- [ ] Add tournament mode
- [ ] Implement social sharing
- [ ] Add anthem playlist generation
- [ ] Create mobile app (React Native)
- [ ] Add push notifications
- [ ] Implement referral system
- [ ] Add regional leaderboards
