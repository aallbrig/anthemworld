# National Anthem Game & Leaderboard

## Overview

A "Hot or Not" style ranking game where users compare national anthems from around the world. Users listen to two anthems and vote for their favorite. The system uses an ELO-style ranking algorithm to match similarly-ranked countries and maintain a global leaderboard.

## Why This Game Works

**The Addictive Core Loop** - Proven dopamine mechanics:
- Simple head-to-head comparisons (like Tinder swipes, Hot or Not)
- Listen → Vote → Instant result → Next matchup
- Low friction, high replay value
- Perfect for bored scrolling, coffee breaks, or group play

**Cultural Curiosity Hook**:
- Most people have heard only 5-10 national anthems
- Discovering obscure gems (Vanuatu, Bhutan, Seychelles) is naturally entertaining
- Forming hot takes and opinions creates personal investment
- Shareable moments: "Wait, THIS beat Russia's anthem?!"

**Competition & Nationalism**:
- ELO matchmaking creates natural drama (underdogs rising, streaks, rivalries)
- Country-specific stats invite trash talk and social sharing
- "Your homeland is #47—blame the voters" drives engagement
- Real-time rankings show your vote's impact

**Designed Against Common Pitfalls**:
- ❌ Audio fatigue → ✅ 3-4s minimum, waveform previews, skip options
- ❌ Monotonous matches → ✅ Wildcard rounds, variety modes
- ❌ No personal stakes → ✅ Streak tracking, favorite playlists, voting badges
- ❌ Slow pacing → ✅ Session memory allows instant votes on familiar anthems
- ❌ Lack of variety → ✅ Discovery of 193 different musical styles from orchestral to folk

**Viral Potential**: TikTok/Reddit-friendly with surprising matchups, meme-worthy upsets, and shareable results.

## Game Features

### Core Gameplay
1. **Anthem Comparison**: Present two national anthems side-by-side
2. **Smart Listen Requirements**: 
   - First-time anthem: 3-4 seconds minimum listen time
   - Previously heard: Can vote immediately (session memory)
   - Visual waveform preview for quick judgment
3. **Voting**: Simple, satisfying interface to choose preferred anthem
4. **Ranking System**: ELO/MMR-style ranking to match similarly-ranked anthems
5. **Continuous Play**: After voting, immediately present next matchup
6. **Leaderboard**: Real-time global rankings of all 193 countries
7. **Personal Stats**: Track your voting streak, favorites, and impact

### User Experience - Designed for Addictive Fun
- **Fast-paced**: Low friction, chain 10-20 rounds in minutes
- **Audio Discovery**: Expose users to anthems they've never heard
- **Visual Energy**: Waveform displays show anthem "energy" at a glance
- **Satisfying Feedback**: 
  - Instant ELO updates after each vote ("France moved up 3 spots!")
  - Personal impact messages ("Your vote helped X overtake Y")
  - Streak counters and voting badges
- **Country Context**: Auto-detect user's country, show "Your country vs. the world" stats
- **Humor & Personality**: Light commentary on matchups and fun facts about anthems
- **End-of-Session Hook**: After 10+ votes, show summary with shareable results

### Engagement Features (Reduce Audio Fatigue)
- **Audio Scrubbing**: Let users jump to interesting parts
- **Waveform Visualization**: See energy peaks before listening
- **Variety Modes**:
  - Standard matchups (similar ELO)
  - Wildcard rounds every 5-10 votes (high vs. low rank for chaos)
  - Regional battles (e.g., Africa vs. Asia)
- **Quick Preview**: First 3 seconds auto-play, full vote requires 4+ seconds
- **Skip After Preview**: Can vote with reduced ELO impact if impatient

### Data Tracking
- **Vote Data**: Which anthem won each matchup
- **User Location**: Country of origin via IP geolocation
- **Session Data**: Anonymous session tracking
- **Engagement Metrics**: Listen duration, skip rate, completion rate
- **Ranking History**: Track ELO changes over time

## Technical Architecture

### Frontend (Hugo Static Site)

**Location**: `hugo/site/content/game.md`, `hugo/site/static/js/game.js`

**Components**:
- Game UI with dual anthem players
- Vote interface with disabled state during listen period
- Leaderboard display
- Real-time ranking updates

**Technologies**:
- HTML5 Audio API for playback
- JavaScript for game logic
- WebSockets or polling for leaderboard updates
- Bootstrap for responsive design

### Backend (AWS SAM + Lambda)

**Location**: `./sam/game/` and `./sam/leaderboard/`

**Services**:

#### 1. Game Service (`./sam/game/`)
- **GET /api/game/matchup** - Get next anthem matchup
  - Input: User session ID, optional user country
  - Output: Two country objects with anthem data
  - Logic: Select two similarly-ranked anthems using ELO scores

- **POST /api/game/vote** - Record vote
  - Input: Winner country ID, loser country ID, session ID, user country
  - Output: Updated rankings, next matchup
  - Logic: Update ELO scores, record vote in database

- **GET /api/game/session** - Create/get user session
  - Output: Session ID
  - Logic: Create anonymous session, detect user country via IP

#### 2. Leaderboard Service (`./sam/leaderboard/`)
- **GET /api/leaderboard** - Get current rankings
  - Input: Optional filters (region, date range)
  - Output: Ranked list of countries with ELO scores
  - Pagination: Support for top 10, top 50, full 193

- **GET /api/leaderboard/country/{id}** - Get specific country stats
  - Output: Country rank, ELO, win/loss record, vote history

- **GET /api/leaderboard/stats** - Get global statistics
  - Output: Total votes, most voted matchup, trending anthems

#### 3. Shared Infrastructure
- **DynamoDB Tables**:
  - `anthem-rankings` - Current ELO scores for each country
  - `vote-history` - All votes cast with timestamps
  - `sessions` - User sessions with country detection
  - `matchup-cache` - Pre-computed matchups for performance

- **API Gateway**: RESTful API endpoints with CORS
- **CloudFront**: CDN for static assets and API caching
- **Lambda Layers**: Shared code for ELO calculations, data access

### Rate Limiting & Anti-Abuse Strategy

**Client-Side Listen Requirements (Reduced for Speed)**:
- First-time anthem: 3-4 seconds minimum (down from 5s to reduce fatigue)
- Previously heard: Vote immediately (session memory)
- Visual countdown/progress indicator
- Can skip after preview with reduced ELO impact (0.5x weight)

**Server-Side Rate Limiting**:

1. **Session-Based Listen Tracking**:
   - Track which anthems the user has already heard in their session
   - Store in `session_listen_history` table:
     ```json
     {
       "session_id": "uuid",
       "country_id": "usa",
       "first_listen_at": "2026-02-14T...",
       "total_listen_time": 45,  // cumulative seconds
       "has_met_requirement": true  // >= 4 seconds
     }
     ```

