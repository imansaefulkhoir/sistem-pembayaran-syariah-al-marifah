'use client';

import { ChatMessage } from './types';
import { store } from './store';

/**
 * CHATBOT BANTUAN WALI SANTRI — Lapisan data & adapter modular.
 *
 * - FAQ offline-first: seluruh jawaban umum diselesaikan di frontend
 *   melalui `store.processChatbotQuery` tanpa memanggil AI eksternal.
 * - Adapter AI opsional: jika di masa depan pondok mengaktifkan integrasi AI
 *   yang aman di backend, cukup implementasikan `AIChatAdapter` di sisi server
 *   (`/api/chatbot`) tanpa mengubah UI. Kunci API TIDAK PERNAH di frontend.
 * - Keamanan: tidak ada NIS/ID ketikan pengguna yang dipakai untuk akses data.
 *   Ringkasan tagihan hanya dari akun login yang sudah terverifikasi (RBAC).
 */

export const CHATBOT_GREETING: string =
  'Assalamu’alaikum warahmatullahi wabarakatuh.\n' +
  'Selamat datang di layanan bantuan Pembayaran Syariah Pondok Pesantren Kebon Kelapa Al-Ma\'rifah.\n' +
  'Saya siap membantu Bapak/Ibu memahami tagihan, cara pembayaran, status verifikasi, dan cara mendapatkan kuitansi. Silakan pilih pertanyaan di bawah atau ketik pertanyaan Bapak/Ibu.';

export interface QuickQuestion {
  id: string;
  label: string;
  /** Query yang dikirim ke mesin FAQ agar jawabannya konsisten. */
  query: string;
}

export const QUICK_QUESTIONS: QuickQuestion[] = [
  { id: 'cara-bayar', label: 'Bagaimana cara membayar?', query: 'Bagaimana cara membayar tagihan?' },
  { id: 'lihat-tagihan', label: 'Bagaimana cara melihat tagihan?', query: 'Bagaimana cara melihat tagihan anak saya?' },
  { id: 'transfer', label: 'Bagaimana cara membayar melalui transfer?', query: 'Bagaimana cara membayar melalui transfer bank?' },
  { id: 'qris', label: 'Bagaimana cara membayar menggunakan QRIS?', query: 'Bagaimana cara membayar menggunakan QRIS?' },
  { id: 'upload-bukti', label: 'Bagaimana cara mengunggah bukti pembayaran?', query: 'Bagaimana cara mengunggah bukti pembayaran?' },
  { id: 'belum-verifikasi', label: 'Mengapa pembayaran saya belum diverifikasi?', query: 'Mengapa pembayaran saya belum diverifikasi?' },
  { id: 'kuitansi', label: 'Bagaimana cara mengunduh kuitansi?', query: 'Bagaimana cara mengunduh kuitansi resmi?' },
  { id: 'tunggakan', label: 'Bagaimana cara melihat tunggakan?', query: 'Bagaimana cara melihat tunggakan tagihan?' },
  { id: 'multi-anak', label: 'Saya mempunyai lebih dari satu anak.', query: 'Saya mempunyai lebih dari satu anak di pondok, bagaimana caranya?' },
  { id: 'masalah', label: 'Saya mengalami masalah pembayaran.', query: 'Saya mengalami masalah pembayaran, apa yang harus dilakukan?' },
  { id: 'bendahara', label: 'Hubungi bendahara.', query: 'Hubungi bendahara' },
];

/** Batas keamanan frontend: cegah spam & payload raksasa. */
export const CHAT_LIMITS = {
  maxMessageLength: 500,
  minIntervalMs: 1200,
  maxMessagesPerMinute: 20,
} as const;

/** Kata yang menandakan upaya meminta kredensial — chatbot menolak dengan sopan. */
const SENSITIVE_PATTERNS = [
  'password',
  'kata sandi',
  'pin',
  'otp',
  'kode otp',
  'nomor kartu',
  'cvv',
  'cvc',
  'rekening saya',
];

export function containsSensitiveRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

export function sensitiveRefusalMessage(): ChatMessage {
  return {
    id: `bot-${Date.now()}`,
    sender: 'bot',
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    text: 'Mohon maaf, demi keamanan Bapak/Ibu tidak perlu membagikan password, PIN, OTP, atau data kartu bank kepada siapa pun termasuk melalui chatbot ini.\n\nJika terkendala login, silakan gunakan fitur "Hubungi Bendahara" agar petugas membantu verifikasi identitas secara resmi.',
    actionButtons: [{ label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' }],
  };
}

/**
 * Adapter AI backend.
 *
 * - Kunci API hanya ada di server (`/api/chatbot`). Frontend tidak pernah
 *   menyimpan atau menerima kunci.
 * - Hanya pertanyaan panduan umum yang diteruskan. Pertanyaan yang menyangkut
 *   data pribadi/angka tetap dijawab mesin lokal yang RBAC-aware.
 * - Riwayat yang dikirim hanya giliran yang berasal dari AI sebelumnya,
 *   sehingga jawaban lokal berisi nama/nominal tidak ikut terkirim.
 */
export interface AIChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIChatAdapter {
  askViaBackend(message: string, history?: AIChatTurn[]): Promise<ChatMessage | null>;
}

export async function isAIConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/chatbot', { method: 'GET', cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.aiConfigured);
  } catch {
    return false;
  }
}

export const backendAIAdapter: AIChatAdapter = {
  async askViaBackend(message: string, history: AIChatTurn[] = []): Promise<ChatMessage | null> {
    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.slice(0, CHAT_LIMITS.maxMessageLength),
          history: history.slice(-6),
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.useLocalFaq !== false) return null;
      if (typeof data?.reply !== 'string' || data.reply.trim().length === 0) return null;
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        text: data.reply.trim(),
        meta: { source: 'ai', confident: true },
        actionButtons: [
          { label: 'Buka Menu Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
        ],
      };
    } catch {
      return null;
    }
  },
};

/** Jalur utama: validasi keamanan lalu teruskan ke mesin FAQ di store. */
export function answerLocally(message: string, user: Parameters<typeof store.processChatbotQuery>[1]): ChatMessage {
  if (containsSensitiveRequest(message)) return sensitiveRefusalMessage();
  return store.processChatbotQuery(message, user);
}
