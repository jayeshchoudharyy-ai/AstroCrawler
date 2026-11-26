import fs from 'fs';
import path from 'path';
import { TargetPage, AuditReport, AppSettings } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const TARGETS_FILE = path.join(DATA_DIR, 'targets.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULT_SETTINGS: AppSettings = {
  recipientEmail: 'jayeshchoudharyy@gmail.com',
  defaultRazorpayLink: 'https://pages.razorpay.com/',
  scheduleDescription: 'Twice daily at 9:00 AM & 9:00 PM IST (03:30 & 15:30 UTC)',
};

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

/**
 * Reads any monitored URLs configured in environment variables (MONITORED_URLS or TARGET_URLS).
 * Supports comma, newline, or semicolon separated URLs.
 * Example in .env.local:
 *   MONITORED_URLS="https://grow.askpuran.com/, https://example.com"
 */
export function getEnvTargets(): TargetPage[] {
  const envRaw = process.env.MONITORED_URLS || process.env.TARGET_URLS || process.env.MONITORED_PAGES;
  if (!envRaw) return [];

  const defaultRzp = process.env.DEFAULT_RAZORPAY_LINK || 'https://pages.razorpay.com/';
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

export function getTargets(): TargetPage[] {
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

  // Automatically merge envTargets into storedTargets if not already present
  let hasMerged = false;
  for (const envT of envTargets) {
    const existing = storedTargets.find((t) => t.url.toLowerCase() === envT.url.toLowerCase());
    if (!existing) {
      storedTargets.push(envT);
      hasMerged = true;
    } else {
      existing.isEnvConfigured = true;
      if (existing.name === existing.url || existing.name === 'grow.askpuran.com') {
        existing.name = envT.name;
        hasMerged = true;
      }
    }
  }

  if (storedTargets.length === 0) {
    storedTargets = DEFAULT_TARGETS;
    saveTargets(storedTargets);
    return storedTargets;
  }

  if (hasMerged) {
    saveTargets(storedTargets);
  }

  return storedTargets;
}

export function saveTargets(targets: TargetPage[]) {
  ensureDirectoryExists();
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(targets, null, 2), 'utf-8');
}

export function addTarget(target: Omit<TargetPage, 'id' | 'createdAt'>): TargetPage {
  const targets = getTargets();
  const newTarget: TargetPage = {
    ...target,
    id: `target-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  targets.push(newTarget);
  saveTargets(targets);
  return newTarget;
}

export function updateTarget(id: string, updates: Partial<TargetPage>): TargetPage | null {
  const targets = getTargets();
  const index = targets.findIndex((t) => t.id === id);
  if (index === -1) return null;
  targets[index] = { ...targets[index], ...updates };
  saveTargets(targets);
  return targets[index];
}

export function deleteTarget(id: string): boolean {
  const targets = getTargets();
  const filtered = targets.filter((t) => t.id !== id);
  if (filtered.length === targets.length) return false;
  saveTargets(filtered);
  return true;
}

export function getReports(): AuditReport[] {
  ensureDirectoryExists();
  if (!fs.existsSync(REPORTS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(REPORTS_FILE, 'utf-8');
    const reports: AuditReport[] = JSON.parse(data);
    return reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.error('Error reading reports:', err);
    return [];
  }
}

export function saveReport(report: AuditReport) {
  ensureDirectoryExists();
  const reports = getReports();
  // Keep the latest 50 reports to prevent unbounded file growth
  const updated = [report, ...reports].slice(0, 50);
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
}

export function getSettings(): AppSettings {
  ensureDirectoryExists();
  if (!fs.existsSync(SETTINGS_FILE)) {
    // Write default settings directly without calling saveSettings to prevent recursion
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
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

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  ensureDirectoryExists();
  let current: AppSettings = DEFAULT_SETTINGS;
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      current = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch {
      current = DEFAULT_SETTINGS;
    }
  }
  const updated: AppSettings = { ...current, ...settings };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
