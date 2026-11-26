import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { auditPage } from './crawler';
import { getTargets, updateTarget, saveReport, getSettings } from './store';
import { sendAuditReportEmail, DEFAULT_RECIPIENT } from './email';
import { PageAuditResult, AuditReport, SelfCronState } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CRON_STATE_FILE = path.join(DATA_DIR, 'cron-state.json');

let isExecuting = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Returns date and time breakdown in IST (Asia/Kolkata, UTC+05:30)
 */
export function getISTDateParts(d: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

/**
 * Calculates the next upcoming run time for 9:00 AM or 9:00 PM IST
 */
export function getNextCronRun(now: Date = new Date()): { label: string; iso: string } {
  const ist = getISTDateParts(now);
  const currentTotalSeconds = ist.hour * 3600 + ist.minute * 60 + ist.second;
  const target9AM = 9 * 3600;
  const target9PM = 21 * 3600;

  let nextYear = ist.year;
  let nextMonth = ist.month;
  let nextDay = ist.day;
  let nextHour = 9;
  let label = '';

  if (currentTotalSeconds < target9AM) {
    nextHour = 9;
    label = 'Today at 9:00 AM IST';
  } else if (currentTotalSeconds < target9PM) {
    nextHour = 21;
    label = 'Today at 9:00 PM IST';
  } else {
    // Tomorrow at 9 AM IST
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const tomParts = getISTDateParts(tomorrow);
    nextYear = tomParts.year;
    nextMonth = tomParts.month;
    nextDay = tomParts.day;
    nextHour = 9;
    label = 'Tomorrow at 9:00 AM IST';
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const isoStr = `${nextYear}-${pad(nextMonth)}-${pad(nextDay)}T${pad(nextHour)}:00:00+05:30`;
  return { label, iso: new Date(isoStr).toISOString() };
}

/**
 * Retrieves the current self-cron state
 */
export function getSelfCronState(): SelfCronState {
  ensureDataDir();
  const nextRun = getNextCronRun();
  let savedState: Partial<SelfCronState> = {};

  try {
    if (fs.existsSync(CRON_STATE_FILE)) {
      const data = fs.readFileSync(CRON_STATE_FILE, 'utf-8');
      savedState = JSON.parse(data);
    }
  } catch (err) {
    console.error('[Self-Cron] Error reading cron-state.json:', err);
  }

  return {
    isActive: true,
    schedule: '0 9,21 * * *',
    timezone: 'Asia/Kolkata',
    scheduleDescription: 'Twice daily at 9:00 AM & 9:00 PM IST (Asia/Kolkata)',
    isRunning: isExecuting,
    ...savedState,
    nextRunIST: nextRun.label,
    nextRunISO: nextRun.iso,
  };
}

/**
 * Persists partial updates to the self-cron state
 */
export function saveSelfCronState(updates: Partial<SelfCronState>): SelfCronState {
  ensureDataDir();
  const currentState = getSelfCronState();
  const newState: SelfCronState = {
    ...currentState,
    ...updates,
  };

  try {
    fs.writeFileSync(CRON_STATE_FILE, JSON.stringify(newState, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Self-Cron] Error writing cron-state.json:', err);
  }

  return newState;
}

/**
 * Executes a full audit across all active monitored pages,
 * records results, sends an email report to the developer, and updates cron state.
 */
export async function executeSelfCron(trigger: 'cron' | 'manual' = 'cron'): Promise<{
  success: boolean;
  message: string;
  report?: AuditReport;
  error?: string;
}> {
  if (isExecuting) {
    return {
      success: false,
      message: 'Audit is already running. Please wait for the current run to finish.',
    };
  }

  isExecuting = true;
  const startTime = Date.now();
  console.log(`[Self-Cron] Starting audit trigger="${trigger}" at ${new Date().toISOString()}`);

  try {
    saveSelfCronState({ isRunning: true });

    const settings = getSettings();
    const targets = getTargets().filter((t) => t.isActive);
    const recipient = settings.recipientEmail || DEFAULT_RECIPIENT;
    const defaultRzp = settings.defaultRazorpayLink || 'https://pages.razorpay.com/';

    if (targets.length === 0) {
      console.warn('[Self-Cron] No active monitored targets found.');
      saveSelfCronState({
        isRunning: false,
        lastRunAt: new Date().toISOString(),
        lastTrigger: trigger,
        lastDurationMs: Date.now() - startTime,
        lastSummary: 'NO_PAGES',
        lastTotalPages: 0,
      });
      return {
        success: true,
        message: 'No active monitored pages found to audit.',
      };
    }

    const results: PageAuditResult[] = [];

    for (const target of targets) {
      try {
        const expectedRzp = target.expectedRazorpayLink || defaultRzp;
        const res = await auditPage(target.url, expectedRzp, target.name);
        results.push(res);

        updateTarget(target.id, {
          lastCheckedAt: res.checkedAt,
          lastStatus: res.statusCode,
          lastSummary: res.summary,
          lastButtonsCount: res.totalButtonsFound,
          lastMatchingCount: res.matchingButtonsCount,
          lastLoadTimeMs: res.loadTimeMs,
        });
      } catch (err: any) {
        console.error(`[Self-Cron] Error auditing ${target.url}:`, err);
      }
    }

    const totalPages = results.length;
    const passedPages = results.filter((r) => r.summary === 'PASS').length;
    const failedPages = results.filter((r) => r.summary !== 'PASS').length;
    const hasErrors = failedPages > 0;

    const report: AuditReport = {
      id: `selfcron-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      trigger: trigger === 'manual' ? 'manual' : 'cron',
      totalPages,
      passedPages,
      failedPages,
      hasErrors,
      recipientEmail: recipient,
      emailSent: false,
      results,
    };

    // Send email report via Resend
    const emailRes = await sendAuditReportEmail(report, recipient);
    report.emailSent = emailRes.success;
    report.emailError = emailRes.error;

    // Save report in history
    saveReport(report);

    const durationMs = Date.now() - startTime;
    const summaryStatus = hasErrors ? 'FAIL' : 'PASS';

    saveSelfCronState({
      isRunning: false,
      lastRunAt: report.timestamp,
      lastTrigger: trigger,
      lastDurationMs: durationMs,
      lastSummary: summaryStatus,
      lastTotalPages: totalPages,
      lastPassedPages: passedPages,
      lastFailedPages: failedPages,
      lastEmailSent: report.emailSent,
      lastEmailRecipient: recipient,
      lastEmailError: report.emailError,
    });

    console.log(`[Self-Cron] Audit completed in ${durationMs}ms. Passed: ${passedPages}/${totalPages}. Email sent: ${report.emailSent}`);

    return {
      success: true,
      message: `Self-Cron audit completed successfully. ${passedPages}/${totalPages} healthy. Email ${report.emailSent ? 'sent' : 'failed'}.`,
      report,
    };
  } catch (err: any) {
    console.error('[Self-Cron] Unhandled exception in executeSelfCron:', err);
    saveSelfCronState({
      isRunning: false,
      lastRunAt: new Date().toISOString(),
      lastTrigger: trigger,
      lastSummary: 'FAIL',
      lastEmailError: err.message,
    });
    return {
      success: false,
      message: err.message || 'Audit execution failed',
      error: err.message,
    };
  } finally {
    isExecuting = false;
  }
}

/**
 * Initializes the internal node-cron scheduler (singleton pattern on globalThis).
 * Runs twice daily at 9:00 AM IST and 9:00 PM IST (Asia/Kolkata).
 */
export function initSelfCron() {
  const globalObj = globalThis as any;
  if (globalObj.__selfCronTask) {
    console.log('[Self-Cron] Scheduler is already initialized on globalThis.');
    return { started: false, message: 'Scheduler already active' };
  }

  try {
    const task = cron.schedule(
      '0 9,21 * * *',
      async () => {
        console.log('[Self-Cron] Triggered twice-daily audit (09:00 / 21:00 IST)');
        try {
          await executeSelfCron('cron');
        } catch (err) {
          console.error('[Self-Cron] Error in scheduled cron job:', err);
        }
      },
      {
        timezone: 'Asia/Kolkata',
      }
    );

    globalObj.__selfCronTask = task;
    console.log('[Self-Cron] Registered scheduled task for 9:00 AM & 9:00 PM IST (Asia/Kolkata)');

    // Ensure initial cron-state.json exists
    saveSelfCronState({
      isActive: true,
      schedule: '0 9,21 * * *',
      timezone: 'Asia/Kolkata',
      scheduleDescription: 'Twice daily at 9:00 AM & 9:00 PM IST (Asia/Kolkata)',
    });

    return { started: true, message: 'Self-Cron initialized successfully' };
  } catch (err: any) {
    console.error('[Self-Cron] Failed to initialize node-cron schedule:', err);
    return { started: false, message: err.message };
  }
}
