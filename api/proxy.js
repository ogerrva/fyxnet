// api/proxy.js
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    res.status(400).send('Uso: /api/proxy?url=<URL-alvo>');
    return;
  }

  try {
    const upstream = await fetch(target, { redirect: 'manual' });
    const contentType = upstream.headers.get('content-type') || '';

    // Se não for HTML, repassa direto (CSS, JS, imagens…)
    if (!contentType.includes('text/html')) {
      const buf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.status(upstream.status).end(Buffer.from(buf));
      return;
    }

    // HTML: injeta <base> e footer, e reescreve assets para passar pelo proxy
    let html = await upstream.text();
    const origin = new URL(target).origin;

    // 1) Reescrever CSS/JS/imgs para caírem aqui também
    html = html.replace(
      /(<(?:link|script|img)[^>]+(?:href|src)=["'])([^"']+)(["'])/gi,
      (_, pre, urlPart, suf) => {
        const abs = new URL(urlPart, origin).toString();
        return `${pre}/api/proxy?url=${encodeURIComponent(abs)}${suf}`;
      }
    );

    // 2) Injetar <base>, estilos do footer e funções
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>
  <base href="${origin}">
  <style>
    #__wrapper{padding-bottom:56px!important;}
    #__myFooter{
      position:fixed;bottom:0;left:0;
      width:100%;height:56px;
      background:#1e293b;border-top:1px solid #374151;
      display:flex;justify-content:center;align-items:center;
      gap:1rem;z-index:9999;
    }
    #__myFooter button{
      background:#6ee7b7;border:none;padding:.5rem 1rem;
      border-radius:4px;cursor:pointer;font-weight:bold;
    }
    #__myFooter button:hover{background:#10b981;color:#fff;}
  </style>
  <script>
    function goBack(){history.back()}
    function goHome(){window.location.href='/'}
  </script>`
    );

    // 3) Envolver <body> e injetar o footer
    html = html
      .replace(/<body([^>]*)>/i, `<body$1><div id="__wrapper">`)
      .replace(
        /<\/body>/i,
        `</div>
  <div id="__myFooter">
    <button onclick="goBack()">Voltar</button>
    <button onclick="goHome()">Home</button>
  </div>
</body>`
      );

    // 4) Remover cabeçalhos de frame-block (segurança)
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    res.setHeader('Content-Type', 'text/html');
    res.status(upstream.status).send(html);
  } catch (err) {
    res.status(500).send('Erro no proxy: ' + err.message);
  }
}
