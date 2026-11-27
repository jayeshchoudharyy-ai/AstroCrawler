'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Sliders,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Link2,
  Globe,
  Power,
  Sparkles,
} from 'lucide-react';
import { AppSettings, SelfCronState } from '@/lib/types';

interface AutomationSettingsProps {
  initialSettings: AppSettings;
  cronState: SelfCronState | null;
  onSettingsSaved: (settings: AppSettings, cronStatus: SelfCronState) => void;
}

const PRESET_COUNTS = [1, 2, 3, 4, 6];

function generateDefaultTimesForCount(count: number, existing: string[]): string[] {
  const result = [...existing];
  if (result.length > count) {
    return result.slice(0, count);
  }
  const interval = Math.floor(24 / Math.max(count, 1));
  while (result.length < count) {
    const idx = result.length;
    const candidateHour = (9 + idx * interval) % 24;
    const candidate = `${String(candidateHour).padStart(2, '0')}:00`;
    if (!result.includes(candidate)) {
      result.push(candidate);
    } else {
      // Find next free hour
      let found = false;
      for (let h = 0; h < 24; h++) {
        const alt = `${String(h).padStart(2, '0')}:00`;
        if (!result.includes(alt)) {
          result.push(alt);
          found = true;
          break;
        }
      }
      if (!found) result.push('12:00');
    }
  }
  return result;
}

function format12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function AutomationSettings({
  initialSettings,
  cronState,
  onSettingsSaved,
}: AutomationSettingsProps) {
  const [automationEnabled, setAutomationEnabled] = useState<boolean>(
    initialSettings.automationEnabled !== false
  );
  const [automationTimes, setAutomationTimes] = useState<string[]>(
    initialSettings.automationTimes && initialSettings.automationTimes.length > 0
      ? initialSettings.automationTimes
      : ['09:00', '21:00']
  );
  const [timezone, setTimezone] = useState<string>(
    initialSettings.timezone || 'Asia/Kolkata'
  );
  const [recipientEmail, setRecipientEmail] = useState<string>(
    initialSettings.recipientEmail || 'jayeshchoudharyy@gmail.com'
  );
  const [defaultRazorpayLink, setDefaultRazorpayLink] = useState<string>(
    initialSettings.defaultRazorpayLink || 'https://pages.razorpay.com/'
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setAutomationEnabled(initialSettings.automationEnabled !== false);
    setAutomationTimes(
      initialSettings.automationTimes && initialSettings.automationTimes.length > 0
        ? initialSettings.automationTimes
        : ['09:00', '21:00']
    );
    setTimezone(initialSettings.timezone || 'Asia/Kolkata');
    setRecipientEmail(initialSettings.recipientEmail || 'jayeshchoudharyy@gmail.com');
    setDefaultRazorpayLink(
      initialSettings.defaultRazorpayLink || 'https://pages.razorpay.com/'
    );
  }, [initialSettings]);

  const handleCountChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(12, newCount));
    setAutomationTimes((prev) => generateDefaultTimesForCount(clamped, prev));
  };

  const handleTimeChange = (index: number, value: string) => {
    setAutomationTimes((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveSlot = (index: number) => {
    if (automationTimes.length <= 1) return;
    setAutomationTimes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveNotice(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationEnabled,
          automationsPerDay: automationTimes.length,
          automationTimes,
          timezone,
          recipientEmail,
          defaultRazorpayLink,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save automation settings');
      }

      onSettingsSaved(data.settings, data.cronStatus);
      setSaveNotice({
        type: 'success',
        message: `Saved! ${data.cronStatus?.scheduleDescription || data.message}`,
      });
    } catch (err: any) {
      setSaveNotice({
        type: 'error',
        message: err.message || 'Error saving settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const tzLabel = timezone === 'Asia/Kolkata' ? 'IST' : timezone;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      
      {/* Status & Save Notice */}
      {saveNotice && (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold ${
            saveNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {saveNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            )}
            <span>{saveNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveNotice(null)}
            className="text-xs underline hover:no-underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Card 1: Automation Schedule & Count */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-[#0f1422] space-y-6">
        
        {/* Header + Enable Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Automation Timing & Frequency
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Set how many times per day AstroCrawler runs and the exact execution times.
              </p>
            </div>
          </div>

          {/* Enable / Pause Toggle */}
          <button
            type="button"
            onClick={() => setAutomationEnabled((prev) => !prev)}
            className={`inline-flex items-center space-x-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
              automationEnabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Power className="h-4 w-4" />
            <span>{automationEnabled ? 'Automation Enabled' : 'Automation Paused'}</span>
          </button>
        </div>

        {/* Number of Automations Per Day */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Number of Automations Per Day
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose a preset or enter any number between 1 and 12 runs per day.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleCountChange(count)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition ${
                    automationTimes.length === count
                      ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {count}x / day
                </button>
              ))}

              {/* Custom Stepper */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleCountChange(automationTimes.length - 1)}
                  disabled={automationTimes.length <= 1}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  -
                </button>
                <span className="px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white border-x border-slate-200 dark:border-slate-700">
                  {automationTimes.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleCountChange(automationTimes.length + 1)}
                  disabled={automationTimes.length >= 12}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Time Pickers Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Scheduled Run Timings ({tzLabel})
            </label>
            {automationTimes.length < 12 && (
              <button
                type="button"
                onClick={() => handleCountChange(automationTimes.length + 1)}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Time Slot</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {automationTimes.map((timeVal, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-[#111726]"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between pr-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Run #{index + 1}
                    </span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      {format12h(timeVal)} {tzLabel}
                    </span>
                  </div>
                  <input
                    type="time"
                    required
                    value={timeVal}
                    onChange={(e) => handleTimeChange(index, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                {automationTimes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(index)}
                    title="Remove this time slot"
                    className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center space-x-2.5 text-xs">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <span className="text-indigo-950 dark:text-indigo-200">
              <strong>Preview:</strong>{' '}
              {automationEnabled
                ? `${automationTimes.length}x daily at ${[...automationTimes]
                    .sort()
                    .map(format12h)
                    .join(', ')} ${tzLabel}`
                : 'Automation is currently paused'}
            </span>
          </div>
          {cronState?.nextRunIST && (
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              Current Next Run: {cronState.nextRunIST}
            </span>
          )}
        </div>

      </div>

      {/* Card 2: General & Notification Settings */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-[#0f1422] space-y-5">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4 dark:border-slate-800/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              General & Notification Defaults
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure timezone, email report recipient, and default Razorpay link.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div>
            <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <span>Timezone</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-[#111726] dark:text-white"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
            </select>
          </div>

          <div>
            <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>Report Recipient Email</span>
            </label>
            <input
              type="email"
              required
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-[#111726] dark:text-white"
            />
          </div>

          <div>
            <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <Link2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Default Razorpay Link</span>
            </label>
            <input
              type="text"
              required
              value={defaultRazorpayLink}
              onChange={(e) => setDefaultRazorpayLink(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-[#111726] dark:text-white"
            />
          </div>

        </div>

        <div className="flex items-center justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center space-x-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Applying Schedule...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save & Apply Automation Schedule</span>
              </>
            )}
          </button>
        </div>
      </div>

    </form>
  );
}
