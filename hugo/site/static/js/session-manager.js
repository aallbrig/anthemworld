/**
 * session-manager.js — Site-wide anonymous session management
 *
 * Creates and maintains an anonymous session with the Anthem World backend.
 * Sessions are stored in localStorage so they persist across tabs and reloads.
 * When a session expires (24h server TTL), the next API interaction triggers
 * automatic re-creation.
 *
 * Usage:
 *   const id = await window.AnthemSession.ensureSession();
 *   const id = window.AnthemSession.getSessionId(); // sync, may be null
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'aw_session';
  const MAX_AGE_MS  = 23 * 60 * 60 * 1000; // 23h — conservative vs 24h server TTL

  function getApiBase() {
    return (global.GAME_API_URL || '').replace(/\/$/, '');
  }

  function loadSession() {
    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveSession(data) {
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function clearSession() {
    try {
      global.localStorage?.removeItem(STORAGE_KEY);
      // Also clear legacy key used by game.js
      global.sessionStorage?.removeItem('anthem_session_id');
    } catch (_) {}
  }

  function isExpired(session) {
    if (!session?.created_at) return true;
    return Date.now() - new Date(session.created_at).getTime() > MAX_AGE_MS;
  }

  /** Synchronous — returns cached session_id or null. */
  function getSessionId() {
    const session = loadSession();
    if (session && !isExpired(session)) return session.session_id;
    return null;
  }

  let _pendingCreate = null;

  /**
   * Ensure a valid session exists.  Creates one via POST /session if needed.
   * Returns session_id or null on failure (API unreachable, rate-limited, etc.).
   */
  async function ensureSession() {
    // Reuse cached session if still fresh
    const cached = loadSession();
    if (cached && !isExpired(cached)) return cached.session_id;

    // Coalesce concurrent calls
    if (_pendingCreate) return _pendingCreate;

    const apiBase = getApiBase();
    if (!apiBase) return null; // No API configured (prod same-origin TBD)

    _pendingCreate = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${apiBase}/session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Language': global.AnthemI18n?.lang || navigator.language || 'en',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        const body = await res.json();
        if (!body.session_id) return null;
        saveSession({
          session_id: body.session_id,
          user_country: body.user_country || null,
          created_at: body.created_at || new Date().toISOString(),
        });
        // Migrate: also write to sessionStorage for backward compat with game.js
        try { global.sessionStorage?.setItem('anthem_session_id', body.session_id); } catch (_) {}
        return body.session_id;
      } catch (_) {
        return null; // Network error — don't block page
      } finally {
        _pendingCreate = null;
      }
    })();

    return _pendingCreate;
  }

  /**
   * Called when the server returns 403 (session not found / expired).
   * Clears the stale session and creates a fresh one.
   */
  async function refreshSession() {
    clearSession();
    return ensureSession();
  }

  const api = {
    getSessionId,
    ensureSession,
    refreshSession,
    clearSession,
    STORAGE_KEY,
  };

  global.AnthemSession = api;

  // Auto-create on page load (non-blocking, fire-and-forget)
  if (global.document) {
    const init = () => { ensureSession().catch(() => {}); };
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof window !== 'undefined' ? window : globalThis));
