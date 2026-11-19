#!/usr/bin/env node
/**
 * Tes koneksi Telegram Bot (tanpa menyentuh aplikasi Next.js).
 *
 * Cara pakai (Node.js 20+):
 *   npm run telegram:test
 *   # atau langsung:
 *   node --env-file-if-exists=.env.local scripts/telegram-test.mjs
 *
 * Script ini:
 * 1. Memeriksa TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID.
 * 2. Memanggil getMe untuk memastikan token valid.
 * 3. Mengirim satu pesan percobaan ke chat/grup tujuan.
 *
 * Token TIDAK pernah dicetak ke layar/log.
 */

const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
const apiBase = 'https://api.telegram.org';

function fail(message, code = 1) {
  console.error(`❌ ${message}`);
  process.exit(code);
}

if (!token) fail('TELEGRAM_BOT_TOKEN belum diisi. Lihat docs/telegram-notifications.md.');
if (!chatId) fail('TELEGRAM_CHAT_ID belum diisi. Lihat docs/telegram-notifications.md.');
if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
  fail('Format TELEGRAM_BOT_TOKEN tidak valid (contoh: 123456789:AA...).');
}

async function call(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBase}/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

try {
  console.log('🔄 Memeriksa bot (getMe)...');
  const { response, data } = await call('getMe');
  if (!response.ok || !data?.ok) {
    fail(`Token ditolak Telegram: ${data?.description || `HTTP ${response.status}`}`);
  }

  const username = data.result?.username || '(tanpa username)';
  console.log(`✅ Bot terhubung: @${username}`);

  console.log('📨 Mengirim pesan percobaan...');
  const waktu = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const text = [
    '🔔 <b>NOTIFIKASI WEBSITE</b>',
    '',
    '📌 <b>Aktivitas:</b> 🧪 Tes Koneksi Telegram',
    `🤖 <b>Bot:</b> @${username}`,
    `🕒 <b>Waktu:</b> ${waktu} WIB`,
    '',
    'Status: <b>Berhasil</b>',
  ].join('\n');

  const send = await call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  if (!send.response.ok || !send.data?.ok) {
    fail(
      `Gagal mengirim pesan: ${send.data?.description || `HTTP ${send.response.status}`}\n` +
        'Pastikan bot sudah ditambahkan ke grup/chat dan CHAT_ID benar.'
    );
  }

  console.log('✅ Pesan percobaan terkirim. Cek chat/grup Telegram Anda.');
  console.log('🎉 Konfigurasi Telegram siap digunakan.');
} catch (error) {
  if (error?.name === 'AbortError') fail('Timeout saat menghubungi Telegram.');
  console.error(`❌ Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
