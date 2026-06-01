process.env.SESSIONS_TABLE = 'sessions';
process.env.RANKINGS_TABLE = 'rankings';
process.env.LISTEN_TABLE = 'listen';
process.env.MAX_MATCHUPS_PER_SESSION = '300';

jest.mock('../shared/db', () => ({ send: jest.fn() }));

const { apiEvent, routeDb, db } = require('./helpers');
const { handler } = require('../matchup');

const SID = '11111111-1111-4111-8111-111111111111';

const RANKINGS = [
    { country_id: 'USA', name: 'United States', audio_url: 'a.mp3', elo_score: 1500, duration_ms: 60000 },
    { country_id: 'FRA', name: 'France',        audio_url: 'b.mp3', elo_score: 1510, duration_ms: 60000 },
    { country_id: 'JPN', name: 'Japan',         audio_url: 'c.mp3', elo_score: 1490, duration_ms: 60000 },
];

beforeEach(() => db.send.mockReset());

describe('GET /matchup', () => {
    test('OPTIONS preflight returns 204', async () => {
        expect((await handler(apiEvent({ method: 'OPTIONS' }))).statusCode).toBe(204);
    });

    test('400 when session_id missing', async () => {
        expect((await handler(apiEvent({}))).statusCode).toBe(400);
    });

    test('400 when session_id is malformed', async () => {
        const res = await handler(apiEvent({ headers: { 'X-Session-Id': 'not-a-uuid' } }));
        expect(res.statusCode).toBe(400);
    });

    test('403 when session not found', async () => {
        routeDb({ 'GetCommand:sessions': {} });
        const res = await handler(apiEvent({ headers: { 'X-Session-Id': SID } }));
        expect(res.statusCode).toBe(403);
    });

    test('403 when session expired', async () => {
        routeDb({ 'GetCommand:sessions': { Item: { session_id: SID, ttl: 1 } } });
        const res = await handler(apiEvent({ headers: { 'X-Session-Id': SID } }));
        expect(res.statusCode).toBe(403);
    });

    test('returns a matchup pair on the happy path', async () => {
        routeDb({
            'GetCommand:sessions': { Item: { session_id: SID, vote_count: 0 } },
            'ScanCommand:rankings': { Items: RANKINGS },
            'GetCommand:listen': {},
            'UpdateCommand:sessions': {},
        });
        const res = await handler(apiEvent({ headers: { 'X-Session-Id': SID } }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.matchup_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.country_a.country_id).toBeDefined();
        expect(body.country_b.country_id).toBeDefined();
        expect(body.country_a.country_id).not.toBe(body.country_b.country_id);
    });

    test('429 when daily matchup cap reached', async () => {
        const today = new Date().toISOString().slice(0, 10);
        routeDb({
            'GetCommand:sessions': { Item: { session_id: SID, matchup_date: today, matchup_count_today: 300 } },
        });
        const res = await handler(apiEvent({ headers: { 'X-Session-Id': SID } }));
        expect(res.statusCode).toBe(429);
    });
});
