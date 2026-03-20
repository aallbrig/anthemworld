// Countries DataTable — loads live data from /data/anthems.json

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('countries-table')) {
        initCountriesTable();
    }
});

function t(key, vars = {}, fallback = '') {
    const translated = window.AnthemI18n?.t?.(key, vars, fallback);
    return translated ?? fallback ?? key;
}

function initCountriesTable() {
    fetch('/data/anthems.json')
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(data => {
            try {
                renderTable(data);
            } catch (renderErr) {
                console.error('[countries-table] Render error:', renderErr);
            }
        })
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
                isoKey,                    // col 9: iso alpha-3
            ]);
        }
    }

    const noDataMsg = data
        ? t('countries_data_missing_html')
        : t('countries_data_not_generated_html');

    const table = $('#countries-table').DataTable({
        data: rows,
        columns: [
            { title: t('countries_column_flag'),        visible: false },   // 0 - hidden, drives render
            { title: t('countries_column_country'),     render: (d, _type, row) => {
                const flag = row[0]
                    ? `<img src="${row[0]}" alt="" loading="lazy" decoding="async" style="height:18px;vertical-align:middle;margin-right:6px;" onerror="this.style.display='none'">`
                    : '';
                const iso = String(row[9] || '').toLowerCase();
                const href = iso ? `/countries/${iso}/` : '#';
                return `<a href="${href}" class="text-decoration-none">${flag}${d}</a>`;
            }},
            { title: t('countries_column_national_anthem'), render: (d, _type, row) => {
                const en = row[3];
                return en ? `${d} <span class="text-muted small">(${en})</span>` : d;
            }},
            { title: t('countries_column_english_title'), visible: false }, // 3 - included in Anthem col
            { title: t('countries_column_adopted'),     defaultContent: '—' },
            { title: t('countries_column_composer'),    defaultContent: '—', render: d => d || '—' },
            { title: t('countries_column_region') },
            { title: t('countries_column_audio'),       orderable: false, render: (d, _type, row) => {
                if (!d) return `<span class="badge bg-secondary">${t('countries_badge_none')}</span>`;
                const iso = row[9] || '';
                return window.AnthemAudioWidget.renderHTML({
                    audioUrl: d,
                    audioFormat: row[8] || 'ogg',
                    countryId: iso,
                    countryName: row[1] || '',
                    anthemName: row[2] || '',
                    flagUrl: row[0] || '',
                    countryUrl: `/countries/${String(iso).toLowerCase()}/`,
                    listenSource: 'countries-table',
                    inlineStyle: 'height:28px;width:180px;'
                });
            }},
            { title: t('countries_column_audio_format'), visible: false },  // 8 - used by Audio render
            { title: 'ISO', visible: false },                               // 9 - used by audio metadata
        ],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, t('datatable_all')]],
        order: [[1, 'asc']],
        language: {
            search: t('datatable_search'),
            lengthMenu: t('datatable_length_menu'),
            info: t('datatable_info'),
            infoEmpty: t('datatable_info_empty'),
            infoFiltered: t('datatable_info_filtered'),
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
            `<strong>${t('countries_no_data_title')}</strong> ` + noDataMsg +
            '</div>'
        );
    } else {
        const withAnthem = rows.filter(r => r[2] !== '—').length;
        const withAudio  = rows.filter(r => r[7]).length;
        console.info('[countries-table] ' + t('countries_summary_html', { rows: rows.length, withAnthem, withAudio }));
    }
}
