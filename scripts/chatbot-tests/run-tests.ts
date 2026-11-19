/**
 * Matriks pengujian chatbot (dijalankan di Node, tanpa browser).
 * Mencakup: wali 1 anak & multi-anak, santri mandiri, lintas-keluarga,
 * status belum/menunggu/terverifikasi, parsial, data kosong, semua role,
 * tanpa-AI (FAQ lokal), dan sesi kedaluwarsa (user null).
 */
import {
  createSupportTicket,
  getAccessibleStudentIds,
  getInvoiceDetails,
  getMyInvoices,
  getMyPaymentHistory,
  getMyStudents,
  getOutstandingBalance,
  getPaymentStatus,
  getReceiptStatus,
  requestsForeignData,
  type ChatbotDataSource,
} from '../../src/lib/chatbot-tools';
import { store } from '../../src/lib/store';
import type {
  Invoice,
  Payment,
  Student,
  UserProfile,
} from '../../src/lib/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`ok   - ${name}`);
  } else {
    failed++;
    console.log(`FAIL - ${name} ${detail}`);
  }
}

const mkStudent = (id: string, unit: 'putra' | 'putri', nis: string, nama: string): Student => ({
  id, no: 1, nis, nama, jenisKelamin: unit === 'putra' ? 'L' : 'P', usia: 15,
  kelas: 'X A', asalDaerah: 'Cirebon', unit, statusAktif: true,
  createdAt: '', updatedAt: '',
});

const mkInvoice = (id: string, studentId: string, status: Invoice['status'], sisa: number, tenggat: string): Invoice => ({
  id, nomorTagihan: `TGH-${id}`, studentId, studentNis: '', studentNama: studentId,
  studentKelas: 'X A', studentUnit: 'putra', categoryId: 'cat-1', categoryCode: 'uang_makan',
  categoryNama: 'Uang Makan', periodeBulan: 'Oktober 2026', periodeTahun: 2026,
  nominal: 450000, totalDibayar: 450000 - sisa, sisaTagihan: sisa,
  tanggalTerbit: '2026-10-01', tenggatWaktu: tenggat, status,
  createdAt: '', updatedAt: '',
});

const mkPayment = (id: string, invoiceId: string, studentId: string, status: Payment['status']): Payment => ({
  id, nomorPembayaran: `BYR-${id}`, invoiceId, studentId, studentNama: studentId,
  nominal: 450000, metode: 'transfer_bank', status, waktuPembayaran: '2026-10-02T10:00:00Z', createdAt: '',
});

const wali1: UserProfile = {
  id: 'wali-1', name: 'Wali Satu', email: 'w1@x.id', role: 'wali_santri', isActive: true, createdAt: '',
};
const santriA: UserProfile = {
  id: 'santri-a', name: 'Santri A', email: 'a@x.id', role: 'santri', studentId: 'std-A', isActive: true, createdAt: '',
};

