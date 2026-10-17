import http from 'node:http';

// Actual HTTP pages exercise frame restrictions and DOM scrolling without social accounts.
export async function startFeedServer(port = 49317) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    requests.push(url.pathname);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'");
    if (url.pathname === '/redirect') {
      response.writeHead(302, { Location: '/feed/redirected?nested=1' });
      response.end();
      return;
    }
    if (url.pathname === '/outside') {
      response.end(`<html><body><h1>Outside workspace</h1><iframe src="/feed/outside"></iframe></body></html>`);
      return;
    }
    const nested = url.searchParams.get('nested') === '1';
    const title = url.pathname.replace(/[^a-zA-Z0-9/-]/g, '');
    const rows = Array.from({ length: 100 }, (_, index) => `<article><h2>Scroll fixture ${index + 1}</h2><p>DOM row for measuring viewport movement.</p>${index === 0 ? '<textarea id="native-editor" aria-label="Native site composer"></textarea>' : ''}</article>`).join('');
    response.end(`<!doctype html><html lang="en"><head><title>${title}</title><style>
      *{box-sizing:border-box}html,body{margin:0;font:16px system-ui;background:#f8fafc;color:#152331}
      header{height:80px;padding:16px;background:#e3ecf5}article{height:180px;padding:16px;border-bottom:1px solid #ccc}
      main{${nested ? 'height:calc(100vh - 80px);overflow-y:auto;' : ''}}
      #dialog{position:fixed;right:0;top:100px;background:white;z-index:5;width:150px;height:240px;overflow:auto;border:2px solid #a22}
      #dialog[hidden]{display:none}.dialog-row{height:100px}
      .inactive-feed{position:fixed;left:-10000px;visibility:hidden;width:400px}
    </style></head><body><header>Browser integration fixture: ${title} <button id="open-dialog">Dialog</button></header>
      <main id="feed" role="feed">${rows}</main>
      <aside id="dialog" role="dialog" aria-modal="true" hidden><button id="close-dialog">Close comments</button>${Array.from({length:20},()=>'<div class="dialog-row">Dialog scroll</div>').join('')}</aside>
      <script>
        document.querySelector('#open-dialog').onclick=()=>document.querySelector('#dialog').hidden=false;
        document.querySelector('#close-dialog').onclick=()=>{
          document.querySelector('#dialog').hidden=true;
          const old=document.querySelector('#feed');
          const next=old.cloneNode(true);
          const offset=old.scrollTop;
          old.id='retained-feed';old.className='inactive-feed';
          old.after(next);next.scrollTop=offset;
        };
      </script>
    </body></html>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, requests, origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
