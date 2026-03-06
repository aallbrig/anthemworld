/**
 * POST /vote
 * Body: { session_id, matchup_id, winner_id, loser_id, listen_a_ms, listen_b_ms }
 *
 * Validates:
 *   - Session exists and matchup_id matches current matchup
 *   - Both anthems heard for at least MIN_LISTEN_MS (unless session history shows prior listen)
 *   - Session vote count < MAX_VOTES_PER_SESSION per day
 *
 * On success:
 *   - Updates ELO scores
 *   - Stores vote record
 *   - Updates session vote count
 *   - Updates listen history
 *   - Returns updated ELO scores + next matchup hint
 *
 * Response 200: { vote_id, winner: { country_id, new_elo }, loser: { country_id, new_elo } }
 * Response 400: bad request
 * Response 403: session not found
 * Response 422: listen requirements not met
 * Response 429: rate limited
 */
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/db');
const { updateElo, INITIAL_ELO } = require('../shared/elo');
const { ok, badRequest, forbidden, unprocessable, tooManyRequests, serverError, options } = require('../shared/response');

const SESSIONS_TABLE         = process.env.SESSIONS_TABLE;
const RANKINGS_TABLE         = process.env.RANKINGS_TABLE;
const VOTES_TABLE            = process.env.VOTES_TABLE;
const LISTEN_TABLE           = process.env.LISTEN_TABLE;
const MIN_LISTEN_MS          = parseInt(process.env.MIN_LISTEN_MS || '3000', 10);
const MAX_VOTES_PER_SESSION  = parseInt(process.env.MAX_VOTES_PER_SESSION || '100', 10);

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return badRequest('Invalid JSON body');
    }

    const { session_id, matchup_id, winner_id, loser_id, listen_a_ms, listen_b_ms } = body;

    if (!session_id)  return badRequest('session_id is required');
    if (!matchup_id)  return badRequest('matchup_id is required');
    if (!winner_id)   return badRequest('winner_id is required');
    if (!loser_id)    return badRequest('loser_id is required');
    if (winner_id === loser_id) return badRequest('winner_id and loser_id must be different');
    if (typeof listen_a_ms !== 'number' || typeof listen_b_ms !== 'number') {
        return badRequest('listen_a_ms and listen_b_ms must be numbers (milliseconds)');
    }

    try {
        // Load session
        const sessionRes = await db.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id } }));
        if (!sessionRes.Item) return forbidden('Session not found or expired. Create a new session.');

        const session = sessionRes.Item;

        // Validate matchup ID matches the active one
        if (!session.current_matchup || session.current_matchup.matchup_id !== matchup_id) {
            return badRequest('matchup_id does not match your current matchup. Request a new matchup first.');
        }

        // Validate winner/loser are the expected countries
        const { country_a, country_b } = session.current_matchup;
        const validPair = (winner_id === country_a && loser_id === country_b) ||
                          (winner_id === country_b && loser_id === country_a);
        if (!validPair) {
            return badRequest('winner_id/loser_id do not match matchup countries.');
        }

        // Rate limit: max votes per session
        if ((session.vote_count || 0) >= MAX_VOTES_PER_SESSION) {
            return tooManyRequests(`Maximum ${MAX_VOTES_PER_SESSION} votes per session reached.`, 86400);
        }

        // Fetch session listen history for both countries
        const [listenWinnerRes, listenLoserRes] = await Promise.all([
            db.send(new GetCommand({ TableName: LISTEN_TABLE, Key: { pk: `${session_id}#${winner_id}` } })),
            db.send(new GetCommand({ TableName: LISTEN_TABLE, Key: { pk: `${session_id}#${loser_id}` } })),
        ]);

        const priorListenWinner = listenWinnerRes.Item?.total_listen_ms || 0;
        const priorListenLoser  = listenLoserRes.Item?.total_listen_ms  || 0;

        // Determine the listen time submitted for each country in this matchup
        // listen_a_ms is for country_a, listen_b_ms for country_b
        const listenWinner = winner_id === country_a ? listen_a_ms : listen_b_ms;
        const listenLoser  = loser_id  === country_a ? listen_a_ms : listen_b_ms;

        // Check listen requirement: new anthems need MIN_LISTEN_MS, previously heard ones are instant
        const winnerQualifies = (priorListenWinner >= MIN_LISTEN_MS) || (listenWinner >= MIN_LISTEN_MS);
        const loserQualifies  = (priorListenLoser  >= MIN_LISTEN_MS) || (listenLoser  >= MIN_LISTEN_MS);

        if (!winnerQualifies || !loserQualifies) {
            const needed = [];
            if (!winnerQualifies) needed.push({ country_id: winner_id, required_ms: MIN_LISTEN_MS, listened_ms: listenWinner });
            if (!loserQualifies)  needed.push({ country_id: loser_id,  required_ms: MIN_LISTEN_MS, listened_ms: listenLoser });
            return unprocessable(
                `You must listen to each anthem for at least ${MIN_LISTEN_MS / 1000} seconds before voting.`,
                { insufficient_listen: needed }
            );
        }

        // Fetch current ELO scores
        const [winnerRankRes, loserRankRes] = await Promise.all([
            db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id: winner_id } })),
            db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id: loser_id  } })),
        ]);

        const winnerElo = winnerRankRes.Item?.elo_score ?? INITIAL_ELO;
        const loserElo  = loserRankRes.Item?.elo_score  ?? INITIAL_ELO;
        const { winner: newWinnerElo, loser: newLoserElo } = updateElo(winnerElo, loserElo);

        const voteId  = uuidv4();
        const votedAt = new Date().toISOString();
        // TTL: 90 days for vote records
        const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 3600;
        const listenTtl = Math.floor(Date.now() / 1000) + 24 * 3600;

        await Promise.all([
            // Store vote record
            db.send(new PutCommand({
                TableName: VOTES_TABLE,
                Item: { vote_id: voteId, session_id, matchup_id, winner_id, loser_id,
                        listen_a_ms, listen_b_ms, voted_at: votedAt, ttl },
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
            // Update session vote count + clear active matchup
            db.send(new UpdateCommand({
                TableName: SESSIONS_TABLE,
                Key: { session_id },
                UpdateExpression: 'SET vote_count = if_not_exists(vote_count, :z) + :one REMOVE current_matchup',
                ExpressionAttributeValues: { ':z': 0, ':one': 1 },
            })),
            // Update listen history for winner
            db.send(new UpdateCommand({
                TableName: LISTEN_TABLE,
                Key: { pk: `${session_id}#${winner_id}` },
                UpdateExpression: 'SET total_listen_ms = if_not_exists(total_listen_ms, :z) + :ms, #ttl = :ttl',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':z': 0, ':ms': listenWinner, ':ttl': listenTtl },
            })),
            // Update listen history for loser
            db.send(new UpdateCommand({
                TableName: LISTEN_TABLE,
                Key: { pk: `${session_id}#${loser_id}` },
                UpdateExpression: 'SET total_listen_ms = if_not_exists(total_listen_ms, :z) + :ms, #ttl = :ttl',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':z': 0, ':ms': listenLoser, ':ttl': listenTtl },
            })),
        ]);

        return ok({
            vote_id: voteId,
            winner: { country_id: winner_id, old_elo: winnerElo, new_elo: newWinnerElo },
            loser:  { country_id: loser_id,  old_elo: loserElo,  new_elo: newLoserElo },
        });
    } catch (err) {
        console.error('vote error:', err);
        return serverError();
    }
};
