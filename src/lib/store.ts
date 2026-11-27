import fs from 'fs';
import path from 'path';
import { TargetPage, AuditReport, AppSettings, SelfCronState } from './types';
import { getAdminFirestore } from './firebaseAdmin';

const DATA_DIR = path.join(process.cwd(), 'data');
const TARGETS_FILE = path.join(DATA_DIR, 'targets.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CRON_STATE_FILE = path.join(DATA_DIR, 'cron-state.json');

export const DEFAULT_SETTINGS: AppSettings = {
  recipientEmail: 'jayeshchoudharyy@gmail.com',
  defaultRazorpayLink: 'https://pages.razorpay.com/',
  scheduleDescription: 'Twice daily at 9:00 AM & 9:00 PM IST',
  automationEnabled: true,
  automationsPerDay: 2,
  automationTimes: ['09:00', '21:00'],
  timezone: 'Asia/Kolkata',
};

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatScheduleDescription(
  times: string[],
  enabled: boolean = true,
  timezone: string = 'Asia/Kolkata'
): string {
  if (!enabled || times.length === 0) {
    return 'Automation paused';
  }
  const tzLabel = timezone === 'Asia/Kolkata' ? 'IST' : timezone;
  const formatted = [...times].sort().map(formatTime12h).join(', ');
  const freq =
    times.length === 1
      ? 'Once daily'
      : times.length === 2
      ? 'Twice daily'
      : `${times.length}x daily`;
  return `${freq} at ${formatted} ${tzLabel}`;
}

const DEFAULT_TARGETS: TargetPage[] = [
  {
    id: 'target-1',
    name: 'Sample Checkout Landing Page',
    url: 'https://example.com',
    expectedRazorpayLink: 'https://rzp.io/l/sample-payment',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

function ensureDirectoryExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getStorageBackend(): 'firebase' | 'local' {
  return getAdminFirestore() ? 'firebase' : 'local';
}

/**
 * Reads any monitored URLs configured in environment variables (MONITORED_URLS or TARGET_URLS).
 */
export function getEnvTargets(): TargetPage[] {
  const envRaw =
    process.env.MONITORED_URLS ||
    process.env.TARGET_URLS ||
    process.env.MONITORED_PAGES;
  if (!envRaw) return [];

  const defaultRzp =
    process.env.DEFAULT_RAZORPAY_LINK || 'https://pages.razorpay.com/';
  const urlEntries = envRaw
    .split(/[\r\n,;]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http://') || u.startsWith('https://'));

  return urlEntries.map((urlStr, index) => {
    let hostname = urlStr;
    let pathname = '';
    try {
      const parsed = new URL(urlStr);
      hostname = parsed.hostname;
      const cleanPath = parsed.pathname.replace(/^\/|\/$/g, '');
      if (cleanPath) {
        pathname = `/${cleanPath}`;
      }
    } catch {}

    const displayName = pathname ? `${hostname}${pathname}` : hostname;

    return {
      id: `env-target-${index + 1}-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: displayName,
      url: urlStr,
      expectedRazorpayLink: defaultRzp,
      isActive: true,
      isEnvConfigured: true,
      createdAt: new Date().toISOString(),
    };
  });
}

function readLocalTargets(): TargetPage[] {
  ensureDirectoryExists();
  const envTargets = getEnvTargets();

  let storedTargets: TargetPage[] = [];
  if (fs.existsSync(TARGETS_FILE)) {
    try {
      const data = fs.readFileSync(TARGETS_FILE, 'utf-8');
      storedTargets = JSON.parse(data);
    } catch (err) {
      console.error('Error reading targets:', err);
    }
  }

  let hasMerged = false;
  for (const envT of envTargets) {
    const existing = storedTargets.find(
      (t) => t.url.toLowerCase() === envT.url.toLowerCase()
    );
    if (!existing) {
      storedTargets.push(envT);
      hasMerged = true;
    } else {
      existing.isEnvConfigured = true;
      if (
        existing.name === existing.url ||
        existing.name === 'grow.askpuran.com'
      ) {
        existing.name = envT.name;
        hasMerged = true;
      }
    }
  }

  if (storedTargets.length === 0) {
    storedTargets = DEFAULT_TARGETS;
    writeLocalTargets(storedTargets);
    return storedTargets;
  }

  if (hasMerged) {
    writeLocalTargets(storedTargets);
  }

  return storedTargets;
}

function writeLocalTargets(targets: TargetPage[]) {
  try {
    ensureDirectoryExists();
    fs.writeFileSync(TARGETS_FILE, JSON.stringify(targets, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write local targets.json:', err);
  }
}

export async function getTargets(): Promise<TargetPage[]> {
  const db = getAdminFirestore();
  if (!db) {
    return readLocalTargets();
  }

  try {
    const snap = await db.collection('targets').get();
    let targets: TargetPage[] = snap.docs.map((d) => d.data() as TargetPage);

    // Seed Firestore from local targets.json / .env if empty
    if (targets.length === 0) {
      targets = readLocalTargets();
      if (targets.length > 0) {
        const batch = db.batch();
        for (const t of targets) {
          batch.set(db.collection('targets').doc(t.id), t);
        }
        await batch.commit();
      }
      return targets;
    }

    // Merge any new envTargets into Firestore
    const envTargets = getEnvTargets();
    const batch = db.batch();
    let hasNew = false;
    for (const envT of envTargets) {
      const existing = targets.find(
        (t) => t.url.toLowerCase() === envT.url.toLowerCase()
      );
      if (!existing) {
        targets.push(envT);
        batch.set(db.collection('targets').doc(envT.id), envT);
        hasNew = true;
      }
    }
    if (hasNew) {
      await batch.commit();
    }

    return targets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch (err) {
    console.error('[Firestore] Error reading targets, falling back to local:', err);
    return readLocalTargets();
  }
}

export async function saveTargets(targets: TargetPage[]): Promise<void> {
  writeLocalTargets(targets);
  const db = getAdminFirestore();
  if (!db) return;

  const batch = db.batch();
  for (const t of targets) {
    batch.set(db.collection('targets').doc(t.id), t);
  }
  await batch.commit();
}

export async function addTarget(
  target: Omit<TargetPage, 'id' | 'createdAt'>
): Promise<TargetPage> {
  const newTarget: TargetPage = {
    ...target,
    id: `target-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  const db = getAdminFirestore();
  if (db) {
    await db.collection('targets').doc(newTarget.id).set(newTarget);
  }

  const local = readLocalTargets();
  local.push(newTarget);
  writeLocalTargets(local);

  return newTarget;
}

export async function updateTarget(
  id: string,
  updates: Partial<TargetPage>
): Promise<TargetPage | null> {
  const db = getAdminFirestore();
  if (db) {
    const docRef = db.collection('targets').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const updated = { ...(snap.data() as TargetPage), ...updates };
    await docRef.set(updated, { merge: true });

    // Keep local mirror in sync if available
    try {
      const local = readLocalTargets();
      const idx = local.findIndex((t) => t.id === id);
      if (idx !== -1) {
        local[idx] = updated;
        writeLocalTargets(local);
      }
    } catch {}

    return updated;
  }

  const targets = readLocalTargets();
  const index = targets.findIndex((t) => t.id === id);
  if (index === -1) return null;
  targets[index] = { ...targets[index], ...updates };
  writeLocalTargets(targets);
  return targets[index];
}

export async function deleteTarget(id: string): Promise<boolean> {
  const db = getAdminFirestore();
  if (db) {
    await db.collection('targets').doc(id).delete();
  }

  const targets = readLocalTargets();
  const filtered = targets.filter((t) => t.id !== id);
  const removedLocally = filtered.length < targets.length;
  if (removedLocally) {
    writeLocalTargets(filtered);
  }
  return db ? true : removedLocally;
}

function readLocalReports(): AuditReport[] {
  ensureDirectoryExists();
  if (!fs.existsSync(REPORTS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(REPORTS_FILE, 'utf-8');
    const reports: AuditReport[] = JSON.parse(data);
    return reports.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (err) {
    console.error('Error reading reports:', err);
    return [];
  }
}

export async function getReports(): Promise<AuditReport[]> {
  const db = getAdminFirestore();
  if (!db) {
    return readLocalReports();
  }

  try {
    const snap = await db
      .collection('reports')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    if (snap.empty) {
      const local = readLocalReports();
      if (local.length > 0) {
        const batch = db.batch();
        for (const r of local.slice(0, 25)) {
          batch.set(db.collection('reports').doc(r.id), r);
        }
        await batch.commit();
      }
      return local;
    }

    return snap.docs.map((d) => d.data() as AuditReport);
  } catch (err) {
    console.error('[Firestore] Error reading reports, falling back to local:', err);
    return readLocalReports();
  }
}

export async function saveReport(report: AuditReport): Promise<void> {
  try {
    ensureDirectoryExists();
    const reports = readLocalReports();
    const updated = [report, ...reports].slice(0, 50);
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write local reports.json:', err);
  }

  const db = getAdminFirestore();
  if (db) {
    await db.collection('reports').doc(report.id).set(report);
  }
}

function readLocalSettings(): AppSettings {
  ensureDirectoryExists();
  if (!fs.existsSync(SETTINGS_FILE)) {
    try {
      fs.writeFileSync(
        SETTINGS_FILE,
        JSON.stringify(DEFAULT_SETTINGS, null, 2),
        'utf-8'
      );
    } catch (e) {
      console.error('Error writing default settings:', e);
    }
    return DEFAULT_SETTINGS;
  }
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch (err) {
    console.error('Error reading settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export async function getSettings(): Promise<AppSettings> {
  const db = getAdminFirestore();
  if (!db) {
    return readLocalSettings();
  }

  try {
    const doc = await db.collection('settings').doc('app').get();
    if (!doc.exists) {
      const local = readLocalSettings();
      await db.collection('settings').doc('app').set(local);
      return local;
    }
    return { ...DEFAULT_SETTINGS, ...(doc.data() as Partial<AppSettings>) };
  } catch (err) {
    console.error('[Firestore] Error reading settings, falling back to local:', err);
    return readLocalSettings();
  }
}

export async function saveSettings(
  settings: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...settings };

  try {
    ensureDirectoryExists();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write local settings.json:', err);
  }

  const db = getAdminFirestore();
  if (db) {
    await db.collection('settings').doc('app').set(updated, { merge: true });
  }

  return updated;
}

export async function getCronStateFromStore(): Promise<Partial<SelfCronState>> {
  const db = getAdminFirestore();
  if (db) {
    try {
      const doc = await db.collection('cronState').doc('current').get();
      if (doc.exists) {
        return doc.data() as Partial<SelfCronState>;
      }
    } catch (err) {
      console.error('[Firestore] Error reading cronState:', err);
    }
  }

  try {
    ensureDirectoryExists();
    if (fs.existsSync(CRON_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(CRON_STATE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Store] Error reading local cron-state.json:', err);
  }
  return {};
}

export async function saveCronStateToStore(state: SelfCronState): Promise<void> {
  try {
    ensureDirectoryExists();
    fs.writeFileSync(CRON_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write local cron-state.json:', err);
  }

  const db = getAdminFirestore();
  if (db) {
    try {
      await db.collection('cronState').doc('current').set(state, { merge: true });
    } catch (err) {
      console.error('[Firestore] Error saving cronState:', err);
    }
  }
}
