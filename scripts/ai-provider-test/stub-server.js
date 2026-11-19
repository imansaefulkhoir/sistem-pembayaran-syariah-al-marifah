// Server tiruan OpenAI-compatible untuk menguji provider chatbot.
// Tidak memakai kunci asli. Menjalankan: node stub-server.js [port]
const http = require('http');

const port = Number(process.argv[2] || 4010);

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method !== 'POST' || !req.url.startsWith('/v1/chat/completions')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found' }));
    }
    // Menolak jika kunci tidak dikirim sebagai Bearer.
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad json' }));
    }
    const sys = (payload.messages || []).find((m) => m.role === 'system');
    const last = (payload.messages || []).filter((m) => m.role === 'user').pop();
    const hasOfficialInfo = Boolean(sys && sys.content.includes('7128-4455-90') && sys.content.includes('ID1020088921821'));
    const reply =
      `STUB_OK model=${payload.model} ` +
      `system=${hasOfficialInfo ? 'lengkap' : 'kurang'} ` +
      `pesan="${last ? last.content : ''}"`;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-stub',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
      })
    );
  });
});

server.listen(port, () => console.log(`stub listening ${port}`));
