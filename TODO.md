# TODO List

## Project Status: ~60% Complete
Data collection complete. Frontend integrated with live data. Game feature is the next major milestone.

---

## ✅ Completed

### Phase 1: Core Infrastructure (100%)
- [x] Hugo site with Bootstrap 5, navigation, footer
- [x] Leaflet.js interactive map with clickable GeoJSON country polygons
- [x] Countries table page with DataTables (search/filter/sort)
- [x] Go CLI with SQLite database (OS-specific paths)
- [x] Database schema with migrations
- [x] QR code widget on all pages
- [x] Playwright tests (console errors, load time, map interaction)

### Phase 2: Data Collection (100%)
- [x] DataSource interface and job tracking system
- [x] GeoJSON Country Boundaries source (177 countries with geometry)
- [x] REST Countries API source (192 UN members, names/capitals/regions)
- [x] Wikidata SPARQL source (192 anthems: name, composer, lyricist, date)
- [x] Wikimedia Commons source (565 audio recordings, resumable)
- [x] CIA World Factbook source (233 countries: anthem history, symbols, colors, flags)
- [x] `data download [source-id...]` — filter by source, resumable
- [x] `data format --output` — exports anthems.json + index.json
- [x] `data sources` health checks and schema management
- [x] `--version` flag with git commit, build date, Go version
- [x] `Makefile` with `make build` / `make install`
- [x] Database: 239 countries, 192 anthems, 565 audio files, 170 with history

### Phase 3: Frontend Integration (100%)
- [x] Map popups load real anthem data from anthems.json
- [x] Map popups show: flag, anthem name + English translation, composer, adopted year, history snippet, audio player
- [x] Countries table loads live data (239 rows, not sample data)
- [x] Countries table: flag, anthem name, English translation, composer, region, audio player
- [x] Global audio controller — only one anthem plays at a time
- [x] Graceful fallback when data files missing (with CLI instructions)

---

## 🚧 Next: Phase 4 — Game Backend

**Goal**: Build "Hot or Not" anthem ranking game with SAM/Lambda/DynamoDB + LocalStack for local dev.
**See `docs/game.md` for full specification.**

### Infrastructure Setup
- [ ] Create `sam/` directory structure (`sam/game/`, `sam/leaderboard/`)
- [ ] `template.yaml` — CloudFormation for Lambda + API Gateway + DynamoDB
- [ ] LocalStack setup: `docker-compose.yml` + init scripts for local DynamoDB tables
- [ ] `sam local start-api` verified working at `http://localhost:3001`

### DynamoDB Tables
- [ ] `anthem-rankings` — ELO scores (country_id, elo_score, wins, losses)
- [ ] `vote-history` — votes with session, winner, loser, listen durations
- [ ] `sessions` — anonymous sessions with IP country detection
- [ ] `session-listen-history` — per-anthem cumulative listen time

### Lambda Functions
- [ ] `POST /session` — create anonymous session, detect IP country
- [ ] `GET /matchup` — ELO-based pair selection, return listen history
- [ ] `POST /vote` — validate listen requirements, update ELO, return next matchup
- [ ] `GET /leaderboard` — paginated ranked country list

### Rate Limiting & Validation
- [ ] 5s minimum listen per new anthem (3s is acceptable per game.md)
- [ ] 100 votes/session/day max
- [ ] 5 sessions/IP/day max
- [ ] One active matchup per session at a time

---

## 📋 Phase 5: Game Frontend

- [ ] `CountryHighlightMap` component (`js/country-map.js`) — `flyToCountry(iso)`, `highlightCountry()`
- [ ] `/game` page with dual map widgets, dual audio players, vote buttons
- [ ] Progress bars showing listen time (0 → 3s requirement)
- [ ] Smart client-side logic: server listen history determines if voting is immediate
- [ ] `/leaderboard` page — real-time ELO rankings with region filter
- [ ] Wire to `http://localhost:3001/api` in dev, production URL in prod

---

## 📋 Phase 6: Polish & Production

- [ ] Shell completions (bash, zsh, fish) via `worldanthem completion`
- [ ] `data stats` command for detailed completeness report
- [ ] Accessibility audit (ARIA labels, keyboard nav, WCAG AA)
- [ ] Service worker for offline support
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production deployment documentation

---

## Known Issues / Technical Debt

- [ ] Some Wikidata composer/lyricist fields are raw QIDs (e.g. `Q342580`) — need label resolution pass
- [ ] Wikimedia search sometimes returns false positives (wrong anthem for country)
- [ ] GeoJSON only covers 177/193 UN countries — 16 missing boundaries
- [ ] `cmd/data.go` has pre-existing vet warnings (redundant newlines, non-constant fmt.Errorf)
- [ ] Firefox Playwright tests fail due to livereload WebSocket 101 status (pre-existing, not a real bug)


### Phase 4: Game Feature (0% Complete)
**See docs/game.md for complete specification**

#### Game Core (MVP)
- [ ] Set up AWS SAM project in `./sam/game/`
- [ ] Set up LocalStack for local development
- [ ] Design game UI mockups
- [ ] Create game page at `/game`
- [ ] Build dual anthem player interface with waveform visualization
- [ ] Implement smart listen requirements (3-4s for new, instant for heard)
- [ ] Create voting interface with satisfying animations
- [ ] Implement session management (anonymous)

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

