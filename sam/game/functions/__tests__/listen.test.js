process.env.SESSIONS_TABLE = 'sessions';
process.env.RANKINGS_TABLE = 'rankings';
process.env.LISTEN_TABLE = 'listen';

jest.mock('../shared/db', () => ({ send: jest.fn() }));

const { apiEvent, routeDb, db } = require('./helpers');
const { handler } = require('../listen');

const SID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => db.send.mockReset());

describe('POST /listen', () => {
    test('OPTIONS preflight returns 204', async () => {
        expect((await handler(apiEvent({ method: 'OPTIONS' }))).statusCode).toBe(204);
    });

    test('400 on invalid JSON', async () => {
        expect((await handler(apiEvent({ method: 'POST', body: '{bad' }))).statusCode).toBe(400);
    });

    test('400 when events array empty', async () => {
        const res = await handler(apiEvent({ method: 'POST', body: { session_id: SID, events: [] } }));
        expect(res.statusCode).toBe(400);
    });

    test('400 on invalid country_id', async () => {
        const res = await handler(apiEvent({ method: 'POST', body: { session_id: SID, events: [{ country_id: 'XX1', total_listen_ms: 100 }] } }));
        expect(res.statusCode).toBe(400);
    });

    test('403 when session not found', async () => {
        routeDb({ 'GetCommand:sessions': {} });
        const res = await handler(apiEvent({ method: 'POST', body: { session_id: SID, events: [{ country_id: 'USA', total_listen_ms: 100 }] } }));
        expect(res.statusCode).toBe(403);
    });

    test('ingests listen events on the happy path', async () => {
        routeDb({
            'GetCommand:sessions': { Item: { session_id: SID } },
            'GetCommand:rankings': (input) => ({ Item: { country_id: input.Key.country_id, duration_ms: 60000 } }),
            'UpdateCommand:listen': {},
        });
        const res = await handler(apiEvent({
            method: 'POST',
            body: { session_id: SID, events: [
                { country_id: 'USA', total_listen_ms: 30000, max_position_ms: 30000, duration_ms: 60000 },
                { country_id: 'FRA', total_listen_ms: 60000, heard_full_anthem: true },
            ] },
        }));
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).updated).toBe(2);
    });
});
