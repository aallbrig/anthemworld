# Update: Map Improvements & Game Feature

## Changes Made

### 1. Enhanced Map Documentation

**Updated: `docs/research.md`**
- Added comprehensive section on Geographic Data Sources for country boundaries
- Documented three recommended GeoJSON sources:
  - **datasets/geo-countries** - Ready-to-use GeoJSON (easiest)
  - **Natural Earth Data** - Professional cartographic data (best quality)
  - **topojson/world-atlas** - Compact TopoJSON format (best performance)
- Included example implementation code for loading clickable country polygons
- Added details on file sizes and resolutions

### 2. Updated Map Implementation

**Updated: `hugo/site/static/js/map.js`**
- Added TODO comments for GeoJSON country boundaries implementation
- Added notes on OpenStreetMap tile customization options:
  - MapBox custom styles
  - Stamen.TonerLite (minimalist)
  - Thunderforest.Transport
  - Self-hosted tiles
  - CSS filters
- Enhanced `onEachFeature()` to support native country names
- Updated `onCountryClick()` to:
  - Display both English and native country names
  - Show anthem information in popup
  - Link to game feature
  - Handle multiple GeoJSON property name formats

**Updated: `hugo/site/static/css/style.css`**
- Added `.country-tooltip` styling for hover tooltips
- Added `.country-popup` styling for click popups
- Added `.native-name` styling for secondary language display

### 3. Game Feature Documentation

**Created: `sam/game/README.md`**
- Setup instructions for AWS SAM CLI
- Local development commands
- Deployment workflow
- API endpoint documentation
- Environment variable configuration

**Created: `sam/leaderboard/README.md`**
- Setup instructions for AWS SAM CLI
- Local development commands
- Deployment workflow
- API endpoint documentation
- Shared DynamoDB table configuration

**Updated: `.gitignore`**
- Added `.aws-sam/` directory
- Added `samconfig.toml` file

### 4. Comprehensive TODO Items

**Updated: `TODO.md`**
- Added "Game Feature (Hot or Not for Anthems)" section with 19 tasks
- Added "Map Data Integration" section with 8 tasks
- Added "OpenStreetMap Customization" section with 8 tasks
- Added "Map Features" section with 10 tasks
- Added "Game & Leaderboard" section with 20 tasks
- Added "Game Feature - Phase 1 (MVP)" section with 11 tasks
- Added "Game Feature - Phase 2 (Frontend)" section with 10 tasks
- Added "Game Feature - Phase 3 (Leaderboard)" section with 10 tasks
- Added "Game Feature - Phase 4 (Analytics)" section with 10 tasks
- Added "Game Feature - Phase 5 (Enhancements)" section with 10 tasks

Total new TODO items: **116 tasks added**

### 5. Implementation Guide

**Created: `IMPLEMENTATION_NOTES.md`**
- Detailed step-by-step guide for downloading and integrating GeoJSON
- Five options for OpenStreetMap customization with code examples
- Complete game architecture diagram
- Data flow documentation for game feature
- ELO calculation walkthrough with examples
- Development workflow for AWS SAM
- Lambda function code examples
- Cost optimization strategies
- Security best practices
- Next steps checklist

## Key Features Documented

### Clickable Country Boundaries

**What's Needed:**
- GeoJSON file with country polygon data (not just point coordinates)
- Implementation in map.js to load and render polygons
- Click handlers on entire country area (not just markers)

**How to Get Data:**
```bash
# Quick start option
wget https://github.com/datasets/geo-countries/raw/master/data/countries.geojson
mv countries.geojson hugo/site/static/data/
```

**Expected Behavior:**
- User clicks anywhere within a country's borders
- Popup appears with country name (English + native)
- Anthem information displays
- Audio player widget shown (when implemented)

### OpenStreetMap Styling

**Goal:** Show only country names, hide city/road labels

**Recommended Approach:** Stamen Toner Lite
```javascript
L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}{r}.png', {
  attribution: 'Map tiles by Stamen Design, under CC BY 3.0',
  subdomains: 'abcd',
  maxZoom: 18
}).addTo(map);
```

**Why:** No API key required, clean minimalist design, good country label visibility

### Game Feature Architecture

**Components:**
1. **Frontend** (Hugo/JavaScript):
   - Game page with dual audio players
   - 5-second listen timer
   - Vote button
   - Country information display

2. **Backend** (AWS SAM):
   - API Gateway for HTTPS endpoints
   - Lambda functions (session, matchup, vote)
   - DynamoDB tables (rankings, votes, sessions)

3. **Leaderboard** (Hugo/JavaScript + AWS SAM):
   - Rankings display
   - Country detail pages
   - Global statistics
   - Real-time updates

