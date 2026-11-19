'use client';

import React, { useEffect, useState } from 'react';
import { store } from '@/lib/store';
import { SupportTicket, TicketCategory, UserProfile } from '@/lib/types';
import { formatDateTimeIndo } from '@/lib/utils';
import {
  Headset,
  PlusCircle,
  Send,
  Ticket as TicketIcon,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'konfirmasi_transfer', label: 'Konfirmasi transfer' },
  { value: 'koreksi_nominal', label: 'Koreksi nominal' },
  { value: 'kendala_upload', label: 'Kendala upload bukti' },
  { value: 'pertanyaan_rekening', label: 'Pertanyaan rekening' },
  { value: 'lainnya', label: 'Lainnya' },
];

const STATUS_LABEL: Record<string, string> = {
  menunggu_petugas: 'Menunggu Petugas',
  sedang_diproses: 'Sedang Diproses',
  selesai: 'Selesai',
  ditutup: 'Ditutup',
};

export default function BantuanPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; senderName: string; pesan: string; createdAt: string; isPetugas: boolean }[]>([]);
  const [reply, setReply] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [kategori, setKategori] = useState<TicketCategory>('konfirmasi_transfer');
  const [subjek, setSubjek] = useState('');
  const [uraian, setUraian] = useState('');
  const [formMsg, setFormMsg] = useState('');

  const load = () => {
    const u = store.getCurrentUser();
    setUser(u);
    const all = store.getTickets();
    // RBAC: wali/santri hanya melihat tiket miliknya; petugas melihat semua.
    if (u.role === 'wali_santri' || u.role === 'santri') {
      setTickets(all.filter((t) => t.userId === u.id));
    } else {
      setTickets(all);
    }
  };

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, []);

  useEffect(() => {
    if (selectedId) {
      setMessages(store.getTicketMessages(selectedId));
    } else {
      setMessages([]);
    }
  }, [selectedId, tickets]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg('');
    if (!user) return;
    if (subjek.trim().length < 5) {
      setFormMsg('Mohon isi subjek minimal 5 karakter.');
      return;
    }
    if (uraian.trim().length < 10 || uraian.trim().length > 1000) {
      setFormMsg('Uraian minimal 10 karakter dan maksimal 1000 karakter.');
      return;
    }
    // Anti tiket ganda: subjek+uraian sama dalam 5 menit dengan status terbuka.
    const now = Date.now();
    const dup = store
      .getTickets()
      .some(
        (t) =>
          t.userId === user.id &&
          t.subjek.trim() === subjek.trim() &&
          t.uraianMasalah.trim() === uraian.trim() &&
          now - new Date(t.createdAt).getTime() < 5 * 60 * 1000 &&
          (t.status === 'menunggu_petugas' || t.status === 'sedang_diproses')
      );
    if (dup) {
      setFormMsg('Tiket yang sama baru saja dibuat. Tidak perlu membuat tiket ganda.');
      return;
    }
    const t = store.createTicket({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      userPhone: user.phone || '',
      kategori,
      subjek: subjek.trim(),
      uraianMasalah: uraian.trim(),
    });
    setSubjek('');
    setUraian('');
    setShowForm(false);
    load();
    setSelectedId(t.id);
    setFormMsg(`Tiket ${t.nomorTiket} tercatat pada ${formatDateTimeIndo(t.createdAt)}.`);
  };

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !user || !reply.trim()) return;
    if (reply.trim().length > 1000) return;
    const ticket = store.getTicketById(selectedId);
    const isPetugas = !['wali_santri', 'santri'].includes(user.role);
    store.addTicketMessage(selectedId, reply.trim(), user, isPetugas);
    // Jika petugas membalas, tandai sedang diproses; jika pelapor membalas tiket selesai, kembalikan menunggu.
    if (ticket) {
      if (isPetugas && ticket.status === 'menunggu_petugas') {
        store.updateTicketStatus(selectedId, 'sedang_diproses', user.id, user.name);
      }
    }
    setReply('');
    setMessages(store.getTicketMessages(selectedId));
    load();
  };

  const selected = selectedId ? store.getTicketById(selectedId) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Headset className="w-6 h-6 text-emerald-700" />
            Bantuan & Hubungi Bendahara
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Sampaikan kendala pembayaran. Setiap laporan tercatat sebagai tiket bernomor resmi beserta waktu, identitas pelapor, dan status penanganan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setFormMsg('');
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
        >
          <PlusCircle className="w-4 h-4" />
          Buat Tiket Baru
        </button>
      </div>

      {formMsg && (
        <div className="p-3 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          {formMsg}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900">Formulir Tiket Bantuan</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-700">
              Kategori masalah
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value as TicketCategory)}
                className="mt-1 w-full text-xs p-2 rounded-lg border border-slate-300"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Subjek
              <input
                value={subjek}
                onChange={(e) => setSubjek(e.target.value)}
                maxLength={120}
                placeholder="Contoh: Verifikasi transfer SPP Oktober"
                className="mt-1 w-full text-xs p-2 rounded-lg border border-slate-300"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Uraian masalah (jangan tulis password / PIN / OTP / data kartu)
            <textarea
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Tuliskan nomor tagihan, waktu transfer, dan kendala yang dialami..."
              className="mt-1 w-full text-xs p-2 rounded-lg border border-slate-300"
            />
          </label>
          <p className="text-[11px] text-slate-500">
            Tercatat atas nama: <strong>{user?.name}</strong> ({user?.role}) • Waktu otomatis tersimpan saat tiket dibuat.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Kirim Tiket
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Daftar tiket */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-bold text-sm text-slate-900">
            Daftar Tiket ({tickets.length})
          </div>
          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {tickets.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                Belum ada tiket. Silakan buat tiket baru jika membutuhkan bantuan bendahara.
              </p>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedId === t.id ? 'bg-emerald-50/60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <TicketIcon className="w-3.5 h-3.5 text-emerald-700" />
                      {t.nomorTiket}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 mt-1">{t.subjek}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{t.uraianMasalah}</p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDateTimeIndo(t.createdAt)} • {t.userName}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail + balasan */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-bold text-sm text-slate-900">
            {selected ? `Percakapan ${selected.nomorTiket}` : 'Pilih tiket untuk melihat percakapan'}
          </div>
          {!selected ? (
            <p className="p-6 text-center text-xs text-slate-400">
              Pilih salah satu tiket di samping untuk melihat rincian dan membalas petugas.
            </p>
          ) : (
            <>
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-600 space-y-0.5">
                <p><strong>Pelapor:</strong> {selected.userName} ({selected.userRole})</p>
                <p><strong>Kategori:</strong> {selected.kategori} • <strong>Status:</strong> {STATUS_LABEL[selected.status]}</p>
                <p><strong>Waktu dibuat:</strong> {formatDateTimeIndo(selected.createdAt)}</p>
              </div>
              <div className="flex-1 p-4 space-y-2.5 max-h-[320px] overflow-y-auto bg-slate-50/50">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-slate-400">Belum ada pesan.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.isPetugas ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${m.isPetugas ? 'bg-white border border-slate-200 text-slate-800' : 'bg-emerald-700 text-white'}`}>
                        <p className="font-bold text-[10px] opacity-80 mb-0.5">{m.senderName}</p>
                        <p className="whitespace-pre-line">{m.pesan}</p>
                        <p className="text-[10px] opacity-60 mt-1">{formatDateTimeIndo(m.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleReply} className="p-3 border-t border-slate-200 flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={1000}
                  placeholder="Tulis balasan..."
                  className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!reply.trim()}
                  className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40"
                  aria-label="Kirim balasan"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              {user && !['wali_santri', 'santri'].includes(user.role) && (
                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                  {(['menunggu_petugas', 'sedang_diproses', 'selesai', 'ditutup'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        store.updateTicketStatus(selected.id, s, user.id, user.name);
                        load();
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700"
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
              {selected.status === 'selesai' && (
                <p className="px-4 pb-3 text-[11px] text-emerald-700 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Tiket telah selesai ditangani.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
