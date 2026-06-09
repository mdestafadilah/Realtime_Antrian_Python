import React, { useEffect, useMemo, useState } from 'react';
import PageTitle from '../components/Typography/PageTitle';
import { TrashIcon } from '../icons';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

type StatusAntrian = 'menunggu' | 'dipanggil' | 'selesai' | 'batal';

type LayananMini = {
  id: number;
  kode_huruf: string;
  nama_layanan: string;
};

type Antrian = {
  id: number;
  tanggal: string;
  id_layanan: number;
  id_loket: number | null;
  nik: string | null;
  keterangan: string | null;
  nomor_antrian: string;
  nomor_urut: number;
  status: StatusAntrian;
  waktu_ambil: string | null;
  waktu_panggil: string | null;
  waktu_selesai: string | null;
  kode_huruf?: string | null;
  nama_layanan?: string | null;
  nama_loket?: string | null;
};

type Rekap = Record<StatusAntrian, number>;

type AntrianListResponse = {
  status: boolean;
  message?: string;
  tanggal?: string;
  rekap?: Rekap;
  data?: Antrian[];
};

type ApiResponse<T = unknown> = {
  status: boolean;
  message?: string;
  data?: T;
};

type FormState = {
  id_layanan: number | '';
  nik: string;
  keterangan: string;
  nomor_antrian: string;
};

const emptyForm: FormState = {
  id_layanan: '',
  nik: '',
  keterangan: '',
  nomor_antrian: '',
};

const emptyRekap: Rekap = { menunggu: 0, dipanggil: 0, selesai: 0, batal: 0 };

const PAGE_SIZE = 10;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const statusBadgeClass: Record<StatusAntrian, string> = {
  menunggu: 'text-yellow-700 bg-yellow-100 dark:text-yellow-100 dark:bg-yellow-700',
  dipanggil: 'text-purple-700 bg-purple-100 dark:text-purple-100 dark:bg-purple-600',
  selesai: 'text-green-700 bg-green-100 dark:text-green-100 dark:bg-green-700',
  batal: 'text-red-700 bg-red-100 dark:text-red-100 dark:bg-red-700',
};

