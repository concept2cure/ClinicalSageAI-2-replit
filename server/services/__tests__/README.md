# Device Profile API Testing

This directory contains automated tests for the unified Device Profile API that powers both CER and 510(k) workflows.

## Overview

We have implemented a comprehensive testing strategy with:

1. **Unit Tests**: Testing the device profile service layer directly
2. **Integration Tests**: Testing the Express routes via HTTP calls

## Running Tests

Once Jest is installed, you can run the tests using:

```bash
npm test
```

To run only the device profile service tests:

```bash
npm test -- -t deviceProfileService
```

To run only the device profile routes tests:

```bash
npm test -- -t "DeviceProfileRoutes (integration)"
```

## Test Coverage

The tests cover the following functionality:

### Service Layer Tests (`deviceProfileService.test.ts`)

- Creating profiles and verifying the returned data
- Listing all profiles
- Getting a single profile by ID
- Updating an existing profile
- Deleting a profile
- Error handling for non-existent profiles

### API Routes Tests (`deviceProfileRoutes.test.ts`)

- POST /api/device-profiles - Creating new profiles
- GET /api/device-profiles - Retrieving all profiles
- GET /api/device-profiles/:id - Retrieving a specific profile
- PUT /api/device-profiles/:id - Updating a profile
- DELETE /api/device-profiles/:id - Deleting a profile

## Best Practices

- Always run tests before making significant changes to the device profile API
- Keep the test suite up to date when modifying the service or routes
- Use the tests as documentation for how the API should behave
