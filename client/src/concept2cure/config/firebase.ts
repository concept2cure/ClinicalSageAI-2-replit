/**
 * Firebase Configuration — ClinicalSageAI
 *
 * Initializes Firebase app and exports Firestore + Auth instances.
 * Used for real-time collaboration features (cursor presence, live comments,
 * document locking) alongside the primary PostgreSQL database.
 *
 * Firebase handles: real-time sync, presence, ephemeral collaboration state
 * PostgreSQL handles: persistent data, audit trail, regulatory compliance
 *
 * Configuration is loaded from environment variables. If no config is
 * provided, Firebase features gracefully degrade (no-op).
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

// ── Firebase config from environment ────────────────────────────────────────

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// ── Lazy initialization ─────────────────────────────────────────────────────

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

/** Whether Firebase is configured and available */
export function isFirebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}

/** Get Firebase app instance (lazily initialized) */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

/** Get Firestore instance */
export function getFirestoreDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!db) {
    db = getFirestore(firebaseApp);
  }
  return db;
}

/** Get Firebase Auth instance */
export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) {
    auth = getAuth(firebaseApp);
  }
  return auth;
}
