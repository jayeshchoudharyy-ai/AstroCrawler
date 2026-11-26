'use client';

import React, { useState } from 'react';
import {
  Activity,
  Search,
  Globe,
  FileText,
  Clock,
  Settings,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  Zap,
  Mail,
  Info,
  ExternalLink,
  X,
} from 'lucide-react';

export type NavTab = 'overview' | 'live' | 'targets' | 'reports' | 'cron';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  monitoredCount: number;
  reportsCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenSettings?: () => void;
}

export default function Sidebar({
  activeTab,
  onSelectTab,
  monitoredCount,
  reportsCount,
  isOpenMobile,
  onCloseMobile,
  onOpenSettings,
}: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  const navItems: { id: NavTab; label: string; icon: React.ElementType; badge?: string | number }[] = [
    { id: 'overview', label: 'Uptime Monitoring', icon: Activity, badge: monitoredCount },
    { id: 'live', label: 'Interactive Auditor', icon: Search },
    { id: 'targets', label: 'Monitored Pages', icon: Globe, badge: monitoredCount },
    { id: 'cron', label: 'Schedule & Self-Cron', icon: Clock, badge: '9AM/9PM' },
    { id: 'reports', label: 'Audit Reports', icon: FileText, badge: reportsCount },
  ];

  const handleNavClick = (id: NavTab) => {
    onSelectTab(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#0b0f19] transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Astro<span className="text-emerald-500">Crawler</span>
                </span>
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                Playwright • Self-Cron
              </p>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-[#151c2e] dark:text-emerald-400 dark:shadow-inner'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon
                      className={`h-4 w-4 transition-colors ${
                        isActive
                          ? 'text-emerald-400'
                          : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Setting Panel Collapsible Group */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex w-full items-center justify-between px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <div className="flex items-center space-x-2">
                <Settings className="h-3.5 w-3.5" />
                <span>Setting Panel</span>
              </div>
              {isSettingsOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {isSettingsOpen && (
              <div className="mt-1 space-y-1">
                <button
                  onClick={() => {
                    if (onOpenSettings) onOpenSettings();
                    onCloseMobile();
                  }}
                  className="flex w-full items-center space-x-3 rounded-lg px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                >
                  <Settings className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span>General Settings</span>
                </button>

                <button
                  onClick={() => handleNavClick('cron')}
                  className="flex w-full items-center space-x-3 rounded-lg px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                >
                  <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span>Notification Settings</span>
                </button>

                <button
                  onClick={() => handleNavClick('targets')}
                  className="flex w-full items-center space-x-3 rounded-lg px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                >
                  <Layers className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span>Monitored URLs (.env)</span>
                </button>

                <div className="px-3.5 py-2 text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-3">
                  <Info className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span>About System</span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Sidebar Footer: Superadmin User Profile */}
        <div className="border-t border-slate-100 p-3.5 dark:border-slate-800/60">
          <div className="flex items-center space-x-3 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/60">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  superadmin
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                jayeshchoudharyy@gmail.com
              </p>
            </div>
          </div>
        </div>

      </aside>
    </>
  );
}
