'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Sun,
  Moon,
  Clock,
  Mail,
  Bell,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  FileText,
  X,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { AuditReport, TargetPage } from '@/lib/types';

interface TopHeaderProps {
  onToggleSidebarMobile: () => void;
  recipientEmail: string;
  hasErrors?: boolean;
  latestReport?: AuditReport | null;
  targets?: TargetPage[];
  onViewReports?: () => void;
}

interface ErrorNotificationItem {
  id: string;
  pageName: string;
  url: string;
  errors: string[];
  checkedAt?: string;
  source: 'last_crawl' | 'monitored_target';
}

export default function TopHeader({
  onToggleSidebarMobile,
  recipientEmail,
  hasErrors = false,
  latestReport = null,
  targets = [],
  onViewReports,
}: TopHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build error notifications from the last crawled pages and any unresolved failing targets
  const errorNotifications: ErrorNotificationItem[] = [];
  const seenUrls = new Set<string>();

  if (latestReport && latestReport.results) {
    for (const res of latestReport.results) {
      if (res.summary !== 'PASS' || (res.errors && res.errors.length > 0)) {
        seenUrls.add(res.url.toLowerCase());
        errorNotifications.push({
          id: res.id,
          pageName: res.pageName || res.url,
          url: res.url,
          errors:
            res.errors && res.errors.length > 0
              ? res.errors
              : [`Audit status: ${res.summary} (HTTP ${res.statusCode || 'N/A'})`],
          checkedAt: res.checkedAt,
          source: 'last_crawl',
        });
      }
    }
  }

  for (const t of targets) {
    if (t.lastSummary && t.lastSummary !== 'PASS' && !seenUrls.has(t.url.toLowerCase())) {
      seenUrls.add(t.url.toLowerCase());
      errorNotifications.push({
        id: t.id,
        pageName: t.name || t.url,
        url: t.url,
        errors: [
          `Page flagged as ${t.lastSummary} (HTTP ${t.lastStatus || 'N/A'})${
            t.lastButtonsCount !== undefined && t.lastMatchingCount !== undefined
              ? ` • ${t.lastMatchingCount}/${t.lastButtonsCount} buttons valid`
              : ''
          }`,
        ],
        checkedAt: t.lastCheckedAt,
        source: 'monitored_target',
      });
    }
  }

  const totalAlerts = errorNotifications.length;
  const showAlertDot = hasErrors || totalAlerts > 0;

  // Dynamic greeting matching the user's screenshot
  const getGreeting = () => {
    const istHour = parseInt(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
      10
    );

    if (istHour < 12) return 'Good morning';
    if (istHour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return (
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(iso)) + ' IST'
      );
    } catch {
      return '';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0b0f19]/95 transition-colors">
      
      {/* Left: Mobile Toggle & Personalized Greeting */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <button
          onClick={onToggleSidebarMobile}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
          <LayoutGrid className="h-4 w-4" />
        </div>

        <div>
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-slate-900 dark:text-white flex items-center space-x-1.5">
            <span>{getGreeting()}, superadmin</span>
            <span>👋✨</span>
          </h1>
          <p className="hidden md:block text-[11px] text-slate-400 dark:text-slate-500">
            Automated Crawler • Twice daily at 9:00 AM & 9:00 PM IST
          </p>
        </div>
      </div>

      {/* Right: Quick Status Pills & Icons */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        
        {/* Schedule Info Pill */}
        <div className="hidden md:flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span>9:00 AM & 9:00 PM</span>
        </div>

        {/* Recipient Email Pill */}
        <div className="hidden xl:flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          <Mail className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{recipientEmail}</span>
        </div>

        {/* Dark/Light Mode Switcher */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-indigo-600" />
          )}
        </button>

        {/* Notification Bell with Interactive Error Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen((prev) => !prev)}
            aria-label="Open notifications"
            title={
              showAlertDot
                ? `${totalAlerts} page error(s) need to be resolved`
                : 'All systems operating normally'
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
              isNotifOpen
                ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-400'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Bell className="h-4 w-4" />
          </button>

          {showAlertDot && (
            <span className="pointer-events-none absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 border-2 border-white dark:border-[#0b0f19]" />
            </span>
          )}

          {/* Notifications Dropdown Panel */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0f1422] z-50 overflow-hidden">
              
              {/* Dropdown Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Bell className="h-4 w-4 text-rose-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Crawl Notifications
                  </span>
                  {totalAlerts > 0 && (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500 border border-rose-500/30">
                      {totalAlerts} Error{totalAlerts > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsNotifOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Notification List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {errorNotifications.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      All Crawled Pages Healthy
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      No errors found in the last crawl. Everything is working properly.
                    </p>
                  </div>
                ) : (
                  errorNotifications.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start space-x-2.5 min-w-0">
                          <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-500">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {item.pageName}
                            </p>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-[11px] text-slate-400 hover:text-indigo-400 truncate max-w-[230px]"
                            >
                              <span className="truncate">{item.url}</span>
                              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                            </a>
                          </div>
                        </div>
                        {item.checkedAt && (
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {formatTime(item.checkedAt)}
                          </span>
                        )}
                      </div>

                      {/* Error Details */}
                      <ul className="ml-8 space-y-1">
                        {item.errors.map((err, idx) => (
                          <li
                            key={idx}
                            className="text-[11px] text-rose-600 dark:text-rose-400 leading-snug"
                          >
                            • {err}
                          </li>
                        ))}
                      </ul>

                      {/* Action Required Callout */}
                      <div className="ml-8 flex items-center justify-between rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5">
                        <span className="text-[11px] font-bold text-rose-500">
                          ⚠️ Need to resolve the error
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Action */}
              {errorNotifications.length > 0 && onViewReports && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                  <button
                    onClick={() => {
                      setIsNotifOpen(false);
                      onViewReports();
                    }}
                    className="flex w-full items-center justify-center space-x-1.5 rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>View Detailed Audit Reports</span>
                  </button>
                </div>
              )}

            </div>
          )}
        </div>

        {/* User Avatar Circle */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400 border border-emerald-500/30">
          S
        </div>

      </div>

    </header>
  );
}
