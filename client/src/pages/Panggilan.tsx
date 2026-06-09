import React, { useEffect, useMemo, useState } from 'react';
import PageTitle from '../components/Typography/PageTitle';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

type StatusAntrian = 'menunggu' | 'dipanggil' | 'selesai' | 'batal';

type LoketBuka = {
  id: number;
  id_layanan: number;
  nama_loket: string;
  status_buka: 'buka' | 'tutup';
  nama_layanan?: string | null;
  kode_huruf?: string | null;
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

type ApiResponse<T = unknown> = {
  status: boolean;
  message?: string;
  data?: T;
};

type CallResponseData = {
  id_loket: number;
  nama_loket: string;
  nomor_antrian: string;
  keterangan?: string;
  channel?: string;
  waktu_panggil?: string;
};

type AntrianListResponse = {
  status: boolean;
  message?: string;
  tanggal?: string;
  data?: Antrian[];
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const statusBadgeClass: Record<StatusAntrian, string> = {
  menunggu: 'text-yellow-700 bg-yellow-100 dark:text-yellow-100 dark:bg-yellow-700',
  dipanggil: 'text-purple-700 bg-purple-100 dark:text-purple-100 dark:bg-purple-600',
  selesai: 'text-green-700 bg-green-100 dark:text-green-100 dark:bg-green-700',
  batal: 'text-red-700 bg-red-100 dark:text-red-100 dark:bg-red-700',
};

const PanggilanPage: React.FC = () => {
  const [loketList, setLoketList] = useState<LoketBuka[]>([]);
  const [selectedLoketId, setSelectedLoketId] = useState<number | ''>('');
  const [antrian, setAntrian] = useState<Antrian[]>([]);
  const [loading, setLoading] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Initial load: loket buka + antrian hari ini
  const fetchLoket = async () => {
    try {
      const res = await fetch(`${API_URL}/api/panggilan/loket`, { headers: { ...authHeaders() } });
      const json: ApiResponse<LoketBuka[]> = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal memuat loket buka (HTTP ${res.status})`);
        return;
      }
      const list = json.data || [];
      setLoketList(list);
      // Auto-pilih loket pertama kalau belum ada yang dipilih
      if (selectedLoketId === '' && list.length > 0) {
        setSelectedLoketId(list[0].id);
      } else if (selectedLoketId !== '' && !list.find((l) => l.id === selectedLoketId)) {
        // Loket terpilih sudah ditutup → kosongkan pilihan
        setSelectedLoketId(list.length > 0 ? list[0].id : '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const fetchAntrian = async () => {
    try {
      const res = await fetch(`${API_URL}/api/antrian/`, { headers: { ...authHeaders() } });
      const json: AntrianListResponse = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal memuat antrian (HTTP ${res.status})`);
        return;
      }
      setAntrian(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchLoket(), fetchAntrian()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // Initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const selectedLoket = useMemo(
    () => loketList.find((l) => l.id === selectedLoketId) || null,
    [loketList, selectedLoketId],
  );

  // Antrian yang relevan untuk layanan loket ini
  const antrianForLoket = useMemo(() => {
    if (!selectedLoket) return [];
    return antrian.filter((a) => a.id_layanan === selectedLoket.id_layanan);
  }, [antrian, selectedLoket]);

  // Nomor terakhir yang dipanggil loket ini hari ini
  const lastCalled = useMemo(() => {
    if (!selectedLoket) return null;
    const calls = antrian
      .filter((a) => a.id_loket === selectedLoket.id && a.waktu_panggil)
      .sort((a, b) => (b.waktu_panggil || '').localeCompare(a.waktu_panggil || ''));
    return calls[0] || null;
  }, [antrian, selectedLoket]);

  const menungguCount = useMemo(
    () => antrianForLoket.filter((a) => a.status === 'menunggu').length,
    [antrianForLoket],
  );

  const handleCallNext = async () => {
    if (!selectedLoket || callingNext) return;
    setCallingNext(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/panggilan/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id_loket: selectedLoket.id }),
      });
      const json: ApiResponse<CallResponseData> = await res.json();
      if (!json.status) {
        // Server return status:false saat tidak ada tiket menunggu (bukan error)
        setNotice(json.message || 'Tidak ada antrian menunggu untuk loket ini');
      } else {
        setNotice(
          json.data
            ? `📢 Memanggil ${json.data.nomor_antrian} ke ${json.data.nama_loket}`
            : json.message || 'Antrian dipanggil',
        );
      }
      await fetchAntrian();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    } finally {
      setCallingNext(false);
    }
  };

  const handleRecall = async () => {
    if (!selectedLoket || !lastCalled) return;
    try {
      const res = await fetch(`${API_URL}/api/panggilan/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id_loket: selectedLoket.id, nomor: lastCalled.nomor_antrian }),
      });
      const json: ApiResponse<CallResponseData> = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal memanggil ulang (HTTP ${res.status})`);
        return;
      }
      setNotice(`🔁 Memanggil ulang ${lastCalled.nomor_antrian}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    }
  };

  const handleManualCall = async (row: Antrian) => {
    if (!selectedLoket) return;
    setActingId(row.id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/panggilan/simpan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id_antrian: row.id, id_loket: selectedLoket.id }),
      });
      const json: ApiResponse<CallResponseData> = await res.json();
      if (!res.ok || !json.status) {
        setError(json.message || `Gagal memanggil (HTTP ${res.status})`);
        return;
      }
      setNotice(
        json.data
          ? `📢 Memanggil ${json.data.nomor_antrian} ke ${json.data.nama_loket}`
          : json.message || 'Panggilan disimpan',
      );
      await fetchAntrian();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    } finally {
      setActingId(null);
    }
  };

  const waktuShort = (t: string | null) => (t ? t.slice(11, 19) : '-');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>Panggilan</PageTitle>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:border-gray-500 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
        >
          {loading ? 'Memuat...' : '↻ Refresh'}
        </button>
      </div>

      {/* Loket selector */}
      <div className="p-4 mb-6 bg-white rounded-lg shadow-xs dark:bg-gray-800">
        {loketList.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tidak ada loket dalam status <strong>buka</strong>. Buka loket dulu di menu Loket.
          </p>
        ) : (
          <label className="block text-sm text-gray-700 dark:text-gray-400">
            <span>Pilih Loket</span>
            <select
              className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
              value={selectedLoketId === '' ? '' : String(selectedLoketId)}
              onChange={(e) =>
                setSelectedLoketId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">— Pilih loket —</option>
              {loketList.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nama_loket} · {l.kode_huruf || ''} {l.nama_layanan || ''}
                </option>
              ))}
            </select>
          </label>
        )}
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

      {/* Console panel */}
      {selectedLoket && (
        <div className="grid gap-6 mb-6 md:grid-cols-2">
          {/* Sedang dipanggil */}
          <div className="p-6 bg-white rounded-lg shadow-xs dark:bg-gray-800">
            <p className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Sedang Dipanggil
            </p>
            {lastCalled ? (
              <>
                <p className="text-5xl font-bold text-purple-600 dark:text-purple-400">
                  {lastCalled.nomor_antrian}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {lastCalled.keterangan || '-'}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Dipanggil pukul {waktuShort(lastCalled.waktu_panggil)}
                </p>
                <button
                  type="button"
                  onClick={handleRecall}
                  className="mt-3 px-3 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                >
                  🔁 Panggil Ulang
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Belum ada panggilan dari loket ini hari ini.
              </p>
            )}
          </div>

          {/* Panggil berikutnya */}
          <div className="flex flex-col p-6 bg-white rounded-lg shadow-xs dark:bg-gray-800">
            <p className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Antrian Menunggu
            </p>
            <p className="text-5xl font-bold text-yellow-600 dark:text-yellow-400">
              {menungguCount}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Layanan: {selectedLoket.kode_huruf || ''} {selectedLoket.nama_layanan || ''}
            </p>
            <button
              type="button"
              onClick={handleCallNext}
              disabled={callingNext || menungguCount === 0}
              className="mt-auto px-4 py-3 text-base font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {callingNext ? 'Memanggil...' : '📢 Panggil Berikutnya'}
            </button>
          </div>
        </div>
      )}

      {/* Tabel antrian untuk layanan loket terpilih */}
      {selectedLoket && (
        <div className="w-full overflow-hidden rounded-lg shadow-xs">
          <div className="w-full overflow-x-auto">
            <table className="w-full whitespace-no-wrap">
              <thead>
                <tr className="text-xs font-semibold tracking-wide text-left text-gray-500 uppercase border-b dark:border-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-800">
                  <th className="px-4 py-3">Nomor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Loket</th>
                  <th className="px-4 py-3">Info</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y dark:divide-gray-700 dark:bg-gray-800">
                {antrianForLoket.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400"
                    >
                      Belum ada antrian untuk layanan ini hari ini
                    </td>
                  </tr>
                )}
                {antrianForLoket.map((row) => {
                  const isCallable = row.status === 'menunggu' || row.status === 'dipanggil';
                  return (
                    <tr key={row.id} className="text-gray-700 dark:text-gray-400">
                      <td className="px-4 py-3 text-sm font-semibold">{row.nomor_antrian}</td>
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
                      <td className="px-4 py-3 text-sm">{row.nama_loket || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        {row.nik && <p className="text-xs">NIK: {row.nik}</p>}
                        {row.keterangan && <p className="text-xs">{row.keterangan}</p>}
                        {!row.nik && !row.keterangan && <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p>Ambil: {waktuShort(row.waktu_ambil)}</p>
                        {row.waktu_panggil && <p>Panggil: {waktuShort(row.waktu_panggil)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {isCallable && (
                            <button
                              type="button"
                              onClick={() => handleManualCall(row)}
                              disabled={actingId === row.id}
                              className="px-3 py-1 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-60"
                              title={row.status === 'dipanggil' ? 'Panggil ulang' : 'Panggil'}
                            >
                              {actingId === row.id
                                ? '...'
                                : row.status === 'dipanggil'
                                  ? '🔁 Ulang'
                                  : '📢 Panggil'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default PanggilanPage;
