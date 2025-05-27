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

    // Se não for HTML, faz proxy direto (CSS, JS, imagens…)
    if (!contentType.includes('text/html')) {
      const buffer = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.status(upstream.status).end(Buffer.from(buffer));
      return;
    }

    // É HTML: vamos injetar o wrapper, footer e reescrever assets
    let html = await upstream.text();
    const origin = new URL(target).origin;

    // 1) Reescrever todos os <link>, <script> e <img> para passarem por aqui
    html = html.replace(
      /(<(?:link|script|img)[^>]+(?:href|src)=["'])([^"']+)(["'])/gi,
      (_, pre, urlPart, suf) => {
        const abs = new URL(urlPart, origin).toString();
        return `${pre}/api/proxy?url=${encodeURIComponent(abs)}${suf}`;
      }
    );

    // 2) Injeção no <head>: <base>, estilo do footer e compatibilidade
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>
  <base href="${origin}">
  <style>
    /* empurra conteúdo acima do footer */
    #__wrapper { padding-bottom: 56px !important; }
    /* estilos do footer */
    #__myFooter {
      position: fixed;
      bottom: 0; left: 0;
      width: 100%; height: 56px;
      background: #1e293b;
      border-top: 1px solid #374151;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      z-index: 9999;
    }
    #__myFooter a {
      text-decoration: none;
    }
    #__myFooter button {
      background: #6ee7b7;
      border: none;
      padding: .5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    #__myFooter button:hover {
      background: #10b981;
      color: #fff;
    }
  </style>`
    );

    // 3) Envolver o <body> em um wrapper e injetar o footer como <a> links
    html = html
      .replace(/<body([^>]*)>/i, `<body$1><div id="__wrapper">`)
      .replace(
        /<\/body>/i,
        `</div>
  <div id="__myFooter">
    <a href="javascript:history.back()"><button>Voltar</button></a>
    <a href="/"><button>Home</button></a>
  </div>
</body>`
      );

    // 4) Remover cabeçalhos de frame-block (caso ainda houvesse iframe)
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    // 5) Enviar o HTML transformado
    res.setHeader('Content-Type', 'text/html');
    res.status(upstream.status).send(html);

  } catch (err) {
    res.status(500).send('Erro no proxy: ' + err.message);
  }
}
