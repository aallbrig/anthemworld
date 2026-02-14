# National Anthem Game & Leaderboard

## Overview

A "Hot or Not" style ranking game where users compare national anthems from around the world. Users listen to two anthems and vote for their favorite. The system uses an ELO-style ranking algorithm to match similarly-ranked countries and maintain a global leaderboard.

## Game Features

### Core Gameplay
1. **Anthem Comparison**: Present two national anthems side-by-side
2. **Minimum Listen Time**: Users must listen to at least 5 seconds of each anthem before voting
3. **Voting**: Simple interface to choose preferred anthem
4. **Ranking System**: ELO/MMR-style ranking to match similarly-ranked anthems
5. **Continuous Play**: After voting, immediately present next matchup
6. **Leaderboard**: Real-time global rankings of all 193 countries

### User Experience
- Clean, intuitive interface
- Audio controls for each anthem (play, pause, volume)
- Country information displayed (name, flag, anthem details)
- Progress indicator showing listen time
- Vote button disabled until minimum listen time met
- Animation/transition to next matchup

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
1. Find countries within ±200 ELO points
2. Avoid recent matchups (cache last 10 matchups per session)
3. Prefer countries with fewer total votes (balance data collection)
4. Random selection within eligible pool

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

### Leaderboard API (`/api/leaderboard`)

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
