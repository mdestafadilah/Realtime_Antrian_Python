import React, { useEffect, useMemo, useState } from 'react';
import PageTitle from '../components/Typography/PageTitle';
import { EditIcon, TrashIcon } from '../icons';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

type Group = {
  id: number;
  name: string;
  description?: string | null;
  bgcolor: string;
};

type User = {
  id: number;
  ip_address?: string | null;
  username: string;
  email: string;
  active: 0 | 1 | boolean;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  phone?: string | null;
  created_on?: number | string | null;
  last_login?: number | string | null;
  groups: Group[];
};

type ApiResponse<T = unknown> = {
  status: boolean;
  message?: string;
  data?: T;
};

type FormState = {
  email: string;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  company: string;
  groups: number[];
};

const emptyForm: FormState = {
  email: '',
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  phone: '',
  company: '',
  groups: [],
};

const PAGE_SIZE = 10;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function textOn(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

function isActive(u: User): boolean {
  return Boolean(u.active);
}

function fullName(u: User): string {
  const n = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return n || '-';
}

const UsersPage: React.FC = () => {
  const [items, setItems] = useState<User[]>([]);
  const [groupsList, setGroupsList] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resUsers, resGroups] = await Promise.all([
        fetch(`${API_URL}/api/users/`, { headers: { ...authHeaders() } }),
        fetch(`${API_URL}/api/groups/`, { headers: { ...authHeaders() } }),
      ]);

      const jsonUsers: ApiResponse<User[]> = await resUsers.json();
      if (!resUsers.ok || !jsonUsers.status) {
        setError(jsonUsers.message || `Gagal memuat data user (HTTP ${resUsers.status})`);
        return;
      }
      setItems(jsonUsers.data || []);

      const jsonGroups: ApiResponse<Group[]> = await resGroups.json();
      if (resGroups.ok && jsonGroups.status) setGroupsList(jsonGroups.data || []);
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

  const openEdit = (row: User) => {
    setEditingRow(row);
    setForm({
      email: row.email,
      username: row.username,
      password: '',
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      phone: row.phone || '',
      company: row.company || '',
      groups: row.groups.map((g) => g.id),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
  };

  const toggleGroup = (id: number) => {
    setForm((f) =>
      f.groups.includes(id)
        ? { ...f, groups: f.groups.filter((x) => x !== id) }
        : { ...f, groups: [...f.groups, id] },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!editingRow) {
      // Create — wajib email + password
      if (!form.email.trim()) {
        setFormError('Email wajib diisi');
        return;
      }
      if (form.password.length < 6) {
        setFormError('Password minimal 6 karakter');
        return;
      }
    } else {
      // Update — password optional, tapi kalau diisi minimal 6
      if (form.password && form.password.length < 6) {
        setFormError('Password minimal 6 karakter (atau kosongkan agar tidak diubah)');
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);

    // Build payload — edit: hanya kirim field yang relevan; create: kirim semua
    let payload: Record<string, unknown>;
    if (editingRow) {
      payload = {
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        groups: form.groups,
      };
      if (form.password) payload.password = form.password;
    } else {
      payload = {
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim() || null,
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        groups: form.groups,
      };
    }

    const url = editingRow
      ? `${API_URL}/api/users/${editingRow.id}`
      : `${API_URL}/api/users/`;
    const method = editingRow ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const json: ApiResponse<User> = await res.json();
      if (!res.ok || !json.status) {
        setFormError(json.message || `Operasi gagal (HTTP ${res.status})`);
        return;
      }
      setIsModalOpen(false);
      setNotice(json.message || (editingRow ? 'User diupdate' : 'User ditambahkan'));
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal terhubung ke server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: User) => {
    if (!window.confirm(`Hapus user "${row.username}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/users/${row.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal menghapus (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || 'User dihapus');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const toggleActive = async (row: User) => {
    const path = isActive(row) ? `deactivate/${row.id}` : `activate/${row.id}`;
    try {
      const res = await fetch(`${API_URL}/api/users/${path}`, {
        method: 'PUT',
        headers: { ...authHeaders() },
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal mengubah status (HTTP ${res.status})`);
        return;
      }
      setNotice(json.message || 'Status user diupdate');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle>Pengguna</PageTitle>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
        >
          + Tambah User
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
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Nama Lengkap</th>
                <th className="px-4 py-3">Groups</th>
                <th className="px-4 py-3">Status</th>
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
                    Belum ada user
                  </td>
                </tr>
              )}

              {!loading &&
                pageItems.map((row) => (
                  <tr key={row.id} className="text-gray-700 dark:text-gray-400">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-semibold">{row.username}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{fullName(row)}</td>
                    <td className="px-4 py-3 text-sm">
                      {row.groups.length === 0 ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.groups.map((g) => (
                            <span
                              key={g.id}
                              className="inline-block px-2 py-0.5 text-xs font-semibold leading-none rounded-full"
                              style={{ backgroundColor: g.bgcolor, color: textOn(g.bgcolor) }}
                            >
                              {g.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        title="Klik untuk toggle status"
                        className={
                          'inline-block px-2 py-1 text-xs font-semibold leading-none rounded-full cursor-pointer ' +
                          (isActive(row)
                            ? 'text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-100 dark:bg-green-700'
                            : 'text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-100 dark:bg-red-700')
                        }
                      >
                        {isActive(row) ? 'aktif' : 'nonaktif'}
                      </button>
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
            className="w-full max-w-lg p-6 bg-white rounded-lg shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
              {editingRow ? `Edit User: ${editingRow.username}` : 'Tambah User'}
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
                <span>Email{!editingRow && ' *'}</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
                  type="email"
                  placeholder="john@doe.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required={!editingRow}
                  disabled={submitting || !!editingRow}
                />
                {editingRow && (
                  <span className="block mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Email tidak dapat diubah.
                  </span>
                )}
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Username</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
                  type="text"
                  maxLength={100}
                  placeholder={editingRow ? '' : 'Kosongkan untuk auto-generate'}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={submitting || !!editingRow}
                />
                {editingRow && (
                  <span className="block mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Username tidak dapat diubah.
                  </span>
                )}
              </label>

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Password{!editingRow && ' *'}</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="password"
                  placeholder={editingRow ? 'Kosongkan agar tidak diubah' : 'Min. 6 karakter'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={editingRow ? undefined : 6}
                  required={!editingRow}
                  disabled={submitting}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-gray-700 dark:text-gray-400">
                  <span>Nama Depan</span>
                  <input
                    className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    type="text"
                    maxLength={50}
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    disabled={submitting}
                  />
                </label>
                <label className="block text-sm text-gray-700 dark:text-gray-400">
                  <span>Nama Belakang</span>
                  <input
                    className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    type="text"
                    maxLength={50}
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    disabled={submitting}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-gray-700 dark:text-gray-400">
                  <span>Telepon</span>
                  <input
                    className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    type="text"
                    maxLength={20}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={submitting}
                  />
                </label>
                <label className="block text-sm text-gray-700 dark:text-gray-400">
                  <span>Perusahaan</span>
                  <input
                    className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    type="text"
                    maxLength={100}
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    disabled={submitting}
                  />
                </label>
              </div>

              <div className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Groups ({form.groups.length} dipilih)</span>
                <div className="mt-1 border border-gray-300 rounded-md dark:border-gray-600 max-h-40 overflow-y-auto bg-white dark:bg-gray-700">
                  {groupsList.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      Tidak ada group
                    </p>
                  ) : (
                    groupsList.map((g) => (
                      <label
                        key={g.id}
                        className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        <input
                          type="checkbox"
                          className="mr-2 text-purple-600 form-checkbox focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300"
                          checked={form.groups.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                          disabled={submitting}
                        />
                        <span
                          className="inline-block px-2 py-0.5 text-xs font-semibold leading-none rounded-full"
                          style={{ backgroundColor: g.bgcolor, color: textOn(g.bgcolor) }}
                        >
                          {g.name}
                        </span>
                        {g.description && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            {g.description}
                          </span>
                        )}
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

export default UsersPage;
