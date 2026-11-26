'use client';

import React from 'react';
import { TargetPage, AuditReport } from '@/lib/types';
import { CheckCircle2, AlertTriangle, XCircle, Clock, Link2, Globe } from 'lucide-react';

interface StatsCardsProps {
  targets: TargetPage[];
  latestReport: AuditReport | null;
}

export default function StatsCards({ targets, latestReport }: StatsCardsProps) {
  const activeTargets = targets.filter((t) => t.isActive);
  const totalMonitored = activeTargets.length;

  let passingCount = 0;
  let failingCount = 0;
  let totalHealthDenominator = totalMonitored || 1;
  let healthSubtext = 'All responses 200 OK / 301';
  let totalButtons = 0;
  let matchingButtons = 0;

  const isFullRun = latestReport && latestReport.totalPages >= totalMonitored;

  if (isFullRun) {
    passingCount = latestReport.passedPages;
    failingCount = latestReport.failedPages;
    totalHealthDenominator = latestReport.totalPages;
    healthSubtext = failingCount > 0 ? `⚠️ ${failingCount} page(s) flagged` : 'All responses 200 OK / 301';
    totalButtons = latestReport.results.reduce((acc, r) => acc + r.totalButtonsFound, 0);
    matchingButtons = latestReport.results.reduce((acc, r) => acc + r.matchingButtonsCount, 0);
  } else {
    // When a single page was audited, show aggregate status across monitored pages
    passingCount = targets.filter((t) => t.lastSummary === 'PASS').length;
    failingCount = targets.filter((t) => t.lastSummary && t.lastSummary !== 'PASS').length;
    totalHealthDenominator = totalMonitored || 1;
    const checkedTargets = targets.filter((t) => t.lastCheckedAt);

    if (latestReport && latestReport.totalPages === 1) {
      const single = latestReport.results[0];
      healthSubtext = `Latest single page: ${single?.summary === 'PASS' ? '✅ 200 OK' : '⚠️ Issue'}`;
    } else {
      healthSubtext = `${checkedTargets.length} of ${totalMonitored} pages audited`;
    }

    totalButtons = checkedTargets.reduce((acc, t) => acc + (t.lastButtonsCount || 0), 0);
    matchingButtons = checkedTargets.reduce((acc, t) => acc + (t.lastMatchingCount || 0), 0);

    if (totalButtons === 0 && latestReport) {
      totalButtons = latestReport.results.reduce((acc, r) => acc + r.totalButtonsFound, 0);
      matchingButtons = latestReport.results.reduce((acc, r) => acc + r.matchingButtonsCount, 0);
    }
  }

  const razorpayMatchRate = totalButtons > 0 ? Math.round((matchingButtons / totalButtons) * 100) : 100;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      
      {/* Monitored Pages */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Monitored Pages (.env)
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Globe className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline space-x-2">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{targets.length}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">({totalMonitored} active)</span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Scheduled for twice-daily audit
        </p>
      </div>

      {/* HTTP Status Health */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            HTTP Status (200/301)
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline space-x-2">
          <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{passingCount}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">/ {totalHealthDenominator} healthy</span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {healthSubtext}
        </p>
      </div>

      {/* Razorpay Button Match Rate */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Razorpay Compliance
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <Link2 className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline space-x-2">
          <span className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">{razorpayMatchRate}%</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({matchingButtons}/{totalButtons} buttons)
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Buttons redirecting to Razorpay slug
        </p>
      </div>

      {/* Automated Cron */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Self-Hosted Cron
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline space-x-2">
          <span className="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100">9:00 AM & 9:00 PM</span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {latestReport ? (
            <span>Last run: {new Date(latestReport.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          ) : (
            '🟢 Active (Asia/Kolkata)'
          )}
        </p>
      </div>

    </div>
  );
}
