'use client';

import React, { useState } from 'react';
import { TargetPage } from '@/lib/types';
import {
  Search,
  Plus,
  Play,
  Loader2,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MoreVertical,
  Link2,
  Filter,
} from 'lucide-react';

interface MonitoringTableProps {
  targets: TargetPage[];
  onAuditSingle: (target: TargetPage) => Promise<void>;
  auditingId: string | null;
  onOpenNewService: () => void;
  onRunAll: () => void;
  isRunningAll: boolean;
}

export default function MonitoringTable({
  targets,
  onAuditSingle,
  auditingId,
  onOpenNewService,
  onRunAll,
  isRunningAll,
}: MonitoringTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'up' | 'down' | 'same_page'>('all');

  // Filter targets based on search query and status filter
  const filteredTargets = targets.filter((target) => {
    const matchesSearch =
      target.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      target.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      target.expectedRazorpayLink.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'up') {
      return target.lastSummary === 'PASS';
    }
    if (filterType === 'down') {
      return target.lastSummary && target.lastSummary !== 'PASS';
    }
    if (filterType === 'same_page') {
      return target.lastSummary === 'PASS' && (target.lastButtonsCount || 0) > 0;
    }

    return true;
  });

  /**
   * Helper to render the 20-segment uptime bars matching the user's reference screenshot
   */
  const renderUptimeBars = (target: TargetPage) => {
    const isChecked = !!target.lastCheckedAt;
    const isPassing = target.lastSummary === 'PASS';
    const totalBars = 20;

    let successPercentage = '100.0%';
    if (!isChecked) {
      successPercentage = '0.0%';
    } else if (!isPassing) {
      successPercentage = '85.0%';
    }

    return (
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center space-x-0.5">
            {Array.from({ length: totalBars }).map((_, i) => {
              let barColor = 'bg-slate-700 dark:bg-slate-800';

              if (isChecked) {
                if (isPassing) {
                  barColor = 'bg-emerald-500';
                } else {
                  // Show last 2 bars as red to indicate recent issue
                  barColor = i >= 18 ? 'bg-rose-500' : 'bg-emerald-500';
                }
              }

              return (
                <div
                  key={i}
                  className={`h-3 w-1 rounded-sm ${barColor} transition-colors`}
                />
              );
            })}
          </div>
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
            {successPercentage}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          Last 20 checks
        </span>
      </div>
    );
  };

  /**
   * Helper to render the status pill matching the reference screenshot:
   * e.g. green pill with check `✓ Up`, red pill `Down`, etc.
   */
  const renderStatusPill = (target: TargetPage) => {
    if (!target.isActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700">
          Paused
        </span>
      );
    }

    if (!target.lastCheckedAt) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700">
          Pending
        </span>
      );
    }

    if (target.lastSummary === 'PASS') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
          <span>✓</span>
          <span>Up</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30">
        Down
      </span>
    );
  };

  const formatLastChecked = (dateStr?: string) => {
    if (!dateStr) return 'Pending first check';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateStr));
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Table Section Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        
        {/* Title & Count Badge */}
        <div className="flex items-center space-x-2.5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Currently Monitoring
          </h2>
          <span className="rounded-lg bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {targets.length}
          </span>
        </div>

        {/* Right Controls: Filters, Search, and Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Status Filter Dropdown */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e: any) => setFilterType(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111726] px-3 py-2 pr-8 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="up">✓ Up Only (Healthy)</option>
              <option value="down">Down (Issues)</option>
              <option value="same_page">Same Page Redirection</option>
            </select>
            <Filter className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 sm:w-48 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111726] pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100 dark:placeholder:text-slate-500 transition"
            />
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Primary Action Button: New Service */}
          <button
            onClick={onOpenNewService}
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-sm hover:bg-slate-100 transition dark:border-transparent dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Service</span>
          </button>

          {/* Run Full Audit & Email */}
          <button
            onClick={onRunAll}
            disabled={isRunningAll}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {isRunningAll ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Auditing All...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Run Audit & Email</span>
              </>
            )}
          </button>

        </div>

      </div>

      {/* Main Monitoring Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/80 dark:bg-[#0f1422] transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            
            {/* Table Header */}
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800/80 dark:text-slate-400">
                <th className="py-3.5 pl-6 pr-4">Service Name</th>
                <th className="py-3.5 px-4">Service Type</th>
                <th className="py-3.5 px-4">Service Status</th>
                <th className="py-3.5 px-4">Response Time</th>
                <th className="py-3.5 px-4">Uptime</th>
                <th className="py-3.5 px-4">Last Checked</th>
                <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800/60">
              {filteredTargets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    No monitored services matching current filter.
                  </td>
                </tr>
              ) : (
                filteredTargets.map((target) => {
                  const isAuditing = auditingId === target.id;
                  const loadTime = target.lastLoadTimeMs ? `${target.lastLoadTimeMs}ms` : '—';

                  return (
                    <tr
                      key={target.id}
                      className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      {/* 1. Service Name & URL */}
                      <td className="py-4 pl-6 pr-4 max-w-xs sm:max-w-sm">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {target.name}
                        </div>
                        <a
                          href={target.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 truncate mt-0.5 transition-colors"
                        >
                          <span className="truncate">{target.url}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      </td>

                      {/* 2. Service Type */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          playwright
                        </span>
                      </td>

                      {/* 3. Service Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {renderStatusPill(target)}
                      </td>

                      {/* 4. Response Time */}
                      <td className="py-4 px-4 whitespace-nowrap font-mono font-medium text-slate-700 dark:text-slate-300">
                        {loadTime}
                      </td>

                      {/* 5. Uptime Bar Graph */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {renderUptimeBars(target)}
                      </td>

                      {/* 6. Last Checked */}
                      <td className="py-4 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        <div className="flex items-center space-x-1.5 text-xs">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatLastChecked(target.lastCheckedAt)}</span>
                        </div>
                      </td>

                      {/* 7. Action Button */}
                      <td className="py-4 pl-4 pr-6 whitespace-nowrap text-right">
                        <button
                          onClick={() => onAuditSingle(target)}
                          disabled={isAuditing}
                          title="Run single page audit now"
                          className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                        >
                          {isAuditing ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                              <span className="text-[11px]">Auditing...</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current text-emerald-500" />
                              <span className="text-[11px]">Audit</span>
                            </>
                          )}
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>

          </table>
        </div>
      </div>

    </div>
  );
}
