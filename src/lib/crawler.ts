import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as cheerio from 'cheerio';
import { PageAuditResult, ButtonAudit, CountdownAudit } from './types';

/**
 * Normalizes URLs for accurate comparison.
 * Removes trailing slashes, trims whitespace, standardizes protocols.
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().replace(/\/+$/, '');
  }
}

/**
 * Extracts Razorpay payment page slug from a URL, path, or bare slug.
 * Examples:
 *  - "https://pages.razorpay.com/pl_O3xY123" -> "pl_o3xy123"
 *  - "https://rzp.io/l/my-workshop" -> "my-workshop"
 *  - "pages.razorpay.com/pl_XYZ" -> "pl_xyz"
 *  - "pl_O3xY123" -> "pl_o3xy123"
 */
export function extractRazorpaySlug(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // If already just a slug without slash or domain
  if (!trimmed.includes('/') && !trimmed.includes('.')) {
    return trimmed.toLowerCase();
  }

  try {
    const full = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(full);
    const parts = parsed.pathname.split('/').filter(Boolean);

    // If path is like /l/slug or /i/slug or /slug
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1].toLowerCase();
      // Reserved segments that are not actual payment slugs
      if (lastPart !== 'l' && lastPart !== 'i' && lastPart !== 'pages' && lastPart !== 'pay') {
        return lastPart;
      }
    }
    // No slug present on base domain (e.g. https://pages.razorpay.com/ or https://pages.razorpay.com)
    return '';
  } catch {
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length > 1) {
      return parts[parts.length - 1].toLowerCase();
    }
    return '';
  }
}

/**
 * Verifies if targetUrl redirects to / matches expected Razorpay link or slug.
 */
export function isRazorpayMatch(targetUrl: string, expectedInput: string): boolean {
  if (!targetUrl) return false;

  const targetLower = targetUrl.toLowerCase().trim();
  const expectedLower = (expectedInput || '').toLowerCase().trim();

  // Must be on Razorpay domain
  const isTargetRazorpay =
    targetLower.includes('pages.razorpay.com') ||
    targetLower.includes('rzp.io') ||
    targetLower.includes('razorpay.com');

  if (!isTargetRazorpay) {
    return false;
  }

  const expectedSlug = extractRazorpaySlug(expectedLower);
  if (!expectedSlug) {
    return true; // Any valid Razorpay link
  }

  const targetSlug = extractRazorpaySlug(targetLower);
  if (targetSlug === expectedSlug) {
    return true;
  }

  if (targetLower.includes(`/${expectedSlug}`) || targetLower.includes(expectedSlug)) {
    return true;
  }

  return false;
}

/**
 * Discovers internal website pages starting from startUrl (same origin).
 * When startUrl has a subpath (e.g. /reiki-fb/), only subpages belonging to that campaign are discovered.
 */
async function discoverInternalPages(page: Page, startUrl: string, maxPages = 6): Promise<string[]> {
  const discovered = new Set<string>([startUrl]);

  try {
    const startObj = new URL(startUrl);
    const rawPath = startObj.pathname.replace(/\/+$/, '');
    const isRoot = !rawPath || rawPath === '';

    const links = await page.evaluate(
      ({ origin, basePath, isRootDomain }) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const results: string[] = [];
        const excludedExtensions = /\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|woff|woff2|ico|mp4)$/i;

        for (const a of anchors) {
          const href = (a.getAttribute('href') || '').trim();
          if (
            !href ||
            href.startsWith('#') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            href.startsWith('javascript:')
          ) {
            continue;
          }

          try {
            const resolved = new URL(href, window.location.href);
            if (resolved.origin === origin && !excludedExtensions.test(resolved.pathname)) {
              let clean = `${resolved.origin}${resolved.pathname}`;
              if (clean.length > 1 && clean.endsWith('/')) {
                clean = clean.slice(0, -1);
              }

              const resolvedPath = resolved.pathname.replace(/\/+$/, '');
              // If startUrl is a specific campaign path, only stay inside that campaign path
              if (isRootDomain) {
                results.push(clean);
              } else if (resolvedPath === basePath || resolvedPath.startsWith(`${basePath}/`)) {
                results.push(clean);
              }
            }
          } catch {
            // ignore invalid URLs
          }
        }
        return results;
      },
      { origin: startObj.origin, basePath: rawPath, isRootDomain: isRoot }
    );

    for (const link of links) {
      if (discovered.size >= maxPages) break;
      discovered.add(link);
    }
  } catch (err) {
    console.warn(`[Crawler] Page discovery note on ${startUrl}:`, err);
  }

  return Array.from(discovered);
}

