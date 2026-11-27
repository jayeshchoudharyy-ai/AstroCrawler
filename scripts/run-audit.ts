import fs from 'fs';
import path from 'path';

/**
 * Loads .env.local and .env if present (useful for local CLI runs;
 * in GitHub Actions, secrets/variables are already in process.env).
 */
function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadLocalEnv();

import { executeSelfCron } from '@/lib/selfCron';
import { auditPage } from '@/lib/crawler';
import { getSettings, saveReport } from '@/lib/store';
import { sendAuditReportEmail, DEFAULT_RECIPIENT } from '@/lib/email';
import { AuditReport } from '@/lib/types';

function writeGitHubSummary(report: AuditReport) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const rows = report.results
    .map((r) => {
      const statusIcon = r.summary === 'PASS' ? '✅ PASS' : '❌ FAIL';
      const httpText = r.statusCode ? `${r.statusCode}` : 'N/A';
      const btnText = r.noButtonsAvailable
        ? 'No button'
        : r.isOtherSamePageRedirection
        ? `Same page (${r.totalButtonsFound})`
        : `${r.matchingButtonsCount}/${r.totalButtonsFound}`;
      const timerText = r.countdownTimer?.isPresent
        ? r.countdownTimer.status
        : 'N/A';
      const errText = r.errors.length > 0 ? r.errors.join('; ') : '—';
      return `| ${statusIcon} | ${r.pageName || r.url} | ${httpText} | ${btnText} | ${timerText} | ${errText} |`;
    })
    .join('\n');

  const md = `## AstroCrawler Automated Audit Report

- **Timestamp:** ${report.timestamp}
- **Trigger:** ${report.trigger}
- **Summary:** ${report.passedPages}/${report.totalPages} pages healthy (${report.failedPages} flagged)
- **Email Sent:** ${report.emailSent ? `✅ Yes (${report.recipientEmail})` : `⚠️ No (${report.emailError || 'RESEND_API_KEY not set'})`}

| Status | Page | HTTP | Buttons | Timer | Errors |
| --- | --- | --- | --- | --- | --- |
${rows}
`;

  try {
    fs.appendFileSync(summaryPath, md, 'utf-8');
  } catch (err) {
    console.warn('[CLI Audit] Could not write GITHUB_STEP_SUMMARY:', err);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const failOnError =
    args.includes('--fail-on-error') || process.env.FAIL_ON_ERROR === 'true';
  const urlFlagIdx = args.indexOf('--url');
  const singleUrl =
    (urlFlagIdx !== -1 ? args[urlFlagIdx + 1] : undefined) ||
    process.env.SINGLE_URL;

  console.log('======================================================');
  console.log('  AstroCrawler — Automated Audit Runner');
  console.log('======================================================');

  let report: AuditReport | undefined;

  if (singleUrl && singleUrl.trim()) {
    const cleanUrl = singleUrl.trim();
    console.log(`[CLI Audit] Auditing single URL: ${cleanUrl}`);
    const settings = await getSettings();
    const recipient = settings.recipientEmail || DEFAULT_RECIPIENT;
    const expectedRzp = settings.defaultRazorpayLink || 'https://pages.razorpay.com/';

    const res = await auditPage(cleanUrl, expectedRzp, cleanUrl, {
      singlePageOnly: true,
    });

    report = {
      id: `gh-single-${Date.now()}`,
      timestamp: new Date().toISOString(),
      trigger: 'cron',
      totalPages: 1,
      passedPages: res.summary === 'PASS' ? 1 : 0,
      failedPages: res.summary === 'PASS' ? 0 : 1,
      hasErrors: res.summary !== 'PASS',
      recipientEmail: recipient,
      emailSent: false,
      results: [res],
    };

    const emailRes = await sendAuditReportEmail(report, recipient);
    report.emailSent = emailRes.success;
    report.emailError = emailRes.error;
    await saveReport(report);
  } else {
    const result = await executeSelfCron('cron');
    if (!result.success) {
      console.error('[CLI Audit] Execution failed:', result.message || result.error);
      process.exit(1);
    }
    report = result.report;
  }

  if (report) {
    writeGitHubSummary(report);
    console.log(
      `[CLI Audit] Summary: ${report.passedPages}/${report.totalPages} passed, ${report.failedPages} failed. Email sent: ${report.emailSent}`
    );

    if (failOnError && report.hasErrors) {
      console.error('[CLI Audit] Exiting with code 1 due to --fail-on-error and detected page issues.');
      process.exit(1);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[CLI Audit] Fatal error:', err);
  process.exit(1);
});
