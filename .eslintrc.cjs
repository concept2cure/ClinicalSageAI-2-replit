module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:security/recommended',
    'plugin:tailwindcss/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react', 'security', 'tailwindcss'],
  rules: {
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/prop-types': 'off', // Use TypeScript for prop validation
    'security/detect-object-injection': 'off', // Too strict for normal usage
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_' },
    ], // Warn for unused variables except those starting with underscore
    'tailwindcss/no-custom-classname': 'warn', // Just warn for custom classnames

    // ============================================
    // TECH DEBT PREVENTION RULES (Added 2026-01-24)
    // ============================================

    // File size limits - prevent God objects
    'max-lines': ['warn', {
      max: 500,
      skipBlankLines: true,
      skipComments: true,
    }],

    // Function complexity limits
    'max-lines-per-function': ['warn', {
      max: 100,
      skipBlankLines: true,
      skipComments: true,
    }],

    // Prevent console.log in production code
    'no-console': ['warn', {
      allow: ['warn', 'error', 'info'],
    }],

    // Prevent deeply nested callbacks (pyramid of doom)
    'max-depth': ['warn', 4],

    // Limit function parameters
    'max-params': ['warn', 5],

    // Prevent overly complex functions
    'complexity': ['warn', 15],
  },
  settings: {
    react: {
      version: 'detect', // Auto-detect React version
    },
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.replit/',
    'public/assets/',
    // Deprecated folders - DO NOT IMPORT FROM THESE
    '_archive/',
    '_deprecated_migrations/',
    'server/services/_deprecated/',
    'server/routes/_deprecated/',
    'client/src/components/_deprecated/',
  ],
  overrides: [
    // Stricter rules for new code in modules/
    {
      files: ['modules/**/*.ts', 'modules/**/*.tsx'],
      rules: {
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
        'no-console': 'error',
      },
    },
    // Allow larger files in legacy areas (but still warn)
    {
      files: ['server/services/_deprecated/**', 'server/routes/_deprecated/**'],
      rules: {
        'max-lines': 'off',
        'no-console': 'off',
      },
    },
  ],
};