**User Flow:**
1. Visit `/game`
2. Frontend creates session (stores session ID)
3. Get first matchup (two countries with similar ELO)
4. Listen to anthems (5 seconds minimum each)
5. Vote for preferred anthem
6. ELO scores update immediately
7. Next matchup loads automatically
8. View leaderboard at `/leaderboard`

**ELO System:**
- Initial rating: 1500 for all countries
- K-factor: 32 (standard for games)
- Updates after each vote
- Similar-ranked countries matched together

**Data Stored:**
- Rankings (country_id, rating, wins, losses, total_votes)
- Votes (vote_id, winner, loser, user_country, timestamp)
- Sessions (session_id, ip_hash, country, created_at, expires_at)

## Directory Structure Added

```
sam/
├── game/
│   └── README.md                 # Game service documentation
└── leaderboard/
    └── README.md                 # Leaderboard service documentation

docs/
└── research.md                   # Enhanced with boundary data sources

IMPLEMENTATION_NOTES.md           # Step-by-step implementation guide
UPDATE_MAP_AND_GAME.md           # This file
```

## What's Still TODO

### Map Implementation:
1. Download countries.geojson file
2. Place in `hugo/site/static/data/`
3. Update map.js to load GeoJSON (remove sample markers)
4. Test clickability across all countries
5. Add native country names to data
6. Implement tile layer customization

### Game Implementation:
1. Set up AWS SAM CLI locally
2. Create `template.yaml` files for both services
3. Implement Lambda functions (session, matchup, vote, rankings)
4. Create DynamoDB table schemas
5. Test locally with `sam local start-api`
6. Deploy to AWS dev environment
7. Create game.md and leaderboard.md content pages
8. Build game JavaScript (audio players, voting, timer)
9. Build leaderboard JavaScript (rankings display)
10. Integrate API endpoints with frontend

### Testing:
1. Add Playwright tests for GeoJSON loading
2. Add tests for country polygon clicks
3. Add tests for game workflow
4. Add tests for leaderboard display
5. Add API integration tests

## Links to Key Files

- **Map Implementation**: `hugo/site/static/js/map.js`
- **Map Styles**: `hugo/site/static/css/style.css`
- **Data Sources**: `docs/research.md` (lines 45-160)
- **Implementation Guide**: `IMPLEMENTATION_NOTES.md`
- **TODO List**: `TODO.md` (added 116 new tasks)
- **Game Service**: `sam/game/README.md`
- **Leaderboard Service**: `sam/leaderboard/README.md`

## Next Immediate Steps

1. **Download GeoJSON** (5 minutes):
   ```bash
   wget https://github.com/datasets/geo-countries/raw/master/data/countries.geojson
   mv countries.geojson hugo/site/static/data/
   ```

2. **Update map.js** (10 minutes):
   - Uncomment GeoJSON loading code
   - Remove sample marker code
   - Test in browser

3. **Test Stamen Toner Lite** (5 minutes):
   - Replace tile layer URL in map.js
   - Reload page and evaluate appearance

4. **Start Game Documentation** (30 minutes):
   - Read through `docs/game.md` (already exists)
   - Review `IMPLEMENTATION_NOTES.md`
   - Familiarize with AWS SAM CLI

5. **Create template.yaml** (1 hour):
   - Start with game service
   - Define Lambda functions
   - Define DynamoDB tables
   - Configure API Gateway

## Questions to Consider

1. **Map Tiles**: Which tile provider best meets the "country names only" requirement?
   - Test Stamen Toner Lite first (no API key)
   - If insufficient, try MapBox (requires free account)

2. **GeoJSON Source**: Which provides best balance of quality and file size?
   - Recommend starting with datasets/geo-countries (easiest)
   - Switch to Natural Earth if more detail needed

3. **Game Infrastructure**: LocalStack for local testing or direct AWS?
   - Recommend AWS free tier for development
   - Use `sam local` for Lambda testing

4. **Native Names**: How to source and add to GeoJSON?
   - Option 1: Merge with mluqmaan/world-countries-json
   - Option 2: Query Wikidata SPARQL endpoint
   - Option 3: Manual curation for 193 countries

## Success Criteria

### Map Feature Complete When:
- [ ] All 193 countries have clickable boundaries (not just markers)
- [ ] Clicking anywhere in country shows popup
- [ ] Native country names display in popup
- [ ] Map tiles show country labels prominently
- [ ] City and road labels minimized or hidden

### Game Feature Complete When:
- [ ] User can visit `/game` and get matched countries
- [ ] Audio players work for both anthems
- [ ] 5-second timer enforced before voting enabled
- [ ] Voting updates ELO scores immediately
- [ ] Leaderboard shows current rankings
- [ ] User country detected via IP
- [ ] All API endpoints functional
- [ ] AWS infrastructure deployed and tested

See `docs/game.md` for complete game feature specification and detailed requirements.
