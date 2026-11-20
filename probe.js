// 美区煤炉探测：在 GitHub Actions（海外 IP）上验证能否过 Cloudflare，并抓出搜索接口
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HEADFUL = process.argv.includes('--headful');
const KW = (process.argv.find(a => a.startsWith('--kw=')) || '').split('=')[1] || 'zhang hao photocard';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const b = await puppeteer.launch({
    headless: HEADFUL ? false : true,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1400,1000',
      '--lang=en-US'
    ]
  });
  const p = await b.newPage();
  await p.setUserAgent(UA);
  await p.setViewport({ width: 1400, height: 1000 });
  await p.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = window.chrome || { runtime: {} };
  });

  const apis = [];
  p.on('response', async res => {
    const u = res.url();
    if (!/mercari/.test(u)) return;
    if (/\.(jpg|jpeg|png|webp|gif|css|woff2?|svg|ico)/i.test(u)) return;
    if (/challenge-platform|\/_next\/static/.test(u)) return;
    apis.push(res.status() + '  ' + u.slice(0, 150));
  });

  const url = 'https://www.mercari.com/search/?keyword=' + encodeURIComponent(KW);
  console.log('=== 模式:', HEADFUL ? 'headful(xvfb)' : 'headless', '===');
  console.log('目标:', url);

  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log('goto 异常:', e.message);
  }

  let passed = false;
  for (let t = 5; t <= 50; t += 5) {
    await sleep(5000);
    let st = { t: '?', n: '' };
    try {
      st = await p.evaluate(() => ({
        t: document.title,
        n: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 80)
      }));
    } catch (e) { }
    const ck = (await p.cookies()).filter(c => c.name === 'cf_clearance').length;
    console.log(`[${t}s] title="${st.t}" cf_clearance=${ck} | ${st.n.slice(0, 60)}`);
    if (ck > 0) { passed = true; break; }
  }

  const info = await p.evaluate(() => ({
    title: document.title,
    body: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 400),
    links: [...document.querySelectorAll('a[href*="/item/"]')].slice(0, 6).map(a => a.getAttribute('href'))
  }));

  console.log('\n=== 结果 ===');
  console.log('通过挑战:', passed);
  console.log('title:', info.title);
  console.log('body :', info.body);
  console.log('商品链接:', info.links);

  console.log('\n=== 抓到的接口 ===');
  console.log([...new Set(apis)].slice(0, 25).join('\n') || '(无)');

  await b.close();
})();