/**
 * Safely clicks a payment button on the page and intercepts the destination redirect URL.
 * Uses isolated routing to capture the exact redirect URL without completing transactions.
 */
async function safelyClickAndCaptureRedirect(
  context: BrowserContext,
  pageUrl: string,
  buttonIndex: number,
  fallbackTargetUrl: string
): Promise<{ redirectedUrl: string; clickSuccess: boolean; method: string }> {
  // 1. Direct Razorpay URL in static target attribute
  if (fallbackTargetUrl) {
    const trimmed = fallbackTargetUrl.trim();
    if (trimmed.includes('pages.razorpay.com') || trimmed.includes('razorpay.com/pl_')) {
      return {
        redirectedUrl: trimmed,
        clickSuccess: true,
        method: 'Direct Razorpay Target Link',
      };
    }

    // 2. Shortlink resolution (e.g. rzp.io/l/...) via lightweight HTTP redirect follow
    if (trimmed.includes('rzp.io')) {
      try {
        const headRes = await fetch(trimmed, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 WebCrawlerAuditor/1.0' },
        });
        if (headRes.url) {
          return {
            redirectedUrl: headRes.url,
            clickSuccess: true,
            method: 'Shortlink Resolution',
          };
        }
      } catch {
        return {
          redirectedUrl: trimmed,
          clickSuccess: true,
          method: 'Static Shortlink Target',
        };
      }
    }
  }

  // 3. For dynamic buttons (no static href, onclick, forms, or JS navigation), safely click in Playwright
  let clickPage: Page | null = null;
  try {
    clickPage = await context.newPage();
    let capturedRedirectUrl = '';
    let popupOpened = false;

    // Intercept popup windows if button opens new tab (e.g. target="_blank" or window.open)
    clickPage.on('popup', async (popup) => {
      popupOpened = true;
      try {
        const popupUrl = popup.url();
        if (popupUrl && popupUrl !== 'about:blank') {
          capturedRedirectUrl = popupUrl;
        }
        popup.on('framenavigated', (frame) => {
          if (frame === popup.mainFrame()) {
            capturedRedirectUrl = frame.url();
          }
        });
        await popup.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {});
        if (!capturedRedirectUrl || capturedRedirectUrl === 'about:blank') {
          capturedRedirectUrl = popup.url();
        }
        await popup.close().catch(() => {});
      } catch {}
    });

    // Intercept route requests to Razorpay or external destinations to keep safe
    await clickPage.route('**/*', (route) => {
      const reqUrl = route.request().url();
      if (
        reqUrl.includes('pages.razorpay.com') ||
        reqUrl.includes('rzp.io') ||
        reqUrl.includes('razorpay.com')
      ) {
        capturedRedirectUrl = reqUrl;
        // Abort to prevent real transaction script execution - 100% safe
        route.abort().catch(() => {});
        return;
      }
      route.continue().catch(() => {});
    });

    // Intercept in-page script exceptions so external page errors don't crash Node process
    clickPage.on('pageerror', (err) => {
      console.warn(`[SafeClick Script Note on ${pageUrl}]:`, err.message);
    });

    // Inject override for window.open to guarantee safe interception without recursive traps
    await clickPage.addInitScript(() => {
      (window as any).__capturedUrls = [];
      (window as any).open = function (url: any) {
        if (url) {
          try {
            (window as any).__capturedUrls.push(String(url));
          } catch {}
        }
        return {
          closed: false,
          focus: function () {},
          close: function () {},
          blur: function () {},
          location: { href: String(url || '') },
        };
      };
    });

    // Navigate to page
    await clickPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });

    // Locate candidate buttons on the page
    const buttons = clickPage.locator(
      'button, [role="button"], input[type="button"], input[type="submit"], a, .btn, .button, .cta'
    );
    const count = await buttons.count();

    if (buttonIndex < count) {
      const targetBtn = buttons.nth(buttonIndex);

      // Perform safe click
      await Promise.race([
        targetBtn.click({ timeout: 2500 }),
        new Promise((resolve) => setTimeout(resolve, 2600)),
      ]).catch(() => {});

      // Short wait to catch dynamic JS redirects
      await clickPage.waitForTimeout(600);

      // Check if window.open captured an URL
      const scriptUrls = await clickPage.evaluate(() => (window as any).__capturedUrls || []).catch(() => []);
      if (scriptUrls.length > 0 && !capturedRedirectUrl) {
        capturedRedirectUrl = scriptUrls[0];
      }

      // Check current page URL in case of same-tab redirect
      const currentUrl = clickPage.url();
      if (!capturedRedirectUrl && currentUrl && currentUrl !== pageUrl && currentUrl !== 'about:blank') {
        capturedRedirectUrl = currentUrl;
      }
    }

    await clickPage.close().catch(() => {});
    clickPage = null;

    if (capturedRedirectUrl) {
      return {
        redirectedUrl: capturedRedirectUrl,
        clickSuccess: true,
        method: popupOpened ? 'Popup Interception' : 'Safe Click Redirection',
      };
    }
  } catch (err: any) {
    if (clickPage) {
      await clickPage.close().catch(() => {});
    }
    console.warn(`[SafeClick] Note during button click on ${pageUrl}:`, err.message);
  }

  // Fallback to static attribute target
  if (fallbackTargetUrl && fallbackTargetUrl.startsWith('http')) {
    return {
      redirectedUrl: fallbackTargetUrl,
      clickSuccess: true,
      method: 'Static Attribute Target',
    };
  }

  return {
    redirectedUrl: fallbackTargetUrl || 'No destination URL',
    clickSuccess: false,
    method: 'Click Failed / No Redirect',
  };
}

