/**
 * Every `SIGNED_REGISTERS` entry must describe its own table truthfully.
 *
 * The descriptor is what four things read: the create refusal, the edit
 * refusal, the signing ceremony's SQL, and the client's status control. It
 * names a table, a status column, two signature columns and an id shape — all
 * as strings, none of which the compiler checks against the table they claim
 * to describe. So a wrong one is a runtime refusal with nothing wrong in the
 * diff.
 *
 * That is not hypothetical. `comparabilityAssessments` was first written with
 * `idKind: 'integer'`, because the four registers before it were serial. Its
 * table is uuid-keyed (shared/schema/regulatory-atoms.ts), so EVERY approval
 * answered "A comparability assessment id is required" — found by running the
 * ceremony against the register, not by reading the file. This test is that
 * discovery, made cheap: it fails on the mismatch itself.
 */
import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName, type Table } from 'drizzle-orm';
import { SIGNED_REGISTERS, type SignedRegister } from '../signed-record';
import {
  analyticalMethods,
  processValidation,
  cmcContainerClosures,
  cmcReferenceStandards,
  cmcImpurityProfiles,
  cmcCharacterizationStudies,
} from '../../../../shared/schema';
import { manufacturingProcesses } from '../../../../shared/cmc-schema';
import { cmcComparabilityAssessments } from '../../../../shared/schema/regulatory-atoms';

/** The Drizzle table each descriptor claims to describe. */
const TABLES: Record<string, Table> = {
  containerClosures: cmcContainerClosures,
  referenceStandards: cmcReferenceStandards,
  impurityProfiles: cmcImpurityProfiles,
  characterizationStudies: cmcCharacterizationStudies,
  manufacturingProcesses: manufacturingProcesses as unknown as Table,
  analyticalMethods,
  processValidation,
  comparabilityAssessments: cmcComparabilityAssessments as unknown as Table,
};

/** The table's columns by their database name, which is what the SQL uses. */
function columnsByName(table: Table): Map<string, { dataType: string; columnType: string }> {
  const out = new Map<string, { dataType: string; columnType: string }>();
  for (const col of Object.values(getTableColumns(table)) as Array<{ name: string; dataType: string; columnType: string }>) {
    out.set(col.name, { dataType: col.dataType, columnType: col.columnType });
  }
  return out;
}

describe('SIGNED_REGISTERS describes the tables it claims to', () => {
  it('covers every entry with a table in this test, so a new register cannot be added unchecked', () => {
    expect(Object.keys(TABLES).sort()).toEqual(Object.keys(SIGNED_REGISTERS).sort());
  });

  for (const [key, register] of Object.entries(SIGNED_REGISTERS) as Array<[string, SignedRegister]>) {
    describe(key, () => {
      const table = TABLES[key];

      it('names the right table', () => {
        expect(getTableName(table)).toBe(register.table);
      });

      it('names a status column, a signer column and a date column that all exist', () => {
        const cols = columnsByName(table);
        for (const column of [register.statusColumn, register.signedByColumn, register.signedAtColumn]) {
          expect(cols.has(column), `${register.table} has no column "${column}"`).toBe(true);
        }
      });

      it('declares the id shape the primary key actually has', () => {
        const id = columnsByName(table).get('id');
        expect(id, `${register.table} has no id column`).toBeTruthy();
        /* serial → PgSerial/PgInteger; the atom tables → PgUUID. The ceremony
           validates the id against this before it touches the database. */
        const isUuid = /uuid/i.test(id!.columnType);
        expect(register.idKind).toBe(isUuid ? 'uuid' : 'integer');
      });

      it('declares a signature date column that is a timestamp, not a string', () => {
        const at = columnsByName(table).get(register.signedAtColumn)!;
        expect(at.dataType, `${register.table}.${register.signedAtColumn}`).toBe('date');
      });

      it('names its own register path, and names it once across the table', () => {
        expect(register.registerPath).toMatch(/^[a-z0-9-]+$/);
        const sharing = Object.values(SIGNED_REGISTERS).filter((r) => r.registerPath === register.registerPath);
        expect(sharing).toHaveLength(1);
      });

      it('signs with a word the ceremony can turn into an act', () => {
        expect(['qualify', 'validate', 'approve']).toContain(register.signPath);
        expect(register.signedValue).toMatch(/^(qualified|validated|approved)$/);
        /* The verb is what a refusal says is governed, so it must read as a
           noun phrase, not a bare status word. */
        expect(register.verb.length).toBeGreaterThan(5);
      });
    });
  }
});
