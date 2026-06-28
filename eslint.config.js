import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

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
    // - client/src/ is currently excluded because the UI is going
    //   through a separate styling/refactor pass. Re-enable once that
    //   lands.
    ignores: [
      '.claude/**',
      'client/public/**',
      'client/src/**',
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
      'server/routes/fda510k-routes.ts',
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
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
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