/**
 * Checks if a countdown timer is present on the page and verifies that it matches current time.
 * If target date has expired or displayed digits do not match current time, records an error.
 */
export async function auditCountdownTimer(page: Page): Promise<CountdownAudit> {
  try {
    // Wait briefly for client-side JavaScript countdown scripts to hydrate and run
    await page.waitForTimeout(1500);

    const timerData = await page.evaluate(() => {
      const selectors = [
        '.eael-countdown-items',
        '.eael-countdown-wrapper',
        '.elementor-countdown',
        '[class*="countdown"]',
        '[data-date]',
        '[data-countdown-date]',
        '[id*="countdown"]',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const dataDate =
            el.getAttribute('data-date') ||
            el.getAttribute('data-countdown-date') ||
            el.getAttribute('data-due-date') ||
            el.closest('[data-date]')?.getAttribute('data-date') ||
            el.querySelector('[data-date]')?.getAttribute('data-date');

          const text = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || '';

          const dayMatch = text.match(/(\d+)\s*(?:Days|d)/i);
          const hourMatch = text.match(/(\d+)\s*(?:Hours|h)/i);
          const minMatch = text.match(/(\d+)\s*(?:Min|m)/i);
          const secMatch = text.match(/(\d+)\s*(?:Sec|s)/i);

          if (dataDate || dayMatch || hourMatch) {
            return {
              found: true,
              dataDate: dataDate || null,
              text: text.slice(0, 120),
              days: dayMatch ? parseInt(dayMatch[1], 10) : null,
              hours: hourMatch ? parseInt(hourMatch[1], 10) : null,
              minutes: minMatch ? parseInt(minMatch[1], 10) : null,
              seconds: secMatch ? parseInt(secMatch[1], 10) : null,
            };
          }
        }
      }

      return { found: false };
    });

    if (!timerData.found) {
      return {
        isPresent: false,
        status: 'NOT_PRESENT',
        message: 'No countdown timer present on page',
      };
    }

    const now = new Date();
    const dataDate = timerData.dataDate;

    if (dataDate) {
      const targetTime = new Date(dataDate).getTime();
      const currentTime = now.getTime();
      const diffMs = targetTime - currentTime;

      if (!isNaN(targetTime)) {
        if (diffMs <= 0) {
          return {
            isPresent: true,
            targetDateStr: dataDate,
            rawText: timerData.text,
            isExpired: true,
            isMatched: false,
            status: 'EXPIRED',
            message: `Countdown timer target date (${dataDate}) has expired relative to current time (${now.toLocaleString('en-IN')}).`,
          };
        }

        const expectedTotalHours = Math.floor(diffMs / (1000 * 60 * 60));
        const expectedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const expectedHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const expectedMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        const displayedDays = timerData.days;
        const displayedHours = timerData.hours;

        // Stuck at zeros while target is in the future
        if (displayedDays === 0 && displayedHours === 0 && timerData.minutes === 0 && timerData.seconds === 0 && expectedTotalHours > 1) {
          return {
            isPresent: true,
            targetDateStr: dataDate,
            rawText: timerData.text,
            isMatched: false,
            status: 'MISMATCH',
            message: `Countdown timer is stuck at 00:00:00:00! Target is ${dataDate} (expected remaining: ${expectedDays}d ${expectedHours}h ${expectedMins}m).`,
          };
        }

        let isMatch = true;
        if (displayedDays !== null && Math.abs(displayedDays - expectedDays) > 1) {
          isMatch = false;
        }
        if (displayedDays === 0 && displayedHours !== null && Math.abs(displayedHours - expectedHours) > 2) {
          isMatch = false;
        }

        if (isMatch) {
          return {
            isPresent: true,
            targetDateStr: dataDate,
            rawText: timerData.text,
            isMatched: true,
            status: 'MATCHED',
            message: `Countdown timer active and matches current time: "${timerData.text}" (Target: ${dataDate})`,
          };
        } else {
          return {
            isPresent: true,
            targetDateStr: dataDate,
            rawText: timerData.text,
            isMatched: false,
            status: 'MISMATCH',
            message: `Countdown timer mismatch! Page displays "${timerData.text}", but expected remaining time from current time is ${expectedDays}d ${expectedHours}h ${expectedMins}m (Target: ${dataDate}).`,
          };
        }
      }
    }

    // Has text/digits without explicit data-date attribute
    const isAllZeros = timerData.days === 0 && timerData.hours === 0 && timerData.minutes === 0 && timerData.seconds === 0;
    if (isAllZeros) {
      return {
        isPresent: true,
        rawText: timerData.text,
        isExpired: true,
        isMatched: false,
        status: 'EXPIRED',
        message: `Countdown timer has expired or stopped at 00:00:00 (${timerData.text}).`,
      };
    }

    return {
      isPresent: true,
      rawText: timerData.text,
      isMatched: true,
      status: 'MATCHED',
      message: `Countdown timer is actively running on page: "${timerData.text}".`,
    };
  } catch (err: any) {
    return {
      isPresent: false,
      status: 'NOT_PRESENT',
      message: 'Could not inspect countdown timer',
    };
  }
}

