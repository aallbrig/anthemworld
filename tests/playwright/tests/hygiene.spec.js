/**
 * Page hygiene — every page must:
 *   1. Produce no JS console errors or uncaught exceptions
 *   2. Load all resources with non-error HTTP status codes
 *
 * Filtered noise (not real failures in CI):
 *   - Game API at localhost:3001 — optional, not running in CI
 *   - ERR_CONNECTION_REFUSED / NS_ERROR_CONNECTION_REFUSED — same
 *   - NS_BINDING_ABORTED / net::ERR_ABORTED — request cancelled by navigation
 */

const { test, expect } = require('@playwright/test');

const IGNORE_STRINGS = [
  'ERR_CONNECTION_REFUSED',
  'NS_ERROR_CONNECTION_REFUSED',
  'NS_BINDING_ABORTED',
  'net::ERR_ABORTED',
  'localhost:3001',
];

function isIgnored(text) {
  return IGNORE_STRINGS.some(s => text.includes(s));
}

const PAGES = [
  { path: '/',                  name: 'Homepage' },
  { path: '/map/',              name: 'Map' },
  { path: '/countries/',        name: 'Countries' },
  { path: '/leaderboard/',      name: 'Leaderboard' },
  { path: '/game/',             name: 'Game' },
  { path: '/countries/usa/',    name: 'Country detail (USA)' },
  { path: '/countries/fra/',    name: 'Country detail (France)' },
  { path: '/countries/gbr/',    name: 'Country detail (UK)' },
  { path: '/countries/bih/',    name: 'Country detail (Bosnia, no audio)' },
];

for (const { path, name } of PAGES) {
  test.describe(name, () => {
    test('no JS console errors', async ({ page }) => {
      const errors = [];

      page.on('console', msg => {
        if (msg.type() === 'error' && !isIgnored(msg.text())) {
          errors.push(msg.text());
        }
      });

      // Uncaught exceptions (pageerror fires for unhandled throws / promise rejections)
      page.on('pageerror', err => {
        if (!isIgnored(err.message)) {
          errors.push(`[uncaught] ${err.message}`);
        }
      });

      await page.goto(path, { waitUntil: 'load' });
      // Allow async JS (data fetches, DataTable init) to complete
      await page.waitForTimeout(1500);

      expect(errors, `Console errors on ${path}:\n${errors.join('\n')}`).toHaveLength(0);
    });

    test('no failed resources', async ({ page }) => {
      const failed = [];

      // HTTP-level failures (4xx / 5xx responses)
      page.on('response', res => {
        if (isIgnored(res.url())) return;
        const status = res.status();
        // 304 Not Modified is fine; 101 Switching Protocols is a WebSocket upgrade
        if (status >= 400 && status !== 304 && status !== 101) {
          failed.push(`HTTP ${status}: ${res.url()}`);
        }
      });

      // Network-level failures (DNS, connection refused, etc.)
      page.on('requestfailed', req => {
        if (isIgnored(req.url())) return;
        const err = req.failure()?.errorText || '';
        if (isIgnored(err)) return;
        failed.push(`FAILED ${req.url()}: ${err}`);
      });

      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(500);

      expect(failed, `Failed resources on ${path}:\n${failed.join('\n')}`).toHaveLength(0);
    });
  });
}
