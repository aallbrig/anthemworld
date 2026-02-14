# Implementation Notes - Map & Game Features

## Map Improvements

### Clickable Country Boundaries

**Current State**: Map shows sample markers at country coordinates

**Required**: Full country polygons that are clickable anywhere within the country

**Implementation Steps**:

1. **Download GeoJSON Data**:
   ```bash
   # Option 1: datasets/geo-countries (easiest)
   wget https://github.com/datasets/geo-countries/raw/master/data/countries.geojson
   mv countries.geojson hugo/site/static/data/
   
   # Option 2: Natural Earth Data (best quality)
   # Download from https://www.naturalearthdata.com/downloads/50m-cultural-vectors/
   # Select "Admin 0 – Countries" shapefile
   # Convert to GeoJSON using ogr2ogr or online tool
   
   # Option 3: World Atlas TopoJSON (best performance)
   wget https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
   # Convert TopoJSON to GeoJSON using topojson-client
   ```

2. **Add Native Country Names**:
   - Merge with mluqmaan/world-countries-json data
   - Or query Wikidata for native names
   - Add as `native_name` property to each country feature

3. **Update map.js**:
   ```javascript
   fetch('/data/countries.geojson')
     .then(response => response.json())
     .then(data => {
       L.geoJSON(data, {
         style: { 
           fillColor: '#0d6efd', 
           weight: 1, 
           color: 'white',
           fillOpacity: 0.4 
         },
         onEachFeature: (feature, layer) => {
           layer.on('click', () => {
             showCountryInfo(feature.properties);
           });
           layer.bindTooltip(
             `${feature.properties.name}<br><em>${feature.properties.native_name}</em>`
           );
         }
       }).addTo(map);
     });
   ```

### OpenStreetMap Customization

**Goal**: Show only country names, hide city/road labels

**Options**:

1. **Stamen Toner Lite** (Recommended - Easiest):
   ```javascript
   L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}{r}.png', {
     attribution: 'Map tiles by Stamen Design, under CC BY 3.0',
     subdomains: 'abcd',
     maxZoom: 18
   }).addTo(map);
   ```

2. **MapBox with Custom Style** (Most Control):
   - Create free MapBox account
   - Design custom style hiding everything except country labels
   - Use MapBox GL JS or raster tiles

3. **Thunderforest Transport**:
   ```javascript
   L.tileLayer('https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey={apikey}', {
     attribution: 'Maps © Thunderforest',
     maxZoom: 18
   }).addTo(map);
   ```

4. **CSS Filter on Existing Tiles**:
   ```css
   .leaflet-tile-pane {
     filter: grayscale(100%) brightness(110%) contrast(90%);
   }
   ```

5. **No Tiles, Just Boundaries**:
   - Don't load any tile layer
   - Set map background to light color
   - Only show GeoJSON country boundaries
   - Pros: Fastest, cleanest
   - Cons: No geographic context

**Recommendation**: Start with Stamen Toner Lite (no API key needed), evaluate if it meets needs.

## Game Feature

### Architecture Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │ <────> │  API Gateway │ <────> │   Lambda    │
│  (Hugo/JS)  │  HTTPS  │              │         │  Functions  │
└─────────────┘         └──────────────┘         └─────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │  DynamoDB   │
                                                  │   Tables    │
                                                  └─────────────┘
```

### Data Flow

1. **User Visits `/game`**:
   - Frontend creates session via `GET /api/game/session`
   - Receives session ID and detected country
   - Stores in localStorage

2. **Get First Matchup**:
   - Frontend calls `GET /api/game/matchup?session_id={id}`
   - Lambda queries DynamoDB for two countries with similar ELO
   - Returns country data with anthem URLs

3. **User Listens and Votes**:
   - Frontend enforces 5-second listen time
   - User clicks vote button
   - Frontend calls `POST /api/game/vote` with winner/loser
   - Lambda updates ELO scores in DynamoDB
   - Returns next matchup immediately

4. **View Leaderboard**:
   - Frontend calls `GET /api/leaderboard`
   - Lambda queries DynamoDB rankings table
   - Returns sorted list with pagination

### ELO Calculation Example

```javascript
// Initial: USA = 1500, Canada = 1500

// Expected scores
E_usa = 1 / (1 + 10^((1500-1500)/400)) = 0.5
E_can = 1 / (1 + 10^((1500-1500)/400)) = 0.5

// USA wins (actual score = 1)
USA_new = 1500 + 32 * (1 - 0.5) = 1516
CAN_new = 1500 + 32 * (0 - 0.5) = 1484

// Next matchup: USA (1516) vs UK (1520)
E_usa = 1 / (1 + 10^((1520-1516)/400)) = 0.497
E_uk = 1 / (1 + 10^((1516-1520)/400)) = 0.503

// UK wins
USA_new = 1516 + 32 * (0 - 0.497) = 1500
UK_new = 1520 + 32 * (1 - 0.503) = 1536
```

### Development Workflow

1. **Set Up AWS**:
   ```bash
   # Install SAM CLI
   pip install aws-sam-cli
   
   # Configure AWS
   aws configure
   ```

2. **Create Lambda Functions** (Node.js example):
   ```javascript
   // functions/matchup/index.js
   const AWS = require('aws-sdk');
   const dynamo = new AWS.DynamoDB.DocumentClient();
   
   exports.handler = async (event) => {
     const sessionId = event.queryStringParameters.session_id;
     
     // Get two countries with similar ELO
     const countries = await getMatchup(sessionId);
     
     return {
       statusCode: 200,
       headers: { 'Access-Control-Allow-Origin': '*' },
       body: JSON.stringify({ countries })
     };
   };
   ```

3. **Test Locally**:
   ```bash
   cd sam/game
   sam local start-api --port 3001
   curl http://localhost:3001/matchup?session_id=test
   ```

4. **Deploy**:
   ```bash
   sam build
   sam deploy --guided
   ```

5. **Update Hugo Config**:
   ```javascript
   // static/js/game.js
   const API_BASE = 'https://xyz.execute-api.us-east-1.amazonaws.com/prod';
   ```

### Cost Optimization

- Use DynamoDB on-demand pricing (pay per request)
- Cache leaderboard in CloudFront (update every 5 minutes)
- Use Lambda@Edge for session creation (closer to users)
- Enable DynamoDB auto-scaling for traffic spikes
- Set TTL on session records (auto-delete after 30 days)

### Security

- Enable API Gateway throttling (1000 req/sec per IP)
- Validate all inputs in Lambda
- Use API keys for production
- Hash IP addresses before storing
- Enable CloudWatch logs for debugging
- Set up AWS WAF rules for DDoS protection

## Next Steps

1. Download and integrate GeoJSON country boundaries
2. Test different tile providers for optimal map display
3. Create SAM project structure with template.yaml
4. Implement basic Lambda functions locally
5. Build game UI prototype
6. Test ELO algorithm with sample data
7. Deploy to AWS dev environment
8. Create integration tests
9. Launch MVP for beta testing
10. Gather feedback and iterate

See `docs/game.md` for complete feature specification.
