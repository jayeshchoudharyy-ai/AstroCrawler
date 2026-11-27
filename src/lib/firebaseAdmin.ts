import { initializeApp, getApps, getApp, cert, App, Credential } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

function getServiceAccountCredential(): Credential | null {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return cert(parsed);
    } catch (err) {
      console.error('[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err);
    }
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  return null;
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      (process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY &&
        (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID))
  );
}

export function getFirebaseAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApp();
  }

  const credential = getServiceAccountCredential();
  if (!credential) {
    return null;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  return initializeApp({
    credential,
    projectId,
  });
}

export function getAdminFirestore(): Firestore | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // ignore if settings were already applied
  }
  return db;
}