#### Backend (AWS Lambda + DynamoDB)
- [ ] Implement ELO ranking algorithm
- [ ] Create Lambda: GET /api/game/session (create anonymous session)
- [ ] Create Lambda: GET /api/game/matchup (return two similar-ELO anthems)
- [ ] Create Lambda: POST /api/game/vote (record vote, update ELO)
- [ ] Create DynamoDB tables: anthem_rankings, vote_history, sessions, matchup_history
- [ ] Implement matchmaking logic (standard + wildcard rounds)
- [ ] Add IP geolocation for user country detection
- [ ] Implement rate limiting per session
- [ ] Add validation (listen time, vote limits)

#### Leaderboard
- [ ] Create leaderboard page at `/leaderboard`
- [ ] Implement Lambda: GET /api/leaderboard (ranked list)
- [ ] Implement Lambda: GET /api/leaderboard/country/{id} (detailed stats)
- [ ] Build leaderboard UI with real-time updates
- [ ] Add filtering by region, date range
- [ ] Display ELO history graphs
- [ ] Add global statistics dashboard
- [ ] Implement pagination

#### Game Enhancements (Make It Fun!)
- [ ] Add waveform visualization for audio preview
- [ ] Implement personal stats tracking (streak, favorites, impact score)
- [ ] Add end-of-session summary with shareable results
- [ ] Create voting badges & achievements
- [ ] Add matchup commentary with humor
- [ ] Implement wildcard rounds every 5-10 votes
- [ ] Add post-vote fun facts about anthems
- [ ] Create personal playlists (favorites, discoveries)
- [ ] Add regional battle modes
- [ ] Implement "Your country vs the world" stats

#### Testing & Deployment
- [ ] Test Lambda functions with sam local
- [ ] Test game flow with LocalStack
- [ ] Deploy to AWS dev environment
- [ ] Set up CloudWatch monitoring
- [ ] Configure CloudFront CDN
- [ ] Load testing with multiple concurrent sessions
- [ ] Security audit (rate limits, input validation)

**Success Criteria**: 10-20 rounds feel addictive, not tedious

---

## 🔮 Future Enhancements

### Data Quality
- [ ] Handle countries with multiple anthems
- [ ] Add historical anthem versions
- [ ] Include unofficial/regional anthems
- [ ] Add anthem lyrics with translations
- [ ] Verify all 193 countries have audio
- [ ] Add data quality scoring system
- [ ] Implement data validation rules

### Performance
- [ ] Add service worker for offline map
- [ ] Implement CDN for audio files
- [ ] Optimize audio file sizes (compression)
- [ ] Add lazy loading for country data
- [ ] Minimize and bundle CSS/JS
- [ ] Add loading skeletons
- [ ] Optimize Hugo build time

### Accessibility
- [ ] Add ARIA labels to all interactive elements
- [ ] Ensure keyboard navigation works
- [ ] Test with screen readers (NVDA, JAWS)
- [ ] Add high contrast mode
- [ ] Test color contrast ratios (WCAG AA)
- [ ] Add skip navigation links

### DevOps
- [ ] Set up CI/CD pipeline
- [ ] Add automated testing on PRs
- [ ] Configure automated deployments
- [ ] Set up monitoring and alerting
- [ ] Implement automated backups
- [ ] Create Docker containers

### Security
- [ ] Add Content Security Policy headers
- [ ] Implement Subresource Integrity for CDN
- [ ] Add security headers (HSTS, X-Frame-Options)
- [ ] Regular dependency security audits
- [ ] Add CAPTCHA for abuse prevention

---

## 🎯 Stretch Goals

- [ ] Mobile app (React Native)
- [ ] User accounts with saved favorites
- [ ] Daily challenges and tournaments
- [ ] Community-submitted recordings
- [ ] Spotify/Apple Music integration
- [ ] Educational resources for schools
- [ ] API for third-party integrations
- [ ] Multi-language support (i18n)
- [ ] Anthem quiz mode
- [ ] Print-friendly country fact sheets

---

## 📊 Data Improvements (Based on Feedback)

### Wikidata SPARQL
- [ ] Add filters to exclude historical countries
- [ ] Query for multi-language anthem names
- [ ] Get adoption event details
- [ ] Store raw SPARQL responses for caching

### GeoJSON Boundaries
- [ ] Switch to Natural Earth 1:50m for better quality
- [ ] Add WIKIDATAID property for linking
- [ ] Optimize polygon simplification
- [ ] Add ISO_A3 matching

### Wikimedia Commons
- [ ] Improve search to reduce rate limits
- [ ] Prioritize instrumental versions
- [ ] Add audio quality detection
- [ ] Store multiple recordings per country
- [ ] Add license verification

### Job System
- [ ] Add weighted rate limits per source
- [ ] Separate audio download as optional job
- [ ] Add ETag/Last-Modified for incremental updates
- [ ] Implement context timeouts per request

---

## 📝 Documentation

- [ ] Add architecture diagram
- [ ] Create video tutorial
- [ ] Write CLI command reference
- [ ] Add API documentation
- [ ] Create contributor guide with examples
- [ ] Document deployment process
- [ ] Add troubleshooting guide
- [ ] Create FAQ section

---

## 🐛 Known Issues

- Wikimedia Commons: Rate limited after ~50 countries (need longer delays)
- Some anthem composer/lyricist fields have Wikidata URLs instead of names
- REST Countries returns 250 countries (need to filter to 192 UN members)
- Audio recordings vary in quality/format

---

**Last Updated**: 2026-02-17
**Current Sprint**: Phase 2 completion → Phase 3 (Frontend Integration)
