// Interactive World Map with Leaflet
let map;
let countriesLayer;

// Sample countries data (to be replaced with actual data)
const sampleCountries = [
    {
        name: "United States",
        anthem: "The Star-Spangled Banner",
        anthemDate: "1931",
        founded: "1776",
        coords: [37.0902, -95.7129]
    },
    {
        name: "United Kingdom",
        anthem: "God Save the King",
        anthemDate: "Unknown",
        founded: "1707",
        coords: [55.3781, -3.4360]
    },
    {
        name: "France",
        anthem: "La Marseillaise",
        anthemDate: "1795",
        founded: "1792",
        coords: [46.2276, 2.2137]
    },
    {
        name: "Germany",
        anthem: "Deutschlandlied",
        anthemDate: "1922",
        founded: "1871",
        coords: [51.1657, 10.4515]
    },
    {
        name: "Japan",
        anthem: "Kimigayo",
        anthemDate: "1888",
        founded: "660 BCE",
        coords: [36.2048, 138.2529]
    }
];

function initMap() {
    // Initialize map centered on the world
    map = L.map('map').setView([20, 0], 2);
    
    // Add OpenStreetMap tiles
    // TODO: Customize tile layer to show only country names
    // Options to explore:
    // 1. Use MapBox with custom style (requires API key)
    // 2. Use Stamen.TonerLite (minimalist, country-focused)
    // 3. Use Thunderforest.Transport with customization
    // 4. Self-host tiles with custom rendering
    // 5. Use OpenStreetMap with CSS filters to reduce detail
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        minZoom: 2
    }).addTo(map);
    
    // TODO: Load GeoJSON country boundaries for clickable countries
    // Recommended sources (see docs/research.md):
    // 1. datasets/geo-countries (easiest) - ready-to-use GeoJSON
    // 2. Natural Earth Data (best quality) - high-quality boundaries
    // 3. topojson/world-atlas (best performance) - compact TopoJSON
    //
    // Implementation:
    // fetch('/data/countries.geojson')
    //   .then(response => response.json())
    //   .then(data => {
    //     L.geoJSON(data, {
    //       style: styleCountry,
    //       onEachFeature: onEachCountry
    //     }).addTo(map);
    //   });
    
    // Load country boundaries
    loadCountryBoundaries();
    
    // Sample markers disabled - using GeoJSON instead
    // Uncomment below if GeoJSON fails to load
    // addSampleMarkers();
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
            console.log('Falling back to sample markers');
            addSampleMarkers();
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
    
    // Click handler
    layer.on('click', function(e) {
        onCountryClick(e);
    });
    
    // Hover highlight
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
    
    // Tooltip on hover
    layer.bindTooltip(countryName, {
        permanent: false,
        direction: 'top',
        className: 'country-tooltip'
    });
}

function onCountryClick(e) {
    const layer = e.target;
    const props = layer.feature.properties;
    
    // Try multiple property names (different GeoJSON sources use different names)
    const countryName = props.name || props.ADMIN || props.NAME || 'Unknown Country';
    const isoCode = props.iso_a3 || props.ISO_A3 || props.id || '';
    
    // Simple popup for MVP - just country name
    const popupContent = `
        <div class="country-popup">
            <h4>${countryName}</h4>
            ${isoCode ? `<p class="text-muted small">ISO Code: ${isoCode}</p>` : ''}
            <hr class="my-2">
            <p class="text-muted small mb-0">
                <em>Anthem data coming soon!</em><br>
                Run <code>worldanthem data download</code> to populate
            </p>
        </div>
    `;
    
    layer.bindPopup(popupContent).openPopup();
}

function addSampleMarkers() {
    // Add sample markers for demonstration purposes
    sampleCountries.forEach(country => {
        const marker = L.marker(country.coords).addTo(map);
        
        const popupContent = `
            <div>
                <h4>${country.name}</h4>
                <p><strong>National Anthem:</strong> ${country.anthem}</p>
                <p><strong>Adopted:</strong> ${country.anthemDate}</p>
                <p><strong>Founded:</strong> ${country.founded}</p>
                <p class="text-muted small"><em>TODO: Add audio player widget here</em></p>
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('map')) {
        initMap();
    }
});
