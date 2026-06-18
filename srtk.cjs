const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const KANALI_PATH = path.join(__dirname, 'kanali.json');

async function scrapeToken(embedUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ bypassServiceWorker: true });
  const page = await context.newPage();

  const m3u8Urls = [];
  page.on('response', r => {
    const u = r.url();
    if (u.includes('.m3u8')) m3u8Urls.push(u);
  });

  try {
    await page.goto(embedUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
  } catch (e) {
    console.error(`  Error loading ${embedUrl}:`, e.message);
  }

  await browser.close();

  if (m3u8Urls.length === 0) return null;

  // Prioritize: index.m3u8 > master.m3u8 > playlist.m3u8 > others (avoid mono/tracks)
  const priority = [
    '/index.m3u8',
    '/master.m3u8',
    '/playlist.m3u8',
  ];

  for (const p of priority) {
    const found = m3u8Urls.find(u => u.includes(p));
    if (found) return found;
  }

  // Fallback: first non-mono/tracks URL
  const nonMono = m3u8Urls.find(u => !u.includes('mono') && !u.includes('tracks-'));
  return nonMono || m3u8Urls[0];
}

async function main() {
  if (!fs.existsSync(KANALI_PATH)) {
    console.error('kanali.json not found');
    process.exit(1);
  }

  const kanali = JSON.parse(fs.readFileSync(KANALI_PATH, 'utf8'));
  const updated = [];

  for (const ch of kanali) {
    const embedUrl = ch.watchurl;
    if (!embedUrl || !embedUrl.includes('watch.php')) {
      console.log(`Skipping ${ch.channel_name} (no embed URL)`);
      updated.push(ch);
      continue;
    }

    console.log(`Scraping ${ch.channel_name}...`);
    const m3u8 = await scrapeToken(embedUrl);

    if (m3u8) {
      updated.push({ ...ch, watchurl: m3u8 });
      console.log(`  OK: ${m3u8}`);
    } else {
      updated.push(ch);
      console.log(`  FAILED: no m3u8 found`);
    }
  }

  fs.writeFileSync(KANALI_PATH, JSON.stringify(updated, null, 2));
  console.log('\nkanali.json updated');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});