import cron from 'node-cron';
import { auditPage } from './crawler';
import {
  getTargets,
  updateTarget,
  saveReport,
  getSettings,
  getCronStateFromStore,
  saveCronStateToStore,
  formatScheduleDescription,
  formatTime12h,
} from './store';
import { sendAuditReportEmail, DEFAULT_RECIPIENT } from './email';
import { PageAuditResult, AuditReport, SelfCronState } from './types';

let isExecuting = false;

/**
 * Returns date and time breakdown in the configured timezone (default Asia/Kolkata)
 */
export function getISTDateParts(d: Date = new Date(), timezone: string = 'Asia/Kolkata') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
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
 * Calculates the next upcoming run time from user-configured automationTimes
 */
export async function getNextCronRun(now: Date = new Date()): Promise<{ label: string; iso: string }> {
  const settings = await getSettings();
  const enabled = settings.automationEnabled !== false;
  const timezone = settings.timezone || 'Asia/Kolkata';
  const tzLabel = timezone === 'Asia/Kolkata' ? 'IST' : timezone;
  const rawTimes =
    settings.automationTimes && settings.automationTimes.length > 0
      ? settings.automationTimes
      : ['09:00', '21:00'];

  if (!enabled || rawTimes.length === 0) {
    return { label: 'Automation paused', iso: '' };
  }

  const parsedSlots = rawTimes
    .map((t) => {
      const [hStr, mStr] = t.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      return {
        raw: t,
        hour: h,
        minute: m,
        totalSeconds: h * 3600 + m * 60,
      };
    })
    .filter((s) => !isNaN(s.hour) && !isNaN(s.minute))
    .sort((a, b) => a.totalSeconds - b.totalSeconds);

  if (parsedSlots.length === 0) {
    return { label: 'No valid times set', iso: '' };
  }

  const nowParts = getISTDateParts(now, timezone);
  const currentTotalSeconds = nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;

  let nextYear = nowParts.year;
  let nextMonth = nowParts.month;
  let nextDay = nowParts.day;
  let chosen = parsedSlots.find((s) => s.totalSeconds > currentTotalSeconds);
  let dayPrefix = 'Today';

  if (!chosen) {
    chosen = parsedSlots[0];
    dayPrefix = 'Tomorrow';
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const tomParts = getISTDateParts(tomorrow, timezone);
    nextYear = tomParts.year;
    nextMonth = tomParts.month;
    nextDay = tomParts.day;
  }

  const label = `${dayPrefix} at ${formatTime12h(chosen.raw)} ${tzLabel}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = timezone === 'Asia/Kolkata' ? '+05:30' : 'Z';
  const isoStr = `${nextYear}-${pad(nextMonth)}-${pad(nextDay)}T${pad(chosen.hour)}:${pad(chosen.minute)}:00${offset}`;
  const parsedDate = new Date(isoStr);
  return {
    label,
    iso: isNaN(parsedDate.getTime()) ? now.toISOString() : parsedDate.toISOString(),
  };
}

/**
 * Retrieves the current self-cron state (from Firestore when configured, or local fallback)
 */
export async function getSelfCronState(): Promise<SelfCronState> {
  const settings = await getSettings();
  const enabled = settings.automationEnabled !== false;
  const times =
    settings.automationTimes && settings.automationTimes.length > 0
      ? settings.automationTimes
      : ['09:00', '21:00'];
  const timezone = settings.timezone || 'Asia/Kolkata';
  const schedulePatterns = times
    .map((t) => {
      const [h, m] = t.split(':');
      return `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
    })
    .join(' | ');
  const nextRun = await getNextCronRun();
  const savedState = await getCronStateFromStore();

  return {
    isRunning: isExecuting,
    ...savedState,
    isActive: enabled,
    schedule: schedulePatterns,
    timezone,
    automationTimes: times,
    automationsPerDay: settings.automationsPerDay ?? times.length,
    scheduleDescription: formatScheduleDescription(times, enabled, timezone),
    nextRunIST: nextRun.label,
    nextRunISO: nextRun.iso,
  };
}

/**
 * Persists partial updates to the self-cron state
 */
export async function saveSelfCronState(updates: Partial<SelfCronState>): Promise<SelfCronState> {
  const currentState = await getSelfCronState();
  const newState: SelfCronState = {
    ...currentState,
    ...updates,
  };
  await saveCronStateToStore(newState);
  return newState;
}

