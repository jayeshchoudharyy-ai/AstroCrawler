'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Shield,
  Mail,
  Terminal,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  PlayCircle,
  Loader2,
  Server,
  Zap,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { SelfCronState } from '@/lib/types';

interface CronSetupGuideProps {
  recipientEmail: string;
  onAuditCompleted?: () => void;
}

export default function CronSetupGuide({ recipientEmail, onAuditCompleted }: CronSetupGuideProps) {
  const [cronState, setCronState] = useState<SelfCronState | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [triggerNotice, setTriggerNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchCronStatus = async () => {
    try {
      setIsLoadingStatus(true);
      const res = await fetch('/api/cron');
      const data = await res.json();
      if (data.success && data.status) {
        setCronState(data.status);
      }
    } catch (err) {
      console.error('Error fetching cron status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchCronStatus();
    // Poll status periodically every 30 seconds
    const interval = setInterval(fetchCronStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualTrigger = async () => {
    setIsTriggering(true);
    setTriggerNotice(null);
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to trigger cron audit');
      }

      setTriggerNotice({
        type: 'success',
        message: data.message || 'Self-cron audit completed successfully!',
      });

      await fetchCronStatus();
      if (onAuditCompleted) {
        onAuditCompleted();
      }
    } catch (err: any) {
      setTriggerNotice({
        type: 'error',
        message: err.message || 'Failed to execute self-cron audit',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  const nextRunText = cronState?.nextRunIST || 'Today at 9:00 PM IST';
  const lastRunDate = cronState?.lastRunAt
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(cronState.lastRunAt)) + ' IST'
    : 'Pending first scheduled trigger';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-colors space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 dark:border-slate-800 gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Self-Hosted Cron Scheduler
              </h2>
              <span className="inline-flex items-center space-x-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Active (Internal Node-Cron)</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Twice daily at <strong>9:00 AM & 9:00 PM IST</strong> • 100% independent from Vercel • Automated Resend emails to {recipientEmail}
            </p>
          </div>
        </div>

        {/* Live Manual Trigger Action Button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchCronStatus}
            disabled={isLoadingStatus}
            title="Refresh Cron Status"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
          >
            <RotateCw className={`h-4 w-4 ${isLoadingStatus ? 'animate-spin text-indigo-500' : ''}`} />
          </button>

          <button
            onClick={handleManualTrigger}
            disabled={isTriggering || cronState?.isRunning}
            className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60 transition"
          >
            {isTriggering || cronState?.isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Running Self-Cron Audit...</span>
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                <span>Run Self-Cron Audit Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Trigger Notification Banner */}
      {triggerNotice && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium border ${
            triggerNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {triggerNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            )}
            <span>{triggerNotice.message}</span>
          </div>
          <button
            onClick={() => setTriggerNotice(null)}
            className="text-xs underline hover:no-underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Live Status Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Next Scheduled Run */}
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Next Scheduled Run
            </span>
            <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-amber-900 dark:text-amber-200">
            {nextRunText}
          </div>
          <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-400/70">
            Timezone: Asia/Kolkata (IST)
          </p>
        </div>

        {/* Schedule */}
        <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              Schedule Frequency
            </span>
            <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-indigo-900 dark:text-indigo-200">
            9:00 AM & 9:00 PM
          </div>
          <p className="mt-1 text-[11px] text-indigo-700/80 dark:text-indigo-400/70">
            Cron pattern: <code className="font-mono">0 9,21 * * *</code>
          </p>
        </div>

        {/* Last Run Summary */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Last Execution
            </span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-center space-x-2">
            <span className={`text-sm font-bold ${
              cronState?.lastSummary === 'PASS'
                ? 'text-emerald-600 dark:text-emerald-400'
                : cronState?.lastSummary === 'FAIL'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}>
              {cronState?.lastSummary ? `Status: ${cronState.lastSummary}` : 'No runs yet'}
            </span>
            {cronState?.lastDurationMs && (
              <span className="text-xs text-slate-500">
                ({(cronState.lastDurationMs / 1000).toFixed(1)}s)
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate" title={lastRunDate}>
            {lastRunDate}
          </p>
        </div>

        {/* Email Recipient */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Recipient Email
            </span>
            <Mail className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white truncate" title={recipientEmail}>
            {recipientEmail}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Resend Email Report
          </p>
        </div>

      </div>

      {/* Architecture & Run Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Method 1: In-App Self-Cron */}
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
              1
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              <span>In-App Auto-Scheduler</span>
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Initialized automatically via Next.js <code className="rounded bg-slate-200 dark:bg-slate-800 px-1 py-0.5 text-slate-900 dark:text-slate-200 font-mono text-[11px]">src/instrumentation.ts</code> when the server starts.
          </p>
          <div className="rounded bg-slate-100 dark:bg-slate-800 p-2.5 text-[11px] font-mono text-slate-700 dark:text-slate-300 space-y-1">
            <div>• Runs whenever server is up</div>
            <div>• Zero external dependencies</div>
            <div>• Singleton guard prevents duplicates</div>
          </div>
        </div>

        {/* Method 2: Dedicated Background Daemon */}
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
              2
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <Server className="h-3.5 w-3.5 text-indigo-500" />
              <span>Standalone Daemon CLI</span>
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Run as an independent background service or with PM2 / systemd / Windows Task Scheduler:
          </p>
          <pre className="rounded bg-slate-900 dark:bg-black p-2.5 text-xs text-slate-200 font-mono overflow-x-auto">
npm run cron
          </pre>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Optional flag: <code className="font-mono text-[11px]">npm run cron -- --now</code> triggers an instant audit run.
          </div>
        </div>

        {/* Method 3: 10s Double-Check Retry Engine */}
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              3
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <Shield className="h-3.5 w-3.5 text-blue-500" />
              <span>Double-Check Retries</span>
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Every audited page is validated with safe retries to prevent false alarms:
          </p>
          <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 list-disc pl-4">
            <li><strong>Attempt 1 (0s):</strong> Checks HTTP status & buttons</li>
            <li><strong>Retry 1 (10s):</strong> Re-crawls on initial failure</li>
            <li><strong>Retry 2 (20s):</strong> Double-checks again</li>
            <li><strong>Alert (30s):</strong> Triggered only if failure persists</li>
          </ul>
        </div>

      </div>

      {/* API Webhook Endpoint Info */}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30 space-y-2">
        <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span>Local Cron Webhook Endpoints</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div>
            <div className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-300">
              Check Scheduler Status:
            </div>
            <code className="block rounded bg-indigo-950/10 dark:bg-indigo-950/60 px-2.5 py-1.5 text-xs font-mono text-indigo-950 dark:text-indigo-200 border dark:border-indigo-900 mt-1">
              GET /api/cron
            </code>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-300">
              Trigger Manual Execution:
            </div>
            <code className="block rounded bg-indigo-950/10 dark:bg-indigo-950/60 px-2.5 py-1.5 text-xs font-mono text-indigo-950 dark:text-indigo-200 border dark:border-indigo-900 mt-1">
              POST /api/cron  or  GET /api/cron?run=true
            </code>
          </div>
        </div>
      </div>

    </div>
  );
}
