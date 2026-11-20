// 美区煤炉最终探测：先过首页挑战建立会话，再进搜索页抓真实数据结构
// 内置 3 次重试，失败换新 context（清 cookie 重来）
const { chromium } = require('patchright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KW = (process.argv.find(a => a.startsWith('--kw=')) || '').split('=')[1] || 'zhang hao';

async function waitClearance(ctx, p, maxSec) {
  for (let t = 5; t <= maxSec; t += 5) {
    await sleep(5000);
    let ck = 0;
    try { ck = (await ctx.cookies()).filter(c => c.name === 'cf_clearance').length; } catch (e) { }
    let ti = '?';
    try { ti = await p.title(); } catch (e) { }
    console.log(`   [${t}s] cf=${ck} title="${String(ti).slice(0, 45)}"`);
    if (ck > 0) return true;
  }
  return false;
}

(async () => {
  const b = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n===== 第 ${attempt} 次尝试 =====`);
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    const apis = [];
    p.on('response', async res => {
      const u = res.url();
      if (!u.includes('/v1/api')) return;
      let t = '';
      try { t = await res.text(); } catch (e) { }
      apis.push({ url: u, len: t.length, head: t.slice(0, 1500) });
    });

    try {
      // ① 先过首页（首页挑战通常比搜索页好过）
      console.log('① 打开首页建立会话');
      await p.goto('https://www.mercari.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      const okHome = await waitClearance(ctx, p, 50);
      if (!okHome) { console.log('   首页未过挑战，换新会话重试'); await ctx.close(); continue; }

      // ② 进搜索页（同域 cookie 复用，通常不再挑战）
      console.log('② 进入搜索页');
      const url = 'https://www.mercari.com/search/?keyword=' + encodeURIComponent(KW);
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(8000);

      const ti = await p.title();
      console.log('   标题:', ti);
      if (/just a moment|请稍候/i.test(ti)) {
        const ok2 = await waitClearance(ctx, p, 40);
        if (!ok2) { console.log('   搜索页仍未过，重试'); await ctx.close(); continue; }
      }

      await sleep(6000);
      // 滚动触发懒加载
      for (let i = 0; i < 2; i++) {
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(2500);
      }

      // ③ 抓 DOM 卡片
      const cards = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href*="item/m"]').forEach(a => {
          const m = (a.getAttribute('href') || '').match(/m\d{11}/);
          if (!m) return;
          const img = a.querySelector('img');
          let box = a;
          for (let i = 0; i < 4 && box.parentElement; i++) {
            if (/\$\s?\d/.test(box.innerText || '')) break;
            box = box.parentElement;
          }
          out.push({
            id: m[0],
            text: (box.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            img: img ? (img.currentSrc || img.src || img.getAttribute('src') || '') : '',
            alt: img ? (img.alt || '') : ''
          });
        });
        return out.slice(0, 6);
      });

      console.log('\n③ DOM 卡片（前 6 个）:');
      console.log(JSON.stringify(cards, null, 1));

      console.log('\n④ /v1/api 命中', apis.length, '个');
      for (const a of apis.slice(0, 3)) {
        console.log('\n-- URL:', a.url.slice(0, 220));
        console.log('   len=', a.len);
        console.log('   ', a.head.replace(/\s+/g, ' ').slice(0, 900));
      }

      fs.writeFileSync('probe_final.json', JSON.stringify({ title: ti, cards, apis }, null, 1));
      console.log('\n✅ 探测成功，已存 probe_final.json');
      await ctx.close();
      break;
    } catch (e) {
      console.log('   异常:', e.message.slice(0, 120));
      try { await ctx.close(); } catch (e2) { }
    }
  }

  await b.close();
})();
