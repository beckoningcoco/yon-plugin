// 用友社区页面抓取脚本（需 Chrome --remote-debugging-port=9222 --user-data-dir=...）
// 用途：从 community.yonyou.com 或 c2.yonyoucloud.com 提取页面内容
// 参考：references/webpage-extraction-guide.md
//
// 用法：
//   bun run fetch-yonby-article.ts <URL> [等待毫秒] [--links]
//   bun run fetch-yonby-article.ts https://community.yonyou.com/article/detail/12062
//   bun run fetch-yonby-article.ts https://c2.yonyoucloud.com/.../detail/XXX 12000
//   bun run fetch-yonby-article.ts https://community.yonyou.com/... 10000 --links

const TARGET_URL = process.argv[2] || 'https://community.yonyou.com/article/detail/12062';
const WAIT_MS = parseInt(process.argv[3] || '10000');
const EXTRACT_LINKS = process.argv[4] === '--links';
// 必须使用 127.0.0.1，不能用 localhost
const CDP_BASE = 'http://127.0.0.1:9222';

// 视频页面关键词——碰到就跳过
const VIDEO_SKIP_TITLES = ['视频播放', '视频课程'];

async function main() {
  const url = new URL(TARGET_URL);
  const isDocCenter = url.hostname === 'c2.yonyoucloud.com';

  // 打开新标签页
  const resp = await fetch(`${CDP_BASE}/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const tab = JSON.parse(await resp.text());
  console.error(`Tab: ${tab.id} → ${TARGET_URL}`);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let loadCount = 0;
  let attempts = 0;
  let doneFlag = false;

  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));

  ws.onmessage = (e: any) => {
    if (doneFlag) return;
    const msg = JSON.parse(e.data);

    if (msg.method === 'Page.loadEventFired') {
      loadCount++;
      if (loadCount === 1) {
        if (isDocCenter) {
          setTimeout(tryExtract, 5000);
          setTimeout(tryExtract, 10000);
        } else {
          setTimeout(tryExtract, WAIT_MS);
        }
      }
    }

    if (msg.id === 8) {
      // 视频检测结果
      try {
        const data = JSON.parse(msg.result.result.value);
        if (VIDEO_SKIP_TITLES.some(k => data.title.includes(k))) {
          console.error(`SKIP: 视频页面 "${data.title}" — 忽略`);
          done(null, tab.id, true);
        }
      } catch { /* 检测失败则继续 */ }
    }

    if (msg.id >= 10) {
      try {
        const raw = msg.result?.result?.value;
        if (raw) {
          const data = JSON.parse(raw);
          if (data.hasContent || data.text || attempts >= 3) {
            done(data.text || raw, tab.id);
          }
        } else if (attempts >= 3) {
          done(null, tab.id);
        }
      } catch {
        if (attempts >= 3) done(null, tab.id);
      }
    }
  };

  function tryExtract() {
    attempts++;

    if (attempts === 1) {
      // 首次先做视频检测
      ws.send(JSON.stringify({
        id: 8, method: 'Runtime.evaluate',
        params: { expression: 'JSON.stringify({title: document.title})', returnByValue: true }
      }));
    }

    const expr = EXTRACT_LINKS
      ? `JSON.stringify(Array.from(document.querySelectorAll('a[href]')).map(a => ({text: a.innerText.trim().substring(0,100), href: a.href})).filter(l => l.text && l.href))`
      : `(function(){
           var text = document.body.innerText;
           return JSON.stringify({title: document.title, length: text.length, hasContent: text.length > 200, text: text.substring(0, 20000)});
         })()`;

    ws.send(JSON.stringify({ id: 10 + attempts, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  }

  function done(content: string | null, tabId: string, skipped = false) {
    doneFlag = true;
    if (skipped) console.error('Video page skipped');
    else if (content) process.stdout.write(content);
    else console.error('No content extracted');
    ws.close();
    fetch(`${CDP_BASE}/json/close/${tabId}`);
    process.exit(skipped || content ? 0 : 1);
  }

  ws.onerror = (e: any) => { console.error('WS Error:', e.message); process.exit(1); };
  setTimeout(() => { console.error('Timeout'); process.exit(1); }, 50000);
}

main();
