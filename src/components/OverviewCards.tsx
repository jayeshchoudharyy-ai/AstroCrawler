'use client';

import React from 'react';
import { TargetPage, AuditReport } from '@/lib/types';
import { ArrowUp, ArrowDown, Pause, AlertTriangle, Clock, Link2, CheckCircle2 } from 'lucide-react';

interface OverviewCardsProps {
  targets: TargetPage[];
  latestReport: AuditReport | null;
  nextRunIST?: string;
}

export default function OverviewCards({
  targets,
  latestReport,
  nextRunIST = 'Today at 9:00 PM IST',
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
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-emerald-950/20 to-slate-900/40 p-5 shadow-sm transition-all hover:border-emerald-500/50 hover:shadow-lg dark:bg-[#0f1923]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              UP SERVICES
            </span>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-white">
              {upCount}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <ArrowUp className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs text-emerald-400/80">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{totalMonitored} active monitored pages</span>
        </div>
      </div>

      {/* 2. DOWN SERVICES (Red Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/40 via-rose-950/20 to-slate-900/40 p-5 shadow-sm transition-all hover:border-rose-500/50 hover:shadow-lg dark:bg-[#1a1118]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
              DOWN SERVICES
            </span>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-white">
              {downCount}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <ArrowDown className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs text-rose-400/80">
          <span>{downCount === 0 ? '0 issues detected across audit' : `${downCount} page(s) require review`}</span>
        </div>
      </div>

      {/* 3. PAUSED / RAZORPAY COMPLIANCE (Blue Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-blue-950/20 to-slate-900/40 p-5 shadow-sm transition-all hover:border-blue-500/50 hover:shadow-lg dark:bg-[#0e1726]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
              RAZORPAY COMPLIANCE
            </span>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-white">
              {razorpayRate}%
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Link2 className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs text-blue-400/80">
          <span>{matchingButtons}/{totalButtons} buttons verified</span>
        </div>
      </div>

      {/* 4. WARNING / SELF-HOSTED CRON (Amber Card) */}
      <div className="card-grid-bg relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-amber-950/20 to-slate-900/40 p-5 shadow-sm transition-all hover:border-amber-500/50 hover:shadow-lg dark:bg-[#1c1810]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              SELF-HOSTED CRON
            </span>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              9AM & 9PM
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center space-x-1.5 text-xs text-amber-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="truncate">{nextRunIST}</span>
        </div>
      </div>

    </div>
  );
}