2. **Smart Vote Validation**:
   - **New anthem (not heard before)**: Require 4+ seconds listen time in current matchup
   - **Previously heard anthem**: Can vote immediately if cumulative listen time >= 4 seconds
   - **Both previously heard**: Can vote immediately (both already met requirement)
   - **One new, one old**: Only require 4+ seconds on the new anthem
   - **Quick vote**: Allow early vote but reduce ELO impact to 0.5x
   
   Example validation logic:
   ```javascript
   function validateVote(sessionId, countryA, countryB, listenTimes) {
     const historyA = getListenHistory(sessionId, countryA);
     const historyB = getListenHistory(sessionId, countryB);
     
     // Check if country A requirement met
     const aValid = historyA.has_met_requirement || 
                    (historyA.total_listen_time + listenTimes.a) >= 4;
     
     // Check if country B requirement met
     const bValid = historyB.has_met_requirement || 
                    (historyB.total_listen_time + listenTimes.b) >= 5;
     
     return aValid && bValid;
   }
   ```

3. **Time-Based Vote Limiting**:
   - Minimum 10 seconds between votes (prevents rapid clicking)
   - Calculated from matchup delivery time, not vote submission time
   - Prevents bots from voting without listening
   
   ```javascript
   function canVote(sessionId, matchupId) {
     const matchup = getMatchup(matchupId);
     const timeSinceDelivery = Date.now() - matchup.delivered_at;
     return timeSinceDelivery >= 10000; // 10 seconds minimum
   }
   ```

4. **Session Vote Limit**:
   - Maximum 100 votes per session per day (prevents abuse)
   - Graceful degradation: Show "You've reached the daily limit" message
   - Resets at midnight UTC

5. **IP-Based Rate Limiting**:
   - Maximum 5 sessions per IP per day
   - Prevents creating unlimited sessions to bypass vote limits
   - Use CloudFront or API Gateway rate limiting

6. **Audio Playback Verification** (Optional - Advanced):
   - Track actual audio playback events via JavaScript
   - Detect if audio was muted or paused immediately
   - Flag suspicious patterns (e.g., always voting at exactly 5.0 seconds)

**Implementation Notes**:
- Store listen history in DynamoDB with TTL (expire after 24 hours)
- Update cumulative listen time on every vote submission
- Return listen history with matchup response for client-side optimization
- Log suspicious patterns for analysis

### Map Component Integration

**Dual Map Widget for Game Page**:

Each matchup displays two synchronized map widgets that "fly to" and highlight the origin country of each anthem.

**Component Specification**:

```javascript
// Reusable map component: CountryHighlightMap
class CountryHighlightMap {
  constructor(containerId, options) {
    this.map = L.map(containerId, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false
    });
    
    // Start with full world view
    this.map.setView([20, 0], 2);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    
    // Load GeoJSON
    this.countriesLayer = null;
    this.loadCountries();
  }
  
  async loadCountries() {
    const response = await fetch('/data/countries.geojson');
    const data = await response.json();
    
    this.countriesLayer = L.geoJSON(data, {
      style: { fillOpacity: 0.2, color: '#ccc' }
    }).addTo(this.map);
  }
  
  // Public API: Zoom to specific country
  flyToCountry(isoCode) {
    // Find country feature by ISO code
    const feature = this.findCountryFeature(isoCode);
    if (!feature) return;
    
    // Calculate bounds
    const bounds = L.geoJSON(feature).getBounds();
    
    // Fly to country with animation
    this.map.flyToBounds(bounds, {
      padding: [20, 20],
      duration: 1.5,
      easeLinearity: 0.25
    });
    
    // Highlight the country
    this.highlightCountry(feature);
  }
  
  highlightCountry(feature) {
    // Reset previous highlights
    if (this.highlightedLayer) {
      this.countriesLayer.resetStyle(this.highlightedLayer);
    }
    
    // Find and highlight new layer
    this.countriesLayer.eachLayer(layer => {
      if (layer.feature === feature) {
        layer.setStyle({
          fillColor: '#0d6efd',
          fillOpacity: 0.6,
          weight: 2,
          color: '#0a58ca'
        });
        this.highlightedLayer = layer;
      }
    });
  }
  
  // Reset to full world view
  resetView() {
    this.map.setView([20, 0], 2, { animate: true });
    if (this.highlightedLayer) {
      this.countriesLayer.resetStyle(this.highlightedLayer);
      this.highlightedLayer = null;
    }
  }
  
  findCountryFeature(isoCode) {
    let foundFeature = null;
    this.countriesLayer.eachLayer(layer => {
      const props = layer.feature.properties;
      if (props.id === isoCode || props.ISO_A3 === isoCode || 
          props.iso_a3 === isoCode) {
        foundFeature = layer.feature;
      }
    });
    return foundFeature;
  }
}
```

**Game Page Layout**:

```html
<!-- Game page: hugo/site/content/game.md -->
<div class="game-container">
  <div class="row">
    <!-- Country A -->
    <div class="col-md-6">
      <div id="map-country-a" class="game-map"></div>
      <h3 id="country-a-name"></h3>
      <audio id="audio-a" controls></audio>
      <div class="listen-progress">
        <div class="progress">
          <div id="progress-a" class="progress-bar"></div>
        </div>
        <small>Listen time: <span id="time-a">0</span>s / 5s required</small>
      </div>
    </div>
    
    <!-- Country B -->
    <div class="col-md-6">
      <div id="map-country-b" class="game-map"></div>
      <h3 id="country-b-name"></h3>
      <audio id="audio-b" controls></audio>
      <div class="listen-progress">
        <div class="progress">
          <div id="progress-b" class="progress-bar"></div>
        </div>
        <small>Listen time: <span id="time-b">0</span>s / 5s required</small>
      </div>
    </div>
  </div>
  
  <div class="vote-buttons text-center mt-4">
    <button id="vote-a" class="btn btn-primary btn-lg" disabled>
      Vote for <span id="vote-name-a"></span>
    </button>
    <button id="vote-b" class="btn btn-primary btn-lg" disabled>
      Vote for <span id="vote-name-b"></span>
    </button>
  </div>
</div>

<style>
.game-map {
  height: 300px;
  border: 2px solid #ddd;
  border-radius: 8px;
  margin-bottom: 1rem;
}
</style>
```

**JavaScript Integration**:

```javascript
// Initialize maps
const mapA = new CountryHighlightMap('map-country-a');
const mapB = new CountryHighlightMap('map-country-b');

// When matchup loads
function loadMatchup(matchupData) {
  const countryA = matchupData.countries[0];
  const countryB = matchupData.countries[1];
  
  // Fly maps to respective countries
  mapA.flyToCountry(countryA.id);
  mapB.flyToCountry(countryB.id);
  
  // Load audio and other UI elements
  // ...
}

// On vote submission, reset maps
function onVoteSubmit() {
  mapA.resetView();
  mapB.resetView();
  // Load next matchup...
}
```

**Map Behavior**:
- **Initial State**: Both maps show full world view (zoomed out)
- **On Matchup Load**: Maps animate simultaneously to their respective countries
- **Highlight**: Country polygon is highlighted with blue fill
- **Duration**: 1.5 second smooth animation
- **On Vote**: Maps reset to world view, then animate to next matchup
- **Interaction**: Maps are non-interactive (dragging/zooming disabled) to keep focus on voting

