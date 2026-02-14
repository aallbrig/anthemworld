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
    
    // Add sample markers for demonstration (remove when GeoJSON loaded)
    addSampleMarkers();
}

function loadCountryBoundaries() {
    // TODO: Implement GeoJSON loading
    // This will replace sample markers with clickable country polygons
    // 
    // When user clicks anywhere in a country:
    // 1. Highlight the country polygon
    // 2. Show popup with country info and anthem details
    // 3. Include audio player in popup
    //
    // Example implementation:
    /*
    fetch('/data/countries.geojson')
        .then(response => response.json())
        .then(data => {
            countriesLayer = L.geoJSON(data, {
                style: styleCountry,
                onEachFeature: onEachCountry
            }).addTo(map);
        })
        .catch(error => console.error('Error loading country data:', error));
    */
    
    console.log('TODO: Load countries.geojson with country boundaries');
    console.log('See docs/research.md for data source recommendations');
}

function style(feature) {
    return {
        fillColor: '#0d6efd',
        weight: 2,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.5
    };
}

function onEachFeature(feature, layer) {
    // Add click, mouseover, and mouseout events to each country
    layer.on({
        click: onCountryClick,
        mouseover: highlightFeature,
        mouseout: resetHighlight
    });
    
    // Bind tooltip with country name (English and native)
    // TODO: Add native country names to GeoJSON properties
    const countryName = feature.properties.name || feature.properties.ADMIN || 'Unknown';
    const nativeName = feature.properties.native_name || ''; // Add this property to data
    
    const tooltipContent = nativeName 
        ? `<strong>${countryName}</strong><br><em>${nativeName}</em>`
        : `<strong>${countryName}</strong>`;
    
    layer.bindTooltip(tooltipContent, {
        permanent: false,
        direction: 'top',
        className: 'country-tooltip'
    });
}

function highlightFeature(e) {
    const layer = e.target;
    layer.setStyle({
        weight: 3,
        fillOpacity: 0.7
    });
    layer.bringToFront();
}

function resetHighlight(e) {
    countriesLayer.resetStyle(e.target);
}

function onCountryClick(e) {
    const layer = e.target;
    const props = layer.feature.properties;
    
    // Get country name from various possible property names
    const countryName = props.name || props.ADMIN || props.NAME || 'Unknown Country';
    const countryCode = props.iso_a3 || props.ISO_A3 || props.id || '';
    
    // TODO: Fetch anthem data from /data/anthems.json using country code
    // For now, use placeholder data
    const anthemData = {
        name: props.anthem || 'Data not available',
        adopted: props.anthemDate || 'Unknown',
        nativeName: props.native_name || countryName
    };
    
    // Create popup content
    const popupContent = `
        <div class="country-popup">
            <h4>${countryName}</h4>
            ${anthemData.nativeName !== countryName ? `<p class="native-name"><em>${anthemData.nativeName}</em></p>` : ''}
            <p><strong>National Anthem:</strong> ${anthemData.name}</p>
            <p><strong>Adopted:</strong> ${anthemData.adopted}</p>
            <p class="text-muted small">TODO: Add audio player widget here</p>
            <p class="text-muted small">See docs/game.md for game feature integration</p>
        </div>
    `;
    
    // Open popup at clicked location
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
