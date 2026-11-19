import { NextRequest, NextResponse } from 'next/server';
import { askAI, getAIConfig, type ChatTurn } from '@/lib/ai/server-provider';
import { notifyTelegramEvent } from '@/lib/telegram/server';

/**
 * API CHATBOT MODULAR — `/api/chatbot`
 *
 * Peran:
 * - Mengaktifkan AI (OpenAI-compatible) HANYA untuk pertanyaan panduan umum
 *   yang tidak dikenali mesin FAQ lokal.
 * - Identitas & data pribadi TIDAK PERNAH dikirim ke penyedia AI: rute ini
 *   tidak menerima user_id, role, NIS, atau ID apa pun dari frontend.
 * - Jika AI belum dikonfigurasi / gagal / timeout, frontend otomatis memakai
 *   FAQ + backend tools lokal (RBAC) tanpa error ke pengguna.
 *
 * Kunci API hanya dibaca dari `process.env.AI_API_KEY` di sisi server.
 */

const MAX_LEN = 500;
const MAX_HISTORY = 6;
const MAX_HISTORY_LEN = 600;
const WINDOW_MS = 60_000;
const MAX_PER_MIN = 20;
const hits = new Map<string, number[]>();

// Status AI harus selalu segar (jangan di-prerender/cache saat build).
export const dynamic = 'force-dynamic';

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_MIN;
}

/** Kredensial sensitif tidak boleh diproses AI. */
function containsCredential(text: string): boolean {
  const lower = text.toLowerCase();
  return ['password', 'kata sandi', ' pin ', 'otp', 'cvv', 'cvc', 'nomor kartu'].some((p) =>
    lower.includes(p)
  );
}

/**
 * NIS / nomor identitas (6+ digit) tidak boleh dikirim ke penyedia AI.
 * Data pribadi tetap dijawab lokal oleh tools RBAC di browser.
 */
function containsPersonalIdentifier(text: string): boolean {
  return /\b\d{6,}\b/.test(text);
}

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_HISTORY)
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if (role !== 'user' && role !== 'assistant') return [];
      if (typeof content !== 'string') return [];
      const clean = content.trim().slice(0, MAX_HISTORY_LEN);
      return clean ? [{ role, content: clean } as ChatTurn] : [];
    });
}

export async function GET() {
  const cfg = getAIConfig();
  // Model boleh diketahui; kunci tidak pernah dikirim.
  return NextResponse.json({
    aiConfigured: cfg.configured,
    aiModel: cfg.configured ? cfg.model : null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'local';
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Mohon tunggu sebentar.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return NextResponse.json({ error: 'Pesan tidak boleh kosong.' }, { status: 400 });
    }
    if (message.length > MAX_LEN) {
      return NextResponse.json(
        { error: `Pesan maksimal ${MAX_LEN} karakter.` },
        { status: 400 }
      );
    }

    // Tolak permintaan kredensial sensitif di level backend juga.
    if (containsCredential(message)) {
      return NextResponse.json({
        reply:
          'Demi keamanan, jangan bagikan password, PIN, OTP, atau data kartu bank melalui chatbot.',
        source: 'policy',
        useLocalFaq: true,
      });
    }

    // Data pribadi/NIS tidak dikirim ke AI — jawab via mesin lokal RBAC.
    if (containsPersonalIdentifier(message)) {
      return NextResponse.json({
        reply: '',
        useLocalFaq: true,
        reason: 'personal-data',
      });
    }

    const cfg = getAIConfig();
    if (!cfg.configured) {
      return NextResponse.json({
        useLocalFaq: true,
        aiConfigured: false,
        reply: '',
        note: 'AI belum dikonfigurasi. Chatbot menjawab via FAQ offline.',
      });
    }

    const history = parseHistory(body?.history);
    const result = await askAI(message, history);

    if (!result.ok) {
      // Frontend akan memakai FAQ lokal; pesan error internal tidak dibocorkan.
      return NextResponse.json(
        {
          useLocalFaq: true,
          aiConfigured: true,
          error: result.error,
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      reply: result.reply,
      source: 'ai',
      aiConfigured: true,
      useLocalFaq: false,
    });
  } catch (error) {
    // Laporkan ke admin lewat Telegram tanpa menahan respons pengguna.
    void notifyTelegramEvent('system_error', {
      reference: 'api/chatbot',
      details: `API chatbot gagal: ${error instanceof Error ? error.message : 'unknown error'}`,
      url: '/api/chatbot',
    });

    // Jangan bocorkan detail error internal.
    return NextResponse.json(
      { error: 'Terjadi gangguan layanan bantuan. Silakan coba lagi.', useLocalFaq: true },
      { status: 500 }
    );
  }
}
