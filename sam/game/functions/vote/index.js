/**
 * POST /vote
 * Body: { session_id, matchup_id, winner_id, loser_id, listen_a_ms, listen_b_ms }
 *
 * Validates:
 *   - Session exists and matchup_id matches current matchup
 *   - Session vote count < MAX_VOTES_PER_SESSION per day
 *
 * ELO is weighted by cumulative listen time for each anthem (any round):
 *   - Full weight (1.0) when both anthems heard ≥ FULL_LISTEN_MS (10 s)
 *   - Partial weight proportional to listen time otherwise
 *   - Minimum ±0.25 ELO change ensures every genuine vote counts
 *   - vote_weight = listenWeight(winner) × listenWeight(loser)
 *
 * Security mitigations:
 *   S-01: listen_a_ms/listen_b_ms capped at 2× anthem duration_ms from rankings table
 *   S-01: full_anthem flags ignored when listen_ms < anthem duration_ms
 *   S-05: expired sessions rejected with 403
 *   S-08: vote_count (lifetime) incremented so wildcard logic in /matchup works
 *
 * On success:
 *   - Updates ELO scores (decimal, scaled by vote_weight, floored at ±0.25)
 *   - Stores vote record with ip_hash, voter_country, vote_category, week_id
 *   - Updates session vote count (daily + lifetime)
 *   - Updates listen history
 *   - Returns updated ELO scores + vote_weight + vote_category
 *
 * Response 200: { vote_id, vote_weight, vote_category, winner: { ... }, loser: { ... } }
 * Response 400: bad request
 * Response 403: session not found / expired
 * Response 429: rate limited
 */
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/db');
const { updateElo, INITIAL_ELO } = require('../shared/elo');
const { ok, badRequest, forbidden, tooManyRequests, serverError, options } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');
const { isoWeekId } = require('../shared/week');

const SESSIONS_TABLE         = process.env.SESSIONS_TABLE;
const RANKINGS_TABLE         = process.env.RANKINGS_TABLE;
const VOTES_TABLE            = process.env.VOTES_TABLE;
const LISTEN_TABLE           = process.env.LISTEN_TABLE;
const MAX_VOTES_PER_SESSION  = parseInt(process.env.MAX_VOTES_PER_SESSION || '100', 10);