/**
 * Single Playwright audit run across the website:
 * 1. Crawls website pages (up to 6 internal pages).
 * 2. Identifies all payment buttons on each page.
 * 3. Safely clicks each button in Playwright to capture the complete Razorpay redirect URL.
 * 4. Compares complete Razorpay URLs across all buttons:
 *    - flags redirecting to another domain
 *    - flags failed to redirect
 *    - flags different payment URLs
 * 5. Checks countdown timer and verifies it matches current time.
 */
export async function auditPageOnce(
  url: string,
  expectedRazorpayLink: string,
  pageName?: string,
  options?: { singlePageOnly?: boolean }
): Promise<PageAuditResult> {
  const startTime = Date.now();
  let browser: Browser | null = null;
  const expectedSlug = extractRazorpaySlug(expectedRazorpayLink);

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebCrawlerAuditor/1.0',
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    const mainPage = await context.newPage();
    mainPage.on('pageerror', (err) => {
      console.warn(`[PageScript Note on ${url}]:`, err.message);
    });

    let initialStatusCode: number | null = null;
    let initialStatusText = '';
    let isAvailable = false;
    const errors: string[] = [];

    // Capture main document response status
    mainPage.on('response', (response) => {
      if (response.url() === url || response.request().isNavigationRequest()) {
        if (initialStatusCode === null) {
          initialStatusCode = response.status();
          initialStatusText = response.statusText();
        }
      }
    });

    try {
      const navigationResponse = await mainPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });

      if (navigationResponse) {
        initialStatusCode = navigationResponse.status();
        initialStatusText = navigationResponse.statusText();
        isAvailable = true;
      } else {
        isAvailable = true;
        initialStatusCode = initialStatusCode || 200;
        initialStatusText = initialStatusText || 'OK';
      }
    } catch (navErr: any) {
      console.warn(`[Playwright] Navigation issue on ${url}:`, navErr.message);
      isAvailable = false;
      initialStatusCode = null;
      initialStatusText = navErr.message || 'Page Not Available';
      errors.push(`Page is not reachable or timed out: ${initialStatusText}`);
    }

    const loadTimeMs = Date.now() - startTime;
    const isStatusValid = initialStatusCode === 200 || initialStatusCode === 301;

    if (isAvailable && !isStatusValid) {
      errors.push(
        `Invalid HTTP status code: ${initialStatusCode} ${initialStatusText}. Acceptable codes: 200 or 301.`
      );
    }

    const allButtons: ButtonAudit[] = [];
    let crawledPages: string[] = [url];
    let countdownTimer: CountdownAudit = {
      isPresent: false,
      status: 'NOT_PRESENT',
      message: 'No countdown timer present on page',
    };

    if (isAvailable) {
      // Check countdown timer on the page and verify if it matches current time
      countdownTimer = await auditCountdownTimer(mainPage);
      if (countdownTimer.isPresent && !countdownTimer.isMatched) {
        if (!errors.includes(countdownTimer.message)) {
          errors.push(countdownTimer.message);
        }
      }

      // 1. Discover internal website pages (or audit single page only)
      if (options?.singlePageOnly) {
        crawledPages = [url];
        console.log(`[Crawler] Single page inspection mode: checking only ${url}`);
      } else {
        crawledPages = await discoverInternalPages(mainPage, url, 6);
        console.log(`[Crawler] Discovered ${crawledPages.length} website page(s) to audit:`, crawledPages);
      }

      // 2. Iterate through each page on the website to find and safely click payment buttons
      for (const targetPageUrl of crawledPages) {
        try {
          const scanPage = targetPageUrl === url ? mainPage : await context.newPage();
          if (targetPageUrl !== url) {
            scanPage.on('pageerror', (err) => {
              console.warn(`[PageScript Note on ${targetPageUrl}]:`, err.message);
            });
            await scanPage.goto(targetPageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }

          // Extract candidate buttons from DOM
          const extractedList = await scanPage.evaluate((currentPageUrl) => {
            const results: Array<{
              text: string;
              tag: string;
              targetUrl: string;
              selector: string;
              elementIndex: number;
              isPaymentKeyword: boolean;
            }> = [];

            const candidates = document.querySelectorAll(
              'button, [role="button"], input[type="button"], input[type="submit"], a, .btn, .button, .cta'
            );

            candidates.forEach((el, index) => {
              const htmlEl = el as HTMLElement;
              const tag = el.tagName.toLowerCase();
              const text = (
                htmlEl.innerText ||
                htmlEl.getAttribute('aria-label') ||
                htmlEl.getAttribute('value') ||
                htmlEl.getAttribute('title') ||
                ''
              ).trim();

              let targetUrl =
                htmlEl.getAttribute('href') ||
                htmlEl.getAttribute('data-href') ||
                '';

              if (!targetUrl && tag === 'button') {
                const form = htmlEl.closest('form');
                if (form) {
                  targetUrl = form.getAttribute('action') || '';
                }
              }

              const onclick = htmlEl.getAttribute('onclick') || '';
              if (!targetUrl && onclick) {
                const match = onclick.match(/window\.open\(['"]([^'"]+)['"]\)|location\.href\s*=\s*['"]([^'"]+)['"]/);
                if (match && (match[1] || match[2])) {
                  targetUrl = match[1] || match[2];
                }
              }

              if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('javascript:')) {
                try {
                  targetUrl = new URL(targetUrl, window.location.href).href;
                } catch {
                  // ignore
                }
              }

              const className = typeof htmlEl.className === 'string' ? htmlEl.className : '';
              const isExplicitButton =
                tag === 'button' ||
                htmlEl.getAttribute('role') === 'button' ||
                tag === 'input';
              const hasButtonClass = /btn|button|cta/i.test(className);
              const mentionsRazorpay =
                targetUrl.toLowerCase().includes('razorpay') ||
                targetUrl.toLowerCase().includes('rzp.io');
              const mentionsAction = /pay|buy|checkout|order|subscribe|enroll|cart|proceed|register|join|get\s*access|claim|book|purchase|invest/i.test(text);

              // Filter out metadata and social non-payment links
              const isSocialOrNonPayment =
                /instagram\.com|facebook\.com|twitter\.com|x\.com|youtube\.com|linkedin\.com|whatsapp\.com|tel:|mailto:|javascript:void/i.test(targetUrl);

              if (isSocialOrNonPayment) return;

              // Identify true payment button candidates:
              // 1. Directly mentions razorpay or rzp.io
              // 2. OR CTA with payment/action keywords (pay, buy, register, join, book, enroll, checkout)
              // 3. OR explicit button/submit with a valid destination
              const isPaymentCandidate =
                mentionsRazorpay ||
                (mentionsAction && (isExplicitButton || hasButtonClass || tag === 'a')) ||
                (isExplicitButton && targetUrl && !targetUrl.startsWith('#') && targetUrl !== 'javascript:;');

              if (isPaymentCandidate) {
                results.push({
                  text: text.slice(0, 100),
                  tag,
                  targetUrl,
                  selector: className ? `.${className.split(' ')[0]}` : tag,
                  elementIndex: index,
                  isPaymentKeyword: mentionsAction || mentionsRazorpay,
                });
              }
            });

            return results;
          }, targetPageUrl);

          // 3. For each button on this page, safely click and capture destination redirect
          for (const item of extractedList) {
            const clickResult = await safelyClickAndCaptureRedirect(
              context,
              targetPageUrl,
              item.elementIndex,
              item.targetUrl
            );

            const finalUrl = clickResult.redirectedUrl;
            const finalLower = finalUrl.toLowerCase();

            // Evaluate redirection type:
            const isRazorpayDomain =
              finalLower.includes('pages.razorpay.com') ||
              finalLower.includes('rzp.io') ||
              finalLower.includes('razorpay.com');

            const hasValidRedirect =
              clickResult.clickSuccess &&
              finalUrl &&
              finalUrl !== '#' &&
              !finalUrl.startsWith('javascript:') &&
              finalUrl !== 'No destination URL';

            let redirectStatus: 'MATCH' | 'DIFFERENT_PAYMENT_URL' | 'WRONG_DOMAIN' | 'FAILED_TO_REDIRECT' = 'MATCH';
            let issue: string | undefined;

            if (!hasValidRedirect) {
              redirectStatus = 'FAILED_TO_REDIRECT';
              issue = `Button "${item.text || item.tag}" on ${targetPageUrl} failed to redirect (no destination or dead click).`;
            } else if (!isRazorpayDomain) {
              redirectStatus = 'WRONG_DOMAIN';
              issue = `Button "${item.text || item.tag}" on ${targetPageUrl} redirects to another domain: "${finalUrl}" (Expected: https://pages.razorpay.com/).`;
            } else {
              // Check slug match if expected is specified
              const matchesSlug = isRazorpayMatch(finalUrl, expectedRazorpayLink);
              if (!matchesSlug && expectedSlug) {
                redirectStatus = 'DIFFERENT_PAYMENT_URL';
                issue = `Button "${item.text || item.tag}" on ${targetPageUrl} redirects to a different Razorpay URL: "${finalUrl}" (Expected slug: ${expectedSlug}).`;
              }
            }

            allButtons.push({
              id: `btn-${allButtons.length}-${Date.now()}`,
              text: item.text || `[${item.tag.toUpperCase()}]`,
              tag: item.tag,
              selector: item.selector,
              pageUrl: targetPageUrl,
              targetUrl: item.targetUrl || 'No static href',
              redirectedUrl: finalUrl,
              expectedUrl: expectedRazorpayLink,
              clickVerified: clickResult.clickSuccess,
              isRazorpayMatch: redirectStatus === 'MATCH',
              redirectStatus,
              issue,
            });
          }

          if (targetPageUrl !== url) {
            await scanPage.close().catch(() => {});
          }
        } catch (pageErr: any) {
          console.warn(`[Crawler] Error auditing page ${targetPageUrl}:`, pageErr.message);
        }
      }
    }

    await browser.close().catch(() => {});
    browser = null;

    // 4. Button Redirection Consistency & Razorpay Comparison:
    const anyFailedRedirect = allButtons.filter((b) => b.redirectStatus === 'FAILED_TO_REDIRECT');

    // Count how many buttons redirected to a Razorpay domain
    const razorpayButtons = allButtons.filter((b) => {
      if (!b.redirectedUrl) return false;
      const lower = b.redirectedUrl.toLowerCase();
      return lower.includes('pages.razorpay.com') || lower.includes('rzp.io') || lower.includes('razorpay.com');
    });

    let isOtherSamePageRedirection = false;
    let otherRedirectUrl: string | undefined = undefined;
    let consensusRazorpayUrl = '';
    let matchedRazorpayLink: string | undefined = undefined;

    let differentUrlsCount = 0;
    let failedRedirectsCount = anyFailedRedirect.length;
    let wrongDomainCount = 0;

    if (allButtons.length > 0) {
      if (razorpayButtons.length === 0) {
        // CASE: None of the buttons on this page redirect to Razorpay
        // User rule: Check if all buttons redirect to the same page.
        // If they do: it's not an error -> add the redirected link in the mail as "other same page redirection"
        // If they do not: only then trigger an error!
        const validRedirects = allButtons.filter((b) => b.redirectedUrl && b.redirectedUrl.startsWith('http'));
        const hasFailedClicks = allButtons.some((b) => b.redirectStatus === 'FAILED_TO_REDIRECT');
        const uniqueDestUrls = Array.from(new Set(validRedirects.map((b) => normalizeUrl(b.redirectedUrl!))));

        if (!hasFailedClicks && uniqueDestUrls.length === 1 && validRedirects.length === allButtons.length) {
          // ALL buttons on this page redirect to the EXACT same page!
          isOtherSamePageRedirection = true;
          otherRedirectUrl = validRedirects[0].redirectedUrl;

          allButtons.forEach((btn) => {
            btn.redirectStatus = 'SAME_PAGE_REDIRECTION';
            btn.isRazorpayMatch = true;
            btn.isConsistent = true;
            btn.issue = undefined;
          });
        } else {
          // Buttons either failed to redirect or redirect to DIFFERENT destinations!
          allButtons.forEach((btn) => {
            if (btn.redirectStatus === 'FAILED_TO_REDIRECT') {
              btn.isConsistent = false;
            } else {
              differentUrlsCount++;
              btn.redirectStatus = 'DIFFERENT_PAYMENT_URL';
              btn.isConsistent = false;
              btn.isRazorpayMatch = false;
              btn.issue = `Destination Discrepancy: Button "${btn.text}" redirects to "${btn.redirectedUrl}", which is different from other buttons on this page (${uniqueDestUrls.join(', ')}).`;
            }

            if (btn.issue && !errors.includes(btn.issue)) {
              errors.push(btn.issue);
            }
          });
        }
      } else {
        // CASE: Page has Razorpay button(s)
        const validRazorpayUrls = razorpayButtons.map((b) => normalizeUrl(b.redirectedUrl!));
        const frequencyMap: Record<string, number> = {};
        for (const rUrl of validRazorpayUrls) {
          frequencyMap[rUrl] = (frequencyMap[rUrl] || 0) + 1;
        }

        consensusRazorpayUrl = expectedSlug && expectedRazorpayLink?.startsWith('http') ? normalizeUrl(expectedRazorpayLink) : '';
        let maxFreq = 0;
        for (const [rUrl, freq] of Object.entries(frequencyMap)) {
          if (freq > maxFreq) {
            maxFreq = freq;
            if (!expectedSlug || !consensusRazorpayUrl) {
              consensusRazorpayUrl = rUrl;
            }
          }
        }

        allButtons.forEach((btn) => {
          if (btn.redirectStatus === 'FAILED_TO_REDIRECT') {
            btn.isConsistent = false;
          } else if (btn.redirectStatus === 'WRONG_DOMAIN') {
            wrongDomainCount++;
            btn.isConsistent = false;
          } else if (consensusRazorpayUrl && btn.redirectedUrl) {
            const normBtnUrl = normalizeUrl(btn.redirectedUrl);
            const sameSlug = extractRazorpaySlug(normBtnUrl) === extractRazorpaySlug(consensusRazorpayUrl);
            const exactMatch = normBtnUrl === consensusRazorpayUrl || sameSlug;

            if (!exactMatch) {
              differentUrlsCount++;
              btn.redirectStatus = 'DIFFERENT_PAYMENT_URL';
              btn.isRazorpayMatch = false;
              btn.isConsistent = false;
              btn.issue = `Payment URL Discrepancy: Button redirects to "${btn.redirectedUrl}" instead of main Razorpay URL "${consensusRazorpayUrl}".`;
            } else {
              btn.isConsistent = true;
            }
          } else {
            btn.isConsistent = true;
          }

          if (btn.issue && !errors.includes(btn.issue)) {
            errors.push(btn.issue);
          }
        });

        const allButtonsMatched = allButtons.length > 0 && allButtons.every((b) => b.isRazorpayMatch && b.isConsistent !== false);
        if (allButtonsMatched) {
          matchedRazorpayLink = consensusRazorpayUrl || expectedRazorpayLink;
        }
      }
    }

    const matchingButtonsCount = allButtons.filter((b) => (b.isRazorpayMatch || b.redirectStatus === 'SAME_PAGE_REDIRECTION') && b.isConsistent !== false).length;
    const mismatchButtonsCount = allButtons.length - matchingButtonsCount;
    const noButtonsAvailable = allButtons.length === 0;
    const buttonStatusMessage = noButtonsAvailable
      ? 'No button available'
      : isOtherSamePageRedirection
      ? `other same page redirection: ${otherRedirectUrl}`
      : undefined;

    let summary: 'PASS' | 'WARNING' | 'FAIL' = 'PASS';
    if (!isAvailable || !isStatusValid || failedRedirectsCount > 0 || wrongDomainCount > 0) {
      summary = 'FAIL';
    } else if (differentUrlsCount > 0 || mismatchButtonsCount > 0 || errors.length > 0) {
      summary = 'WARNING';
    }

    return {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      url,
      pageName,
      checkedAt: new Date().toISOString(),
      isAvailable,
      statusCode: initialStatusCode,
      statusText: initialStatusText,
      isStatusValid,
      loadTimeMs,
      expectedRazorpayLink,
      expectedSlug,
      primaryRazorpayUrl: consensusRazorpayUrl || expectedRazorpayLink,
      matchedRazorpayLink,
      isOtherSamePageRedirection,
      otherRedirectUrl,
      countdownTimer,
      crawledPages,
      totalButtonsFound: allButtons.length,
      matchingButtonsCount,
      mismatchButtonsCount,
      noButtonsAvailable,
      buttonStatusMessage,
      differentUrlsCount,
      failedRedirectsCount,
      wrongDomainCount,
      buttons: allButtons,
      errors,
      summary,
    };
  } catch (err: any) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
    console.error(`[Playwright] Exception during multi-page crawl on ${url}:`, err);
    throw err;
  }
}

