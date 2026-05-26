const js = require('@eslint/js');

module.exports = [
  {
    ...js.configs.recommended,
    files: ['static/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        Audio: 'readonly',
        performance: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        XMLHttpRequest: 'readonly',
        FormData: 'readonly',
        AbortController: 'readonly',
        // Third-party libs loaded via script tags
        $: 'readonly',
        L: 'readonly',
        QRCode: 'readonly',
        confetti: 'readonly',
        // Classes defined in other loaded scripts
        CountryHighlightMap: 'readonly',
        // Browser APIs not universally included in ecma2021
        Blob: 'readonly',
        // Cross-env module export guard (typeof module !== 'undefined')
        module: 'writable',
        exports: 'writable',
        // Classes/objects defined in other loaded scripts
        AudioController: 'readonly',
        AnthemAudioWidget: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', {
        vars: 'all',
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
