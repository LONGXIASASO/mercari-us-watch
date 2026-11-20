// 抓美区煤炉搜索页的 /v1/api 响应，确定商品数据结构
const { chromium } = require('patchright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KW = (process.argv.find(a => a.startsWith('--kw=')) || '').split('=')[1] || 'zhanghao';

(async () => {
  const b = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext();
  const p = await ctx.newPage();

  const hits = [];
  p.on('response', async res => {
    const u = res.url();
    if (!u.includes('/v1/api')) return;
    let txt = '';
    try { txt = await res.text(); } catch (e) { }
    hits.push({ url: u, len: txt.length, head: txt.slice(0, 1200) });
  });

  const url = 'https://www.mercari.com/search/?keyword=' + encodeURIComponent(KW);
  console.log('目标:', url);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 70000 });

  for (let i = 1; i <= 12; i++) {
    await sleep(5000);
    const ck = (await ctx.cookies()).filter(c => c.name === 'cf_clearance').length;
    console.log(`[${i * 5}s] cf_clearance=${ck}`);
    if (ck) break;
  }
  await sleep(8000);

  // 往下滚，看是否触发分页
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(3000);
  }

  console.log('\n=== /v1/api 命中', hits.length, '个 ===');
  for (const h of hits) {
    console.log('\n--- URL:', h.url.slice(0, 260));
    console.log('len=', h.len);
    console.log(h.head.replace(/\s+/g, ' ').slice(0, 900));
  }

  // DOM 兜底：直接把卡片上的信息读出来
  const cards = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href*="/item/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/m\d{11}/);
      if (!m) return;
      const txt = (a.innerText || '').replace(/\s+/g, ' ').trim();
      if (!txt) return;
      out.push({ id: m[0], txt: txt.slice(0, 120) });
    });
    return out.slice(0, 12);
  });
  console.log('\n=== DOM 卡片 ===');
  console.log(JSON.stringify(cards, null, 1));

  fs.writeFileSync('api_dump.json', JSON.stringify(hits, null, 1));
  await b.close();
})();
