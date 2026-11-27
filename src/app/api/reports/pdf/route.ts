import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { getReports } from '@/lib/store';
import { AuditReport, PageAuditResult } from '@/lib/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIST(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(iso)) + ' IST'
    );
  } catch {
    return iso;
  }
}

function getErrorButtons(res: PageAuditResult) {
  return (res.buttons || []).filter(
    (btn) =>
      btn.redirectStatus !== 'MATCH' &&
      btn.redirectStatus !== 'SAME_PAGE_REDIRECTION'
  );
}

function buildErrorReportHtml(report: AuditReport): string {
  const flaggedPages = report.results.filter((res) => {
    const errBtns = getErrorButtons(res);
    return (
      res.summary !== 'PASS' ||
      (res.errors && res.errors.length > 0) ||
      errBtns.length > 0
    );
  });

  const totalErrorButtons = report.results.reduce(
    (acc, r) => acc + getErrorButtons(r).length,
    0
  );

  const pagesHtml =
    flaggedPages.length === 0
      ? `
      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 28px; text-align: center; margin-top: 20px;">
        <div style="font-size: 18px; font-weight: 700; color: #166534;">No Errors Detected in This Audit</div>
        <div style="font-size: 13px; color: #15803d; margin-top: 6px;">
          All ${report.totalPages} audited page(s) passed HTTP status, button redirection, and countdown timer checks.
        </div>
      </div>
    `
      : flaggedPages
          .map((res, index) => {
            const errBtns = getErrorButtons(res);
            const statusText = res.isAvailable
              ? `HTTP ${res.statusCode || 'N/A'} ${res.statusText || ''}`
              : 'PAGE UNREACHABLE';

            const issuesHtml =
              res.errors && res.errors.length > 0
                ? `
                <div style="background: #fff1f2; border-left: 4px solid #e11d48; border-radius: 4px; padding: 10px 14px; margin-top: 10px;">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9f1239;">
                    Reported Errors (${res.errors.length})
                  </div>
                  <ul style="margin: 6px 0 0; padding-left: 18px; color: #881337; font-size: 12px; line-height: 1.5;">
                    ${res.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
                  </ul>
                </div>
              `
                : '';

            const timerHtml =
              res.countdownTimer &&
              res.countdownTimer.isPresent &&
              res.countdownTimer.status !== 'MATCHED'
                ? `
                <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; margin-top: 10px; font-size: 12px; color: #92400e;">
                  <strong>Countdown Timer Issue (${escapeHtml(res.countdownTimer.status)}):</strong> ${escapeHtml(res.countdownTimer.message)}
                </div>
              `
                : '';

            const buttonsTableHtml =
              errBtns.length > 0
                ? `
                <div style="margin-top: 12px;">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9f1239; margin-bottom: 6px;">
                    Buttons With Errors (${errBtns.length} of ${res.totalButtonsFound})
                  </div>
                  <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                      <tr style="background: #ffe4e6; text-align: left;">
                        <th style="padding: 7px 8px; border: 1px solid #fecdd3; color: #881337;">Button Text</th>
                        <th style="padding: 7px 8px; border: 1px solid #fecdd3; color: #881337;">Destination URL</th>
                        <th style="padding: 7px 8px; border: 1px solid #fecdd3; color: #881337; text-align: center;">Error Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${errBtns
                        .map((btn) => {
                          const dest = btn.redirectedUrl || btn.targetUrl || 'No redirect URL';
                          const statusLabel = btn.redirectStatus || 'FAILED';
                          return `
                            <tr style="background: #ffffff;">
                              <td style="padding: 6px 8px; border: 1px solid #fecdd3; font-weight: 600; color: #0f172a;">
                                ${escapeHtml(btn.text || '[Unnamed button]')}
                              </td>
                              <td style="padding: 6px 8px; border: 1px solid #fecdd3; font-family: monospace; word-break: break-all; color: #be123c;">
                                ${escapeHtml(dest)}
                              </td>
                              <td style="padding: 6px 8px; border: 1px solid #fecdd3; text-align: center; font-weight: 700; color: #9f1239;">
                                ${escapeHtml(statusLabel)}
                              </td>
                            </tr>
                          `;
                        })
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
                : '';

            return `
              <div style="border: 1px solid #fecdd3; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; background: #ffffff; page-break-inside: avoid;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
                      ${index + 1}. ${escapeHtml(res.pageName || res.url)}
                    </div>
                    <div style="font-size: 11px; color: #2563eb; margin-top: 2px; word-break: break-all;">
                      ${escapeHtml(res.url)}
                    </div>
                  </div>
                  <div style="text-align: right; white-space: nowrap; margin-left: 12px;">
                    <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;">
                      ${escapeHtml(statusText)}
                    </span>
                    <div style="font-size: 10px; color: #64748b; margin-top: 3px;">
                      Load: ${res.loadTimeMs}ms
                    </div>
                  </div>
                </div>
                ${issuesHtml}
                ${timerHtml}
                ${buttonsTableHtml}
              </div>
            `;
          })
          .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>AstroCrawler Error Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #ffffff;
          }
        </style>
      </head>
      <body>
        <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; padding: 18px 22px; border-radius: 10px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">
                Astro<span style="color: #34d399;">Crawler</span> — Error Audit Report
              </div>
              <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">
                Generated: ${escapeHtml(formatIST(report.timestamp))} • Trigger: ${escapeHtml(report.trigger.toUpperCase())} • Report ID: ${escapeHtml(report.id)}
              </div>
            </div>
            <div style="background: ${flaggedPages.length > 0 ? '#e11d48' : '#10b981'}; color: #ffffff; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;">
              ${flaggedPages.length > 0 ? `${flaggedPages.length} PAGE(S) WITH ERRORS` : '0 ERRORS'}
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc;">
            <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Audited</div>
            <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px;">${report.totalPages}</div>
          </div>
          <div style="border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; background: #f0fdf4;">
            <div style="font-size: 10px; font-weight: 700; color: #166534; text-transform: uppercase;">Healthy Pages</div>
            <div style="font-size: 20px; font-weight: 800; color: #15803d; margin-top: 2px;">${report.passedPages}</div>
          </div>
          <div style="border: 1px solid #fecdd3; border-radius: 8px; padding: 10px 12px; background: #fff1f2;">
            <div style="font-size: 10px; font-weight: 700; color: #9f1239; text-transform: uppercase;">Flagged Pages</div>
            <div style="font-size: 20px; font-weight: 800; color: #be123c; margin-top: 2px;">${flaggedPages.length}</div>
          </div>
          <div style="border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 12px; background: #fff7ed;">
            <div style="font-size: 10px; font-weight: 700; color: #9a3412; text-transform: uppercase;">Error Buttons</div>
            <div style="font-size: 20px; font-weight: 800; color: #c2410c; margin-top: 2px;">${totalErrorButtons}</div>
          </div>
        </div>

        ${pagesHtml}
      </body>
    </html>
  `;
}

export async function GET(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const reportId = req.nextUrl.searchParams.get('reportId');
    const reports = getReports();

    if (reports.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No audit reports available yet.' },
        { status: 404 }
      );
    }

    const report = reportId
      ? reports.find((r) => r.id === reportId)
      : reports[0];

    if (!report) {
      return NextResponse.json(
        { success: false, error: `Report "${reportId}" not found.` },
        { status: 404 }
      );
    }

    const html = buildErrorReportHtml(report);

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#64748b;padding:0 14mm;display:flex;justify-content:space-between;"><span>AstroCrawler Error Audit Report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
      margin: {
        top: '14mm',
        right: '14mm',
        bottom: '16mm',
        left: '14mm',
      },
    });

    const dateSlug = new Date(report.timestamp).toISOString().slice(0, 10);
    const filename = `AstroCrawler-Error-Report-${dateSlug}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[API /api/reports/pdf] Error generating PDF:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate PDF report' },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
