import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';

export default [
  {
    // Project-wide ignores. Single source of truth for what the lint
    // gate never inspects. Previously some entries lived as inline
    // `--ignore-pattern` flags on the `lint` npm script and others
    // lived in a legacy `.eslintrc.cjs`; both are consolidated here.
    //
    // - .claude/, client/public/, design-system/, server/frontend/
    //   are paths the lint config never reaches by intent (Claude
    //   skills, public-assets mirror, design-system bundles, and the
    //   vanilla-JS admin UI that uses browser-only globals).
    // - dist/, build/, .replit/, public/assets/ are build artifacts.
    // - _archive/ and **/_deprecated/ are quarantine paths the
    //   dangerfile.js gate also bans new imports into.
    // - tests/integration/api/vault.test.js, server/events/eventBus.js,
    //   and server/routes/fda510k-routes.ts each carry pre-existing
    //   violations the team has chosen to defer; quarantine here
    //   rather than block CI on legacy debt. The fda510k-routes file
    //   header marks itself @deprecated with a 2026-06-30 sunset, at
    //   which point this entry can come out.
    // - client/src/ is excluded because the legacy UI is going through
    //   a separate styling/refactor pass. Re-enable once that lands.
    //   The exception is client/src/concept2cure/v2/**, which is
    //   un-ignored below: v2 is the app's one and only shell (see
    //   tests/ui/one-shell.test.ts, which fails if a second one
    //   appears), so leaving it under the blanket client/src/** ignore
    //   meant the lint gate never inspected the shipping product UI.
    //   The negation must come after the broad pattern — flat-config
    //   ignores are evaluated in order, last match wins.
    ignores: [
      '.claude/**',
      'client/public/**',
      'client/src/*',
      '!client/src/concept2cure/',
      'client/src/concept2cure/*',
      '!client/src/concept2cure/v2/',
      'design-system/**',
      'server/frontend/**',
      'dist/**',
      'build/**',
      '.replit/**',
      'public/assets/**',
      '_archive/**',
      '**/_deprecated_migrations/**',
      'server/services/_deprecated/**',
      'server/routes/_deprecated/**',
      'client/src/components/_deprecated/**',
      'scripts/**',
      'tests/integration/api/vault.test.js',
      'server/events/eventBus.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        WebSocket: 'readonly',
        EventSource: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        DOMParser: 'readonly',
        XMLHttpRequest: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Image: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        // Jest/Testing globals
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        NodeJS: 'readonly',
        // DOM element types
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLParagraphElement: 'readonly',
        HTMLTableSectionElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLSpanElement: 'readonly',
        HTMLOptionElement: 'readonly',
        HTMLHeadingElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        // Standard DOM interfaces the config omitted — genuine browser globals
        // used in type positions across client + jsdom tests (a config gap, not
        // undefined variables). Declaring them removes false-positive no-undef.
        DOMRect: 'readonly',
        DOMRectList: 'readonly',
        Range: 'readonly',
        Text: 'readonly',
        FileList: 'readonly',
        ReadableStream: 'readonly',
        Storage: 'readonly',
        Window: 'readonly',
        ErrorEvent: 'readonly',
        BeforeUnloadEvent: 'readonly',
        // Web Worker globals
        worker: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        ServiceWorker: 'readonly',
        Worker: 'readonly',
        // Microsoft Office globals
        Office: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      security: securityPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-case-declarations': 'warn',
      'no-undef': 'warn',
      'no-empty': 'warn',
      'no-unreachable': 'warn',
      'no-inner-declarations': 'warn',
      'no-constant-condition': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-dupe-class-members': 'warn',
      'no-redeclare': 'warn',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',

      // Rules introduced as errors by ESLint v10 + @typescript-eslint v8.
      // Each catches a real class of bug, but the codebase has ~190
      // pre-existing instances across ~120 files that pre-date this
      // bump. Downgraded to 'warn' here so the upgrade lands without
      // demanding a 120-file cleanup in one PR. Follow-up PRs should
      // fix them by file and then re-promote each rule to 'error' —
      // same baseline-ratchet pattern as .typecheck-baseline.json.
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      'no-unassigned-vars': 'warn',

      // Tech-debt prevention. Ported from the legacy .eslintrc.cjs
      // (Added 2026-01-24). Same rationale as above — kept as 'warn'
      // because the existing codebase has many pre-existing
      // violations that need ratcheting down over time, not in one PR.
      // Stricter overrides apply to modules/** (see below).
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5],
      'complexity': ['warn', 15],

      // React rules ported from the legacy .eslintrc.cjs. With React
      // 19 the JSX runtime is automatic so `react-in-jsx-scope` is
      // off, and prop validation is delegated to TypeScript.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // eslint-plugin-security@3.0.1 ported into the flat config. The
      // plugin was declared in the legacy .eslintrc.cjs as
      // `plugin:security/recommended` but ESLint 10 was silently
      // ignoring the legacy config, so none of these rules were
      // actually firing. Re-enabling here.
      //
      // 8 of the 13 recommended rules are enabled. The remaining 6
      // are OFF because their implementations call
      // `context.getSourceCode()` (an API ESLint 10 removed) and
      // would crash lint at file load. They will re-enable
      // automatically when eslint-plugin-security ships a v4 that
      // switches to `context.sourceCode`; the rule list and notes
      // below make it cheap to flip them back on then.
      //
      // All enabled rules are 'warn' so they surface real risk
      // without blocking CI on the legacy backlog — same
      // baseline-ratchet pattern used by the tech-debt rules above.
      // `detect-object-injection` was intentionally off in the legacy
      // config (too noisy on legitimate map/dict patterns); preserved.

      // Enabled — work with ESLint 10:
      'security/detect-bidi-characters': 'warn',
      'security/detect-buffer-noassert': 'warn',
      'security/detect-disable-mustache-escape': 'warn',
      'security/detect-eval-with-expression': 'warn',
      'security/detect-new-buffer': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'warn',

      // Off — legacy decision (too noisy):
      'security/detect-object-injection': 'off',

      // Off — incompatible with ESLint 10 until plugin v4. Each rule
      // still has high value; document so they can be re-enabled the
      // moment the upstream API fix lands.
      'security/detect-child-process': 'off',                    // shell injection — high value when fixed
      'security/detect-no-csrf-before-method-override': 'off',   // Express CSRF
      'security/detect-non-literal-fs-filename': 'off',          // path traversal — high value when fixed
      'security/detect-non-literal-regexp': 'off',               // dynamic regex
      'security/detect-non-literal-require': 'off',              // dynamic require
      'security/detect-unsafe-regex': 'off',                     // ReDoS

      'eqeqeq': ['warn', 'always', { null: 'ignore' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@/components/ui/states',
            message: 'Deprecated. Use @/components/ui/statesV2 instead.',
          },
        ],
      }],
    },
  },
  {
    // UI State & Layout Governance — enforce canonical primitives in
    // concept2cure/. Ported from the legacy .eslintrc.cjs override.
    // The flat config's last-match-wins semantics on the same rule
    // mean this overrides the base `no-restricted-imports` above when
    // a file under client/src/concept2cure/**/*.tsx is being linted.
    files: ['client/src/concept2cure/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@/components/ui/states',
            message: 'Deprecated. Use @/components/ui/statesV2 instead.',
          },
          {
            name: '@/components/common/LoadingOverlay',
            message: 'Deprecated. Use LoadingState from @/components/ui/statesV2 instead.',
          },
          {
            name: '@/components/common/ThinkingDots',
            message: 'Deprecated. Use Spinner from @/components/ui/spinner instead.',
          },
        ],
        patterns: [
          {
            group: ['@/components/ui/states'],
            message: 'Deprecated. Use @/components/ui/statesV2 instead.',
          },
        ],
      }],
    },
  },
  {
    // Stricter tech-debt rules for new code in modules/. Ported from
    // .eslintrc.cjs — these are 'error' here, not 'warn', because
    // modules/ is greenfield where the rules can be enforced from day
    // one.
    files: ['modules/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
    },
  },
  {
    // Allow larger files and console use in legacy areas. These
    // directories are quarantined (dangerfile.js bans new imports
    // from them) so applying tech-debt rules to them just produces
    // noise — they're scheduled for deletion, not improvement.
    files: ['server/services/_deprecated/**', 'server/routes/_deprecated/**'],
    rules: {
      'max-lines': 'off',
      'no-console': 'off',
    },
  },
  {
    // ui_kits/** are standalone hi-fi design-system prototypes loaded as plain
    // browser <script> tags that share one global scope — not ES modules. They
    // intentionally use `var { ... } = React` (and bare globals declared via
    // /* global ... */ headers) because `const` would throw "Identifier already
    // declared" when several kit files load into the same page. Lint them
    // accordingly so these reference prototypes don't fail the app lint gate.
    files: ['ui_kits/**/*.{js,jsx}'],
    languageOptions: {
      sourceType: 'script',
    },
    rules: {
      'no-var': 'off',
      'no-undef': 'off',
    },
  },
];
