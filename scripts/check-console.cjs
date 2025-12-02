const playwright = require('playwright');
const DEFAULT_URL = process.env.URL || 'http://localhost:5173/';
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 10000);
const STARTUP_TIMEOUT_MS = Number(process.env.STARTUP_TIMEOUT_MS || 30000);

async function runOnce() {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  const consoleMsgs = [];
  page.on('console', msg => {
    consoleMsgs.push({ type: 'console', text: msg.text() });
  });
  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });
  try {
    await page.goto(DEFAULT_URL, { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    // Give the page some time for client JS to run
    await page.waitForTimeout(1500);
    // Try navigating the UI to the "Master Sheet" nav item and click to show the grid
    try {
      // click Admin toggle first (if visible) to gain access to admin dashboard
      const adminBtn = await page.$("text=Admin");
      if (adminBtn) {
        await adminBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
      // Debug: find menu items with 'Master' and click the first one.
      const masters = await page.$$("xpath=//text()[contains(., 'Master')]/.. | //*[text()[contains(., 'Master')]]");
      console.log('[check-console] Found master nav elements count', masters.length);
      if (masters.length) {
        try { await masters[0].click({ timeout: 2000 }); } catch {};
        await page.waitForTimeout(1200);
      }
    } catch (x) { console.error('[check-console] click navigation failed', x?.message || x); }
    const agRoots = await page.$$('.ag-root');
    console.log('[check-console] AG grid roots found:', agRoots.length);
    console.log('[check-console] Console messages:');
    consoleMsgs.forEach(m => console.log(m.type, m.text));
    console.log('[check-console] Page errors:', pageErrors);
  } catch (e) {
    console.error('[check-console] Error when loading page:', e.message || e);
    throw e;
  } finally {
    await browser.close();
  }
}

// Wrap with a full start-up timeout in case the server never becomes available
(async () => {
  const start = Date.now();
  const deadline = start + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await runOnce();
      process.exit(0);
    } catch (e) {
      // Wait a bit and try again until the deadline
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  console.error('[check-console] Server did not respond within the timeout window.');
  process.exit(2);
})();
