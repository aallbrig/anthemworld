const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { detectLanguage, translate } = require('../../../sam/game/functions/shared/messages');
const response = require('../../../sam/game/functions/shared/response');

describe('API i18n helpers (unit)', () => {
  test('detectLanguage reads Accept-Language and normalizes to supported locale', () => {
    assert.equal(detectLanguage({ 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' }), 'es');
    assert.equal(detectLanguage({ 'Accept-Language': 'en-US,en;q=0.9' }), 'en');
  });

  test('detectLanguage falls back to english for unknown locales', () => {
    assert.equal(detectLanguage({ 'accept-language': 'fr-CA,fr;q=0.9' }), 'en');
    assert.equal(detectLanguage({}), 'en');
  });

  test('translate interpolates localized variables', () => {
    assert.equal(
      translate('es', 'session_limit_reached', { max: 5 }),
      'Se alcanzó el máximo de 5 sesiones por IP y por día. Vuelve mañana.'
    );
    assert.equal(
      translate('en', 'vote_limit_reached', { max: 100 }),
      'Maximum 100 votes per day reached. Come back tomorrow!'
    );
  });

  test('translate falls back to literal strings for unknown keys', () => {
    assert.equal(translate('es', 'Literal fallback message'), 'Literal fallback message');
  });

  test('response helpers localize message keys', () => {
    const res = response.badRequest('vote_invalid_json', null, 'es');
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).message, 'El cuerpo JSON no es válido');
  });

  test('tooManyRequests preserves Retry-After and localizes payload', () => {
    const res = response.tooManyRequests('session_limit_reached', 86400, 'es', { max: 7 });
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['Retry-After'], '86400');
    assert.equal(body.message, 'Se alcanzó el máximo de 7 sesiones por IP y por día. Vuelve mañana.');
  });

  test('serverError defaults to localized generic message', () => {
    const res = response.serverError(null, 'es');
    assert.equal(JSON.parse(res.body).message, 'Ocurrió un error inesperado');
  });
});
