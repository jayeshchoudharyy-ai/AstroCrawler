'use client';

import React, { useState } from 'react';
import { PageAuditResult } from '@/lib/types';
import {
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  Link,
  ExternalLink,
  Mail,
  ShieldCheck,
  Send,
  BookmarkCheck,
  RotateCw,
  Globe2,
  Layers,
} from 'lucide-react';

interface LiveAuditorProps {
  defaultRazorpay: string;
  recipientEmail: string;
  onAuditCompleted?: (result: PageAuditResult) => void;
  onTargetSaved?: () => void;
}

export default function LiveAuditor({
  defaultRazorpay,
  recipientEmail,
  onAuditCompleted,
  onTargetSaved,
}: LiveAuditorProps) {
  const [url, setUrl] = useState('');
  const [razorpayLink, setRazorpayLink] = useState(defaultRazorpay || 'https://pages.razorpay.com/');
  const [sendEmail, setSendEmail] = useState(true);
  const [saveToTargets, setSaveToTargets] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [retryStatusText, setRetryStatusText] = useState<string | null>(null);
  const [result, setResult] = useState<PageAuditResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);
    setEmailStatus(null);
    setRetryStatusText('Crawling website pages, identifying payment buttons & safely clicking in Playwright...');

    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          expectedRazorpayLink: razorpayLink.trim(),
          sendEmail,
          recipientEmail,
          saveToTargets,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to audit page');
      }

      const auditResult = data.report.results[0];
      setResult(auditResult);

      if (sendEmail) {
        if (data.emailSent) {
          setEmailStatus(`Report successfully sent to ${recipientEmail}`);
        } else {
          setEmailStatus(`Email not sent: ${data.emailError || 'Check RESEND_API_KEY'}`);
        }
      }

      if (onAuditCompleted && auditResult) {
        onAuditCompleted(auditResult);
      }

      if (saveToTargets && onTargetSaved) {
        onTargetSaved();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during audit');
    } finally {
      setIsLoading(false);
      setRetryStatusText(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-colors">
      <div className="flex items-center space-x-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
          <Search className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Single Page Live Auditor & Redirection Verifier
            </h2>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
              Single Page Only
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Checks <strong>only the single page URL entered below</strong>. All 13 hardcoded .env pages will NOT be called.
          </p>
        </div>
      </div>

      <form onSubmit={handleAudit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          
          {/* Target URL */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Website URL to Crawl *
            </label>
            <div className="relative rounded-lg shadow-sm">
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Audits only this single page and verifies its buttons. Hardcoded .env pages are not called.
            </p>
          </div>

          {/* Expected Razorpay Link / Slug */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Expected Razorpay Link or Slug *
            </label>
            <div className="relative rounded-lg shadow-sm">
              <input
                type="text"
                required
                value={razorpayLink}
                onChange={(e) => setRazorpayLink(e.target.value)}
                placeholder="e.g. pl_P12345 or https://pages.razorpay.com/pl_P12345"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 font-mono text-xs"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Validates that all payment buttons redirect to this exact Razorpay page / slug.
            </p>
          </div>

        </div>

        {/* Options and Checkboxes */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveToTargets}
                onChange={(e) => setSaveToTargets(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              />
              <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center space-x-1">
                <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Add to Monitored Pages list (Default: OFF - only check this page)</span>
              </span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              />
              <span className="flex items-center space-x-1.5 font-medium text-slate-800 dark:text-slate-200">
                <Mail className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Send single-page report to <strong>{recipientEmail}</strong></span>
              </span>
            </label>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="inline-flex items-center justify-center space-x-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Checking Page & Buttons...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span>Crawl Website & Verify Buttons</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              ⚡ Checks only this single page. Hardcoded .env pages are not called.
            </span>
          </div>
        </div>

        {/* Retry status banner while auditing */}
        {isLoading && retryStatusText && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 dark:border-indigo-900/60 dark:bg-indigo-950/40 p-3 text-xs text-indigo-900 dark:text-indigo-200 flex items-center space-x-2 animate-pulse-subtle">
            <RotateCw className="h-4 w-4 text-indigo-600 dark:text-indigo-400 animate-spin flex-shrink-0" />
            <span>{retryStatusText}</span>
          </div>
        )}
      </form>

      {/* Error Message */}
      {errorMsg && (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center space-x-2 font-semibold">
            <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <span>Audit Failed</span>
          </div>
          <p className="mt-1 text-xs">{errorMsg}</p>
        </div>
      )}

      {/* Email Status Alert */}
      {emailStatus && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200 flex items-center space-x-2">
          <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <span>{emailStatus}</span>
        </div>
      )}

      {/* Live Result View */}
      {result && (
        <div className="mt-6 border-t border-slate-200 pt-5 space-y-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Playwright Crawl & Click Result
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>{result.url}</span>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </h3>
            </div>

            <div className="flex items-center space-x-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                  result.isStatusValid && result.isAvailable && result.mismatchButtonsCount === 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                }`}
              >
                {result.isAvailable
                  ? `HTTP ${result.statusCode || 'Unknown'} (${result.statusText || 'OK'})`
                  : 'Page Unavailable / Timeout'}
              </span>

              {result.retryCount !== undefined && result.retryCount > 0 && (
                <span
                  className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                    result.finalErrorTriggered
                      ? 'bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-900'
                      : 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-900'
                  }`}
                >
                  {result.finalErrorTriggered
                    ? '⏱️ Failed after 30s (3 Retries)'
                    : `🔄 Passed on Retry #${result.retryCount}`}
                </span>
              )}

              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                ⏱️ {result.loadTimeMs}ms
              </span>
            </div>
          </div>

          {/* Crawled Pages Pill Bar */}
          {result.crawledPages && result.crawledPages.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center space-x-1.5 font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <Globe2 className="h-4 w-4 text-indigo-500" />
                <span>Pages Crawled Across Website ({result.crawledPages.length}):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.crawledPages.map((pageUrl, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {pageUrl}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Target Verified Razorpay URL or other same page redirection */}
          {result.isOtherSamePageRedirection && result.otherRedirectUrl ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <strong>other same page redirection:</strong>{' '}
                <code className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold">
                  {result.otherRedirectUrl}
                </code>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                ✅ All {result.totalButtonsFound} buttons redirect to this same page
              </span>
            </div>
          ) : result.primaryRazorpayUrl ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <strong>Razorpay Link:</strong>{' '}
                <code className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold">
                  {result.matchedRazorpayLink || result.primaryRazorpayUrl}
                </code>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                {result.matchingButtonsCount === result.totalButtonsFound && result.totalButtonsFound > 0
                  ? '✅ All buttons match this Razorpay link'
                  : 'Compared against this payment URL'}
              </span>
            </div>
          ) : null}

          {/* Countdown Timer Verification Card */}
          {result.countdownTimer && (
            <div
              className={`rounded-lg border p-3 text-xs flex items-center justify-between gap-2 ${
                result.countdownTimer.isPresent
                  ? result.countdownTimer.isMatched
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span>⏱️</span>
                <span>
                  <strong>Countdown Timer:</strong> {result.countdownTimer.message}
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/70 dark:bg-slate-900">
                {result.countdownTimer.status}
              </span>
            </div>
          )}

          {/* Issue Alert Callout */}
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300 flex items-center space-x-1.5">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <span>Redirection Errors & URL Discrepancies ({result.errors.length}):</span>
              </h4>
              <ul className="mt-2 space-y-1 pl-5 list-disc text-xs text-rose-800 dark:text-rose-200 font-medium">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Button Verification Table */}
          <div className="rounded-lg border border-slate-200 overflow-hidden dark:border-slate-800">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 dark:bg-slate-800/60 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {result.buttons.length === 0
                  ? 'Button Status: No button available'
                  : `Payment Buttons Redirection & Comparison (${result.matchingButtonsCount}/${result.totalButtonsFound} Match Razorpay)`}
              </span>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-sm">
                Target: <strong>{result.expectedRazorpayLink}</strong> {result.expectedSlug && `(Slug: ${result.expectedSlug})`}
              </span>
            </div>

            {result.buttons.length === 0 ? (
              <div className="p-8 text-center text-slate-600 dark:text-slate-400 flex flex-col items-center justify-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  No button available
                </div>
                <p className="text-xs text-slate-500 max-w-sm">
                  This page does not contain any payment or action buttons. HTTP status was checked and verified.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-200 dark:bg-slate-950/40 dark:border-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Button & Page</th>
                      <th className="px-4 py-2.5 font-medium">Playwright Safe Click Redirection</th>
                      <th className="px-4 py-2.5 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.buttons.map((btn) => {
                      let badge = null;
                      let rowClass = 'hover:bg-slate-50 dark:hover:bg-slate-800/40';

                      if (btn.redirectStatus === 'MATCH') {
                        badge = (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            MATCH
                          </span>
                        );
                      } else if (btn.redirectStatus === 'SAME_PAGE_REDIRECTION') {
                        badge = (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            SAME PAGE
                          </span>
                        );
                      } else if (btn.redirectStatus === 'DIFFERENT_PAYMENT_URL') {
                        badge = (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
                            DIFFERENT PAYMENT URL
                          </span>
                        );
                        rowClass = 'bg-amber-50/40 dark:bg-amber-950/20';
                      } else if (btn.redirectStatus === 'WRONG_DOMAIN') {
                        badge = (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                            WRONG DOMAIN
                          </span>
                        );
                        rowClass = 'bg-rose-50/60 dark:bg-rose-950/20';
                      } else {
                        badge = (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                            FAILED TO REDIRECT
                          </span>
                        );
                        rowClass = 'bg-rose-50/60 dark:bg-rose-950/20';
                      }

                      return (
                        <tr key={btn.id} className={rowClass}>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs">
                            <div>{btn.text}</div>
                            <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              &lt;{btn.tag}&gt; {btn.selector}
                            </div>
                            {btn.pageUrl && (
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate mt-1">
                                Page: {btn.pageUrl}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono text-[11px] max-w-sm truncate">
                            {(btn.redirectedUrl || btn.targetUrl).startsWith('http') ? (
                              <a
                                href={btn.redirectedUrl || btn.targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`hover:underline flex items-center space-x-1 ${
                                  btn.isRazorpayMatch ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400 font-semibold'
                                }`}
                              >
                                <span className="truncate">{btn.redirectedUrl || btn.targetUrl}</span>
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              </a>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">{btn.redirectedUrl || btn.targetUrl}</span>
                            )}
                            {btn.issue && (
                              <div className="mt-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                                ⚠️ {btn.issue}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center align-middle whitespace-nowrap">
                            {badge}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
