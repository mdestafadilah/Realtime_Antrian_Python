## Donasi ❤

Klik link dibawah untuk mendukung pengembangan

[![Donate trakteer](https://img.shields.io/badge/Donate-Trakteer-red?style=for-the-badge&link=https%3A%2F%2Ftrakteer.id%2Fmdestafadilah%2Ftip&labelColor=%239f39b5&color=%2300bcd4)](https://trakteer.id/mdestafadilah/tip)
[![Donate saweria](https://img.shields.io/badge/Donate-Saweria-red?style=for-the-badge&link=https%3A%2F%2Fsaweria.co%2Fmdestafadilah&labelColor=%239f39b5&color=%2300bcd4)](https://saweria.co/mdestafadilah)

# Realtime Antrian — Python Version

Porting dari versi PHP (CodeIgniter 3) ke arsitektur modern berbasis **Python (FastAPI + Socket.IO)** dan **React (Vite + TanStack Router)** dengan database **MySQL**.

Sistem antrian realtime ini dirancang untuk rumah sakit, klinik, atau instansi pelayanan publik. Pengunjung dapat mengambil nomor antrian secara mandiri, petugas loket memanggil dari panel admin/panggilan, dan layar display TV terupdate secara instan tanpa refresh menggunakan WebSocket (Socket.IO).

---

## Tech Stack

1. **Backend**: FastAPI (Python 3.9+)
2. **Database**: MySQL (Koneksi via `pymysql` dan `cryptography`)
3. **Realtime Gateway**: `fastapi-socketio` (WebSocket Socket.IO terintegrasi langsung dengan FastAPI)
4. **Text-To-Speech (TTS)**: Microsoft `edge-tts` & `piper-tts` (untuk pemanggilan suara nomor antrian otomatis)
5. **Frontend**: React + Vite + Tailwind CSS + TanStack Router (Start)

---

## Struktur Folder

```
Realtime_Antrian_Python/
├── client/                     # Frontend App (React + Vite + TanStack Start)
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── routes/             # Client-side file-based routes
│   │   └── pages/              # Halaman Login, Blank, 404, dll.
│   └── package.json
└── server/                     # Backend App (FastAPI)
    ├── examples/
    │   └── app.py              # Launch entry point & dev server
    ├── fastapi_socketio/       # Library Socket.IO integration
    ├── modules/                # Domain modular backend
    │   ├── db.py               # Database manager (MySQL connection helper)
    │   ├── layanan.py          # Layanan CRUD REST API
    │   ├── loket.py            # Loket CRUD REST API
    │   ├── groups.py           # Groups CRUD REST API
    │   ├── users.py            # Users CRUD REST API
    │   ├── antrian.py          # Antrian CRUD REST API
    │   ├── client.py           # Client (TV/display) CRUD + assignment loket
    │   ├── tts.py              # Text-to-Speech REST API (Edge + Piper)
    │   └── panggilan.py        # Logika panggilan [TODO]
    ├── app/
    │   ├── output/             # Audio hasil generate TTS (auto cleanup)
    │   └── piper_voices/       # Model voice Piper offline (*.onnx + *.onnx.json)
    ├── download_piper_voices.py # Helper unduh model voice Piper
    ├── requirements.txt        # PIP dependencies
    └── setup.py                # Package installer
```

---

## Modul Layanan — `/api/layanan`

Modul `layanan` menangani data master jenis layanan (kategori antrian) beserta prefix kode hurufnya (misal: A = Loket Pendaftaran, B = Kasir).

### Daftar Endpoint

| Method   | Endpoint             | Keterangan                                                             |
| -------- | -------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/api/layanan`       | Mengambil list semua jenis layanan                                     |
| `GET`    | `/api/layanan/{id}`  | Mengambil rincian detail satu layanan berdasarkan ID                   |
| `POST`   | `/api/layanan`       | Membuat layanan baru. Body: `kode_huruf`, `nama_layanan`, `keterangan?` |
| `PUT`    | `/api/layanan/{id}`  | Update sebagian field layanan                                          |
| `DELETE` | `/api/layanan/{id}`  | Menghapus layanan                                                      |

---

## Modul Loket — `/api/loket`

Modul `loket` mengelola data meja/loket counter petugas panggilan, status keaktifan buka/tutup loket, serta penugasan user ke loket tertentu.

### Daftar Endpoint

| Method   | Endpoint                 | Keterangan                                                                     |
| -------- | ------------------------ | ------------------------------------------------------------------------------ |
| `GET`    | `/api/loket`             | Mengambil list semua loket (termasuk relasi layanan & user ter-assign)         |
| `GET`    | `/api/loket/{id}`        | Mengambil rincian detail satu loket beserta user ter-assign                    |
| `GET`    | `/api/loket/buka`        | List loket yang sedang buka (opsional: `?with_last=1` untuk nomor antrian hari ini) |
| `GET`    | `/api/loket/users/{id}`  | Mendapatkan daftar user yang ter-assign ke loket                               |
| `POST`   | `/api/loket`             | Membuat loket baru (dapat menyertakan array user IDs `id_users`)              |
| `PUT`    | `/api/loket/status/{id}` | Update status buka/tutup loket                                                 |
| `PUT`    | `/api/loket/users/{id}`  | Sinkronisasi/replace-all penugasan user untuk loket                            |
| `DELETE` | `/api/loket/{id}`        | Menghapus loket                                                                |

---

## Modul Users — `/api/users`

Modul `users` menangani data pengguna/petugas (User Management), hashing password dengan bcrypt, dan relasi penugasan group.

### Daftar Endpoint

| Method   | Endpoint                     | Keterangan                                                                     |
| -------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `GET`    | `/api/users`                 | Mengambil list semua user beserta details group masing-masing                  |
| `GET`    | `/api/users/{id}`            | Mengambil rincian detail satu user beserta details group                       |
| `POST`   | `/api/users`                 | Mendaftarkan user baru (IP otomatis terekam, password dihash, & assign groups) |
| `PUT`    | `/api/users/{id}`            | Update detail user (partial update data user & sinkronisasi group)            |
| `PUT`    | `/api/users/activate/{id}`   | Mengaktifkan status keaktifan user (`active = 1`)                              |
| `PUT`    | `/api/users/deactivate/{id}` | Menonaktifkan status keaktifan user (`active = 0`)                            |
| `DELETE` | `/api/users/{id}`            | Menghapus user                                                                 |

---

## Modul Groups — `/api/groups`

Modul `groups` menangani hak akses / role (Group Management via Ion Auth) beserta warna label background display TV.

### Daftar Endpoint

| Method   | Endpoint                 | Keterangan                                                                     |
| -------- | ------------------------ | ------------------------------------------------------------------------------ |
| `GET`    | `/api/groups`             | Mengambil list semua groups                                                    |
| `GET`    | `/api/groups/{id}`        | Mengambil rincian detail satu group                                            |
| `GET`    | `/api/groups/users/{id}`  | Mengambil daftar user yang termasuk ke dalam group tersebut                    |
| `POST`   | `/api/groups`             | Membuat group baru (nama group hanya alfanumerik & dash/underscore)            |
| `PUT`    | `/api/groups/{id}`        | Update data group (nama group `admin` dilindungi dari pengubahan/rename)       |
| `DELETE` | `/api/groups/{id}`        | Menghapus group (group `admin` dilindungi dari penghapusan)                   |

---

## Modul Antrian — `/api/antrian`

Modul `antrian` mengelola data transaksi antrian harian, pengambilan tiket baru, serta flow panggilan antrian loket.

### Daftar Endpoint

| Method   | Endpoint                       | Keterangan                                                                       |
| -------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `GET`    | `/api/antrian`                 | Mengambil rekap status & list transaksi harian (opsional filter `?tanggal=`)     |
| `POST`   | `/api/antrian`                 | Membuat nomor antrian baru (menggenerate tiket harian, otomatis broadcast TV)    |
| `POST`   | `/api/antrian/call`            | Memanggil antrian berikutnya di loket tertentu (hanya DB, tanpa broadcast TV)   |
| `POST`   | `/api/antrian/panggilansimpan` | Menyimpan panggilan manual/panggil ulang (bisa mendeteksi panggilan ulang)       |
| `PUT`    | `/api/antrian/selesai/{id}`    | Mengupdate status antrian menjadi selesai                                         |
| `PUT`    | `/api/antrian/batal/{id}`      | Mengupdate status antrian menjadi batal                                           |
| `DELETE` | `/api/antrian/{id}`            | Menghapus record transaksi antrian                                               |

---

## Modul Client — `/api/client`

Modul `client` mengelola data master client (misal: TV display di lobby, layar antrian poli, panel admin kios). Setiap client bisa di-assign ke satu atau lebih loket — dipakai untuk mem-filter loket mana saja yang ditampilkan di layar tersebut. Status `is_active` menentukan apakah client tersebut sedang dipakai.

### Daftar Endpoint

| Method   | Endpoint                  | Keterangan                                                                       |
| -------- | ------------------------- | -------------------------------------------------------------------------------- |
| `GET`    | `/api/client`             | Mengambil list semua client (termasuk loket ter-assign)                          |
| `GET`    | `/api/client/active`      | List client yang sedang aktif (`is_active = 'ya'`) + loket-nya                   |
| `GET`    | `/api/client/{id}`        | Detail satu client beserta loket ter-assign                                      |
| `GET`    | `/api/client/lokets/{id}` | Daftar loket yang ter-assign ke satu client                                      |
| `POST`   | `/api/client`             | Tambah client baru (opsional sertakan `id_lokets[]`)                             |
| `PUT`    | `/api/client/{id}`        | Update partial: `nama_client`, `is_active`, dan/atau `id_lokets[]`               |
| `PUT`    | `/api/client/status/{id}` | Update khusus status aktif (`ya`/`tidak`)                                        |
| `PUT`    | `/api/client/lokets/{id}` | Sinkronisasi/replace-all assignment loket untuk client                           |
| `DELETE` | `/api/client/{id}`        | Hapus client (cascade ke pivot `client_loket`)                                   |

### Contoh Body

**Create:**

```json
{
  "nama_client": "TV Lobby Lantai 1",
  "is_active": "ya",
  "id_lokets": [1, 2, 5]
}
```

**Update status saja:**

```json
{ "is_active": "tidak" }
```

**Sync lokets (replace-all):**

```json
{ "id_lokets": [1, 3, 7] }
```

---

## Modul TTS — `/api/tts`

Modul `tts` mengubah teks menjadi audio untuk pemanggilan suara nomor antrian, sapaan, atau pengumuman loket. Mendukung dua engine:

- **Edge TTS** (default, online) — pakai suara natural Microsoft Edge. Tidak perlu model lokal, tapi butuh koneksi internet ke server Microsoft.
- **Piper TTS** (offline/lokal) — neural TTS yang berjalan sepenuhnya di server. Butuh download model voice (`.onnx`) sekali di awal, setelah itu sepenuhnya offline.

Auth via header `X-API-Key` bersifat **opt-in**: kalau env `API_KEY` / `API_KEYS` tidak diisi maka modul jalan tanpa auth (mode dev). Rate limit terpasang otomatis lewat [slowapi](https://github.com/laurentS/slowapi) — bucket per API key kalau ada, kalau tidak per IP client.

### Daftar Endpoint

| Method   | Endpoint                       | Auth | Keterangan                                                                       |
| -------- | ------------------------------ | ---- | -------------------------------------------------------------------------------- |
| `GET`    | `/api/tts/health`              | ❌   | Status engine (edge/piper) + folder output                                       |
| `GET`    | `/api/tts/voices`              | ❌   | List semua voice yang tersedia (Indonesian, English, Piper)                      |
| `POST`   | `/api/tts/`                    | ✅   | Generate satu audio dari teks. Body JSON: `text`, `voice`, `language`, `engine`  |
| `POST`   | `/api/tts/batch`               | ✅   | Generate banyak audio sekaligus (maks 10 request per batch)                      |
| `GET`    | `/api/tts/audio/{audio_id}`    | ✅   | Download / stream file audio hasil generate (`.wav` atau `.mp3`)                |
| `GET`    | `/api/tts/stats`               | ✅   | Statistik file output + konfigurasi engine                                        |

### Contoh Penggunaan

**1. Generate suara antrian (Bahasa Indonesia, Edge TTS):**

```bash
curl -X POST http://localhost:8000/api/tts/ \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Nomor antrian A satu, silakan menuju loket satu",
    "voice": "female",
    "language": "indonesian",
    "engine": "edge"
  }'
```

Respon:

```json
{
  "status": true,
  "message": "Audio berhasil dibuat",
  "data": {
    "audio_id": "f1c2...",
    "audio_url": "/api/tts/audio/f1c2...",
    "duration_estimate": 4.5,
    "voice_used": "id-ID-GadisNeural",
    "engine_used": "edge",
    "file_size": 88200
  }
}
```

**2. Putar audio di frontend (React/JS):**

```js
const res = await fetch("/api/tts/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Nomor A satu, silakan menuju loket satu",
    voice: "female",
    language: "indonesian",
  }),
});
const json = await res.json();
if (json.status) {
  new Audio(json.data.audio_url).play();
}
```

**3. Mode offline (Piper) — setelah download model:**

```bash
curl -X POST http://localhost:8000/api/tts/ \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Nomor antrian B dua",
    "voice": "id_female",
    "engine": "piper"
  }'
