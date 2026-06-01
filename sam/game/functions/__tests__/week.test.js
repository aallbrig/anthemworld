const { isoWeekId } = require('../shared/week');

// Helper: build a UTC Date without worrying about local timezone offsets.
const utc = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

describe('isoWeekId', () => {

    // ── output format ─────────────────────────────────────────────────────────

    test('returns a string matching YYYY-Wnn format', () => {
        expect(isoWeekId(utc(2026, 3, 19))).toMatch(/^\d{4}-W\d{2}$/);
    });

    test('single-digit weeks are zero-padded', () => {
        // Jan 5, 2026 is a Monday — still W01 of 2026
        expect(isoWeekId(utc(2026, 1, 5))).toBe('2026-W02');
        // Jan 1, 2026 is a Thursday → W01
        expect(isoWeekId(utc(2026, 1, 1))).toBe('2026-W01');
    });

    // ── known mid-year dates ──────────────────────────────────────────────────

    test('2026-W12 (doc comment example)', () => {
        // March 19, 2026 is a Thursday
        expect(isoWeekId(utc(2026, 3, 19))).toBe('2026-W12');
    });

    test('mid-year Monday through Sunday all map to the same week', () => {
        // 2026-W20: Mon May 11 → Sun May 17
        expect(isoWeekId(utc(2026, 5, 11))).toBe('2026-W20');
        expect(isoWeekId(utc(2026, 5, 14))).toBe('2026-W20'); // Thursday
        expect(isoWeekId(utc(2026, 5, 17))).toBe('2026-W20'); // Sunday
        expect(isoWeekId(utc(2026, 5, 18))).toBe('2026-W21'); // Monday next week
    });

    // ── year-boundary: last days of year belong to the next year's W01 ────────
    //
    // 2024-12-30 (Monday) is in W01 of 2025:
    //   its Thursday is 2025-01-02, which falls in 2025.

    test('Dec 30 2024 (Monday) → 2025-W01', () => {
        expect(isoWeekId(utc(2024, 12, 30))).toBe('2025-W01');
    });

    test('Dec 31 2024 (Tuesday) → 2025-W01', () => {
        expect(isoWeekId(utc(2024, 12, 31))).toBe('2025-W01');
    });

    // ── year-boundary: first days of year may belong to the prior year ────────
    //
    // Jan 1–3, 2016 are Sunday–Tuesday; their Thursday is Dec 31, 2015 (W53).

    test('Jan 1 2016 (Friday) → 2015-W53', () => {
        expect(isoWeekId(utc(2016, 1, 1))).toBe('2015-W53');
    });

    test('Jan 3 2016 (Sunday) → 2015-W53', () => {
        expect(isoWeekId(utc(2016, 1, 3))).toBe('2015-W53');
    });

    test('Jan 4 2016 (Monday) → 2016-W01 (Jan 4 is always in W01 of its year)', () => {
        expect(isoWeekId(utc(2016, 1, 4))).toBe('2016-W01');
    });

    // ── Jan 1 that is itself in W01 of its own year ───────────────────────────

    test('Jan 1 2026 (Thursday) → 2026-W01', () => {
        expect(isoWeekId(utc(2026, 1, 1))).toBe('2026-W01');
    });

    // ── W53: years with 53 ISO weeks ──────────────────────────────────────────
    //
    // 2015 started on a Thursday, giving it 53 weeks.

    test('2015-12-31 (Thursday) → 2015-W53', () => {
        expect(isoWeekId(utc(2015, 12, 31))).toBe('2015-W53');
    });

    test('2015-12-28 (Monday) → 2015-W53', () => {
        expect(isoWeekId(utc(2015, 12, 28))).toBe('2015-W53');
    });

    // ── Jan 1 in prior year's last week ──────────────────────────────────────
    //
    // Jan 1, 2021 is a Friday; its Thursday is Dec 31, 2020.
    // 2020 is a leap year (366 days); weekNo = ceil(366/7) = 53.

    test('Jan 1 2021 (Friday) → 2020-W53', () => {
        expect(isoWeekId(utc(2021, 1, 1))).toBe('2020-W53');
    });

    // ── no-argument call returns a correctly formatted current week ───────────

    test('no argument returns a string matching YYYY-Wnn', () => {
        const result = isoWeekId();
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/);
    });
});
