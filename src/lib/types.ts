export interface CountdownAudit {
  isPresent: boolean;
  status: 'MATCHED' | 'MISMATCH' | 'EXPIRED' | 'NOT_PRESENT';
  rawText?: string;
  targetDateStr?: string;
  isMatched?: boolean;
  isExpired?: boolean;
  message: string;
}

export interface TargetPage {
  id: string;
  name: string;
  url: string;
  expectedRazorpayLink: string;
  isActive: boolean;
  crawlAllPages?: boolean;
  lastCheckedAt?: string;
  lastStatus?: number | null;
  lastSummary?: 'PASS' | 'WARNING' | 'FAIL';
  lastButtonsCount?: number;
  lastMatchingCount?: number;
  lastLoadTimeMs?: number;
  lastCountdownStatus?: string;
  isEnvConfigured?: boolean;
  createdAt: string;
}

export interface ButtonAudit {
  id: string;
  text: string;
  tag: string;
  selector?: string;
  pageUrl?: string;
  targetUrl: string; // static or href target
  redirectedUrl?: string; // actual destination after safe click/redirection
  expectedUrl: string;
  clickVerified?: boolean; // true if safely clicked via Playwright
  isRazorpayMatch: boolean;
  redirectStatus?: 'MATCH' | 'DIFFERENT_PAYMENT_URL' | 'WRONG_DOMAIN' | 'FAILED_TO_REDIRECT' | 'SAME_PAGE_REDIRECTION';
  isConsistent?: boolean; // matches consensus complete Razorpay URL or same page URL across all buttons
  issue?: string;
}

export interface PageAuditResult {
  id: string;
  url: string;
  pageName?: string;
  checkedAt: string;
  isAvailable: boolean;
  statusCode: number | null;
  statusText: string;
  isStatusValid: boolean; // only 200 and 301 are considered valid
  loadTimeMs: number;
  expectedRazorpayLink: string;
  expectedSlug?: string;
  primaryRazorpayUrl?: string; // complete verified Razorpay URL
  matchedRazorpayLink?: string; // explicit matched Razorpay link sent to developer email
  isOtherSamePageRedirection?: boolean; // true when buttons do not go to Razorpay but all go to the same page
  otherRedirectUrl?: string; // destination URL for other same page redirection
  countdownTimer?: CountdownAudit; // countdown timer audit result
  crawledPages?: string[]; // all website pages crawled
  totalButtonsFound: number;
  matchingButtonsCount: number;
  mismatchButtonsCount: number;
  noButtonsAvailable?: boolean;
  buttonStatusMessage?: string; // e.g. "No button available" or "other same page redirection"
  differentUrlsCount?: number;
  failedRedirectsCount?: number;
  wrongDomainCount?: number;
  buttons: ButtonAudit[];
  errors: string[];
  summary: 'PASS' | 'WARNING' | 'FAIL';
  retryCount?: number; // 0 if passed initially, 1-3 if retried
  retryLogs?: string[];
  finalErrorTriggered?: boolean; // true after 30s failure
}

export interface AuditReport {
  id: string;
  timestamp: string;
  trigger: 'cron' | 'manual';
  totalPages: number;
  passedPages: number;
  failedPages: number;
  hasErrors: boolean;
  recipientEmail: string;
  emailSent: boolean;
  emailError?: string;
  results: PageAuditResult[];
}

export interface AppSettings {
  recipientEmail: string;
  defaultRazorpayLink: string;
  cronSecret?: string;
  scheduleDescription: string;
  automationEnabled?: boolean;
  automationsPerDay?: number;
  automationTimes?: string[];
  timezone?: string;
}

export interface SelfCronState {
  isActive: boolean;
  schedule: string;
  timezone: string;
  scheduleDescription: string;
  automationTimes?: string[];
  automationsPerDay?: number;
  nextRunIST: string;
  nextRunISO: string;
  lastRunAt?: string;
  lastTrigger?: 'cron' | 'manual';
  lastDurationMs?: number;
  lastSummary?: 'PASS' | 'WARNING' | 'FAIL' | 'NO_PAGES';
  lastTotalPages?: number;
  lastPassedPages?: number;
  lastFailedPages?: number;
  lastEmailSent?: boolean;
  lastEmailRecipient?: string;
  lastEmailError?: string;
  isRunning?: boolean;
}