/** Default max listen duration cap when ranking has no duration_ms (10 minutes). */
const DEFAULT_MAX_DURATION_MS = 10 * 60 * 1000;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();
    const lang = detectLanguage(event.headers);

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return badRequest('vote_invalid_json', null, lang);
    }

    const { session_id, matchup_id, winner_id, loser_id, listen_a_ms, listen_b_ms,
            full_anthem_a, full_anthem_b } = body;

    if (!session_id)  return badRequest('vote_session_required', null, lang);
    if (!matchup_id)  return badRequest('vote_matchup_required', null, lang);
    if (!winner_id)   return badRequest('vote_winner_required', null, lang);
    if (!loser_id)    return badRequest('vote_loser_required', null, lang);
    if (winner_id === loser_id) return badRequest('vote_same_country', null, lang);
    if (typeof listen_a_ms !== 'number' || typeof listen_b_ms !== 'number') {
        return badRequest('vote_listen_numbers', null, lang);
    }

    try {
        // Load session
        const sessionRes = await db.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id } }));
        if (!sessionRes.Item) return forbidden('session_not_found', null, lang);

        const session = sessionRes.Item;

        // S-05: Reject expired sessions server-side
        const now = Math.floor(Date.now() / 1000);
        if (session.ttl && session.ttl < now) {
            return forbidden('session_expired', null, lang);
        }

        // Validate matchup ID matches the active one
        if (!session.current_matchup || session.current_matchup.matchup_id !== matchup_id) {
            return badRequest('vote_matchup_mismatch', null, lang);
        }

        // Validate winner/loser are the expected countries
        const { country_a, country_b } = session.current_matchup;
        const validPair = (winner_id === country_a && loser_id === country_b) ||
                          (winner_id === country_b && loser_id === country_a);
        if (!validPair) {
            return badRequest('vote_pair_mismatch', null, lang);
        }

        // Rate limit: max votes per calendar day (UTC) per session
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const voteToday = session.vote_date === today ? (session.vote_count_today || 0) : 0;
        if (voteToday >= MAX_VOTES_PER_SESSION) {
            return tooManyRequests('vote_limit_reached', 86400, lang, { max: MAX_VOTES_PER_SESSION });
        }

        // Fetch rankings for both matchup countries to get duration_ms (needed for S-01 cap)
        const [rankResA, rankResB] = await Promise.all([
            db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id: country_a } })),
            db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id: country_b } })),
        ]);
        const rankingsMap = {
            [country_a]: rankResA.Item,
            [country_b]: rankResB.Item,
        };

        // S-01: Cap submitted listen times at 2× anthem duration to prevent ELO inflation
        const durationA = rankingsMap[country_a]?.duration_ms || DEFAULT_MAX_DURATION_MS;
        const durationB = rankingsMap[country_b]?.duration_ms || DEFAULT_MAX_DURATION_MS;
        const cappedListenA = Math.min(Math.max(0, listen_a_ms), 2 * durationA);
        const cappedListenB = Math.min(Math.max(0, listen_b_ms), 2 * durationB);

        // S-01: Only trust full_anthem flags when actual listen time meets anthem duration
        const validFullAnthemA = !!full_anthem_a && cappedListenA >= durationA;
        const validFullAnthemB = !!full_anthem_b && cappedListenB >= durationB;

        // Fetch session listen history for both countries
        const [listenWinnerRes, listenLoserRes] = await Promise.all([
            db.send(new GetCommand({ TableName: LISTEN_TABLE, Key: { pk: `${session_id}#${winner_id}` } })),
            db.send(new GetCommand({ TableName: LISTEN_TABLE, Key: { pk: `${session_id}#${loser_id}` } })),
        ]);

        const priorListenWinner = listenWinnerRes.Item?.total_listen_ms || 0;
        const priorListenLoser  = listenLoserRes.Item?.total_listen_ms  || 0;

        // Map capped listen values to winner/loser
        const cappedListenWinner = winner_id === country_a ? cappedListenA : cappedListenB;
        const cappedListenLoser  = loser_id  === country_a ? cappedListenA : cappedListenB;

        // Compute cumulative listen time (prior history + this round)
        const totalListenWinner = priorListenWinner + cappedListenWinner;
        const totalListenLoser  = priorListenLoser  + cappedListenLoser;

        // Map validated full_anthem flags to winner/loser
        const fullAnthemWinner = winner_id === country_a ? validFullAnthemA : validFullAnthemB;
        const fullAnthemLoser  = loser_id  === country_a ? validFullAnthemA : validFullAnthemB;

        const winnerElo = rankingsMap[winner_id]?.elo_score ?? INITIAL_ELO;
        const loserElo  = rankingsMap[loser_id]?.elo_score  ?? INITIAL_ELO;

        const { winner: newWinnerElo, loser: newLoserElo, vote_weight, anthem_bonus,
                vote_category, elo_delta_winner, elo_delta_loser } =
            updateElo(winnerElo, loserElo, totalListenWinner, totalListenLoser, fullAnthemWinner, fullAnthemLoser);

        const voteId  = uuidv4();
        const votedAt = new Date().toISOString();
        const weekId  = isoWeekId();
        // TTL: 90 days for vote records
        const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 3600;
        const listenTtl = Math.floor(Date.now() / 1000) + 24 * 3600;

        // S-08: Increment both vote_count_today (daily cap) and vote_count (lifetime, used for wildcard)
        const newVoteCount = (session.vote_count || 0) + 1;

        await Promise.all([
            // Store vote record with analytics fields
            db.send(new PutCommand({
                TableName: VOTES_TABLE,
                Item: {
                    vote_id: voteId, session_id, matchup_id, winner_id, loser_id,
                    listen_a_ms: cappedListenA, listen_b_ms: cappedListenB,
                    voted_at: votedAt, ttl,
                    ip_hash: session.ip_hash || null,
                    voter_country: session.user_country || null,
                    vote_weight, vote_category,
                    elo_delta_winner, elo_delta_loser,
                    anthem_bonus: !!anthem_bonus,
                    week_id: weekId,
                },
            })),
            // Update winner ELO
            db.send(new UpdateCommand({
                TableName: RANKINGS_TABLE,
                Key: { country_id: winner_id },
                UpdateExpression: 'SET elo_score = :e, wins = if_not_exists(wins, :z) + :one, updated_at = :t',
                ExpressionAttributeValues: { ':e': newWinnerElo, ':z': 0, ':one': 1, ':t': votedAt },
            })),
            // Update loser ELO
            db.send(new UpdateCommand({
                TableName: RANKINGS_TABLE,
                Key: { country_id: loser_id },
                UpdateExpression: 'SET elo_score = :e, losses = if_not_exists(losses, :z) + :one, updated_at = :t',
                ExpressionAttributeValues: { ':e': newLoserElo, ':z': 0, ':one': 1, ':t': votedAt },
            })),
            // S-08: Update both lifetime vote_count and daily vote_count_today; clear active matchup
            db.send(new UpdateCommand({
                TableName: SESSIONS_TABLE,
                Key: { session_id },
                UpdateExpression: 'SET vote_count = :vc, vote_count_today = :new_count, vote_date = :today REMOVE current_matchup',
                ExpressionAttributeValues: {
                    ':vc': newVoteCount,
                    ':new_count': voteToday + 1,
                    ':today': today,
                },
            })),
            // Update listen history for winner
            db.send(new UpdateCommand({
                TableName: LISTEN_TABLE,
                Key: { pk: `${session_id}#${winner_id}` },
                UpdateExpression: 'SET total_listen_ms = :total, #ttl = :ttl',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':total': totalListenWinner, ':ttl': listenTtl },
            })),
            // Update listen history for loser
            db.send(new UpdateCommand({
                TableName: LISTEN_TABLE,
                Key: { pk: `${session_id}#${loser_id}` },
                UpdateExpression: 'SET total_listen_ms = :total, #ttl = :ttl',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':total': totalListenLoser, ':ttl': listenTtl },
            })),
        ]);

        return ok({
            vote_id:       voteId,
            vote_weight,
            vote_category,
            anthem_bonus:  !!anthem_bonus,
            elo_delta_winner,
            elo_delta_loser,
            week_id:       weekId,
            winner: { country_id: winner_id, old_elo: winnerElo, new_elo: newWinnerElo },
            loser:  { country_id: loser_id,  old_elo: loserElo,  new_elo: newLoserElo },
        });
    } catch (err) {
        console.error('vote error:', err);
        return serverError(null, lang);
    }
};
