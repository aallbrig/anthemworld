const { firefox } = require('playwright');

(async () => {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });
  
  await page.goto('http://localhost:1313/map/');
  await page.waitForTimeout(3000); // Wait for map to load
  
  console.log('=== Console Messages ===');
  consoleMessages.forEach(msg => {
    console.log(`[${msg.type.toUpperCase()}] ${msg.text}`);
    if (msg.location.url) {
      console.log(`  Location: ${msg.location.url}:${msg.location.lineNumber}`);
    }
  });
  
  const errors = consoleMessages.filter(m => m.type === 'error');
  console.log(`\n=== Summary: ${errors.length} errors, ${consoleMessages.length} total messages ===`);
  
  await browser.close();
})();
