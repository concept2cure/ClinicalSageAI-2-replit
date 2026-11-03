import { describe, expect, it } from 'vitest';
import {
  assertCodespacesNoOwnerCredential,
  CODESPACES_OWNER_CREDENTIAL_NAMES,
} from '../env';

const runtime = 'postgresql://app_service:fake@ep-example-pooler.neon.tech/db?sslmode=require';

describe('Codespaces app process never holds Neon maintenance credentials', () => {
  it('permits APP_DATABASE_URL alone', () => {
    expect(() => assertCodespacesNoOwnerCredential({
      NODE_ENV: 'development', C2C_CODESPACE: '1', APP_DATABASE_URL: runtime,
    })).not.toThrow();
  });

  it.each(CODESPACES_OWNER_CREDENTIAL_NAMES)(
    'refuses %s even if a valid runtime URL is configured',
    name => {
      const env = {
        NODE_ENV: 'development', C2C_CODESPACE: '1',
        APP_DATABASE_URL: runtime,
        [name]: 'secret-owner-value',
      };
      expect(() => assertCodespacesNoOwnerCredential(env))
        .toThrow(new RegExp(String(name)));
    },
  );

  it('recognizes the native GitHub Codespaces environment marker', () => {
    expect(() => assertCodespacesNoOwnerCredential({
      CODESPACES: 'true', APP_DATABASE_URL: runtime,
      DATABASE_URL: 'secret-owner-value',
    })).toThrow(/Codespaces/);
  });

  it('does not change local development or production ECS owner handling', () => {
    expect(() => assertCodespacesNoOwnerCredential({
      NODE_ENV: 'development', DATABASE_URL: 'local-maintenance-url',
    })).not.toThrow();
    expect(() => assertCodespacesNoOwnerCredential({
      NODE_ENV: 'production', DATABASE_OWNER_URL: 'maintenance-url',
    })).not.toThrow();
  });
});
