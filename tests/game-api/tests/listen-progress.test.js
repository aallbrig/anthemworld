'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  FULL_WEIGHT_MS,
  effectiveListenMs,
  mergeProgressRecord,
  normalizeProgressRecord,
  progressPercent,
} = require('../../../hugo/site/static/js/listen-progress.js');
const { buildProfileViewModel } = require('../../../hugo/site/static/js/profile.js');

describe('ListenProgress helpers (unit)', () => {
  test('mergeProgressRecord accumulates listen credit and preserves metadata', () => {
    const merged = mergeProgressRecord(
      {
        country_id: 'FRA',
        country_name: 'France',
        total_listen_ms: 3000,
        duration_ms: 60000,
      },
      {
        country_id: 'fra',
        anthem_name: 'La Marseillaise',
        add_listen_ms: 4000,
        max_position_ms: 12000,
        last_source: 'countries-table',
      }
    );

    assert.equal(merged.country_id, 'FRA');
    assert.equal(merged.country_name, 'France');
    assert.equal(merged.anthem_name, 'La Marseillaise');
    assert.equal(merged.total_listen_ms, 7000);
    assert.equal(merged.max_position_ms, 12000);
    assert.equal(merged.last_source, 'countries-table');
  });

  test('mergeProgressRecord unlocks full weight at 10 seconds', () => {
    const merged = mergeProgressRecord(
      { country_id: 'HRV', total_listen_ms: FULL_WEIGHT_MS - 1000 },
      { country_id: 'HRV', add_listen_ms: 1000 }
    );

    assert.equal(merged.heard_full_weight, true);
    assert.equal(merged.total_listen_ms, FULL_WEIGHT_MS);
  });

  test('reaching 10 seconds into an anthem unlocks full weight client-side', () => {
    const merged = mergeProgressRecord(
      { country_id: 'ATG', total_listen_ms: 0, duration_ms: 90_000, max_position_ms: 0 },
      { country_id: 'ATG', duration_ms: 90_000, max_position_ms: 31_500 }
    );

    assert.equal(merged.heard_full_weight, true);
    assert.equal(effectiveListenMs(merged), 31_500);
  });

  test('progressPercent prefers full anthem completion', () => {
    assert.equal(progressPercent({
      country_id: 'TUN',
      duration_ms: 52_000,
      max_position_ms: 50_000,
      heard_full_anthem: true,
    }), 100);
  });
});

describe('Profile view model (unit)', () => {
  test('builds a single ordered table with status metadata', () => {
    const catalog = {
      FRA: { iso_alpha3: 'FRA', name: 'French Republic', common_name: 'France', flag_url: '/fra.png', anthem: { name: 'La Marseillaise' }, audio_files: [{ url: 'https://example.test/fra.ogg', format: 'ogg' }] },
      HRV: { iso_alpha3: 'HRV', name: 'Republic of Croatia', common_name: 'Croatia', flag_url: '/hrv.png', anthem: { name: 'Lijepa naša domovino' } },
      TUN: { iso_alpha3: 'TUN', name: 'Tunisian Republic', common_name: 'Tunisia', flag_url: '/tun.png', anthem: { name: 'Humat Al Hima' } },
    };

    const progress = {
      FRA: normalizeProgressRecord({
        country_id: 'FRA',
        total_listen_ms: 20_000,
        duration_ms: 70_000,
        max_position_ms: 70_000,
        heard_full_weight: true,
        heard_full_anthem: true,
      }),
      HRV: normalizeProgressRecord({
        country_id: 'HRV',
        total_listen_ms: 5_000,
        duration_ms: 60_000,
        max_position_ms: 35_000,
      }),
    };

    const model = buildProfileViewModel(catalog, countryId => progress[countryId] || null);

    assert.equal(model.rows.length, 3);
    assert.equal(model.rows[0].country_id, 'FRA');
    assert.equal(model.rows[0].status_label, 'Fully heard');
    assert.equal(model.rows[0].audio_url, 'https://example.test/fra.ogg');
    assert.equal(model.rows[1].country_id, 'HRV');
    assert.equal(model.rows[1].status_label, 'In progress');
    assert.equal(model.rows[2].country_id, 'TUN');
    assert.equal(model.rows[2].status_label, 'Not heard yet');
    assert.equal(model.stats.full_anthem, 1);
    assert.equal(model.stats.listened_any, 2);
  });
});
