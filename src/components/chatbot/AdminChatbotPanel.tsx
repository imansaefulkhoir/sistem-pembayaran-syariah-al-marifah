'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Send,
  Loader2,
  Trash2,
  User as UserIcon,
  Table2,
  AlertTriangle,
  ShieldCheck,
  Clock3,
  Sparkles,
  Info,
} from 'lucide-react';
import { store } from '@/lib/store';
import type { UserProfile } from '@/lib/types';
import {
  ADMIN_CHAT_MAX_HISTORY,
  ADMIN_CHAT_MAX_MESSAGE,
  ADMIN_CHAT_MAX_PER_MINUTE,
  ADMIN_CHAT_MIN_INTERVAL_MS,
  ADMIN_CHAT_STORAGE_KEY,
  ADMIN_QUICK_QUESTIONS,
  type AdminQueryResult,
  type TelegramRuntimeStats,
} from '@/lib/chatbot-admin/types';
import { formatDateTimeIndo } from '@/lib/utils';

interface AdminMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  result?: AdminQueryResult;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function greeting(user: UserProfile): AdminMessage {
  return {
    id: 'admin-greeting',
    sender: 'assistant',
    timestamp: new Date().toISOString(),
    text:
      `Assalamu'alaikum ${user.name}.\n` +
      'Saya Asisten Admin berbasis data aplikasi. Saya hanya menjawab data yang boleh diakses role Anda, ' +
      'menyebutkan periode perhitungan untuk angka keuangan, dan tidak akan mengarang data yang tidak ada.\n' +
      'Silakan pilih pertanyaan cepat atau ketik pertanyaan Anda.',
  };
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function storageKeyFor(user: UserProfile): string {
  return `${ADMIN_CHAT_STORAGE_KEY}_${user.id}_${user.role}`;
}

export default function AdminChatbotPanel({ user }: { user: UserProfile }) {
  const storageKey = storageKeyFor(user);
  const [messages, setMessages] = useState<AdminMessage[]>([greeting(user)]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [telegramStats, setTelegramStats] = useState<TelegramRuntimeStats | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSentRef = useRef<number>(0);
  const sentWindowRef = useRef<number[]>([]);

  // Riwayat disimpan per akun+role agar role lain tidak melihat riwayat admin.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as AdminMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.slice(-ADMIN_CHAT_MAX_HISTORY));
          return;
        }
      }
    } catch {
      // Abaikan riwayat rusak; mulai dari sapaan.
    }
    setMessages([greeting(user)]);
  }, [storageKey, user]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-ADMIN_CHAT_MAX_HISTORY)));
    } catch {
      // Kuota localStorage penuh: percakapan tetap berjalan di memori.
    }
  }, [messages, storageKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/chatbot/admin', { method: 'GET', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setAiConfigured(Boolean(data?.aiConfigured));
      })
      .catch(() => undefined);
    fetch('/api/telegram/stats', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.stats) setTelegramStats(data.stats as TelegramRuntimeStats);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const canSend = useMemo(
    () => input.trim().length > 0 && input.trim().length <= ADMIN_CHAT_MAX_MESSAGE && !loading,
    [input, loading]
  );

  function push(message: AdminMessage) {
    setMessages((prev) => [...prev, message].slice(-ADMIN_CHAT_MAX_HISTORY));
  }

  async function classifyIntentWithAi(question: string): Promise<string | null> {
    if (!aiConfigured) return null;
    try {
      const res = await fetch('/api/chatbot/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.intent === 'string' ? data.intent : null;
    } catch {
      return null;
    }
  }

  async function handleSend(raw?: string) {
    const question = (raw ?? input).trim();
    if (!question || loading) return;
    if (question.length > ADMIN_CHAT_MAX_MESSAGE) {
      setError(`Pertanyaan maksimal ${ADMIN_CHAT_MAX_MESSAGE} karakter.`);
      return;
    }

    const now = Date.now();
    if (now - lastSentRef.current < ADMIN_CHAT_MIN_INTERVAL_MS) {
      setError('Mohon tunggu sebentar sebelum mengirim pertanyaan berikutnya.');
      return;
    }
    sentWindowRef.current = sentWindowRef.current.filter((t) => now - t < 60_000);
    if (sentWindowRef.current.length >= ADMIN_CHAT_MAX_PER_MINUTE) {
      setError('Batas pertanyaan per menit tercapai. Mohon tunggu sebentar.');
      return;
    }
    lastSentRef.current = now;
    sentWindowRef.current.push(now);
    setError(null);

    const userMessage: AdminMessage = {
      id: makeId('user'),
      sender: 'user',
      text: question,
      timestamp: new Date().toISOString(),
    };
    push(userMessage);
    setInput('');
    setLoading(true);

    try {
      // Beri jeda kecil agar indikator proses terlihat dan UI tidak membeku.
      await new Promise((resolve) => setTimeout(resolve, 320));
      let result = store.processAdminChatbotQuery(question, user, { telegramStats });

      // AI hanya dipakai untuk mengenali MAKSUD jika mesin lokal tidak yakin.
      // Yang dikirim hanya teks pertanyaan — bukan data, role, atau hasil query.
      if (result.meta.needsAiIntent) {
        const aiIntent = await classifyIntentWithAi(question);
        if (aiIntent) {
          result = store.processAdminChatbotQuery(question, user, {
            telegramStats,
            forcedIntent: aiIntent,
          });
        }
      }

      push({
        id: makeId('bot'),
        sender: 'assistant',
        text: result.answer,
        timestamp: new Date().toISOString(),
        result,
      });
    } catch {
      setError('Terjadi gangguan saat memproses pertanyaan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setMessages([greeting(user)]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Tidak masalah bila localStorage tidak tersedia.
    }
    setShowClearConfirm(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header panel */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-900 to-slate-900 px-4 sm:px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-emerald-400/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-gold-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Asisten Admin Al-Ma'rifah</h2>
            <p className="text-[11px] text-emerald-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Akses: {user.role.replace(/_/g, ' ')} • Data terkontrol RBAC
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
              aiConfigured
                ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                : 'bg-slate-500/20 text-slate-200 border-slate-400/30'
            }`}
            title="AI hanya membantu mengenali maksud pertanyaan. Data tetap diproses lokal."
          >
            <Sparkles className="w-3 h-3" />
            {aiConfigured ? 'AI intent aktif' : 'Mode lokal / FAQ'}
          </span>
          {showClearConfirm ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-[10px] font-bold"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold transition"
            >
              <Trash2 className="w-3 h-3" />
              Hapus riwayat
            </button>
          )}
        </div>
      </div>

      {/* Percakapan */}
      <div ref={scrollRef} className="h-[26rem] sm:h-[30rem] overflow-y-auto px-4 sm:px-6 py-4 space-y-4 bg-slate-50/70">
        {messages.length <= 1 && (
          <div className="text-center py-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
              <Bot className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-slate-700">Mulai dengan pertanyaan cepat</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Jawaban disertai periode, dasar perhitungan, dan waktu pengambilan data.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[92%] sm:max-w-[85%] ${message.sender === 'user' ? 'order-1' : ''}`}>
              <div
                className={`flex items-center gap-1.5 mb-1 ${
                  message.sender === 'user' ? 'justify-end' : ''
                }`}
              >
                {message.sender === 'assistant' ? (
                  <Bot className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className="text-[10px] font-semibold text-slate-500">
                  {message.sender === 'assistant' ? 'Asisten Admin' : user.name}
                </span>
                <span className="text-[9px] text-slate-400">{timeLabel(message.timestamp)}</span>
              </div>

              <div
                className={`rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm border ${
                  message.sender === 'user'
                    ? 'bg-emerald-700 text-white border-emerald-800 rounded-tr-sm'
                    : message.result && !message.result.ok
                      ? 'bg-amber-50 text-amber-950 border-amber-200 rounded-tl-sm'
                      : 'bg-white text-slate-800 border-slate-200 rounded-tl-sm'
                }`}
              >
                {message.result && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {message.result.ok ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span className="text-[11px] font-bold">{message.result.title}</span>
                  </div>
                )}

                <div className="whitespace-pre-line">{message.text}</div>

                {message.result?.bullets && message.result.bullets.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {message.result.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-1.5">
                        <span className="text-emerald-600 font-bold">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {message.result?.table && (
                  <div className="mt-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-1">
                      <Table2 className="w-3 h-3" />
                      Tabel data
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full text-[10.5px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            {message.result.table.columns.map((col) => (
                              <th key={col} className="px-2.5 py-2 text-left font-bold whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {message.result.table.rows.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx} className="px-2.5 py-1.5 align-top whitespace-nowrap">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {message.result.table.note && (
                      <p className="text-[10px] text-slate-500 mt-1.5 flex gap-1">
                        <Info className="w-3 h-3 shrink-0 mt-0.5" />
                        {message.result.table.note}
                      </p>
                    )}
                  </div>
                )}

                {message.result?.meta && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="w-3 h-3" />
                      Data diambil: {formatDateTimeIndo(message.result.meta.generatedAt)}
                    </span>
                    <span>• {message.result.meta.scopeLabel}</span>
                    {message.result.meta.periodLabel && <span>• Periode: {message.result.meta.periodLabel}</span>}
                    {message.result.meta.basis && (
                      <span className="w-full text-slate-500">Dasar: {message.result.meta.basis}</span>
                    )}
                  </div>
                )}

                {message.result?.suggestions && message.result.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.result.suggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void handleSend(suggestion)}
                        className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-600 flex items-center gap-2 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              Menganalisis pertanyaan dan mengambil data terkontrol…
            </div>
          </div>
        )}
      </div>

      {/* Pertanyaan cepat */}
      <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-white">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          Pertanyaan cepat
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ADMIN_QUICK_QUESTIONS.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => void handleSend(q.query)}
              disabled={loading}
              className="text-[10.5px] px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 transition disabled:opacity-60"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50">
        {error && (
          <p className="mb-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, ADMIN_CHAT_MAX_MESSAGE))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Tanyakan data santri, tagihan, pembayaran, tunggakan, keuangan…"
            className="flex-1 resize-none text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 max-h-24"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Kirim
          </button>
        </form>
        <p className="text-[9.5px] text-slate-400 mt-1.5">
          {input.length}/{ADMIN_CHAT_MAX_MESSAGE} karakter. Role diambil dari sesi login, bukan dari teks.
        </p>
      </div>
    </div>
  );
}