```

### Setup Piper (Offline Voice)

Piper butuh file model voice (`.onnx` + `.onnx.json`) yang tidak terbundel di repo. Download sekali dengan helper script:

```bash
# Voice default (id_ID-news_tts-medium + en_US-ryan-medium)
python download_piper_voices.py

# Voice spesifik
python download_piper_voices.py id_ID-news_tts-medium en_US-lessac-medium

# Lihat semua voice yang tersedia
python download_piper_voices.py --list
```

Model akan tersimpan di `server/app/piper_voices/`. Setelah itu set mapping voice id ke nama model lewat env `PIPER_VOICES`:

```env
PIPER_VOICES=id_female=id_ID-news_tts-medium,en_male=en_US-ryan-medium
```

### Environment Variables

| Variable                 | Default              | Keterangan                                                                  |
| ------------------------ | -------------------- | --------------------------------------------------------------------------- |
| `OUTPUT_DIR`             | `./app/output`       | Folder file audio hasil generate                                            |
| `TTS_MAX_TEXT_LENGTH`    | `5000`               | Maks karakter per request                                                   |
| `TTS_CLEANUP_INTERVAL`   | `3600`               | Detik file disimpan sebelum auto-hapus                                      |
| `TTS_DEFAULT_ENGINE`     | `edge`               | Engine default: `edge` atau `piper`                                          |
| `PIPER_VOICES_DIR`       | `./app/piper_voices` | Folder model Piper                                                          |
| `PIPER_VOICES`           | _(empty)_            | Mapping `id=model,id2=model2` (di-merge dengan default)                     |
| `PIPER_DEFAULT_VOICE`    | `en_female`          | Voice id Piper default                                                      |
| `API_KEY`                | _(empty)_            | API key tunggal — jika diisi, auth aktif                                    |
| `API_KEYS`               | _(empty)_            | Multi key dipisah koma (mengganti `API_KEY` jika diisi)                     |
| `API_KEY_HEADER`         | `X-API-Key`          | Nama header HTTP untuk API key                                              |
| `RATE_LIMIT_DEFAULT`     | `60/minute`          | Limit default semua route                                                   |
| `RATE_LIMIT_TTS`         | `30/minute`          | Limit `POST /api/tts/`                                                      |
| `RATE_LIMIT_TTS_BATCH`   | `5/minute`           | Limit `POST /api/tts/batch`                                                 |
| `RATE_LIMIT_AUDIO`       | `120/minute`         | Limit `GET /api/tts/audio/{id}`                                             |
| `RATE_LIMIT_STATS`       | `30/minute`          | Limit `GET /api/tts/stats`                                                  |
| `RATE_LIMIT_STORAGE_URI` | `memory://`          | Storage slowapi; pakai `redis://host:6379` untuk deploy multi-replica       |

