# Tests

This directory contains all tests for ClinicalSageAI.

## Structure

```
tests/
├── unit/           # Unit tests for individual functions/modules
├── integration/    # Integration tests for API endpoints and services
├── e2e/            # End-to-end tests using Playwright
├── data/           # Test fixtures and mock data
└── performance/    # Performance and load tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm test -- --testPathPattern=unit

# Run integration tests only
npm test -- --testPathPattern=integration

# Run e2e tests
npx playwright test

# Run with coverage
npm test -- --coverage
```

## Test Conventions

- **Naming:** `{module}.test.ts` for unit, `{feature}.integration.test.ts` for integration
- **E2E:** `{workflow}.e2e.spec.ts`
- **Coverage Target:** 50% by Q3 2026

## Writing Tests

```typescript
// Unit test example
describe('CERService', () => {
  it('should generate valid CER report', async () => {
    // Arrange
    const input = { ... };
    
    // Act
    const result = await cerService.generate(input);
    
    // Assert
    expect(result).toBeDefined();
  });
});
```
