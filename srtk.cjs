const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, 'defaultkanali.json');
const KANALI_PATH = path.join(__dirname, 'kanali.json');

function pickBestM3u8(urls) {
  if (urls.length === 0) return null;
  const priority = ['/index.m3u8', '/master.m3u8', '/playlist.m3u8'];
  for (const p of priority) {
    const found = urls.find(u => u.includes(p));
    if (found) return found;
  }
  const nonMono = urls.find(u => !u.includes('mono') && !u.includes('tracks-'));
  return nonMono || urls[0];
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function main() {
  if (!fs.existsSync(DEFAULT_PATH)) {
    console.error('defaultkanali.json not found');
    process.exit(1);
  }

  const defaultChannels = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  let kanali = [];

  const browser = await chromium.launch({ headless: true });

  for (const ch of defaultChannels) {
    if (!ch.defaulturl || !ch.defaulturl.includes('watch.php')) {
      console.log(`Skipping ${ch.channel_name} (no embed URL)`);
      continue;
    }

    console.log(`Scraping ${ch.channel_name}...`);

    const context = await browser.newContext({ bypassServiceWorker: true });
    const page = await context.newPage();

    let m3u8 = null;

    page.on('response', r => {
      if (m3u8) return;
      const u = r.url();
      if (u.includes('.m3u8')) {
        m3u8 = pickBestM3u8([u]);
      }
    });

    try {
      await page.goto(ch.defaulturl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (!m3u8) {
        try {
          await page.waitForResponse(r => r.url().includes('.m3u8'), { timeout: 15000 });
        } catch {}
      }
    } catch {}

    await context.close();

    kanali.push({ channel_id: ch.channel_id, watchurl: m3u8 || '' });
    saveJson(KANALI_PATH, kanali);
    console.log(m3u8 ? `  OK` : `  FAILED`);
  }

  await browser.close();
  console.log('\nDone');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});