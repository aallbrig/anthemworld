// No OTEL_EXPORTER_OTLP_ENDPOINT + NODE_ENV=test (set by jest) => telemetry inactive.
const telemetry = require('../shared/telemetry');

describe('telemetry (hermetic/no-op contract)', () => {
    test('is inactive without an OTLP endpoint', () => {
        expect(telemetry.ACTIVE).toBe(false);
    });

    test('withTelemetry returns the original handler unchanged when inactive', () => {
        const handler = async () => ({ statusCode: 200 });
        expect(telemetry.withTelemetry('x', handler)).toBe(handler);
    });

    test('record helpers are safe no-ops when inactive', () => {
        expect(() => {
            telemetry.recordVote({ winnerCountry: 'USA', loserCountry: 'FRA', voteCategory: 'bonus' });
            telemetry.recordVote(); // missing args must not throw
            telemetry.recordSessionCreated({ country: 'FR' });
            telemetry.recordMatchupServed({ wildcard: true });
            telemetry.recordListen({ country: 'USA', listenMs: 30000 });
        }).not.toThrow();
    });

    test('flush resolves without a configured provider', async () => {
        await expect(telemetry.flush()).resolves.toBeUndefined();
    });
});
