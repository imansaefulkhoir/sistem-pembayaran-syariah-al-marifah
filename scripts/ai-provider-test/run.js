/**
 * Uji provider AI tanpa kunci asli (memakai stub OpenAI-compatible).
 *
 * Menjalankan: node scripts/ai-provider-test/run.js
 *
 * 1. Tanpa AI_API_KEY -> configured=false, askAI menolak sopan (503).
 * 2. Dengan kunci + stub server -> jawaban diterima, system prompt berisi
 *    info resmi (rekening & NMID), model dari env dipakai.
 * 3. Kegagalan penyedia -> fallback terdeteksi, error tidak bocorkan kunci.
 * 4. Endpoint mati -> fallback terkontrol tanpa exception.
 */
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const akar = path.join(__dirname, '..', '..');
const outDir = path.join(os.tmpdir(), 'chatbot-ai-provider-test');

function bersihkan() {
  fs.rmSync(outDir, { recursive: true, force: true });
}

async function main() {
  // Kompilasi modul provider ke folder sementara (tidak menyentuh src/).
  bersihkan();
  execSync(
    `npx tsc src/lib/ai/server-provider.ts --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
    { cwd: akar, stdio: 'inherit' }
  );

  const { getAIConfig, askAI, buildSystemPrompt, officialInfoText } = require(path.join(
    outDir,
    'ai',
    'server-provider.js'
  ));

  // 1. Tanpa kunci
  delete process.env.AI_API_KEY;
  assert.strictEqual(getAIConfig().configured, false, 'tanpa kunci harus configured=false');
  const noKey = await askAI('halo');
  assert.strictEqual(noKey.ok, false, 'tanpa kunci harus gagal terkontrol');
  console.log('ok   - tanpa AI_API_KEY: configured=false, askAI gagal terkontrol (503)');

  // System prompt memuat info resmi, bukan karangan
  const prompt = buildSystemPrompt();
  const info = officialInfoText();
  assert.ok(prompt.includes('7128-4455-90'), 'system prompt harus memuat rekening resmi');
  assert.ok(prompt.includes('ID1020088921821'), 'system prompt harus memuat NMID resmi');
  assert.ok(prompt.includes('JANGAN mengarang'), 'aturan anti-karangan harus ada');
  assert.ok(info.includes('BCA Syariah') && info.includes('Bank Muamalat'), 'rekening lengkap');
  console.log('ok   - system prompt memuat info resmi + aturan anti-karangan');

  // 2. Stub server
  const port = 4010;
  const stub = spawn(process.execPath, [path.join(__dirname, 'stub-server.js'), String(port)], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const stubHidup = async () => {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'GET' });
        if (r.status > 0) return true;
      } catch {
        /* belum siap */
      }
      await new Promise((res) => setTimeout(res, 200));
    }
    return false;
  };
  try {
    const siap = await stubHidup();
    assert.ok(siap, 'stub server harus siap di port 4010');

    process.env.AI_API_KEY = 'stub-key-tidak-nyata';
    process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
    process.env.AI_MODEL = 'model-uji';

    const ok = await askAI('Apa itu pembayaran syariah?', [
      { role: 'assistant', content: 'Jawaban sebelumnya' },
    ]);
    assert.strictEqual(ok.ok, true, 'stub harus menjawab');
    assert.ok(ok.reply.includes('STUB_OK'), 'balasan stub diteruskan');
    assert.ok(ok.reply.includes('model=model-uji'), 'model dari env dipakai');
    assert.ok(ok.reply.includes('system=lengkap'), 'system prompt lengkap terkirim');
    console.log('ok   - dengan kunci + stub: jawaban AI diterima & model dari env dipakai');
    console.log(`       balasan: ${ok.reply.slice(0, 90)}...`);

    // 3. Endpoint salah -> gagal terkontrol (502), tanpa membocorkan kunci
    process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v2`;
    const bad = await askAI('halo');
    assert.strictEqual(bad.ok, false, 'endpoint salah harus gagal');
    assert.strictEqual(bad.status, 502, 'status 502 untuk kegagalan penyedia');
    assert.ok(!String(bad.error).toLowerCase().includes('stub-key'), 'error tidak membocorkan kunci');
    console.log('ok   - kegagalan penyedia: fallback terdeteksi, error tidak bocorkan kunci');

    // 4. Endpoint mati
    process.env.AI_BASE_URL = 'http://127.0.0.1:4999/v1';
    const down = await askAI('halo');
    assert.strictEqual(down.ok, false, 'endpoint mati harus gagal');
    console.log('ok   - endpoint mati: fallback terkontrol (tanpa exception)');
  } finally {
    stub.kill();
  }

  console.log('\n4 skenario AI lulus');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(() => {
    bersihkan();
  });
