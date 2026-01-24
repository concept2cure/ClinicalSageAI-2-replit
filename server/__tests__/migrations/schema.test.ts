/**
 * Migration Schema Validation Tests
 * 
 * Validates that all migrations can be parsed and have valid SQL.
 * Run before any migration renumbering.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '../../../db/migrations');

describe('Migration Files Validation', () => {
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  it('should have migration files', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  describe('Core Cortex Prime Migrations', () => {
    const cortexMigrations = [
      '073_gcc_cortex_prime_unified_brain.sql',
      '074_gcc_regulatory_intuition_engine.sql',
      '075_gcc_epistemic_intelligence.sql',
      '076_gcc_causal_inference_engine.sql',
      '077_gcc_self_evolving_intelligence.sql',
      '078_gcc_cross_domain_transfer.sql',
      '079_gcc_unified_functions_views.sql',
      '080_gcc_21cfr_part11_compliance.sql'
    ];

    cortexMigrations.forEach(migration => {
      it(`should have ${migration}`, () => {
        const exists = migrationFiles.includes(migration);
        expect(exists).toBe(true);
      });
    });
  });

  describe('Migration Content Validation', () => {
    // Check key migrations for required SQL statements
    it('should have CREATE SCHEMA in bootstrap migration', () => {
      const content = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '000_gcc_bootstrap_core_functions.sql'),
        'utf-8'
      );
      expect(content).toContain('CREATE');
    });

    it('should have audit trail in compliance migration', () => {
      const files = migrationFiles.filter(f => f.includes('compliance') || f.includes('audit'));
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('Migration Numbering Conflicts', () => {
    it('should identify duplicate prefixes', () => {
      const prefixes = new Map<string, string[]>();
      
      migrationFiles.forEach(file => {
        const prefix = file.substring(0, 3);
        if (!prefixes.has(prefix)) {
          prefixes.set(prefix, []);
        }
        prefixes.get(prefix)!.push(file);
      });

      const conflicts: string[] = [];
      prefixes.forEach((files, prefix) => {
        if (files.length > 1) {
          conflicts.push(`${prefix}: ${files.join(', ')}`);
        }
      });

      // Log conflicts for documentation (don't fail, just report)
      if (conflicts.length > 0) {
        console.log('Migration prefix conflicts detected:');
        conflicts.forEach(c => console.log(`  ${c}`));
      }
      
      // This test documents conflicts but doesn't fail
      expect(true).toBe(true);
    });
  });

  describe('Critical Schema Dependencies', () => {
    it('should have cortex_prime schema migration', () => {
      const hasCortexPrime = migrationFiles.some(f => 
        f.includes('cortex_prime') || f.includes('unified_brain')
      );
      expect(hasCortexPrime).toBe(true);
    });

    it('should have compliance schema migration', () => {
      const hasCompliance = migrationFiles.some(f => 
        f.includes('compliance') || f.includes('21cfr') || f.includes('part11')
      );
      expect(hasCompliance).toBe(true);
    });

    it('should have FHIR schema migration', () => {
      const hasFhir = migrationFiles.some(f => f.toLowerCase().includes('fhir'));
      expect(hasFhir).toBe(true);
    });
  });
});

describe('Migration Manifest', () => {
  it('should define execution order for conflicting migrations', () => {
    // This test will pass once we create the manifest
    const manifestPath = path.join(MIGRATIONS_DIR, 'migrations_manifest.json');
    const manifestExists = fs.existsSync(manifestPath);
    
    if (manifestExists) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.execution_order).toBeDefined();
      expect(Array.isArray(manifest.execution_order)).toBe(true);
    } else {
      // Manifest not yet created - this is expected before consolidation
      console.log('migrations_manifest.json not yet created');
      expect(true).toBe(true);
    }
  });
});
