/**
 * Static configuration tests — assert SAM template has required security settings.
 * These tests do NOT need a running server. They validate template.yaml directly.
 *
 * S-02: API Gateway throttling must be configured.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');

const TEMPLATE_PATH = path.resolve(__dirname, '../../../sam/game/template.yaml');
const raw = fs.readFileSync(TEMPLATE_PATH, 'utf8');

// ─── S-02: API Gateway throttling ─────────────────────────────────────────

describe('S-02: API Gateway (GameApi) must have throttling configured', () => {
  test('template.yaml is readable', () => {
    assert.ok(raw.length > 0, 'template.yaml is empty');
  });

  test('GameApi has MethodSettings section', () => {
    assert.match(raw, /MethodSettings:/,
      'MethodSettings not found in GameApi — add ThrottlingBurstLimit and ThrottlingRateLimit');
  });

  test('GameApi MethodSettings has ThrottlingBurstLimit', () => {
    assert.match(raw, /ThrottlingBurstLimit:\s*\d+/,
      'ThrottlingBurstLimit missing or not a number in GameApi.MethodSettings');

    const m = raw.match(/ThrottlingBurstLimit:\s*(\d+)/);
    assert.ok(m && parseInt(m[1], 10) > 0,
      `ThrottlingBurstLimit must be > 0, got: ${m?.[1]}`);
  });

  test('GameApi MethodSettings has ThrottlingRateLimit', () => {
    assert.match(raw, /ThrottlingRateLimit:\s*\d+/,
      'ThrottlingRateLimit missing or not a number in GameApi.MethodSettings');

    const m = raw.match(/ThrottlingRateLimit:\s*(\d+)/);
    assert.ok(m && parseInt(m[1], 10) > 0,
      `ThrottlingRateLimit must be > 0, got: ${m?.[1]}`);
  });

  test('ThrottlingRateLimit is not unreasonably high (≤ 1000 rps per stage)', () => {
    const m = raw.match(/ThrottlingRateLimit:\s*(\d+)/);
    if (!m) return; // previous test already fails
    const rate = parseInt(m[1], 10);
    assert.ok(rate <= 1000,
      `ThrottlingRateLimit (${rate}) seems too high for a hobby-scale app — use ≤ 1000`);
  });

  test('wildcard resource path is covered (/* with *)', () => {
    assert.match(raw, /ResourcePath:\s*['"]?\/\*/,
      'No wildcard ResourcePath (/*) found — all routes should be throttled');
  });
});

// ─── S-11 (static): CORS_ORIGIN default ───────────────────────────────────

describe('S-11 (static): CORS_ORIGIN global default noted', () => {
  test('CORS_ORIGIN env var is present in Globals', () => {
    assert.match(raw, /CORS_ORIGIN:/,
      'CORS_ORIGIN is not defined in template Globals — add it so stage-specific origins can be configured');
  });
});

