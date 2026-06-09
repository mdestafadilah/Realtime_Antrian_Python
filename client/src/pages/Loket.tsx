import React, { useEffect, useMemo, useState } from 'react';
import PageTitle from '../components/Typography/PageTitle';
import { EditIcon, TrashIcon } from '../icons';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

type StatusBuka = 'buka' | 'tutup';

type LayananMini = {
  id: number;
  kode_huruf: string;
  nama_layanan: string;
};

type UserMini = {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type Loket = {
  id: number;
  id_layanan: number;
  nama_loket: string;
  status_buka: StatusBuka;
  nama_layanan?: string | null;
  kode_huruf?: string | null;
  users: UserMini[];
};

type ApiResponse<T = unknown> = {
  status: boolean;
  message?: string;
  data?: T;
};

type FormState = {
  nama_loket: string;
  id_layanan: number | '';
  status_buka: StatusBuka;
  id_users: number[];
};

const emptyForm: FormState = {
  nama_loket: '',
  id_layanan: '',
  status_buka: 'tutup',
  id_users: [],
};

const PAGE_SIZE = 10;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const LoketPage: React.FC = () => {
  const [items, setItems] = useState<Loket[]>([]);
  const [layananList, setLayananList] = useState<LayananMini[]>([]);
  const [usersList, setUsersList] = useState<UserMini[]>([]);
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
      const [resLoket, resLayanan, resUsers] = await Promise.all([
        fetch(`${API_URL}/api/loket/`, { headers: { ...authHeaders() } }),
        fetch(`${API_URL}/api/layanan/`, { headers: { ...authHeaders() } }),
        fetch(`${API_URL}/api/users/`, { headers: { ...authHeaders() } }),
      ]);

      const jsonLoket: ApiResponse<Loket[]> = await resLoket.json();
      if (!resLoket.ok || !jsonLoket.status) {
        setError(jsonLoket.message || `Gagal memuat data loket (HTTP ${resLoket.status})`);
        return;
      }
      setItems(jsonLoket.data || []);

      const jsonLayanan: ApiResponse<LayananMini[]> = await resLayanan.json();
      if (resLayanan.ok && jsonLayanan.status) setLayananList(jsonLayanan.data || []);

      const jsonUsers: ApiResponse<UserMini[]> = await resUsers.json();
      if (resUsers.ok && jsonUsers.status) setUsersList(jsonUsers.data || []);
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

  const openEdit = (row: Loket) => {
    setEditingId(row.id);
    setForm({
      nama_loket: row.nama_loket,
      id_layanan: row.id_layanan,
      status_buka: row.status_buka,
      id_users: row.users.map((u) => u.id),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
  };

  const toggleUser = (id: number) => {
    setForm((f) =>
      f.id_users.includes(id)
        ? { ...f, id_users: f.id_users.filter((x) => x !== id) }
        : { ...f, id_users: [...f.id_users, id] },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (form.id_layanan === '') {
      setFormError('Pilih layanan terlebih dahulu');
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const payload = {
      nama_loket: form.nama_loket.trim(),
      id_layanan: form.id_layanan,
      status_buka: form.status_buka,
      id_users: form.id_users,
    };

    const url = editingId ? `${API_URL}/api/loket/${editingId}` : `${API_URL}/api/loket/`;
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const json: ApiResponse<Loket> = await res.json();
      if (!res.ok || !json.status) {
        setFormError(json.message || `Operasi gagal (HTTP ${res.status})`);
        return;
      }
      setIsModalOpen(false);
      setNotice(json.message || (editingId ? 'Loket diupdate' : 'Loket ditambahkan'));
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: Loket) => {
    if (!window.confirm(`Hapus loket "${row.nama_loket}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/loket/${row.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal menghapus (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || 'Loket dihapus');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const toggleStatus = async (row: Loket) => {
    const next: StatusBuka = row.status_buka === 'buka' ? 'tutup' : 'buka';
    try {
      const res = await fetch(`${API_URL}/api/loket/status/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status_buka: next }),
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal mengubah status (HTTP ${res.status})`);
        return;
      }
      setNotice(`Loket "${row.nama_loket}" sekarang ${next.toUpperCase()}`);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const fullName = (u: UserMini) => {
    const n = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return n || u.username;
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle>Loket</PageTitle>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
        >
          + Tambah Loket
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
                <th className="px-4 py-3">Nama Loket</th>
                <th className="px-4 py-3">Layanan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Petugas</th>
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
                    Belum ada loket
                  </td>
                </tr>
              )}

              {!loading &&
                pageItems.map((row) => (
                  <tr key={row.id} className="text-gray-700 dark:text-gray-400">
                    <td className="px-4 py-3 text-sm font-semibold">{row.nama_loket}</td>
                    <td className="px-4 py-3 text-sm">
                      {row.kode_huruf && (
                        <span className="font-semibold mr-1">{row.kode_huruf}</span>
                      )}
                      {row.nama_layanan || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => toggleStatus(row)}
                        title="Klik untuk toggle status"
                        className={
                          'inline-block px-2 py-1 text-xs font-semibold leading-none rounded-full cursor-pointer ' +
                          (row.status_buka === 'buka'
                            ? 'text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-100 dark:bg-green-700'
                            : 'text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-100 dark:bg-red-700')
                        }
                      >
                        {row.status_buka}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.users.length === 0 ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <span title={row.users.map(fullName).join(', ')}>
                          {row.users.length} petugas
                        </span>
                      )}
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
            className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
              {editingId ? 'Edit Loket' : 'Tambah Loket'}
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
                <span>Nama Loket</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="text"
                  maxLength={50}
                  placeholder="Loket 01"
                  value={form.nama_loket}
                  onChange={(e) => setForm({ ...form, nama_loket: e.target.value })}
                  required
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Layanan</span>
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
                <span>Status</span>
                <select
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  value={form.status_buka}
                  onChange={(e) =>
                    setForm({ ...form, status_buka: e.target.value as StatusBuka })
                  }
                  disabled={submitting}
                >
                  <option value="tutup">tutup</option>
                  <option value="buka">buka</option>
                </select>
              </label>

              <div className="block text-sm text-gray-700 dark:text-gray-400">
                <span>
                  Petugas ({form.id_users.length} dipilih)
                </span>
                <div className="mt-1 border border-gray-300 rounded-md dark:border-gray-600 max-h-48 overflow-y-auto bg-white dark:bg-gray-700">
                  {usersList.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      Tidak ada user
                    </p>
                  ) : (
                    usersList.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        <input
                          type="checkbox"
                          className="mr-2 text-purple-600 form-checkbox focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300"
                          checked={form.id_users.includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                          disabled={submitting}
                        />
                        <span className="text-gray-700 dark:text-gray-200">{fullName(u)}</span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          ({u.username})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

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

export default LoketPage;
