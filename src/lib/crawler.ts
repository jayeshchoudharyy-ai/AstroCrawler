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
        await popup.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
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

    // Navigate to page (10s request timeout)
    await clickPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Locate candidate buttons on the page
    const buttons = clickPage.locator(
      'button, [role="button"], input[type="button"], input[type="submit"], a, .btn, .button, .cta'
    );
    const count = await buttons.count();
    let clickCompleted = false;

    if (buttonIndex < count) {
      const targetBtn = buttons.nth(buttonIndex);

      // Perform safe click (5s timeout)
      await Promise.race([
        targetBtn.click({ timeout: 5000 }).then(() => {
          clickCompleted = true;
        }),
        new Promise((resolve) => setTimeout(resolve, 5100)),
      ]).catch(() => {});

      // Short wait to catch dynamic JS redirects
      await clickPage.waitForTimeout(800);

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

    if (clickCompleted && fallbackTargetUrl && fallbackTargetUrl.startsWith('http')) {
      return {
        redirectedUrl: fallbackTargetUrl,
        clickSuccess: true,
        method: 'Click Verified + Static Target',
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
 * Parses a countdown target date string with timezone awareness.
 * If no explicit timezone is present, evaluates both IST (+05:30) and UTC so UTC cloud servers
 * (e.g. Render) do not produce false timezone mismatch errors on IST landing pages.
 */
function parseTargetDateCandidates(dataDate: string): number[] {
  const trimmed = dataDate.trim();
  const hasExplicitTz = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC|IST)$/i.test(trimmed);
  const candidates: number[] = [];

  const direct = new Date(trimmed).getTime();
  if (!isNaN(direct)) {
    candidates.push(direct);
  }

  if (!hasExplicitTz) {
    // Try parsing as IST (+05:30) if format is YYYY-MM-DD HH:mm(:ss)
    const isoLike = trimmed.replace(' ', 'T');
    const istParsed = new Date(`${isoLike}+05:30`).getTime();
    if (!isNaN(istParsed) && !candidates.includes(istParsed)) {
      candidates.push(istParsed);
    }
  }

  return candidates;
}

/**
 * Checks if a countdown timer is present on the page and verifies that it matches current time.
 * If target date has expired or displayed digits do not match current time, records an error.
 */
export async function auditCountdownTimer(page: Page): Promise<CountdownAudit> {
  try {
    // Wait briefly for client-side JavaScript countdown scripts to hydrate and run
    await page.waitForTimeout(1200);

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
      const targetCandidates = parseTargetDateCandidates(dataDate);
      const currentTime = now.getTime();

      if (targetCandidates.length > 0) {
        // Pick candidate whose expected countdown is closest to displayed digits (or future)
        let bestTargetTime = targetCandidates[0];
        let bestDiffMs = bestTargetTime - currentTime;

        for (const candidateMs of targetCandidates) {
          const diff = candidateMs - currentTime;
          if (diff > 0 && bestDiffMs <= 0) {
            bestTargetTime = candidateMs;
            bestDiffMs = diff;
          } else if (diff > 0 && timerData.hours !== null) {
            const cHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const bHours = Math.floor((bestDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            if (Math.abs(cHours - timerData.hours) < Math.abs(bHours - timerData.hours)) {
              bestTargetTime = candidateMs;
              bestDiffMs = diff;
            }
          }
        }

        const diffMs = bestDiffMs;
        if (diffMs <= 0) {
          return {
            isPresent: true,
            targetDateStr: dataDate,
            rawText: timerData.text,
            isExpired: true,
            isMatched: false,
            status: 'EXPIRED',
            message: `Countdown timer target date (${dataDate}) has expired relative to current time (${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST).`,
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
/**
 * Launches a lightweight headless Chromium instance optimized for low-RAM containers (e.g. Render 512MB).
 */
export async function launchAuditBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--mute-audio',
      '--no-first-run',
    ],
  });
}

const SLOW_LOAD_THRESHOLD_MS = 5000;
const MAIN_NAV_TIMEOUT_MS = 10000; // 10s request timeout
const SUBPAGE_NAV_TIMEOUT_MS = 10000; // 10s subpage request timeout
const MAX_SUBPAGES_TO_CRAWL = 6;
const SUBPAGE_CONCURRENCY = 3;

/**
 * Intelligent page readiness check without waiting for full networkidle:
 * verifies DOM is interactive/complete and main body content is visible.
 */
async function waitForPageReady(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        if (document.readyState === 'loading') return false;
        const body = document.body;
        if (!body) return false;
        const style = window.getComputedStyle(body);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return (body.innerText || '').trim().length > 0 || body.children.length > 0;
      },
      { timeout: 3500 }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Distinguishes temporary retryable errors (network, timeout, 429, 5xx)
 * from permanent errors (invalid URL, 400, 401, 403, 404).
 */
function isRetryableFailure(res: PageAuditResult): boolean {
  if (!res.isAvailable || res.statusCode === null) {
    const reason = (res.statusText || res.errors.join(' ')).toLowerCase();
    if (reason.includes('invalid url') || reason.includes('err_invalid_url')) {
      return false;
    }
    return true;
  }

  const permanentCodes = [400, 401, 403, 404];
  if (permanentCodes.includes(res.statusCode)) {
    return false;
  }

  const retryableCodes = [429, 500, 502, 503, 504];
  if (retryableCodes.includes(res.statusCode)) {
    return true;
  }

  return false;
}

export async function auditPageOnce(
  url: string,
  expectedRazorpayLink: string,
  pageName?: string,
  options?: { singlePageOnly?: boolean; browser?: Browser; maxRetries?: number }
): Promise<PageAuditResult> {
  const startTime = Date.now();
  const ownsBrowser = !options?.browser;
  let browser: Browser | null = options?.browser || null;
  let context: BrowserContext | null = null;
  const expectedSlug = extractRazorpaySlug(expectedRazorpayLink);
  const consoleErrors: string[] = [];

  try {
    // Validate URL format upfront (permanent error if invalid)
    try {
      new URL(url);
    } catch {
      return {
        id: `audit-${Date.now()}`,
        url,
        pageName,
        checkedAt: new Date().toISOString(),
        isAvailable: false,
        statusCode: null,
        statusText: 'Invalid URL format',
        isStatusValid: false,
        loadTimeMs: 0,
        expectedRazorpayLink,
        expectedSlug,
        crawledPages: [url],
        totalButtonsFound: 0,
        matchingButtonsCount: 0,
        mismatchButtonsCount: 0,
        buttons: [],
        errors: [`Invalid URL format: "${url}"`],
        summary: 'FAIL',
        auditStatus: 'FAILED',
        errorCategory: 'NETWORK',
        failureReason: `Invalid URL format: "${url}"`,
        consoleErrors: [],
      };
    }

    if (!browser) {
      browser = await launchAuditBrowser();
    }

    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebCrawlerAuditor/1.0',
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    // Block heavy media/images/fonts to speed up crawls & cut RAM usage by ~70% on Render
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        return route.abort();
      }
      return route.continue();
    });

    const mainPage = await context.newPage();
    mainPage.on('pageerror', (err) => {
      const msg = `Uncaught page error: ${err.message}`;
      consoleErrors.push(msg);
      console.warn(`[PageScript Note on ${url}]:`, err.message);
    });
    mainPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text && !consoleErrors.includes(text)) {
          consoleErrors.push(text.slice(0, 200));
        }
      }
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
        timeout: MAIN_NAV_TIMEOUT_MS,
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

      // Intelligent readiness check (visible body content without waiting for networkidle)
      await waitForPageReady(mainPage);
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

      // 1. Discover internal website pages (max 6 subpages, or single page only)
      if (options?.singlePageOnly) {
        crawledPages = [url];
        console.log(`[Crawler] Single page inspection mode: checking only ${url}`);
      } else {
        crawledPages = await discoverInternalPages(mainPage, url, MAX_SUBPAGES_TO_CRAWL);
        console.log(`[Crawler] Discovered ${crawledPages.length} website page(s) to audit:`, crawledPages);
      }

      // 2. Process discovered pages with controlled concurrency (max 3 concurrently)
      const auditSingleSubpage = async (targetPageUrl: string) => {
        let scanPage: Page | null = null;
        try {
          scanPage = targetPageUrl === url ? mainPage : await context!.newPage();
          if (targetPageUrl !== url) {
            scanPage.on('pageerror', (err) => {
              consoleErrors.push(`Subpage error (${targetPageUrl}): ${err.message}`);
            });
            await scanPage
              .goto(targetPageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: SUBPAGE_NAV_TIMEOUT_MS,
              })
              .catch(() => {});
            await waitForPageReady(scanPage);
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
              context!,
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

          if (targetPageUrl !== url && scanPage) {
            await scanPage.close().catch(() => {});
          }
        } catch (pageErr: any) {
          console.warn(`[Crawler] Error auditing page ${targetPageUrl}:`, pageErr.message);
          if (targetPageUrl !== url && scanPage) {
            await scanPage.close().catch(() => {});
          }
        }
      };

      // Controlled worker pool (max 3 subpages concurrently)
      const queue = [...crawledPages];
      const workers = Array.from(
        { length: Math.min(SUBPAGE_CONCURRENCY, queue.length) },
        async () => {
          while (queue.length > 0) {
            const nextUrl = queue.shift();
            if (nextUrl) {
              await auditSingleSubpage(nextUrl);
            }
          }
        }
      );
      await Promise.all(workers);
    }

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

    const isSlow = isAvailable && isStatusValid && loadTimeMs >= SLOW_LOAD_THRESHOLD_MS;
    const auditStatus: PageAuditResult['auditStatus'] =
      summary === 'FAIL'
        ? 'FAILED'
        : summary === 'WARNING'
        ? 'WARNING'
        : isSlow
        ? 'SLOW'
        : 'PASSED';

    let errorCategory: PageAuditResult['errorCategory'] = 'NONE';
    if (!isAvailable) {
      errorCategory = (initialStatusText || '').toLowerCase().includes('timeout')
        ? 'TIMEOUT'
        : 'NETWORK';
    } else if (!isStatusValid) {
      errorCategory = 'HTTP_ERROR';
    } else if (failedRedirectsCount > 0 || wrongDomainCount > 0 || differentUrlsCount > 0 || mismatchButtonsCount > 0) {
      errorCategory = 'BUTTON_MISMATCH';
    } else if (countdownTimer.isPresent && !countdownTimer.isMatched) {
      errorCategory = 'COUNTDOWN_ERROR';
    } else if (errors.length > 0) {
      errorCategory = 'SCRIPT_ERROR';
    }

    let screenshotBase64: string | undefined;
    if (summary !== 'PASS' && isAvailable && mainPage && !mainPage.isClosed()) {
      try {
        const buf = await mainPage.screenshot({ type: 'jpeg', quality: 45, fullPage: false });
        screenshotBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        // ignore screenshot failure
      }
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
      auditStatus,
      errorCategory,
      failureReason: errors[0],
      consoleErrors: consoleErrors.slice(0, 10),
      screenshotBase64,
    };
  } catch (err: any) {
    console.error(`[Playwright] Exception during multi-page crawl on ${url}:`, err);
    throw err;
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (ownsBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Main Audit Page with Intelligent Retry Mechanism:
 * - Per-request timeout: 10s.
 * - Max 2 retries after initial attempt with 2s and 4s delays.
 * - Max total response/retry budget: 60 seconds per page.
 * - Retries temporary network failures, timeouts, HTTP 429, 500, 502, 503, 504.
 * - Does NOT retry permanent errors (invalid URLs, HTTP 400, 401, 403, 404).
 */
export async function auditPage(
  url: string,
  expectedRazorpayLink: string,
  pageName?: string,
  options?: { singlePageOnly?: boolean; browser?: Browser; maxRetries?: number }
): Promise<PageAuditResult> {
  const auditStartTime = Date.now();
  const TOTAL_BUDGET_MS = 60000; // 60-second response/retry budget per page
  const RETRY_DELAYS_MS = [2000, 4000]; // 2s then 4s
  const MAX_RETRIES = options?.maxRetries ?? 2;

  const retryLogs: string[] = [];

  // Attempt 1 (Initial)
  const firstAttempt = await auditPageOnce(url, expectedRazorpayLink, pageName, options);

  const isFirstPassing =
    firstAttempt.isAvailable &&
    firstAttempt.isStatusValid &&
    firstAttempt.mismatchButtonsCount === 0 &&
    firstAttempt.errors.length === 0;

  if (isFirstPassing) {
    let successMsg =
      firstAttempt.auditStatus === 'SLOW'
        ? `Check passed (Slow load: ${firstAttempt.loadTimeMs}ms).`
        : 'Check passed on initial attempt.';
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

  // Do not retry permanent errors (invalid URL, HTTP 400/401/403/404) or non-network content errors
  const initialIssue = firstAttempt.errors.slice(0, 2).join('; ') || 'Issues detected on page';
  if (MAX_RETRIES === 0 || !isRetryableFailure(firstAttempt)) {
    return {
      ...firstAttempt,
      retryCount: 0,
      retryLogs: [
        `[Attempt 1] Permanent or non-retryable issue (HTTP ${firstAttempt.statusCode ?? 'N/A'}): ${initialIssue}`,
      ],
      finalErrorTriggered: true,
    };
  }

  retryLogs.push(
    `[Attempt 1] Temporary failure: ${initialIssue}. Retrying up to ${MAX_RETRIES} times (2s, 4s delays; 60s max response budget)...`
  );
  console.warn(`[Retry Engine] ${url} failed temporarily: ${initialIssue}. Retrying...`);

  let lastResult = firstAttempt;
  let completedRetries = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 4000;
    const elapsedMs = Date.now() - auditStartTime;
    if (elapsedMs + delayMs >= TOTAL_BUDGET_MS) {
      retryLogs.push(
        `[Budget - 60s] Total response budget reached (${(elapsedMs / 1000).toFixed(1)}s). Stopping retries.`
      );
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    completedRetries = attempt;

    const elapsedSec = ((Date.now() - auditStartTime) / 1000).toFixed(1);
    console.log(`[Retry Engine] Sending Retry ${attempt}/${MAX_RETRIES} at ${elapsedSec}s for ${url}...`);
    try {
      const retryResult = await auditPageOnce(url, expectedRazorpayLink, pageName, options);

      const isRetryPassing =
        retryResult.isAvailable &&
        retryResult.isStatusValid &&
        retryResult.mismatchButtonsCount === 0 &&
        retryResult.errors.length === 0;

      if (isRetryPassing) {
        retryLogs.push(`[Retry ${attempt} - ${elapsedSec}s] SUCCESS: Page recovered.`);
        console.log(`[Retry Engine] ${url} recovered on Retry ${attempt} (${elapsedSec}s)!`);

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
      retryLogs.push(`[Retry ${attempt} - ${elapsedSec}s] Failed: ${retryIssue}`);
      lastResult = retryResult;

      if (!isRetryableFailure(retryResult)) {
        retryLogs.push(`[Retry ${attempt}] Permanent error encountered; stopping further retries.`);
        break;
      }
    } catch (retryErr: any) {
      retryLogs.push(`[Retry ${attempt} - ${elapsedSec}s] Error during execution: ${retryErr.message}`);
    }
  }

  const totalSec = ((Date.now() - auditStartTime) / 1000).toFixed(1);
  retryLogs.push(`[Final - ${totalSec}s] Failed after ${completedRetries} retry attempt(s). Confirmed error triggered.`);
  console.error(`[Retry Engine] ${url} failed after ${completedRetries} retries (${totalSec}s).`);

  lastResult.errors.push(`Request failed after ${completedRetries} retry attempt(s) (${totalSec}s total).`);
  lastResult.summary =
    !lastResult.isAvailable || (lastResult.statusCode !== null && lastResult.statusCode >= 400)
      ? 'FAIL'
      : 'WARNING';
  lastResult.auditStatus = lastResult.summary === 'FAIL' ? 'FAILED' : 'WARNING';
  lastResult.failureReason = lastResult.errors[0];

  return {
    ...lastResult,
    retryCount: completedRetries,
    retryLogs,
    finalErrorTriggered: true,
  };
}

/**
 * Audits multiple monitored targets with controlled concurrency (max 3 concurrently),
 * a single shared Chromium browser, and an execution deadline (default 100s inside 120s API limit).
 * If the deadline is approached, remaining targets are marked SKIPPED so partial results are saved.
 */
export async function auditTargetsWithDeadline(
  targets: Array<{ id: string; url: string; name: string; expectedRazorpayLink?: string }>,
  defaultRazorpayLink: string,
  options?: { concurrency?: number; deadlineMs?: number; maxRetries?: number },
  onTargetCompleted?: (targetId: string, result: PageAuditResult) => Promise<void> | void
): Promise<PageAuditResult[]> {
  const concurrency = options?.concurrency ?? 3;
  const deadlineMs = options?.deadlineMs ?? 100000;
  const maxRetries = options?.maxRetries ?? 2;
  const batchStart = Date.now();

  const results: PageAuditResult[] = [];
  const queue = [...targets];
  const sharedBrowser = await launchAuditBrowser();

  try {
    const worker = async () => {
      while (queue.length > 0) {
        const target = queue.shift();
        if (!target) break;

        if (Date.now() - batchStart >= deadlineMs) {
          results.push({
            id: `audit-skipped-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            url: target.url,
            pageName: target.name,
            checkedAt: new Date().toISOString(),
            isAvailable: false,
            statusCode: null,
            statusText: 'Skipped (Execution deadline approaching)',
            isStatusValid: false,
            loadTimeMs: 0,
            expectedRazorpayLink: target.expectedRazorpayLink || defaultRazorpayLink,
            crawledPages: [target.url],
            totalButtonsFound: 0,
            matchingButtonsCount: 0,
            mismatchButtonsCount: 0,
            buttons: [],
            errors: ['Skipped because execution deadline was approaching; partial audit saved.'],
            summary: 'WARNING',
            auditStatus: 'SKIPPED',
            errorCategory: 'SKIPPED',
            failureReason: 'Execution deadline approaching',
            retryCount: 0,
          });
          continue;
        }

        try {
          const expectedRzp = target.expectedRazorpayLink || defaultRazorpayLink;
          const res = await auditPage(target.url, expectedRzp, target.name, {
            browser: sharedBrowser,
            maxRetries,
          });
          results.push(res);
          if (onTargetCompleted) {
            await onTargetCompleted(target.id, res);
          }
        } catch (err: any) {
          console.error(`[Audit Batch] Error auditing ${target.url}:`, err);
          results.push({
            id: `audit-err-${Date.now()}`,
            url: target.url,
            pageName: target.name,
            checkedAt: new Date().toISOString(),
            isAvailable: false,
            statusCode: null,
            statusText: err.message || 'Audit exception',
            isStatusValid: false,
            loadTimeMs: 0,
            expectedRazorpayLink: target.expectedRazorpayLink || defaultRazorpayLink,
            crawledPages: [target.url],
            totalButtonsFound: 0,
            matchingButtonsCount: 0,
            mismatchButtonsCount: 0,
            buttons: [],
            errors: [err.message || 'Unexpected crawler error'],
            summary: 'FAIL',
            auditStatus: 'FAILED',
            errorCategory: 'NETWORK',
            failureReason: err.message || 'Unexpected crawler error',
            retryCount: 0,
          });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(targets.length, 1)) },
      () => worker()
    );
    await Promise.all(workers);
  } finally {
    await sharedBrowser.close().catch(() => {});
  }

  return results;
}
