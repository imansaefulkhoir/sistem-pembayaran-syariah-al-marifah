'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  MessageCircle,
  X,
  Send,
  RotateCcw,
  Bot,
  User as UserIcon,
  Loader2,
  ChevronDown,
  Headset,
  AlertTriangle,
} from 'lucide-react';
import { store } from '@/lib/store';
import { ChatMessage, UserProfile, TicketCategory } from '@/lib/types';
import {
  CHATBOT_GREETING,
  QUICK_QUESTIONS,
  CHAT_LIMITS,
  answerLocally,
  backendAIAdapter,
  isAIConfigured,
  type AIChatTurn,
} from '@/lib/chatbot-data';
import { formatRupiah } from '@/lib/utils';

const QUICK_PAYLOAD_MAP: Record<string, string> = {
  cara_bayar: 'Bagaimana cara membayar tagihan?',
  cek_tagihan: 'Cek tagihan saya',
  status_bayar: 'Jelaskan status pembayaran',
  rekening: 'Berapa nomor rekening pondok?',
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function greetingMessage(): ChatMessage {
  return {
    id: makeId('bot'),
    sender: 'bot',
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    text: CHATBOT_GREETING,
  };
}

const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'konfirmasi_transfer', label: 'Konfirmasi transfer' },
  { value: 'koreksi_nominal', label: 'Koreksi nominal' },
  { value: 'kendala_upload', label: 'Kendala upload bukti' },
  { value: 'pertanyaan_rekening', label: 'Pertanyaan rekening' },
  { value: 'lainnya', label: 'Lainnya' },
];

