# Nekobuxx Cashback Bot

Bot Discord + API untuk cashback item Roblox: verifikasi username, pencatatan pembelian dalam kartu gambar, saldo gabungan, syarat komunitas 14 hari, dan ticket payout manual.

## Cara kerja

1. User menekan **Hubungkan Akun**, memasukkan username Roblox, lalu mengonfirmasi avatar dan Roblox User ID.
2. Bot memberi role Verified. Satu Discord hanya boleh terhubung ke satu Roblox ID, dan sebaliknya.
3. ServerScript Roblox melaporkan pembelian ke API bot. Transaksi disimpan berdasarkan Roblox User ID, jadi pembelian sebelum user terhubung ke Discord tetap dapat ditemukan.
4. Cashback dihitung dengan `floor(harga × 20%)`. Item di bawah 30 Robux ditolak.
5. Saldo menjadi available setelah masa dana tertahan dan syarat komunitas terpenuhi.
6. User membuat ticket, mengirim screenshot, admin memvalidasi, membayar manual, lalu menandai claim sebagai dibayar.

> Payout selalu ditujukan ke Roblox User ID yang tersimpan, bukan ke username Discord. Verifikasi username ini tidak membuktikan kepemilikan akun Roblox; desain ini mencegah pengalihan payout, tetapi orang masih bisa “mengunci” username orang lain lebih dulu. Admin dapat memperbaikinya dengan `/admin-unlink`. Verifikasi kode di profil/game dapat ditambahkan nanti jika dibutuhkan.

## Yang dibutuhkan

- Node.js 24.17 atau lebih baru
- PostgreSQL
- Bot Discord
- Hosting dengan URL HTTPS publik (contoh: Railway)

## 1. Buat aplikasi Discord

1. Buka Discord Developer Portal, buat **Application**, lalu buat **Bot**.
2. Salin bot token dan Application ID.
3. Di OAuth2 URL Generator pilih scope `bot` dan `applications.commands`.
4. Berikan permission: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Roles, dan Manage Channels.
5. Undang bot ke server. Letakkan role bot **di atas role Verified**.

Bot hanya memakai intent `Guilds`; privileged intent tidak diperlukan.

## 2. Siapkan server Discord

Buat:

- role **Verified**;
- role **Admin Cashback**;
- channel log pembelian;
- category ticket;
- opsional: channel log payout.

Atur channel awal agar `@everyone` hanya dapat melihat channel verifikasi. Channel lain menolak `@everyone` dan mengizinkan role Verified. Setelah bot aktif, jalankan `/panel jenis:Verifikasi Roblox` di channel verifikasi dan `/panel jenis:Saldo & claim` di channel cashback.

## 3. Konfigurasi

Salin `.env.example` menjadi `.env`, lalu isi semua ID. Aktifkan Developer Mode Discord untuk menyalin ID role/channel/server.

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
GUILD_ID=...
VERIFIED_ROLE_ID=...
ADMIN_ROLE_ID=...
PURCHASE_LOG_CHANNEL_ID=...
TICKET_CATEGORY_ID=...
PAYOUT_LOG_CHANNEL_ID=...

ROBLOX_GROUP_ID=90169160
MIN_ITEM_PRICE=30
CASHBACK_PERCENT=20
COMMUNITY_WAIT_DAYS=14
FUNDS_HOLD_DAYS=30
MEMBERSHIP_CHECK_MINUTES=60

API_SECRET=buat-rangkaian-acak-yang-panjang
PORT=3000
DATABASE_URL=postgresql://...
DATABASE_SSL=false
```

`FUNDS_HOLD_DAYS` dibuat terpisah dari syarat komunitas agar dapat disesuaikan dengan waktu dana Roblox tersedia. Ubah ke `0` bila tidak ingin masa tunggu dana.

## 4. Instal dan jalankan

```bash
npm install
npm run check
npm run build
npm start
```

Database dan tabel dibuat otomatis saat bot mulai. Endpoint pengecekan: `GET /health`.

## 5. Hubungkan Roblox

1. Di Roblox Studio, aktifkan **Game Settings → Security → Allow HTTP Requests**.
2. Salin `roblox/NekobuxxPurchaseReporter.server.lua` ke `ServerScriptService`.
3. Ganti `API_URL` dengan domain bot dan `API_SECRET` dengan nilai yang sama seperti `.env`.
4. Publish experience.

Script mendengarkan `MarketplaceService.PromptPurchaseFinished`, mengambil info item, mengecek kepemilikan, lalu mengirim laporan dari server Roblox. Event ini adalah sinyal pembelian di dalam sesi, bukan bukti settlement keuangan final; karena itu screenshot dan pemeriksaan admin tetap dipakai saat payout.

## Perintah

| Perintah | Akses | Fungsi |
|---|---|---|
| `/saldo` | User | Melihat pending, available, locked, paid, dan status komunitas |
| `/panel` | Admin | Mengirim panel verifikasi atau cashback |
| `/admin-unlink` | Admin | Melepas hubungan akun dan role Verified |
| `/admin-add-purchase` | Admin | Memasukkan transaksi yang gagal tercatat |
| `/admin-community-age` | Admin | Mengoreksi usia komunitas setelah pemeriksaan manual |

## Catatan aturan 14 hari

API grup Roblox menunjukkan apakah user sedang menjadi anggota, tetapi tidak memberikan tanggal awal join. Karena itu bot mulai menghitung sejak pertama kali keanggotaan terdeteksi. Jika user terdeteksi keluar, tanggal dihapus dan transaksi available kembali pending; ketika bergabung lagi, hitungan dimulai dari nol.

Pemeriksaan berjalan sesuai `MEMBERSHIP_CHECK_MINUTES`. Keluar dan masuk kembali sepenuhnya di antara dua pemeriksaan tidak dapat dideteksi oleh API polling. Untuk member lama, admin dapat memeriksa secara manual lalu memakai `/admin-community-age username:... hari:...`.

## Deploy Railway

1. Buat project dan service PostgreSQL.
2. Deploy folder ini sebagai service (Dockerfile sudah tersedia).
3. Masukkan seluruh environment variable dan gunakan `DATABASE_URL` dari PostgreSQL Railway.
4. Set `DATABASE_SSL=true` bila koneksi database memerlukannya.
5. Setelah deploy, buka `/health`, pasang domain tersebut di ServerScript Roblox, lalu kirim kedua panel dengan `/panel`.

## Keamanan dan operasi

- Jangan commit `.env`, token Discord, atau API secret.
- Jangan taruh secret di LocalScript; hanya di ServerScript.
- Simpan screenshot dan channel ticket sebagai jejak audit.
- Gunakan tombol **Bukti Valid** sebelum **Sudah Dibayar**. Penolakan mengembalikan saldo yang terkunci.
- Ticket tidak dihapus otomatis; tombol **Tutup Ticket** mengunci user dan mempertahankan riwayat.
- Backup PostgreSQL secara berkala.
