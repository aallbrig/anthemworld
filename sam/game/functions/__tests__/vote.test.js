process.env.SESSIONS_TABLE = 'sessions';
process.env.RANKINGS_TABLE = 'rankings';
process.env.VOTES_TABLE = 'votes';
process.env.LISTEN_TABLE = 'listen';
process.env.MAX_VOTES_PER_SESSION = '100';

jest.mock('../shared/db', () => ({ send: jest.fn() }));

const { apiEvent, routeDb, db } = require('./helpers');
const { handler } = require('../vote');

const SID = '11111111-1111-4111-8111-111111111111';
const MID = '22222222-2222-4222-8222-222222222222';

function happyRoutes(overrides = {}) {
    return {
        'GetCommand:sessions': { Item: { session_id: SID, vote_count: 0, current_matchup: { matchup_id: MID, country_a: 'USA', country_b: 'FRA' } } },
        'GetCommand:rankings': (input) => ({ Item: { country_id: input.Key.country_id, elo_score: 1500, duration_ms: 60000 } }),
        'GetCommand:listen': {},
        'PutCommand:votes': {},
        'UpdateCommand:rankings': {},
        'UpdateCommand:sessions': {},
        'UpdateCommand:listen': {},
        ...overrides,
    };
}

const validBody = {
    session_id: SID, matchup_id: MID, winner_id: 'USA', loser_id: 'FRA',
    listen_a_ms: 60000, listen_b_ms: 60000,
};

beforeEach(() => db.send.mockReset());

describe('POST /vote', () => {
    test('OPTIONS preflight returns 204', async () => {
        expect((await handler(apiEvent({ method: 'OPTIONS' }))).statusCode).toBe(204);
    });

    test('400 on invalid JSON', async () => {
        const res = await handler(apiEvent({ method: 'POST', body: '{not json' }));
        expect(res.statusCode).toBe(400);
    });

    test('400 when required fields missing', async () => {
        const res = await handler(apiEvent({ method: 'POST', body: { session_id: SID } }));
        expect(res.statusCode).toBe(400);
    });

    test('400 when winner equals loser', async () => {
        const res = await handler(apiEvent({ method: 'POST', body: { ...validBody, loser_id: 'USA' } }));
        expect(res.statusCode).toBe(400);
    });

    test('403 when session not found', async () => {
        routeDb({ 'GetCommand:sessions': {} });
        const res = await handler(apiEvent({ method: 'POST', body: validBody }));
        expect(res.statusCode).toBe(403);
    });

    test('records a vote and returns updated ELO on the happy path', async () => {
        routeDb(happyRoutes());
        const res = await handler(apiEvent({ method: 'POST', body: validBody }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.vote_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.winner.country_id).toBe('USA');
        expect(body.loser.country_id).toBe('FRA');
        expect(body.winner.new_elo).toBeGreaterThan(body.winner.old_elo);
    });

    test('400 when matchup_id does not match current matchup', async () => {
        routeDb(happyRoutes({
            'GetCommand:sessions': { Item: { session_id: SID, current_matchup: { matchup_id: '33333333-3333-4333-8333-333333333333', country_a: 'USA', country_b: 'FRA' } } },
        }));
        const res = await handler(apiEvent({ method: 'POST', body: validBody }));
        expect(res.statusCode).toBe(400);
    });

    test('429 when daily vote cap reached', async () => {
        const today = new Date().toISOString().slice(0, 10);
        routeDb(happyRoutes({
            'GetCommand:sessions': { Item: { session_id: SID, vote_date: today, vote_count_today: 100, current_matchup: { matchup_id: MID, country_a: 'USA', country_b: 'FRA' } } },
        }));
        const res = await handler(apiEvent({ method: 'POST', body: validBody }));
        expect(res.statusCode).toBe(429);
    });
});