/**
 * Executes a full audit across all active monitored pages,
 * records results in Firestore/store, sends an email report, and updates cron state.
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
    await saveSelfCronState({ isRunning: true });

    const settings = await getSettings();
    const allTargets = await getTargets();
    const targets = allTargets.filter((t) => t.isActive);
    const recipient = settings.recipientEmail || DEFAULT_RECIPIENT;
    const defaultRzp = settings.defaultRazorpayLink || 'https://pages.razorpay.com/';

    if (targets.length === 0) {
      console.warn('[Self-Cron] No active monitored targets found.');
      await saveSelfCronState({
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

        await updateTarget(target.id, {
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

    const emailRes = await sendAuditReportEmail(report, recipient);
    report.emailSent = emailRes.success;
    report.emailError = emailRes.error;

    await saveReport(report);

    const durationMs = Date.now() - startTime;
    const summaryStatus = hasErrors ? 'FAIL' : 'PASS';

    await saveSelfCronState({
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

    console.log(
      `[Self-Cron] Audit completed in ${durationMs}ms. Passed: ${passedPages}/${totalPages}. Email sent: ${report.emailSent}`
    );

    return {
      success: true,
      message: `Self-Cron audit completed successfully. ${passedPages}/${totalPages} healthy. Email ${report.emailSent ? 'sent' : 'failed'}.`,
      report,
    };
  } catch (err: any) {
    console.error('[Self-Cron] Unhandled exception in executeSelfCron:', err);
    await saveSelfCronState({
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
 * Stops existing cron tasks and re-registers node-cron jobs according to current settings.
 */
export async function rescheduleSelfCron() {
  const globalObj = globalThis as any;

  if (globalObj.__selfCronTask && typeof globalObj.__selfCronTask.stop === 'function') {
    try {
      globalObj.__selfCronTask.stop();
    } catch {}
    globalObj.__selfCronTask = null;
  }

  if (Array.isArray(globalObj.__selfCronTasks)) {
    for (const t of globalObj.__selfCronTasks) {
      try {
        if (t && typeof t.stop === 'function') t.stop();
      } catch {}
    }
  }
  globalObj.__selfCronTasks = [];

  const settings = await getSettings();
  const enabled = settings.automationEnabled !== false;
  const timezone = settings.timezone || 'Asia/Kolkata';
  const times = Array.from(
    new Set(
      (settings.automationTimes && settings.automationTimes.length > 0
        ? settings.automationTimes
        : ['09:00', '21:00']
      ).filter((t) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t))
    )
  ).sort();

  const description = formatScheduleDescription(times, enabled, timezone);

  if (!enabled || times.length === 0) {
    console.log('[Self-Cron] Automation is paused or has no scheduled times.');
    await saveSelfCronState({
      isActive: false,
      schedule: '',
      timezone,
      automationTimes: times,
      automationsPerDay: 0,
      scheduleDescription: description,
    });
    return { started: false, message: 'Automation paused' };
  }

  try {
    const patterns: string[] = [];
    for (const timeStr of times) {
      const [hStr, mStr] = timeStr.split(':');
      const hour = parseInt(hStr, 10);
      const minute = parseInt(mStr, 10);
      const pattern = `${minute} ${hour} * * *`;
      patterns.push(pattern);

      const task = cron.schedule(
        pattern,
        async () => {
          console.log(`[Self-Cron] Triggered scheduled audit for ${timeStr} (${timezone})`);
          try {
            await executeSelfCron('cron');
          } catch (err) {
            console.error('[Self-Cron] Error in scheduled cron job:', err);
          }
        },
        {
          timezone,
        }
      );

      globalObj.__selfCronTasks.push(task);
    }

    globalObj.__selfCronInitialized = true;
    console.log(`[Self-Cron] Registered ${times.length} scheduled task(s): ${description}`);

    await saveSelfCronState({
      isActive: true,
      schedule: patterns.join(' | '),
      timezone,
      automationTimes: times,
      automationsPerDay: times.length,
      scheduleDescription: description,
    });

    return { started: true, message: `Self-Cron scheduled: ${description}` };
  } catch (err: any) {
    console.error('[Self-Cron] Failed to initialize node-cron schedule:', err);
    return { started: false, message: err.message };
  }
}

/**
 * Initializes the internal node-cron scheduler (singleton pattern on globalThis).
 */
export async function initSelfCron() {
  const globalObj = globalThis as any;
  if (globalObj.__selfCronInitialized) {
    console.log('[Self-Cron] Scheduler is already initialized on globalThis.');
    return { started: false, message: 'Scheduler already active' };
  }

  return rescheduleSelfCron();
}
