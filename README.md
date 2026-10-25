# AM Generator Web

Web publik satu halaman untuk memindahkan alur command bot WhatsApp `ammagiclink`, `amverify`, dan `ampremium` ke antarmuka web. User cukup membuka URL, memasukkan email, menempel magic link dari inbox, lalu sistem memverifikasi dan menjalankan purchase premium secara otomatis.

Dibangun dengan **Express.js + EJS + JavaScript vanilla**, **tanpa database**, dan siap deploy ke **Vercel**. Backend bertindak sebagai proxy server-side ke `https://api.betabotz.eu.org/api/tools`; `aksesKey` dan token tidak pernah dikirim ke browser.

> Proyek ini bukan afiliasi resmi Alight Creative. Gunakan hanya untuk akun milik sendiri.

## Fitur

- Alur tiga langkah: **Magic Link → Verifikasi + Purchase → Hasil / Retry**.
- State per user disimpan di **cookie sesi terenkripsi AES-256-GCM** (httpOnly, secure, SameSite Strict, 30 menit). Tidak memakai Map in-memory untuk state, sehingga tetap utuh antar instance serverless.
- Token verifikasi tidak pernah terlihat di browser, dihapus setelah purchase sukses atau saat Mulai Ulang.
- Purchase otomatis setelah verify, plus tombol **Retry Purchase** memakai token yang masih tersimpan.
- Cooldown 60 detik untuk kirim ulang magic link dengan countdown di tombol.
- Tombol salin untuk email dan order ID.
- Cloudflare Turnstile (server-side verification) + honeypot `hp`.
- Blokir email disposable.
- Rate limit per IP, per email, dan per sesi dengan auto-block 1 jam.
- Pengecekan Origin/Referer, filter User-Agent bot, nonce HMAC 2 menit, batas body 4 KB, timeout upstream 60 detik.
- Helmet + CSP ketat, `X-Frame-Options: DENY`, `nosniff`, HSTS, Permissions-Policy.
- Tema neobrutalism hijau-putih, mobile-first, aksesibel, menghormati `prefers-reduced-motion`.
- Halaman tutorial, syarat & privasi, 404, maintenance mode, dan health check.
- Anti-inspect sebagai penghalang tambahan (bukan jaminan keamanan).

## Prasyarat

- **Node.js 18+** dan npm.
- Akun **Vercel** untuk deploy.
- Akun **Cloudflare** (gratis) untuk Turnstile.
- `aksesKey` Betabotz yang valid.

## 1. Setup Cloudflare Turnstile

1. Buka <https://dash.cloudflare.com/> lalu masuk ke **Turnstile**.
2. Klik **Add widget**, isi nama (mis. `AM Generator`).
3. Tambahkan hostname:
   - `localhost` (untuk development).
   - domain produksi, mis. `am.domainkamu.com`.
   - domain preview Vercel bila ingin menguji preview.
4. Pilih widget mode **Managed** (atau **Non-interactive**).
5. Salin **Site Key** dan **Secret Key**.
6. Isi ke environment:
   - `TURNSTILE_SITE_KEY` = Site Key.
   - `TURNSTILE_SECRET` = Secret Key.

Untuk development tanpa captcha, kosongkan kedua nilai tersebut atau set `TURNSTILE_DISABLED=true`.

## 2. Konfigurasi environment

Salin `.env.example` menjadi `.env.local`:

```bash
cp .env.example .env.local
```

Isi nilai berikut:

```env
PORT=3000
NODE_ENV=development

BETABOTZ_API_URL=https://api.betabotz.eu.org/api/tools
BETABOTZ_AKSES_KEY=akses_key_kamu

SESSION_SECRET=32_byte_hex
IP_SALT=32_byte_hex

TURNSTILE_SITE_KEY=
TURNSTILE_SECRET=
TURNSTILE_DISABLED=false

SITE_URL=http://localhost:3000
ALLOWED_ORIGINS=

MAINTENANCE=false
```

Buat `SESSION_SECRET` dan `IP_SALT` dengan:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Jalankan dua kali untuk mendapatkan dua nilai berbeda.

