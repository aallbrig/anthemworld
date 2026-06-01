process.env.SESSIONS_TABLE = 'sessions';
process.env.MAX_SESSIONS_PER_IP = '5';

jest.mock('../shared/db', () => ({ send: jest.fn() }));

const { apiEvent, routeDb, db } = require('./helpers');
const { handler } = require('../session');

beforeEach(() => db.send.mockReset());

describe('POST /session', () => {
    test('OPTIONS preflight returns 204', async () => {
        const res = await handler(apiEvent({ method: 'OPTIONS' }));
        expect(res.statusCode).toBe(204);
    });

    test('creates a session when under the per-IP limit', async () => {
        routeDb({
            'QueryCommand:sessions': { Count: 0 },
            'PutCommand:sessions': {},
        });
        const res = await handler(apiEvent({ method: 'POST' }));
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body.session_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body).toHaveProperty('created_at');
    });

    test('captures user_country from CloudFront header', async () => {
        routeDb({ 'QueryCommand:sessions': { Count: 0 }, 'PutCommand:sessions': {} });
        const res = await handler(apiEvent({ method: 'POST', headers: { 'CloudFront-Viewer-Country': 'FR' } }));
        expect(JSON.parse(res.body).user_country).toBe('FR');
    });

    test('rate-limits when per-IP daily cap reached', async () => {
        routeDb({ 'QueryCommand:sessions': { Count: 5 } });
        const res = await handler(apiEvent({ method: 'POST' }));
        expect(res.statusCode).toBe(429);
    });

    test('returns 500 when DynamoDB fails', async () => {
        db.send.mockRejectedValue(new Error('boom'));
        const res = await handler(apiEvent({ method: 'POST' }));
        expect(res.statusCode).toBe(500);
    });
});
