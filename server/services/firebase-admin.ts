/**
 * Firebase Admin SDK — Server-Side Singleton
 *
 * Initializes the Firebase Admin SDK safely for server-side use.
 * Provides Firestore Admin access for the projection publisher.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  SERVER-ONLY. Never import this from client code.                  ║
 * ║  Admin credentials must never reach the browser.                   ║
 * ║  If env config is missing, returns null (graceful no-op).          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Configuration (environment variables):
 *   FIREBASE_PROJECT_ID         — Firebase project ID (required)
 *   FIREBASE_CLIENT_EMAIL       — Service account email (optional for emulator)
 *   FIREBASE_PRIVATE_KEY        — Service account key (optional for emulator)
 *   FIRESTORE_EMULATOR_HOST     — Set for local dev to skip credentials
 *
 * @module server/services/firebase-admin
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (avoid hard dependency on firebase-admin package)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimal Firestore Admin interface.
 * Compatible with firebase-admin SDK's Firestore type.
 * If the firebase-admin package is installed, use its concrete types.
 * Otherwise this interface allows a mock or emulator adapter.
 */
export interface FirestoreAdminDb {
  collection(path: string): FirestoreAdminCollection;
  doc(path: string): FirestoreAdminDoc;
}

export interface FirestoreAdminCollection {
  doc(id?: string): FirestoreAdminDoc;
}

export interface FirestoreAdminDoc {
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface FirebaseAdminConfig {
  readonly projectId: string;
  readonly clientEmail?: string;
  readonly privateKey?: string;
  readonly useEmulator: boolean;
}

function loadConfig(): FirebaseAdminConfig | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  return {
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    useEmulator: !!process.env.FIRESTORE_EMULATOR_HOST,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let _db: FirestoreAdminDb | null | undefined;
let _initialized = false;

/**
 * Get the server-side Firestore Admin instance.
 * Returns null if Firebase is not configured.
 *
 * Safe to call multiple times — initializes once.
 */
export async function getFirestoreAdmin(): Promise<FirestoreAdminDb | null> {
  if (_initialized) return _db ?? null;
  _initialized = true;

  const config = loadConfig();
  if (!config) {
    console.info('[firebase-admin] No FIREBASE_PROJECT_ID set — Firebase projections disabled');
    _db = null;
    return null;
  }

  try {
    // Dynamic import to avoid hard dependency on firebase-admin package
    const admin = await import('firebase-admin');

    // Prevent duplicate initialization
    const existingApp = admin.default.apps.length > 0 ? admin.default.apps[0] : null;

    if (existingApp) {
      _db = existingApp.firestore() as unknown as FirestoreAdminDb;
    } else {
      const credential = config.useEmulator
        ? admin.default.credential.applicationDefault()
        : config.clientEmail && config.privateKey
          ? admin.default.credential.cert({
              projectId: config.projectId,
              clientEmail: config.clientEmail,
              privateKey: config.privateKey,
            })
          : admin.default.credential.applicationDefault();

      const app = admin.default.initializeApp({
        credential,
        projectId: config.projectId,
      });

      _db = app.firestore() as unknown as FirestoreAdminDb;
    }

    const mode = config.useEmulator ? 'emulator' : 'production';
    console.info(`[firebase-admin] Firestore initialized (${mode}, project: ${config.projectId})`);

    return _db;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[firebase-admin] Failed to initialize — Firebase projections disabled: ${message}`);
    _db = null;
    return null;
  }
}

/**
 * Check if Firebase Admin is configured (env vars present).
 * Does NOT initialize — just checks config availability.
 */
export function isFirebaseAdminConfigured(): boolean {
  return !!process.env.FIREBASE_PROJECT_ID;
}

/**
 * Reset singleton for testing. Do not call in production.
 */
export function _resetForTesting(): void {
  _db = undefined;
  _initialized = false;
}