Keterangan variabel:

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `PORT` | Tidak | Port lokal, default `3000`. |
| `BETABOTZ_API_URL` | Tidak | Base URL upstream, default sudah diisi. |
| `BETABOTZ_AKSES_KEY` | Ya | Kunci upstream, hanya dibaca di server. |
| `SESSION_SECRET` | Ya | Minimal 32 karakter, dipakai untuk AES-256-GCM dan HMAC nonce. |
| `IP_SALT` | Ya | Salt hash IP, agar IP tidak disimpan plaintext. |
| `TURNSTILE_SITE_KEY` | Production | Site key Turnstile. |
| `TURNSTILE_SECRET` | Production | Secret key Turnstile, hanya di server. |
| `TURNSTILE_DISABLED` | Tidak | `true` untuk mematikan captcha (khusus development). |
| `SITE_URL` | Ya | URL publik tanpa trailing slash, dipakai untuk cek Origin. |
| `ALLOWED_ORIGINS` | Tidak | Origin tambahan, dipisah koma (preview Vercel, domain lain). |
| `MAINTENANCE` | Tidak | `true` untuk menutup layanan (health check tetap aktif). |
| `TRUST_PROXY` | Tidak | `true` bila ingin membaca `x-forwarded-for` di luar Vercel. |
| `COOKIE_SECURE` | Tidak | `true` untuk memaksa cookie `Secure` saat development via HTTPS. |

> `.env.local` dan `.env` sudah masuk `.gitignore`. Jangan commit nilai asli.

## 3. Menjalankan lokal

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>.

Perintah lain:

```bash
npm start            # menjalankan server tanpa nodemon
npm run build:client # minify public/js/*.js -> *.min.js (tanpa source map)
```

Catatan development:

- Jika Turnstile dimatikan, kotak captcha tidak ditampilkan.
- Rate limit memakai memori proses. Restart server untuk mereset rate limit saat pengujian.
- Server membaca `.env.local` lebih dulu, lalu `.env`.

## 4. Deploy ke Vercel

1. Push project ke GitHub/GitLab/Bitbucket.
2. Buka <https://vercel.com/new>, import repository.
3. Framework preset: **Other**. Build command dibiarkan (Vercel memakai `vercel-build` untuk minify client). Output directory kosong.
4. Tambahkan **Environment Variables** untuk Production (dan Preview bila perlu):
   - `BETABOTZ_AKSES_KEY`
   - `SESSION_SECRET`
   - `IP_SALT`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET`
   - `SITE_URL` (mis. `https://am.domainkamu.com`)
   - `ALLOWED_ORIGINS` (opsional, isi domain preview)
   - `BETABOTZ_API_URL` (opsional)
   - `MAINTENANCE=false`
5. Klik **Deploy**.
6. Setelah selesai, buka **Settings → Domains**, tambahkan domain custom dan ikuti instruksi DNS.
7. Perbarui `SITE_URL` ke domain final, lalu redeploy.
8. Buka domain tersebut, cek `/api/health`, lalu uji alur Step 1–3.

Konfigurasi Vercel ada di `vercel.json`:

- Semua request di-rewrite ke `api/index.js` (Express).
- Region `sin1` (Singapore).
- `maxDuration: 60` pada function. Sesuaikan dengan plan Vercel kamu (Hobby/Pro) bila batasnya berbeda.
- File statis di `public/` dilayani oleh `express.static` di dalam function.

Catatan:

- `vercel.json` mengarahkan seluruh trafik ke function. Aset statis tetap disajikan Express, sehingga tidak ada konfigurasi static terpisah.
- Jika ingin aset statis dilayani langsung oleh CDN Vercel, hapus rewrite untuk `/css`, `/js`, `/fonts`, dan file statis lain, lalu sesuaikan `vercel.json`.
- Turnstile harus mengizinkan domain produksi dan domain preview yang dipakai.

## 5. Pengaturan Vercel Firewall (WAF)

Rate limit di memori hanya lapisan tambahan karena Vercel serverless tidak membagi memori antar instance. Penegakan utama ada di edge.

1. Buka project di Vercel → **Firewall**.
2. Aktifkan **Vercel Firewall** untuk project.
3. Buat rule **Rate Limit**:
   - Name: `api-rate-limit`
   - Path: `/api/*`
   - Method: semua
   - Rate: **30 request per 1 menit per IP** (sesuaikan dengan trafik wajar)
   - Action: **Challenge** atau **Deny** (429)