**Performance Considerations**:
- Reuse same GeoJSON data (load once, share between maps)
- Use lightweight Leaflet rendering
- Disable unnecessary features (zoom controls, attribution on one map)
- Total page weight: ~300KB (2 map instances + GeoJSON)

### Ranking Algorithm

**ELO Rating System** (similar to chess, competitive games):

```
Initial Rating: 1500 (all countries start here)
K-Factor: 32 (determines rating volatility)

Expected Score for Country A:
E_A = 1 / (1 + 10^((Rating_B - Rating_A) / 400))

New Rating after match:
Rating_A_new = Rating_A + K * (Actual_Score - E_A)

Where:
- Actual_Score = 1 if A wins, 0 if A loses
- K = 32 for standard volatility
```

**Matchmaking Logic**:
1. **Every 5-10 votes**: Trigger wildcard round (deliberate mismatch for entertainment)
2. **Standard matches**: Find countries within ±200 ELO points
3. **Avoid repetition**: Cache last 10 matchups per session
4. **Balance data**: Prefer countries with fewer total votes
5. **Variety modes**:
   - Regional battles (same continent/region)
   - Historical rivals (known pairings)
   - Musical similarity (same style/era)
   - Pure chaos (any two countries)

**Wildcard Rules**:
- High vs Low rank (>500 ELO difference)
- Double ELO impact for upset wins
- Special announcement in UI
- Track upset statistics

### IP Geolocation

**Service**: MaxMind GeoIP2 or IP2Location API

**Implementation**:
```javascript
// Lambda function
const geoip = require('geoip-lite');

exports.handler = async (event) => {
  const ip = event.requestContext.identity.sourceIp;
  const geo = geoip.lookup(ip);
  
  return {
    country: geo?.country || 'UNKNOWN',
    region: geo?.region,
    city: geo?.city
  };
};
```

**Data Storage**:
- Store user's country with each vote
- Aggregate votes by origin country
- Enable analytics: "Which countries prefer which anthems?"

## Database Schema

### DynamoDB Tables

#### anthem_rankings
```json
{
  "country_id": "usa",           // Partition Key
  "elo_rating": 1687,
  "total_votes": 245,
  "wins": 152,
  "losses": 93,
  "win_percentage": 0.620,
  "rank": 12,
  "last_updated": "2026-02-14T02:30:00Z"
}
```

#### vote_history
```json
{
  "vote_id": "uuid",              // Partition Key
  "timestamp": "2026-02-14T...",  // Sort Key
  "winner_id": "usa",
  "loser_id": "can",
  "session_id": "session-uuid",
  "user_country": "gbr",
  "winner_elo_before": 1650,
  "winner_elo_after": 1667,
  "loser_elo_before": 1620,
  "loser_elo_after": 1603,
  "listen_duration_winner": 45,  // seconds
  "listen_duration_loser": 38
}
```

#### sessions
```json
{
  "session_id": "uuid",           // Partition Key
  "created_at": "2026-02-14T...",
  "user_country": "gbr",
  "user_ip": "masked-ip-hash",   // Privacy: hashed
  "total_votes": 15,
  "last_activity": "2026-02-14T..."
}
```

#### matchup_history
```json
{
  "session_id": "uuid",           // Partition Key
  "timestamp": "2026-02-14T...",  // Sort Key
  "country_a": "usa",
  "country_b": "gbr"
}
```

## Personal Progression & Session Features

### Individual Stats Tracking

**Per-Session Tracking** (anonymous but persistent during session):
```json
{
  "session_id": "uuid",
  "stats": {
    "votes_cast": 23,
    "voting_streak": 12,
    "favorite_anthem": "fra",
    "countries_heard": 45,
    "quick_votes": 3,
    "full_listens": 20,
    "impact_score": 87,  // How many ELO points changed due to your votes
    "matches_witnessed": {
      "upsets": 4,  // Low rank beat high rank
      "blowouts": 2,  // >300 ELO difference
      "close_calls": 8  // <50 ELO difference
    }
  }
}
```

**End-of-Session Summary** (after 10+ votes):
- "You helped France move up 5 spots!"
- "Your top 3 voted anthems: France, Japan, New Zealand"
- "You witnessed 2 major upsets"
- "Your voting streak: 12 rounds"
- "Share your results" button with pre-filled tweet/post

**Voting Badges & Achievements**:
- 🔥 **Hot Streak**: 10+ votes in one session
- 🌍 **World Traveler**: Heard 50+ different anthems
- ⚖️ **Kingmaker**: Your vote decided a close match
- 🎯 **Trend Setter**: Voted for anthem before it went viral
- 🏆 **Completionist**: Heard all 193 anthems

**Personal Playlists**:
- "Your Favorites" - Anthems you voted for most
- "Discoveries" - Anthems you recently heard
- "Your Country's Rivals" - Countries your country competed against

### UI Enhancements for Fun

**Matchup Commentary** (light humor):
- "Classic freedom fries 🍟 vs liberté, égalité, baguette 🥖"
- "The eternal Scandinavia showdown"
- "Battle of the Commonwealth"
- "Both from the same region—who takes the crown?"

**Post-Vote Fun Facts**:
- "Did you know? This anthem was written during actual war"
- "Fun fact: This is one of the shortest anthems at only 45 seconds"
- "This anthem shares the same melody as [other country]"

**Wildcard Round Alerts**:
- "🎲 WILDCARD ROUND: #3 vs #187—chaos time!"
- "Regional Battle: Africa vs Asia"
- "Special Challenge: Same composer, different countries"

**Real-Time Drama**:
- "⚡ UPSET! #92 just beat #8!"
- "🔥 France is on a 5-win streak!"
- "📈 This vote moved Brazil up 3 spots!"

## API Endpoints

### Game API (`/api/game`)

#### `GET /api/game/session`
Create or retrieve user session

**Response**:
```json
{
  "session_id": "uuid",
  "user_country": "gbr",
  "created_at": "2026-02-14T..."
}
```

#### `GET /api/game/matchup?session_id={id}`
Get next anthem matchup

**Response**:
```json
{
  "matchup_id": "uuid",
  "countries": [
    {
      "id": "usa",
      "name": "United States of America",
      "native_name": "United States of America",
      "anthem": {
        "name": "The Star-Spangled Banner",
        "composer": "John Stafford Smith",
        "adopted": "1931",
        "audio_url": "https://...",
        "duration": 90
      },
      "flag_url": "https://...",
      "current_elo": 1687,
      "current_rank": 12
    },
    {
      "id": "gbr",
      "name": "United Kingdom",
      "native_name": "United Kingdom",
      "anthem": {
        "name": "God Save the King",
        "composer": "Unknown",
        "adopted": "Unknown",
        "audio_url": "https://...",
        "duration": 75
      },
      "flag_url": "https://...",
      "current_elo": 1654,
      "current_rank": 18
    }
  ]
}
```

