import React, { useEffect, useMemo, useState } from 'react';
import PageTitle from '../components/Typography/PageTitle';
import { EditIcon, TrashIcon } from '../icons';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

const ADMIN_GROUP_NAME = 'admin';
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

type Group = {
  id: number;
  name: string;
  description: string | null;
  bgcolor: string;
};

type ApiResponse<T = unknown> = {
  status: boolean;
  message?: string;
  data?: T;
};

type FormState = {
  name: string;
  description: string;
  bgcolor: string;
};

const emptyForm: FormState = {
  name: '',
  description: '',
  bgcolor: '#607D8B',
};

const PAGE_SIZE = 10;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Pilih warna teks (hitam/putih) berdasarkan luminance background hex
function textOn(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

const GroupsPage: React.FC = () => {
  const [items, setItems] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Group | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/groups/`, { headers: { ...authHeaders() } });
      const json: ApiResponse<Group[]> = await res.json();
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
    setEditingRow(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (row: Group) => {
    setEditingRow(row);
    setForm({
      name: row.name,
      description: row.description || '',
      bgcolor: row.bgcolor || '#607D8B',
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

    const name = form.name.trim();
    if (!NAME_PATTERN.test(name)) {
      setFormError('Nama hanya boleh huruf, angka, dash (-), atau underscore (_)');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      name,
      description: form.description.trim(),
      bgcolor: form.bgcolor,
    };

    const url = editingRow
      ? `${API_URL}/api/groups/${editingRow.id}`
      : `${API_URL}/api/groups/`;
    const method = editingRow ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const json: ApiResponse<Group> = await res.json();
      if (!res.ok || !json.status) {
        setFormError(json.message || `Operasi gagal (HTTP ${res.status})`);
        return;
      }
      setIsModalOpen(false);
      setNotice(json.message || (editingRow ? 'Group diupdate' : 'Group ditambahkan'));
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: Group) => {
    if (row.name === ADMIN_GROUP_NAME) return; // disabled at UI; defensive
    if (!window.confirm(`Hapus group "${row.name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/groups/${row.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal menghapus (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || 'Group dihapus');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const isAdminRow = editingRow?.name === ADMIN_GROUP_NAME;

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle>Grup Keamanan</PageTitle>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
        >
          + Tambah Group
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
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Color</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y dark:divide-gray-700 dark:bg-gray-800">
              {loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                  >
                    Memuat...
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                  >
                    Belum ada group
                  </td>
                </tr>
              )}

              {!loading &&
                pageItems.map((row) => {
                  const isAdmin = row.name === ADMIN_GROUP_NAME;
                  return (
                    <tr key={row.id} className="text-gray-700 dark:text-gray-400">
                      <td className="px-4 py-3 text-sm">
                        <span
                          className="inline-block px-2 py-1 text-xs font-semibold leading-none rounded-full"
                          style={{ backgroundColor: row.bgcolor, color: textOn(row.bgcolor) }}
                        >
                          {row.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{row.description || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center">
                          <span
                            className="inline-block w-4 h-4 mr-2 rounded border border-gray-300 dark:border-gray-600"
                            style={{ backgroundColor: row.bgcolor }}
                            aria-hidden="true"
                          />
                          <code className="text-xs">{row.bgcolor}</code>
                        </div>
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
                            disabled={isAdmin}
                            title={isAdmin ? 'Group admin tidak boleh dihapus' : 'Hapus'}
                            className="text-gray-600 hover:text-red-600 dark:text-gray-400 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-600"
                            aria-label="Hapus"
                          >
                            <TrashIcon className="w-5 h-5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              {editingRow ? 'Edit Group' : 'Tambah Group'}
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
                <span>
                  Nama Group{' '}
                  <span className="text-xs text-gray-500">(huruf/angka/dash/underscore)</span>
                </span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
                  type="text"
                  maxLength={20}
                  placeholder="admin, manager, operator"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  pattern="[A-Za-z0-9_-]+"
                  required
                  disabled={submitting || isAdminRow}
                />
                {isAdminRow && (
                  <span className="block mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Nama group "admin" terkunci.
                  </span>
                )}
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Deskripsi</span>
                <textarea
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  rows={3}
                  maxLength={100}
                  placeholder="Keterangan (opsional, maks 100 karakter)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={submitting}
                />
              </label>

              <div className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Warna Label</span>
                <div className="flex items-center mt-1 space-x-2">
                  <input
                    type="color"
                    className="w-12 h-10 p-1 border border-gray-300 rounded-md cursor-pointer dark:border-gray-600 dark:bg-gray-700"
                    value={form.bgcolor}
                    onChange={(e) => setForm({ ...form, bgcolor: e.target.value })}
                    disabled={submitting}
                    aria-label="Warna label"
                  />
                  <input
                    type="text"
                    className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    maxLength={7}
                    placeholder="#607D8B"
                    value={form.bgcolor}
                    onChange={(e) => setForm({ ...form, bgcolor: e.target.value })}
                    disabled={submitting}
                  />
                  <span
                    className="inline-block px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap"
                    style={{ backgroundColor: form.bgcolor, color: textOn(form.bgcolor) }}
                  >
                    {form.name || 'Preview'}
                  </span>
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
                  {submitting ? 'Menyimpan...' : editingRow ? 'Update' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default GroupsPage;
