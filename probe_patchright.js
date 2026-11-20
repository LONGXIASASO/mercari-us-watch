// 用 patchright（Playwright 的反检测补丁）再试一次美区煤炉
// 用法: node probe_patchright.js [--channel=chrome]
const { chromium } = require('patchright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CHANNEL = (process.argv.find(a => a.startsWith('--channel=')) || '').split('=')[1] || '';
const KW = (process.argv.find(a => a.startsWith('--kw=')) || '').split('=')[1] || 'zhang hao photocard';

(async () => {
  const opts = {
    headless: false,                    // patchright 建议有头（Actions 里用 xvfb）
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(CHANNEL ? { channel: CHANNEL } : {})
  };
  console.log('=== patchright | channel:', CHANNEL || 'bundled chromium', '===');
  const b = await chromium.launch(opts);
  const ctx = await b.newContext();
  const p = await ctx.newPage();

  const apis = [];
  p.on('response', async res => {
    const u = res.url();
    if (!/mercari/.test(u)) return;
    if (/\.(jpg|jpeg|png|webp|gif|css|woff2?|svg|ico)/i.test(u)) return;
    if (/challenge-platform|\/_next\/static/.test(u)) return;
    apis.push(res.status() + '  ' + u.slice(0, 150));
  });

  const url = 'https://www.mercari.com/search/?keyword=' + encodeURIComponent(KW);
  console.log('目标:', url);
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 70000 });
  } catch (e) { console.log('goto 异常:', e.message); }

  let passed = false;
  for (let t = 5; t <= 60; t += 5) {
    await sleep(5000);
    let st = { t: '?', n: '', frames: 0 };
    try {
      st = await p.evaluate(() => ({
        t: document.title,
        n: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 70),
        frames: document.querySelectorAll('iframe').length
      }));
    } catch (e) { }
    const ck = (await ctx.cookies()).filter(c => c.name === 'cf_clearance').length;
    console.log(`[${t}s] title="${st.t}" cf=${ck} iframe=${st.frames} | ${st.n.slice(0, 50)}`);
    if (ck > 0) { passed = true; break; }
    // managed challenge 偶尔会弹复选框，试着点一下 iframe 中央
    if (t === 25 || t === 40) {
      try {
        const fr = p.frames().find(f => /challenges\.cloudflare\.com/.test(f.url()));
        if (fr) {
          console.log('   发现 Turnstile iframe，尝试点击');
          const box = await (await p.$('iframe[src*="challenges.cloudflare.com"]'));
          if (box) { const bb = await box.boundingBox(); if (bb) await p.mouse.click(bb.x + 30, bb.y + 30); }
        }
      } catch (e) { console.log('   点击失败:', e.message.slice(0, 60)); }
    }
  }

  const info = await p.evaluate(() => ({
    title: document.title,
    body: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 350),
    links: [...document.querySelectorAll('a[href*="/item/"]')].slice(0, 6).map(a => a.getAttribute('href'))
  }));
  console.log('\n=== 结果 ===');
  console.log('通过挑战:', passed);
  console.log('title:', info.title);
  console.log('body :', info.body);
  console.log('商品链接:', info.links);
  console.log('\n=== 接口 ===');
  console.log([...new Set(apis)].slice(0, 20).join('\n') || '(无)');

  await b.close();
})();
