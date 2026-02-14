// Countries DataTable
const sampleCountriesData = [
    ["Afghanistan", "Milli Surood", "2006", "1919", "TODO"],
    ["Albania", "Hymni i Flamurit", "1912", "1912", "TODO"],
    ["Algeria", "Kassaman", "1962", "1962", "TODO"],
    ["Andorra", "El Gran Carlemany", "1921", "1278", "TODO"],
    ["Angola", "Angola Avante", "1975", "1975", "TODO"],
    ["Antigua and Barbuda", "Fair Antigua, We Salute Thee", "1981", "1981", "TODO"],
    ["Argentina", "Himno Nacional Argentino", "1813", "1816", "TODO"],
    ["Armenia", "Mer Hayrenik", "1991", "1991", "TODO"],
    ["Australia", "Advance Australia Fair", "1984", "1901", "TODO"],
    ["Austria", "Land der Berge, Land am Strome", "1946", "1918", "TODO"],
    ["United States", "The Star-Spangled Banner", "1931", "1776", "TODO"],
    ["United Kingdom", "God Save the King", "Unknown", "1707", "TODO"],
    ["France", "La Marseillaise", "1795", "1792", "TODO"],
    ["Germany", "Deutschlandlied", "1922", "1871", "TODO"],
    ["Japan", "Kimigayo", "1888", "660 BCE", "TODO"],
    ["China", "March of the Volunteers", "1949", "1949", "TODO"],
    ["India", "Jana Gana Mana", "1950", "1947", "TODO"],
    ["Brazil", "Hino Nacional Brasileiro", "1890", "1822", "TODO"],
    ["Canada", "O Canada", "1980", "1867", "TODO"],
    ["Mexico", "Himno Nacional Mexicano", "1943", "1821", "TODO"]
    // Note: This is sample data. Full 193 countries will be generated from database
];

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('countries-table')) {
        initCountriesTable();
    }
});

function initCountriesTable() {
    const table = $('#countries-table').DataTable({
        data: sampleCountriesData,
        columns: [
            { title: "Country" },
            { title: "National Anthem" },
            { title: "Anthem Date" },
            { title: "Country Founded" },
            { 
                title: "Audio",
                render: function(data, type, row) {
                    if (data === "TODO") {
                        return '<span class="badge bg-warning">Coming Soon</span>';
                    }
                    return `<audio controls class="audio-player">
                        <source src="${data}" type="audio/mpeg">
                        Your browser does not support audio playback.
                    </audio>`;
                }
            }
        ],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
        order: [[0, 'asc']],
        language: {
            search: "Search countries:",
            lengthMenu: "Show _MENU_ countries per page",
            info: "Showing _START_ to _END_ of _TOTAL_ countries",
            infoEmpty: "No countries found",
            infoFiltered: "(filtered from _MAX_ total countries)"
        },
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rtip'
    });
    
    // Add note about data
    $('#countries-table_wrapper').before(
        '<div class="alert alert-info mb-3">' +
        '<strong>Note:</strong> This is sample data for demonstration. ' +
        'The full dataset of 193 countries will be loaded from the database once the CLI data download is complete. ' +
        'Audio files will be added in a future update.' +
        '</div>'
    );
}