#### `POST /api/game/vote`
Submit vote

**Request**:
```json
{
  "session_id": "uuid",
  "matchup_id": "uuid",
  "winner_id": "usa",
  "loser_id": "gbr",
  "listen_duration": {
    "winner": 45,
    "loser": 38
  }
}
```

**Response**:
```json
{
  "success": true,
  "elo_changes": {
    "winner": {
      "old": 1687,
      "new": 1704,
      "change": +17
    },
    "loser": {
      "old": 1654,
      "new": 1637,
      "change": -17
    }
  },
  "next_matchup": { /* same format as GET /matchup */ }
}
```

## API Rules & Rate Limiting

### Voting Rules

**Server-Side Validation (all requests validated)**:

1. **Session Must Exist**:
   - Session ID must be valid and not expired
   - Sessions expire after 24 hours of inactivity
   - Error: 404 if session not found, 410 if expired

2. **Matchup Must Be Valid**:
   - Matchup ID must match the most recent matchup for this session
   - Cannot vote on old/invalid matchups
   - Error: 400 if matchup ID doesn't match or is stale

3. **Listen Time Requirements**:
   - For NEW anthems: Must have listened ≥5 seconds in current matchup
   - For PREVIOUSLY HEARD anthems: Cumulative listen time ≥5 seconds (any matchup)
   - Both anthems must meet their respective requirements
   - Error: 422 if listen requirements not met

4. **Time Between Votes**:
   - Minimum 10 seconds must pass since matchup was delivered
   - Prevents rapid-fire voting without listening
   - Error: 429 if voting too quickly

5. **Daily Vote Limits**:
   - Maximum 100 votes per session per day
   - Resets at midnight UTC
   - Error: 429 with retry-after header

6. **Winner/Loser Must Match Matchup**:
   - Winner and loser IDs must be the two countries from the matchup
   - Cannot vote for countries not in current matchup
   - Error: 400 if country IDs invalid

### Matchup Request Rules

**Prevent Matchup Spam**:

1. **One Active Matchup Per Session**:
   - Session can only have ONE active matchup at a time
   - Must vote on current matchup before requesting new one
   - Requesting new matchup while one is active returns the SAME matchup
   - No error, just returns existing matchup

2. **Rate Limit Matchup Requests**:
   - Maximum 1 matchup request per 10 seconds per session
   - If user requests too fast, return 429 with current matchup
   - Prevents spamming matchup endpoint

3. **Matchup Delivery Tracking**:
   - Track `delivered_at` timestamp for each matchup
   - Use for enforcing minimum vote time
   - Matchups expire after 5 minutes of inactivity

**Implementation**:
```javascript
// Lambda: matchup function
async function getMatchup(sessionId) {
  const session = await getSession(sessionId);
  
  // Check if session has active matchup
  if (session.active_matchup_id) {
    const matchup = await getMatchup(session.active_matchup_id);
    
    // Check if matchup is recent (< 5 minutes old)
    const age = Date.now() - matchup.delivered_at;
    if (age < 300000) { // 5 minutes
      // Return existing matchup, don't create new one
      return {
        statusCode: 200,
        body: JSON.stringify({
          matchup_id: matchup.id,
          delivered_at: matchup.delivered_at,
          countries: matchup.countries,
          message: "Active matchup (vote before requesting new one)"
        })
      };
    }
  }
  
  // Check rate limit (1 matchup per 10 seconds)
  if (session.last_matchup_request) {
    const timeSince = Date.now() - session.last_matchup_request;
    if (timeSince < 10000) {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: "Too many matchup requests",
          retry_after: Math.ceil((10000 - timeSince) / 1000)
        })
      };
    }
  }
  
  // Create new matchup
  const newMatchup = await createMatchup(sessionId);
  return {
    statusCode: 200,
    body: JSON.stringify(newMatchup)
  };
}
```

### Session Creation Rules

**Prevent Session Abuse**:

1. **IP-Based Rate Limiting**:
   - Maximum 5 sessions per IP address per day
   - Tracked by hashed IP (privacy-preserving)
   - Error: 429 if limit exceeded

2. **Session Reuse**:
   - If user already has active session (cookie/localStorage), return existing session
   - Don't create duplicate sessions for same user
   - Sessions valid for 24 hours

3. **Suspicious Pattern Detection**:
   - If IP creates sessions but never votes, flag as suspicious
   - After 3 flagged sessions, temporarily block (1 hour cooldown)
   - Error: 403 with explanation

**Implementation**:
```javascript
// Lambda: session function
async function createSession(event) {
  const ip = event.requestContext.identity.sourceIp;
  const ipHash = hashIP(ip); // Privacy-preserving hash
  
  // Check IP session limit
  const sessionsToday = await countSessionsByIP(ipHash);
  if (sessionsToday >= 5) {
    return {
      statusCode: 429,
      headers: { 'Retry-After': '86400' }, // 24 hours
      body: JSON.stringify({
        error: "Session limit reached",
        message: "You've created 5 sessions today. Please use an existing session or try again tomorrow.",
        retry_after: 86400
      })
    };
  }
  
  // Check for suspicious pattern
  const suspiciousCount = await getSuspiciousSessionCount(ipHash);
  if (suspiciousCount >= 3) {
    const cooldownRemaining = await getCooldownRemaining(ipHash);
    if (cooldownRemaining > 0) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Temporary block",
          message: "Suspicious activity detected. Please try again later.",
          retry_after: cooldownRemaining
        })
      };
    }
  }
  
  // Create new session
  const session = await createNewSession(ipHash);
  return {
    statusCode: 201,
    body: JSON.stringify({
      session_id: session.id,
      user_country: session.country,
      created_at: session.created_at
    })
  };
}
```

## HTTP Status Codes & Error Responses

### Success Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET request (matchup, leaderboard) |
| 201 | Created | Successfully created new session |

### Client Error Codes

| Code | Meaning | When Used | Retry? |
|------|---------|-----------|--------|
| 400 | Bad Request | Invalid request body, missing fields, invalid country IDs | No - Fix request |
| 403 | Forbidden | Temporary block due to suspicious activity | Wait for cooldown |
| 404 | Not Found | Session not found, country not found | No - Create new session |
| 410 | Gone | Session expired (>24 hours old) | No - Create new session |
| 422 | Unprocessable Entity | Listen requirements not met, validation failed | No - Listen more |
| 429 | Too Many Requests | Rate limit exceeded (votes, matchups, sessions) | Yes - Wait retry_after |

### Server Error Codes

| Code | Meaning | When Used | Retry? |
|------|---------|-----------|--------|
| 500 | Internal Server Error | Unexpected server error | Yes - After delay |
| 503 | Service Unavailable | DynamoDB overloaded, Lambda timeout | Yes - Exponential backoff |

### Error Response Format

