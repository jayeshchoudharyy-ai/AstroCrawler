'use client';

import React, { useState } from 'react';
import { X, Plus, Loader2, Globe, Link2 } from 'lucide-react';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRazorpay: string;
  onAdded: () => void;
}

export default function AddServiceModal({
  isOpen,
  onClose,
  defaultRazorpay,
  onAdded,
}: AddServiceModalProps) {
  const [url, setUrl] = useState('');
  const [name, setNewName] = useState('');
  const [razorpay, setRazorpay] = useState(defaultRazorpay || 'https://pages.razorpay.com/');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          name: name.trim(),
          expectedRazorpayLink: razorpay.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add service');
      }

      setUrl('');
      setNewName('');
      onAdded();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error adding monitored service');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0f1422]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add New Monitored Service
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scheduled for twice-daily audit at 9:00 AM & 9:00 PM IST
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Service / Page Name
            </label>
            <input
              type="text"
              placeholder="e.g. Masterclass Landing Page"
              value={name}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-[#111726] dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Target Website URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://grow.askpuran.com/reiki-fb/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-[#111726] dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Expected Razorpay Link or Slug *
            </label>
            <input
              type="text"
              required
              placeholder="pl_P12345 or https://pages.razorpay.com/..."
              value={razorpay}
              onChange={(e) => setRazorpay(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-[#111726] dark:text-slate-100"
            />
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Adding Service...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Service</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
