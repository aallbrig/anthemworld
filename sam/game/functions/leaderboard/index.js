/**
 * GET /leaderboard?limit={n}&stats=true&week_id=2026-W12
 * Returns countries sorted by ELO score descending.
 * Uses a full scan + sort (193 items — acceptable at this scale).
 *
 * When stats=true, also scans VotesTable for aggregate vote statistics:
 *   - total_votes, under_weight_votes, full_weight_votes, bonus_votes
 *   - total_bonus_points, unique_voters (distinct session IDs)
 *   - by_region / by_country breakdowns of vote types
 *
 * Response 200: { countries: [...], total, generated_at, stats?: {...} }
 *   country: { rank, country_id, name, flag_url, elo_score, wins, losses, total_votes, win_rate }
 */
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../shared/db');
const { ok, badRequest, serverError, options } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');
const { isValidWeekId, evictOldest } = require('../shared/validate');

const RANKINGS_TABLE = process.env.RANKINGS_TABLE;
const VOTES_TABLE    = process.env.VOTES_TABLE;

// S-07: Module-level cache for stats computation (avoids full table scan on every request)
// P0/P5: Cache ALL queries (including week-filtered), cap size to prevent memory exhaustion.
const STATS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 60;
const statsCache = new Map(); // key → { body, generatedAt, expiresAt }

// Simple ISO-3166 alpha-3 → UN region mapping (covers 193 UN members)
const REGION_MAP = {
  AFG:'Asia',ALB:'Europe',DZA:'Africa',AND:'Europe',AGO:'Africa',ATG:'Americas',ARG:'Americas',
  ARM:'Asia',AUS:'Oceania',AUT:'Europe',AZE:'Asia',BHS:'Americas',BHR:'Asia',BGD:'Asia',
  BRB:'Americas',BLR:'Europe',BEL:'Europe',BLZ:'Americas',BEN:'Africa',BTN:'Asia',BOL:'Americas',
  BIH:'Europe',BWA:'Africa',BRA:'Americas',BRN:'Asia',BGR:'Europe',BFA:'Africa',BDI:'Africa',
  CPV:'Africa',KHM:'Asia',CMR:'Africa',CAN:'Americas',CAF:'Africa',TCD:'Africa',CHL:'Americas',
  CHN:'Asia',COL:'Americas',COM:'Africa',COG:'Africa',COD:'Africa',CRI:'Americas',CIV:'Africa',
  HRV:'Europe',CUB:'Americas',CYP:'Europe',CZE:'Europe',DNK:'Europe',DJI:'Africa',DMA:'Americas',
  DOM:'Americas',ECU:'Americas',EGY:'Africa',SLV:'Americas',GNQ:'Africa',ERI:'Africa',EST:'Europe',
  SWZ:'Africa',ETH:'Africa',FJI:'Oceania',FIN:'Europe',FRA:'Europe',GAB:'Africa',GMB:'Africa',
  GEO:'Asia',DEU:'Europe',GHA:'Africa',GRC:'Europe',GRD:'Americas',GTM:'Americas',GIN:'Africa',
  GNB:'Africa',GUY:'Americas',HTI:'Americas',HND:'Americas',HUN:'Europe',ISL:'Europe',IND:'Asia',
  IDN:'Asia',IRN:'Asia',IRQ:'Asia',IRL:'Europe',ISR:'Asia',ITA:'Europe',JAM:'Americas',
  JPN:'Asia',JOR:'Asia',KAZ:'Asia',KEN:'Africa',KIR:'Oceania',PRK:'Asia',KOR:'Asia',
  KWT:'Asia',KGZ:'Asia',LAO:'Asia',LVA:'Europe',LBN:'Asia',LSO:'Africa',LBR:'Africa',
  LBY:'Africa',LIE:'Europe',LTU:'Europe',LUX:'Europe',MDG:'Africa',MWI:'Africa',MYS:'Asia',
  MDV:'Asia',MLI:'Africa',MLT:'Europe',MHL:'Oceania',MRT:'Africa',MUS:'Africa',MEX:'Americas',
  FSM:'Oceania',MDA:'Europe',MCO:'Europe',MNG:'Asia',MNE:'Europe',MAR:'Africa',MOZ:'Africa',
  MMR:'Asia',NAM:'Africa',NRU:'Oceania',NPL:'Asia',NLD:'Europe',NZL:'Oceania',NIC:'Americas',
  NER:'Africa',NGA:'Africa',MKD:'Europe',NOR:'Europe',OMN:'Asia',PAK:'Asia',PLW:'Oceania',
  PAN:'Americas',PNG:'Oceania',PRY:'Americas',PER:'Americas',PHL:'Asia',POL:'Europe',PRT:'Europe',
  QAT:'Asia',ROU:'Europe',RUS:'Europe',RWA:'Africa',KNA:'Americas',LCA:'Americas',VCT:'Americas',
  WSM:'Oceania',SMR:'Europe',STP:'Africa',SAU:'Asia',SEN:'Africa',SRB:'Europe',SYC:'Africa',
  SLE:'Africa',SGP:'Asia',SVK:'Europe',SVN:'Europe',SLB:'Oceania',SOM:'Africa',ZAF:'Africa',
  SSD:'Africa',ESP:'Europe',LKA:'Asia',SDN:'Africa',SUR:'Americas',SWE:'Europe',CHE:'Europe',
  SYR:'Asia',TJK:'Asia',TZA:'Africa',THA:'Asia',TLS:'Asia',TGO:'Africa',TON:'Oceania',
  TTO:'Americas',TUN:'Africa',TUR:'Europe',TKM:'Asia',TUV:'Oceania',UGA:'Africa',UKR:'Europe',
  ARE:'Asia',GBR:'Europe',USA:'Americas',URY:'Americas',UZB:'Asia',VUT:'Oceania',VEN:'Americas',
  VNM:'Asia',YEM:'Asia',ZMB:'Africa',ZWE:'Africa',PSE:'Asia',TWN:'Asia',
};

