import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getMyInvoices,
  getMyPaymentHistory,
  getMyStudents,
  getOutstandingBalance,
  getPaymentCategories,
  requestsForeignData,
  type ChatbotDataSource,
} from '@/lib/chatbot-tools';
import { formatRupiah } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';

/**
 * POST /api/chatbot/query — endpoint chatbot berbasis DATA AKTUAL.
 *
 * Keamanan:
 * - Identitas pengguna HANYA dari sesi Supabase Auth terverifikasi server
 *   (cookie http-only via getUser). TIDAK ADA user_id / role / NIS / ID
 *   apa pun yang diterima dari body frontend.
 * - Jika Supabase belum dikonfigurasi / sesi tidak valid → 503/401 jujur,
 *   frontend otomatis memakai FAQ offline + tools lokal. Tidak ada klaim palsu.
 * - Hanya fungsi READ-ONLY yang dipanggil. Tidak ada AI eksternal yang
 *   menerima data pribadi di endpoint ini.
 */

const MAX_LEN = 500;
const WINDOW_MS = 60_000;
const MAX_PER_MIN = 20;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_MIN;
}

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anon || url === 'https://your-project.supabase.co') return null;
  return createClient(url, anon);
}

type Row = Record<string, unknown>;
const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const num = (v: unknown, fb = 0): number => (typeof v === 'number' && !isNaN(v) ? v : fb);
const bool = (v: unknown): boolean => v === true;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'local';
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Terlalu banyak permintaan. Mohon tunggu sebentar.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return NextResponse.json({ error: 'Pesan tidak boleh kosong.' }, { status: 400 });
    if (message.length > MAX_LEN) {
      return NextResponse.json({ error: `Pesan maksimal ${MAX_LEN} karakter.` }, { status: 400 });
    }

    const sb = supabaseServer();
    if (!sb) {
      // Jujur: backend terverifikasi butuh Supabase Auth + database live.
      return NextResponse.json(
        { error: 'Backend data belum terhubung (Supabase belum dikonfigurasi). Chatbot memakai data lokal demo.', useLocal: true },
        { status: 503 }
      );
    }

    // Identitas TERVERIFIKASI server — satu-satunya sumber kebenaran.
    const { data: authData, error: authError } = await sb.auth.getUser();
    const authUser = authData?.user;
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Sesi login kedaluwarsa. Silakan login ulang.', useLocal: false }, { status: 401 });
    }

    // Profil + relasi dari database (RLS berlaku; service key TIDAK dipakai di sini).
    const { data: profile } = await sb.from('profiles').select('*').eq('auth_user_id', authUser.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Profil pengguna tidak ditemukan.' }, { status: 403 });
    }
    const p = profile as Row;

    // student_id wali/santri: santri dari relasi profil; wali dari guardian_student_relations.
    let studentId: string | undefined;
    let linkedIds: string[] | undefined;
    const role = str(p['role'], 'santri');
    if (role === 'santri') {
      const { data: s } = await sb.from('students').select('id').eq('id', str(p['id'])).single();
      studentId = (s as Row | null)?.['id'] as string | undefined;
    }
    const user: UserProfile = {
      id: str(p['id']),
      name: str(p['full_name'], 'Pengguna'),
      email: str(p['email'], authUser.email || ''),
      role: role as UserProfile['role'],
      phone: str(p['phone']),
      unitAccess: (p['unit_access'] as UserProfile['unitAccess']) || 'semua',
      studentId,
      linkedStudentIds: linkedIds,
      isActive: bool(p['is_active']) !== false,
      createdAt: str(p['createdAt'] ?? p['created_at'], new Date().toISOString()),
    };

    const q = async (table: string, select = '*') => {
      const { data } = await sb.from(table).select(select);
      return ((data || []) as unknown as Row[]);
    };

    const [students, invoices, payments, receipts, categories, notifications, relations] = await Promise.all([
      q('students'),
      q('invoices'),
      q('payments'),
      q('receipts'),
      q('payment_categories'),
      q('notifications'),
      q('guardian_student_relations'),
    ]);

    const ds: ChatbotDataSource = {
      getStudents: () =>
        students.map((s) => ({
          id: str(s['id']),
          no: num(s['no_urut']),
          nis: str(s['nis']),
          nama: str(s['nama']),
          jenisKelamin: (s['jenis_kelamin'] as 'L' | 'P') || 'L',
          usia: num(s['usia']),
          kelas: str(s['kelas']),
          asalDaerah: str(s['asal_daerah']),
          unit: (s['unit'] as 'putra' | 'putri') || 'putra',
          statusAktif: bool(s['status_aktif']) !== false,
          createdAt: str(s['created_at']),
          updatedAt: str(s['updated_at']),
        })),
      getInvoices: () =>
        invoices.map((i) => ({
          id: str(i['id']),
          nomorTagihan: str(i['nomor_tagihan']),
          studentId: str(i['student_id']),
          studentNis: '',
          studentNama: '',
          studentKelas: '',
          studentUnit: 'putra' as const,
          categoryId: str(i['category_id']),
          categoryCode: 'uang_makan' as const,
          categoryNama: '',
          periodeBulan: str(i['periode_bulan']),
          periodeTahun: num(i['periode_tahun']),
          nominal: num(i['nominal']),
          totalDibayar: num(i['total_dibayar']),
          sisaTagihan: num(i['sisa_tagihan']),
          tanggalTerbit: str(i['tanggal_terbit']),
          tenggatWaktu: str(i['tenggat_waktu']),
          status: (i['status'] as 'belum_dibayar' | 'menunggu_verifikasi' | 'lunas' | 'dibatalkan') || 'belum_dibayar',
          createdAt: str(i['created_at']),
          updatedAt: str(i['updated_at']),
        })),
      getPayments: () =>
        payments.map((x) => ({
          id: str(x['id']),
          nomorPembayaran: str(x['nomor_pembayaran']),
          invoiceId: str(x['invoice_id']),
          studentId: str(x['student_id']),
          studentNama: '',
          nominal: num(x['nominal']),
          metode: (x['metode'] as 'transfer_bank' | 'qris' | 'tunai') || 'transfer_bank',
          status: (x['status'] as 'menunggu_verifikasi' | 'terverifikasi' | 'ditolak' | 'kedaluwarsa') || 'menunggu_verifikasi',
          waktuPembayaran: str(x['waktu_pembayaran']),
          alasanPenolakan: str(x['alasan_penolakan'], undefined as unknown as string),
          nomorKuitansi: str(x['nomor_kuitansi'], undefined as unknown as string),
          createdAt: str(x['created_at']),
        })),
      getReceipts: () =>
        receipts.map((r) => ({
          id: str(r['id']),
          nomorKuitansi: str(r['nomor_kuitansi']),
          paymentId: str(r['payment_id']),
          invoiceId: str(r['invoice_id']),
          studentId: str(r['student_id']),
          studentNis: '',
          studentNama: '',
          studentKelas: '',
          studentUnit: 'putra' as const,
          kategoriNama: '',
          periode: '',
          nominal: num(r['nominal']),
          terbilang: str(r['terbilang']),
          metodePembayaran: (r['metode_pembayaran'] as 'transfer_bank' | 'qris' | 'tunai') || 'transfer_bank',
          tanggalBayar: str(r['tanggal_bayar']),
          tanggalTerbit: str(r['tanggal_terbit']),
          petugasNama: str(r['petugas_nama']),
          barcodeQrData: str(r['barcode_qr_data']),
        })),
      getCategories: () =>
        categories.map((c) => ({
          id: str(c['id']),
          code: (c['code'] as 'uang_makan' | 'spp_sekolah' | 'syariah_pondok') || 'uang_makan',
          nama: str(c['nama']),
          deskripsi: str(c['deskripsi']),
          nominalDefault: num(c['nominal_default']),
          isActive: bool(c['is_active']) !== false,
        })),
      getNotifications: () =>
        notifications.map((n) => ({
          id: str(n['id']),
          userId: str(n['user_id']),
          judul: str(n['judul']),
          pesan: str(n['pesan']),
          tipe: (n['tipe'] as 'info' | 'tagihan' | 'verifikasi' | 'penolakan' | 'sistem') || 'info',
          link: str(n['link'], undefined as unknown as string),
          dibaca: bool(n['dibaca']),
          createdAt: str(n['created_at']),
        })),
      getGuardianRelations: () =>
        relations.map((r) => ({
          id: str(r['id']),
          guardianId: str(r['guardian_id']),
          guardianName: '',
          guardianPhone: '',
          studentId: str(r['student_id']),
          studentName: '',
          relationship: 'Wali' as const,
          isVerified: bool(r['is_verified']),
          createdAt: str(r['created_at']),
        })),
    };

    const lower = message.toLowerCase();

    // Penolakan data keluarga lain — tanpa bocoran.
    if (requestsForeignData(message, user, ds)) {
      return NextResponse.json({
        reply: 'Mohon maaf, saya tidak dapat menampilkan data santri lain demi menjaga privasi setiap keluarga. Saya hanya dapat membantu data yang terhubung dengan akun Anda.',
        source: 'policy',
      });
    }

    // Tunggakan / sisa tagihan — angka dari database.
    if (lower.includes('tunggak') || lower.includes('sisa tagihan') || lower.includes('berapa') && lower.includes('tagihan')) {
      const res = getOutstandingBalance(user, ds);
      if (!res.ok) return NextResponse.json({ reply: res.error, source: 'db' });
      const { items, totalSisa, totalTunggakan } = res.data;
      if (items.length === 0) {
        return NextResponse.json({ reply: 'Alhamdulillah, tidak ada sisa tagihan untuk akun Anda berdasarkan data sistem.', source: 'db' });
      }
      const lines = items.slice(0, 10).map(
        (i) => `• ${i.nomorTagihan} — ${i.studentNama} (${i.categoryNama}, ${i.periode}): ${formatRupiah(i.sisa)}${i.isOverdue ? ' [MELEWATI TENGGAT]' : ''}`
      );
      return NextResponse.json({
        reply: `Total sisa tagihan: ${formatRupiah(totalSisa)}\nTotal tunggakan: ${formatRupiah(totalTunggakan)}\n\n${lines.join('\n')}`,
        source: 'db',
      });
    }

    // Status verifikasi milik pengguna.
    if (lower.includes('verifikasi') || lower.includes('status') || lower.includes('lunas')) {
      const hist = getMyPaymentHistory(user, ds);
      if (!hist.ok) return NextResponse.json({ reply: hist.error, source: 'db' });
      if (hist.data.length === 0) {
        return NextResponse.json({ reply: 'Belum ada transaksi pembayaran tercatat untuk akun Anda.', source: 'db' });
      }
      const lines = hist.data.slice(0, 5).map(
        (h) => `• ${h.payment.nomorPembayaran} (${h.categoryNama}): ${formatRupiah(h.payment.nominal)} — ${h.payment.status.replace(/_/g, ' ')}`
      );
      return NextResponse.json({
        reply: `Status transaksi Anda (dari database; "menunggu verifikasi" belum berarti lunas):\n\n${lines.join('\n')}`,
        source: 'db',
      });
    }

    // Ringkasan tagihan + kategori.
    if (lower.includes('tagihan')) {
      const inv = getMyInvoices(user, ds);
      const cat = getPaymentCategories(user, ds);
      if (!inv.ok) return NextResponse.json({ reply: inv.error, source: 'db' });
      const blm = inv.data.filter((i) => i.status === 'belum_dibayar').length;
      const tunggu = inv.data.filter((i) => i.status === 'menunggu_verifikasi').length;
      const lunas = inv.data.filter((i) => i.status === 'lunas').length;
      const cats = cat.ok ? cat.data.map((c) => c.nama).join(', ') : '';
      const names = getMyStudents(user, ds);
      const who = names.ok && names.data.length > 0 ? names.data.map((s) => s.nama).join(', ') : '';
      return NextResponse.json({
        reply: `Ringkasan tagihan ${who ? `untuk ${who}` : 'akun Anda'}:\n• ${blm} Belum Dibayar\n• ${tunggu} Menunggu Verifikasi\n• ${lunas} Lunas\n\nKategori aktif: ${cats}`,
        source: 'db',
      });
    }

    // Selain itu → FAQ umum (panduan, rekening resmi dari pengaturan).
    return NextResponse.json({ reply: '', useLocal: true, source: 'faq' });
  } catch {
    return NextResponse.json({ error: 'Terjadi gangguan layanan bantuan. Silakan coba lagi.' }, { status: 500 });
  }
}
