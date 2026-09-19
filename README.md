# Nekobuxx Cashback Bot

Bot Discord + API untuk cashback item Roblox: verifikasi username, pencatatan pembelian dalam kartu gambar, saldo gabungan, syarat Community yang dapat diatur, dan antrean payout manual.

## Cara kerja

1. User menekan **Hubungkan Akun**, memasukkan username Roblox, lalu mengonfirmasi avatar dan Roblox User ID.
2. Bot memberi role Verified. Satu Discord hanya boleh terhubung ke satu Roblox ID, dan sebaliknya.
3. ServerScript Roblox melaporkan pembelian ke API bot. Transaksi disimpan berdasarkan Roblox User ID, jadi pembelian sebelum user terhubung ke Discord tetap dapat ditemukan.
4. Cashback dihitung dengan `floor(harga × 20%)`. Item di bawah 30 Robux ditolak.
5. User membuat ticket melalui bot ticket eksternal dan mengirim bukti pembelian.
6. Admin menjalankan `/acc-claim user:@User`. Seluruh saldo yang belum diklaim dikunci.
7. Setelah masa Community terpenuhi, bot mengirim klaim ke channel `list-pencairan`.
8. Admin membayar ke username Roblox lalu menjalankan `/claim-dibayar id:...`.
9. Jika user keluar sebelum dibayar, klaim dibatalkan, saldo dikembalikan, dan laporan dikirim ke `gagal-claim`.

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
- channel `list-pencairan`;
- channel `gagal-claim`;
- opsional: channel log payout.

Atur channel awal agar `@everyone` hanya dapat melihat channel verifikasi. Channel lain menolak `@everyone` dan mengizinkan role Verified. Setelah bot aktif, jalankan `/panel jenis:Verifikasi Roblox` di channel verifikasi. Ticket claim dibuat menggunakan bot ticket eksternal.

## 3. Konfigurasi

Salin `.env.example` menjadi `.env`, lalu isi semua ID. Aktifkan Developer Mode Discord untuk menyalin ID role/channel/server.

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
GUILD_ID=...
VERIFIED_ROLE_ID=...
ADMIN_ROLE_ID=...
PURCHASE_LOG_CHANNEL_ID=...
COMMUNITY_CHANNEL_ID=...
CLAIM_CHANNEL_ID=1550138645619671091
TICKET_CATEGORY_ID=...
PAYOUT_LOG_CHANNEL_ID=...
PAYOUT_QUEUE_CHANNEL_ID=1550788584758448248
FAILED_CLAIM_CHANNEL_ID=1550796997148287098

ROBLOX_GROUP_ID=90169160
MIN_ITEM_PRICE=30
CASHBACK_PERCENT=20
COMMUNITY_WAIT_DAYS=7
MEMBERSHIP_CHECK_MINUTES=60

