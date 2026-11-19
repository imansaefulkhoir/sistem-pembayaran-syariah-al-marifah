'use client';

import {
  Student,
  PaymentCategory,
  UserProfile,
  PesantrenSettings,
  Invoice,
  Payment,
  Receipt,
  AuditLog,
  NotificationItem,
  UserRole,
  GuardianStudentRelation,
  ChatbotFaq,
  SupportTicket,
  SupportTicketMessage,
  ChatMessage,
  TicketStatus,
  TicketCategory,
  GuardianNoticeStatus,
  PaymentStatusHistory,
  TelegramDeliveryLog,
  DEFAULT_NOTIFICATION_PREFERENCE,
  GuardianContact,
  GuardianRegistrationInput,
  GatewayEventSummary,
} from './types';
import {
  DEMO_STUDENTS,
  DEMO_PAYMENT_CATEGORIES,
  DEMO_USERS,
  DEMO_INVOICES,
  DEMO_PAYMENTS,
  DEMO_RECEIPTS,
  DEMO_NOTIFICATIONS,
  DEMO_AUDIT_LOGS,
  PESANTREN_INFO,
  DEMO_FAQS,
  DEMO_TICKETS,
  DEMO_TICKET_MESSAGES,
  DEMO_GUARDIAN_RELATIONS,
} from './demo-data';
import {
  generateInvoiceNumber,
  generatePaymentNumber,
  generateReceiptNumber,
  generateTicketNumber,
  angkaKeTerbilang,
  formatRupiah,
} from './utils';
import {
  getMyInvoices,
  getMyPaymentHistory,
  getMyStudents,
  getOutstandingBalance,
  requestsForeignData,
} from './chatbot-tools';
import type { ChatbotDataSource } from './chatbot-tools';
import { answerAdminQuestion } from './chatbot-admin/engine';
import type {
  AdminChatbotSource,
  AdminEngineOptions,
  AdminQueryResult,
} from './chatbot-admin/types';
import { notifyTelegramEvent } from './telegram/client';
import {
  cancelPaymentTransaction,
  rejectPaymentTransaction,
  reissueReceiptTransaction,
  verifyPaymentTransaction,
  type TransactionActor,
} from './payments/service';
import { applyInvoiceState, computeInvoiceState, guardianNoticeStatus } from './payments/state';
import type { InvoiceState } from './payments/state';
import {
  buildGuardianPaymentMessage,
  formatMetode,
  paymentNoticeKey,
  shouldSendNotice,
} from './payments/telegram';
import { cancelReceiptRecord } from './payments/receipt';

const STORAGE_KEYS = {
  CURRENT_USER: 'almarifah_curr_user',
  STUDENTS: 'almarifah_students',
  CATEGORIES: 'almarifah_categories',
  INVOICES: 'almarifah_invoices',
  PAYMENTS: 'almarifah_payments',
  RECEIPTS: 'almarifah_receipts',
  NOTIFICATIONS: 'almarifah_notifications',
  AUDIT_LOGS: 'almarifah_audit_logs',
  SETTINGS: 'almarifah_settings',
  GUARDIAN_RELATIONS: 'almarifah_guardian_relations',
  USERS: 'almarifah_users',
  FAQS: 'almarifah_faqs',
  TICKETS: 'almarifah_tickets',
  TICKET_MESSAGES: 'almarifah_ticket_messages',
  PAYMENT_STATUS_HISTORY: 'almarifah_payment_status_history',
  TELEGRAM_DELIVERIES: 'almarifah_telegram_deliveries',
  PROCESSED_NOTICE_KEYS: 'almarifah_processed_notice_keys',
  APPLIED_GATEWAY_EVENTS: 'almarifah_applied_gateway_events',
};

// RBAC Permissions Checker
export function canAccessModule(role: UserRole, module: string): boolean {
  switch (module) {
    case 'dashboard':
      return true; // all roles have a customized dashboard
    case 'santri':
      return [
        'pengasuh',
        'kepala_pondok_putra',
        'kepala_pondok_putri',
        'pengurus_putra',
        'pengurus_putri',
        'kepala_bendahara',
        'admin_bendahara',
        'anggota_bendahara',
      ].includes(role);
    case 'wali':
      return ['kepala_bendahara', 'admin_bendahara', 'pengasuh'].includes(role);
    case 'tagihan':
      return true; // Wali & Santri see their own; Bendahara & Pengasuh see all / unit
    case 'buat_tagihan':
      return ['kepala_bendahara', 'admin_bendahara'].includes(role);
    case 'verifikasi':
      return ['kepala_bendahara', 'admin_bendahara'].includes(role);
    case 'catat_tunai':
      return ['kepala_bendahara', 'admin_bendahara', 'anggota_bendahara'].includes(role);
    case 'transaksi':
      return true; // filtered by user/unit
    case 'laporan':
      return [
        'pengasuh',
        'kepala_pondok_putra',
        'kepala_pondok_putri',
        'kepala_bendahara',
        'admin_bendahara',
      ].includes(role);
    case 'pengguna':
      return ['kepala_bendahara'].includes(role);
    case 'pengaturan':
      return ['kepala_bendahara', 'pengasuh'].includes(role);
    case 'kuitansi':
      return true;
    case 'bantuan':
      return true; // all roles can access Help & Tickets
    case 'faq-admin':
      return ['kepala_bendahara', 'admin_bendahara', 'pengasuh'].includes(role);
    case 'asisten_admin':
      return [
        'pengasuh',
        'kepala_pondok_putra',
        'kepala_pondok_putri',
        'pengurus_putra',
        'pengurus_putri',
        'kepala_bendahara',
        'admin_bendahara',
        'anggota_bendahara',
      ].includes(role);
    default:
      return true;
  }
}

class AppStore {
  private isClient = typeof window !== 'undefined';

  private getItem<T>(key: string, defaultValue: T): T {
    if (!this.isClient) return defaultValue;
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setItem<T>(key: string, value: T): void {
    if (!this.isClient) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage quota exceeded or error writing to localStorage', e);
    }
  }

  // --- CURRENT USER & AUTH ---
  getCurrentUser(): UserProfile {
    return this.getItem<UserProfile>(STORAGE_KEYS.CURRENT_USER, DEMO_USERS[5]); // Default: Kepala Bendahara
  }

  setCurrentUser(user: UserProfile): void {
    this.setItem(STORAGE_KEYS.CURRENT_USER, user);
    this.addAuditLog(user.id, user.name, user.role, 'LOGIN', `Pengguna beralih sesi login sebagai ${user.role}`);
  }

  switchRole(role: UserRole): UserProfile {
    const targetUser = DEMO_USERS.find((u) => u.role === role) || {
      id: `usr-${role}`,
      name: `Pengguna ${role}`,
      email: `${role}@almarifah.ponpes.id`,
      role: role,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.setCurrentUser(targetUser);
    return targetUser;
  }

  getAllUsers(): UserProfile[] {
    return this.getItem<UserProfile[]>(STORAGE_KEYS.USERS, DEMO_USERS);
  }

  updateUser(user: UserProfile): void {
    const users = this.getAllUsers().map((u) => (u.id === user.id ? user : u));
    this.setItem(STORAGE_KEYS.USERS, users);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'UBAH_PENGGUNA', `Memperbarui data akun pengguna ${user.name}`);
  }

  /**
   * Titik masuk pendaftaran akun baru. Saat ini belum ada halaman registrasi
   * di aplikasi demo, tetapi bila ditambahkan nanti, panggil method ini agar
   * data tersimpan dan notifikasi Telegram `user_registered` otomatis terkirim.
   */
  addUser(
    userData: Omit<UserProfile, 'id' | 'createdAt'> & { id?: string }
  ): UserProfile {
    const users = this.getAllUsers();
    const newUser: UserProfile = {
      ...userData,
      id: userData.id || `usr-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    users.unshift(newUser);
    this.setItem(STORAGE_KEYS.USERS, users);

    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'DAFTAR_PENGGUNA', `Mendaftarkan akun baru ${newUser.name} (${newUser.email})`);

    notifyTelegramEvent('user_registered', {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role.replace(/_/g, ' '),
      reference: newUser.id,
      details: `Akun baru terdaftar dengan status ${newUser.isActive ? 'aktif' : 'non-aktif'}.`,
      url: '/pengguna',
    });

    return newUser;
  }

  // --- RELASI WALI-SANTRI (sumber kebenaran hak akses; hanya isVerified yang berlaku) ---
  getGuardianRelations(): GuardianStudentRelation[] {
    return this.getItem<GuardianStudentRelation[]>(STORAGE_KEYS.GUARDIAN_RELATIONS, DEMO_GUARDIAN_RELATIONS);
  }

  getVerifiedStudentIdsForGuardian(guardianId: string): string[] {
    return this.getGuardianRelations()
      .filter((r) => r.guardianId === guardianId && r.isVerified)
      .map((r) => r.studentId);
  }

  /** Adapter sumber data untuk backend tools chatbot (RBAC terverifikasi). */
  private chatbotSource(): ChatbotDataSource {
    return {
      getStudents: () => this.getStudents(),
      getInvoices: () => this.getInvoices(),
      getPayments: () => this.getPayments(),
      getReceipts: () => this.getReceipts(),
      getCategories: () => this.getCategories(),
      getNotifications: () => this.getNotifications(),
      getGuardianRelations: () => this.getGuardianRelations(),
    };
  }

  /**
   * Adapter data khusus asisten admin. Semua pembacaan tetap melalui
   * fungsi terkontrol di `src/lib/chatbot-admin/data.ts` yang memeriksa
   * capability dan unit. Di mode demo ini sumbernya localStorage; saat
   * Supabase aktif, cukup ganti isi adapter ini dengan query server.
   */
  adminChatbotSource(): AdminChatbotSource {
    return {
      getStudents: () => this.getStudents(),
      getInvoices: () => this.getInvoices(),
      getPayments: () => this.getPayments(),
      getReceipts: () => this.getReceipts(),
      getCategories: () => this.getCategories(),
      getNotifications: () => this.getNotifications(),
      getGuardianRelations: () => this.getGuardianRelations(),
      getUsers: () => this.getAllUsers(),
      getAuditLogs: () => this.getAuditLogs(),
      getTickets: () => this.getTickets(),
      getTelegramDeliveries: () => this.getTelegramDeliveries(),
      now: () => new Date(),
      logAccess: (entry) => {
        // Hanya akses sensitif/penolakan yang dicatat agar audit log tidak banjir.
        if (!/DENIED|INJECTION|FINANCE|USERS|AUDIT|TELEGRAM/.test(entry.action)) return;
        const curr = this.getCurrentUser();
        this.addAuditLog(curr.id, curr.name, curr.role, entry.action, entry.detail);
      },
    };
  }

  /**
   * Jalur resmi UI Asisten Admin. Role diambil dari sesi demo
   * (`getCurrentUser`) — TIDAK PERNAH dari teks pertanyaan.
   */
  processAdminChatbotQuery(
    question: string,
    user?: UserProfile | null,
    options?: AdminEngineOptions
  ): AdminQueryResult {
    const current = user ?? this.getCurrentUser();
    return answerAdminQuestion(question, current, this.adminChatbotSource(), {
      ...options,
      onAudit: (entry) => {
        this.addAuditLog(current.id, current.name, current.role, entry.action, entry.detail);
        options?.onAudit?.(entry);
      },
    });
  }

  // --- SANTRI ---
  getStudents(): Student[] {
    return this.getItem<Student[]>(STORAGE_KEYS.STUDENTS, DEMO_STUDENTS);
  }

  getStudentById(id: string): Student | undefined {
    return this.getStudents().find((s) => s.id === id);
  }

  addStudent(studentData: Omit<Student, 'id' | 'no' | 'createdAt' | 'updatedAt'>): Student {
    const list = this.getStudents();
    const newStudent: Student = {
      ...studentData,
      id: `std-${Date.now()}`,
      no: list.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(newStudent);
    this.setItem(STORAGE_KEYS.STUDENTS, list);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'TAMBAH_SANTRI', `Menambahkan santri baru ${newStudent.nama} (NIS: ${newStudent.nis})`);
    return newStudent;
  }

  updateStudent(student: Student): void {
    const list = this.getStudents().map((s) => (s.id === student.id ? { ...student, updatedAt: new Date().toISOString() } : s));
    this.setItem(STORAGE_KEYS.STUDENTS, list);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'UBAH_SANTRI', `Memperbarui data santri ${student.nama} (NIS: ${student.nis})`);
  }

  deleteStudent(id: string): void {
    const list = this.getStudents().filter((s) => s.id !== id);
    this.setItem(STORAGE_KEYS.STUDENTS, list);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'HAPUS_SANTRI', `Menghapus santri dengan ID ${id}`);
  }

  importStudentsFromCSV(students: Omit<Student, 'id' | 'no' | 'createdAt' | 'updatedAt'>[]): number {
    const currentList = this.getStudents();
    const existingNis = new Set(currentList.map((s) => s.nis));
    let count = 0;

    for (const item of students) {
      if (!existingNis.has(item.nis)) {
        currentList.push({
          ...item,
          id: `std-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          no: currentList.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingNis.add(item.nis);
        count++;
      }
    }

