export default {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.(test|spec).{ts,js}'],
  testPathIgnorePatterns: ['/node_modules/', '/_archive/'],
  setupFilesAfterEnv: ['<rootDir>/../scripts/jest.setup.js'],
  transform: {
    '^.+\\.[tj]s$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
};
