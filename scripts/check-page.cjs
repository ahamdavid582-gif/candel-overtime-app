const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const out = { console: [] };
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', msg => {
    out.console.push({ type: msg.type(), text: msg.text() });
    console.log(`PAGE LOG [${msg.type()}]: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    out.console.push({ type: 'pageerror', text: err.message });
    console.error('PAGE ERROR:', err);
  });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const ssPath = 'dist/debug-screenshot.png';
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log('Screenshot saved to', ssPath);
  } catch (e) {
    console.error('Navigation failed', e);
    out.console.push({ type: 'error', text: 'navigationFailed: ' + (e.message || e) });
  } finally {
    await browser.close();
    fs.writeFileSync('dist/debug-console.json', JSON.stringify(out, null, 2));
    console.log('Console log written to dist/debug-console.json');
  }
})();
