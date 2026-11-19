'use client';

import React, { useState, useEffect } from 'react';
import { store } from '@/lib/store';
import { PesantrenSettings, UserProfile } from '@/lib/types';
import Logo from '@/components/shared/Logo';
import {
  Settings,
  Building,
  CreditCard,
  QrCode,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export default function PengaturanPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<PesantrenSettings | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states
  const [namaPondok, setNamaPondok] = useState('');
  const [alamat, setAlamat] = useState('');
  const [telepon, setTelepon] = useState('');
  const [email, setEmail] = useState('');
  const [pengasuhNama, setPengasuhNama] = useState('');
  const [bendaharaNama, setBendaharaNama] = useState('');

  // Bank accounts
  const [bsiNo, setBsiNo] = useState('');
  const [bsiAn, setBsiAn] = useState('');
  const [bcaNo, setBcaNo] = useState('');
  const [bcaAn, setBcaAn] = useState('');
  const [muamalatNo, setMuamalatNo] = useState('');
  const [muamalatAn, setMuamalatAn] = useState('');

  // QRIS
  const [qrisNmid, setQrisNmid] = useState('');
  const [qrisMerchant, setQrisMerchant] = useState('');

  useEffect(() => {
    setUser(store.getCurrentUser());
    const s = store.getSettings();
    setSettings(s);
    if (s) {
      setNamaPondok(s.namaPondok);
      setAlamat(s.alamat);
      setTelepon(s.telepon);
      setEmail(s.email);
      setPengasuhNama(s.pengasuhNama);
      setBendaharaNama(s.kepalaBendaharaNama);

      setBsiNo(s.rekeningBsi.nomorRekening);
      setBsiAn(s.rekeningBsi.atasNama);
      setBcaNo(s.rekeningBcaSyariah.nomorRekening);
      setBcaAn(s.rekeningBcaSyariah.atasNama);
      setMuamalatNo(s.rekeningMuamalat.nomorRekening);
      setMuamalatAn(s.rekeningMuamalat.atasNama);

      setQrisNmid(s.qrisInfo.nmid);
      setQrisMerchant(s.qrisInfo.namaMerchant);
    }
  }, []);

  if (!settings) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: PesantrenSettings = {
      ...settings,
      namaPondok,
      alamat,
      telepon,
      email,
      pengasuhNama,
      kepalaBendaharaNama: bendaharaNama,
      rekeningBsi: {
        ...settings.rekeningBsi,
        nomorRekening: bsiNo,
        atasNama: bsiAn,
      },
      rekeningBcaSyariah: {
        ...settings.rekeningBcaSyariah,
        nomorRekening: bcaNo,
        atasNama: bcaAn,
      },
      rekeningMuamalat: {
        ...settings.rekeningMuamalat,
        nomorRekening: muamalatNo,
        atasNama: muamalatAn,
      },
      qrisInfo: {
        ...settings.qrisInfo,
        nmid: qrisNmid,
        namaMerchant: qrisMerchant,
      },
    };

    store.updateSettings(updated);
    setSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Pengaturan Pondok &amp; Rekening Syariah
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Konfigurasi identitas pesantren, rekening bank syariah, dan gateway pembayaran.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-300 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Pengaturan Berhasil Disimpan!
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identitas Pesantren */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Identitas Pondok Pesantren</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Resmi Pondok Pesantren
              </label>
              <input
                type="text"
                value={namaPondok}
                onChange={(e) => setNamaPondok(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Lengkap Pesantren
              </label>
              <input
                type="text"
                value={alamat}
                onChange={(e) => setAlamat(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor Telepon / WhatsApp Kantor
              </label>
              <input
                type="text"
                value={telepon}
                onChange={(e) => setTelepon(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Email Resmi
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pengasuh Pondok Pesantren
              </label>
              <input
                type="text"
                value={pengasuhNama}
                onChange={(e) => setPengasuhNama(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kepala Bendahara
              </label>
              <input
                type="text"
                value={bendaharaNama}
                onChange={(e) => setBendaharaNama(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Rekening Bank Syariah */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Rekening Resmi Bank Syariah (Tujuan Transfer)</h3>
          </div>

          <div className="space-y-4">
            {/* BSI */}
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3">
              <span className="text-xs font-bold text-emerald-900 block">1. Bank Syariah Indonesia (BSI)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nomor Rekening BSI:</label>
                  <input
                    type="text"
                    value={bsiNo}
                    onChange={(e) => setBsiNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono font-bold text-emerald-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Atas Nama Rekening:</label>
                  <input
                    type="text"
                    value={bsiAn}
                    onChange={(e) => setBsiAn(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* BCA Syariah */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-900 block">2. BCA Syariah</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nomor Rekening BCA Syariah:</label>
                  <input
                    type="text"
                    value={bcaNo}
                    onChange={(e) => setBcaNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Atas Nama Rekening:</label>
                  <input
                    type="text"
                    value={bcaAn}
                    onChange={(e) => setBcaAn(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Muamalat */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-900 block">3. Bank Muamalat</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nomor Rekening Bank Muamalat:</label>
                  <input
                    type="text"
                    value={muamalatNo}
                    onChange={(e) => setMuamalatNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Atas Nama Rekening:</label>
                  <input
                    type="text"
                    value={muamalatAn}
                    onChange={(e) => setMuamalatAn(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* QRIS & Payment Gateway Status */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <QrCode className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">QRIS &amp; Status Arsitektur Payment Gateway</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NMID QRIS Nasional</label>
              <input
                type="text"
                value={qrisNmid}
                onChange={(e) => setQrisNmid(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Merchant QRIS</label>
              <input
                type="text"
                value={qrisMerchant}
                onChange={(e) => setQrisMerchant(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
              />
            </div>
          </div>

          {/* Payment Gateway Architecture Disclosure */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              Status Gateway Otomatis (Midtrans / Xendit / Tripay)
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Arsitektur antarmuka dan struktur data telah dipersiapkan sepenuhnya untuk menerima integrasi payment gateway. <strong>Sistem saat ini berada dalam Mode Manual Terverifikasi</strong> (bukti transfer diunggah lalu diverifikasi manual oleh bendahara), dan tidak mengklaim integrasi gateway otomatis aktif sebelum kredensial API resmi dipasangkan ke sistem.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-950/20 transition"
          >
            <Save className="w-4 h-4" />
            Simpan Pengaturan
          </button>
        </div>
      </form>
    </div>
  );
}