    this.setItem(STORAGE_KEYS.STUDENTS, currentList);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'IMPORT_CSV_SANTRI', `Mengimpor ${count} santri dari berkas CSV`);
    return count;
  }

  resetStudentsToDemo(): void {
    this.setItem(STORAGE_KEYS.STUDENTS, DEMO_STUDENTS);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'RESET_DEMO_SANTRI', 'Mereset data 100 santri demo');
  }

  // --- KATEGORI TAGIHAN ---
  getCategories(): PaymentCategory[] {
    return this.getItem<PaymentCategory[]>(STORAGE_KEYS.CATEGORIES, DEMO_PAYMENT_CATEGORIES);
  }

  updateCategory(category: PaymentCategory): void {
    const list = this.getCategories().map((c) => (c.id === category.id ? category : c));
    this.setItem(STORAGE_KEYS.CATEGORIES, list);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'UBAH_KATEGORI', `Mengubah kategori tarif ${category.nama}`);
  }

  // --- INVOICE / TAGIHAN ---
  getInvoices(): Invoice[] {
    return this.getItem<Invoice[]>(STORAGE_KEYS.INVOICES, DEMO_INVOICES);
  }

  getInvoiceById(id: string): Invoice | undefined {
    return this.getInvoices().find((inv) => inv.id === id);
  }

  createInvoice(data: {
    studentId: string;
    categoryId: string;
    periodeBulan: string;
    periodeTahun: number;
    nominal: number;
    tenggatWaktu: string;
    catatan?: string;
    /** Lewati notifikasi Telegram (dipakai untuk pembuatan tagihan massal). */
    silent?: boolean;
  }): { success: boolean; invoice?: Invoice; error?: string } {
    const student = this.getStudentById(data.studentId);
    if (!student) return { success: false, error: 'Data santri tidak ditemukan.' };

    const category = this.getCategories().find((c) => c.id === data.categoryId);
    if (!category) return { success: false, error: 'Kategori pembayaran tidak ditemukan.' };

    const invoices = this.getInvoices();

    // Cek duplikasi tagihan
    const exists = invoices.some(
      (inv) =>
        inv.studentId === data.studentId &&
        inv.categoryId === data.categoryId &&
        inv.periodeBulan.toLowerCase() === data.periodeBulan.toLowerCase() &&
        inv.periodeTahun === data.periodeTahun &&
        inv.status !== 'dibatalkan'
    );

    if (exists) {
      return {
        success: false,
        error: `Tagihan untuk ${student.nama} kategori ${category.nama} pada periode ${data.periodeBulan} sudah ada dalam sistem!`,
      };
    }

    const seq = invoices.length + 1;
    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      nomorTagihan: generateInvoiceNumber(seq),
      studentId: student.id,
      studentNis: student.nis,
      studentNama: student.nama,
      studentKelas: student.kelas,
      studentUnit: student.unit,
      categoryId: category.id,
      categoryCode: category.code,
      categoryNama: category.nama,
      periodeBulan: data.periodeBulan,
      periodeTahun: data.periodeTahun,
      nominal: data.nominal,
      totalDibayar: 0,
      sisaTagihan: data.nominal,
      tanggalTerbit: new Date().toISOString().split('T')[0],
      tenggatWaktu: data.tenggatWaktu,
      status: 'belum_dibayar',
      catatan: data.catatan || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    invoices.push(newInvoice);
    this.setItem(STORAGE_KEYS.INVOICES, invoices);

    const curr = this.getCurrentUser();
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'BUAT_TAGIHAN',
      `Menerbitkan ${newInvoice.nomorTagihan} untuk ${student.nama} sejumlah ${data.nominal}`
    );

    // Kirim notifikasi in-app
    this.addNotification({
      userId: student.waliId || 'usr-wali',
      targetRole: 'wali_santri',
      judul: `Tagihan Baru: ${category.nama}`,
      pesan: `Tagihan ${newInvoice.nomorTagihan} sebesar Rp ${data.nominal.toLocaleString('id-ID')} untuk ${student.nama} (${data.periodeBulan}) telah terbit.`,
      tipe: 'tagihan',
      link: `/tagihan/${newInvoice.id}`,
    });

    if (!data.silent) {
      notifyTelegramEvent('invoice_created', {
        name: curr.name,
        role: curr.role.replace(/_/g, ' '),
        amount: newInvoice.nominal,
        reference: newInvoice.nomorTagihan,
        details: `Santri: ${student.nama} • ${category.nama} • ${newInvoice.periodeBulan} ${newInvoice.periodeTahun} • jatuh tempo ${newInvoice.tenggatWaktu}`,
        url: `/tagihan/${newInvoice.id}`,
      });
    }

    return { success: true, invoice: newInvoice };
  }

  createBatchInvoices(data: {
    unit?: 'semua' | 'putra' | 'putri';
    kelas?: string;
    categoryId: string;
    periodeBulan: string;
    periodeTahun: number;
    nominal: number;
    tenggatWaktu: string;
    catatan?: string;
  }): { generated: number; skipped: number } {
    let targetStudents = this.getStudents().filter((s) => s.statusAktif);

    if (data.unit && data.unit !== 'semua') {
      targetStudents = targetStudents.filter((s) => s.unit === data.unit);
    }
    if (data.kelas && data.kelas !== 'semua') {
      targetStudents = targetStudents.filter((s) => s.kelas === data.kelas);
    }

    let generated = 0;
    let skipped = 0;

    for (const student of targetStudents) {
      const result = this.createInvoice({
        studentId: student.id,
        categoryId: data.categoryId,
        periodeBulan: data.periodeBulan,
        periodeTahun: data.periodeTahun,
        nominal: data.nominal,
        tenggatWaktu: data.tenggatWaktu,
        catatan: data.catatan,
        silent: true,
      });

      if (result.success) {
        generated++;
      } else {
        skipped++;
      }
    }

    const curr = this.getCurrentUser();
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'BUAT_TAGIHAN_MASSAL',
      `Menerbitkan ${generated} tagihan massal (${skipped} dilewati karena sudah ada) untuk periode ${data.periodeBulan}`
    );

    if (generated > 0) {
      notifyTelegramEvent('invoice_created', {
        name: curr.name,
        role: curr.role.replace(/_/g, ' '),
        amount: data.nominal * generated,
        reference: `${generated} tagihan`,
        details: `Tagihan massal periode ${data.periodeBulan} ${data.periodeTahun} • ${skipped} dilewati (sudah ada) • total ${generated} tagihan`,
        url: '/tagihan',
      });
    }

    return { generated, skipped };
  }

  // --- PEMBAYARAN (PAYMENT) ---
  getPayments(): Payment[] {
    return this.getItem<Payment[]>(STORAGE_KEYS.PAYMENTS, DEMO_PAYMENTS);
  }

  submitPayment(data: {
    invoiceId: string;
    metode: 'transfer_bank' | 'qris';
    bankTujuan: string;
    nomorRekeningTujuan?: string;
    namaPengirim: string;
    bankPengirim: string;
    nomorRef?: string;
    buktiPembayaranUrl: string;
    catatanPembayar?: string;
  }): { success: boolean; payment?: Payment; error?: string } {
    const invoice = this.getInvoiceById(data.invoiceId);
    if (!invoice) return { success: false, error: 'Tagihan tidak ditemukan.' };
    if (invoice.status === 'dibatalkan') {
      return { success: false, error: 'Tagihan ini sudah dibatalkan dan tidak dapat dibayar.' };
    }
    if (invoice.sisaTagihan <= 0) {
      return { success: false, error: 'Tagihan ini sudah lunas atau tidak memiliki sisa.' };
    }

    const payments = this.getPayments();
    const invoices = this.getInvoices();
    const at = new Date();
    const seq = payments.length + 1;

    const newPayment: Payment = {
      id: `pay-${at.getTime()}-${Math.floor(Math.random() * 10000)}`,
      nomorPembayaran: generatePaymentNumber(seq),
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      studentNama: invoice.studentNama,
      nominal: invoice.sisaTagihan,
      metode: data.metode,
      bankTujuan: data.bankTujuan,
      nomorRekeningTujuan: data.nomorRekeningTujuan,
      namaPengirim: data.namaPengirim,
      bankPengirim: data.bankPengirim,
      nomorRef: data.nomorRef || '',
      buktiPembayaranUrl: data.buktiPembayaranUrl,
      status: 'menunggu_verifikasi',
      waktuPembayaran: at.toISOString(),
      catatanPembayar: data.catatanPembayar || '',
      createdAt: at.toISOString(),
    };

    const updatedPayments = [newPayment, ...payments];
    const state = computeInvoiceState(invoice, updatedPayments);
    const updatedInvoice = applyInvoiceState(invoice, state, at.toISOString());

    this.setItem(STORAGE_KEYS.PAYMENTS, updatedPayments);
    this.setItem(
      STORAGE_KEYS.INVOICES,
      invoices.map((inv) => (inv.id === invoice.id ? updatedInvoice : inv))
    );

    const curr = this.getCurrentUser();
    const guardian = this.getGuardianForStudent(invoice.studentId);
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'KIRIM_PEMBAYARAN',
      `Mengunggah bukti pembayaran ${newPayment.nomorPembayaran} untuk ${invoice.nomorTagihan} sejumlah ${newPayment.nominal}. Status tetap MENUNGGU VERIFIKASI sampai dikonfirmasi sumber resmi.`
    );

    // Notifikasi untuk Admin Bendahara
    this.addNotification({
      userId: 'usr-admin-bendahara',
      targetRole: 'admin_bendahara',
      judul: 'Pembayaran Baru Menunggu Verifikasi',
      pesan: `Bukti transfer ${newPayment.nomorPembayaran} sebesar Rp ${newPayment.nominal.toLocaleString('id-ID')} untuk ${invoice.studentNama} menunggu verifikasi.`,
      tipe: 'verifikasi',
      link: '/verifikasi',
    });

    notifyTelegramEvent('payment_submitted', {
      name: curr.name,
      email: curr.email,
      role: curr.role.replace(/_/g, ' '),
      amount: newPayment.nominal,
      reference: newPayment.nomorPembayaran,
      details: `Santri: ${invoice.studentNama} • Tagihan ${invoice.nomorTagihan} • ${invoice.categoryNama} • Metode ${data.metode.replace(/_/g, ' ')} • Pengirim ${data.namaPengirim}`,
      url: `/tagihan/${invoice.id}`,
    });

    // Daftarkan niat pembayaran agar webhook gateway dapat mencocokkan nominal
    // dan referensi. Ini tidak menandai lunas dan tidak menerbitkan kuitansi.
    void this.registerGatewayIntent(newPayment, invoice, guardian);

    if (guardian) {
      void this.notifyGuardianForPayment({
        payment: newPayment,
        invoice: updatedInvoice,
        noticeStatus: 'menunggu_verifikasi',
        state,
      });
    } else {
      this.recordTelegramDelivery({
        id: `tg-${newPayment.id}-menunggu_verifikasi`,
        idempotencyKey: paymentNoticeKey(newPayment.id, 'menunggu_verifikasi', 'tanpa-wali'),
        studentId: invoice.studentId,
        studentNama: invoice.studentNama,
        studentNis: invoice.studentNis,
        paymentId: newPayment.id,
        noticeStatus: 'menunggu_verifikasi',
        status: 'no_destination',
        attempts: 0,
        messagePreview: 'Tidak ada wali terverifikasi dengan tujuan Telegram.',
        receiptAttached: false,
        fallbackLinkUsed: false,
        lastError: 'Wali belum terhubung atau relasi belum terverifikasi.',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      });
    }

    return { success: true, payment: newPayment };
  }

  recordCashPayment(data: {
    invoiceId: string;
    catatan: string;
  }): { success: boolean; payment?: Payment; receipt?: Receipt; error?: string } {
    const invoice = this.getInvoiceById(data.invoiceId);
    if (!invoice) return { success: false, error: 'Tagihan tidak ditemukan.' };
    if (invoice.sisaTagihan <= 0) {
      return { success: false, error: 'Tagihan ini sudah lunas atau tidak memiliki sisa.' };
    }

    const curr = this.getCurrentUser();
    const payments = this.getPayments();
    const invoices = this.getInvoices();
    const receipts = this.getReceipts();
    const at = new Date();
    const guardian = this.getGuardianForStudent(invoice.studentId);

    const seq = payments.length + 1;
    const newPayment: Payment = {
      id: `pay-${at.getTime()}-${Math.floor(Math.random() * 10000)}`,
      nomorPembayaran: generatePaymentNumber(seq),
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      studentNama: invoice.studentNama,
      nominal: invoice.sisaTagihan,
      metode: 'tunai',
      bankTujuan: 'Kas Tunai Bendahara Pesantren',
      status: 'menunggu_verifikasi',
      waktuPembayaran: at.toISOString(),
      catatanPembayar: data.catatan || 'Pembayaran tunai di loket kasir bendahara',
      createdAt: at.toISOString(),
    };

    const paymentsWithNew = [newPayment, ...payments];

    const result = verifyPaymentTransaction({
      paymentId: newPayment.id,
      payments: paymentsWithNew,
      invoices,
      receipts,
      actor: { id: curr.id, name: curr.name, role: curr.role },
      notes: 'Diterima tunai langsung oleh kasir bendahara.',
      at,
      source: 'kasir_tunai',
      guardian: guardian ? { id: guardian.id, name: guardian.name } : undefined,
    });

    if (!result.ok || !result.payment || !result.invoice || !result.state || !result.receipt) {
      return { success: false, error: result.error || 'Gagal mencatat pembayaran tunai.' };
    }

    this.setItem(
      STORAGE_KEYS.PAYMENTS,
      paymentsWithNew.map((p) => (p.id === result.payment!.id ? result.payment! : p))
    );
    this.setItem(
      STORAGE_KEYS.INVOICES,
      invoices.map((inv) => (inv.id === result.invoice!.id ? result.invoice! : inv))
    );
    this.setItem(STORAGE_KEYS.RECEIPTS, [result.receipt, ...receipts]);
    this.recordPaymentStatus(result.statusHistory);

    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'CATAT_PEMBAYARAN_TUNAI',
      `Mencatat pembayaran tunai ${invoice.nomorTagihan} (${invoice.studentNama}) senilai ${result.payment.nominal}. Kuitansi ${result.receipt.nomorKuitansi}.`
    );

    notifyTelegramEvent('cash_payment', {
      name: curr.name,
      email: curr.email,
      role: curr.role.replace(/_/g, ' '),
      amount: result.payment.nominal,
      reference: result.receipt.nomorKuitansi,
      details: `Tunai • Santri: ${invoice.studentNama} • Tagihan ${invoice.nomorTagihan} • ${invoice.categoryNama}`,
      url: `/kuitansi/${result.receipt.id}`,
    });

    void this.notifyGuardianForPayment({
      payment: result.payment,
      invoice: result.invoice,
      receipt: result.receipt,
      noticeStatus: result.noticeStatus || 'sebagian',
      state: result.state,
    });

    return { success: true, payment: result.payment, receipt: result.receipt };
  }

  // --- VERIFIKASI PEMBAYARAN ---
  verifyPayment(paymentId: string, approve: boolean, notes: string): { success: boolean; error?: string } {
    const payments = this.getPayments();
    const invoices = this.getInvoices();
    const receipts = this.getReceipts();
    const curr = this.getCurrentUser();
    const actor: TransactionActor = { id: curr.id, name: curr.name, role: curr.role };
    const at = new Date();
    const payment = payments.find((p) => p.id === paymentId);

    if (!payment) return { success: false, error: 'Data pembayaran tidak ditemukan.' };
    const invoice = invoices.find((inv) => inv.id === payment.invoiceId);
    if (!invoice) return { success: false, error: 'Tagihan tidak ditemukan.' };
    const guardian = this.getGuardianForStudent(invoice.studentId);

    if (approve) {
      const result = verifyPaymentTransaction({
        paymentId,
        payments,
        invoices,
        receipts,
        actor,
        notes,
        at,
        source: 'bendahara',
        guardian: guardian ? { id: guardian.id, name: guardian.name } : undefined,
      });

      if (!result.ok || !result.payment || !result.invoice || !result.state) {
        return { success: false, error: result.error || 'Gagal memverifikasi pembayaran.' };
      }

      const updatedPayments = payments.map((p) => (p.id === result.payment!.id ? result.payment! : p));
      const updatedInvoices = invoices.map((inv) => (inv.id === result.invoice!.id ? result.invoice! : inv));

      let updatedReceipts = receipts;
      if (result.receipt && result.createdReceipt) {
        updatedReceipts = [result.receipt, ...receipts];
      }

      this.setItem(STORAGE_KEYS.PAYMENTS, updatedPayments);
      this.setItem(STORAGE_KEYS.INVOICES, updatedInvoices);
      this.setItem(STORAGE_KEYS.RECEIPTS, updatedReceipts);
      this.recordPaymentStatus(result.statusHistory);

      this.addAuditLog(
        curr.id,
        curr.name,
        curr.role,
        result.alreadyVerified ? 'VERIFIKASI_PEMBAYARAN_IDEMPOTEN' : 'VERIFIKASI_PEMBAYARAN_DISETUJUI',
        result.alreadyVerified
          ? `Pembayaran ${payment.nomorPembayaran} sudah terverifikasi; tidak ada kuitansi/notifikasi baru.`
          : `Menyetujui pembayaran ${payment.nomorPembayaran} (${result.noticeStatus}) sebesar Rp ${payment.nominal.toLocaleString('id-ID')} untuk ${invoice.nomorTagihan}. Sisa tagihan Rp ${result.state.sisaTagihan.toLocaleString('id-ID')}.`
      );

      if (result.state.overpayment > 0) {
        this.addNotification({
          userId: 'usr-kbendahara',
          targetRole: 'kepala_bendahara',
          judul: 'Kelebihan Pembayaran Perlu Ditinjau',
          pesan: `Pembayaran ${payment.nomorPembayaran} untuk ${invoice.studentNama} melebihi total tagihan sebesar Rp ${result.state.overpayment.toLocaleString('id-ID')}. Selisih dicatat, tidak dihapus.`,
          tipe: 'verifikasi',
          link: `/kuitansi/${result.receipt?.id || ''}`,
        });
        this.addAuditLog(
          curr.id,
          curr.name,
          curr.role,
          'KELEBIHAN_PEMBAYARAN',
          `Kelebihan bayar Rp ${result.state.overpayment.toLocaleString('id-ID')} pada ${payment.nomorPembayaran} (${invoice.studentNama}).`
        );
      }

      this.addNotification({
        userId: guardian?.id || 'usr-wali',
        targetRole: 'wali_santri',
        judul:
          result.noticeStatus === 'lunas'
            ? 'Pembayaran Terverifikasi — LUNAS'
            : 'Pembayaran Terverifikasi — Sebagian',
        pesan:
          result.noticeStatus === 'lunas'
            ? `Alhamdulillah, pembayaran ${invoice.categoryNama} untuk ${invoice.studentNama} telah diverifikasi. Kuitansi ${result.receipt?.nomorKuitansi || '-'} telah terbit dan kewajiban lunas.`
            : `Pembayaran ${invoice.categoryNama} untuk ${invoice.studentNama} telah diverifikasi. Kuitansi ${result.receipt?.nomorKuitansi || '-'} terbit. Sisa tagihan Rp ${result.state.sisaTagihan.toLocaleString('id-ID')}.`,
        tipe: 'info',
        link: result.receipt ? `/kuitansi/${result.receipt.id}` : `/tagihan/${invoice.id}`,
      });

      notifyTelegramEvent('payment_verified', {
        name: curr.name,
        email: curr.email,
        role: curr.role.replace(/_/g, ' '),
        amount: payment.nominal,
        reference: payment.nomorPembayaran,
        details: `Disetujui • Santri: ${invoice.studentNama} • Tagihan ${invoice.nomorTagihan} • ${invoice.categoryNama} • Kuitansi ${result.receipt?.nomorKuitansi || '-'}`,
        url: result.receipt ? `/kuitansi/${result.receipt.id}` : `/tagihan/${invoice.id}`,
      });

      if (!result.alreadyVerified && result.receipt && result.statusHistory) {
        void this.notifyGuardianForPayment({
          payment: result.payment,
          invoice: result.invoice,
          receipt: result.receipt,
          noticeStatus: result.noticeStatus || guardianNoticeStatus(result.payment, result.state),
          state: result.state,
        });
      }

      return { success: true };
    }

    const result = rejectPaymentTransaction({
      paymentId,
      payments,
      invoices,
      actor,
      reason: notes,
      at,
      source: 'bendahara',
    });

    if (!result.ok || !result.payment || !result.invoice || !result.state) {
      return { success: false, error: result.error || 'Gagal menolak pembayaran.' };
    }

    this.setItem(
      STORAGE_KEYS.PAYMENTS,
      payments.map((p) => (p.id === result.payment!.id ? result.payment! : p))
    );
    this.setItem(
      STORAGE_KEYS.INVOICES,
      invoices.map((inv) => (inv.id === result.invoice!.id ? result.invoice! : inv))
    );
    this.recordPaymentStatus(result.statusHistory);

    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'VERIFIKASI_PEMBAYARAN_DITOLAK',
      `Menolak pembayaran ${payment.nomorPembayaran} dengan alasan: ${notes}`
    );

    this.addNotification({
      userId: guardian?.id || 'usr-wali',
      targetRole: 'wali_santri',
      judul: 'Pembayaran Ditolak',
      pesan: `Mohon maaf, pembayaran ${invoice.categoryNama} untuk ${invoice.studentNama} ditolak: ${notes}. Pembayaran ini tidak dihitung sebagai pelunasan. Silakan unggah bukti yang sah kembali.`,
      tipe: 'penolakan',
      link: `/tagihan/${invoice.id}`,
    });

    notifyTelegramEvent('payment_rejected', {
      name: curr.name,
      email: curr.email,
      role: curr.role.replace(/_/g, ' '),
      amount: payment.nominal,
      reference: payment.nomorPembayaran,
      details: `Ditolak • Santri: ${invoice.studentNama} • Tagihan ${invoice.nomorTagihan} • Alasan: ${notes}`,
      url: `/tagihan/${invoice.id}`,
    });

    void this.notifyGuardianForPayment({
      payment: result.payment,
      invoice: result.invoice,
      noticeStatus: 'ditolak',
      state: result.state,
      reason: notes,
    });

    return { success: true };
  }

  // --- KOREKSI PEMBAYARAN & KUITANSI (AUDITED) ---
  cancelPayment(paymentId: string, reason: string): { success: boolean; error?: string } {
    const payments = this.getPayments();
    const invoices = this.getInvoices();
    const receipts = this.getReceipts();
    const curr = this.getCurrentUser();

    if (!['kepala_bendahara', 'admin_bendahara'].includes(curr.role)) {
      return { success: false, error: 'Hanya bendahara berwenang yang dapat melakukan koreksi.' };
    }

    const result = cancelPaymentTransaction({
      paymentId,
      payments,
      invoices,
      receipts,
      actor: { id: curr.id, name: curr.name, role: curr.role },
      reason,
      at: new Date(),
    });
    if (!result.ok || !result.payment || !result.invoice || !result.state) {
      return { success: false, error: result.error || 'Gagal membatalkan pembayaran.' };
    }

    this.setItem(
      STORAGE_KEYS.PAYMENTS,
      payments.map((p) => (p.id === result.payment!.id ? result.payment! : p))
    );
    this.setItem(
      STORAGE_KEYS.INVOICES,
      invoices.map((inv) => (inv.id === result.invoice!.id ? result.invoice! : inv))
    );
    if (result.receipt) {
      this.setItem(
        STORAGE_KEYS.RECEIPTS,
        receipts.map((r) => (r.id === result.receipt!.id ? result.receipt! : r))
      );
    }
    this.recordPaymentStatus(result.statusHistory);
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'PEMBAYARAN_DIBATALKAN',
      `Membatalkan pembayaran ${result.payment.nomorPembayaran}: ${reason}`
    );
    this.notifyGuardianForPayment({
      payment: result.payment,
      invoice: result.invoice,
      noticeStatus: 'dibatalkan',
      state: result.state,
      reason,
    }).catch(() => undefined);

    return { success: true };
  }

  cancelReceipt(receiptId: string, reason: string): { success: boolean; error?: string } {
    const curr = this.getCurrentUser();
    if (!['kepala_bendahara', 'admin_bendahara'].includes(curr.role)) {
      return { success: false, error: 'Hanya bendahara berwenang yang dapat membatalkan kuitansi.' };
    }
    if (!reason.trim()) return { success: false, error: 'Alasan pembatalan wajib diisi.' };
    const receipts = this.getReceipts();
    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) return { success: false, error: 'Kuitansi tidak ditemukan.' };
    if ((receipt.status || 'aktif') !== 'aktif') {
      return { success: false, error: 'Kuitansi ini tidak berstatus aktif.' };
    }
    const cancelled = cancelReceiptRecord(receipt, curr, reason.trim(), new Date());
    this.setItem(
      STORAGE_KEYS.RECEIPTS,
      receipts.map((r) => (r.id === receipt.id ? cancelled : r))
    );
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'KUITANSI_DIBATALKAN',
      `Membatalkan kuitansi ${receipt.nomorKuitansi}: ${reason.trim()}`
    );
    return { success: true };
  }

  reissueReceipt(receiptId: string, reason: string): { success: boolean; error?: string; newReceiptId?: string } {
    const curr = this.getCurrentUser();
    if (!['kepala_bendahara', 'admin_bendahara'].includes(curr.role)) {
      return { success: false, error: 'Hanya bendahara berwenang yang dapat menerbitkan ulang kuitansi.' };
    }
    const result = reissueReceiptTransaction({
      receiptId,
      payments: this.getPayments(),
      invoices: this.getInvoices(),
      receipts: this.getReceipts(),
      actor: { id: curr.id, name: curr.name, role: curr.role },
      reason,
      at: new Date(),
    });
    if (!result.ok || !result.oldReceipt || !result.newReceipt) {
      return { success: false, error: result.error || 'Gagal menerbitkan ulang kuitansi.' };
    }
    const receipts = this.getReceipts().map((r) =>
      r.id === result.oldReceipt!.id ? result.oldReceipt! : r
    );
    this.setItem(STORAGE_KEYS.RECEIPTS, [result.newReceipt, ...receipts]);
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'KUITANSI_DITERBITKAN_ULANG',
      `Kuitansi ${result.oldReceipt.nomorKuitansi} diganti dengan ${result.newReceipt.nomorKuitansi}. Alasan: ${reason}`
    );
    return { success: true, newReceiptId: result.newReceipt.id };
  }

  // --- WALI: KONTAK, TAUTAN TELEGRAM, DAN NOTIFIKASI ---

  /** Wali terverifikasi untuk satu santri. `undefined` bila belum ada relasi sah. */
  getGuardianForStudent(studentId: string): GuardianContact | undefined {
    const relation = this.getGuardianRelations().find(
      (r) => r.studentId === studentId && r.isVerified
    );
    if (!relation) return undefined;

    const user = this.getAllUsers().find((u) => u.id === relation.guardianId);
    const linkedStudentIds = this.getGuardianRelations()
      .filter((r) => r.guardianId === relation.guardianId && r.isVerified)
      .map((r) => r.studentId);

    return {
      id: relation.guardianId,
      name: user?.name || relation.guardianName,
      phone: user?.phone || relation.guardianPhone,
      whatsapp: user?.whatsapp || user?.phone || relation.guardianPhone,
      email: user?.email,
      telegramUserId: user?.telegramUserId,
      telegramUsername: user?.telegramUsername,
      telegramVerified: user?.telegramVerified,
      telegramLinkedAt: user?.telegramLinkedAt,
      notificationPreference: user?.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE,
      linkedStudentIds,
    };
  }

  /**
   * Daftarkan/ubah kontak wali beserta relasi santri. Nomor WhatsApp dan
   * Telegram adalah dua kanal terpisah: WhatsApp tidak pernah dipakai sebagai
   * tujuan Telegram.
   */
  registerGuardian(
    data: GuardianRegistrationInput & { verify?: boolean }
  ): { success: boolean; guardianId?: string; error?: string } {
    const actor = this.getCurrentUser();
    const canManageGuardians = [
      'kepala_bendahara',
      'admin_bendahara',
      'pengurus_putra',
      'pengurus_putri',
      'pengasuh',
    ].includes(actor.role);
    if (!canManageGuardians) {
      return { success: false, error: 'Peran ini tidak berwenang menghubungkan wali dengan santri.' };
    }
    const name = data.name.trim();
    const whatsapp = data.whatsapp.trim();
    if (!name || !whatsapp) {
      return { success: false, error: 'Nama dan nomor WhatsApp wali wajib diisi.' };
    }
    if (data.studentIds.length === 0) {
      return { success: false, error: 'Pilih minimal satu santri.' };
    }

    const users = this.getAllUsers();
    const relations = this.getGuardianRelations();
    const guardianId = data.guardianId || `usr-wali-${Date.now()}`;
    const existingUser = users.find((u) => u.id === guardianId);
    const curr = this.getCurrentUser();
    const students = this.getStudents();

    const verifiedStudentIds = relations
      .filter((r) => r.guardianId === guardianId && r.isVerified)
      .map((r) => r.studentId);

    const profile: UserProfile = {
      id: guardianId,
      name,
      email: data.email?.trim() || existingUser?.email || `${guardianId}@wali.almarifah.ponpes.id`,
      role: 'wali_santri',
      phone: existingUser?.phone || whatsapp,
      whatsapp,
      telegramUserId: existingUser?.telegramUserId,
      telegramUsername: existingUser?.telegramUsername,
      telegramLinkedAt: existingUser?.telegramLinkedAt,
      telegramVerified: existingUser?.telegramVerified,
      notificationPreference: {
        ...(existingUser?.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE),
        telegramEnabled:
          data.notificationsEnabled ?? existingUser?.notificationPreference?.telegramEnabled ?? true,
      },
      unitAccess: existingUser?.unitAccess || 'semua',
      linkedStudentIds: Array.from(new Set([...verifiedStudentIds, ...data.studentIds])),
      isActive: true,
      createdAt: existingUser?.createdAt || new Date().toISOString(),
    };

    const nextUsers = existingUser
      ? users.map((u) => (u.id === guardianId ? profile : u))
      : [profile, ...users];

    const nextRelations = [...relations];
    for (const studentId of data.studentIds) {
      const student = students.find((s) => s.id === studentId);
      if (!student) continue;
      const already = nextRelations.find(
        (r) => r.guardianId === guardianId && r.studentId === studentId
      );
      if (already) {
        if (data.verify) {
          const index = nextRelations.findIndex((r) => r.id === already.id);
          nextRelations[index] = {
            ...already,
            guardianName: name,
            guardianPhone: whatsapp,
            relationship: data.relationship,
            isVerified: true,
            verifiedAt: already.verifiedAt || new Date().toISOString(),
            verifiedBy: already.verifiedBy || curr.name,
          };
        }
        continue;
      }
      nextRelations.unshift({
        id: `rel-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        guardianId,
        guardianName: name,
        guardianPhone: whatsapp,
        studentId,
        studentName: student.nama,
        relationship: data.relationship,
        isVerified: Boolean(data.verify),
        verifiedAt: data.verify ? new Date().toISOString() : undefined,
        verifiedBy: data.verify ? curr.name : undefined,
        createdAt: new Date().toISOString(),
      });
    }

    this.setItem(STORAGE_KEYS.USERS, nextUsers);
    this.setItem(STORAGE_KEYS.GUARDIAN_RELATIONS, nextRelations);
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      data.verify ? 'HUBUNGKAN_WALI_SANTRI' : 'DAFTAR_KONTAK_WALI',
      `${data.verify ? 'Menghubungkan' : 'Mendaftarkan'} wali ${name} (${whatsapp}) dengan ${data.studentIds.length} santri.`
    );

    return { success: true, guardianId };
  }

  /** Perbarui WhatsApp/preferensi tanpa menyentuh tautan Telegram yang terverifikasi. */
  updateGuardianContact(
    guardianId: string,
    patch: {
      name?: string;
      whatsapp?: string;
      email?: string;
      notificationPreference?: Partial<NonNullable<GuardianContact['notificationPreference']>>;
    }
  ): { success: boolean; error?: string } {
    const actor = this.getCurrentUser();
    const canManageGuardians = [
      'kepala_bendahara',
      'admin_bendahara',
      'pengurus_putra',
      'pengurus_putri',
      'pengasuh',
    ].includes(actor.role);
    if (!canManageGuardians && actor.id !== guardianId) {
      return { success: false, error: 'Anda hanya dapat mengubah kontak wali Anda sendiri.' };
    }
    const users = this.getAllUsers();
    const relation = this.getGuardianRelations().find((r) => r.guardianId === guardianId);
    const existing = users.find((u) => u.id === guardianId);
    if (!existing && !relation) return { success: false, error: 'Data wali tidak ditemukan.' };

    const name = patch.name?.trim() || existing?.name || relation?.guardianName || 'Wali Santri';
    const whatsapp = patch.whatsapp?.trim() || existing?.whatsapp || existing?.phone || relation?.guardianPhone || '';

    const profile: UserProfile = {
      id: guardianId,
      name,
      email: patch.email?.trim() || existing?.email || `${guardianId}@wali.almarifah.ponpes.id`,
      role: 'wali_santri',
      phone: existing?.phone || whatsapp,
      whatsapp,
      telegramUserId: existing?.telegramUserId,
      telegramUsername: existing?.telegramUsername,
      telegramLinkedAt: existing?.telegramLinkedAt,
      telegramVerified: existing?.telegramVerified,
      notificationPreference: {
        ...(existing?.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE),
        ...(patch.notificationPreference || {}),
      },
      unitAccess: existing?.unitAccess || 'semua',
      linkedStudentIds:
        existing?.linkedStudentIds ||
        this.getGuardianRelations()
          .filter((r) => r.guardianId === guardianId && r.isVerified)
          .map((r) => r.studentId),
      isActive: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    this.setItem(
      STORAGE_KEYS.USERS,
      existing ? users.map((u) => (u.id === guardianId ? profile : u)) : [profile, ...users]
    );

    this.setItem(
      STORAGE_KEYS.GUARDIAN_RELATIONS,
      this.getGuardianRelations().map((relation) =>
        relation.guardianId === guardianId
          ? { ...relation, guardianName: name, guardianPhone: whatsapp }
          : relation
      )
    );

    const curr = this.getCurrentUser();
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'UBAH_KONTAK_WALI',
      `Memperbarui kontak wali ${name}. WhatsApp tersimpan terpisah dari tautan Telegram.`
    );
    return { success: true };
  }

  verifyGuardianRelation(relationId: string): { success: boolean; error?: string } {
    const curr = this.getCurrentUser();
    if (!['kepala_bendahara', 'admin_bendahara', 'pengurus_putra', 'pengurus_putri'].includes(curr.role)) {
      return { success: false, error: 'Peran ini tidak berwenang memverifikasi relasi wali.' };
    }
    const relations = this.getGuardianRelations();
    const target = relations.find((r) => r.id === relationId);
    if (!target) return { success: false, error: 'Relasi tidak ditemukan.' };

    this.setItem(
      STORAGE_KEYS.GUARDIAN_RELATIONS,
      relations.map((r) =>
        r.id === relationId
          ? {
              ...r,
              isVerified: true,
              verifiedAt: new Date().toISOString(),
              verifiedBy: curr.name,
            }
          : r
      )
    );

    const users = this.getAllUsers();
    const user = users.find((u) => u.id === target.guardianId);
    if (user) {
      this.setItem(
        STORAGE_KEYS.USERS,
        users.map((u) =>
          u.id === target.guardianId
            ? {
                ...u,
                linkedStudentIds: Array.from(new Set([...(u.linkedStudentIds || []), target.studentId])),
              }
            : u
        )
      );
    }

    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'VERIFIKASI_RELASI_WALI',
      `Memverifikasi hubungan wali ${target.guardianName} dengan santri ${target.studentName}.`
    );
    return { success: true };
  }

  getGuardiansWithoutTelegram(): GuardianContact[] {
    const users = this.getAllUsers();
    const relations = this.getGuardianRelations().filter((r) => r.isVerified);
    const seen = new Set<string>();
    const result: GuardianContact[] = [];

    for (const relation of relations) {
      if (seen.has(relation.guardianId)) continue;
      seen.add(relation.guardianId);
      const user = users.find((u) => u.id === relation.guardianId);
      if (user?.telegramUserId && user.telegramVerified) continue;
      result.push({
        id: relation.guardianId,
        name: user?.name || relation.guardianName,
        phone: user?.phone || relation.guardianPhone,
        whatsapp: user?.whatsapp || user?.phone || relation.guardianPhone,
        email: user?.email,
        telegramUserId: user?.telegramUserId,
        telegramVerified: user?.telegramVerified,
        notificationPreference: user?.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE,
        linkedStudentIds: relations
          .filter((r) => r.guardianId === relation.guardianId)
          .map((r) => r.studentId),
      });
    }
    return result;
  }

  /** Buat kode tautan Telegram sekali pakai (server menyimpan kode + kedaluwarsa). */
  async createTelegramLink(
    guardianId: string,
    guardianName: string,
    notificationsEnabled = true
  ): Promise<{ ok: boolean; code?: string; deepLink?: string | null; instructions?: string; expiresAt?: string; error?: string }> {
    const actor = this.getCurrentUser();
    const canManageGuardians = [
      'kepala_bendahara',
      'admin_bendahara',
      'pengurus_putra',
      'pengurus_putri',
      'pengasuh',
    ].includes(actor.role);
    if (!canManageGuardians && actor.id !== guardianId) {
      return { ok: false, error: 'Anda hanya dapat menautkan Telegram untuk akun Anda sendiri.' };
    }
    const response = await this.apiPost('/api/telegram/link/start', {
      guardianId,
      guardianName,
      notificationsEnabled,
    });
    if (!response.ok) {
      return { ok: false, error: String(response.data?.error || 'Gagal membuat kode tautan.') };
    }
    return {
      ok: true,
      code: String(response.data?.code || ''),
      deepLink: (response.data?.deepLink as string | null) || null,
      instructions: String(response.data?.instructions || ''),
      expiresAt: String(response.data?.expiresAt || ''),
    };
  }

  async checkTelegramLink(code: string): Promise<{
    ok: boolean;
    linked?: boolean;
    expired?: boolean;
    telegramUserId?: string | null;
    telegramUsername?: string | null;
    linkedAt?: string | null;
    error?: string;
  }> {
    const response = await this.apiGet(`/api/telegram/link/status?code=${encodeURIComponent(code)}`);
    if (!response.ok) {
      return { ok: false, error: String(response.data?.error || 'Kode tidak ditemukan.') };
    }
    return {
      ok: true,
      linked: Boolean(response.data?.linked),
      expired: Boolean(response.data?.expired),
      telegramUserId: (response.data?.telegramUserId as string | null) || null,
      telegramUsername: (response.data?.telegramUsername as string | null) || null,
      linkedAt: (response.data?.linkedAt as string | null) || null,
    };
  }

  /**
   * Simpan hasil tautan yang SUDAH diverifikasi bot ke profil wali. Hanya
   * dipanggil setelah server mengonfirmasi `linked: true`.
   */
  applyVerifiedTelegramLink(
    guardianId: string,
    info: { telegramUserId: string; telegramUsername?: string | null; linkedAt?: string | null }
  ): { success: boolean; error?: string } {
    if (!/^\d{4,20}$/.test(info.telegramUserId)) {
      return { success: false, error: 'Telegram numeric user ID tidak valid.' };
    }
    const users = this.getAllUsers();
    const relation = this.getGuardianRelations().find((r) => r.guardianId === guardianId);
    const existing = users.find((u) => u.id === guardianId);
    if (!existing && !relation) return { success: false, error: 'Data wali tidak ditemukan.' };

    const profile: UserProfile = {
      id: guardianId,
      name: existing?.name || relation?.guardianName || 'Wali Santri',
      email: existing?.email || `${guardianId}@wali.almarifah.ponpes.id`,
      role: 'wali_santri',
      phone: existing?.phone || relation?.guardianPhone,
      whatsapp: existing?.whatsapp || existing?.phone || relation?.guardianPhone,
      telegramUserId: info.telegramUserId,
      telegramUsername: info.telegramUsername?.replace(/^@/, '') || existing?.telegramUsername,
      telegramLinkedAt: info.linkedAt || new Date().toISOString(),
      telegramVerified: true,
      notificationPreference: existing?.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE,
      unitAccess: existing?.unitAccess || 'semua',
      linkedStudentIds:
        existing?.linkedStudentIds ||
        this.getGuardianRelations()
          .filter((r) => r.guardianId === guardianId && r.isVerified)
          .map((r) => r.studentId),
      isActive: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    this.setItem(
      STORAGE_KEYS.USERS,
      existing ? users.map((u) => (u.id === guardianId ? profile : u)) : [profile, ...users]
    );

    const curr = this.getCurrentUser();
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'TAUTKAN_TELEGRAM_WALI',
      `Akun Telegram wali ${profile.name} terhubung dan terverifikasi melalui /start bot.`
    );
    return { success: true };
  }

  // --- RIWAYAT STATUS & LOG PENGIRIMAN TELEGRAM ---

  getPaymentStatusHistory(paymentId?: string): PaymentStatusHistory[] {
    const list = this.getItem<PaymentStatusHistory[]>(STORAGE_KEYS.PAYMENT_STATUS_HISTORY, []);
    return paymentId ? list.filter((item) => item.paymentId === paymentId) : list;
  }

  /** Catat perubahan status sekali saja per kunci idempotensi. */
  recordPaymentStatus(history?: PaymentStatusHistory): void {
    if (!history) return;
    const list = this.getItem<PaymentStatusHistory[]>(STORAGE_KEYS.PAYMENT_STATUS_HISTORY, []);
    if (list.some((item) => item.idempotencyKey === history.idempotencyKey)) return;
    this.setItem(STORAGE_KEYS.PAYMENT_STATUS_HISTORY, [history, ...list].slice(0, 3000));
  }

  getTelegramDeliveries(): TelegramDeliveryLog[] {
    return this.getItem<TelegramDeliveryLog[]>(STORAGE_KEYS.TELEGRAM_DELIVERIES, []);
  }

  /** Upsert log pengiriman berdasarkan kunci idempotensi. */
  recordTelegramDelivery(log: TelegramDeliveryLog): void {
    const list = this.getTelegramDeliveries();
    const existing = list.find((item) => item.idempotencyKey === log.idempotencyKey);
    // Status "sent" tidak boleh diturunkan oleh percobaan lama yang gagal.
    const status =
      existing?.status === 'sent' && log.status !== 'sent' ? 'sent' : log.status;
    const entry: TelegramDeliveryLog = {
      ...log,
      status,
      attempts: Math.max(existing?.attempts || 0, log.attempts || 0),
      createdAt: existing?.createdAt || log.createdAt,
      deliveredAt: log.deliveredAt || existing?.deliveredAt,
      lastError: status === 'sent' ? undefined : log.lastError || existing?.lastError,
      receiptAttached: log.receiptAttached || existing?.receiptAttached || false,
      fallbackLinkUsed: log.fallbackLinkUsed || existing?.fallbackLinkUsed || false,
    };
    this.setItem(
      STORAGE_KEYS.TELEGRAM_DELIVERIES,
      [entry, ...list.filter((item) => item.idempotencyKey !== log.idempotencyKey)].slice(0, 2000)
    );
  }

  /**
   * Kirim notifikasi ke wali berdasarkan STATUS DATABASE AKTUAL.
   * Kegagalan Telegram/PDF TIDAK PERNAH membatalkan pembayaran atau kuitansi.
   * Pesan dibangun ulang di server; browser hanya mengirim data terstruktur.
   */
  async notifyGuardianForPayment(input: {
    payment: Payment;
    invoice: Invoice;
    receipt?: Receipt;
    noticeStatus: GuardianNoticeStatus;
    state: InvoiceState;
    reason?: string;
    retry?: boolean;
  }): Promise<{ delivered: boolean; status: string; message: string }> {
    const { payment, invoice, receipt, noticeStatus, state, reason } = input;
    const at = new Date();
    const guardian = this.getGuardianForStudent(invoice.studentId);
    const key = paymentNoticeKey(payment.id, noticeStatus, guardian?.id);

    if (!guardian) {
      this.recordTelegramDelivery({
        id: `tg-${payment.id}-${noticeStatus}`,
        idempotencyKey: key,
        studentId: invoice.studentId,
        studentNama: invoice.studentNama,
        studentNis: invoice.studentNis,
        paymentId: payment.id,
        receiptId: receipt?.id,
        nomorKuitansi: receipt?.nomorKuitansi,
        noticeStatus,
        status: 'no_destination',
        attempts: 0,
        messagePreview: 'Tidak ada wali terverifikasi dengan tujuan Telegram.',
        receiptAttached: false,
        fallbackLinkUsed: false,
        lastError: 'Wali belum terhubung atau relasi belum terverifikasi.',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      });
      return { delivered: false, status: 'no_destination', message: 'Tidak ada tujuan Telegram wali.' };
    }

    const preference = guardian.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE;
    if (!shouldSendNotice(preference, noticeStatus)) {
      this.recordTelegramDelivery({
        id: `tg-${payment.id}-${noticeStatus}-${guardian.id}`,
        idempotencyKey: key,
        guardianId: guardian.id,
        guardianName: guardian.name,
        telegramUserId: guardian.telegramUserId,
        studentId: invoice.studentId,
        studentNama: invoice.studentNama,
        studentNis: invoice.studentNis,
        paymentId: payment.id,
        receiptId: receipt?.id,
        nomorKuitansi: receipt?.nomorKuitansi,
        noticeStatus,
        status: 'skipped',
        attempts: 0,
        messagePreview: 'Notifikasi dinonaktifkan oleh wali.',
        receiptAttached: false,
        fallbackLinkUsed: false,
        lastError: 'Preferensi notifikasi wali menonaktifkan status ini.',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      });
      return { delivered: false, status: 'skipped', message: 'Notifikasi dinonaktifkan oleh wali.' };
    }

    const processed = this.getItem<string[]>(STORAGE_KEYS.PROCESSED_NOTICE_KEYS, []);
    if (!input.retry && processed.includes(key)) {
      return { delivered: true, status: 'duplicate', message: 'Notifikasi status ini sudah pernah dikirim.' };
    }

    const settings = this.getSettings();
    const preview = buildGuardianPaymentMessage({
      status: noticeStatus,
      guardianName: guardian.name,
      studentName: invoice.studentNama,
      studentNis: invoice.studentNis,
      category: invoice.categoryNama,
      period: invoice.periodeBulan,
      amount: payment.nominal,
      metode: formatMetode(payment.metode),
      paidAt: payment.waktuPembayaran,
      receiptNumber: receipt?.nomorKuitansi,
      invoiceTotal: state.totalTagihan,
      totalVerified: state.totalTerverifikasi,
      remaining: state.sisaTagihan,
      overpayment: state.overpayment,
      reason,
      institutionName: settings.namaPondok,
    });

    let pdfBase64 = '';
    const canAttachPdf =
      Boolean(receipt) &&
      (receipt?.status || 'aktif') === 'aktif' &&
      !['ditolak', 'dibatalkan', 'menunggu_verifikasi'].includes(noticeStatus);

    if (receipt && canAttachPdf) {
      try {
        const { generateReceiptPdfBase64 } = await import('./pdf-generator');
        pdfBase64 = generateReceiptPdfBase64(receipt, settings).base64;
        // Simpan PDF di penyimpanan server meskipun Telegram belum tertaut.
        await this.apiPost('/api/receipts/store', {
          receiptId: receipt.id,
          paymentId: payment.id,
          guardianId: guardian.id,
          pdfBase64,
        });
      } catch {
        pdfBase64 = '';
      }
    }

    const response = await this.apiPost('/api/telegram/guardian-notify', {
      guardianId: guardian.id,
      studentId: invoice.studentId,
      studentName: invoice.studentNama,
      studentNis: invoice.studentNis,
      paymentId: payment.id,
      receiptId: receipt?.id,
      nomorKuitansi: receipt?.nomorKuitansi,
      noticeStatus,
      idempotencyKey: key,
      category: invoice.categoryNama,
      period: invoice.periodeBulan,
      paidAt: payment.waktuPembayaran,
      metode: payment.metode,
      reason,
      institutionName: settings.namaPondok,
      amount: payment.nominal,
      invoiceTotal: state.totalTagihan,
      totalVerified: state.totalTerverifikasi,
      remaining: state.sisaTagihan,
      overpayment: state.overpayment,
      notificationsEnabled: preference.telegramEnabled,
      receiptPdfBase64: pdfBase64 || undefined,
      retry: input.retry === true,
    });

    const data = response.data || {};
    const status = String(
      data.status || (response.ok ? 'failed' : 'failed')
    ) as TelegramDeliveryLog['status'];
    const delivered = Boolean(data.delivered) || status === 'sent' || status === 'duplicate';
    const message = String(data.message || (response.ok ? '' : 'Gagal menghubungi server notifikasi.'));

    this.recordTelegramDelivery({
      id: `tg-${payment.id}-${noticeStatus}-${guardian.id}`,
      idempotencyKey: key,
      guardianId: guardian.id,
      guardianName: guardian.name,
      telegramUserId: guardian.telegramUserId,
      studentId: invoice.studentId,
      studentNama: invoice.studentNama,
      studentNis: invoice.studentNis,
      paymentId: payment.id,
      receiptId: receipt?.id,
      nomorKuitansi: receipt?.nomorKuitansi,
      noticeStatus,
      status,
      attempts: 1,
      messagePreview: preview.preview,
      receiptAttached: Boolean(data.receiptAttached),
      fallbackLinkUsed: Boolean(data.fallbackLinkUsed),
      lastError: status === 'sent' ? undefined : message || undefined,
      createdAt: at.toISOString(),
      updatedAt: new Date().toISOString(),
      deliveredAt: status === 'sent' ? new Date().toISOString() : undefined,
    });

    // Hanya status terkirim yang dianggap selesai. Kegagalan/no_destination
    // tetap dapat dicoba ulang tanpa mengubah status pembayaran.
    if (status === 'sent') {
      this.setItem(STORAGE_KEYS.PROCESSED_NOTICE_KEYS, [key, ...processed].slice(0, 5000));
    }

    return { delivered, status, message };
  }

  /** Coba ulang pengiriman yang gagal/tanpa tujuan memakai data pembayaran terkini. */
  async retryTelegramNotification(deliveryId: string): Promise<{ ok: boolean; message: string }> {
    const delivery = this.getTelegramDeliveries().find((item) => item.id === deliveryId);
    if (!delivery) return { ok: false, message: 'Log pengiriman tidak ditemukan.' };

    const payment = this.getPayments().find((p) => p.id === delivery.paymentId);
    const invoice = payment ? this.getInvoices().find((inv) => inv.id === payment.invoiceId) : undefined;
    if (!payment || !invoice) {
      return { ok: false, message: 'Pembayaran/tagihan terkait tidak ditemukan.' };
    }
    const receipt = delivery.receiptId
      ? this.getReceipts().find((r) => r.id === delivery.receiptId)
      : undefined;
    const state = computeInvoiceState(invoice, this.getPayments());
    const result = await this.notifyGuardianForPayment({
      payment,
      invoice,
      receipt,
      noticeStatus: delivery.noticeStatus,
      state,
      retry: true,
    });

    this.addAuditLog(
      this.getCurrentUser().id,
      this.getCurrentUser().name,
      this.getCurrentUser().role,
      'COBA_ULANG_TELEGRAM',
      `Percobaan ulang notifikasi ${delivery.noticeStatus} untuk pembayaran ${payment.nomorPembayaran}: ${result.status}.`
    );
    return { ok: result.delivered, message: result.message };
  }

  // --- GATEWAY PEMBAYARAN (INTENT, EVENT, SIMULASI DEMO) ---

  async registerGatewayIntent(
    payment: Payment,
    invoice: Invoice,
    guardian?: GuardianContact
  ): Promise<{ ok: boolean; error?: string }> {
    const response = await this.apiPost('/api/payments/intents', {
      paymentId: payment.id,
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      studentNama: invoice.studentNama,
      nomorPembayaran: payment.nomorPembayaran,
      reference: payment.nomorRef || payment.nomorPembayaran,
      amount: payment.nominal,
      metode: payment.metode,
      guardianId: guardian?.id,
      guardianName: guardian?.name,
    });
    return { ok: response.ok, error: response.ok ? undefined : String(response.data?.error || '') };
  }

  getAppliedGatewayEvents(): string[] {
    return this.getItem<string[]>(STORAGE_KEYS.APPLIED_GATEWAY_EVENTS, []);
  }

  /**
   * Terapkan event gateway yang sudah lolos validasi server ke data lokal.
   * Memakai mesin verifikasi yang sama, sehingga kuitansi tidak pernah ganda.
   */
  applyGatewayEvent(event: GatewayEventSummary): { applied: boolean; message: string } {
    const appliedKeys = this.getAppliedGatewayEvents();
    if (appliedKeys.includes(event.eventId)) {
      return { applied: false, message: 'Event sudah pernah diterapkan.' };
    }

    const payments = this.getPayments();
    const invoices = this.getInvoices();
    const receipts = this.getReceipts();
    const payment = payments.find((p) => p.id === event.paymentId);
    const invoice = payment ? invoices.find((inv) => inv.id === payment.invoiceId) : undefined;
    if (!payment || !invoice) {
      return { applied: false, message: 'Pembayaran tidak ditemukan pada data lokal.' };
    }
    if (payment.status !== 'menunggu_verifikasi') {
      return { applied: false, message: `Status pembayaran ${payment.status}; event tidak diterapkan.` };
    }

    const curr = this.getCurrentUser();
    const guardian = this.getGuardianForStudent(invoice.studentId);
    const at = new Date(event.paidAt || Date.now());
    const result = verifyPaymentTransaction({
      paymentId: payment.id,
      payments,
      invoices,
      receipts,
      actor: { id: 'gateway', name: 'Gateway Pembayaran (tervalidasi)', role: 'sistem' },
      notes: 'Terkonfirmasi oleh webhook gateway dengan signature dan nominal yang cocok.',
      at,
      source: 'gateway',
      gatewayTransactionId: event.gatewayTransactionId,
      gatewayEventId: event.eventId,
      guardian: guardian ? { id: guardian.id, name: guardian.name } : undefined,
    });

    if (!result.ok || !result.payment || !result.invoice || !result.state) {
      return { applied: false, message: result.error || 'Gagal menerapkan event gateway.' };
    }

    this.setItem(
      STORAGE_KEYS.PAYMENTS,
      payments.map((p) => (p.id === result.payment!.id ? result.payment! : p))
    );
    this.setItem(
      STORAGE_KEYS.INVOICES,
      invoices.map((inv) => (inv.id === result.invoice!.id ? result.invoice! : inv))
    );
    if (result.receipt && result.createdReceipt) {
      this.setItem(STORAGE_KEYS.RECEIPTS, [result.receipt, ...receipts]);
    }
    this.recordPaymentStatus(result.statusHistory);
    this.setItem(
      STORAGE_KEYS.APPLIED_GATEWAY_EVENTS,
      [event.eventId, ...appliedKeys].slice(0, 2000)
    );

    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'VERIFIKASI_GATEWAY',
      `Event gateway ${event.eventId} diterapkan untuk ${payment.nomorPembayaran}. Status ${result.noticeStatus}. Kuitansi ${result.receipt?.nomorKuitansi || '-'}.`
    );

    if (result.receipt) {
      this.addNotification({
        userId: guardian?.id || 'usr-wali',
        targetRole: 'wali_santri',
        judul:
          result.noticeStatus === 'lunas'
            ? 'Pembayaran Gateway Terverifikasi — LUNAS'
            : 'Pembayaran Gateway Terverifikasi — Sebagian',
        pesan:
          result.noticeStatus === 'lunas'
            ? `Pembayaran ${invoice.categoryNama} untuk ${invoice.studentNama} terkonfirmasi gateway. Kuitansi ${result.receipt.nomorKuitansi}.`
            : `Pembayaran ${invoice.categoryNama} untuk ${invoice.studentNama} terkonfirmasi gateway. Sisa Rp ${result.state.sisaTagihan.toLocaleString('id-ID')}.`,
        tipe: 'info',
        link: `/kuitansi/${result.receipt.id}`,
      });
    }

    if (result.receipt) {
      void this.notifyGuardianForPayment({
        payment: result.payment,
        invoice: result.invoice,
        receipt: result.receipt,
        noticeStatus: result.noticeStatus || 'sebagian',
        state: result.state,
      });
    }

    return {
      applied: true,
      message: `Pembayaran diverifikasi otomatis. Kuitansi ${result.receipt?.nomorKuitansi || '-'}.`,
    };
  }

  async syncGatewayEvents(paymentId?: string): Promise<{ applied: number; checked: number; messages: string[] }> {
    const query = paymentId ? `?paymentId=${encodeURIComponent(paymentId)}` : '';
    const response = await this.apiGet(`/api/payments/events${query}`);
    if (!response.ok) {
      return { applied: 0, checked: 0, messages: ['Tidak dapat mengambil event gateway.'] };
    }
    const events = Array.isArray(response.data?.events)
      ? (response.data.events as GatewayEventSummary[])
      : [];
    const messages: string[] = [];
    let applied = 0;
    for (const event of events) {
      const result = this.applyGatewayEvent(event);
      if (result.applied) applied += 1;
      if (result.message) messages.push(result.message);
    }
    return { applied, checked: events.length, messages };
  }

  /**
   * Simulasi LOKAL saja: server hanya mengizinkan bila
   * ALLOW_DEMO_PAYMENT_SIMULATION=true atau bukan production.
   */
  async simulateGatewayConfirmation(paymentId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.apiPost('/api/payments/demo-confirm', { paymentId });
    if (!response.ok) {
      return {
        success: false,
        message: String(response.data?.error || response.data?.message || 'Simulasi gateway gagal.'),
      };
    }
    const sync = await this.syncGatewayEvents(paymentId);
    return {
      success: sync.applied > 0 || String(response.data?.status) === 'duplicate',
      message:
        sync.applied > 0
          ? `Simulasi berhasil. ${sync.messages[0] || ''}`.trim()
          : String(response.data?.message || 'Event gateway sudah tercatat.'),
    };
  }

  // --- HELPER HTTP KLIEN (tidak pernah menyimpan token) ---

  private async apiPost(
    path: string,
    payload: unknown
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
    if (!this.isClient) return { ok: false, status: 0, data: null };
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: response.ok, status: response.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  }

  private async apiGet(
    path: string
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
    if (!this.isClient) return { ok: false, status: 0, data: null };
    try {
      const response = await fetch(path, { cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: response.ok, status: response.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  }

  // --- KUITANSI ---
  getReceipts(): Receipt[] {
    return this.getItem<Receipt[]>(STORAGE_KEYS.RECEIPTS, DEMO_RECEIPTS);
  }

  getReceiptById(id: string): Receipt | undefined {
    return this.getReceipts().find((r) => r.id === id || r.paymentId === id || r.invoiceId === id);
  }

  // --- NOTIFIKASI ---
  getNotifications(): NotificationItem[] {
    return this.getItem<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, DEMO_NOTIFICATIONS);
  }

  addNotification(notif: Omit<NotificationItem, 'id' | 'dibaca' | 'createdAt'>): void {
    const list = this.getNotifications();
    const newItem: NotificationItem = {
      ...notif,
      id: `notif-${Date.now()}`,
      dibaca: false,
      createdAt: new Date().toISOString(),
    };
    list.unshift(newItem);
    this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  markNotificationAsRead(id: string): void {
    const list = this.getNotifications().map((n) => (n.id === id ? { ...n, dibaca: true } : n));
    this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  markAllNotificationsAsRead(): void {
    const list = this.getNotifications().map((n) => ({ ...n, dibaca: true }));
    this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  // --- AUDIT LOGS ---
  getAuditLogs(): AuditLog[] {
    return this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, DEMO_AUDIT_LOGS);
  }

  addAuditLog(userId: string, userName: string, userRole: UserRole, tindakan: string, rincian: string): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      userName,
      userRole,
      tindakan,
      rincian,
      createdAt: new Date().toISOString(),
    };
    logs.unshift(newLog);
    this.setItem(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 300)); // Simpan 300 aktivitas terakhir
  }

  // --- PENGATURAN PONDOK ---
  getSettings(): PesantrenSettings {
    return this.getItem<PesantrenSettings>(STORAGE_KEYS.SETTINGS, PESANTREN_INFO);
  }

  updateSettings(settings: PesantrenSettings): void {
    this.setItem(STORAGE_KEYS.SETTINGS, settings);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'UBAH_PENGATURAN', 'Memperbarui profil pondok dan data rekening syariah');
  }

  // --- TIKET DUKUNGAN & BANTUAN (SUPPORT TICKETS) ---
  getTickets(): SupportTicket[] {
    return this.getItem<SupportTicket[]>(STORAGE_KEYS.TICKETS, DEMO_TICKETS);
  }

  getTicketById(id: string): SupportTicket | undefined {
    return this.getTickets().find((t) => t.id === id || t.nomorTiket === id);
  }

  createTicket(data: {
    userId: string;
    userName: string;
    userRole: UserRole;
    userPhone?: string;
    studentId?: string;
    studentNama?: string;
    kategori: TicketCategory;
    subjek: string;
    uraianMasalah: string;
    prioritas?: 'rendah' | 'sedang' | 'tinggi';
  }): SupportTicket {
    const tickets = this.getTickets();
    const seq = tickets.length + 1;
    const nomorTiket = generateTicketNumber(seq);

    const newTicket: SupportTicket = {
      id: `tkt-${Date.now()}`,
      nomorTiket,
      userId: data.userId,
      userName: data.userName,
      userRole: data.userRole,
      userPhone: data.userPhone || '',
      studentId: data.studentId,
      studentNama: data.studentNama,
      kategori: data.kategori,
      subjek: data.subjek,
      uraianMasalah: data.uraianMasalah,
      status: 'menunggu_petugas',
      prioritas: data.prioritas || 'sedang',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tickets.unshift(newTicket);
    this.setItem(STORAGE_KEYS.TICKETS, tickets);

    // Initial message
    this.addTicketMessage(newTicket.id, data.uraianMasalah, {
      id: data.userId,
      name: data.userName,
      role: data.userRole,
      email: '',
      isActive: true,
      createdAt: new Date().toISOString(),
    }, false);

    // Audit log
    this.addAuditLog(
      data.userId,
      data.userName,
      data.userRole,
      'BUAT_TIKET_BANTUAN',
      `Membuat tiket ${nomorTiket} (${data.subjek})`
    );

    // Notification for bendahara
    this.addNotification({
      userId: 'usr-admin-bendahara',
      targetRole: 'admin_bendahara',
      judul: 'Tiket Bantuan Baru Masuk',
      pesan: `Tiket ${nomorTiket} dari ${data.userName} terkait: "${data.subjek}".`,
      tipe: 'info',
      link: '/bantuan',
    });

    notifyTelegramEvent('support_ticket', {
      name: data.userName,
      role: data.userRole.replace(/_/g, ' '),
      reference: nomorTiket,
      details: `Kategori ${data.kategori.replace(/_/g, ' ')} • Prioritas ${newTicket.prioritas} • Subjek: ${data.subjek}`,
      url: '/bantuan',
    });

    return newTicket;
  }

  updateTicketStatus(ticketId: string, status: TicketStatus, petugasId?: string, petugasNama?: string): void {
    const tickets = this.getTickets().map((t) =>
      t.id === ticketId
        ? {
            ...t,
            status,
            petugasId: petugasId || t.petugasId,
            petugasNama: petugasNama || t.petugasNama,
            updatedAt: new Date().toISOString(),
          }
        : t
    );
    this.setItem(STORAGE_KEYS.TICKETS, tickets);

    const curr = this.getCurrentUser();
    this.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'UBAH_STATUS_TIKET',
      `Mengubah status tiket ${ticketId} menjadi ${status}`
    );
  }

  getTicketMessages(ticketId: string): SupportTicketMessage[] {
    const allMessages = this.getItem<SupportTicketMessage[]>(
      STORAGE_KEYS.TICKET_MESSAGES,
      DEMO_TICKET_MESSAGES
    );
    return allMessages.filter((m) => m.ticketId === ticketId);
  }

  addTicketMessage(
    ticketId: string,
    pesan: string,
    senderUser: UserProfile,
    isPetugas: boolean
  ): SupportTicketMessage {
    const allMessages = this.getItem<SupportTicketMessage[]>(
      STORAGE_KEYS.TICKET_MESSAGES,
      DEMO_TICKET_MESSAGES
    );

    const newMsg: SupportTicketMessage = {
      id: `msg-${Date.now()}`,
      ticketId,
      senderId: senderUser.id,
      senderName: senderUser.name,
      senderRole: senderUser.role,
      pesan,
      isPetugas,
      createdAt: new Date().toISOString(),
    };

    allMessages.push(newMsg);
    this.setItem(STORAGE_KEYS.TICKET_MESSAGES, allMessages);

    // Update ticket's updatedAt
    const tickets = this.getTickets().map((t) =>
      t.id === ticketId ? { ...t, updatedAt: new Date().toISOString() } : t
    );
    this.setItem(STORAGE_KEYS.TICKETS, tickets);

    return newMsg;
  }

  // --- MANAJEMEN FAQ CHATBOT ---
  getFaqs(): ChatbotFaq[] {
    return this.getItem<ChatbotFaq[]>(STORAGE_KEYS.FAQS, DEMO_FAQS);
  }

  addFaq(faq: Omit<ChatbotFaq, 'id' | 'createdAt'>): ChatbotFaq {
    const faqs = this.getFaqs();
    const newFaq: ChatbotFaq = {
      ...faq,
      id: `faq-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    faqs.push(newFaq);
    this.setItem(STORAGE_KEYS.FAQS, faqs);

    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'TAMBAH_FAQ', `Menambah FAQ baru: "${newFaq.pertanyaan}"`);
    return newFaq;
  }

  updateFaq(faq: ChatbotFaq): void {
    const faqs = this.getFaqs().map((f) => (f.id === faq.id ? faq : f));
    this.setItem(STORAGE_KEYS.FAQS, faqs);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'UBAH_FAQ', `Memperbarui FAQ ID ${faq.id}`);
  }

  deleteFaq(id: string): void {
    const faqs = this.getFaqs().filter((f) => f.id !== id);
    this.setItem(STORAGE_KEYS.FAQS, faqs);
    const curr = this.getCurrentUser();
    this.addAuditLog(curr.id, curr.name, curr.role, 'HAPUS_FAQ', `Menghapus FAQ ID ${id}`);
  }

  // --- MESIN PERCAKAPAN CHATBOT (INTELLIGENT FAQ & DATA ENGINE) ---
  // FAQ offline-first. Tidak memanggil AI eksternal, tidak memakai NIS/ID
  // ketikan pengguna untuk akses data. Data pribadi hanya dari akun login
  // yang sudah terverifikasi (RBAC wali Santri / santri).
  processChatbotQuery(userInput: string, user: UserProfile | null): ChatMessage {
    const cleanQuery = userInput.trim().toLowerCase();
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    // 0. TUNGGAKAN — dihitung dari data sah via getOutstandingBalance.
    if (
      cleanQuery.includes('tunggakan') ||
      cleanQuery.includes('tunggak') ||
      cleanQuery.includes('lewat tenggat') ||
      cleanQuery.includes('jatuh tempo') ||
      cleanQuery.includes('telat bayar') ||
      cleanQuery.includes('sisa tagihan') ||
      cleanQuery.includes('berapa tunggakan') ||
      cleanQuery.includes('berapa sisa')
    ) {
      let extra =
        ' Untuk melihat tunggakan milik Bapak/Ibu secara aman, mohon login terlebih dahulu, lalu buka menu Tagihan.';
      if (user) {
        const res = getOutstandingBalance(user, this.chatbotSource());
        if (res.ok) {
          const { items, totalSisa, totalTunggakan } = res.data;
          const overdue = items.filter((i) => i.isOverdue);
          if (items.length === 0) {
            extra = ' Alhamdulillah, berdasarkan data sistem, tidak ada sisa tagihan untuk akun Bapak/Ibu saat ini.';
          } else {
            const lines = items.slice(0, 10).map(
              (i) =>
                `• ${i.nomorTagihan} — ${i.studentNama} (${i.categoryNama}, ${i.periode}): ${formatRupiah(i.sisa)}` +
                (i.isOverdue ? ' [MELEWATI TENGGAT]' : i.hasPendingVerification ? ' [menunggu verifikasi]' : '')
            );
            extra =
              ` Berdasarkan data sistem untuk akun Bapak/Ibu:\n` +
              `• Total sisa tagihan: ${formatRupiah(totalSisa)}\n` +
              `• Total tunggakan (melewati tenggat): ${formatRupiah(totalTunggakan)} (${overdue.length} tagihan)\n\n` +
              lines.join('\n') +
              (items.length > 10 ? `\n…dan ${items.length - 10} tagihan lainnya. Buka menu Tagihan untuk daftar lengkap.` : '');
          }
        } else {
          extra = ` ${res.error}`;
        }
      }
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Tunggakan adalah tagihan yang melewati tenggat dan belum lunas. Segera lunasi mulai dari periode paling lama agar tidak menumpuk.\n\n' + extra,
        actionButtons: [
          { label: 'Buka Menu Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Lihat Riwayat Transaksi', link: '/transaksi', variant: 'secondary' },
        ],
      };
    }

    // 0a. PENOLAKAN DATA KELUARGA LAIN — tanpa membocorkan data apa pun.
    if (user && requestsForeignData(userInput, user, this.chatbotSource())) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Mohon maaf, saya tidak dapat menampilkan data santri lain demi menjaga privasi setiap keluarga. Saya hanya dapat membantu data yang terhubung dengan akun Bapak/Ibu yang sedang login.\n\nJika ada keperluan resmi terkait data tersebut, silakan buat tiket bantuan agar petugas bendahara menindaklanjuti sesuai kewenangannya.',
        actionButtons: [
          { label: 'Buka Menu Tagihan Saya', link: '/tagihan', variant: 'primary' },
          { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
        ],
      };
    }

    // 0b. MULTI-ANAK
    if (
      cleanQuery.includes('lebih dari satu anak') ||
      cleanQuery.includes('banyak anak') ||
      cleanQuery.includes('dua anak') ||
      cleanQuery.includes('beberapa anak') ||
      cleanQuery.includes('punya 2 anak') ||
      cleanQuery.includes('pilih anak') ||
      cleanQuery.includes('memilih anak') ||
      cleanQuery.includes('ganti anak')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Jika Bapak/Ibu mempunyai lebih dari satu anak di pondok, satu akun wali dapat terhubung ke beberapa santri setelah diverifikasi admin:\n\n1. Pastikan setiap anak sudah terhubung dan berstatus terverifikasi di menu Wali Santri (dibantu admin pondok).\n2. Login ke akun wali santri.\n3. Buka menu Tagihan.\n4. Gunakan pencarian nama atau filter untuk memilih nama anak yang akan dibayar.\n5. Ulangi untuk setiap anak — setiap tagihan dibayar dan diverifikasi terpisah, masing-masing menerbitkan kuitansi sendiri.\n\nJika ada anak yang belum muncul, buat tiket bantuan agar petugas memverifikasi relasi wali-anak.',
        actionButtons: [
          { label: 'Buka Menu Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Cek Data Wali & Anak', link: '/wali', variant: 'secondary' },
          { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
        ],
      };
    }

    // 0c. LOGIN & AKUN
    if (
      cleanQuery.includes('tidak bisa login') ||
      cleanQuery.includes('gagal login') ||
      cleanQuery.includes('lupa password') ||
      cleanQuery.includes('lupa kata sandi') ||
      cleanQuery.includes('tidak dapat login') ||
      cleanQuery.includes('akun terkunci')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Jika Bapak/Ibu tidak dapat login:\n\n1. Periksa kembali alamat email dan kata sandi (perhatikan huruf besar/kecil).\n2. Pastikan akun masih aktif — hubungi admin jika baru didaftarkan.\n3. Coba muat ulang halaman login atau gunakan peramban lain.\n4. Jangan pernah membagikan password, PIN, atau OTP kepada siapa pun.\n\nJika masih gagal, buat tiket bantuan dengan memilih kategori "Lainnya" dan tuliskan email akun Bapak/Ibu (tanpa menulis password).',
        actionButtons: [
          { label: 'Buka Halaman Login', link: '/login', variant: 'primary' },
          { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
        ],
      };
    }

    // 0d. QRIS SPESIFIK (sebelum rekening umum)
    if (
      cleanQuery.includes('qris') ||
      cleanQuery.includes('qr code') ||
      cleanQuery.includes('qrcode') ||
      cleanQuery.includes('scan qr') ||
      cleanQuery.includes('gopay') ||
      cleanQuery.includes('ovo') ||
      cleanQuery.includes('dana') ||
      cleanQuery.includes('shopeepay') ||
      cleanQuery.includes('menggunakan qris')
    ) {
      const s = this.getSettings();
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: `Cara membayar menggunakan QRIS resmi pondok:\n\n1. Login, buka menu Tagihan, pilih tagihan, lalu pilih metode QRIS.\n2. Sistem menampilkan QRIS resmi pondok (${s.qrisInfo.namaMerchant}, NMID ${s.qrisInfo.nmid}). Gunakan HANYA QR yang tampil di aplikasi — jangan memakai QR dari sumber lain.\n3. Pindai dengan aplikasi apa pun (GoPay, OVO, DANA, ShopeePay, BSI Mobile, dsb) sesuai nominal tepat.\n4. Simpan bukti transaksi, lalu unggah pada formulir pembayaran.\n5. Tunggu verifikasi bendahara (normal 1x24 jam kerja). Kuitansi terbit setelah terverifikasi.\n\nSaya tidak membuat kode QR di sini; seluruh proses QRIS dilakukan di halaman pembayaran resmi website.`,
        actionButtons: [
          { label: 'Buka Halaman Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Lihat Riwayat Transaksi', link: '/transaksi', variant: 'secondary' },
        ],
      };
    }

    // 0e. TRANSFER SPESIFIK
    if (
      cleanQuery.includes('transfer') ||
      cleanQuery.includes('via bank') ||
      cleanQuery.includes('melalui transfer') ||
      cleanQuery.includes('rekening') ||
      cleanQuery.includes('nomor rekening') ||
      cleanQuery.includes('bank apa') ||
      cleanQuery.includes('bsi') ||
      cleanQuery.includes('bca') ||
      cleanQuery.includes('muamalat')
    ) {
      const s = this.getSettings();
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: `Cara membayar melalui transfer bank (menggunakan rekening resmi yang dikonfigurasi pengelola):\n\n1. Login, buka menu Tagihan, pilih nama anak dan tagihan yang akan dibayar.\n2. Catat kategori, periode, nominal, dan tenggat.\n3. Pilih metode Transfer Bank, lalu transfer TEPAT sesuai nominal ke salah satu rekening resmi:\n   • ${s.rekeningBsi.namaBank}: ${s.rekeningBsi.nomorRekening} (a.n. ${s.rekeningBsi.atasNama})\n   • ${s.rekeningBcaSyariah.namaBank}: ${s.rekeningBcaSyariah.nomorRekening} (a.n. ${s.rekeningBcaSyariah.atasNama})\n   • ${s.rekeningMuamalat.namaBank}: ${s.rekeningMuamalat.nomorRekening} (a.n. ${s.rekeningMuamalat.atasNama})\n4. Simpan struk, kembali ke website, unggah bukti pada detail tagihan.\n5. Tunggu verifikasi bendahara.\n\nData di atas diambil langsung dari pengaturan website, bukan karangan. Jika ragu, konfirmasi via tiket bantuan.`,
        actionButtons: [
          { label: 'Buka Halaman Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Konfirmasi via Tiket', link: '/bantuan', variant: 'secondary' },
        ],
      };
    }

    // 1. CEK / LIHAT TAGIHAN (DATA CONTEXTUAL QUERY) — umum jika belum login.
    if (
      cleanQuery.includes('cek tagihan') ||
      cleanQuery.includes('tagihan saya') ||
      cleanQuery.includes('status tagihan') ||
      cleanQuery.includes('berapa tagihan') ||
      cleanQuery.includes('lihat tagihan') ||
      cleanQuery.includes('melihat tagihan') ||
      cleanQuery.includes('kategori uang makan') ||
      cleanQuery.includes('spp sekolah') ||
      cleanQuery.includes('syariah pondok')
    ) {
      if (!user) {
        return {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          timestamp,
          text: 'Cara memeriksa tagihan (umum):\n\n1. Login ke akun wali santri.\n2. Buka menu Tagihan.\n3. Pilih nama anak.\n4. Lihat kategori Uang Makan, SPP Sekolah, dan Syariah Pondok beserta periode dan statusnya.\n\nUntuk keamanan data pribadi santri, rincian tagihan milik Bapak/Ibu hanya tampil setelah login. Silakan masuk terlebih dahulu.',
          actionButtons: [
            { label: 'Masuk (Login)', link: '/login', variant: 'primary' },
            { label: 'Panduan Cara Bayar', actionPayload: 'cara_bayar', variant: 'secondary' },
          ],
        };
      }

      // Data aktual via backend tools — hak akses dari relasi TERVERIFIKASI.
      const ds = this.chatbotSource();
      const studentsRes = getMyStudents(user, ds);
      const invoicesRes = getMyInvoices(user, ds);

      if (!studentsRes.ok || !invoicesRes.ok) {
        return {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          timestamp,
          text: 'Mohon maaf, akun Bapak/Ibu belum memiliki data santri terhubung yang terverifikasi. Silakan hubungi admin pondok agar relasi wali-anak diverifikasi, atau buat tiket bantuan.',
          actionButtons: [
            { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
            { label: 'Cek Data Wali & Anak', link: '/wali', variant: 'secondary' },
          ],
        };
      }

      const myInvoices = invoicesRes.data;
      const studentNames = studentsRes.data.map((s) => s.nama).join(', ');
      const studentLabel =
        user.role === 'wali_santri'
          ? `anak terverifikasi (${studentNames || 'belum ada'})`
          : user.role === 'santri'
          ? `santri ${user.name}`
          : `ringkasan sistem (${user.role})`;

      const belumBayar = myInvoices.filter((i) => i.status === 'belum_dibayar');
      const menunggu = myInvoices.filter((i) => i.status === 'menunggu_verifikasi');
      const lunas = myInvoices.filter((i) => i.status === 'lunas');

      let responseText = `Berikut ringkasan tagihan resmi untuk ${studentLabel}:\n\n`;
      if (myInvoices.length === 0) {
        responseText += 'Alhamdulillah, tidak ada tagihan aktif untuk akun Anda saat ini.';
      } else {
        responseText += `• ${belumBayar.length} tagihan Belum Dibayar\n`;
        responseText += `• ${menunggu.length} tagihan Menunggu Verifikasi\n`;
        responseText += `• ${lunas.length} tagihan Lunas\n\n`;
        responseText += 'Silakan pilih tagihan di bawah untuk melihat rincian atau melanjutkan pembayaran.';
      }

      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: responseText,
        actionButtons: [
          { label: 'Buka Menu Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Lihat Riwayat Transaksi', link: '/transaksi', variant: 'secondary' },
          { label: 'Unduh Kuitansi Sah', link: '/kuitansi', variant: 'secondary' },
        ],
        dataCard: myInvoices[0]
          ? {
              title: myInvoices[0].nomorTagihan,
              subtitle: `${myInvoices[0].studentNama} (${myInvoices[0].categoryNama})`,
              status: myInvoices[0].status,
              nominal: myInvoices[0].sisaTagihan,
              details: [
                { label: 'Periode', value: myInvoices[0].periodeBulan },
                { label: 'Jatuh Tempo', value: myInvoices[0].tenggatWaktu },
              ],
            }
          : undefined,
      };
    }

    // 2. STATUS PEMBAYARAN & VERIFIKASI — status DB apa adanya + data milik pengguna.
    if (
      cleanQuery.includes('status pembayaran') ||
      cleanQuery.includes('arti status') ||
      cleanQuery.includes('belum diverifikasi') ||
      cleanQuery.includes('sudah diverifikasi') ||
      cleanQuery.includes('apakah pembayaran') ||
      cleanQuery.includes('kenapa belum lunas') ||
      cleanQuery.includes('belum dibayar') ||
      cleanQuery.includes('menunggu verifikasi') ||
      cleanQuery.includes('lunas') ||
      cleanQuery.includes('ditolak') ||
      cleanQuery.includes('terverifikasi') ||
      cleanQuery.includes('mengapa pembayaran saya')
    ) {
      let dataSection = '';
      if (user) {
        const hist = getMyPaymentHistory(user, this.chatbotSource());
        if (hist.ok) {
          if (hist.data.length === 0) {
            dataSection = 'Berdasarkan data sistem, belum ada transaksi pembayaran tercatat untuk akun Bapak/Ibu.\n\n';
          } else {
            const menunggu = hist.data.filter((h) => h.payment.status === 'menunggu_verifikasi');
            const verified = hist.data.filter((h) => h.payment.status === 'terverifikasi');
            const rejected = hist.data.filter((h) => h.payment.status === 'ditolak');
            const latest = hist.data.slice(0, 3).map(
              (h) =>
                `• ${h.payment.nomorPembayaran} (${h.categoryNama}, ${h.periode}): ${formatRupiah(h.payment.nominal)} — ${h.payment.status.replace(/_/g, ' ')}` +
                (h.payment.status === 'ditolak' && h.payment.alasanPenolakan ? ` (alasan: ${h.payment.alasanPenolakan})` : '')
            );
            dataSection =
              `Berdasarkan data sistem untuk akun Bapak/Ibu:\n` +
              `• ${verified.length} pembayaran Terverifikasi (lunas sah)\n` +
              `• ${menunggu.length} pembayaran Menunggu Verifikasi (belum lunas — masih diperiksa bendahara)\n` +
              `• ${rejected.length} pembayaran Ditolak\n\nTransaksi terbaru:\n` +
              latest.join('\n') + '\n\n';
          }
        } else {
          dataSection = `${hist.error}\n\n`;
        }
      }
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: dataSection + 'Penjelasan status pembayaran resmi:\n\n• Belum Dibayar: tagihan belum tercatat sebagai lunas. Silakan lakukan pembayaran.\n• Menunggu Verifikasi: bukti atau transaksi sedang diperiksa bendahara (normal 1x24 jam kerja). Mengunggah bukti BELUM berarti lunas.\n• Lunas/Terverifikasi: pembayaran telah dikonfirmasi sah oleh bendahara. Kuitansi resmi otomatis terbit.\n• Ditolak: pembayaran memerlukan perbaikan atau pemeriksaan ulang. Alasan penolakan tertulis di detail tagihan — silakan perbaiki lalu unggah ulang.\n• Tunggakan: tagihan melewati tenggat dan belum lunas sesuai aturan pondok. Segera lunasi mulai periode tertua.\n\nJika status tidak berubah lebih dari 24 jam setelah transfer, periksa kembali nominal dan bukti, lalu buat tiket bantuan.',
        actionButtons: [
          { label: 'Cek Status Transaksi', link: '/transaksi', variant: 'primary' },
          { label: 'Eskalasi ke Petugas', link: '/bantuan', variant: 'escalate' },
        ],
      };
    }

    // 3. CARA MEMBAYAR — 10 langkah sesuai spesifikasi.
    if (
      cleanQuery.includes('cara bayar') ||
      cleanQuery.includes('cara membayar') ||
      cleanQuery.includes('bagaimana cara membayar') ||
      cleanQuery.includes('langkah bayar') ||
      cleanQuery.includes('instruksi') ||
      cleanQuery.includes('bagaimana cara membayar?')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Cara membayar tagihan santri:\n\n1. Login ke akun wali santri.\n2. Buka menu Tagihan.\n3. Pilih nama anak.\n4. Pilih tagihan yang ingin dibayar.\n5. Periksa kategori, periode, nominal, dan tenggat.\n6. Pilih metode pembayaran yang tersedia (transfer bank / QRIS).\n7. Ikuti instruksi transfer atau QRIS yang tampil di website.\n8. Unggah bukti jika menggunakan pembayaran manual.\n9. Tunggu verifikasi bendahara.\n10. Buka riwayat pembayaran untuk melihat status dan mengunduh kuitansi jika tersedia.',
        actionButtons: [
          { label: 'Buka Halaman Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Info Rekening Pondok', actionPayload: 'rekening', variant: 'secondary' },
        ],
      };
    }

    // 3b. SALAH METODE / MASALAH PEMBAYARAN UMUM
    if (
      cleanQuery.includes('salah pilih metode') ||
      cleanQuery.includes('salah metode') ||
      cleanQuery.includes('masalah pembayaran') ||
      cleanQuery.includes('mengalami masalah') ||
      cleanQuery.includes('nominal berbeda') ||
      cleanQuery.includes('nominal beda') ||
      cleanQuery.includes('tagihan tampak ganda') ||
      cleanQuery.includes('tidak menemukan kuitansi') ||
      cleanQuery.includes('tidak ada kuitansi') ||
      cleanQuery.includes('status belum berubah')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Bantuan penyelesaian masalah pembayaran (tanpa mengubah transaksi secara otomatis):\n\n• Bukti gagal diunggah: gunakan JPG/PNG/PDF maksimal 5 MB, pastikan koneksi stabil.\n• Transfer sudah dilakukan tetapi status belum berubah: tunggu 1x24 jam kerja, pastikan nominal tepat, lalu cek menu Transaksi.\n• Nominal berbeda dari perkiraan: bandingkan kategori, periode, dan tenggat di detail tagihan sebelum membayar.\n• Tagihan tampak ganda: sistem mencegah duplikasi kategori+periode yang sama; jika tetap ragu, jangan bayar dua kali — buat tiket.\n• Kuitansi tidak ditemukan: kuitansi hanya ada setelah status Lunas/Terverifikasi, cek menu Kuitansi.\n• Salah memilih metode: jangan ulangi pembayaran; catat nomor tagihan dan buat tiket agar petugas memeriksa.\n\nSaya tidak dapat mengubah nominal atau status — petugas bendahara yang berwenang menanganinya.',
        actionButtons: [
          { label: 'Buat Tiket Bantuan', link: '/bantuan', variant: 'escalate' },
          { label: 'Cek Riwayat Transaksi', link: '/transaksi', variant: 'secondary' },
        ],
      };
    }

    // 4. CARA UPLOAD BUKTI
    if (
      cleanQuery.includes('upload bukti') ||
      cleanQuery.includes('unggah bukti') ||
      cleanQuery.includes('mengunggah bukti') ||
      cleanQuery.includes('gagal upload') ||
      cleanQuery.includes('gagal diunggah') ||
      cleanQuery.includes('foto struk') ||
      cleanQuery.includes('bukti pembayaran')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Cara mengunggah bukti pembayaran:\n\n1. Buka detail tagihan yang akan dibayar.\n2. Pilih menu unggah bukti / bayar.\n3. Pilih berkas sesuai batas aplikasi: format JPG, JPEG, PNG, atau PDF, maksimal 5 MB.\n4. Pastikan foto struk terang, nomor referensi dan nominal terbaca.\n5. Kirim bukti untuk diverifikasi bendahara.\n\nJika gagal: coba berkas lebih kecil, ganti ke JPG/PNG, atau gunakan jaringan stabil. Mengunggah bukti belum berarti lunas — tunggu verifikasi.',
        actionButtons: [
          { label: 'Pilih Tagihan & Unggah', link: '/tagihan', variant: 'primary' },
          { label: 'Laporkan Kendala Upload', link: '/bantuan', variant: 'escalate' },
        ],
      };
    }

    // 5. DOWNLOAD KUITANSI
    if (
      cleanQuery.includes('kuitansi') ||
      cleanQuery.includes('kwitansi') ||
      cleanQuery.includes('cetak kuitansi') ||
      cleanQuery.includes('download kuitansi') ||
      cleanQuery.includes('unduh kuitansi') ||
      cleanQuery.includes('mendapatkan kuitansi')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Cara mendapatkan kuitansi:\n\nKuitansi tersedia SETELAH pembayaran terverifikasi (status Lunas/Terverifikasi). Belum ada kuitansi untuk tagihan Belum Dibayar atau Menunggu Verifikasi.\n\n1. Buka menu Riwayat Transaksi atau Kuitansi Resmi.\n2. Pilih transaksi yang sudah Lunas.\n3. Unduh/cetak kuitansi bernomor resmi berstempel dan berkode QR validasi.\n\nJika sudah lunas tetapi kuitansi tidak muncul, buat tiket bantuan dengan menyertakan nomor tagihan.',
        actionButtons: [
          { label: 'Buka Arsip Kuitansi', link: '/kuitansi', variant: 'primary' },
          { label: 'Cek Riwayat Pembayaran', link: '/transaksi', variant: 'secondary' },
        ],
      };
    }

    // 7. ESKALASI KENDALA / HUBUNGI BENDAHARA / SALAH TRANSFER
    if (
      cleanQuery.includes('salah transfer') ||
      cleanQuery.includes('nominal salah') ||
      cleanQuery.includes('nominal tidak sesuai') ||
      cleanQuery.includes('tagihan ganda') ||
      cleanQuery.includes('hubungi bendahara') ||
      cleanQuery.includes('kontak') ||
      cleanQuery.includes('bantuan manusia') ||
      cleanQuery.includes('petugas') ||
      cleanQuery.includes('komplain')
    ) {
      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: 'Jika Anda mengalami salah transfer, nominal tidak sesuai, atau pembayaran belum diverifikasi setelah 1x24 jam, sistem menyediakan fasilitas Eskalasi Tiket Bantuan ke Bendahara.\n\nPetugas administrasi kasir akan langsung menerima laporan Anda beserta nomor tiket penanganan resmi.',
        actionButtons: [
          { label: 'Buat Tiket Bantuan ke Bendahara', link: '/bantuan', variant: 'escalate' },
          { label: 'Cek Riwayat Transaksi', link: '/transaksi', variant: 'secondary' },
        ],
      };
    }

    // 7.5 IDENTITAS PENGGUNA — "siapa saya?" dijawab dari akun login yang
    // aman (dari state sesi, bukan dari teks yang diketik). Menjadi jelas
    // wali santri / santri / petugas sebelum jawaban data-pertanyaan lain.
    const isIdentityQuery =
      cleanQuery.includes('siapa saya') ||
      cleanQuery.includes('identitas saya') ||
      cleanQuery.includes('peran saya') ||
      cleanQuery.includes('apa peran saya') ||
      cleanQuery.includes('aku adalah') ||
      cleanQuery.includes('nama saya') ||
      cleanQuery.includes('saya adalah');

    if (isIdentityQuery) {
      const me = user;
      const identitasAkhir = `Anda adalah ${me ? me.name : 'Pengguna'} dengan peran ${me ? me.role : 'belum dikenal'}.`;

      if (!me) {
        return {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          timestamp,
          text:
            'Untuk menjawab identitas secara akurat, saya perlu memastikan akun Anda sudah terlogin.\n\n' +
            'Jika Bapak/Ibu masuk sebagai wali santri: saya akan menyebutkan anak-anak terverifikasi yang menjadi tanggung jawab Bapak/Ibu. Jika Bapak/Ibu masuk sebagai santri: saya akan menyebutkan identitas santri tersebut. Jika Bapak/Ibu masuk sebagai petugas (bendahara/kepala pondok/pengasuh): saya akan menyebutkan ruang lingkup unit Bapak/Ibu.\n\n' +
            'Silakan login terlebih dahulu, atau gunakan menu "Hubungi Bendahara" untuk verifikasi resmi.',
          actionButtons: [
            { label: 'Masuk (Login)', link: '/login', variant: 'primary' },
            { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
          ],
          meta: { confident: true },
        };
      }

      const dataBagian: string[] = [];
      if (me.role === 'wali_santri') {
        const rels = this
          .getVerifiedStudentIdsForGuardian(me.id)
          .map((id) => this.getStudentById(id))
          .filter((s): s is Student => Boolean(s));
        const daftarAnak = rels.length
          ? rels.map((s) => `${s.nama} (NIS ${s.nis}, ${s.kelas}, unit ${s.unit})`).join(', ')
          : 'belum ada santri terverifikasi yang terhubung';
        dataBagian.push(`Anda adalah Bapak/Ibu **wali santri** (${me.name}) yang terverifikasi. Anak-anak tercatat sebagai tanggung jawab Anda: ${daftarAnak}.`);
      } else if (me.role === 'santri') {
        const st = this.getStudentById(me.studentId || '');
        dataBagian.push(
          `Anda adalah **santri** bernama ${st ? st.nama : me.name} (NIS ${st ? st.nis : '-'}, kelas ${st ? st.kelas : '-'}, unit ${st ? st.unit : '-'}), dan akun ini milik data santri tersebut.`
        );
      } else {
        dataBagian.push(
          `Anda adalah **petugas** (${me.role}) dengan akses: ${me.unitAccess === 'putra' ? 'unit putra' : me.unitAccess === 'putri' ? 'unit putri' : 'semua unit'}.`
        );
      }

      return {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp,
        text: `Saya dapat menangkap identitas dari akun yang sedang login saat ini:\n\n${dataBagian.join('\n')}\n\n${identitasAkhir}\n\nUntuk data per anak/santri: gunakan pertanyaan seperti "Berapa tunggakan SPP anak saya bulan ini?" atau "Apa status pembayaran santri X?" — saya akan menjawab berdasarkan tagihan dan transaksi yang sah pada database.`,
        actionButtons: [
          { label: 'Buka Menu Tagihan', link: '/tagihan', variant: 'primary' },
          { label: 'Lihat Riwayat Transaksi', link: '/transaksi', variant: 'secondary' },
          { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
        ],
        meta: { confident: true },
      };
    }

    const faqs = this.getFaqs().filter((f) => f.isActive);
    for (const faq of faqs) {
      const isMatch = faq.kataKunci.some((k) => cleanQuery.includes(k.toLowerCase())) ||
        cleanQuery.includes(faq.pertanyaan.toLowerCase().slice(0, 15));
      if (isMatch) {
        return {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          timestamp,
          text: faq.jawaban,
          actionButtons: faq.actionButtonLabel && faq.actionButtonLink
            ? [
                {
                  label: faq.actionButtonLabel,
                  link: faq.actionButtonLink,
                  variant: 'primary',
                },
                { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'secondary' },
              ]
            : [{ label: 'Buka Halaman Tagihan', link: '/tagihan', variant: 'primary' }],
        };
      }
    }

    // 9. DEFAULT COURTEOUS SYARIAH FALLBACK
    // `confident: false` menandai bahwa topik tidak dikenali mesin FAQ lokal,
    // sehingga widget boleh meneruskan pertanyaan ke AI backend (jika aktif).
    return {
      id: `bot-${Date.now()}`,
      sender: 'bot',
      timestamp,
      meta: { confident: false },
      text: 'Terima kasih atas pertanyaannya. Saya dapat membantu Bapak/Ibu mengenai:\n\n1. Cara melakukan pembayaran tagihan.\n2. Cek tagihan & status verifikasi.\n3. Info nomor rekening BSI, BCA Syariah, dan QRIS.\n4. Cara unduh kuitansi resmi PDF.\n5. Bantuan masalah transfer atau tagihan ganda.\n\nSilakan pilih salah satu topik cepat di bawah ini atau tuliskan pertanyaan Anda:',
      actionButtons: [
        { label: 'Cara Membayar', actionPayload: 'cara_bayar', variant: 'primary' },
        { label: 'Cek Tagihan Saya', actionPayload: 'cek_tagihan', variant: 'primary' },
        { label: 'Status Pembayaran', actionPayload: 'status_bayar', variant: 'secondary' },
        { label: 'Hubungi Bendahara', link: '/bantuan', variant: 'escalate' },
      ],
    };
  }
}

// build-marker-093052
export const store = new AppStore();

