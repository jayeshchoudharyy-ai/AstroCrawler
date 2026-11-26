#!/usr/bin/env node
/**
 * Standalone Self-Hosted Cron Daemon for WebCrawler Auditor
 * Runs twice daily at 9:00 AM IST and 9:00 PM IST (Asia/Kolkata timezone).
 * 
 * Usage:
 *   node scripts/cron-daemon.js          # Starts long-running daemon scheduler
 *   node scripts/cron-daemon.js --now    # Executes an immediate audit run and exits
 *   npm run cron                         # Starts daemon via npm script
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const cron = require('node-cron');

// Load environment variables from .env.local and .env
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
      console.log(`[Self-Cron Daemon] Loaded environment from ${file}`);
    }
  }
}

loadEnv();

const SCHEDULE = '0 9,21 * * *';
const TIMEZONE = 'Asia/Kolkata';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

function getISTTimeString() {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date()) + ' IST';
}

function calculateNextRun() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const currentTotal = hour * 60 + minute;

  if (currentTotal < 9 * 60) {
    return 'Today at 09:00 AM IST';
  } else if (currentTotal < 21 * 60) {
    return 'Today at 09:00 PM IST';
  } else {
    return 'Tomorrow at 09:00 AM IST';
  }
}

async function triggerAudit() {
  console.log(`\n======================================================`);
  console.log(`[Self-Cron Daemon] Triggering scheduled audit at ${getISTTimeString()}...`);
  console.log(`======================================================`);

  return new Promise((resolve) => {
    const postData = JSON.stringify({ trigger: 'cron-daemon' });
    const url = new URL('/api/cron', BASE_URL);

    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 180000, // 3 minutes timeout for Playwright multi-page crawls
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            console.log(`[Self-Cron Daemon] Response status: HTTP ${res.statusCode}`);
            console.log(`[Self-Cron Daemon] Result:`, data.message || data);
          } catch (e) {
            console.log(`[Self-Cron Daemon] Response body:`, body);
          }
          resolve(true);
        });
      }
    );

    req.on('error', (err) => {
      console.error(`[Self-Cron Daemon] Error connecting to ${BASE_URL}/api/cron:`, err.message);
      console.log(`[Self-Cron Daemon] Ensure the Next.js server is running (npm run dev or npm start).`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`[Self-Cron Daemon] Request timed out.`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

const isRunNow = process.argv.includes('--now') || process.argv.includes('--run-now');

if (isRunNow) {
  console.log(`[Self-Cron Daemon] Executing immediate audit (--now)...`);
  triggerAudit().then(() => {
    console.log(`[Self-Cron Daemon] One-time execution completed.`);
    process.exit(0);
  });
} else {
  console.log(`======================================================`);
  console.log(`  AstroCrawler — Self-Hosted Cron Daemon`);
  console.log(`  Schedule: 9:00 AM & 9:00 PM IST (0 9,21 * * *)`);
  console.log(`  Timezone: ${TIMEZONE}`);
  console.log(`  Current Time: ${getISTTimeString()}`);
  console.log(`  Next Scheduled Run: ${calculateNextRun()}`);
  console.log(`  Target Webhook: ${BASE_URL}/api/cron`);
  console.log(`======================================================\n`);

  cron.schedule(
    SCHEDULE,
    async () => {
      await triggerAudit();
      console.log(`[Self-Cron Daemon] Next scheduled run: ${calculateNextRun()}\n`);
    },
    {
      timezone: TIMEZONE,
      scheduled: true,
    }
  );

  console.log(`[Self-Cron Daemon] Scheduler running in background. Press Ctrl+C to terminate.\n`);
}