const AntrianPage: React.FC = () => {
  const [items, setItems] = useState<Antrian[]>([]);
  const [rekap, setRekap] = useState<Rekap>(emptyRekap);
  const [layananList, setLayananList] = useState<LayananMini[]>([]);
  const [tanggal, setTanggal] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const [resAntrian, resLayanan] = await Promise.all([
        fetch(`${API_URL}/api/antrian/?tanggal=${encodeURIComponent(date)}`, {
          headers: { ...authHeaders() },
        }),
        fetch(`${API_URL}/api/layanan/`, { headers: { ...authHeaders() } }),
      ]);

      const jsonAntrian: AntrianListResponse = await resAntrian.json();
      if (!resAntrian.ok || !jsonAntrian.status) {
        setError(jsonAntrian.message || `Gagal memuat antrian (HTTP ${resAntrian.status})`);
        return;
      }
      setItems(jsonAntrian.data || []);
      setRekap(jsonAntrian.rekap || emptyRekap);

      const jsonLayanan: ApiResponse<LayananMini[]> = await resLayanan.json();
      if (resLayanan.ok && jsonLayanan.status) setLayananList(jsonLayanan.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll(tanggal);
    setPage(1);
  }, [tanggal]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [items, safePage],
  );
  const showingFrom = items.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, items.length);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, safePage - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, safePage]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (form.id_layanan === '') {
      setFormError('Pilih layanan terlebih dahulu');
      return;
    }
    if (form.nik && !/^\d{16}$/.test(form.nik)) {
      setFormError('NIK harus 16 digit angka');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      id_layanan: form.id_layanan,
      nik: form.nik.trim() || null,
      keterangan: form.keterangan.trim() || null,
      nomor_antrian: form.nomor_antrian.trim() || null,
    };

    try {
      const res = await fetch(`${API_URL}/api/antrian/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const json: ApiResponse<Antrian> = await res.json();
      if (!res.ok || !json.status) {
        setFormError(json.message || `Gagal membuat antrian (HTTP ${res.status})`);
        return;
      }
      setIsModalOpen(false);
      setNotice(json.message || `Tiket ${json.data?.nomor_antrian || ''} berhasil dibuat`);
      // Server pakai tanggal hari ini, otomatis refresh ke tanggal hari ini biar tiket baru kelihatan
      if (tanggal !== todayISO()) {
        setTanggal(todayISO());
      } else {
        await fetchAll(tanggal);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  const markStatus = async (row: Antrian, target: 'selesai' | 'batal') => {
    try {
      const res = await fetch(`${API_URL}/api/antrian/${target}/${row.id}`, {
        method: 'PUT',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse<Antrian> = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal mengubah status (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || `Tiket ${row.nomor_antrian} ditandai ${target}`);
      await fetchAll(tanggal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const handleDelete = async (row: Antrian) => {
    if (!window.confirm(`Hapus antrian "${row.nomor_antrian}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/antrian/${row.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal menghapus (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || 'Antrian dihapus');
      await fetchAll(tanggal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const waktuShort = (t: string | null) => (t ? t.slice(11, 19) : '-');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>Antrian</PageTitle>
        <div className="flex items-center gap-2">
          <label className="flex items-center text-sm text-gray-700 dark:text-gray-400">
            <span className="mr-2">Tanggal</span>
            <input
              type="date"
              className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value || todayISO())}
            />
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
          >
            + Ambil Antrian
          </button>
        </div>
      </div>

      {/* Rekap cards */}
      <div className="grid gap-4 mt-2 mb-6 md:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ['menunggu', 'Menunggu', 'text-yellow-700 bg-yellow-100 dark:text-yellow-100 dark:bg-yellow-700'],
            ['dipanggil', 'Dipanggil', 'text-purple-700 bg-purple-100 dark:text-purple-100 dark:bg-purple-600'],
            ['selesai', 'Selesai', 'text-green-700 bg-green-100 dark:text-green-100 dark:bg-green-700'],
            ['batal', 'Batal', 'text-red-700 bg-red-100 dark:text-red-100 dark:bg-red-700'],
          ] as Array<[StatusAntrian, string, string]>
        ).map(([key, label, badge]) => (
          <div
            key={key}
            className="flex items-center p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800"
          >
            <div
              className={'p-3 mr-4 rounded-full text-xs font-semibold uppercase ' + badge}
            >
              {label.slice(0, 1)}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                {rekap[key]}
              </p>
            </div>
          </div>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 px-3 py-2 text-sm text-green-700 bg-green-100 border border-green-200 rounded-md dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 px-3 py-2 text-sm text-red-700 bg-red-100 border border-red-200 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
        >
          {error}
        </div>
      )}

      <div className="w-full overflow-hidden rounded-lg shadow-xs">
        <div className="w-full overflow-x-auto">
          <table className="w-full whitespace-no-wrap">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-left text-gray-500 uppercase border-b dark:border-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-800">
                <th className="px-4 py-3">Nomor</th>
                <th className="px-4 py-3">Layanan</th>
                <th className="px-4 py-3">Loket</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Info</th>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y dark:divide-gray-700 dark:bg-gray-800">
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                  >
                    Memuat...
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                  >
                    Belum ada antrian untuk tanggal ini
                  </td>
                </tr>
              )}

              {!loading &&
                pageItems.map((row) => (
                  <tr key={row.id} className="text-gray-700 dark:text-gray-400">
                    <td className="px-4 py-3 text-sm font-semibold">{row.nomor_antrian}</td>
                    <td className="px-4 py-3 text-sm">
                      {row.kode_huruf && (
                        <span className="font-semibold mr-1">{row.kode_huruf}</span>
                      )}
                      {row.nama_layanan || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{row.nama_loket || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          'inline-block px-2 py-1 text-xs font-semibold leading-none rounded-full ' +
                          statusBadgeClass[row.status]
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.nik && <p className="text-xs">NIK: {row.nik}</p>}
                      {row.keterangan && <p className="text-xs">{row.keterangan}</p>}
                      {!row.nik && !row.keterangan && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>Ambil: {waktuShort(row.waktu_ambil)}</p>
                      {row.waktu_panggil && <p>Panggil: {waktuShort(row.waktu_panggil)}</p>}
                      {row.waktu_selesai && <p>Selesai: {waktuShort(row.waktu_selesai)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end space-x-2">
                        {row.status === 'dipanggil' && (
                          <>
                            <button
                              type="button"
                              onClick={() => markStatus(row, 'selesai')}
                              className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 dark:bg-green-700 dark:text-green-100 dark:hover:bg-green-600"
                              title="Tandai selesai"
                            >
                              ✓ Selesai
                            </button>
                            <button
                              type="button"
                              onClick={() => markStatus(row, 'batal')}
                              className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 dark:bg-red-700 dark:text-red-100 dark:hover:bg-red-600"
                              title="Batalkan"
                            >
                              ✕ Batal
                            </button>
                          </>
                        )}
                        {row.status === 'menunggu' && (
                          <button
                            type="button"
                            onClick={() => markStatus(row, 'batal')}
                            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 dark:bg-red-700 dark:text-red-100 dark:hover:bg-red-600"
                            title="Batalkan"
                          >
                            ✕ Batal
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="text-gray-600 hover:text-red-600 dark:text-gray-400 focus:outline-none"
                          aria-label="Hapus"
                          title="Hapus record"
                        >
                          <TrashIcon className="w-5 h-5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="grid px-4 py-3 text-xs font-semibold tracking-wide text-gray-500 uppercase border-t dark:border-gray-700 bg-gray-50 sm:grid-cols-9 dark:text-gray-400 dark:bg-gray-800">
          <span className="flex items-center col-span-3">
            Showing {showingFrom}-{showingTo} of {items.length}
          </span>
          <span className="col-span-2" />
          <span className="flex col-span-4 mt-2 sm:mt-auto sm:justify-end">
            <nav aria-label="Table navigation">
              <ul className="inline-flex items-center">
                <li>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-3 py-1 rounded-md rounded-r-none focus:outline-none focus:shadow-outline-purple disabled:opacity-40"
                    aria-label="Previous"
                  >
                    ‹
                  </button>
                </li>
                {pageNumbers.map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      className={
                        'px-3 py-1 rounded-md focus:outline-none focus:shadow-outline-purple ' +
                        (n === safePage
                          ? 'text-white bg-purple-600 border border-r-0 border-purple-600'
                          : '')
                      }
                    >
                      {n}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1 rounded-md rounded-l-none focus:outline-none focus:shadow-outline-purple disabled:opacity-40"
                    aria-label="Next"
                  >
                    ›
                  </button>
                </li>
              </ul>
            </nav>
          </span>
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/50"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
              Ambil Antrian Baru
            </h3>

            {formError && (
              <div
                role="alert"
                className="mb-3 px-3 py-2 text-sm text-red-700 bg-red-100 border border-red-200 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Layanan *</span>
                <select
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  value={form.id_layanan === '' ? '' : String(form.id_layanan)}
                  onChange={(e) =>
                    setForm({ ...form, id_layanan: e.target.value ? Number(e.target.value) : '' })
                  }
                  required
                  disabled={submitting}
                >
                  <option value="">— Pilih layanan —</option>
                  {layananList.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.kode_huruf} · {l.nama_layanan}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>NIK (opsional, 16 digit)</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{16}"
                  maxLength={16}
                  placeholder="3201xxxxxxxxxxxx"
                  value={form.nik}
                  onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, '') })}
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Keterangan (opsional)</span>
                <textarea
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  rows={2}
                  placeholder="Nama pasien / catatan tambahan"
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Nomor Manual (opsional)</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="text"
                  placeholder="Kosongkan untuk auto-generate"
                  value={form.nomor_antrian}
                  onChange={(e) => setForm({ ...form, nomor_antrian: e.target.value })}
                  disabled={submitting}
                />
              </label>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:border-gray-500 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-60"
                >
                  {submitting ? 'Menyimpan...' : 'Ambil Tiket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AntrianPage;
