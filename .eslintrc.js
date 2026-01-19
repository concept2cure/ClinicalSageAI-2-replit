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
  },
  settings: {
    react: {
      version: 'detect', // Auto-detect React version
    },
  },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', '.replit/', 'public/assets/'],
};
