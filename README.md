# Web Crawler & Razorpay Payment Link Health Auditor

An automated Next.js web crawler and link auditing platform powered by **Playwright**, **Resend**, and **Vercel Cron Jobs**.

---

## 🌟 Key Features

1. **Automated Playwright Web Crawler**:
   - Launches headless Chromium to navigate to target URLs.
   - Evaluates HTTP response codes: **Strictly flags any status code other than `200` or `301`** (such as 404 Not Found, 500 Server Error, 403 Forbidden, 502/503).
   - Detects connection drops, DNS lookup failures, timeouts, and page unreachability.
   - Evaluates all button elements (`<button>`, `[role="button"]`, `<a class="btn">`, payment forms, and action CTAs).

2. **Smart Razorpay Redirection & Slug Matching**:
   - **All buttons on the page must redirect to the Razorpay link.**
   - **No full payment link required**: You can specify just the slug (e.g. `pl_O3Xy123` or `my-course`) or the full URL (`https://pages.razorpay.com/pl_O3Xy123` or `https://rzp.io/l/my-course`).
   - If the button redirects to Razorpay and the slug matches, it is recognized as a valid **MATCH**.

3. **10-Second Double-Check Retry Mechanism (30s Error Threshold)**:
   - To eliminate false alarms caused by temporary network blips:
     - **Attempt 1 (0s):** Initial check. If passing, completes immediately.
     - **Retry 1 (10s):** If initial check fails, re-tests after 10 seconds.
     - **Retry 2 (20s):** Re-tests after 20 seconds.
     - **Final Error Trigger (30s):** If the page still has errors after 30 seconds of retries, the confirmed error is officially triggered for reports and email alerts!

4. **Twice-Daily Automated Test Reports (Vercel Cron @ 9:00 AM & 9:00 PM)**:
   - Configured via [`vercel.json`](file:///c:/JAYESH/React/Project1/vercel.json) with schedule `30 3,15 * * *` (09:00 AM & 09:00 PM Indian Standard Time / 03:30 & 15:30 UTC).
   - Automatically crawls all active monitored pages twice every day.
   - Dispatches a detailed HTML audit report via Resend.

5. **Email Reports with Resend**:
   - Formatted HTML email sent to **`jayeshchoudharyy@gmail.com`**.
   - Includes summary metrics (Total Pages, Healthy Pages, Error Pages, Valid Razorpay Buttons).
   - Page-by-page breakdown table showing each button's label, destination URL, match status, and retry double-check logs.

6. **User-Friendly Dashboard**:
   - **Interactive Live Auditor**: Test any URL on the fly, with auto-save to monitored pages.
   - **Monitored Pages Directory**: Always-visible add bar and high-contrast table/cards showing status, button counts, and quick actions.
   - **Audit Reports History**: Browse previous test logs, review button-by-button breakdowns, and inspect error logs.
   - **Setup & Automation Guide**: Step-by-step instructions for Vercel Cron and Resend API key setup.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Edit `.env.local`:
```env
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM="Web Crawler <onboarding@resend.dev>"
CRON_SECRET=
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⏰ Vercel Cron Configuration (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "30 3,15 * * *"
    }
  ]
}
```

- `30 3,15 * * *`: Runs twice daily at **9:00 AM & 9:00 PM IST (03:30 & 15:30 UTC)**.
