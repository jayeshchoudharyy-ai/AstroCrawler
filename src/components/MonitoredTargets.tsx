'use client';

import React, { useState } from 'react';
import { TargetPage } from '@/lib/types';
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  Loader2,
  Play,
  ToggleLeft,
  ToggleRight,
  Clock,
  Link2,
} from 'lucide-react';

interface MonitoredTargetsProps {
  targets: TargetPage[];
  defaultRazorpay: string;
  onTargetsChange: () => void;
  onAuditSingle: (target: TargetPage) => Promise<void>;
  auditingId: string | null;
}

export default function MonitoredTargets({
  targets,
  defaultRazorpay,
  onTargetsChange,
  onAuditSingle,
  auditingId,
}: MonitoredTargetsProps) {
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newRazorpay, setNewRazorpay] = useState(defaultRazorpay || 'https://pages.razorpay.com/');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newUrl.trim(),
          name: newName.trim(),
          expectedRazorpayLink: newRazorpay.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add monitored page');
      }

      setNewUrl('');
      setNewName('');
      setNewRazorpay(defaultRazorpay || 'https://pages.razorpay.com/');
      setFeedbackMsg({ type: 'success', text: `Added "${data.target.name}" to monitored pages successfully!` });
      onTargetsChange();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error adding page' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (target: TargetPage) => {
    try {
      await fetch('/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          updates: { isActive: !target.isActive },
        }),
      });
      onTargetsChange();
    } catch (err) {
      console.error('Failed to toggle target', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from automated monitoring?`)) return;
    try {
      await fetch(`/api/targets?id=${id}`, { method: 'DELETE' });
      onTargetsChange();
    } catch (err) {
      console.error('Failed to delete target', err);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-colors space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800 gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Monitored Pages Directory
              </h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                {targets.length} {targets.length === 1 ? 'Page' : 'Pages'} Configured
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Checked automatically twice daily at <strong>9:00 AM & 9:00 PM IST</strong> via Vercel Cron.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
          <Clock className="h-4 w-4 text-amber-500" />
          <span>Double-check Retry: <strong>10s intervals up to 30s</strong></span>
        </div>
      </div>

      {/* Permanently Visible Add Form */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
        <div className="flex items-center space-x-2 mb-3">
          <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
            Add Web Page to Automated Monitoring
          </h3>
        </div>

        <form onSubmit={handleAddTarget} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Page Title / Name</label>
              <input
                type="text"
                placeholder="e.g. Masterclass Landing Page"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Target Page URL *</label>
              <input
                type="url"
                required
                placeholder="https://mysite.com/offer"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Expected Razorpay Link or Slug *</label>
              <input
                type="text"
                required
                placeholder="pl_P12345 or https://pages.razorpay.com/pl_P12345"
                value={newRazorpay}
                onChange={(e) => setNewRazorpay(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              * Redirection check verifies that all buttons lead to this Razorpay link or slug.
            </span>
            <button
              type="submit"
              disabled={isSubmitting || !newUrl.trim()}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add to Monitored Pages</span>
                </>
              )}
            </button>
          </div>
        </form>

        {feedbackMsg && (
          <div
            className={`mt-3 rounded-lg p-2.5 text-xs font-medium ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}
      </div>

      {/* Monitored Pages Entries List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Active Monitored Entries ({targets.length})
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {targets.filter((t) => t.isActive).length} active for 9AM & 9PM cron
          </span>
        </div>

        {targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 space-y-2">
            <Globe className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="font-semibold text-slate-700 dark:text-slate-300">No Monitored Pages Configured Yet</div>
            <p className="max-w-md mx-auto text-slate-500 dark:text-slate-400">
              Use the form above or check &quot;Save to Monitored Pages&quot; in the Interactive Page Auditor to add your landing pages here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {targets.map((target, index) => {
              const isAuditing = auditingId === target.id;
              const isPassing = target.lastSummary === 'PASS';
              const hasChecked = !!target.lastCheckedAt;

              return (
                <div
                  key={target.id}
                  className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${
                    target.isActive
                      ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                      : 'border-slate-200/60 bg-slate-50/70 dark:border-slate-800/60 dark:bg-slate-950/40 opacity-60'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    
                    {/* Left: Info & Badges */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          #{index + 1} {target.name || 'Untitled Landing Page'}
                        </span>

                        {hasChecked ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isPassing
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                            }`}
                          >
                            {isPassing ? '✅ HEALTHY (200/301)' : '⚠️ ISSUES DETECTED'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            PENDING FIRST AUDIT
                          </span>
                        )}

                        {target.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            9AM & 9PM Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Paused
                          </span>
                        )}

                        {target.isEnvConfigured && (
                          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                            ⚡ .env Loaded
                          </span>
                        )}
                      </div>

                      {/* URL & Razorpay Link */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <a
                          href={target.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center space-x-1 font-medium truncate max-w-md dark:text-blue-400"
                        >
                          <span>{target.url}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>

                        <span className="text-slate-300 dark:text-slate-700">•</span>

                        <span className="text-slate-600 dark:text-slate-300 flex items-center space-x-1 font-mono text-[11px] truncate max-w-sm">
                          <Link2 className="h-3 w-3 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                          <span>Razorpay: <strong>{target.expectedRazorpayLink}</strong></span>
                        </span>
                      </div>

                      {/* Last Checked Metrics */}
                      {hasChecked && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                          <span>
                            Last Check: {new Date(target.lastCheckedAt!).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                          {target.lastStatus && (
                            <>
                              <span>•</span>
                              <span className="font-mono font-medium text-slate-600 dark:text-slate-300">
                                HTTP {target.lastStatus}
                              </span>
                            </>
                          )}
                          {target.lastButtonsCount !== undefined && (
                            <>
                              <span>•</span>
                              <span className={isPassing ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-rose-700 dark:text-rose-400 font-medium'}>
                                {target.lastButtonsCount === 0
                                  ? 'No button available'
                                  : `${target.lastMatchingCount}/${target.lastButtonsCount} Razorpay buttons valid`}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center space-x-2 self-end lg:self-center">
                      <button
                        onClick={() => onAuditSingle(target)}
                        disabled={isAuditing}
                        title="Run Playwright audit on this page now (with 10s retry)"
                        className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        {isAuditing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Play className="h-3.5 w-3.5 text-indigo-600 fill-indigo-600 dark:text-indigo-400 dark:fill-indigo-400" />
                        )}
                        <span>{isAuditing ? 'Auditing...' : 'Check Now'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleActive(target)}
                        title={target.isActive ? 'Pause 9AM & 9PM cron for this page' : 'Activate 9AM & 9PM cron for this page'}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                      >
                        {target.isActive ? (
                          <ToggleRight className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-slate-400 dark:text-slate-600" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(target.id, target.name)}
                        title="Remove page"
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
