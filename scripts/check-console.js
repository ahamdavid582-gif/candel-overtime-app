const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
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
    await page.goto('http://localhost:5174');
    // wait a bit for JS to run
    await page.waitForTimeout(3000);
    console.log('Console messages:');
    consoleMsgs.forEach(m => console.log(m.type, m.text));
    console.log('Page errors:', pageErrors);
  } catch (e) {
    console.error('Error when loading page:', e);
  } finally {
    await browser.close();
  }
})();
