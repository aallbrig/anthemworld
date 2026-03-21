// Interactive World Map with Leaflet
let map;
let countriesLayer;
let anthemData = {};     // keyed by ISO alpha-3 upper/lower
let anthemByName = {};   // keyed by country name (common_name preferred, then name)
const t = (key, vars = {}, fallback = '') => {
    const translated = window.AnthemI18n?.t?.(key, vars, fallback);
    return translated ?? fallback ?? key;
};

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Load anthem data from generated JSON file
async function loadAnthemData() {
    try {
        const resp = await fetch('/data/anthems.json');
        if (!resp.ok) return;
        const data = await resp.json();
        for (const [key, country] of Object.entries(data)) {
            // Index by ISO alpha-3
            anthemData[key.toUpperCase()] = country;
            anthemData[key.toLowerCase()] = country;
            // Build name-based fallback lookup (GeoJSON only has common names)
            const common = (country.common_name || '').toLowerCase();
            const formal = (country.name || '').toLowerCase();
            if (common) anthemByName[common] = country;
            if (formal) anthemByName[formal] = country;
        }
        console.log('✓ Loaded anthem data for', Object.keys(data).length, 'countries');
    } catch (e) {
        console.warn('Could not load anthem data:', e);
    }
}

function initMap() {
    // Initialize map centered on the world
    map = L.map('map').setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        minZoom: 2
    }).addTo(map);

    // Load anthem data, then boundaries
    loadAnthemData().then(() => loadCountryBoundaries());
}

function loadCountryBoundaries() {
    fetch('/data/countries.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error(t('map_error_country_data'));
            }
            return response.json();
        })
        .then(data => {
            countriesLayer = L.geoJSON(data, {
                style: styleCountry,
                onEachFeature: onEachCountry
            }).addTo(map);

            console.log('✓ Loaded', data.features.length, 'countries');

            // Re-color map when a popup closes (user may have listened)
            map.on('popupclose', refreshMapColors);

            // React to listen-progress updates in near-real-time.
            // Debounced so rapid timeupdate events (every ~250ms) batch into one redraw.
            let refreshTimer = null;
            function debouncedRefresh() {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(refreshMapColors, 600);
            }
            document.addEventListener('aw:listen-progress', debouncedRefresh);

            // Fallback poll for cross-tab / cross-source progress changes
            setInterval(refreshMapColors, 5_000);

            // ListenProgress may have loaded before or after GeoJSON —
            // poll until it's ready, then do the first color pass.
            let attempts = 0;
            const waitForLP = setInterval(() => {
                attempts++;
                if (window.ListenProgress) {
                    clearInterval(waitForLP);
                    refreshMapColors();
                } else if (attempts > 50) {
                    clearInterval(waitForLP);
                }
            }, 100);
        })
        .catch(error => {
            console.error('Error loading country boundaries:', error);
        });
}

const DEFAULT_FILL = '#0d6efd';     // Bootstrap primary blue
const LISTEN_START  = [255, 193, 7]; // Bootstrap warning yellow
const LISTEN_END    = [25, 135, 84]; // Bootstrap success green

/**
 * Interpolate between yellow and green based on a 0–1 progress value.
 * 0 = yellow (just started), 1 = full green (complete anthem).
 */
function listenColor(progress) {
    const p = Math.max(0, Math.min(1, progress));
    const r = Math.round(LISTEN_START[0] + (LISTEN_END[0] - LISTEN_START[0]) * p);
    const g = Math.round(LISTEN_START[1] + (LISTEN_END[1] - LISTEN_START[1]) * p);
    const b = Math.round(LISTEN_START[2] + (LISTEN_END[2] - LISTEN_START[2]) * p);
    return `rgb(${r},${g},${b})`;
}

/** Resolve a GeoJSON feature to an ISO alpha-3 code, using anthem data name lookup as fallback. */
function featureIso(feature) {
    const props = feature.properties;
    const direct = (props.iso_a3 || props.ISO_A3 || props.id || '').toUpperCase();
    if (direct && anthemData[direct]) return direct;
    // Fallback: match by country name
    const name = (props.name || props.ADMIN || props.NAME || '').toLowerCase();
    const record = anthemByName[name];
    if (record) return (record.iso_alpha3 || '').toUpperCase();
    return direct;
}

function countryFillColor(isoCode) {
    if (!isoCode || !window.ListenProgress) return DEFAULT_FILL;
    const record = window.ListenProgress.get(isoCode.toUpperCase());
    if (!record) return DEFAULT_FILL;
    const pct = window.ListenProgress.progressPercent(record);
    if (pct <= 0) return DEFAULT_FILL;
    return listenColor(pct / 100);
}

function styleCountry(feature) {
    const iso = featureIso(feature);
    const fill = countryFillColor(iso);
    return {
        fillColor: fill,
        weight: 1,
        opacity: 1,
        color: 'white',
        fillOpacity: fill === DEFAULT_FILL ? 0.3 : 0.55
    };
}

/** Re-apply listen-aware fill colors to every country on the map. */
function refreshMapColors() {
    if (!countriesLayer) return;
    countriesLayer.eachLayer(function (layer) {
        if (!layer.feature) return;
        const iso = featureIso(layer.feature);
        const fill = countryFillColor(iso);
        layer.setStyle({
            fillColor: fill,
            fillOpacity: fill === DEFAULT_FILL ? 0.3 : 0.55
        });
    });
}

