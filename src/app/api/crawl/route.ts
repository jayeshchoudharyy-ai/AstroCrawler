import { NextRequest, NextResponse } from 'next/server';
import { auditPage } from '@/lib/crawler';
import { getTargets, addTarget, updateTarget, saveReport, getSettings } from '@/lib/store';
import { sendAuditReportEmail } from '@/lib/email';
import { PageAuditResult, AuditReport } from '@/lib/types';

export const maxDuration = 120; // Allow up to 120s for multi-page crawling and 30s retries
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      url,
      expectedRazorpayLink,
      pageName,
      auditAll,
      sendEmail = true, // Always send email for testing and manual audits
      recipientEmail,
      saveToTargets = false, // Default false so single page audits do not alter monitored targets
      singlePageOnly = true, // When checking one page from UI, only check that specific page
    } = body;

    const settings = getSettings();
    const targetRecipient = recipientEmail || settings.recipientEmail;
    const defaultRzp = settings.defaultRazorpayLink || 'https://pages.razorpay.com/';

    const results: PageAuditResult[] = [];

    if (auditAll) {
      // Audit all active targets
      const targets = getTargets().filter((t) => t.isActive);

      if (targets.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No active monitored pages found to audit.' },
          { status: 400 }
        );
      }

      for (const target of targets) {
        try {
          const res = await auditPage(
            target.url,
            target.expectedRazorpayLink || defaultRzp,
            target.name
          );
          results.push(res);

          // Update target status in store
          updateTarget(target.id, {
            lastCheckedAt: res.checkedAt,
            lastStatus: res.statusCode,
            lastSummary: res.summary,
            lastButtonsCount: res.totalButtonsFound,
            lastMatchingCount: res.matchingButtonsCount,
            lastLoadTimeMs: res.loadTimeMs,
          });
        } catch (itemErr: any) {
          console.error(`Error auditing ${target.url}:`, itemErr);
        }
      }
    } else {
      // Audit single target on the fly
      if (!url) {
        return NextResponse.json(
          { success: false, error: 'Target URL is required.' },
          { status: 400 }
        );
      }

      const rzpLink = expectedRazorpayLink || defaultRzp;
      // Single page inspection mode: audits ONLY this page, hardcoded .env targets are not called
      const res = await auditPage(url.trim(), rzpLink.trim(), pageName, { singlePageOnly: true });
      results.push(res);

      // Save/update this page into Monitored Targets if requested
      if (saveToTargets) {
        try {
          const currentTargets = getTargets();
          const cleanUrl = url.trim();
          const existing = currentTargets.find(
            (t) => t.url.toLowerCase() === cleanUrl.toLowerCase()
          );

          if (existing) {
            updateTarget(existing.id, {
              expectedRazorpayLink: rzpLink.trim(),
              lastCheckedAt: res.checkedAt,
              lastStatus: res.statusCode,
              lastSummary: res.summary,
              lastButtonsCount: res.totalButtonsFound,
              lastMatchingCount: res.matchingButtonsCount,
              lastLoadTimeMs: res.loadTimeMs,
            });
          } else {
            let derivedName = pageName?.trim();
            if (!derivedName) {
              try {
                derivedName = new URL(cleanUrl).hostname;
              } catch {
                derivedName = cleanUrl;
              }
            }
            addTarget({
              url: cleanUrl,
              name: derivedName,
              expectedRazorpayLink: rzpLink.trim(),
              isActive: true,
            });
          }
        } catch (saveErr) {
          console.warn('Could not auto-save target to monitored list:', saveErr);
        }
      }
    }

    const totalPages = results.length;
    const passedPages = results.filter((r) => r.summary === 'PASS').length;
    const failedPages = results.filter((r) => r.summary !== 'PASS').length;
    const hasErrors = failedPages > 0;

    let emailSent = false;
    let emailError: string | undefined;

    const report: AuditReport = {
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      trigger: 'manual',
      totalPages,
      passedPages,
      failedPages,
      hasErrors,
      recipientEmail: targetRecipient,
      emailSent: false,
      results,
    };

    // Always send email report unless explicitly disabled
    if (sendEmail !== false) {
      const emailRes = await sendAuditReportEmail(report, targetRecipient);
      emailSent = emailRes.success;
      emailError = emailRes.error;
      report.emailSent = emailSent;
      report.emailError = emailError;
    }

    // Save report in history
    saveReport(report);

    return NextResponse.json({
      success: true,
      report,
      emailSent,
      emailError,
    });
  } catch (error: any) {
    console.error('Error during crawl execution:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Crawl failed.' },
      { status: 500 }
    );
  }
}