### Voice IDs yang Tersedia

| Voice ID    | Engine | Language   | Gender  | Catatan                            |
| ----------- | ------ | ---------- | ------- | ---------------------------------- |
| `female`    | edge   | Indonesian | Female  | `id-ID-GadisNeural` — paling natural untuk antrian |
| `male`      | edge   | Indonesian | Male    | `id-ID-ArdiNeural`                 |
| `female_us` | edge   | English    | Female  | `en-US-AriaNeural`                 |
| `male_us`   | edge   | English    | Male    | `en-US-GuyNeural`                  |
| `id_female` | piper  | Indonesian | -       | Butuh download model `id_ID-*`     |
| `en_female` | piper  | English    | -       | `en_US-lessac-medium`              |
| `en_male`   | piper  | English    | -       | `en_US-ryan-medium`                |

### Catatan Penggunaan

- **Folder output** (`server/app/output/`) dibuat otomatis saat modul di-import. File audio lama dibersihkan otomatis sebagai background task tiap kali ada request baru (default umur file: 1 jam).
- **Mode dev tanpa auth**: cukup jangan set `API_KEY` / `API_KEYS`. Cocok untuk pengembangan lokal, tapi **wajib diaktifkan di production** — generate key kuat dengan `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
- **Multi-worker / multi-replica**: rate limiter default pakai in-memory (per-process). Untuk deploy multi-worker uvicorn atau multi-replica Docker, set `RATE_LIMIT_STORAGE_URI=redis://host:6379` supaya quota di-share.
- **Edge TTS butuh internet** ke server Microsoft. Kalau koneksi tidak stabil atau jaringan tertutup, switch ke Piper (`engine: "piper"`) supaya pemanggilan antrian tetap jalan.
- **Pemanggilan ulang**: cache audio di sisi client (browser) jika teks identik sering dipanggil — server hanya generate file baru per request.
- **Voice Indonesian untuk Piper** terbatas di repo `rhasspy/piper-voices`. Cek voice yang tersedia dengan `python download_piper_voices.py --list` dan filter manual yang prefix `id_ID-*`.

