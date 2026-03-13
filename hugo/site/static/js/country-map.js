/**
 * CountryHighlightMap — lightweight Leaflet map widget that zooms to a country.
 *
 * Usage:
 *   const map = new CountryHighlightMap('container-id', geojsonData);
 *   map.flyToCountry('IRL');   // fly to Ireland using ISO alpha-3
 *   map.reset();               // return to world view
 *
 * The widget is intentionally non-interactive (no drag/zoom) so it stays
 * focused on the game UI. Call enableInteraction() to unlock if needed.
 */
(function (global) {
  'use strict';

  // World bounds used for the reset view
  const WORLD_BOUNDS = [[-60, -180], [85, 180]];
  const FLY_DURATION = 0.55; // seconds
  const PULSE_DURATION_MS = 140;

  // Styles
  const STYLE_DEFAULT    = { color: '#555', weight: 0.5, fillColor: '#b0c4de', fillOpacity: 0.5 };
  const STYLE_HIGHLIGHT  = { color: '#0d6efd', weight: 2,   fillColor: '#0d6efd', fillOpacity: 0.4 };
  const STYLE_DIM        = { color: '#999', weight: 0.3,   fillColor: '#ddd',    fillOpacity: 0.3 };
  const STYLE_PULSE      = { color: '#0d6efd', weight: 3,   fillColor: '#4da3ff', fillOpacity: 0.62 };

  function normalizeCountryName(name) {
    return String(name || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\bthe\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildNameCandidates(name) {
    const raw = String(name || '').trim();
    const candidates = new Set();
    const add = value => {
      const normalized = normalizeCountryName(value);
      if (normalized) candidates.add(normalized);
    };

    add(raw);
    add(raw.replace(/\s*\([^)]*\)\s*/g, ' '));

    [
      /^(?:the\s+)?republic of\s+/i,
      /^(?:the\s+)?kingdom of\s+/i,
      /^(?:the\s+)?state of\s+/i,
      /^(?:the\s+)?commonwealth of\s+/i,
      /^(?:the\s+)?principality of\s+/i,
      /^(?:the\s+)?grand duchy of\s+/i,
      /^(?:the\s+)?federal republic of\s+/i,
      /^(?:the\s+)?democratic republic of\s+/i,
      /^(?:the\s+)?peoples republic of\s+/i,
      /^(?:the\s+)?people s republic of\s+/i,
      /^(?:the\s+)?islamic republic of\s+/i,
      /^(?:the\s+)?oriental republic of\s+/i,
      /^(?:the\s+)?federative republic of\s+/i,
      /^(?:the\s+)?plurinational state of\s+/i,
      /^(?:the\s+)?independent state of\s+/i,
      /^(?:the\s+)?union of\s+/i,
    ].forEach(pattern => add(raw.replace(pattern, '')));

    return Array.from(candidates);
  }

  function getFeatureISO(feature) {
    const props = feature?.properties || {};
    return String(
      feature?.id ||
      props.ISO_A3 ||
      props.iso_a3 ||
      props.ADM0_A3 ||
      props.id ||
      ''
    ).toUpperCase();
  }

  function buildCountryFeatureIndex(data) {
    const isoIndex = {};
    const nameIndex = {};

    for (const feature of (data?.features || [])) {
      const iso = getFeatureISO(feature);
      if (iso) isoIndex[iso] = feature;

      const props = feature?.properties || {};
      [
        props.name,
        props.name_long,
        props.ADMIN,
        props.NAME,
      ].forEach(value => {
        for (const candidate of buildNameCandidates(value)) {
          nameIndex[candidate] = feature;
        }
      });
    }

    return { isoIndex, nameIndex };
  }

  function resolveCountryFeature(indexes, isoA3, fallbackName) {
    const iso = String(isoA3 || '').toUpperCase();
    if (iso && indexes?.isoIndex?.[iso]) {
      return { feature: indexes.isoIndex[iso], matchedBy: 'iso', matchedValue: iso };
    }

    for (const candidate of buildNameCandidates(fallbackName)) {
      if (indexes?.nameIndex?.[candidate]) {
        return { feature: indexes.nameIndex[candidate], matchedBy: 'name', matchedValue: candidate };
      }
    }

    return null;
  }

  function CountryHighlightMap(containerId, geojsonData) {
    this._containerId  = containerId;
    this._geojsonData  = geojsonData;
    this._map          = null;
    this._geojsonLayer = null;
    this._highlighted  = null; // currently highlighted layer
    this._isoIndex     = {};   // iso_a3 → layer
    this._nameIndex    = {};   // lowercase name → layer
    this._pulseTimers  = [];

    this._init();
  }

  CountryHighlightMap.prototype._init = function () {
    this._map = L.map(this._containerId, {
      zoomControl:       false,
      attributionControl: false,
      dragging:          false,
      scrollWheelZoom:   false,
      doubleClickZoom:   false,
      boxZoom:           false,
      keyboard:          false,
      touchZoom:         false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 10,
      opacity: 0.4,
    }).addTo(this._map);

    if (this._geojsonData) {
      this._loadGeojson(this._geojsonData);
    }

    this._map.fitBounds(WORLD_BOUNDS);
  };

  CountryHighlightMap.prototype._loadGeojson = function (data) {
    const indexes = buildCountryFeatureIndex(data);
    this._geojsonLayer = L.geoJSON(data, {
      style: STYLE_DEFAULT,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        // Index by ISO alpha-3 (our GeoJSON stores it on feature.id)
        const iso = getFeatureISO(feature);
        if (iso) this._isoIndex[iso] = layer;

        // Index by normalized names for fallback
        for (const value of [props.name, props.name_long, props.ADMIN, props.NAME]) {
          for (const candidate of buildNameCandidates(value)) {
            this._nameIndex[candidate] = layer;
          }
        }
      },
    }).addTo(this._map);
    this._featureIndex = indexes;
  };

  /**
   * Fly to a country and highlight its polygon.
   * @param {string} isoA3 - ISO alpha-3 country code (e.g. 'IRL', 'FRA')
   * @param {string} [fallbackName] - country name to try if ISO lookup fails
   */
  CountryHighlightMap.prototype.flyToCountry = function (isoA3, fallbackName) {
    this._clearHighlight();

    const resolved = resolveCountryFeature({ isoIndex: this._isoIndex, nameIndex: this._nameIndex }, isoA3, fallbackName);
    const layer = resolved?.feature
      ? (resolved.matchedBy === 'iso'
          ? this._isoIndex[(isoA3 || '').toUpperCase()]
          : this._nameIndex[resolved.matchedValue])
      : null;

    if (!layer) {
      // Country not in GeoJSON (e.g. micro-state) — just reset view
      this._setContainerState('miss', isoA3, fallbackName, null);
      this._map.fitBounds(WORLD_BOUNDS, { animate: true, duration: FLY_DURATION });
      return false;
    }

    // Dim all others, highlight this one
    if (this._geojsonLayer) {
      this._geojsonLayer.setStyle(STYLE_DIM);
    }
    layer.setStyle(STYLE_HIGHLIGHT);
    layer.bringToFront();
    this._highlighted = layer;
    this._setContainerState('ok', isoA3, fallbackName, resolved?.matchedBy || 'unknown');
    this._pulseHighlight(layer);

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      this._map.flyToBounds(bounds, {
        padding:  [20, 20],
        maxZoom:  6,
        duration: FLY_DURATION,
      });
    }
    return true;
  };

  /** Return to full world view and clear highlights. */
  CountryHighlightMap.prototype.reset = function () {
    this._clearHighlight();
    this._setContainerState('idle', '', '', '');
    this._map.flyToBounds(WORLD_BOUNDS, { animate: true, duration: FLY_DURATION });
  };

  CountryHighlightMap.prototype._clearHighlight = function () {
    this._clearPulseTimers();
    if (this._geojsonLayer) {
      this._geojsonLayer.setStyle(STYLE_DEFAULT);
    }
    this._highlighted = null;
  };

  CountryHighlightMap.prototype._pulseHighlight = function (layer) {
    if (!layer) return;
    this._clearPulseTimers();
    layer.setStyle(STYLE_PULSE);
    this._pulseTimers.push(setTimeout(() => {
      if (this._highlighted === layer) layer.setStyle(STYLE_HIGHLIGHT);
    }, PULSE_DURATION_MS));
    this._pulseTimers.push(setTimeout(() => {
      if (this._highlighted === layer) layer.setStyle(STYLE_PULSE);
    }, PULSE_DURATION_MS * 2));
    this._pulseTimers.push(setTimeout(() => {
      if (this._highlighted === layer) layer.setStyle(STYLE_HIGHLIGHT);
    }, PULSE_DURATION_MS * 3));
  };

  CountryHighlightMap.prototype._clearPulseTimers = function () {
    this._pulseTimers.forEach(timer => clearTimeout(timer));
    this._pulseTimers = [];
  };

  CountryHighlightMap.prototype._setContainerState = function (match, isoA3, fallbackName, matchedBy) {
    const el = global.document && global.document.getElementById(this._containerId);
    if (!el) return;
    el.dataset.countryMatch = match || '';
    el.dataset.countryIso = (isoA3 || '').toUpperCase();
    el.dataset.countryName = fallbackName || '';
    el.dataset.countryMatchedBy = matchedBy || '';
  };

  /** Unlock map interaction (drag/scroll/zoom). */
  CountryHighlightMap.prototype.enableInteraction = function () {
    this._map.dragging.enable();
    this._map.scrollWheelZoom.enable();
    this._map.doubleClickZoom.enable();
  };

  /** Force a redraw — call after the container becomes visible (e.g. tab switch). */
  CountryHighlightMap.prototype.invalidate = function () {
    this._map.invalidateSize();
  };

  global.CountryHighlightMap = CountryHighlightMap;
  CountryHighlightMap.normalizeCountryName = normalizeCountryName;
  CountryHighlightMap.buildNameCandidates = buildNameCandidates;
  CountryHighlightMap.buildCountryFeatureIndex = buildCountryFeatureIndex;
  CountryHighlightMap.resolveCountryFeature = resolveCountryFeature;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CountryHighlightMap,
      normalizeCountryName,
      buildNameCandidates,
      buildCountryFeatureIndex,
      resolveCountryFeature,
      getFeatureISO,
    };
  }

}(typeof window !== 'undefined' ? window : globalThis));
