'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { store } from '@/lib/store';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  GuardianStudentRelation,
  NotificationPreference,
  Student,
  UserProfile,
} from '@/lib/types';
import {
  Bell,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  UserCheck2,
  Users,
  X,
} from 'lucide-react';

interface GuardianGroup {
  guardianId: string;
  name: string;
  whatsapp: string;
  email?: string;
  user?: UserProfile;
  relations: GuardianStudentRelation[];
  allVerified: boolean;
  telegramUserId?: string;
}

function maskTelegramId(value?: string): string {
  if (!value) return '-';
  if (value.length <= 4) return value;
  return `••••${value.slice(-4)}`;
}

export default function WaliPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [relations, setRelations] = useState<GuardianStudentRelation[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGuardian, setSelectedGuardian] = useState('');
  const [selectedGuardianId, setSelectedGuardianId] = useState('');
  const [guardianWhatsapp, setGuardianWhatsapp] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [relationshipType, setRelationshipType] = useState<'Ayah' | 'Ibu' | 'Wali'>('Ayah');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal kelola kontak & Telegram
  const [managingGuardianId, setManagingGuardianId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [preference, setPreference] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [linkCode, setLinkCode] = useState('');
  const [linkDeepLink, setLinkDeepLink] = useState('');
  const [linkInstructions, setLinkInstructions] = useState('');
  const [linkExpiresAt, setLinkExpiresAt] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');

  const loadData = () => {
    setUser(store.getCurrentUser());
    setUsers(store.getAllUsers());
    setStudents(store.getStudents());
    setRelations(store.getGuardianRelations());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const groups = useMemo<GuardianGroup[]>(() => {
    const map = new Map<string, GuardianGroup>();
    for (const relation of relations) {
      const existing = map.get(relation.guardianId);
      const profile = users.find((item) => item.id === relation.guardianId);
      if (existing) {
        existing.relations.push(relation);
        existing.allVerified = existing.allVerified && relation.isVerified;
      } else {
        map.set(relation.guardianId, {
          guardianId: relation.guardianId,
          name: profile?.name || relation.guardianName,
          whatsapp: profile?.whatsapp || profile?.phone || relation.guardianPhone,
          email: profile?.email,
          user: profile,
          relations: [relation],
          allVerified: relation.isVerified,
          telegramUserId: profile?.telegramUserId,
        });
      }
    }
    return Array.from(map.values());
  }, [relations, users]);

  // Hak lihat: bendahara/pengurus melihat semua wali; wali hanya melihat
  // relasinya sendiri. Santri tidak berhak membuka halaman pengelolaan wali.
  const isAdmin = ['kepala_bendahara', 'admin_bendahara', 'pengurus_putra', 'pengurus_putri'].includes(
    user?.role || ''
  );
  const isWali = user?.role === 'wali_santri';
  const isSantri = user?.role === 'santri';

  const visibleGroups = groups.filter((group) => {
    if (isAdmin) return true;
    if (isWali && user) return group.guardianId === user.id;
    return false;
  });

  const filteredGroups = visibleGroups.filter(
    (group) =>
      group.name.toLowerCase().includes(search.toLowerCase()) ||
      group.whatsapp.toLowerCase().includes(search.toLowerCase()) ||
      group.relations.some((relation) =>
        relation.studentName.toLowerCase().includes(search.toLowerCase())
      )
  );

  const managingGroup = groups.find((group) => group.guardianId === managingGuardianId);

  const openContactModal = (group: GuardianGroup) => {
    setManagingGuardianId(group.guardianId);
    setContactName(group.name);
    setContactWhatsapp(group.whatsapp);
    setContactEmail(group.email || '');
    setPreference(group.user?.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE);
    setLinkCode('');
    setLinkDeepLink('');
    setLinkInstructions('');
    setLinkExpiresAt('');
    setLinkError('');
    setFeedbackMsg(null);
  };

  const handleSaveContact = () => {
    if (!managingGuardianId) return;
    const result = store.updateGuardianContact(managingGuardianId, {
      name: contactName,
      whatsapp: contactWhatsapp,
      email: contactEmail,
      notificationPreference: preference,
    });
    setFeedbackMsg({
      type: result.success ? 'success' : 'error',
      text: result.success
        ? 'Kontak wali dan preferensi notifikasi tersimpan. Nomor WhatsApp tidak otomatis menjadi tujuan Telegram.'
        : result.error || 'Gagal menyimpan kontak.',
    });
    loadData();
  };

  const handleCreateLink = async () => {
    if (!managingGuardianId) return;
    setLinkBusy(true);
    setLinkError('');
    const result = await store.createTelegramLink(managingGuardianId, contactName, preference.telegramEnabled);
    setLinkBusy(false);
    if (!result.ok) {
      setLinkError(result.error || 'Gagal membuat kode tautan Telegram.');
      return;
    }
    setLinkCode(result.code || '');
    setLinkDeepLink(result.deepLink || '');
    setLinkInstructions(result.instructions || '');
    setLinkExpiresAt(result.expiresAt || '');
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedbackMsg({ type: 'success', text: 'Teks disalin.' });
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Gagal menyalin; salin manual dari kotak kode.' });
    }
  };

  // Poll status tautan setelah kode dibuat. Tautan hanya disimpan setelah
  // server mengonfirmasi bot menerima /start dari akun Telegram tersebut.
  useEffect(() => {
    if (!linkCode || !managingGuardianId) return;
    let cancelled = false;
    let attempts = 0;

    const check = async () => {
      const result = await store.checkTelegramLink(linkCode);
      if (cancelled) return;
      if (result.ok && result.linked && result.telegramUserId) {
        const saved = store.applyVerifiedTelegramLink(managingGuardianId, {
          telegramUserId: result.telegramUserId,
          telegramUsername: result.telegramUsername,
          linkedAt: result.linkedAt,
        });
        setFeedbackMsg({
          type: saved.success ? 'success' : 'error',
          text: saved.success
            ? 'Telegram wali berhasil ditautkan dan terverifikasi melalui bot.'
            : saved.error || 'Tautan terverifikasi tetapi gagal disimpan lokal.',
        });
        setLinkCode('');
        loadData();
        return;
      }
      if (result.ok && result.expired) {
        setLinkError('Kode tautan kedaluwarsa. Buat kode baru.');
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        window.setTimeout(check, 3000);
      }
    };

    window.setTimeout(check, 2500);
    return () => {
      cancelled = true;
    };
  }, [linkCode, managingGuardianId]);

  const handleVerifyRelation = (relationId: string) => {
    const result = store.verifyGuardianRelation(relationId);
    setFeedbackMsg({
      type: result.success ? 'success' : 'error',
      text: result.success
        ? 'Relasi wali-santri diverifikasi. Wali kini berhak menerima notifikasi santri tersebut.'
        : result.error || 'Gagal memverifikasi relasi.',
    });
    loadData();
  };

  const handleAddRelation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedGuardian.trim() || !selectedStudent || !guardianWhatsapp.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Nama wali, WhatsApp, dan santri wajib diisi.' });
      return;
    }

    // Wali yang sudah ada (nama sama) dapat ditambahkan santri lain tanpa
    // membuat akun ganda.
    const existingGuardian = users.find(
      (item) =>
        item.role === 'wali_santri' &&
        item.name.trim().toLowerCase() === selectedGuardian.trim().toLowerCase()
    );

    const result = store.registerGuardian({
      guardianId: existingGuardian?.id,
      name: selectedGuardian.trim(),
      whatsapp: guardianWhatsapp.trim(),
      email: guardianEmail.trim() || undefined,
      studentIds: [selectedStudent],
      relationship: relationshipType,
      notificationsEnabled,
      verify: true,
    });

    if (!result.success) {
      setFeedbackMsg({ type: 'error', text: result.error || 'Gagal menghubungkan wali.' });
      return;
    }

    setFeedbackMsg({
      type: 'success',
      text: `Relasi wali ${selectedGuardian} dengan santri terhubung dan terverifikasi.`,
    });
    setShowAddModal(false);
    setSelectedGuardian('');
    setSelectedGuardianId(result.guardianId || '');
    setGuardianWhatsapp('');
    setGuardianEmail('');
    setSelectedStudent('');
    setRelationshipType('Ayah');
    setNotificationsEnabled(true);
    loadData();
  };

  const togglePreference = (key: keyof NotificationPreference) => {
    setPreference((current) => ({ ...current, [key]: !current[key] }));
  };

  if (isSantri) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center bg-white border border-red-200 rounded-2xl space-y-3">
        <ShieldCheck className="w-10 h-10 text-red-500 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900">Akses Ditolak</h1>
        <p className="text-sm text-slate-600">
          Pengelolaan data wali dan tautan Telegram hanya untuk bendahara, pengurus, dan wali yang
          bersangkutan.
        </p>
        <Link href="/dashboard" className="text-sm font-bold text-emerald-700 hover:underline">
          Kembali ke dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Data Wali Santri &amp; Tautan Telegram
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              {visibleGroups.length} wali •{' '}
              {visibleGroups.reduce((total, group) => total + group.relations.length, 0)} relasi
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Satu wali dapat menaungi beberapa santri. Nomor WhatsApp dan akun Telegram adalah dua kanal
            terpisah; Telegram hanya aktif setelah wali menekan Start dan mengirim kode tautan ke bot.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setShowAddModal(true);
              setFeedbackMsg(null);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-md shadow-indigo-950/20"
          >
            <Plus className="w-4 h-4" />
            Hubungkan Wali &amp; Santri
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-900 leading-relaxed">
          <p className="font-bold">Keamanan Akses Data Santri (Prinsip Privasi Syariah)</p>
          <p className="text-indigo-800/90 mt-0.5">
            Wali hanya dapat melihat dan menerima notifikasi untuk santri dengan relasi{' '}
            <strong className="text-emerald-700">terverifikasi</strong>. Kode tautan Telegram berlaku
            terbatas, sekali pakai, dan tidak pernah memakai nomor WhatsApp sebagai ID Telegram.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama wali, WhatsApp, atau santri..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="hidden sm:block text-[11px] text-slate-500">
          Tautan Telegram tidak dapat diisi manual; harus melalui verifikasi bot.
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">Wali Santri</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Santri Terhubung</th>
                <th className="px-4 py-3">Status Relasi</th>
                <th className="px-4 py-3">Telegram</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada wali yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => (
                  <tr key={group.guardianId} className="hover:bg-slate-50/80 transition-colors align-top">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{group.name}</div>
                      {group.email && <div className="text-[10px] text-slate-400">{group.email}</div>}
                      <div className="text-[10px] text-slate-400">{group.guardianId}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{group.whatsapp || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {group.relations.map((relation) => (
                          <div key={relation.id} className="flex items-center gap-1.5">
                            <LinkIcon className="w-3 h-3 text-emerald-600" />
                            <span className="font-semibold text-emerald-800">{relation.studentName}</span>
                            <span className="text-[10px] text-slate-400">({relation.relationship})</span>
                            {!relation.isVerified && isAdmin && (
                              <button
                                onClick={() => handleVerifyRelation(relation.id)}
                                className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold"
                              >
                                Verifikasi
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {group.allVerified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Terverifikasi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          Sebagian menunggu
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {group.telegramUserId && group.user?.telegramVerified ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                            <Send className="w-3.5 h-3.5" />
                            Terhubung
                          </span>
                          <div className="text-[10px] text-slate-400">
                            ID {maskTelegramId(group.telegramUserId)}
                            {group.user?.telegramUsername ? ` • @${group.user.telegramUsername}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                          <Bell className="w-3.5 h-3.5" />
                          Belum tertaut
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => openContactModal(group)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                        >
                          <UserCheck2 className="w-3.5 h-3.5" />
                          Kelola Kontak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal tambah relasi */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Hubungkan Akun Wali dengan Santri</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRelation} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Wali Santri
                </label>
                <input
                  type="text"
                  value={selectedGuardian}
                  onChange={(event) => {
                    setSelectedGuardian(event.target.value);
                    const existing = users.find(
                      (item) =>
                        item.role === 'wali_santri' &&
                        item.name.trim().toLowerCase() === event.target.value.trim().toLowerCase()
                    );
                    setSelectedGuardianId(existing?.id || '');
                    if (existing) {
                      setGuardianWhatsapp(existing.whatsapp || existing.phone || '');
                      setGuardianEmail(existing.email || '');
                    }
                  }}
                  placeholder="Contoh: Bpk. H. Rahmat Hidayat"
                  required
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
                {selectedGuardianId && (
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Wali sudah terdaftar — santri baru akan ditambahkan ke akun yang sama.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor WhatsApp Wali
                  </label>
                  <input
                    type="tel"
                    value={guardianWhatsapp}
                    onChange={(event) => setGuardianWhatsapp(event.target.value)}
                    placeholder="0812xxxxxxx"
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email (opsional)
                  </label>
                  <input
                    type="email"
                    value={guardianEmail}
                    onChange={(event) => setGuardianEmail(event.target.value)}
                    placeholder="wali@email.com"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Santri yang Dihubungkan
                </label>
                <select
                  value={selectedStudent}
                  onChange={(event) => setSelectedStudent(event.target.value)}
                  required
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                >
                  <option value="">-- Pilih Santri --</option>
                  {students.slice(0, 120).map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.nama} (NIS: {student.nis} - Kelas {student.kelas}{' '}
                      {student.unit.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hubungan Keluarga
                  </label>
                  <select
                    value={relationshipType}
                    onChange={(event) => setRelationshipType(event.target.value as 'Ayah' | 'Ibu' | 'Wali')}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="Ayah">Ayah Kandung</option>
                    <option value="Ibu">Ibu Kandung</option>
                    <option value="Wali">Wali Santri Sah</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mt-5">
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    onChange={(event) => setNotificationsEnabled(event.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Aktifkan notifikasi pembayaran
                </label>
              </div>

              <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
                Telegram tidak diisi di sini. Setelah relasi tersimpan, buka <strong>Kelola Kontak</strong>{' '}
                → <strong>Buat Kode Tautan</strong>, lalu wali mengirim <code>/start KODE</code> ke bot.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  Simpan &amp; Verifikasi Relasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal kelola kontak & Telegram */}
      {managingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4 my-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-700">
                  Kelola Kontak Wali
                </span>
                <h3 className="text-base font-extrabold text-slate-900">{managingGroup.name}</h3>
              </div>
              <button
                onClick={() => setManagingGuardianId(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Wali</label>
                <input
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={contactWhatsapp}
                  onChange={(event) => setContactWhatsapp(event.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email (opsional)</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-indigo-600" />
                  Preferensi Notifikasi Telegram
                </p>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={preference.telegramEnabled}
                    onChange={() => togglePreference('telegramEnabled')}
                  />
                  Aktif
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700">
                {(
                  [
                    ['onSubmitted', 'Saat bukti dikirim (menunggu)'],
                    ['onVerified', 'Terverifikasi umum'],
                    ['onPartial', 'Dibayar sebagian'],
                    ['onLunas', 'Lunas'],
                    ['onRejected', 'Ditolak + alasan'],
                    ['onCancelled', 'Dibatalkan'],
                  ] as Array<[keyof NotificationPreference, string]>
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={Boolean(preference[key])}
                      onChange={() => togglePreference(key)}
                      disabled={!preference.telegramEnabled}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                Status &quot;menunggu&quot; tidak pernah dikirim sebagai lunas. Jika Telegram belum tertaut,
                kuitansi tetap tersimpan dan notifikasi dicatat belum terkirim.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <Send className="w-4 h-4" />
                    Tautan Telegram
                  </p>
                  <p className="text-[10px] text-emerald-800">
                    {managingGroup.user?.telegramVerified && managingGroup.telegramUserId
                      ? `Terhubung sebagai ID ${maskTelegramId(managingGroup.telegramUserId)}.`
                      : 'Belum terhubung. Wali harus menekan Start di bot resmi.'}
                  </p>
                </div>
                <button
                  onClick={handleCreateLink}
                  disabled={linkBusy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${linkBusy ? 'animate-spin' : ''}`} />
                  {linkCode ? 'Buat Kode Baru' : 'Buat Kode Tautan'}
                </button>
              </div>

              {linkError && (
                <p className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  {linkError}
                </p>
              )}

              {linkCode && (
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-lg bg-white border border-emerald-300 font-mono text-xs font-bold text-emerald-900 tracking-wider">
                      /start {linkCode}
                    </code>
                    <button
                      onClick={() => copyText(`/start ${linkCode}`)}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold"
                    >
                      <Copy className="w-3 h-3" />
                      Salin
                    </button>
                  </div>
                  <p className="text-emerald-900">{linkInstructions || 'Kirim perintah di atas ke bot Telegram.'}</p>
                  {linkDeepLink && (
                    <a
                      href={linkDeepLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:underline"
                    >
                      Buka Bot Telegram <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {linkExpiresAt && (
                    <p className="text-[10px] text-emerald-800/80">
                      Kode berlaku sampai {new Date(linkExpiresAt).toLocaleString('id-ID')}. Halaman ini
                      memeriksa status tautan otomatis.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <Link href="/verifikasi" className="text-[11px] font-bold text-slate-500 hover:underline">
                Lihat status notifikasi
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManagingGuardianId(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Tutup
                </button>
                <button
                  onClick={handleSaveContact}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Kontak
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
