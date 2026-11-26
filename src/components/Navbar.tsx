'use client';

import React from 'react';
import { Globe, Clock, Mail, PlayCircle, Loader2, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

interface NavbarProps {
  onRunAll: () => void;
  isRunningAll: boolean;
  recipientEmail: string;
}

export default function Navbar({ onRunAll, isRunningAll, recipientEmail }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        
        {/* Logo and Brand */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/20">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Astro<span className="text-indigo-600 dark:text-indigo-400 font-extrabold">Crawler</span>
              </span>
              <span className="hidden rounded-full bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-700/10 dark:ring-indigo-400/20 sm:inline-block">
                Playwright + Retries
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Page Health (200/301) • Razorpay Slug Audit • Twice Daily 9AM & 9PM Cron
            </p>
          </div>
        </div>

        {/* Right Info, Theme Toggle, and Actions */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          
          <div className="hidden md:flex items-center space-x-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Schedule: <strong>9:00 AM & 9:00 PM</strong></span>
          </div>

          <div className="hidden lg:flex items-center space-x-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <Mail className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-mono text-slate-800 dark:text-slate-200">{recipientEmail}</span>
          </div>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400 animate-spin-slow" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-600" />
            )}
          </button>

          <button
            onClick={onRunAll}
            disabled={isRunningAll}
            title="Audits all 13 monitored pages configured in .env.local"
            className="inline-flex items-center space-x-2 rounded-lg bg-indigo-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 transition"
          >
            {isRunningAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Auditing All 13 Pages...</span>
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                <span>Run Full Audit & Email (All 13 Pages)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