4. Buat rule tambahan untuk endpoint sensitif bila perlu:
   - Path `/api/am/magic-link` → 10 request per 10 menit per IP.
   - Path `/api/am/verify` → 10 request per 10 menit per IP.
5. Aktifkan **Attack Challenge Mode** saat terjadi serangan. Mode ini memberi challenge ke pengunjung sebelum request mencapai function.
6. Opsional: taruh domain di belakang **Cloudflare** dengan proxy aktif, lalu aktifkan **Under Attack Mode** bila perlu.

Rekomendasi urutan pertahanan:

1. Vercel/Cloudflare edge (DDoS, rate limit, challenge).
2. Aplikasi: cek Origin, filter UA, nonce HMAC, rate limit memori, auto-block.
3. Validasi payload murah sebelum memanggil upstream.
4. Timeout upstream 60 detik agar function tidak menggantung.

## 6. Tutorial pemakaian untuk user akhir

1. **Buka halaman utama.** Tidak perlu daftar atau login.
2. **Step 1 - Kirim magic link.**
   - Masukkan email aktif.
   - Selesaikan captcha bila muncul.
   - Tekan **Kirim Magic Link**.
   - Buka inbox email tersebut. Cek juga folder **Spam**, **Promosi**, dan tab **Semua Email**.
3. **Step 2 - Verifikasi.**
   - Buka email dari Alight Motion.
   - Salin **seluruh link** (bukan sebagian). Link harus mengandung `oobCode`.
   - Tempel ke kolom **Link dari email**, selesaikan captcha, lalu tekan **Verifikasi & Aktifkan Premium**.
   - Jangan membuka link yang sama di browser lain; link bersifat sekali pakai.
4. **Step 3 - Hasil.**
   - Jika berhasil, kartu hasil menampilkan email, status, license, expired, product, dan order.
   - Gunakan tombol **Salin** untuk menyalin email atau order ID.
   - Buka aplikasi Alight Motion, login dengan email tersebut, lalu cek profil premium.
   - Jika purchase gagal tetapi verifikasi berhasil, tekan **Retry Purchase**.
5. **Mulai Ulang** menghapus sesi dan kembali ke Step 1.

Sesi berlaku 30 menit. Setelah itu ulangi dari Step 1.

## 7. Troubleshooting

| Masalah | Penyebab umum | Solusi |
| --- | --- | --- |
| Magic link tidak masuk | Delay email, masuk spam, atau email salah | Tunggu 1–2 menit, cek spam/promosi, pastikan email benar, lalu kirim ulang setelah cooldown 60 detik. |
| Link tidak valid | Link terpotong, bukan `https://`, host tidak dikenal, atau tanpa `oobCode` | Salin ulang seluruh link dari email. Jangan menambahkan spasi. Pastikan domain `alightcreative.com` atau `firebaseapp.com`. |
| Link kedaluwarsa | Magic link sudah terlalu lama atau sudah dipakai | Kembali ke Step 1, kirim magic link baru, lalu verifikasi link terbaru. |
| Rate limit 429 | Terlalu banyak percobaan per IP/email/sesi | Tunggu sesuai `Retry-After` atau countdown di UI. Jangan menekan tombol berulang. |
| Akses diblokir sementara | Tiga pelanggaran rate limit/honeypot dari IP yang sama | Tunggu 1 jam atau gunakan jaringan lain. |
| Captcha gagal | Token kedaluwarsa atau domain belum terdaftar di Turnstile | Muat ulang halaman, selesaikan captcha lagi, pastikan hostname terdaftar. |
| Purchase gagal | Upstream error/timeout | Tekan **Retry Purchase** selama token masih tersedia. Jika tidak, ulangi dari Step 1. |
| Sesi hilang | Cookie diblokir, mode incognito ketat, atau lewat 30 menit | Izinkan cookie untuk domain ini, jangan pakai mode yang memblokir cookie, lalu mulai ulang. |
| `BETABOTZ_AKSES_KEY` error | Env belum diisi di Vercel | Isi environment variable lalu redeploy. |
| `Origin tidak valid` | `SITE_URL`/`ALLOWED_ORIGINS` salah atau domain preview | Perbarui env ke origin yang benar (tanpa trailing slash), lalu redeploy. |
| Maintenance 503 | `MAINTENANCE=true` | Set `MAINTENANCE=false` lalu redeploy. |

## 8. Catatan keamanan

