// api/proxy.js
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    res.status(400).send('Uso: /api/proxy?url=<URL-alvo>');
    return;
  }

  try {
    const upstream = await fetch(target, { redirect: 'manual' });
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

    // Se não for HTML (CSS, JS, imagens…), apenas repassa o binário
    if (!contentType.includes('text/html')) {
      const buffer = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.status(upstream.status).end(Buffer.from(buffer));
      return;
    }

    // -------------------------------------------------------
    // É HTML: vamos manipulá-lo como string
    let html = await upstream.text();
    const origin = new URL(target).origin;

    // 1) Reescreve assets e links para caírem novamente no proxy
    //    – <link href>, <script src>, <img src>, <a href>
    //    – <form action>
    html = html
      // link, script, img, a
      .replace(
        /(<(?:link|script|img|a)[^>]+(?:href|src)=["'])([^"']+)(["'])/gi,
        (_, prefix, urlPart, suffix) => {
          const abs = new URL(urlPart, origin).toString();
          return `${prefix}/api/proxy?url=${encodeURIComponent(abs)}${suffix}`;
        }
      )
      // form action
      .replace(
        /(<form[^>]+action=["'])([^"']+)(["'])/gi,
        (_, prefix, urlPart, suffix) => {
          const abs = new URL(urlPart, origin).toString();
          return `${prefix}/api/proxy?url=${encodeURIComponent(abs)}${suffix}`;
        }
      );

    // 2) Injeta <base> no <head> para ajudar URLs relativas que escaparem
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>
  <base href="${origin}">`
    );

    // 3) (Opcional) remova qualquer injeção de footer anterior
    //    Se você já tinha injetado footer/JS no HTML, apague essas partes:
    html = html
      .replace(/<div id="__myFooter">[\s\S]*?<\/div>/gi, '')
      .replace(/<div id="__wrapper">/gi, '<!-- wrapper removed -->');

    // 4) Limpa cabeçalhos que bloqueiam framing (só em caso de teste de iframe)
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    // 5) Retorna o HTML transformado
    res.setHeader('Content-Type', 'text/html');
    res.status(upstream.status).send(html);

  } catch (err) {
    res.status(500).send('Erro no proxy: ' + err.message);
  }
}
