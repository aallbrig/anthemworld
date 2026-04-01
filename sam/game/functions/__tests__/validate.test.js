const { isValidUUID, isValidWeekId, hashIp, evictOldest } = require('../shared/validate');

describe('isValidUUID', () => {
    test('accepts valid v4 UUIDs', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isValidUUID('6ba7b810-9dad-41d8-80b4-00c04fd430c8')).toBe(true);
    });

    test('accepts uppercase UUIDs', () => {
        expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    test('rejects non-v4 UUIDs', () => {
        // v1 UUID (version digit is 1, not 4)
        expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
    });

    test('rejects non-UUID strings', () => {
        expect(isValidUUID('')).toBe(false);
        expect(isValidUUID('not-a-uuid')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
        expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    test('rejects non-string input', () => {
        expect(isValidUUID(null)).toBe(false);
        expect(isValidUUID(undefined)).toBe(false);
        expect(isValidUUID(123)).toBe(false);
        expect(isValidUUID({})).toBe(false);
    });

    test('rejects extremely long strings', () => {
        expect(isValidUUID('a'.repeat(1000))).toBe(false);
    });
});

describe('isValidWeekId', () => {
    test('accepts valid week IDs', () => {
        expect(isValidWeekId('2026-W01')).toBe(true);
        expect(isValidWeekId('2026-W12')).toBe(true);
        expect(isValidWeekId('2026-W53')).toBe(true);
        expect(isValidWeekId('2000-W09')).toBe(true);
    });

    test('rejects W00', () => {
        expect(isValidWeekId('2026-W00')).toBe(false);
    });

    test('rejects W54+', () => {
        expect(isValidWeekId('2026-W54')).toBe(false);
        expect(isValidWeekId('2026-W99')).toBe(false);
    });

    test('rejects malformed strings', () => {
        expect(isValidWeekId('')).toBe(false);
        expect(isValidWeekId('2026-12')).toBe(false);
        expect(isValidWeekId('2026W12')).toBe(false);
        expect(isValidWeekId('W12')).toBe(false);
        expect(isValidWeekId('not-a-week')).toBe(false);
        expect(isValidWeekId('2026-W1')).toBe(false);  // single digit
    });

    test('rejects non-string input', () => {
        expect(isValidWeekId(null)).toBe(false);
        expect(isValidWeekId(undefined)).toBe(false);
        expect(isValidWeekId(202612)).toBe(false);
    });
});

describe('hashIp', () => {
    test('returns consistent SHA-256 hash', () => {
        const h1 = hashIp('192.168.1.1');
        const h2 = hashIp('192.168.1.1');
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    test('different IPs produce different hashes', () => {
        expect(hashIp('192.168.1.1')).not.toBe(hashIp('10.0.0.1'));
    });

    test('handles null/undefined with fallback', () => {
        expect(hashIp(null)).toBe(hashIp('unknown'));
        expect(hashIp(undefined)).toBe(hashIp('unknown'));
    });
});

describe('evictOldest', () => {
    test('evicts oldest entry when at capacity', () => {
        const cache = new Map();
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        evictOldest(cache, 3);
        expect(cache.size).toBe(2);
        expect(cache.has('a')).toBe(false);
        expect(cache.has('b')).toBe(true);
    });

    test('does nothing when under capacity', () => {
        const cache = new Map();
        cache.set('a', 1);

        evictOldest(cache, 5);
        expect(cache.size).toBe(1);
    });

    test('handles empty map', () => {
        const cache = new Map();
        evictOldest(cache, 5);
        expect(cache.size).toBe(0);
    });
});