- **Token dan aksesKey tidak pernah ada di browser.** Semua panggilan upstream dilakukan di server. API hanya mengembalikan `{ ok, message, data }` tanpa token.
- **Cookie sesi terenkripsi AES-256-GCM** dengan kunci dari `SESSION_SECRET`. Cookie `httpOnly`, `secure` di production, `SameSite=Strict`, umur 30 menit. Token dihapus setelah purchase sukses atau Mulai Ulang.
- **Nonce HMAC** dibuat dari `timestamp + hashIP` dan berlaku 2 menit. Tidak ada penyimpanan nonce; verifikasi dilakukan ulang di server.
- **Rate limit memori** bersifat best-effort dan tidak dibagi antar instance Vercel. Gunakan Vercel WAF sebagai penegakan utama.
- **IP tidak disimpan plaintext** di aplikasi. Log hanya memuat hash IP dan email ter-mask.
- **Tidak ada log aktivasi permanen.** Log ditulis ke stdout dan tidak memuat token, aksesKey, atau URL verifikasi utuh.
- **Pesan error seragam** untuk mengurangi enumerasi email.
- **Anti-inspect hanya penghalang untuk user awam.** Inspect tidak bisa dicegah sepenuhnya; siapa pun bisa menonaktifkan JavaScript atau memakai browser lain. Keamanan nyata bergantung pada semua logika dan rahasia berada di server.
- **Anti-inspect** menonaktifkan klik kanan dan seleksi teks di area non-input, memblokir shortcut devtools, serta menampilkan overlay saat devtools terdeteksi. Input teks tetap bisa dipakai.
- **Source map tidak disajikan.** JS client diminify dengan terser saat build (`npm run build:client`), dan `console.*` dihapus. File `.min.js` tidak di-commit.
- **Batas body 4 KB** dan validasi ukuran/format sebelum memanggil upstream.
- **CSP ketat** hanya mengizinkan `self` dan `challenges.cloudflare.com`.
- **Turnstile diverifikasi server-side.** Jangan pernah mematikan captcha di production.
- Jika `aksesKey` bocor, segera rotasi di sisi Betabotz dan ganti environment variable.

## 9. Struktur project

```text
am-generator/
  api/index.js            # entry Vercel, mengekspor app Express
  app.js                  # setup Express, EJS, middleware, routes
  server.js               # app.listen untuk lokal
  routes/
    am.js                 # session, magic-link, verify, premium, reset
    health.js             # health check
  middleware/
    security.js           # helmet, origin check, filter UA, noindex API
    guard.js              # nonce HMAC, rate limit memori, blocklist
  lib/
    session.js            # cookie sesi terenkripsi AES-256-GCM
    crypto.js             # enkripsi, HMAC nonce, hash IP
    rateLimit.js          # fixed window, cooldown, blocklist
    turnstile.js          # verifikasi captcha server-side
    betabotz.js           # callAPI + format hasil
    validate.js           # validasi email dan rawUrl
    disposable.js         # daftar domain email sementara
    errors.js             # getErrorMessage, masking, response helper
  views/
    index.ejs, tutorial.ejs, privacy.ejs, 404.ejs
    partials/
      head.ejs, header.ejs, step-tabs.ejs, step-magic-link.ejs,
      step-verify.ejs, step-result.ejs, faq.ejs, footer.ejs
  public/
    css/style.css
    js/app.js, js/anti-inspect.js
    fonts/
    favicon.svg, robots.txt
  vercel.json, package.json, .env.example, README.md, LICENSE
```

Endpoint API:

| Method | Path | Fungsi |
| --- | --- | --- |
| POST | `/api/am/session` | Buat/ambil sesi, kembalikan step, email ter-mask, nonce. |
| POST | `/api/am/magic-link` | Validasi email, panggil upstream `am-magicLink`, simpan email. |
| POST | `/api/am/verify` | Validasi link, panggil `am-verifyMagicLink`, simpan token, lanjut `am-purchasePremium`. |
| POST | `/api/am/premium` | Retry purchase memakai token tersimpan. |
| POST | `/api/am/reset` | Hapus sesi. |
| GET | `/api/health` | Health check (tanpa database). |

Semua response berbentuk `{ ok, message, data? }`.

## 10. Lisensi

[MIT](LICENSE) © 2026 Betabotz Studio.
