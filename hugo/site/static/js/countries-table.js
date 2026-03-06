// Countries DataTable — loads live data from /data/anthems.json

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('countries-table')) {
        initCountriesTable();
    }
});

function initCountriesTable() {
    fetch('/data/anthems.json')
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(data => renderTable(data))
        .catch(err => {
            console.warn('[countries-table] Failed to load anthem data:', err);
            renderTable(null);
        });
}

function renderTable(data) {
    const rows = [];

    if (data) {
        for (const [isoKey, country] of Object.entries(data)) {
            const anthem = country.anthem || {};
            const audio  = country.audio_files || [];

            const anthemName = anthem.name || '—';
            const adopted    = anthem.adopted_date ? anthem.adopted_date.substring(0, 4) : '—';
            const composer   = anthem.composer || '';
            const titleEn    = anthem.title_en  || '';
            const region     = [country.region, country.subregion].filter(Boolean).join(' / ') || '—';
            const flagURL    = country.flag_url || '';

            // Pick first audio file that has a URL
            const audioFile  = audio.find(a => a.url) || null;

            rows.push([
                flagURL,                   // col 0: flag (hidden, used to render col 1)
                country.name || isoKey,    // col 1: country name
                anthemName,                // col 2: anthem name
                titleEn,                   // col 3: english translation
                adopted,                   // col 4: year adopted
                composer,                  // col 5: composer
                region,                    // col 6: region
                audioFile ? audioFile.url : '', // col 7: audio url
                audioFile ? (audioFile.format || 'ogg') : '', // col 8: audio format
            ]);
        }
    }

    const noDataMsg = data
        ? 'No anthem data found. Try: <code>worldanthem data download rest-countries-api wikidata-sparql && worldanthem data format --output hugo/site/static/data</code>'
        : 'anthem data not found. Run <code>worldanthem data format --output hugo/site/static/data</code> to generate it.';

    const table = $('#countries-table').DataTable({
        data: rows,
        columns: [
            { title: "Flag",        visible: false },   // 0 - hidden, drives render
            { title: "Country",     render: (d, t, row) => {
                const flag = row[0]
                    ? `<img src="${row[0]}" alt="" style="height:18px;vertical-align:middle;margin-right:6px;" onerror="this.style.display='none'">`
                    : '';
                return flag + d;
            }},
            { title: "National Anthem", render: (d, t, row) => {
                const en = row[2];
                return en ? `${d} <span class="text-muted small">(${en})</span>` : d;
            }},
            { title: "English Title", visible: false }, // 3 - included in Anthem col
            { title: "Adopted",     defaultContent: '—' },
            { title: "Composer",    defaultContent: '—', render: d => d || '—' },
            { title: "Region" },
            { title: "Audio",       orderable: false, render: (d, t, row) => {
                if (!d) return '<span class="badge bg-secondary">None</span>';
                const fmt = row[8] || 'ogg';
                const mime = fmt.includes('mp3') ? 'audio/mpeg' : `audio/${fmt}`;
                return `<audio controls preload="none" style="height:28px;width:180px;">
                    <source src="${d}" type="${mime}">
                </audio>`;
            }},
            { title: "Audio Format", visible: false },  // 8 - used by Audio render
        ],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
        order: [[1, 'asc']],
        language: {
            search: "Search:",
            lengthMenu: "Show _MENU_ per page",
            info: "Showing _START_ to _END_ of _TOTAL_ countries",
            infoEmpty: "No countries found",
            infoFiltered: "(filtered from _MAX_ total)",
            zeroRecords: noDataMsg,
        },
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rtip',
        drawCallback: function () {
            // Register newly drawn audio elements with global controller
            if (window.AudioController) {
                AudioController.registerAll(document.getElementById('countries-table'));
            }
        },
    });

    if (!data || rows.length === 0) {
        $('#countries-table_wrapper').before(
            '<div class="alert alert-warning mb-3">' +
            '<strong>No data yet.</strong> ' + noDataMsg +
            '</div>'
        );
    } else {
        const withAnthem = rows.filter(r => r[2] !== '—').length;
        const withAudio  = rows.filter(r => r[7]).length;
        $('#countries-table_wrapper').before(
            `<div class="alert alert-info mb-3">` +
            `<strong>${rows.length}</strong> countries loaded &mdash; ` +
            `<strong>${withAnthem}</strong> with anthem data, ` +
            `<strong>${withAudio}</strong> with audio` +
            `</div>`
        );
    }
}

