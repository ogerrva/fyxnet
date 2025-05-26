import express from 'express';
import fetch from 'node-fetch';
const app = express();

// 1) serve index.html e assets estáticos
app.use(express.static('public'));

// 2) rota /proxy que injeta footer e base
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Uso: /proxy?url=<URL-alvo>');
  try {
    const upstream = await fetch(target, { redirect: 'manual' });
    const ct = upstream.headers.get('content-type')||'';
    let text = await upstream.text();

    if (!ct.includes('text/html')) {
      res.set('Content-Type', ct);
      return res.send(text);
    }

    const origin = new URL(target).origin;

    // injeta <base> e estilos/js do footer
    text = text.replace(
      /<head([^>]*)>/i,
      `<head$1>
  <base href="${origin}">
  <style>
    #__wrapper { padding-bottom: 56px!important; }
    #__myFooter {
      position: fixed; bottom:0; left:0;
      width:100%; height:56px;
      background:#1e293b; border-top:1px solid #374151;
      display:flex;justify-content:center;align-items:center;
      gap:1rem; z-index:9999;
    }
    #__myFooter button {
      background:#6ee7b7; border:none;
      padding:.5rem 1rem; border-radius:4px;
      cursor:pointer; font-weight:bold;
    }
    #__myFooter button:hover {
      background:#10b981; color:#fff;
    }
  </style>
  <script>
    function goBack(){history.back()}
    function goHome(){window.location.href='/'}
  </script>`
    );

    // envolve body e injeta footer
    text = text
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

    res.send(text);
  } catch (err) {
    res.status(500).send('Erro no proxy: '+ err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Rodando na porta \${PORT}\`));