const mockDs: ChatbotDataSource = {
  getStudents: () => [
    mkStudent('std-A', 'putra', '100001', 'Santri A'),
    mkStudent('std-B', 'putri', '100002', 'Santri B'),
    mkStudent('std-C', 'putra', '100003', 'Santri C'),
  ],
  getInvoices: () => [
    mkInvoice('inv-A1', 'std-A', 'belum_dibayar', 450000, '2026-10-20'),
    mkInvoice('inv-A2', 'std-A', 'menunggu_verifikasi', 300000, '2026-10-20'),
    mkInvoice('inv-B1', 'std-B', 'lunas', 0, '2026-10-20'),
    mkInvoice('inv-C1', 'std-C', 'belum_dibayar', 100000, '2026-09-01'), // overdue
  ],
  getPayments: () => [
    mkPayment('pay-A2', 'inv-A2', 'std-A', 'menunggu_verifikasi'),
    { ...mkPayment('pay-B1', 'inv-B1', 'std-B', 'terverifikasi'), nomorKuitansi: 'KWT-1' },
  ],
  getReceipts: () => [
    {
      id: 'rec-B1', nomorKuitansi: 'KWT-1', paymentId: 'pay-B1', invoiceId: 'inv-B1',
      studentId: 'std-B', studentNis: '100002', studentNama: 'Santri B', studentKelas: 'X A',
      studentUnit: 'putri', kategoriNama: 'Uang Makan', periode: 'Oktober 2026', nominal: 450000,
      terbilang: 'Empat Ratus Lima Puluh Ribu Rupiah', metodePembayaran: 'transfer_bank',
      tanggalBayar: '2026-10-02', tanggalTerbit: '2026-10-02', petugasNama: 'Bendahara',
      barcodeQrData: 'X',
    },
  ],
  getCategories: () => [],
  getNotifications: () => [],
  getGuardianRelations: () => [
    {
      id: 'rel-1', guardianId: 'wali-1', guardianName: 'Wali Satu', guardianPhone: '',
      studentId: 'std-A', studentName: 'Santri A', relationship: 'Ayah',
      isVerified: true, createdAt: '',
    },
    {
      id: 'rel-2', guardianId: 'wali-1', guardianName: 'Wali Satu', guardianPhone: '',
      studentId: 'std-C', studentName: 'Santri C', relationship: 'Ayah',
      isVerified: false, createdAt: '', // belum verifikasi → tanpa akses
    },
  ],
};

