/**
 * Localized API/user-facing messages for the game backend.
 */
const CATALOG = {
    en: {
        internal_error: 'An unexpected error occurred',
        session_limit_reached: 'Maximum {max} sessions per IP per day reached. Try again tomorrow.',
        matchup_session_required: 'session_id query parameter is required',
        session_not_found: 'Session not found or expired. Create a new session.',
        matchup_not_enough_countries: 'Not enough countries in rankings table. Run data initialization first.',
        vote_invalid_json: 'Invalid JSON body',
        vote_session_required: 'session_id is required',
        vote_matchup_required: 'matchup_id is required',
        vote_winner_required: 'winner_id is required',
        vote_loser_required: 'loser_id is required',
        vote_same_country: 'winner_id and loser_id must be different',
        vote_listen_numbers: 'listen_a_ms and listen_b_ms must be numbers (milliseconds)',
        vote_matchup_mismatch: 'matchup_id does not match your current matchup. Request a new matchup first.',
        vote_pair_mismatch: 'winner_id/loser_id do not match matchup countries.',
        vote_limit_reached: 'Maximum {max} votes per day reached. Come back tomorrow!',
    },
    es: {
        internal_error: 'Ocurrió un error inesperado',
        session_limit_reached: 'Se alcanzó el máximo de {max} sesiones por IP y por día. Vuelve mañana.',
        matchup_session_required: 'El parámetro de consulta session_id es obligatorio',
        session_not_found: 'La sesión no existe o ha expirado. Crea una nueva sesión.',
        matchup_not_enough_countries: 'No hay suficientes países en la tabla de clasificación. Ejecuta primero la inicialización de datos.',
        vote_invalid_json: 'El cuerpo JSON no es válido',
        vote_session_required: 'session_id es obligatorio',
        vote_matchup_required: 'matchup_id es obligatorio',
        vote_winner_required: 'winner_id es obligatorio',
        vote_loser_required: 'loser_id es obligatorio',
        vote_same_country: 'winner_id y loser_id deben ser diferentes',
        vote_listen_numbers: 'listen_a_ms y listen_b_ms deben ser números (milisegundos)',
        vote_matchup_mismatch: 'matchup_id no coincide con tu enfrentamiento actual. Solicita primero un nuevo enfrentamiento.',
        vote_pair_mismatch: 'winner_id/loser_id no coinciden con los países del enfrentamiento.',
        vote_limit_reached: 'Se alcanzó el máximo de {max} votos por día. ¡Vuelve mañana!',
    },
};

function interpolate(template, vars = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
    );
}

function detectLanguage(headers = {}) {
    const raw = headers['accept-language'] || headers['Accept-Language'] || 'en';
    const lang = String(raw).split(',')[0].trim().split('-')[0].toLowerCase();
    return Object.prototype.hasOwnProperty.call(CATALOG, lang) ? lang : 'en';
}

function translate(lang, keyOrMessage, vars = {}) {
    const template = CATALOG[lang]?.[keyOrMessage] || CATALOG.en[keyOrMessage];
    return template ? interpolate(template, vars) : interpolate(keyOrMessage, vars);
}

module.exports = { CATALOG, detectLanguage, translate };