All errors follow consistent JSON structure:

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "retry_after": 3600,  // Optional: seconds to wait before retrying
  "details": {          // Optional: additional context
    "required_listen_time": 5,
    "actual_listen_time": 3,
    "anthem_id": "usa"
  }
}
```

### Specific Error Examples

**Session Limit Reached (429)**:
```json
{
  "error": "session_limit_reached",
  "message": "You've created 5 sessions today. Please use an existing session or try again tomorrow.",
  "retry_after": 86400
}
```

**Vote Too Soon (429)**:
```json
{
  "error": "voting_too_fast",
  "message": "Please wait 7 more seconds before voting.",
  "retry_after": 7,
  "details": {
    "matchup_delivered_at": "2026-02-14T12:34:56Z",
    "minimum_wait_seconds": 10,
    "seconds_elapsed": 3
  }
}
```

**Listen Requirement Not Met (422)**:
```json
{
  "error": "insufficient_listen_time",
  "message": "You must listen to at least 5 seconds of both anthems before voting.",
  "details": {
    "country_a": {
      "id": "usa",
      "required": 5,
      "actual": 4.2,
      "met": false
    },
    "country_b": {
      "id": "gbr", 
      "required": 0,  // Previously heard
      "actual": 12.5,  // Cumulative from all matchups
      "met": true
    }
  }
}
```

**Daily Vote Limit (429)**:
```json
{
  "error": "daily_vote_limit_reached",
  "message": "You've reached the daily limit of 100 votes. Come back tomorrow!",
  "retry_after": 43200,  // Seconds until midnight UTC
  "details": {
    "votes_today": 100,
    "limit": 100,
    "reset_at": "2026-02-15T00:00:00Z"
  }
}
```

**Invalid Matchup (400)**:
```json
{
  "error": "invalid_matchup",
  "message": "This matchup is no longer active. Request a new matchup.",
  "details": {
    "provided_matchup_id": "old-uuid",
    "current_matchup_id": "new-uuid"
  }
}
```

**Suspicious Activity Block (403)**:
```json
{
  "error": "temporary_block",
  "message": "Your account has been temporarily blocked due to suspicious activity. Please try again in 1 hour.",
  "retry_after": 3600,
  "details": {
    "reason": "Multiple sessions created without votes",
    "block_until": "2026-02-14T13:34:56Z"
  }
}
```

**Expired Session (410)**:
```json
{
  "error": "session_expired",
  "message": "Your session has expired. Please create a new session.",
  "details": {
    "expired_at": "2026-02-13T12:34:56Z",
    "session_id": "expired-uuid"
  }
}
```

## Client-Side Error Handling

### JavaScript Error Handling

```javascript
class GameAPI {
  async vote(sessionId, matchupId, winnerId, loserId, listenDuration) {
    try {
      const response = await fetch('/api/game/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          matchup_id: matchupId,
          winner_id: winnerId,
          loser_id: loserId,
          listen_duration: listenDuration
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        this.handleError(response.status, error);
        return null;
      }
      
      return await response.json();
      
    } catch (err) {
      this.showNetworkError();
      return null;
    }
  }
  
  handleError(statusCode, error) {
    switch (statusCode) {
      case 400:
        this.showAlert('error', error.message);
        break;
        
      case 403:
        this.showBlockedMessage(error);
        this.disableGame();
        break;
        
      case 410:
        this.showAlert('warning', 'Session expired. Creating new session...');
        this.createNewSession();
        break;
        
      case 422:
        this.showListenRequirementError(error.details);
        break;
        
      case 429:
        this.showRateLimitMessage(error);
        this.startRetryTimer(error.retry_after);
        break;
        
      case 500:
      case 503:
        this.showAlert('error', 'Server error. Please try again in a moment.');
        this.retryWithBackoff();
        break;
        
      default:
        this.showAlert('error', error.message || 'An error occurred');
    }
  }
  
  showListenRequirementError(details) {
    const messages = [];
    
    if (!details.country_a.met) {
      messages.push(
        `Listen to ${details.country_a.id} for ${
          details.country_a.required - details.country_a.actual
        } more seconds`
      );
    }
    
    if (!details.country_b.met) {
      messages.push(
        `Listen to ${details.country_b.id} for ${
          details.country_b.required - details.country_b.actual
        } more seconds`
      );
    }
    
    this.showAlert('warning', messages.join(' and '));
  }
  
  showRateLimitMessage(error) {
    const minutes = Math.ceil(error.retry_after / 60);
    let message = error.message;
    
    if (error.error === 'daily_vote_limit_reached') {
      message += ` Thank you for playing! Check out the leaderboard to see the rankings.`;
    } else if (error.retry_after < 60) {
      message += ` Please wait ${error.retry_after} seconds.`;
    } else {
      message += ` Please wait ${minutes} minutes.`;
    }
    
    this.showAlert('info', message, error.retry_after * 1000);
  }
  
  showBlockedMessage(error) {
    const hours = Math.ceil(error.retry_after / 3600);
    this.showAlert(
      'error',
      `${error.message} You can try again in ${hours} hour(s).`,
      -1 // Don't auto-dismiss
    );
  }
}
```

### User-Facing Error Messages

**Display Principles**:
- ✅ **Clear**: Explain what went wrong
- ✅ **Actionable**: Tell user what to do next
- ✅ **Friendly**: No technical jargon
- ✅ **Timed**: Auto-dismiss after appropriate duration

**Error Display Component**:
```html
<div id="error-banner" class="alert alert-dismissible fade" role="alert">
  <strong id="error-title"></strong>
  <p id="error-message"></p>
  <button type="button" class="btn-close" aria-label="Close"></button>
</div>

