import fs from 'fs';
import path from 'path';
import { TargetPage, AuditReport, AppSettings, SelfCronState } from './types';

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

export function getStorageBackend(): 'local' {
  return 'local';
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
  return readLocalTargets();
}

export async function saveTargets(targets: TargetPage[]): Promise<void> {
  writeLocalTargets(targets);
}

export async function addTarget(
  target: Omit<TargetPage, 'id' | 'createdAt'>
): Promise<TargetPage> {
  const newTarget: TargetPage = {
    ...target,
    id: `target-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  const local = readLocalTargets();
  local.push(newTarget);
  writeLocalTargets(local);

  return newTarget;
}

export async function updateTarget(
  id: string,
  updates: Partial<TargetPage>
): Promise<TargetPage | null> {
  const targets = readLocalTargets();
  const index = targets.findIndex((t) => t.id === id);
  if (index === -1) return null;
  targets[index] = { ...targets[index], ...updates };
  writeLocalTargets(targets);
  return targets[index];
}

export async function deleteTarget(id: string): Promise<boolean> {
  const targets = readLocalTargets();
  const filtered = targets.filter((t) => t.id !== id);
  if (filtered.length === targets.length) return false;
  writeLocalTargets(filtered);
  return true;
}

export async function getReports(): Promise<AuditReport[]> {
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

export async function saveReport(report: AuditReport): Promise<void> {
  ensureDirectoryExists();
  const reports = await getReports();
  const updated = [report, ...reports].slice(0, 50);
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
}

export async function getSettings(): Promise<AppSettings> {
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

export async function saveSettings(
  settings: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...settings };

  ensureDirectoryExists();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export async function getCronStateFromStore(): Promise<Partial<SelfCronState>> {
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
}
