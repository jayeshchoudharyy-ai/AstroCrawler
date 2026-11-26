import { Resend } from 'resend';
import { PageAuditResult, AuditReport } from './types';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const DEFAULT_RECIPIENT = 'jayeshchoudharyy@gmail.com';

/**
 * Formats date to a human-readable string in IST and UTC
 */
function formatAuditTime(isoDate: string): { ist: string; utc: string } {
  const d = new Date(isoDate);
  const ist = d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const utc = d.toUTCString();
  return { ist: `${ist} IST`, utc };
}

/**
 * Generates simple, clean, developer-friendly HTML email report.
 * Removes extra clutter and highlights:
 * 1. Explicit (Razorpay link) when all buttons match.
 * 2. Countdown timer verification vs current time.
 * 3. Flagged issues (if any) and clear button redirection list.
 */
export function generateEmailHtml(report: AuditReport): string {
  const { ist } = formatAuditTime(report.timestamp);
  const hasErrors = report.hasErrors;

  const pagesHtml = report.results
    .map((res) => {
      const isStatusGood =
        res.isStatusValid &&
        res.isAvailable &&
        res.mismatchButtonsCount === 0 &&
        (!res.countdownTimer || res.countdownTimer.status === 'MATCHED' || res.countdownTimer.status === 'NOT_PRESENT');

      const statusBadge = res.isAvailable
        ? `HTTP ${res.statusCode || 200} ${res.statusText || 'OK'}`
        : 'PAGE UNREACHABLE';

      // 1. Explicit Razorpay Link Banner or other same page redirection Banner
      const allButtonsMatched = res.totalButtonsFound > 0 && res.matchingButtonsCount === res.totalButtonsFound;
      const matchedLink = res.matchedRazorpayLink || res.primaryRazorpayUrl;

      let razorpayLinkSection = '';
      if (res.isOtherSamePageRedirection && res.otherRedirectUrl) {
        razorpayLinkSection = `
          <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px; margin: 12px 0;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #166534; letter-spacing: 0.05em;">
              🔗 other same page redirection (All ${res.totalButtonsFound} Buttons Verified):
            </div>
            <div style="font-size: 14px; font-weight: bold; font-family: monospace; color: #14532d; margin-top: 4px; word-break: break-all;">
              <a href="${res.otherRedirectUrl}" target="_blank" style="color: #15803d; text-decoration: underline;">
                ${res.otherRedirectUrl}
              </a>
            </div>
          </div>
        `;
      } else if (allButtonsMatched && matchedLink) {
        razorpayLinkSection = `
          <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px; margin: 12px 0;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #166534; letter-spacing: 0.05em;">
              🔗 Razorpay Link (All ${res.totalButtonsFound} Buttons Verified):
            </div>
            <div style="font-size: 14px; font-weight: bold; font-family: monospace; color: #14532d; margin-top: 4px; word-break: break-all;">
              <a href="${matchedLink}" target="_blank" style="color: #15803d; text-decoration: underline;">
                ${matchedLink}
              </a>
            </div>
          </div>
        `;
      } else if (res.totalButtonsFound > 0 && !allButtonsMatched) {
        razorpayLinkSection = `
          <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 12px 16px; margin: 12px 0;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9f1239;">
              🚨 Redirection Discrepancy:
            </div>
            <div style="font-size: 13px; color: #be123c; margin-top: 4px;">
              Buttons on this page redirect to different destinations (${res.differentUrlsCount || 0} different links, ${res.wrongDomainCount || 0} wrong domain).
            </div>
          </div>
        `;
      }

      // 2. Countdown Timer Section
      let countdownSection = '';
      if (res.countdownTimer && res.countdownTimer.isPresent) {
        const isTimerOk = res.countdownTimer.status === 'MATCHED';
        const timerBg = isTimerOk ? '#f0fdf4' : '#fff1f2';
        const timerBorder = isTimerOk ? '#bbf7d0' : '#fecdd3';
        const timerTextColor = isTimerOk ? '#166534' : '#9f1239';
        const timerIcon = isTimerOk ? '⏱️' : '🚨';

        countdownSection = `
          <div style="background-color: ${timerBg}; border: 1px solid ${timerBorder}; border-radius: 6px; padding: 10px 14px; margin: 10px 0; font-size: 12px; color: ${timerTextColor};">
            <strong>${timerIcon} Countdown Timer:</strong> ${res.countdownTimer.message}
          </div>
        `;
      } else {
        countdownSection = `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; margin: 10px 0; font-size: 12px; color: #64748b;">
            ⏱️ <strong>Countdown Timer:</strong> Not present on page.
          </div>
        `;
      }

      // 3. Error Callout (Only when errors exist)
      let errorsSection = '';
      if (res.errors.length > 0) {
        errorsSection = `
          <div style="background-color: #fff1f2; border-left: 4px solid #e11d48; padding: 10px 14px; margin: 12px 0; border-radius: 4px;">
            <div style="font-weight: 700; color: #9f1239; font-size: 12px; text-transform: uppercase;">
              ⚠️ Reported Issues (${res.errors.length}):
            </div>
            <ul style="margin: 6px 0 0; padding-left: 18px; color: #881337; font-size: 12px;">
              ${res.errors.map((e) => `<li style="margin-bottom: 2px;">${e}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      // 4. Clean, Simple Buttons Table
      let buttonsContent = '';
      if (res.buttons.length === 0) {
        buttonsContent = `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #475569; margin-top: 10px;">
            ℹ️ <strong>No button available</strong> on this page.
          </div>
        `;
      } else {
        buttonsContent = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px;">
            <thead>
              <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left;">
                <th style="padding: 6px 8px; color: #475569;">Button Text</th>
                <th style="padding: 6px 8px; color: #475569;">Destination URL</th>
                <th style="padding: 6px 8px; color: #475569; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${res.buttons
                .map((btn) => {
                  let badge = '';
                  let rowBg = '#ffffff';

                  if (btn.redirectStatus === 'MATCH') {
                    badge = '<span style="background-color: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">MATCH</span>';
                  } else if (btn.redirectStatus === 'SAME_PAGE_REDIRECTION') {
                    badge = '<span style="background-color: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">SAME PAGE</span>';
                  } else if (btn.redirectStatus === 'DIFFERENT_PAYMENT_URL') {
                    badge = '<span style="background-color: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">DIFF URL</span>';
                    rowBg = '#fffbeb';
                  } else if (btn.redirectStatus === 'WRONG_DOMAIN') {
                    badge = '<span style="background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">WRONG DOMAIN</span>';
                    rowBg = '#fff1f2';
                  } else {
                    badge = '<span style="background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">FAILED</span>';
                    rowBg = '#fff1f2';
                  }

                  return `
                    <tr style="border-bottom: 1px solid #f1f5f9; background-color: ${rowBg};">
                      <td style="padding: 6px 8px; font-weight: 500; color: #0f172a; max-width: 180px;">
                        ${btn.text || '[Unnamed button]'}
                      </td>
                      <td style="padding: 6px 8px; font-family: monospace; font-size: 11px; word-break: break-all; max-width: 320px;">
                        <a href="${btn.redirectedUrl || btn.targetUrl}" target="_blank" style="color: ${btn.isRazorpayMatch ? '#0284c7' : '#e11d48'}; text-decoration: none;">
                          ${btn.redirectedUrl || btn.targetUrl}
                        </a>
                      </td>
                      <td style="padding: 6px 8px; text-align: center;">
                        ${badge}
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        `;
      }

      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 16px; padding: 16px; background: #ffffff;">
          <!-- Page Header -->
          <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
            <div>
              <span style="font-size: 15px; font-weight: bold; color: #0f172a;">${res.pageName || res.url}</span>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                URL: <a href="${res.url}" target="_blank" style="color: #0284c7; text-decoration: none;">${res.url}</a>
              </div>
            </div>
            <div>
              <span style="background-color: ${isStatusGood ? '#dcfce7' : '#fee2e2'}; color: ${isStatusGood ? '#15803d' : '#b91c1c'}; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">
                ${statusBadge}
              </span>
            </div>
          </div>

          <!-- Razorpay Link -->
          ${razorpayLinkSection}

          <!-- Countdown Timer -->
          ${countdownSection}

          <!-- Errors (if any) -->
          ${errorsSection}

          <!-- Buttons -->
          ${buttonsContent}
        </div>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Link & Countdown Audit Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0f172a; line-height: 1.4;">
  <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    
    <!-- Header -->
    <div style="background-color: #0f172a; padding: 16px 20px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc;">
        ${hasErrors ? '🚨 Payment Link & Countdown Audit: Issues Detected' : '✅ Payment Link & Countdown Audit: Verified'}
      </h1>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
        Timestamp: ${ist} • Monitored Sites: ${report.totalPages} • Recipient: ${report.recipientEmail}
      </div>
    </div>

    <!-- Content -->
    <div style="padding: 16px 20px;">
      ${pagesHtml}
    </div>

    <!-- Footer -->
    <div style="padding: 12px 20px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
      Automated report sent to <strong>${report.recipientEmail}</strong> via Resend.
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Sends audit report email using Resend
 */
export async function sendAuditReportEmail(
  report: AuditReport,
  recipientOverride?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const recipient = recipientOverride || report.recipientEmail || DEFAULT_RECIPIENT;

  if (!process.env.RESEND_API_KEY) {
    const errorMsg = 'RESEND_API_KEY is not configured in environment variables.';
    console.warn(`[Resend] Cannot send email: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }

  try {
    const resendClient = new Resend(process.env.RESEND_API_KEY);
    const hasErrors = report.hasErrors;
    const firstResult = report.results[0];
    const matchedRazorpayLink = firstResult?.matchedRazorpayLink || (firstResult?.mismatchButtonsCount === 0 ? firstResult?.primaryRazorpayUrl : undefined);

    let subject = '';
    if (hasErrors) {
      subject = `🚨 [Audit Alert] Issues detected on ${firstResult?.pageName || firstResult?.url || 'website'}`;
    } else if (firstResult?.isOtherSamePageRedirection && firstResult.otherRedirectUrl) {
      subject = `✅ [Audit Verified] other same page redirection: ${firstResult.otherRedirectUrl}`;
    } else if (matchedRazorpayLink) {
      subject = `✅ [Audit Verified] Razorpay Link: ${matchedRazorpayLink}`;
    } else if (firstResult?.noButtonsAvailable) {
      subject = `ℹ️ [Audit Verified] ${firstResult?.pageName || 'Page'} - No button available (HTTP 200 OK)`;
    } else {
      subject = `✅ [Redirection Audit] All buttons verified and redirecting properly`;
    }

    const fromAddress = process.env.RESEND_FROM || 'AstroCrawler <onboarding@resend.dev>';

    const emailResponse = await resendClient.emails.send({
      from: fromAddress,
      to: [recipient],
      subject,
      html: generateEmailHtml(report),
    });

    if (emailResponse.error) {
      console.error('[Resend] Error response:', emailResponse.error);
      return {
        success: false,
        error: emailResponse.error.message || 'Unknown Resend error',
      };
    }

    console.log(`[Resend] Email successfully sent to ${recipient}, id:`, emailResponse.data?.id);
    return {
      success: true,
      id: emailResponse.data?.id,
    };
  } catch (err: any) {
    console.error('[Resend] Unexpected exception while sending email:', err);
    return {
      success: false,
      error: err.message || 'Failed to send email',
    };
  }
}
