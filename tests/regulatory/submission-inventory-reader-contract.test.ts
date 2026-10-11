import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const storePath = path.join(root, 'server/services/regulatory/canonicalDocumentStore.ts');
const inventoryPath = path.join(root, 'server/services/regulatory/submissionPackageInventory.ts');
const sourceFile = (file: string) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

function inventoryReaderType(): string {
  const source = sourceFile(inventoryPath);
  const load = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'loadSavedSubmissionInventory');
  if (!load || !ts.isFunctionDeclaration(load) || !load.parameters[0]?.type || !ts.isTypeLiteralNode(load.parameters[0].type)) throw new Error('Inventory input contract not found');
  const db = load.parameters[0].type.members.find(member => ts.isPropertySignature(member) && member.name.getText(source) === 'db');
  if (!db || !ts.isPropertySignature(db) || !db.type) throw new Error('Inventory database type not found');
  return db.type.getText(source);
}

/** Compile only the real table, Drizzle definitions and exported store aliases.
 * Importing the runtime facade here would pull the entire application graph.
 */
function contractDiagnostics(handleType: string): readonly ts.Diagnostic[] {
  const source = sourceFile(storePath);
  const aliases = source.statements.filter(statement => ts.isTypeAliasDeclaration(statement)
    && ['CanonicalStoreDb', 'CanonicalStoreHandle', 'CanonicalStoreReader'].includes(statement.name.text));
  const directory = mkdtempSync(path.join(tmpdir(), 'c2c-inventory-reader-'));
  const file = path.join(directory, 'reader.ts');
  try {
    writeFileSync(file, [
      `import type { NodePgDatabase } from ${JSON.stringify(path.join(root, 'node_modules/drizzle-orm/node-postgres/index.js'))};`,
      `import { canonicalDocuments } from ${JSON.stringify(path.join(root, 'shared/schema/canonical_documents'))};`,
      ...aliases.map(alias => alias.getText(source)),
      'declare const runtimeDb: NodePgDatabase<{ canonicalDocuments: typeof canonicalDocuments }>;',
      `const inventoryDb: ${handleType} = runtimeDb;`,
      'void inventoryDb;',
    ].join('\n'));
    const program = ts.createProgram([file], {
      noEmit: true, strict: true, skipLibCheck: true,
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: ['node'], typeRoots: [path.join(root, 'node_modules/@types')],
      esModuleInterop: true,
    });
    return ts.getPreEmitDiagnostics(program);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('saved submission inventory has a schema-compatible read capability', () => {
  it('accepts the schema-bearing runtime database without a cast', () => {
    const errors = contractDiagnostics(inventoryReaderType()).map(diagnostic => ({
      code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }));
    expect(errors).toEqual([]);
  });

  it('preserves the full store transaction contract rather than erasing its schema incompatibility', () => {
    expect(contractDiagnostics('CanonicalStoreHandle').map(diagnostic => diagnostic.code)).toContain(2322);
  });
});