// 1. Wali satu anak terverifikasi
{
  const r = getMyStudents(wali1, mockDs);
  check('wali 1 anak terverifikasi', r.ok && r.data.length === 1 && r.data[0].id === 'std-A');
}
// 2. Relasi belum terverifikasi tidak memberi akses
{
  const ids = getAccessibleStudentIds(wali1, mockDs);
  check('relasi unverified dikecualikan', !ids.includes('std-C'));
  const inv = getInvoiceDetails(wali1, 'inv-C1', mockDs);
  check('wali tidak bisa baca invoice anak unverified', !inv.ok);
}
// 3. Wali multi-anak (tambah relasi kedua terverifikasi)
{
  const ds2: ChatbotDataSource = {
    ...mockDs,
    getGuardianRelations: () => [
      ...mockDs.getGuardianRelations(),
      {
        id: 'rel-3', guardianId: 'wali-1', guardianName: 'Wali Satu', guardianPhone: '',
        studentId: 'std-B', studentName: 'Santri B', relationship: 'Ayah',
        isVerified: true, createdAt: '',
      },
    ],
  };
  const r = getMyStudents(wali1, ds2);
  check('wali multi-anak (2 terverifikasi)', r.ok && r.data.length === 2);
}
// 4. Santri mandiri
{
  const r = getMyStudents(santriA, mockDs);
  check('santri hanya data sendiri', r.ok && r.data.length === 1 && r.data[0].id === 'std-A');
  const inv = getInvoiceDetails(santriA, 'inv-B1', mockDs);
  check('santri tidak bisa baca invoice santri lain', !inv.ok);
}
// 5. Lintas keluarga
{
  check(
    'NIS asing + frasa keluarga lain ditolak',
    requestsForeignData('Tolong tampilkan tagihan santri NIS 100002 milik keluarga lain', wali1, mockDs)
  );
  check(
    'NIS sendiri tidak ditolak',
    !requestsForeignData('Berapa tagihan NIS 100001 anak saya?', wali1, mockDs)
  );
}
// 6. Status: menunggu ≠ lunas; terverifikasi = lunas
{
  const p1 = getPaymentStatus(wali1, 'pay-A2', mockDs);
  check('menunggu_verifikasi bukan lunas', p1.ok && p1.data.isLunas === false);
  const waliB: UserProfile = { ...wali1, id: 'wali-B' };
  const dsB: ChatbotDataSource = {
    ...mockDs,
    getGuardianRelations: () => [
      {
        id: 'r', guardianId: 'wali-B', guardianName: 'WB', guardianPhone: '',
        studentId: 'std-B', studentName: 'Santri B', relationship: 'Ayah', isVerified: true, createdAt: '',
      },
    ],
  };
  const p2 = getPaymentStatus(waliB, 'pay-B1', dsB);
  check('terverifikasi = lunas', p2.ok && p2.data.isLunas === true);
}
// 7. Tunggakan: overdue + belum lunas; menunggu tetap dihitung sisa
{
  const r = getOutstandingBalance(wali1, mockDs, '2026-10-25');
  check(
    'tunggakan = overdue & belum lunas',
    r.ok && r.data.totalTunggakan === 750000 && r.data.totalSisa === 750000
  );
}
// 8. Parsial: sisa dari data sah
{
  const dsP: ChatbotDataSource = {
    ...mockDs,
    getInvoices: () => [mkInvoice('inv-P', 'std-A', 'belum_dibayar', 150000, '2026-11-20')],
  };
  const r = getOutstandingBalance(wali1, dsP, '2026-10-01');
  check('parsial: sisa 150rb bukan 450rb', r.ok && r.data.totalSisa === 150000 && r.data.totalTunggakan === 0);
}
// 9. Kuitansi gating
{
  const waliB: UserProfile = { ...wali1, id: 'wali-B' };
  const dsB: ChatbotDataSource = {
    ...mockDs,
    getGuardianRelations: () => [
      {
        id: 'r', guardianId: 'wali-B', guardianName: 'WB', guardianPhone: '',
        studentId: 'std-B', studentName: 'Santri B', relationship: 'Ayah', isVerified: true, createdAt: '',
      },
    ],
  };
  const okR = getReceiptStatus(waliB, 'inv-B1', dsB);
  check('kuitansi tersedia utk lunas', okR.ok && okR.data.available === true);
  const noR = getReceiptStatus(wali1, 'inv-A1', mockDs);
  check('kuitansi tidak tersedia utk belum bayar', noR.ok && noR.data.available === false);
}
// 10. Data kosong / tidak ditemukan
{
  const bad = getInvoiceDetails(wali1, 'inv-tidak-ada', mockDs);
  check('invoice tidak ada → NOT_FOUND', !bad.ok);
  const noRel: UserProfile = { ...wali1, id: 'wali-tanpa-relasi' };
  const denied = getMyInvoices(noRel, mockDs);
  check('tanpa relasi → ACCESS_DENIED', !denied.ok);
}
// 11. Role pengurus / kepala / bendahara / pengasuh
{
  const pengurus: UserProfile = { id: 'u', name: 'P', email: 'p@x.id', role: 'pengurus_putra', unitAccess: 'putra', isActive: true, createdAt: '' };
  const s = getMyStudents(pengurus, mockDs);
  check('pengurus_putra hanya unit putra', s.ok && s.data.every((x) => x.unit === 'putra') && s.data.length === 2);
  const kepri: UserProfile = { id: 'u', name: 'K', email: 'k@x.id', role: 'kepala_pondok_putri', unitAccess: 'putri', isActive: true, createdAt: '' };
  const s2 = getMyStudents(kepri, mockDs);
  check('kepala_pondok_putri hanya unit putri', s2.ok && s2.data.length === 1 && s2.data[0].id === 'std-B');
  const bend: UserProfile = { id: 'u', name: 'B', email: 'b@x.id', role: 'kepala_bendahara', unitAccess: 'semua', isActive: true, createdAt: '' };
  const s3 = getMyStudents(bend, mockDs);
  check('bendahara semua santri', s3.ok && s3.data.length === 3);
}
// 12. Tiket: validasi
{
  let created = 0;
  const bad = createSupportTicket(wali1, { kategori: 'lainnya', subjek: 'x', uraianMasalah: 'pendek' }, (() => { created++; return undefined as never; }) as never);
  check('tiket subjek/uraian pendek ditolak', !bad.ok && created === 0);
  const good = createSupportTicket(
    wali1,
    { kategori: 'konfirmasi_transfer', subjek: 'Verifikasi transfer SPP', uraianMasalah: 'Sudah transfer 300rb kemarin, mohon verifikasi.' },
    ((t: object) => { created++; return { id: 't', nomorTiket: 'TKT-1', ...t }; }) as never
  );
  check('tiket valid dibuat', good.ok && created === 1);
}
// 13. Store-level dengan data demo nyata (tanpa AI)
{
  const waliDemo: UserProfile = {
    id: 'usr-wali', name: 'Bpk. H. Rahmat Hidayat', email: 'wali.rahmat@gmail.com',
    role: 'wali_santri', phone: '081900112233', linkedStudentIds: ['std-1', 'std-51'],
    isActive: true, createdAt: '',
  };
  const t = store.processChatbotQuery('Berapa tunggakan SPP anak saya bulan ini?', waliDemo);
  check('store: tunggakan pakai angka nyata', t.text.includes('Total sisa tagihan') && t.text.includes('Rp'));
  const v = store.processChatbotQuery('Apakah pembayaran saya sudah diverifikasi?', waliDemo);
  check('store: status bedakan menunggu vs lunas', v.text.includes('Menunggu Verifikasi') && v.text.includes('Terverifikasi'));
  const f = store.processChatbotQuery('Tolong tampilkan tagihan santri NIS 202401002 milik keluarga lain', waliDemo);
  check('store: tolak data keluarga lain', f.text.includes('tidak dapat menampilkan data santri lain') && !f.text.includes('Ahmad Dahlan'));
  const q = store.processChatbotQuery('Bagaimana cara membayar menggunakan QRIS?', waliDemo);
  check('store: QRIS resmi tanpa karangan', q.text.includes('NMID') && q.text.includes('ID1020088921821'));
  const anon = store.processChatbotQuery('Berapa tunggakan saya?', null);
  check('store: tanpa login hanya panduan umum', anon.text.includes('login') && !anon.text.includes('Total sisa tagihan'));
}
// 14. IDENTITAS PENGGUNA — "siapa saya?" dijawab dari akun login (wali / santri / petugas).
{
  const waliDemo: UserProfile = { id: 'usr-wali', name: 'Bpk. H. Rahmat Hidayat', email: 'wali.rahmat@gmail.com', role: 'wali_santri', phone: '081900112233', linkedStudentIds: ['std-1', 'std-51'], isActive: true, createdAt: '' };
  const idWali = store.processChatbotQuery('Siapa saya sebagai wali santri?', waliDemo);
  check('wali: identitas wali santri', idWali.text.includes('wali santri') && idWali.text.includes('Bpk. H. Rahmat Hidayat'));
  const idSantri: UserProfile = { ...santriA, email: 'std1@almarifah.ponpes.id', role: 'santri', studentId: 'std-A' };
  const ans = store.processChatbotQuery('Siapa saya?', idSantri);
  check('santri: identitas santri', ans.text.includes('santri') && ans.text.includes('Santri A'));
  const idStaff = store.processChatbotQuery('Siapa saya?', {
    id: 'usr-kbendahara', name: 'Ust. H. Syarif Hidayat, M.E.', email: 'kepala.bendahara@almarifah.ponpes.id',
    role: 'kepala_bendahara', unitAccess: 'semua', isActive: true, createdAt: '',
  });
  check('petugas/bendahara: identitas petugas', idStaff.text.includes('petugas') && idStaff.text.includes('kepala_bendahara'));
}
// 15. COVERAGE FAQ — semua FAQ aktif di database harus dijawab mesin (bukan fallback).
{
  const waliDemo: UserProfile = { id: 'usr-wali', name: 'Bpk. H. Rahmat Hidayat', email: 'wali.rahmat@gmail.com', role: 'wali_santri', phone: '081900112233', linkedStudentIds: ['std-1', 'std-51'], isActive: true, createdAt: '' };
  const faqs = store.getFaqs();
  check('ada 7+ FAQ aktif', faqs.length >= 7, `jumlah=${faqs.length}`);
  let fallbackCount = 0;
  for (const faq of faqs) {
    const r = store.processChatbotQuery(faq.pertanyaan, waliDemo);
    if (r.meta?.confident === false) fallbackCount++;
  }
  check('semua FAQ masuk mesin jawab', fallbackCount === 0, `fallback=${fallbackCount}`);
}

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed === 0 ? 0 : 1);