<style>
.alert {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 600px;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.alert-error { background: #f8d7da; color: #842029; }
.alert-warning { background: #fff3cd; color: #664d03; }
.alert-info { background: #cfe2ff; color: #084298; }
</style>
```

### Rate Limit UI Feedback

**Vote Limit Reached**:
```html
<div class="game-paused">
  <h2>🎉 Daily Limit Reached!</h2>
  <p>You've cast 100 votes today. Amazing!</p>
  <p>Come back tomorrow to vote more, or check out the leaderboard to see how countries are ranking.</p>
  <a href="/leaderboard" class="btn btn-primary">View Leaderboard</a>
  <p class="text-muted">Resets in <span id="countdown">12:34:56</span></p>
</div>
```

**Session Limit Reached**:
```html
<div class="game-paused">
  <h2>⏸️ Session Limit Reached</h2>
  <p>You've created 5 game sessions today.</p>
  <p>Please continue with your current session, or try again tomorrow.</p>
  <button onclick="location.reload()" class="btn btn-secondary">
    Reload Page
  </button>
</div>
```

**Temporary Block**:
```html
<div class="game-blocked">
  <h2>🚫 Temporarily Blocked</h2>
  <p>We detected unusual activity from your connection.</p>
  <p>You can play again in <span id="block-timer">1 hour</span>.</p>
  <p class="text-muted">If you believe this is an error, please contact support.</p>
</div>
```

## Rate Limit Summary Table

| Limit Type | Threshold | Window | Status Code | User Message |
|------------|-----------|--------|-------------|--------------|
| Session Creation | 5 per IP | 24 hours | 429 | "Session limit reached. Try tomorrow." |
| Vote Submission | 100 per session | 24 hours | 429 | "Daily vote limit reached. Come back tomorrow!" |
| Matchup Requests | 1 per session | 10 seconds | 429 | "Please wait before requesting new matchup." |
| Vote Timing | 1 vote | 10 seconds after matchup | 429 | "Please wait X more seconds before voting." |
| Suspicious Activity | 3 violations | 24 hours | 403 | "Temporary block. Try again in 1 hour." |

## Leaderboard API (`/api/leaderboard`)

#### `GET /api/leaderboard?limit=50&offset=0`
Get ranked countries

**Response**:
```json
{
  "total_countries": 193,
  "total_votes": 45234,
  "last_updated": "2026-02-14T...",
  "rankings": [
    {
      "rank": 1,
      "country_id": "fra",
      "country_name": "France",
      "anthem_name": "La Marseillaise",
      "elo_rating": 1892,
      "total_votes": 856,
      "wins": 534,
      "losses": 322,
      "win_rate": 0.624
    }
    // ... more countries
  ]
}
```

#### `GET /api/leaderboard/country/{id}`
Get specific country details

**Response**:
```json
{
  "rank": 12,
  "country": {
    "id": "usa",
    "name": "United States of America",
    "anthem_name": "The Star-Spangled Banner"
  },
  "elo_rating": 1687,
  "total_votes": 245,
  "wins": 152,
  "losses": 93,
  "win_rate": 0.620,
  "elo_history": [
    {"date": "2026-02-01", "elo": 1500},
    {"date": "2026-02-14", "elo": 1687}
  ],
  "popular_matchups": [
    {"opponent": "gbr", "record": "12-8"},
    {"opponent": "can", "record": "9-5"}
  ]
}
```

#### `GET /api/leaderboard/stats`
Global statistics

**Response**:
```json
{
  "total_votes": 45234,
  "total_sessions": 12456,
  "most_voted_matchup": {
    "countries": ["usa", "gbr"],
    "vote_count": 523
  },
  "trending_anthem": {
    "country_id": "jpn",
    "rank_change_24h": +15
  },
  "votes_by_country": {
    "usa": 8234,
    "gbr": 6543,
    "can": 4321
    // ...
  }
}
```

## Frontend Implementation

### Game Page (`/game`)

**HTML Structure**:
```html
<div class="game-container">
  <div class="game-header">
    <h1>National Anthem Showdown</h1>
    <p>Listen to both anthems and vote for your favorite!</p>
  </div>
  
  <div class="matchup">
    <div class="country-card" id="country-a">
      <img src="flag_a" class="flag">
      <h2>Country A Name</h2>
      <p class="native-name">Native Name</p>
      <div class="anthem-info">
        <p><strong>Anthem:</strong> Anthem Name</p>
        <p><strong>Composer:</strong> Composer Name</p>
      </div>
      <audio id="audio-a" src="anthem_url"></audio>
      <div class="audio-controls">
        <button class="play-btn">Play</button>
        <div class="progress-bar">
          <div class="progress" style="width: 0%"></div>
        </div>
        <span class="time">0:00 / 1:30</span>
      </div>
      <div class="listen-requirement">
        Listen for <span class="countdown">5</span> more seconds
      </div>
      <button class="vote-btn" disabled>Vote for this anthem</button>
    </div>
    
    <div class="vs">VS</div>
    
    <div class="country-card" id="country-b">
      <!-- Same structure as country-a -->
    </div>
  </div>
  
  <div class="game-footer">
    <p>Total votes: <span id="total-votes">0</span></p>
    <a href="/leaderboard">View Leaderboard</a>
  </div>
</div>
```

**JavaScript Logic** (`static/js/game.js`):
```javascript
class AnthemGame {
  constructor() {
    this.sessionId = null;
    this.currentMatchup = null;
    this.listenTime = { a: 0, b: 0 };
    this.minListenTime = 5; // seconds
    this.hasListenedA = false;
    this.hasListenedB = false;
  }
  
  async init() {
    await this.createSession();
    await this.loadMatchup();
    this.setupAudioPlayers();
    this.setupVoteButtons();
  }
  
  async createSession() {
    const response = await fetch('/api/game/session');
    const data = await response.json();
    this.sessionId = data.session_id;
  }
  
  async loadMatchup() {
    const response = await fetch(`/api/game/matchup?session_id=${this.sessionId}`);
    this.currentMatchup = await response.json();
    this.renderMatchup();
  }
  
  setupAudioPlayers() {
    const audioA = document.getElementById('audio-a');
    const audioB = document.getElementById('audio-b');
    
    // Track listen time
    audioA.addEventListener('timeupdate', () => {
      this.listenTime.a = audioA.currentTime;
      this.checkMinimumListen('a');
    });
    
    audioB.addEventListener('timeupdate', () => {
      this.listenTime.b = audioB.currentTime;
      this.checkMinimumListen('b');
    });
  }
  
  checkMinimumListen(side) {
    if (this.listenTime[side] >= this.minListenTime) {
      if (side === 'a') this.hasListenedA = true;
      if (side === 'b') this.hasListenedB = true;
      
      // Enable vote buttons if both anthems listened to
      if (this.hasListenedA && this.hasListenedB) {
        document.querySelectorAll('.vote-btn').forEach(btn => {
          btn.disabled = false;
        });
      }
    }
  }
  
  async submitVote(winnerId, loserId) {
    const response = await fetch('/api/game/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: this.sessionId,
        matchup_id: this.currentMatchup.matchup_id,
        winner_id: winnerId,
        loser_id: loserId,
        listen_duration: this.listenTime
      })
    });
    
    const result = await response.json();
    this.showVoteAnimation(result);
    
    // Load next matchup
    this.currentMatchup = result.next_matchup;
    this.resetForNextRound();
    this.renderMatchup();
  }
}
```

### Leaderboard Page (`/leaderboard`)

**Features**:
- Top 10 / Top 50 / All countries view
- Search/filter by country name
- Sort by ELO, win rate, total votes
- Visual indicators (rank change arrows, win streaks)
- Click country to see detailed stats

**HTML Structure**:
```html
<div class="leaderboard-container">
  <h1>National Anthem Rankings</h1>
  
  <div class="leaderboard-stats">
    <div class="stat">
      <span class="number">45,234</span>
      <span class="label">Total Votes</span>
    </div>
    <div class="stat">
      <span class="number">12,456</span>
      <span class="label">Players</span>
    </div>
  </div>
  
  <div class="leaderboard-controls">
    <input type="search" placeholder="Search country...">
    <select id="view-select">
      <option value="10">Top 10</option>
      <option value="50">Top 50</option>
      <option value="all">All Countries</option>
    </select>
  </div>
  
  <table class="leaderboard-table">
    <thead>
      <tr>
        <th>Rank</th>
        <th>Country</th>
        <th>Anthem</th>
        <th>ELO</th>
        <th>Votes</th>
        <th>Win Rate</th>
      </tr>
    </thead>
    <tbody id="rankings">
      <!-- Populated by JS -->
    </tbody>
  </table>
</div>
```

## AWS SAM Templates

### Game Service Template (`sam/game/template.yaml`)

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: National Anthem Game Service

Globals:
  Function:
    Timeout: 10
    Runtime: nodejs18.x
    Environment:
      Variables:
        RANKINGS_TABLE: !Ref AnthemRankingsTable
        VOTES_TABLE: !Ref VoteHistoryTable
        SESSIONS_TABLE: !Ref SessionsTable

Resources:
  # API Gateway
  GameApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      Cors:
        AllowOrigin: "'*'"
        AllowHeaders: "'Content-Type,X-Api-Key'"
        AllowMethods: "'GET,POST,OPTIONS'"

  # Lambda Functions
  SessionFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: functions/session/
      Handler: index.handler
      Events:
        GetSession:
          Type: Api
          Properties:
            RestApiId: !Ref GameApi
            Path: /session
            Method: get
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref SessionsTable

  MatchupFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: functions/matchup/
      Handler: index.handler
      Events:
        GetMatchup:
          Type: Api
          Properties:
            RestApiId: !Ref GameApi
            Path: /matchup
            Method: get
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref AnthemRankingsTable
        - DynamoDBReadPolicy:
            TableName: !Ref MatchupHistoryTable

  VoteFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: functions/vote/
      Handler: index.handler
      Events:
        PostVote:
          Type: Api
          Properties:
            RestApiId: !Ref GameApi
            Path: /vote
            Method: post
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref AnthemRankingsTable
        - DynamoDBCrudPolicy:
            TableName: !Ref VoteHistoryTable

  # DynamoDB Tables
  AnthemRankingsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: anthem-rankings
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: country_id
          AttributeType: S
      KeySchema:
        - AttributeName: country_id
          KeyType: HASH

  VoteHistoryTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: vote-history
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: vote_id
          AttributeType: S
        - AttributeName: timestamp
          AttributeType: S
      KeySchema:
        - AttributeName: vote_id
          KeyType: HASH
        - AttributeName: timestamp
          KeyType: RANGE

  SessionsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: sessions
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: session_id
          AttributeType: S
      KeySchema:
        - AttributeName: session_id
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

Outputs:
  GameApiUrl:
    Description: "API Gateway endpoint URL"
    Value: !Sub "https://${GameApi}.execute-api.${AWS::Region}.amazonaws.com/prod/"
```

### Leaderboard Service Template (`sam/leaderboard/template.yaml`)

Similar structure, with endpoints for:
- GET /leaderboard
- GET /leaderboard/country/{id}
- GET /leaderboard/stats

## Development Workflow

### Local Development

```bash
# Start SAM local API
cd sam/game
sam local start-api --port 3001

cd sam/leaderboard
sam local start-api --port 3002

# Hugo dev server with API proxy
hugo server -s hugo/site -D
```

## Local Development with SAM and LocalStack

### Prerequisites

```bash
# Install AWS SAM CLI
brew install aws-sam-cli  # macOS
# OR
pip install aws-sam-cli   # Linux/Windows

# Install LocalStack (for local AWS services)
pip install localstack
# OR
docker pull localstack/localstack

# Install AWS CLI (for testing)
pip install awscli
```

### LocalStack Setup

**Start LocalStack** (provides local DynamoDB, Lambda, API Gateway):

```bash
# Using Docker
docker run -d \
  --name localstack \
  -p 4566:4566 \
  -p 4571:4571 \
  -e SERVICES=dynamodb,lambda,apigateway \
  -e DEBUG=1 \
  -e DATA_DIR=/tmp/localstack/data \
  -v /tmp/localstack:/tmp/localstack \
  localstack/localstack

# OR using LocalStack CLI
localstack start -d
```

**Verify LocalStack is running**:
```bash
curl http://localhost:4566/_localstack/health
```

### SAM Project Structure

```
sam/
├── game/
│   ├── template.yaml          # SAM CloudFormation template
│   ├── src/
│   │   ├── session/           # Session Lambda
│   │   │   ├── index.js
│   │   │   └── package.json
│   │   ├── matchup/           # Matchup Lambda
│   │   │   ├── index.js
│   │   │   └── package.json
│   │   └── vote/              # Vote Lambda
│   │       ├── index.js
│   │       └── package.json
│   ├── events/                # Test events
│   │   ├── session.json
│   │   ├── matchup.json
│   │   └── vote.json
│   └── samconfig.toml
└── leaderboard/
    ├── template.yaml
    ├── src/
    │   ├── get-rankings/
    │   └── get-country/
    └── samconfig.toml
```

### Local Development Workflow

**1. Create DynamoDB Tables Locally**:

```bash
# Create tables in LocalStack
aws dynamodb create-table \
  --table-name anthem-rankings-local \
  --attribute-definitions AttributeName=country_id,AttributeType=S \
  --key-schema AttributeName=country_id,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url http://localhost:4566

aws dynamodb create-table \
  --table-name sessions-local \
  --attribute-definitions AttributeName=session_id,AttributeType=S \
  --key-schema AttributeName=session_id,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url http://localhost:4566

aws dynamodb create-table \
  --table-name vote-history-local \
  --attribute-definitions \
    AttributeName=vote_id,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=vote_id,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url http://localhost:4566

# Seed initial data (all countries start at 1500 ELO)
aws dynamodb batch-write-item \
  --request-items file://seed-data.json \
  --endpoint-url http://localhost:4566
```

**2. Configure SAM to Use LocalStack**:

Create `sam/game/samconfig-local.toml`:
```toml
[local]
[local.local_invoke]
docker_network = "bridge"

[local.local_invoke.parameters]
parameter_overrides = [
  "DynamoDBEndpoint=http://host.docker.internal:4566",
  "Environment=local"
]
```

**3. Build Lambda Functions**:

```bash
cd sam/game
sam build
```

**4. Test Lambda Functions Locally**:

```bash
# Test session function
sam local invoke SessionFunction \
  --event events/session.json \
  --env-vars env-local.json \
  --docker-network host

# Test matchup function
sam local invoke MatchupFunction \
  --event events/matchup.json \
  --env-vars env-local.json \
  --docker-network host

# Test vote function
sam local invoke VoteFunction \
  --event events/vote.json \
  --env-vars env-local.json \
  --docker-network host
```

**Environment Variables** (`env-local.json`):
```json
{
  "SessionFunction": {
    "DYNAMODB_ENDPOINT": "http://host.docker.internal:4566",
    "SESSIONS_TABLE": "sessions-local",
    "ENVIRONMENT": "local"
  },
  "MatchupFunction": {
    "DYNAMODB_ENDPOINT": "http://host.docker.internal:4566",
    "RANKINGS_TABLE": "anthem-rankings-local",
    "MATCHUP_HISTORY_TABLE": "matchup-history-local",
    "ENVIRONMENT": "local"
  },
  "VoteFunction": {
    "DYNAMODB_ENDPOINT": "http://host.docker.internal:4566",
    "RANKINGS_TABLE": "anthem-rankings-local",
    "VOTE_HISTORY_TABLE": "vote-history-local",
    "SESSIONS_TABLE": "sessions-local",
    "ENVIRONMENT": "local"
  }
}
```

**5. Run API Gateway Locally**:

```bash
# Start local API Gateway (proxies to Lambda functions)
sam local start-api \
  --port 3001 \
  --env-vars env-local.json \
  --docker-network host

# API now available at http://localhost:3001
```

**6. Test API Endpoints**:

```bash
# Create session
curl http://localhost:3001/api/game/session

# Get matchup
curl "http://localhost:3001/api/game/matchup?session_id=<uuid>"

# Submit vote
curl -X POST http://localhost:3001/api/game/vote \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "uuid",
    "matchup_id": "uuid",
    "winner_id": "usa",
    "loser_id": "gbr",
    "listen_duration": {"winner": 45, "loser": 38}
  }'

# Get leaderboard
curl http://localhost:3001/api/leaderboard
```

**7. Run Hugo with Local API**:

Configure Hugo to point to local API during development:

```javascript
// hugo/site/static/js/game.js
const API_BASE_URL = 
  window.location.hostname === 'localhost' 
    ? 'http://localhost:3001/api' 
    : 'https://api.anthemworld.com/api';
```

Start Hugo dev server:
```bash
hugo server -s hugo/site -D
```

**8. Full Local Testing Flow**:

```bash
# Terminal 1: Start LocalStack
localstack start

# Terminal 2: Create tables and seed data
./scripts/setup-local-db.sh

# Terminal 3: Start SAM local API
cd sam/game && sam local start-api --env-vars env-local.json

# Terminal 4: Start Hugo dev server
hugo server -s hugo/site -D

# Browser: Open http://localhost:1313/game
# Game page now talks to local Lambda functions via LocalStack DynamoDB
```

### Testing Integration

**Unit Tests** (Lambda function logic):
```bash
cd sam/game/src/vote
npm test
```

**Integration Tests** (with LocalStack):
```bash
# Use Jest or Mocha with LocalStack
cd sam/game
npm run test:integration
```

**E2E Tests** (with Playwright):
```bash
cd tests/playwright
npm run test:game -- --headed
```

### Debugging

**Lambda Function Logs**:
```bash
# SAM local shows logs in terminal
sam local invoke VoteFunction --event events/vote.json --debug
```

**DynamoDB Inspection**:
```bash
# Query local tables
aws dynamodb scan \
  --table-name anthem-rankings-local \
  --endpoint-url http://localhost:4566

# Get specific item
aws dynamodb get-item \
  --table-name anthem-rankings-local \
  --key '{"country_id": {"S": "usa"}}' \
  --endpoint-url http://localhost:4566
```

**Clean LocalStack Data**:
```bash
# Delete all tables and start fresh
aws dynamodb delete-table --table-name anthem-rankings-local --endpoint-url http://localhost:4566
aws dynamodb delete-table --table-name sessions-local --endpoint-url http://localhost:4566
aws dynamodb delete-table --table-name vote-history-local --endpoint-url http://localhost:4566

# Re-run setup script
./scripts/setup-local-db.sh
```

### CI/CD with LocalStack

**GitHub Actions** (`.github/workflows/game-tests.yml`):
```yaml
name: Game Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack
        ports:
          - 4566:4566
        env:
          SERVICES: dynamodb,lambda,apigateway
    
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - uses: aws-actions/setup-sam@v2
      
      - name: Setup LocalStack tables
        run: |
          pip install awscli-local
          ./scripts/setup-local-db.sh
      
      - name: Build SAM
        run: cd sam/game && sam build
      
      - name: Run integration tests
        run: cd sam/game && npm run test:integration
```

### Benefits of LocalStack Approach

✅ **Fast iteration**: No AWS costs, instant feedback  
✅ **Offline development**: Work without internet connection  
✅ **Reproducible**: Same environment across team  
✅ **Safe testing**: No risk of corrupting production data  
✅ **CI/CD friendly**: Easy to integrate in automated tests  
✅ **Full AWS API parity**: LocalStack mimics real AWS services

### Deployment

```bash
# Deploy game service
cd sam/game
sam build
sam deploy --guided

# Deploy leaderboard service
cd sam/leaderboard
sam build
sam deploy --guided
```

### Testing

```bash
# Unit tests
cd sam/game
npm test

# Integration tests
sam local invoke MatchupFunction -e events/matchup-event.json

# E2E tests
cd tests/playwright
npm run test:game
```

## Analytics & Insights

### Potential Analytics
- **Geographic Trends**: Which countries prefer which anthems?
- **Cultural Insights**: Do neighbors vote similarly?
- **Anthem Characteristics**: Do faster/slower anthems rank higher?
- **Time-based Patterns**: When are users most active?
- **Session Engagement**: How many votes per session?

### Future Enhancements
- User accounts (optional) with personal stats
- Daily challenges (vote on 10 matchups)
- Achievement system (badges for milestones)
- Social sharing (share favorite anthem)
- Anthem playlist generation based on preferences
- Historical ranking graphs
- Tournament mode (bracket-style competition)
- Regional leaderboards (by continent)

## Privacy Considerations

- **Anonymous by Default**: No personal data collected without consent
- **IP Masking**: Store hashed IPs, not raw addresses
- **Session Expiry**: Auto-delete sessions after 30 days
- **GDPR Compliance**: Allow data export/deletion on request
- **Cookie Consent**: Required for session tracking
- **Transparent Data Use**: Clear privacy policy

## Cost Estimates (AWS)

**Monthly Costs (approximate)**:
- API Gateway: $3.50 per million requests
- Lambda: $0.20 per million requests (1GB memory)
- DynamoDB: $1.25 per million writes, $0.25 per million reads
- CloudFront: $0.085 per GB transfer

**Estimated for 10,000 daily active users**:
- ~50,000 votes/day
- ~$50-100/month total AWS costs

## Implementation Phases

### Phase 1: MVP (Week 1-2)
- [ ] Basic game UI with audio players
- [ ] Session creation and matchup generation
- [ ] Vote submission and ELO calculation
- [ ] Simple leaderboard display

### Phase 2: Polish (Week 3-4)
- [ ] Improved UI/UX with animations
- [ ] Detailed country stats pages
- [ ] Analytics dashboard
- [ ] Performance optimization

### Phase 3: Enhancement (Week 5-6)
- [ ] User accounts (optional)
- [ ] Social features
- [ ] Advanced matchmaking
- [ ] Mobile optimization

## Success Metrics

- **Engagement**: Average votes per session (target: 10+)
- **Retention**: Users returning within 7 days (target: 30%)
- **Completion Rate**: % of matchups completed (target: 80%)
- **Coverage**: All countries receive votes (target: 100%)
- **Performance**: Page load time (target: <2s), API response (target: <500ms)
