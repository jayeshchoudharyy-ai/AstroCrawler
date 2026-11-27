'use client';

import React from 'react';
import { TargetPage, AuditReport } from '@/lib/types';
import { ArrowUp, ArrowDown, Pause, AlertTriangle, Clock, Link2, CheckCircle2 } from 'lucide-react';

interface OverviewCardsProps {
  targets: TargetPage[];
  latestReport: AuditReport | null;
  nextRunIST?: string;
  automationsPerDay?: number;
  automationEnabled?: boolean;
}

export default function OverviewCards({
  targets,
  latestReport,
  nextRunIST = 'Today at 9:00 PM IST',
  automationsPerDay = 2,
  automationEnabled = true,
}: OverviewCardsProps) {
  const activeTargets = targets.filter((t) => t.isActive);
  const totalMonitored = activeTargets.length;

  let upCount = 0;
  let downCount = 0;
  let totalButtons = 0;
  let matchingButtons = 0;

  const isFullRun = latestReport && latestReport.totalPages >= totalMonitored;

  if (isFullRun) {
    upCount = latestReport.passedPages;
    downCount = latestReport.failedPages;
    totalButtons = latestReport.results.reduce((acc, r) => acc + r.totalButtonsFound, 0);
    matchingButtons = latestReport.results.reduce((acc, r) => acc + r.matchingButtonsCount, 0);
  } else {
    upCount = targets.filter((t) => t.lastSummary === 'PASS').length;
    downCount = targets.filter((t) => t.lastSummary && t.lastSummary !== 'PASS').length;
    const checkedTargets = targets.filter((t) => t.lastCheckedAt);
    totalButtons = checkedTargets.reduce((acc, t) => acc + (t.lastButtonsCount || 0), 0);
    matchingButtons = checkedTargets.reduce((acc, t) => acc + (t.lastMatchingCount || 0), 0);
    if (totalButtons === 0 && latestReport) {
      totalButtons = latestReport.results.reduce((acc, r) => acc + r.totalButtonsFound, 0);
      matchingButtons = latestReport.results.reduce((acc, r) => acc + r.matchingButtonsCount, 0);
    }
  }

  const razorpayRate = totalButtons > 0 ? Math.round((matchingButtons / totalButtons) * 100) : 100;
  const pausedCount = targets.filter((t) => !t.isActive).length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      
      {/* 1. UP SERVICES (Green Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-lg dark:border-emerald-500/30 dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-slate-900/40 dark:bg-[#0f1923] dark:hover:border-emerald-500/50">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              UP SERVICES
            </span>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {upCount}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30">
            <ArrowUp className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400/80">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{totalMonitored} active monitored pages</span>
        </div>
      </div>

      {/* 2. DOWN SERVICES (Red Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-rose-50/50 to-white p-5 shadow-sm transition-all hover:border-rose-300 hover:shadow-lg dark:border-rose-500/30 dark:from-rose-950/40 dark:via-rose-950/20 dark:to-slate-900/40 dark:bg-[#1a1118] dark:hover:border-rose-500/50">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              DOWN SERVICES
            </span>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {downCount}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30">
            <ArrowDown className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs font-medium text-rose-700 dark:text-rose-400/80">
          <span>{downCount === 0 ? '0 issues detected across audit' : `${downCount} page(s) require review`}</span>
        </div>
      </div>

      {/* 3. PAUSED / RAZORPAY COMPLIANCE (Blue Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-blue-50/50 to-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-lg dark:border-blue-500/30 dark:from-blue-950/40 dark:via-blue-950/20 dark:to-slate-900/40 dark:bg-[#0e1726] dark:hover:border-blue-500/50">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              RAZORPAY COMPLIANCE
            </span>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {razorpayRate}%
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30">
            <Link2 className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs font-medium text-blue-700 dark:text-blue-400/80">
          <span>{matchingButtons}/{totalButtons} buttons verified</span>
        </div>
      </div>

      {/* 4. WARNING / SELF-HOSTED CRON (Amber Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-50/50 to-white p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-lg dark:border-amber-500/30 dark:from-amber-950/40 dark:via-amber-950/20 dark:to-slate-900/40 dark:bg-[#1c1810] dark:hover:border-amber-500/50">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              SELF-HOSTED CRON
            </span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {automationEnabled ? `${automationsPerDay}x / Day` : 'Paused'}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30">
            <Clock className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs font-medium text-amber-800 dark:text-amber-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
          <span className="truncate">{nextRunIST}</span>
        </div>
      </div>

    </div>
  );
}
