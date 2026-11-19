import { PESANTREN_INFO, DEMO_PAYMENT_CATEGORIES } from '../demo-data';

/**
 * PENYEDIA AI SERVER-SIDE (OpenAI-compatible)
 *
 * - Modul ini HANYA boleh diimpor dari route server (`/api/chatbot`).
 *   Jangan pernah diimpor komponen client.
 * - Kunci API dibaca dari `process.env` dan TIDAK PERNAH dikirim ke browser.
 * - Mendukung penyedia apa pun yang kompatibel dengan endpoint
 *   `POST {AI_BASE_URL}/chat/completions`:
 *     - OpenAI          : https://api.openai.com/v1
 *     - DeepSeek        : https://api.deepseek.com/v1
 *     - Groq            : https://api.groq.com/openai/v1
 *     - OpenRouter      : https://openrouter.ai/api/v1
 *     - Google Gemini   : https://generativelanguage.googleapis.com/v1beta/openai
 * - Tidak ada data pribadi (nama santri, NIS, nominal, riwayat transaksi)
 *   yang dikirim dari modul ini. Data keuangan tetap dijawab oleh mesin
 *   lokal RBAC di browser.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export function getAIConfig(): AIConfig {
  const apiKey = (process.env.AI_API_KEY || '').trim();
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const model = (process.env.AI_MODEL || DEFAULT_MODEL).trim();
  return { apiKey, baseUrl, model, configured: apiKey.length > 0 };
}

/** Info resmi yang boleh disebut AI — diambil dari pengaturan pondok, bukan karangan. */
export function officialInfoText(): string {
  const bsi = PESANTREN_INFO.rekeningBsi;
  const bca = PESANTREN_INFO.rekeningBcaSyariah;
  const muamalat = PESANTREN_INFO.rekeningMuamalat;
  const qris = PESANTREN_INFO.qrisInfo;
  const kategori = DEMO_PAYMENT_CATEGORIES.filter((c) => c.isActive)
    .map((c) => `- ${c.nama}: ${c.deskripsi}`)
    .join('\n');

  return [
    `Nama pondok: ${PESANTREN_INFO.namaPondok}`,
    `Alamat: ${PESANTREN_INFO.alamat}`,
    `Telepon: ${PESANTREN_INFO.telepon}`,
    `Email bendahara: ${PESANTREN_INFO.email}`,
    '',
    'Rekening resmi:',
    `- ${bsi.namaBank}: ${bsi.nomorRekening} a.n. ${bsi.atasNama}`,
    `- ${bca.namaBank}: ${bca.nomorRekening} a.n. ${bca.atasNama}`,
    `- ${muamalat.namaBank}: ${muamalat.nomorRekening} a.n. ${muamalat.atasNama}`,
    '',
    'QRIS resmi:',
    `- Merchant: ${qris.namaMerchant}`,
    `- NMID: ${qris.nmid}`,
    '- QRIS hanya dapat dipindai dari halaman pembayaran resmi aplikasi; jangan membuat atau memindai QR dari sumber lain.',
    '',
    'Kategori tagihan aktif:',
    kategori,
  ].join('\n');
}

export function buildSystemPrompt(): string {
  return [
    'Anda adalah "Asisten Pembayaran Al-Ma\'rifah", chatbot resmi layanan pembayaran syariah',
    `${PESANTREN_INFO.namaPondok}. Anda membantu wali santri, santri, dan petugas.`,
    '',
    'ATURAN WAJIB:',
    '1. Jawab dalam Bahasa Indonesia yang sopan, ringkas (maksimal ~180 kata), dan mudah dipahami.',
    '2. JANGAN mengarang nomor rekening, QRIS, nominal tagihan, status pembayaran, kebijakan,',
    '   tanggal, atau nama petugas. Gunakan HANYA informasi resmi di bawah.',
    '3. Anda TIDAK memiliki akses ke database. Jangan pernah menyatakan angka tagihan,',
    '   tunggakan, atau status verifikasi milik pengguna. Untuk pertanyaan semacam itu,',
    '   arahkan pengguna ke menu Tagihan, Riwayat Transaksi, Kuitansi, atau tiket bantuan.',
    '4. JANGAN meminta password, PIN, OTP, nomor kartu, atau data rahasia apa pun.',
    '5. JANGAN menjanjikan perubahan data, verifikasi, penghapusan transaksi, atau pelunasan.',
    '6. Jika informasi tidak tersedia, katakan jujur bahwa data belum tersedia dan',
    '   arahkan ke bendahara melalui menu Bantuan (/bantuan).',
    '7. Jangan membahas topik di luar layanan pondok. Alihkan dengan sopan.',
    '8. Bedakan dengan jelas: (a) panduan umum, (b) data aktual yang harus dicek pengguna',
    '   sendiri di aplikasi, (c) informasi yang belum tersedia.',
    '',
    'INFORMASI RESMI (satu-satunya sumber fakta yang boleh Anda sebut):',
    officialInfoText(),
  ].join('\n');
}

export type AIResult =
  | { ok: true; reply: string }
  | { ok: false; status: number; error: string };

export interface AskAIOptions {
  /** Ganti system prompt bawaan (mis. untuk klasifikasi intent yang ketat). */
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Panggil penyedia AI. Tidak pernah melempar error ke pemanggil dan tidak
 * membocorkan detail internal (kunci, URL, stack trace) ke pengguna.
 */
export async function askAI(
  message: string,
  history: ChatTurn[] = [],
  options: AskAIOptions = {}
): Promise<AIResult> {
  const cfg = getAIConfig();
  if (!cfg.configured) {
    return { ok: false, status: 503, error: 'AI belum dikonfigurasi.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150_000);

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: options.temperature ?? 0.4,
        // Model reasoning (mis. nemotron/gpt-oss) memakai token untuk proses
        // berpikir sebelum menulis jawaban, jadi batas ini perlu lebih besar
        // agar `content` tidak kosong saat `finish_reason = length`.
        max_tokens: options.maxTokens ?? 2000,
        messages: [
          { role: 'system', content: options.systemPrompt || buildSystemPrompt() },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, status: 502, error: 'Layanan AI sedang tidak dapat dihubungi.' };
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const reply = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) {
      return { ok: false, status: 502, error: 'Layanan AI tidak memberikan jawaban.' };
    }
    return { ok: true, reply };
  } catch {
    return { ok: false, status: 504, error: 'Layanan AI melebihi batas waktu.' };
  } finally {
    clearTimeout(timer);
  }
}
