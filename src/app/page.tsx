'use client';

import React, { useState, useEffect } from 'react';
import Sidebar, { NavTab } from '@/components/Sidebar';
import TopHeader from '@/components/TopHeader';
import OverviewCards from '@/components/OverviewCards';
import MonitoringTable from '@/components/MonitoringTable';
import AddServiceModal from '@/components/AddServiceModal';
import LiveAuditor from '@/components/LiveAuditor';
import MonitoredTargets from '@/components/MonitoredTargets';
import ReportsHistory from '@/components/ReportsHistory';
import CronSetupGuide from '@/components/CronSetupGuide';
import AutomationSettings from '@/components/AutomationSettings';
import { TargetPage, AuditReport, AppSettings, PageAuditResult, SelfCronState } from '@/lib/types';
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Play,
  Loader2,
  Activity,
  ArrowRight,
} from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [targets, setTargets] = useState<TargetPage[]>([]);
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [cronState, setCronState] = useState<SelfCronState | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    recipientEmail: 'jayeshchoudharyy@gmail.com',
    defaultRazorpayLink: 'https://pages.razorpay.com/',
    scheduleDescription: 'Twice daily at 9:00 AM & 9:00 PM IST (Asia/Kolkata)',
  });

  const [isRunningAll, setIsRunningAll] = useState(false);
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchTargetsAndSettings = async () => {
    try {
      const res = await fetch('/api/targets');
      const data = await res.json();
      if (data.success) {
        setTargets(data.targets);
        if (data.settings) setSettings(data.settings);
      }
    } catch (err) {
      console.error('Error fetching targets:', err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.success) {
        setReports(data.reports);
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  };

  const fetchCronState = async () => {
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      if (data.success && data.status) {
        setCronState(data.status);
      }
    } catch (err) {
      console.error('Error fetching cron state:', err);
    }
  };

  useEffect(() => {
    fetchTargetsAndSettings();
    fetchReports();
    fetchCronState();
  }, []);

  const handleRunAll = async () => {
    setIsRunningAll(true);
    setBannerNotice(null);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditAll: true,
          sendEmail: true,
          recipientEmail: settings.recipientEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete full audit');
      }

      await fetchTargetsAndSettings();
      await fetchReports();
      await fetchCronState();

      const emailNote = data.emailSent
        ? `Report emailed to ${settings.recipientEmail}.`
        : `Email note: ${data.emailError || 'Email delivered'}.`;

      setBannerNotice({
        type: 'success',
        message: `Audit completed across ${data.report.totalPages} page(s). ${emailNote}`,
      });
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err.message || 'An error occurred during full audit',
      });
    } finally {
      setIsRunningAll(false);
    }
  };

  const handleAuditSingleTarget = async (target: TargetPage) => {
    setAuditingId(target.id);
    setBannerNotice(null);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target.url,
          expectedRazorpayLink: target.expectedRazorpayLink,
          pageName: target.name,
          sendEmail: true,
          recipientEmail: settings.recipientEmail,
          singlePageOnly: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to inspect page');
      }

      await fetchTargetsAndSettings();
      await fetchReports();

      const singleRes = data.report.results[0];
      const emailNotice = data.emailSent
        ? `📧 Report emailed to ${settings.recipientEmail}.`
        : `(${data.emailError || 'Email sent'})`;

      const buttonStatusDesc = singleRes.totalButtonsFound === 0
        ? 'No button available'
        : `${singleRes.matchingButtonsCount}/${singleRes.totalButtonsFound} Razorpay buttons valid`;

      setBannerNotice({
        type: 'success',
        message: `Inspected "${target.name}": Status HTTP ${singleRes.statusCode || 'N/A'}, ${buttonStatusDesc}. ${emailNotice}`,
      });
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err.message || 'Failed to inspect page',
      });
    } finally {
      setAuditingId(null);
    }
  };

  const handleLiveAuditDone = (result: PageAuditResult) => {
    fetchReports();
    fetchTargetsAndSettings();
  };

  const latestReport = reports.length > 0 ? reports[0] : null;
  const hasFailingPages =
    targets.some((t) => t.lastSummary && t.lastSummary !== 'PASS') ||
    Boolean(latestReport?.hasErrors);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070a12] text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        monitoredCount={targets.length}
        reportsCount={reports.length}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenSettings={() => setActiveTab('general-settings')}
      />

      {/* Main Content Area (Offset for Desktop Sidebar) */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        
        {/* Top Header Bar */}
        <TopHeader
          onToggleSidebarMobile={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          recipientEmail={settings.recipientEmail}
          hasErrors={hasFailingPages}
          latestReport={latestReport}
          targets={targets}
          onViewReports={() => setActiveTab('reports')}
          scheduleSummary={cronState?.scheduleDescription || settings.scheduleDescription}
        />

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* Banner Alert Notification */}
          {bannerNotice && (
            <div
              className={`rounded-xl p-4 flex items-center justify-between shadow-sm transition border ${
                bannerNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                  : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center space-x-2.5 text-xs font-semibold">
                {bannerNotice.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                )}
                <span>{bannerNotice.message}</span>
              </div>
              <button
                onClick={() => setBannerNotice(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white ml-4"
              >
                ✕
              </button>
            </div>
          )}

          {/* VIEW 1: Overview & Monitoring (Primary Reference Design View) */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Overview Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    Overview
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Playwright uptime crawler & Razorpay redirection monitoring
                  </p>
                </div>

                <div className="flex items-center space-x-2.5">
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-sm hover:bg-slate-100 transition dark:border-transparent dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New Service</span>
                  </button>

                  <button
                    onClick={handleRunAll}
                    disabled={isRunningAll}
                    className="inline-flex items-center space-x-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition"
                  >
                    {isRunningAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Auditing All...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        <span>Run Full Audit & Email</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 4 Sleek Glassy Metric Cards */}
              <OverviewCards
                targets={targets}
                latestReport={reports.length > 0 ? reports[0] : null}
                nextRunIST={cronState?.nextRunIST}
                automationsPerDay={cronState?.automationsPerDay ?? settings.automationsPerDay ?? 2}
                automationEnabled={cronState?.isActive ?? settings.automationEnabled ?? true}
              />

              {/* Currently Monitoring Table with Uptime Bars */}
              <MonitoringTable
                targets={targets}
                onAuditSingle={handleAuditSingleTarget}
                auditingId={auditingId}
                onOpenNewService={() => setIsAddModalOpen(true)}
                onRunAll={handleRunAll}
                isRunningAll={isRunningAll}
              />

            </div>
          )}

          {/* VIEW 2: Interactive Single Page Auditor */}
          {activeTab === 'live' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Interactive Page Auditor
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Test individual landing pages, simulate safe button clicks, verify Razorpay links & countdown timers.
                  </p>
                </div>
              </div>

              <LiveAuditor
                defaultRazorpay={settings.defaultRazorpayLink}
                recipientEmail={settings.recipientEmail}
                onAuditCompleted={handleLiveAuditDone}
                onTargetSaved={fetchTargetsAndSettings}
              />
            </div>
          )}

          {/* VIEW 3: Monitored Pages Directory */}
          {activeTab === 'targets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Monitored Pages Directory
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Manage the 13 automated landing pages configured from .env or UI.
                  </p>
                </div>
              </div>

              <MonitoredTargets
                targets={targets}
                defaultRazorpay={settings.defaultRazorpayLink}
                onTargetsChange={fetchTargetsAndSettings}
                onAuditSingle={handleAuditSingleTarget}
                auditingId={auditingId}
              />
            </div>
          )}

          {/* VIEW 4: Self-Hosted Cron Scheduler */}
          {activeTab === 'cron' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Self-Hosted Cron Scheduler
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Twice daily at 9:00 AM & 9:00 PM IST (Asia/Kolkata) • Independent from Vercel.
                  </p>
                </div>
              </div>

              <CronSetupGuide
                recipientEmail={settings.recipientEmail}
                onOpenSettings={() => setActiveTab('automation-settings')}
                onAuditCompleted={async () => {
                  await fetchTargetsAndSettings();
                  await fetchReports();
                  await fetchCronState();
                }}
              />
            </div>
          )}

          {/* VIEW 5: Audit Reports History */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Audit Reports History
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Historical logs of automated cron runs and manual single-page verifications.
                  </p>
                </div>
              </div>

              <ReportsHistory reports={reports} />
            </div>
          )}

          {/* VIEW 6: Automation Timing & Count */}
          {activeTab === 'automation-settings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Automation Timing & Count
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Customize the number of daily automations and exact run timings.
                  </p>
                </div>
              </div>

              <AutomationSettings
                section="automation"
                initialSettings={settings}
                cronState={cronState}
                onSettingsSaved={(updatedSettings, updatedCron) => {
                  setSettings(updatedSettings);
                  setCronState(updatedCron);
                }}
              />
            </div>
          )}

          {/* VIEW 7: General Settings */}
          {activeTab === 'general-settings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    General Settings
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure timezone, report recipient email, and default Razorpay link.
                  </p>
                </div>
              </div>

              <AutomationSettings
                section="general"
                initialSettings={settings}
                cronState={cronState}
                onSettingsSaved={(updatedSettings, updatedCron) => {
                  setSettings(updatedSettings);
                  setCronState(updatedCron);
                }}
              />
            </div>
          )}

        </main>

        {/* Global Footer */}
        <footer className="border-t border-slate-200 bg-white py-5 px-6 text-xs text-slate-500 dark:border-slate-800/80 dark:bg-[#0b0f19] dark:text-slate-500 transition-colors mt-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
            <div>
              AstroCrawler • Powered by Playwright Chromium, Node-Cron & Resend
            </div>
            <div>
              Schedule: <strong className="text-slate-700 dark:text-slate-300">9:00 AM & 9:00 PM IST</strong> • Recipient: <strong className="text-slate-700 dark:text-slate-300">{settings.recipientEmail}</strong>
            </div>
          </div>
        </footer>

      </div>

      {/* Add New Service Modal */}
      <AddServiceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultRazorpay={settings.defaultRazorpayLink}
        onAdded={() => {
          fetchTargetsAndSettings();
          setBannerNotice({
            type: 'success',
            message: 'New monitored service added successfully.',
          });
        }}
      />

    </div>
  );
}
