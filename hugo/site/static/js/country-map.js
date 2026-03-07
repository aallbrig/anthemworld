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
  const FLY_DURATION = 1.2; // seconds

  // Styles
  const STYLE_DEFAULT    = { color: '#555', weight: 0.5, fillColor: '#b0c4de', fillOpacity: 0.5 };
  const STYLE_HIGHLIGHT  = { color: '#0d6efd', weight: 2,   fillColor: '#0d6efd', fillOpacity: 0.4 };
  const STYLE_DIM        = { color: '#999', weight: 0.3,   fillColor: '#ddd',    fillOpacity: 0.3 };

  function CountryHighlightMap(containerId, geojsonData) {
    this._containerId  = containerId;
    this._geojsonData  = geojsonData;
    this._map          = null;
    this._geojsonLayer = null;
    this._highlighted  = null; // currently highlighted layer
    this._isoIndex     = {};   // iso_a3 → layer
    this._nameIndex    = {};   // lowercase name → layer

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
    this._geojsonLayer = L.geoJSON(data, {
      style: STYLE_DEFAULT,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        // Index by ISO alpha-3 (Natural Earth uses ISO_A3; johan uses id)
        const iso = (props.ISO_A3 || props.iso_a3 || props.id || '').toUpperCase();
        if (iso) this._isoIndex[iso] = layer;

        // Index by name (common + formal) for fallback
        if (props.name)       this._nameIndex[props.name.toLowerCase()]       = layer;
        if (props.name_long)  this._nameIndex[props.name_long.toLowerCase()]  = layer;
        if (props.ADMIN)      this._nameIndex[props.ADMIN.toLowerCase()]      = layer;
        if (props.NAME)       this._nameIndex[props.NAME.toLowerCase()]       = layer;
      },
    }).addTo(this._map);
  };

  /**
   * Fly to a country and highlight its polygon.
   * @param {string} isoA3 - ISO alpha-3 country code (e.g. 'IRL', 'FRA')
   * @param {string} [fallbackName] - country name to try if ISO lookup fails
   */
  CountryHighlightMap.prototype.flyToCountry = function (isoA3, fallbackName) {
    this._clearHighlight();

    let layer = this._isoIndex[(isoA3 || '').toUpperCase()];
    if (!layer && fallbackName) {
      layer = this._nameIndex[fallbackName.toLowerCase()];
    }

    if (!layer) {
      // Country not in GeoJSON (e.g. micro-state) — just reset view
      this._map.fitBounds(WORLD_BOUNDS, { animate: true, duration: FLY_DURATION });
      return;
    }

    // Dim all others, highlight this one
    if (this._geojsonLayer) {
      this._geojsonLayer.setStyle(STYLE_DIM);
    }
    layer.setStyle(STYLE_HIGHLIGHT);
    layer.bringToFront();
    this._highlighted = layer;

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      this._map.flyToBounds(bounds, {
        padding:  [20, 20],
        maxZoom:  6,
        duration: FLY_DURATION,
      });
    }
  };

  /** Return to full world view and clear highlights. */
  CountryHighlightMap.prototype.reset = function () {
    this._clearHighlight();
    this._map.flyToBounds(WORLD_BOUNDS, { animate: true, duration: FLY_DURATION });
  };

  CountryHighlightMap.prototype._clearHighlight = function () {
    if (this._geojsonLayer) {
      this._geojsonLayer.setStyle(STYLE_DEFAULT);
    }
    this._highlighted = null;
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

}(window));
