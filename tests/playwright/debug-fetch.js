const { firefox } = require('playwright');

(async () => {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();
  
  // Intercept network requests
  page.on('response', response => {
    if (response.url().includes('countries.geojson')) {
      console.log(`GeoJSON Response: ${response.status()} ${response.statusText()}`);
      console.log(`URL: ${response.url()}`);
      response.text().then(text => {
        console.log(`Size: ${text.length} bytes`);
        console.log(`First 100 chars: ${text.substring(0, 100)}`);
      });
    }
  });
  
  page.on('requestfailed', request => {
    console.log(`Failed request: ${request.url()}`);
    console.log(`Failure: ${request.failure().errorText}`);
  });
  
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({type: msg.type(), text: msg.text()});
  });
  
  await page.goto('http://localhost:8889/map/');
  await page.waitForTimeout(4000);
  
  console.log('\n=== Console Messages ===');
  consoleMessages.forEach(msg => {
    console.log(`[${msg.type}] ${msg.text}`);
  });
  
  await browser.close();
})();