---

## Cara Menjalankan

### Menggunakan Docker Compose (Direkomendasikan)

1. Pastikan docker engine sudah aktif.
2. Setup file `.env` di root/server (menggunakan credential MySQL dan port yang sesuai).
3. Jalankan command:
   ```bash
   docker-compose up --build -d
   ```

### Menjalankan Manual di Lokal (Dev)

#### 1. Jalankan Backend (FastAPI)
1. Buka folder `server/` dan pastikan dependensi sudah terinstal:
   ```bash
   pip install -r requirements.txt
   ```
2. Pastikan database MySQL server Anda aktif dan buat database bernama `antrian_db`.
3. Atur environment variables Anda atau buat berkas `.env` di dalam folder `server/`:
   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASS=toor
   DB_NAME=antrian_db
   ```
4. (Opsional) Tambahkan konfigurasi TTS di `.env` — semua opsional, default sudah aman untuk dev:
   ```env
   # TTS engine default
   TTS_DEFAULT_ENGINE=edge

   # Aktifkan auth di production
   # API_KEY=ganti-dengan-key-rahasia

   # Folder output audio (default: ./app/output)
   # OUTPUT_DIR=./app/output
   ```
5. Jalankan FastAPI server:
   ```bash
   python app.py
   ```
   Server backend akan berjalan di: `http://localhost:8000`. Dokumentasi interaktif di `http://localhost:8000/docs`.

#### 2. Jalankan Frontend (React)
1. Buka folder `client/` di terminal baru.
2. Instal dependensi node:
   ```bash
   npm install
   ```
3. Jalankan Vite dev server:
   ```bash
   npm run dev
   ```
   Frontend akan berjalan di: `http://localhost:3000`

---

## Pengembangan / Roadmap Status

- [x] Inisialisasi Project (Setup FastAPI & React template)
- [x] Driver & Database Integration (MySQL via PyMySQL & Cryptography)
- [x] Implementasi Modul `layanan` (FastAPI Router + Pydantic validation + PyMySQL)
- [x] Implementasi Modul `loket` (FastAPI Router + Pivot Users Sync + PyMySQL)
- [x] Implementasi Modul `users` (FastAPI Router + Bcrypt Hash + Groups Sync)
- [x] Implementasi Modul `groups` (FastAPI Router + Admin Protections)
- [x] Implementasi Modul `antrian` (FastAPI Router + Daily Reset + Socket.IO)
- [ ] Integrasi Realtime WebSocket (Socket.IO)
- [x] Integrasi Audio Voice Generator (`edge-tts` + `piper-tts` via modul `tts`)