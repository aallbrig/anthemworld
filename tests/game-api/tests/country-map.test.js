/**
 * Unit tests for the battle-page live country map matching logic.
 *
 * These tests are intentionally dataset-wide: every country emitted into
 * `anthems.json` should be resolvable onto the live battle GeoJSON map.
 * That keeps us from silently regressing back to the "full world fallback"
 * experience for specific countries.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const geojsonPath = path.join(repoRoot, 'hugo/site/static/data/countries.geojson');
const anthemsPath = path.join(repoRoot, 'hugo/site/static/data/anthems.json');
const {
  buildCountryFeatureIndex,
  buildNameCandidates,
  normalizeCountryName,
  resolveCountryFeature,
} = require('../../../hugo/site/static/js/country-map.js');

const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
const anthems = JSON.parse(fs.readFileSync(anthemsPath, 'utf8'));
const indexes = buildCountryFeatureIndex(geojson);
const geojsonIsoSet = new Set(Object.keys(indexes.isoIndex));

describe('CountryHighlightMap matching (unit)', () => {
  test('normalizes country names consistently', () => {
    assert.equal(normalizeCountryName(' Republic of Croatia '), 'republic of croatia');
    assert.equal(normalizeCountryName("Côte d’Ivoire"), 'cote divoire');
  });

  test('buildNameCandidates includes stripped formal-name variants', () => {
    const candidates = buildNameCandidates('Republic of Croatia');
    assert.ok(candidates.includes('republic of croatia'));
    assert.ok(candidates.includes('croatia'));
  });

  test('resolves ISO + formal name combinations that previously fell back to world view', () => {
    const croatia = resolveCountryFeature(indexes, 'HRV', 'Republic of Croatia');
    const tunisia = resolveCountryFeature(indexes, 'TUN', 'Tunisian Republic');

    assert.ok(croatia, 'Croatia should resolve');
    assert.ok(tunisia, 'Tunisia should resolve');
    assert.equal(croatia.feature.id, 'HRV');
    assert.equal(tunisia.feature.id, 'TUN');
  });

  test('every GeoJSON-backed anthem country resolves onto the battle GeoJSON map', () => {
    const unresolved = [];
    let checked = 0;

    for (const [iso, country] of Object.entries(anthems)) {
      if (!geojsonIsoSet.has(iso)) continue;
      checked++;
      const resolved = resolveCountryFeature(indexes, iso, country.name || country.common_name || '');
      if (!resolved) {
        unresolved.push(`${iso}: ${country.name || '(no name)'}`);
        continue;
      }

      assert.equal(
        resolved.feature.id,
        iso,
        `Expected ${iso} (${country.name}) to resolve to the same ISO feature, got ${resolved.feature.id}`
      );
    }

    assert.ok(checked >= 150, `Expected a large GeoJSON-backed matchup pool, only checked ${checked} countries`);
    assert.deepEqual(
      unresolved,
      [],
      `Unresolved live-map countries:\n${unresolved.join('\n')}`
    );
  });
});
