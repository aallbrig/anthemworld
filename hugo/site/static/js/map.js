// Interactive World Map with Leaflet
let map;
let countriesLayer;
let anthemData = {};     // keyed by ISO alpha-3 upper/lower
let anthemByName = {};   // keyed by country name (common_name preferred, then name)

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
                throw new Error('Failed to load country data');
            }
            return response.json();
        })
        .then(data => {
            countriesLayer = L.geoJSON(data, {
                style: styleCountry,
                onEachFeature: onEachCountry
            }).addTo(map);

            console.log('✓ Loaded', data.features.length, 'countries');
        })
        .catch(error => {
            console.error('Error loading country boundaries:', error);
        });
}

function styleCountry(feature) {
    return {
        fillColor: '#0d6efd',
        weight: 1,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.3
    };
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
            fillOpacity: 0.6,
            weight: 2
        });
    });

    layer.on('mouseout', function(e) {
        countriesLayer.resetStyle(e.target);
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
            ? `<div class="small text-muted">Music: ${anthem.composer}</div>` : '';
        const lyricistLine = anthem.lyricist && anthem.lyricist !== anthem.composer
            ? `<div class="small text-muted">Lyrics: ${anthem.lyricist}</div>` : '';
        const dateLine = anthem.adopted_date
            ? `<div class="small text-muted">Adopted: ${anthem.adopted_date.substring(0, 4)}</div>` : '';
        const historySnippet = anthem.history
            ? `<p class="small mt-1 mb-0" style="max-height:80px;overflow:hidden;text-overflow:ellipsis;">${anthem.history.substring(0, 200)}${anthem.history.length > 200 ? '…' : ''}</p>`
            : '';

        let audioPlayerHTML = '';
        const instrumental = audio.find(a => a.type === 'instrumental') || audio[0];
        if (instrumental && instrumental.url) {
            audioPlayerHTML = `
                <div class="mt-2">
                    <audio controls style="width:100%;height:32px;" preload="none">
                        <source src="${instrumental.url}" type="audio/${instrumental.format || 'ogg'}">
                    </audio>
                </div>`;
        }

        anthemSection = `
            <hr class="my-1">
            <div class="fw-semibold">${titleLine}</div>
            ${composerLine}${lyricistLine}${dateLine}
            ${historySnippet}
            ${audioPlayerHTML}`;
    } else {
        anthemSection = `<hr class="my-1"><p class="small text-muted mb-0"><em>No anthem data available yet.</em></p>`;
    }

    const capital = countryRecord.capital
        ? `<div class="small text-muted">Capital: ${countryRecord.capital}</div>` : '';

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

    const countryName = props.name || props.ADMIN || props.NAME || 'Unknown Country';
    const isoCode = (props.iso_a3 || props.ISO_A3 || props.id || '').toUpperCase();

    // Try ISO lookup first, then fall back to name-based lookup
    const countryRecord = anthemData[isoCode]
        || anthemByName[countryName.toLowerCase()]
        || null;
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