/**
 * Main Audit Page with Double-Check Retry Mechanism:
 * - Runs initial check (Attempt 1).
 * - If check fails (status not 200/301, page down, or buttons mismatch):
 *   - Runs retry every 10 seconds.
 *   - If still failing after 30 seconds (3 retries), triggers confirmed error!
 */
export async function auditPage(
  url: string,
  expectedRazorpayLink: string,
  pageName?: string,
  options?: { singlePageOnly?: boolean }
): Promise<PageAuditResult> {
  const retryLogs: string[] = [];

  // Attempt 1 (Initial)
  const firstAttempt = await auditPageOnce(url, expectedRazorpayLink, pageName, options);

  const isFirstPassing =
    firstAttempt.isAvailable &&
    firstAttempt.isStatusValid &&
    firstAttempt.mismatchButtonsCount === 0 &&
    firstAttempt.errors.length === 0;

  if (isFirstPassing) {
    let successMsg = 'Check passed on initial attempt.';
    if (firstAttempt.noButtonsAvailable) {
      successMsg = 'Check passed: HTTP 200 OK. No button available on page.';
    } else if (firstAttempt.isOtherSamePageRedirection) {
      successMsg = `Check passed: HTTP 200 OK. other same page redirection (${firstAttempt.otherRedirectUrl}).`;
    }

    return {
      ...firstAttempt,
      retryCount: 0,
      retryLogs: [successMsg],
      finalErrorTriggered: false,
    };
  }

  // Attempt 1 failed -> Begin 10s retry loop up to 30s
  const initialIssue = firstAttempt.errors.slice(0, 2).join('; ') || 'Issues detected on page';
  retryLogs.push(`[Attempt 1 - 0s] Initial check failed: ${initialIssue}. Initiating double-check retry loop (every 10s up to 30s)...`);
  console.warn(`[Retry Engine] ${url} failed initial check: ${initialIssue}. Double-checking in 10s...`);

  let lastResult = firstAttempt;
  const RETRY_INTERVAL_MS = 10000; // 10 seconds
  const MAX_RETRIES = 3; // 10s, 20s, 30s

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const elapsedSeconds = attempt * 10;

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));

    console.log(`[Retry Engine] Running Retry Attempt ${attempt} at ${elapsedSeconds}s for ${url}...`);
    try {
      const retryResult = await auditPageOnce(url, expectedRazorpayLink, pageName, options);

      const isRetryPassing =
        retryResult.isAvailable &&
        retryResult.isStatusValid &&
        retryResult.mismatchButtonsCount === 0 &&
        retryResult.errors.length === 0;

      if (isRetryPassing) {
        retryLogs.push(`[Retry ${attempt} - ${elapsedSeconds}s] SUCCESS: Double-check passed! Page recovered.`);
        console.log(`[Retry Engine] ${url} recovered successfully on Retry ${attempt} (${elapsedSeconds}s)!`);

        return {
          ...retryResult,
          retryCount: attempt,
          retryLogs,
          finalErrorTriggered: false,
          summary: 'PASS',
          errors: [],
        };
      }

      const retryIssue = retryResult.errors.slice(0, 2).join('; ') || 'Still failing';
      retryLogs.push(`[Retry ${attempt} - ${elapsedSeconds}s] Failed: ${retryIssue}`);
      lastResult = retryResult;
    } catch (retryErr: any) {
      retryLogs.push(`[Retry ${attempt} - ${elapsedSeconds}s] Error during execution: ${retryErr.message}`);
    }
  }

  // 30 seconds elapsed (3 retries completed) -> Error is officially triggered!
  retryLogs.push(`[Final - 30s] 30-second double-check timer expired. Confirmed error triggered for report & email.`);
  console.error(`[Retry Engine] ${url} failed all retries over 30s. Final error triggered!`);

  lastResult.errors.push(`Double-check retry failed: Page still had errors after 3 retries over 30 seconds.`);
  lastResult.summary = !lastResult.isAvailable || (lastResult.statusCode !== null && lastResult.statusCode >= 400) ? 'FAIL' : 'WARNING';

  return {
    ...lastResult,
    retryCount: MAX_RETRIES,
    retryLogs,
    finalErrorTriggered: true,
  };
}
