import React, { useEffect, useMemo, useState } from 'react';
import PageTitle from '../components/Typography/PageTitle';
import { EditIcon, TrashIcon } from '../icons';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

type ShowWelcome = 'ya' | 'tidak';

type Layanan = {
  id: number;
  kode_huruf: string;
  nama_layanan: string;
  keterangan: string | null;
  show_welcome: ShowWelcome;
};

type ApiResponse<T = unknown> = {
  status: boolean;
  message?: string;
  data?: T;
};

type FormState = {
  kode_huruf: string;
  nama_layanan: string;
  keterangan: string;
  show_welcome: ShowWelcome;
};

const emptyForm: FormState = {
  kode_huruf: '',
  nama_layanan: '',
  keterangan: '',
  show_welcome: 'tidak',
};

const PAGE_SIZE = 10;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const LayananPage: React.FC = () => {
  const [items, setItems] = useState<Layanan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/layanan/`, { headers: { ...authHeaders() } });
      const json: ApiResponse<Layanan[]> = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal memuat data (HTTP ${res.status})`);
        return;
      }
      setItems(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

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

  // Sliding window of page numbers (max 5 visible)
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
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (row: Layanan) => {
    setEditingId(row.id);
    setForm({
      kode_huruf: row.kode_huruf,
      nama_layanan: row.nama_layanan,
      keterangan: row.keterangan || '',
      show_welcome: row.show_welcome,
    });
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
    setSubmitting(true);
    setFormError(null);

    const payload = {
      kode_huruf: form.kode_huruf.trim(),
      nama_layanan: form.nama_layanan.trim(),
      keterangan: form.keterangan.trim() || null,
      show_welcome: form.show_welcome,
    };

    const url = editingId ? `${API_URL}/api/layanan/${editingId}` : `${API_URL}/api/layanan/`;
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const json: ApiResponse<Layanan> = await res.json();
      if (!res.ok || !json.status) {
        setFormError(json.message || `Operasi gagal (HTTP ${res.status})`);
        return;
      }
      setIsModalOpen(false);
      setNotice(json.message || (editingId ? 'Layanan diupdate' : 'Layanan ditambahkan'));
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: Layanan) => {
    if (!window.confirm(`Hapus layanan "${row.nama_layanan}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/layanan/${row.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal menghapus (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || 'Layanan dihapus');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle>Layanan</PageTitle>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
        >
          + Tambah Layanan
        </button>
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
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Layanan</th>
                <th className="px-4 py-3">Keterangan</th>
                <th className="px-4 py-3">Welcome</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y dark:divide-gray-700 dark:bg-gray-800">
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                  >
                    Memuat...
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                  >
                    Belum ada layanan
                  </td>
                </tr>
              )}

              {!loading &&
                pageItems.map((row) => (
                  <tr key={row.id} className="text-gray-700 dark:text-gray-400">
                    <td className="px-4 py-3 text-sm font-semibold">{row.kode_huruf}</td>
                    <td className="px-4 py-3 text-sm">{row.nama_layanan}</td>
                    <td className="px-4 py-3 text-sm">{row.keterangan || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          'inline-block px-2 py-1 text-xs font-semibold leading-none rounded-full ' +
                          (row.show_welcome === 'ya'
                            ? 'text-purple-700 bg-purple-100 dark:text-purple-100 dark:bg-purple-600'
                            : 'text-gray-700 bg-gray-100 dark:text-gray-100 dark:bg-gray-700')
                        }
                      >
                        {row.show_welcome}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end space-x-4">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="text-gray-600 hover:text-purple-600 dark:text-gray-400 focus:outline-none"
                          aria-label="Edit"
                        >
                          <EditIcon className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="text-gray-600 hover:text-red-600 dark:text-gray-400 focus:outline-none"
                          aria-label="Hapus"
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
              {editingId ? 'Edit Layanan' : 'Tambah Layanan'}
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
                <span>Kode Huruf</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="text"
                  maxLength={5}
                  placeholder="A"
                  value={form.kode_huruf}
                  onChange={(e) => setForm({ ...form, kode_huruf: e.target.value })}
                  required
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Nama Layanan</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="text"
                  maxLength={100}
                  placeholder="Poli Umum"
                  value={form.nama_layanan}
                  onChange={(e) => setForm({ ...form, nama_layanan: e.target.value })}
                  required
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Keterangan</span>
                <textarea
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  rows={3}
                  placeholder="Deskripsi tambahan (opsional)"
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Tampilkan di Welcome</span>
                <select
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  value={form.show_welcome}
                  onChange={(e) =>
                    setForm({ ...form, show_welcome: e.target.value as ShowWelcome })
                  }
                  disabled={submitting}
                >
                  <option value="tidak">tidak</option>
                  <option value="ya">ya</option>
                </select>
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
                  {submitting ? 'Menyimpan...' : editingId ? 'Update' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default LayananPage;
