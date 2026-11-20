// 摸清美区煤炉搜索页的数据来源：__NEXT_DATA__ / ld+json / v1/api / DOM
const { chromium } = require('patchright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KW = (process.argv.find(a => a.startsWith('--kw=')) || '').split('=')[1] || 'zhang hao';

(async () => {
  const b = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext();
  const p = await ctx.newPage();

  const apis = [];
  p.on('response', async res => {
    const u = res.url();
    if (!u.includes('/v1/api') && !u.includes('/api/')) return;
    let txt = '';
    try { txt = await res.text(); } catch (e) { }
    apis.push({ url: u, len: txt.length, head: txt.slice(0, 2000) });
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
  await sleep(10000);

  // 1) 页面内嵌数据
  const embed = await p.evaluate(() => {
    const out = {};
    const nd = document.getElementById('__NEXT_DATA__');
    out.hasNextData = !!nd;
    out.nextDataLen = nd ? nd.textContent.length : 0;
    out.nextDataHead = nd ? nd.textContent.slice(0, 1500) : '';
    const lds = [...document.querySelectorAll('script[type="application/ld+json"]')];
    out.ldCount = lds.length;
    out.ldHead = lds.length ? lds[0].textContent.slice(0, 1200) : '';
    out.htmlLen = document.documentElement.outerHTML.length;
    out.idHits = (document.documentElement.outerHTML.match(/m\d{11}/g) || []).length;
    out.uniqIds = [...new Set((document.documentElement.outerHTML.match(/m\d{11}/g) || []))].slice(0, 10);
    out.title = document.title;
    out.bodyHead = document.body.innerText.replace(/\s+/g, ' ').slice(0, 300);
    return out;
  });

  console.log('\n=== 内嵌数据 ===');
  console.log('title:', embed.title);
  console.log('__NEXT_DATA__:', embed.hasNextData, 'len=', embed.nextDataLen);
  console.log('ld+json 个数:', embed.ldCount);
  console.log('HTML 长度:', embed.htmlLen, '| m-id 出现次数:', embed.idHits);
  console.log('前 10 个 id:', embed.uniqIds);
  console.log('body:', embed.bodyHead);
  if (embed.nextDataHead) console.log('\n__NEXT_DATA__ 前段:\n', embed.nextDataHead.replace(/\s+/g, ' '));
  if (embed.ldHead) console.log('\nld+json 前段:\n', embed.ldHead.replace(/\s+/g, ' '));

  // 2) DOM 卡片明细
  const cards = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href*="item/m"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/m\d{11}/);
      if (!m) return;
      const img = a.querySelector('img');
      // 往上找带价格的容器
      let box = a;
      for (let i = 0; i < 4 && box.parentElement; i++) {
        if (/\$\s?\d/.test(box.innerText || '')) break;
        box = box.parentElement;
      }
      out.push({
        id: m[0],
        href: href.slice(0, 80),
        text: (box.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 150),
        img: img ? (img.currentSrc || img.src || '').slice(0, 120) : '',
        alt: img ? (img.alt || '').slice(0, 80) : ''
      });
    });
    return out.slice(0, 8);
  });
  console.log('\n=== DOM 卡片（前 8 个）===');
  console.log(JSON.stringify(cards, null, 1));

  // 3) 接口
  console.log('\n=== /v1/api 命中', apis.length, '个 ===');
  for (const a of apis.slice(0, 6)) {
    console.log('\n--- URL:', a.url.slice(0, 300));
    console.log('len=', a.len);
    console.log(a.head.replace(/\s+/g, ' ').slice(0, 1200));
  }

  fs.writeFileSync('api_dump2.json', JSON.stringify({ embed, cards, apis }, null, 1));
  await b.close();
})();
