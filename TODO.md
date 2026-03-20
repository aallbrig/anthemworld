# TODO List

## Project Status: ~85% Complete
Data pipeline complete. Full-stack game (SAM + Lambda + DynamoDB) working locally. Site has
bilingual content, interactive map, audio players, game, leaderboard, and profile pages.
Remaining work is polish, data quality improvements, and eventual production deployment.

---

## ✅ Completed

### Phase 1: Core Infrastructure (100%)
- [x] Hugo site with Bootstrap 5, navigation, footer, QR code widget
- [x] Leaflet.js interactive map with clickable GeoJSON country polygons
- [x] Countries table page with DataTables (search/filter/sort)
- [x] Go CLI with SQLite database (OS-specific paths)
- [x] Database schema with migrations (v1 + v2)
- [x] Playwright tests (console errors, load times, map interaction)

### Phase 2: Data Collection (100%)
- [x] DataSource interface and job tracking system
- [x] GeoJSON Country Boundaries source (177 countries with geometry)
- [x] REST Countries API source (192 UN members, names/capitals/regions)
- [x] Wikidata SPARQL source (192 anthems: name, composer, lyricist, date)
- [x] Wikimedia Commons source (196 audio recordings, resumable)
- [x] CIA World Factbook source (233 countries: anthem history, symbols, colors, flags)
- [x] `data download [source-id...]` — filter by source, resumable
- [x] `data format --output` — exports anthems.json + countries.geojson + index.json
- [x] `data sources` health checks and schema management
- [x] `--version` flag with git commit, build date, Go version
- [x] `Makefile` with `make build` / `make install`
- [x] Database: 239 countries, 192 anthems, 196 audio files, 170 with history

### Phase 3: Frontend Integration (100%)
- [x] Map popups load real anthem data from anthems.json
- [x] Map popups show: flag, anthem name + English translation, composer, adopted year, history snippet, audio player
- [x] Countries table loads live data (239 rows, not sample data)
- [x] Countries table: flag, anthem name, English translation, composer, region, audio player
- [x] Global audio controller — only one anthem plays at a time
- [x] Graceful fallback when data files missing (with CLI instructions)
- [x] Country detail pages — JS-hydrated from anthems.json, with static SEO body content

### Phase 4: Game Backend (100%)
- [x] SAM template with 4 Lambda functions + API Gateway + CORS
- [x] DynamoDB tables: rankings, votes, sessions, listen-history
- [x] LocalStack Docker setup for local DynamoDB emulation
- [x] `POST /session` — create anonymous session
- [x] `GET /matchup` — ELO-matched pair selection, listen history
- [x] `POST /vote` — validate listen, update ELO, return next matchup
- [x] `GET /leaderboard` — paginated ranked country list
- [x] Rate limiting: 5 sessions/IP, 100 votes/session
- [x] ELO algorithm (K=32, initial rating 1500)
- [x] `make dev` — one-command full local stack (LocalStack + SAM + Hugo)

### Phase 5: Game Frontend (100%)
- [x] `/game` page — dual map widgets, dual audio players, vote buttons
- [x] Progress bars showing listen time (0 → 3s requirement to unlock voting)
- [x] Animated vote feedback (CSS keyframe animations, confetti)
- [x] `CountryHighlightMap` — flyTo + highlight for matched countries
- [x] `/leaderboard` page — real-time ELO rankings
- [x] `/profile` page — local listening history and stats (localStorage)
- [x] `listen-progress.js` — browser-local progress tracking across sessions
- [x] Bilingual support (English + Spanish) with i18n

### Phase 6: Site Polish (partial)
- [x] Favicon (SVG + 32px PNG) added
- [x] 404 page layout
- [x] Open Graph + Twitter Card meta tags on all pages
- [x] Static SEO content generated for all 239 country detail pages
- [x] GeoJSON now properly exported by `data format` (reconstructed from DB)
- [x] `countries.geojson` listed in `index.json` manifest

---

## 🚧 Remaining Work

### Data Quality
- [ ] **Audio gaps**: 55 countries have no audio recordings — re-run Wikimedia download with
  longer delays to fill gaps (known: some small nations have no recordings on Commons)
- [ ] **GeoJSON gaps**: 27 UN countries missing from GeoJSON source (all small island nations:
  Andorra, Antigua & Barbuda, Bahrain, Barbados, Comoros, etc.) — consider Natural Earth
  1:50m or hand-sourcing these geometries
- [ ] Safari/iOS OGG compatibility — all 196 audio files are OGG/WAV; Safari requires MP3;
  consider adding MP3 fallbacks via `anthemworld data download wikimedia-commons --mp3`
- [ ] Game: validate rate limiting works end-to-end (5 sessions/IP, 100 votes/session)

### CLI Enhancements
- [ ] Shell completions (bash, zsh, fish) via `anthemworld completion`
- [ ] `data stats` command for detailed completeness report by source
- [ ] Progress bars for long-running download operations

### Documentation
- [ ] Architecture diagram (system overview)
- [ ] CLI command reference (man page style)
- [ ] Production deployment guide (AWS SAM deploy, Hugo hosting)

### Future / Nice-to-Have
- [ ] Service worker for offline map support
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Accessibility audit (WCAG AA)
- [ ] Content Security Policy headers + SRI hashes for CDN assets
- [ ] Handle countries with multiple/alternate anthems
- [ ] Anthem lyrics display

---

## 🐛 Known Issues

- **GeoJSON source** (johan/world.geo.json): missing 27 small UN member states
- **Wikimedia Commons**: rate limited after ~50 countries without delays; `data download`
  for Wikimedia is resumable — re-run if incomplete
- **LocalStack sessions**: TTL expiry not enforced locally — use `make dev-reset` to clear
  accumulated sessions between test runs
- **Firefox Playwright tests**: livereload WebSocket shows HTTP 101 in test output — this is
  not a real error (pre-existing, confirmed harmless)

---

**Last Updated**: 2026-03-20
**Current State**: Full local stack working. Map, game, leaderboard, and country pages complete.


---
