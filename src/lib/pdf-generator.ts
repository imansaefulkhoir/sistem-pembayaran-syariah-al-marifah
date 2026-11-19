import jsPDF from 'jspdf';
import { Receipt, Invoice, PesantrenSettings } from './types';
import { formatRupiah, formatDateIndo } from './utils';

export interface ReceiptPdfResult {
  base64: string;
  fileName: string;
}

function statusLabelForPdf(receipt: Receipt): { label: string; color: [number, number, number] } {
  if (receipt.status === 'dibatalkan') return { label: 'DIBATALKAN', color: [185, 28, 28] };
  if (receipt.status === 'diganti') return { label: 'DIGANTI / KOREKSI', color: [180, 83, 9] };
  if (receipt.statusPembayaran === 'sebagian') return { label: 'SAH - DIBAYAR SEBAGIAN', color: [180, 83, 9] };
  return { label: 'SAH - LUNAS', color: [5, 150, 105] };
}

function buildReceiptDocument(receipt: Receipt, settings: PesantrenSettings): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const status = statusLabelForPdf(receipt);

  // Header Background Islamic Green
  doc.setFillColor(6, 95, 70); // #065f46
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Gold accent bar
  doc.setFillColor(217, 119, 6); // #d97706
  doc.rect(0, 38, pageWidth, 3, 'F');

  // Emblem / logo mark (vector, tidak memerlukan file eksternal)
  doc.setFillColor(255, 255, 255);
  doc.circle(24, 19, 10, 'F');
  doc.setTextColor(6, 95, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('AM', 24, 20.5, { align: 'center' });

  // Institution identity
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings.namaPondok.toUpperCase(), 40, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(230, 245, 235);
  doc.text(settings.subNama || 'Sistem Pembayaran Syariah', 40, 21);
  doc.setFontSize(8);
  doc.text(settings.alamat, 40, 26);
  doc.text(`Telp: ${settings.telepon} | Email: ${settings.email}`, 40, 31);

  // Receipt title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('KUITANSI PEMBAYARAN SYARIAH', pageWidth / 2, 51, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Nomor Kuitansi: ${receipt.nomorKuitansi}`, pageWidth / 2, 58, { align: 'center' });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(16, 63, pageWidth - 16, 63);

  // Two-column details
  const leftX = 18;
  const leftValueX = 58;
  const rightX = 116;
  const rightValueX = 156;
  const startY = 73;
  const row = 9;

  const leftFields = [
    ['Telah Diterima Dari', receipt.studentNama],
    ['NIS / Kelas / Unit', `${receipt.studentNis} / ${receipt.studentKelas} (${receipt.studentUnit === 'putra' ? 'Putra' : 'Putri'})`],
    ['Kategori', receipt.kategoriNama],
    ['Periode', receipt.periode],
    ['Metode Pembayaran', `${receipt.metodePembayaran.toUpperCase().replace(/_/g, ' ')}`],
    ['Bank / Tujuan', receipt.bankTujuan || 'Kas Bendahara'],
  ];

  const rightFields = [
    ['Tanggal Bayar', formatDateIndo(receipt.tanggalBayar)],
    ['Tanggal Terbit', formatDateIndo(receipt.tanggalTerbit)],
    ['Total Tagihan', formatRupiah(receipt.totalTagihan ?? receipt.nominal)],
    ['Total Terverifikasi', formatRupiah(receipt.totalTerverifikasi ?? receipt.nominal)],
    ['Sisa Tagihan', formatRupiah(receipt.sisaTagihan ?? 0)],
    ['Kelebihan Bayar', formatRupiah(receipt.overpayment ?? 0)],
  ];

  doc.setFontSize(8.5);
  leftFields.forEach(([label, value], index) => {
    const y = startY + index * row;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(label, leftX, y);
    doc.text(':', leftValueX - 4, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(String(value), 50);
    doc.text(lines[0], leftValueX, y);
  });

  rightFields.forEach(([label, value], index) => {
    const y = startY + index * row;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(label, rightX, y);
    doc.text(':', rightValueX - 4, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), rightValueX, y);
  });

  // Nominal Box
  const boxY = startY + leftFields.length * row + 4;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(34, 197, 94);
  doc.roundedRect(16, boxY, pageWidth - 32, 24, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(4, 120, 87);
  doc.text('JUMLAH UANG DITERIMA:', 22, boxY + 9);

  doc.setFontSize(17);
  doc.setTextColor(6, 95, 70);
  doc.text(formatRupiah(receipt.nominal), 22, boxY + 18);

  // Status badge
  doc.setFillColor(status.color[0], status.color[1], status.color[2]);
  doc.roundedRect(pageWidth - 92, boxY + 6, 70, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(status.label, pageWidth - 57, boxY + 13.5, { align: 'center' });

  // Terbilang
  const terbilangY = boxY + 32;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Terbilang: "${receipt.terbilang}"`, 18, terbilangY);

  // Catatan & verifikator
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const noteLines = doc.splitTextToSize(
    `Catatan: ${receipt.catatan || '-'}`,
    pageWidth - 40
  );
  doc.text(noteLines.slice(0, 3), 18, terbilangY + 8);
  doc.text(
    `Diverifikasi oleh: ${receipt.verifikator || receipt.petugasNama} • ${receipt.sistemVerifikator || 'Bendahara pondok'}`,
    18,
    terbilangY + 8 + Math.min(3, noteLines.length) * 5
  );

  // Signature
  const sigY = terbilangY + 34;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Cirebon, ${formatDateIndo(receipt.tanggalTerbit)}`, pageWidth - 22, sigY, { align: 'right' });
  doc.text('Petugas Bendahara Penerima,', pageWidth - 22, sigY + 6, { align: 'right' });

  doc.setDrawColor(16, 185, 129);
  doc.setFillColor(236, 253, 245);
  doc.circle(pageWidth - 48, sigY + 19, 10, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(5, 150, 105);
  doc.text(status.label.replace(' - ', '\n'), pageWidth - 48, sigY + 18, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.petugasNama, pageWidth - 22, sigY + 35, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Bagian Keuangan & Administrasi Syariah', pageWidth - 22, sigY + 40, { align: 'right' });

  // Footer validation
  doc.setDrawColor(203, 213, 225);
  doc.line(16, 275, pageWidth - 16, 275);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Kode Validasi: ${receipt.barcodeQrData} • Dokumen sah resmi sistem pesantren • ${receipt.nomorKuitansi}`,
    pageWidth / 2,
    281,
    { align: 'center', maxWidth: pageWidth - 32 }
  );

  return doc;
}

function receiptFileName(receipt: Receipt): string {
  return `Kuitansi_${receipt.nomorKuitansi}_${receipt.studentNama.replace(/\s+/g, '_')}.pdf`;
}

export function generateReceiptPdf(receipt: Receipt, settings: PesantrenSettings) {
  const doc = buildReceiptDocument(receipt, settings);
  doc.save(receiptFileName(receipt));
}

/** Hasilkan PDF sebagai base64 untuk disimpan/dikirim server (Telegram). */
export function generateReceiptPdfBase64(receipt: Receipt, settings: PesantrenSettings): ReceiptPdfResult {
  const doc = buildReceiptDocument(receipt, settings);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : doc.output('dataurlstring').split(',')[1];
  return { base64, fileName: receiptFileName(receipt) };
}

export function generateReportPdf(
  title: string,
  periodText: string,
  summary: {
    totalTagihan: number;
    totalTerverifikasi: number;
    totalTunggakanNominal: number;
    jumlahTunggakanSantri: number;
  },
  invoices: Invoice[],
  settings: PesantrenSettings
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(6, 95, 70);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(settings.namaPondok.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(230, 245, 235);
  doc.text(`LAPORAN TRANSPARANSI KEUANGAN SYARIAH - ${title.toUpperCase()}`, pageWidth / 2, 18, { align: 'center' });
  doc.text(`Periode: ${periodText} | Dicetak: ${formatDateIndo(new Date().toISOString())}`, pageWidth / 2, 23, { align: 'center' });

  // Summary Cards
  const cardY = 38;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, cardY, pageWidth - 24, 26, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Total Tagihan', 20, cardY + 8);
  doc.text('Total Terverifikasi (Masuk)', 65, cardY + 8);
  doc.text('Nominal Tunggakan', 120, cardY + 8);
  doc.text('Santri Menunggak', 165, cardY + 8);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatRupiah(summary.totalTagihan), 20, cardY + 18);

  doc.setTextColor(5, 150, 105);
  doc.text(formatRupiah(summary.totalTerverifikasi), 65, cardY + 18);

  doc.setTextColor(220, 38, 38);
  doc.text(formatRupiah(summary.totalTunggakanNominal), 120, cardY + 18);

  doc.setTextColor(15, 23, 42);
  doc.text(`${summary.jumlahTunggakanSantri} Santri`, 165, cardY + 18);

  // Table Data
  let startY = 74;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFillColor(15, 23, 42);
  doc.rect(12, startY, pageWidth - 24, 8, 'F');

  doc.text('No', 14, startY + 5.5);
  doc.text('No. Tagihan', 22, startY + 5.5);
  doc.text('Nama Santri', 55, startY + 5.5);
  doc.text('Kategori', 105, startY + 5.5);
  doc.text('Nominal', 140, startY + 5.5);
  doc.text('Status', 175, startY + 5.5);

  startY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const displayList = invoices.slice(0, 24); // Maksimal 24 per halaman pertama
  displayList.forEach((inv, i) => {
    const y = startY + i * 7.5;
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(12, y, pageWidth - 24, 7.5, 'F');
    }

    doc.setTextColor(15, 23, 42);
    doc.text(String(i + 1), 14, y + 5);
    doc.text(inv.nomorTagihan, 22, y + 5);
    doc.text(inv.studentNama.length > 24 ? inv.studentNama.substring(0, 22) + '..' : inv.studentNama, 55, y + 5);
    doc.text(inv.categoryNama.length > 18 ? inv.categoryNama.substring(0, 16) + '..' : inv.categoryNama, 105, y + 5);
    doc.text(formatRupiah(inv.nominal), 140, y + 5);

    if (inv.status === 'lunas') {
      doc.setTextColor(5, 150, 105);
      doc.text('Lunas', 175, y + 5);
    } else if (inv.status === 'menunggu_verifikasi') {
      doc.setTextColor(217, 119, 6);
      doc.text('Menunggu', 175, y + 5);
    } else {
      doc.setTextColor(220, 38, 38);
      doc.text('Belum Bayar', 175, y + 5);
    }
  });

  // Footer
  const footerY = 275;
  doc.setDrawColor(203, 213, 225);
  doc.line(12, footerY, pageWidth - 12, footerY);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak secara otomatis oleh Sistem Pembayaran Syariah Ponpes Kebon Kelapa Al-Ma'rifah`, 14, footerY + 5);
  doc.text(`Halaman 1 dari 1`, pageWidth - 14, footerY + 5, { align: 'right' });

  doc.save(`Laporan_Keuangan_AlMarifah_${periodText.replace(/\s+/g, '_')}.pdf`);
}