export default function ChatbotWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showQuick, setShowQuick] = useState(true);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketCat, setTicketCat] = useState<TicketCategory>('konfirmasi_transfer');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketResult, setTicketResult] = useState('');
  const [lastSentAt, setLastSentAt] = useState(0);
  const [sentTimestamps, setSentTimestamps] = useState<number[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sembunyikan widget di halaman login agar tidak menutupi form.
  const hiddenOnRoutes = ['/login'];
  const isHidden = hiddenOnRoutes.includes(pathname || '');

  useEffect(() => {
    try {
      setUser(store.getCurrentUser());
    } catch {
      setUser(null);
    }
    setMessages([greetingMessage()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      setUser(store.getCurrentUser());
    } catch {
      setUser(null);
    }
  }, [pathname, open]);

  // Cek apakah AI backend aktif (kunci tetap di server, bukan di browser).
  useEffect(() => {
    let alive = true;
    isAIConfigured().then((ok) => {
      if (alive) setAiReady(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open, showTicketForm]);

  const pushUserMessage = (text: string): ChatMessage => {
    const msg: ChatMessage = {
      id: makeId('user'),
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      text,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const resolvePayload = (payload?: string, label?: string): string => {
    if (!payload) return label || '';
    return QUICK_PAYLOAD_MAP[payload] || payload;
  };

  const handleAction = (btn: NonNullable<ChatMessage['actionButtons']>[number]) => {
    if (btn.link) {
      setOpen(false);
      router.push(btn.link);
      return;
    }
    if (btn.actionPayload || btn.label) {
      sendMessage(resolvePayload(btn.actionPayload, btn.label));
    }
  };

  const sendMessage = (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setError('');
    setTicketResult('');

    // Batas ukuran pesan
    if (text.length > CHAT_LIMITS.maxMessageLength) {
      setError(`Pesan terlalu panjang. Maksimal ${CHAT_LIMITS.maxMessageLength} karakter.`);
      return;
    }
    // Batas frekuensi: jeda minimum + maksimal per menit
    const now = Date.now();
    if (now - lastSentAt < CHAT_LIMITS.minIntervalMs) {
      setError('Mohon tunggu sebentar sebelum mengirim pesan berikutnya.');
      return;
    }
    const recent = [...sentTimestamps, now].filter((t) => now - t < 60_000);
    if (recent.length > CHAT_LIMITS.maxMessagesPerMinute) {
      setError('Terlalu banyak permintaan. Mohon tunggu satu menit lalu coba lagi.');
      return;
    }
    setLastSentAt(now);
    setSentTimestamps(recent);

    // Jika formulir tiket terbuka dan pengguna mengetik kendala, arahkan mengisi form
    pushUserMessage(text.slice(0, CHAT_LIMITS.maxMessageLength));
    setInput('');
    setTyping(true);

    // Mesin FAQ lokal dijalankan lebih dulu: cepat, akurat, dan tidak pernah
    // mengirim data pribadi. Jika topik tidak dikenali dan AI aktif, pertanyaan
    // diteruskan ke backend tanpa identitas pengguna (kunci hanya di server).
    setTimeout(() => {
      (async () => {
        try {
          const local = answerLocally(text, user);
          if (local.meta?.confident !== false) {
            setMessages((prev) => [...prev, local]);
            return;
          }

          // Riwayat yang dikirim hanya giliran jawaban AI sebelumnya, supaya
          // jawaban lokal berisi nama/nominal tidak ikut terkirim.
          const history: AIChatTurn[] = messages
            .filter((m) => m.meta?.source === 'ai')
            .slice(-4)
            .map((m) => ({ role: 'assistant' as const, content: m.text.slice(0, 600) }));

          const ai = await backendAIAdapter.askViaBackend(text, history);
          setMessages((prev) => [...prev, ai || local]);
        } catch {
          setError('Terjadi kesalahan. Silakan tekan Ulangi.');
        } finally {
          setTyping(false);
        }
      })();
    }, 450);
  };

  const handleQuickAsk = (query: string) => {
    setShowQuick(false);
    sendMessage(query);
    // Tampilkan lagi tombol cepat setelah jawaban agar mudah eksplorasi
    setTimeout(() => setShowQuick(true), 1200);
  };

  const handleRetry = () => {
    setError('');
    setTyping(false);
  };

  const handleNewConversation = () => {
    setMessages([greetingMessage()]);
    setError('');
    setTicketResult('');
    setShowTicketForm(false);
    setShowQuick(true);
    setInput('');
  };

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    setTicketResult('');
    if (!user) {
      setTicketResult('Mohon login terlebih dahulu agar tiket tercatat atas nama akun Bapak/Ibu.');
      return;
    }
    const uraian = ticketDesc.trim();
    if (uraian.length < 10) {
      setTicketResult('Mohon tulis uraian masalah minimal 10 karakter agar petugas dapat membantu.');
      return;
    }
    if (uraian.length > 1000) {
      setTicketResult('Uraian terlalu panjang. Maksimal 1000 karakter.');
      return;
    }
    try {
      // Anti tiket ganda: tolak jika tiket terbuka dengan kategori+uraian sama dalam 5 menit terakhir
      const myTickets = store.getTickets().filter((t) => t.userId === user.id);
      const now = Date.now();
      const duplicate = myTickets.some(
        (t) =>
          t.kategori === ticketCat &&
          t.uraianMasalah.trim() === uraian &&
          now - new Date(t.createdAt).getTime() < 5 * 60 * 1000 &&
          (t.status === 'menunggu_petugas' || t.status === 'sedang_diproses')
      );
      if (duplicate) {
        setTicketResult('Tiket dengan isi yang sama baru saja dibuat. Mohon periksa halaman Bantuan, tidak perlu membuat tiket ganda.');
        return;
      }
      const ticket = store.createTicket({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userPhone: user.phone || '',
        kategori: ticketCat,
        subjek: `Bantuan via Chatbot: ${TICKET_CATEGORIES.find((c) => c.value === ticketCat)?.label}`,
        uraianMasalah: uraian,
        prioritas: 'sedang',
      });
      const confirm: ChatMessage = {
        id: makeId('bot'),
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        text: `Tiket bantuan ${ticket.nomorTiket} berhasil dibuat pada ${new Date(ticket.createdAt).toLocaleString('id-ID')} atas nama ${ticket.userName}. Status: Menunggu Petugas. Petugas bendahara akan menindaklanjuti. Bapak/Ibu dapat memantau di halaman Bantuan.`,
        actionButtons: [{ label: 'Pantau di Halaman Bantuan', link: '/bantuan', variant: 'primary' }],
      };
      setMessages((prev) => [...prev, confirm]);
      setTicketDesc('');
      setShowTicketForm(false);
      setTicketResult(`Tiket ${ticket.nomorTiket} tercatat.`);
    } catch {
      setTicketResult('Gagal membuat tiket. Silakan coba lagi atau buka halaman Bantuan.');
    }
  };

  if (isHidden) return null;

  return (
    <>
      {/* Tombol mengambang kanan bawah */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka Asisten Pembayaran Al-Ma'rifah"
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-xl shadow-emerald-900/30 border-2 border-gold-400 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold-400 border-2 border-white flex items-center justify-center">
            <Bot className="w-2.5 h-2.5 text-emerald-950" />
          </span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Asisten Pembayaran Al-Ma'rifah"
          className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:w-[400px] max-h-[85vh] h-[600px] max-sm:h-[75vh] bg-white rounded-2xl shadow-2xl border border-emerald-100 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/15 border border-gold-400 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-gold-300" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold leading-tight">Asisten Pembayaran Al-Ma&apos;rifah</h2>
              <p className="text-[11px] text-emerald-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse inline-block" />
                {aiReady ? 'Online — AI & FAQ siap membantu' : 'Online — FAQ siap membantu'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewConversation}
              title="Mulai percakapan baru"
              className="p-2 rounded-lg hover:bg-white/15 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Tutup chatbot"
              aria-label="Tutup chatbot"
              className="p-2 rounded-lg hover:bg-white/15 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Area pesan */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.sender === 'bot' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-700 text-gold-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div className={`max-w-[82%] space-y-1.5 ${m.sender === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-line shadow-xs ${
                      m.sender === 'user'
                        ? 'bg-emerald-700 text-white rounded-br-md'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                    }`}
                  >
                    {m.text}
                  </div>
                  {m.dataCard && (
                    <div className="bg-white border border-emerald-200 rounded-xl p-2.5 text-xs w-full shadow-xs">
                      <p className="font-bold text-slate-900">{m.dataCard.title}</p>
                      {m.dataCard.subtitle && <p className="text-slate-600">{m.dataCard.subtitle}</p>}
                      <div className="flex items-center justify-between mt-1">
                        {m.dataCard.status && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            {m.dataCard.status.replace(/_/g, ' ')}
                          </span>
                        )}
                        {typeof m.dataCard.nominal === 'number' && (
                          <span className="font-bold text-emerald-800">{formatRupiah(m.dataCard.nominal)}</span>
                        )}
                      </div>
                      {m.dataCard.details?.map((d, i) => (
                        <p key={i} className="text-[11px] text-slate-500 mt-0.5">
                          {d.label}: <span className="font-semibold text-slate-700">{d.value}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {m.actionButtons && m.actionButtons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.actionButtons.map((b, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleAction(b)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                            b.variant === 'primary'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : b.variant === 'escalate'
                              ? 'bg-gold-500 text-slate-900 hover:bg-gold-600'
                              : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="text-[10px] text-slate-400">{m.timestamp}</span>
                </div>
                {m.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gold-500 text-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {typing && (
              <div className="flex gap-2 items-center">
                <div className="w-7 h-7 rounded-full bg-emerald-700 text-gold-300 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span className="text-[11px] text-slate-500">Asisten sedang mengetik...</span>
                </div>
              </div>
            )}

            {/* Pertanyaan cepat */}
            {showQuick && !typing && (
              <div className="bg-white border border-emerald-100 rounded-xl p-2.5">
                <button
                  type="button"
                  onClick={() => setShowQuick(false)}
                  className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-800 mb-1.5"
                >
                  Pertanyaan cepat
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleQuickAsk(q.query)}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors text-left"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Formulir tiket mini */}
            {showTicketForm ? (
              <form onSubmit={handleSubmitTicket} className="bg-white border border-gold-300 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Headset className="w-4 h-4 text-emerald-700" />
                  Formulir Hubungi Bendahara
                </div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Kategori masalah
                  <select
                    value={ticketCat}
                    onChange={(e) => setTicketCat(e.target.value as TicketCategory)}
                    className="mt-1 w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Uraian masalah (tanpa password / data bank)
                  <textarea
                    value={ticketDesc}
                    onChange={(e) => setTicketDesc(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Contoh: Saya sudah transfer Rp 300.000 untuk SPP Oktober kemarin, tetapi status masih Menunggu Verifikasi."
                    className="mt-1 w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Kirim Tiket
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTicketForm(false)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowTicketForm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gold-500 text-slate-900 hover:bg-gold-600 transition-colors"
              >
                <Headset className="w-4 h-4" />
                Hubungi Bendahara
              </button>
            )}

            {ticketResult && (
              <p className="text-[11px] text-center font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
                {ticketResult}
              </p>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[11px] text-red-700 font-medium">{error}</p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-1 text-[11px] font-bold text-red-700 underline"
                  >
                    Ulangi
                  </button>
                </div>
              </div>
            )}

            {messages.length <= 1 && !error && (
              <p className="text-center text-[11px] text-slate-400">Belum ada hasil lain — silakan pilih pertanyaan cepat di atas.</p>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-2.5 border-t border-slate-200 bg-white flex gap-2 flex-shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ketik pertanyaan Bapak/Ibu..."
              maxLength={CHAT_LIMITS.maxMessageLength}
              className="flex-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Ketik pertanyaan"
            />
            <button
              type="submit"
              disabled={typing || !input.trim()}
              aria-label="Kirim pesan"
              className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