API_SECRET=buat-rangkaian-acak-yang-panjang
PORT=3000
DATABASE_URL=postgresql://...
DATABASE_SSL=false
```

`COMMUNITY_CHANNEL_ID` adalah channel berisi link map dan Community Roblox. `CLAIM_CHANNEL_ID` adalah text channel berisi panel ticket claim cashback. Setelah verifikasi, tujuan tombol ditentukan otomatis dari status Community user.

`PAYOUT_QUEUE_CHANNEL_ID` adalah channel `list-pencairan`. `FAILED_CLAIM_CHANNEL_ID` adalah channel `gagal-claim`.

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
2. Salin `roblox/NekobuxxShop.client.lua` ke `StarterPlayer > StarterPlayerScripts` sebagai **LocalScript**.
3. Salin `roblox/NekobuxxPurchaseReporter.server.lua` ke `ServerScriptService` sebagai **Script**.
4. Di ServerScript, ganti `API_URL` dengan domain bot dan `API_SECRET` dengan nilai yang sama seperti Railway.
5. Publish experience.

ServerScript mendengarkan pembelian asset maupun bundle, mengambil detail item, lalu mengirim laporan dari server Roblox dengan retry dan event ID yang tetap. Event pembelian ini adalah sinyal pembelian di dalam sesi, bukan bukti settlement keuangan final; karena itu screenshot dan pemeriksaan admin tetap dipakai saat payout.

Jangan memasukkan `API_SECRET` ke `NekobuxxShop.client.lua`. LocalScript dapat diakses oleh client; secret hanya boleh berada di ServerScript.

## Perintah

| Perintah | Akses | Fungsi |
|---|---|---|
| `/saldo` | User | Melihat pending, available, locked, paid, dan status komunitas |
| `/panel` | Admin | Mengirim panel verifikasi |
| `/acc-claim user:@User` | Admin | Mengunci seluruh saldo belum diklaim dan memasukkannya ke antrean |
| `/claim-dibayar id:...` | Admin | Menandai pencairan manual sebagai selesai |
| `/batal-claim id:... alasan:...` | Admin | Membatalkan klaim dan mengembalikan saldo |
| `/admin-unlink` | Admin | Melepas hubungan akun dan role Verified |
| `/admin-add-purchase` | Admin | Memasukkan transaksi yang gagal tercatat |
| `/test-purchase-card` | Admin | Mengirim preview card ke channel log tanpa menambah transaksi atau saldo |
| `/admin-community-age` | Admin | Mengoreksi usia komunitas setelah pemeriksaan manual |
| `/admin-community-check` | Admin | Memeriksa status terbaru langsung dari API Roblox |

## Catatan masa tunggu komunitas

API grup Roblox menunjukkan apakah user sedang menjadi anggota, tetapi tidak memberikan tanggal awal join. Karena itu bot mulai menghitung sejak pertama kali keanggotaan terdeteksi. Durasi diatur lewat `COMMUNITY_WAIT_DAYS`, sehingga dapat diubah tanpa mengedit kode. Jika user terdeteksi keluar, tanggal dihapus dan transaksi available kembali pending; ketika bergabung lagi, hitungan dimulai dari nol.

Pemeriksaan berjalan sesuai `MEMBERSHIP_CHECK_MINUTES`. Keluar dan masuk kembali sepenuhnya di antara dua pemeriksaan tidak dapat dideteksi oleh API polling. Untuk member lama, admin dapat memeriksa secara manual lalu memakai `/admin-community-age username:... hari:...`.

## Deploy Railway

1. Buat project dan service PostgreSQL.
2. Deploy folder ini sebagai service (Dockerfile sudah tersedia).
3. Masukkan seluruh environment variable dan gunakan `DATABASE_URL` dari PostgreSQL Railway.
4. Set `DATABASE_SSL=true` bila koneksi database memerlukannya.
5. Setelah deploy, buka `/health`, pasang domain tersebut di ServerScript Roblox, lalu kirim panel verifikasi dengan `/panel`.

## Keamanan dan operasi

- Jangan commit `.env`, token Discord, atau API secret.
- Jangan taruh secret di LocalScript; hanya di ServerScript.
- Simpan screenshot dan channel ticket eksternal sebagai jejak audit.
- Jalankan `/acc-claim` dari channel ticket agar tautan sumber pemeriksaan tercatat.
- Jangan menjalankan `/claim-dibayar` sebelum Robux benar-benar dikirim ke username dan Roblox User ID yang tertera.
- Backup PostgreSQL secara berkala.

## Antrean pengiriman pembelian

Pembelian disimpan secara persisten oleh script Roblox sebelum dikirim ke API. Jika bot atau jaringan sedang bermasalah, script akan mencoba kembali tanpa menghilangkan transaksi. `eventId` mencegah transaksi yang sama tercatat dua kali.

Setelah transaksi masuk PostgreSQL, pengiriman card Discord juga memakai antrean. Bot mencoba kembali saat startup dan setiap `PURCHASE_CARD_RETRY_SECONDS`, maksimal `PURCHASE_CARD_RETRY_BATCH_SIZE` transaksi per putaran.