function regionFor(countryId) {
  return REGION_MAP[countryId] || 'Unknown';
}

async function computeVoteStats(weekFilter) {
  const params = { TableName: VOTES_TABLE };
  let items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await db.send(new ScanCommand(params));
    items = items.concat(res.Items || []);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  // Filter by week if requested
  if (weekFilter) {
    items = items.filter(v => v.week_id === weekFilter);
  }

  const sessions = new Set();
  const stats = {
    total_votes: 0,
    under_weight_votes: 0,
    full_weight_votes: 0,
    bonus_votes: 0,
    total_bonus_points: 0,
    unique_voters: 0,
    by_region: {},
    by_country: {},
  };

  for (const v of items) {
    stats.total_votes++;
    if (v.session_id) sessions.add(v.session_id);

    const cat = v.vote_category || 'under_weight';
    if (cat === 'under_weight') stats.under_weight_votes++;
    else if (cat === 'full_weight') stats.full_weight_votes++;
    else if (cat === 'bonus') stats.bonus_votes++;

    if (v.anthem_bonus) {
      stats.total_bonus_points += Math.abs(v.elo_delta_winner || 0) - (32 * (v.vote_weight || 0) / (1 + (v.vote_weight || 1)));
    }

    // By voter country
    const vc = v.voter_country || 'Unknown';
    if (!stats.by_country[vc]) {
      stats.by_country[vc] = { votes: 0, under_weight: 0, full_weight: 0, bonus: 0, bonus_points: 0 };
    }
    stats.by_country[vc].votes++;
    stats.by_country[vc][cat] = (stats.by_country[vc][cat] || 0) + 1;

    // By region
    const region = regionFor(vc);
    if (!stats.by_region[region]) {
      stats.by_region[region] = { votes: 0, under_weight: 0, full_weight: 0, bonus: 0, bonus_points: 0 };
    }
    stats.by_region[region].votes++;
    stats.by_region[region][cat] = (stats.by_region[region][cat] || 0) + 1;
  }

  stats.unique_voters = sessions.size;
  return stats;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();
    const lang = detectLanguage(event.headers);

    const qs       = event.queryStringParameters || {};
    const limit    = Math.min(parseInt(qs.limit || '50', 10), 200);
    const wantStats = qs.stats === 'true';
    const weekId   = qs.week_id || null;

    // P0: Validate week_id format to prevent cache-key flooding and unbounded scans
    if (weekId && !isValidWeekId(weekId)) {
        return badRequest('invalid_week_id', null, lang);
    }

    // S-07/P0: Return cached stats response if available (covers all queries now)
    const cacheKey = `stats:${weekId || 'all'}`;
    if (wantStats) {
        const cached = statsCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            const body = { ...cached.body, cache_hit: true };
            body.countries = cached.body.countries.slice(0, limit);
            return ok(body);
        }
    }

    try {
        const scanRes = await db.send(new ScanCommand({ TableName: RANKINGS_TABLE }));
        const items = scanRes.Items || [];

        items.sort((a, b) => {
            const diff = (b.elo_score || 1500) - (a.elo_score || 1500);
            return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '');
        });

        const ranked = items.map((item, i) => {
            const wins    = item.wins   || 0;
            const losses  = item.losses || 0;
            const total   = wins + losses;
            return {
                rank:        i + 1,
                country_id:  item.country_id,
                name:        item.name || item.country_id,
                flag_url:    item.flag_url || null,
                anthem_name: item.anthem_name || null,
                elo_score:   item.elo_score || 1500,
                wins,
                losses,
                total_votes: total,
                win_rate:    total > 0 ? Math.round((wins / total) * 100) : null,
            };
        });

        const generatedAt = new Date().toISOString();
        const result = {
            countries:    ranked,
            total:        items.length,
            generated_at: generatedAt,
            cache_hit:    false,
        };

        if (wantStats) {
            result.stats = await computeVoteStats(weekId);
            // S-07/P0/P5: Cache all stat responses; evict oldest when full
            evictOldest(statsCache, MAX_CACHE_ENTRIES);
            statsCache.set(cacheKey, { body: result, expiresAt: Date.now() + STATS_CACHE_TTL_MS });
        }

        // Apply limit after caching so the cache stores the full ranked list
        result.countries = ranked.slice(0, limit);
        return ok(result);
    } catch (err) {
        console.error('leaderboard error:', err);
        return serverError(null, lang);
    }
};