function onEachCountry(feature, layer) {
    const props = feature.properties;
    const countryName = props.name || props.ADMIN || props.NAME || 'Unknown';

    layer.on('click', function(e) {
        onCountryClick(e);
    });

    layer.on('mouseover', function(e) {
        const layer = e.target;
        layer.setStyle({
            fillOpacity: 0.7,
            weight: 2
        });
    });

    layer.on('mouseout', function(e) {
        const target = e.target;
        const iso = featureIso(target.feature);
        const fill = countryFillColor(iso);
        target.setStyle({
            fillColor: fill,
            fillOpacity: fill === DEFAULT_FILL ? 0.3 : 0.55,
            weight: 1
        });
    });

    layer.bindTooltip(countryName, {
        permanent: false,
        direction: 'top',
        className: 'country-tooltip'
    });
}

function buildPopupContent(countryName, isoCode, countryRecord) {
    if (!countryRecord) {
        return `
            <div class="country-popup">
                <h4>${countryName}</h4>
                ${isoCode ? `<p class="text-muted small mb-0">ISO: ${isoCode}</p>` : ''}
            </div>`;
    }

    const anthem = countryRecord.anthem;
    const audio = countryRecord.audio_files || [];
    const flagURL = countryRecord.flag_url;

    let flagHTML = '';
    if (flagURL) {
        flagHTML = `<img src="${flagURL}" alt="${countryName} flag" style="height:24px;vertical-align:middle;margin-right:6px;" onerror="this.style.display='none'">`;
    }

    let anthemSection = '';
    if (anthem) {
        const titleLine = anthem.title_en
            ? `${anthem.name} <span class="text-muted small">(${anthem.title_en})</span>`
            : anthem.name;
        const composerLine = anthem.composer
            ? `<div class="small text-muted">${t('map_music')}: ${anthem.composer}</div>` : '';
        const lyricistLine = anthem.lyricist && anthem.lyricist !== anthem.composer
            ? `<div class="small text-muted">${t('map_lyrics')}: ${anthem.lyricist}</div>` : '';
        const dateLine = anthem.adopted_date
            ? `<div class="small text-muted">${t('map_adopted')}: ${anthem.adopted_date.substring(0, 4)}</div>` : '';
        const historySnippet = anthem.history
            ? `<p class="small mt-1 mb-0" style="max-height:80px;overflow:hidden;text-overflow:ellipsis;">${anthem.history.substring(0, 200)}${anthem.history.length > 200 ? '…' : ''}</p>`
            : '';

        let audioPlayerHTML = '';
        const instrumental = audio.find(a => a.type === 'instrumental') || audio[0];
        if (instrumental && instrumental.url) {
            audioPlayerHTML = `
                <div class="mt-2">
                    ${window.AnthemAudioWidget.renderHTML({
                        audioUrl: instrumental.url,
                        audioFormat: instrumental.format,
                        countryId: isoCode,
                        countryName: countryRecord.common_name || countryRecord.name || countryName,
                        anthemName: anthem.name || '',
                        flagUrl: flagURL || '',
                        countryUrl: `/countries/${String(isoCode || '').toLowerCase()}/`,
                        listenSource: 'map-popup',
                        preload: 'metadata',
                        inlineStyle: 'width:100%;height:32px;'
                    })}
                </div>`;
        }

        anthemSection = `
            <hr class="my-1">
            <div class="fw-semibold">${titleLine}</div>
            ${composerLine}${lyricistLine}${dateLine}
            ${historySnippet}
            ${audioPlayerHTML}`;
    } else {
        anthemSection = `<hr class="my-1"><p class="small text-muted mb-0"><em>${t('map_no_anthem')}</em></p>`;
    }

    const capital = countryRecord.capital
        ? `<div class="small text-muted">${t('map_capital')}: ${countryRecord.capital}</div>` : '';

    return `
        <div class="country-popup" style="min-width:220px;max-width:300px;">
            <h5 class="mb-1">${flagHTML}${countryRecord.name || countryName}</h5>
            ${capital}
            ${anthemSection}
        </div>`;
}

function onCountryClick(e) {
    const layer = e.target;
    const props = layer.feature.properties;

    const countryName = props.name || props.ADMIN || props.NAME || t('map_unknown_country');

    // Try ISO lookup first, then fall back to name-based lookup
    const isoFromGeo = (props.iso_a3 || props.ISO_A3 || props.id || '').toUpperCase();
    const countryRecord = anthemData[isoFromGeo]
        || anthemByName[countryName.toLowerCase()]
        || null;

    // GeoJSON features often have no iso_a3; fall back to the anthem record's stored code.
    // Without a valid isoCode the audio widget can't set data-country-id and listen
    // tracking will never fire.
    const isoCode = anthemData[isoFromGeo]
        ? isoFromGeo
        : (countryRecord?.iso_alpha3 || isoFromGeo || '').toUpperCase();

    const popupContent = buildPopupContent(countryName, isoCode, countryRecord);

    const popup = layer.bindPopup(popupContent, { maxWidth: 320 }).openPopup();

    // Register audio elements with global controller once popup DOM is ready
    layer.on('popupopen', function () {
        const el = layer.getPopup().getElement();
        if (el && window.AudioController) window.AudioController.registerAll(el);
    });
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('map')) {
        initMap();
    }
});
