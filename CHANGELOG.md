# Perubahan

Semua perubahan yang berarti pada Rupa3D, terbaru di atas.

Formatnya mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/);
versinya mengikuti [SemVer](https://semver.org/lang/id/).

**Satu bagian yang tidak ada di changelog kebanyakan: `Terbongkar`.** Repo ini
mencatat cacat yang ditemukan, termasuk — terutama — cacat pada **alat ukurnya
sendiri**, berikut angka yang membongkarnya. Sepuluh dari sebelas kegagalan
terbesar di proyek ini ada di pemeriksanya, bukan di kernel yang diperiksa.
Menyembunyikannya akan membuat changelog ini terbaca lebih rapi dan jauh
kurang berguna.

> **Catatan versi.** Rupa3D tidak berversi sampai 10 September 2026;
> `package.json` membawa `1.0.0` sejak commit pertama sebagai nilai bawaan
> perancah, bukan sebagai rilis. Nomor di bawah dipasangkan ke riwayat commit
> yang sungguh ada. Segala yang bertanggal sebelum 10 Sep direkam surut dari
> pesan commit-nya, bukan ditulis ulang.

---

## [1.6.2] — 2026-09-15

**Perbaikan fisika, dan kode sumbernya kini terbuka** di
[`tiranyx/rupa3d-core`](https://github.com/tiranyx/rupa3d-core).

### Ditambahkan
- `repository`, `homepage`, dan `bugs` di `package.json`, serta `repository` di
  `server.json` — halaman npm dan registri MCP kini menunjuk ke kode sumbernya.
- `README.md` dalam bahasa Inggris untuk GitHub, npm, dan registri; Indonesia
  pindah ke `README.id.md`.
- `skrip/ekspor-publik.mjs` + `skrip/publik.txt` — isi repo publik diekspor
  dari HEAD lewat daftar putih dan enam gerbang (bersih, daftar putih, rahasia,
  lokal/bisnis, tautan, impor, paket). Kedua berkas itu tetap privat.
- `contoh/ikon-garis.svg` — ikon netral untuk `contoh/svg-ke-3d.mjs`.

### Diperbaiki
- **Paket dikemas dengan akhir baris LF.** Tarball 1.6.1 dibuat dari checkout
  Windows: ke-42 berkasnya CRLF, termasuk shebang `server.mjs`. Di Mac/Linux
  itu tidak merusak `npx rupa3d` — `bin-links` milik npm memang mengubah
  shebang CRLF menjadi LF saat memasang (diperiksa di sumbernya) — tetapi
  1.6.2 dikemas dari clone repo publik ber-LF.
- **`tambahBadan({ putar })` memutar collider dengan urutan sumbu yang salah.**
  Format adegan dan runtime web memakai XYZ (derajat); `fisika.mjs` mengubahnya
  dengan rumus urutan ZYX. Untuk satu sumbu hasilnya sama, jadi tidak ada uji
  yang melihatnya; untuk dua sumbu atau lebih collider miring dari benda yang
  terlihat — `[30, 45, 0]` meleset 22,74°, benda `[90, 0, -22]` di contoh
  `fisika-tumpukan` 22,00°. Halaman adegan yang diterbitkan TIDAK kena: runtime
  mengambil rotasi fisika dari quaternion objek three.js. Uji baru membandingkan
  lewat matriks Rx·Ry·Rz (merah di kode lama); uji silang sekali pakai dengan
  three.js pada 200 rotasi acak: selisih terburuk 1,54e−7, kode lama 2,0.
- **Karakter tersendat saat berjalan di lantai datar.** `langkahKarakter`
  menambahkan gravitasi juga saat karakter menapak, sehingga tiap langkah
  mendorongnya ~5 mm ke lantai. Dorongan itu masuk ke kulit offset pengendali, dan
  sesekali seluruh gerak langkah itu, termasuk horizontal, terbuang: **7 dari 600
  langkah** tidak bergerak. Sekarang karakter yang menapak dan tidak naik tidak
  diberi gerak vertikal; turun tangga dan lereng tetap menempel lewat
  snap-to-ground. Ditemukan dan diukur lebih dulu oleh sesi Galantara
  (12 dari 600 dengan konstantanya sendiri).
- `test-kulit.mjs` tidak lagi menulis jalur absolut satu mesin; asetnya lewat
  `aset-uji.mjs`, bisa ditimpa `RUPA3D_UJI_KULIT` dan `RUPA3D_UJI_BUNNY`.
- Alasan lewat untuk `batu-batu.glb` menyebut resepnya
  (`contoh/tekstur-batu.mjs`), bukan "belum ada resep".

### Terbongkar
- 12 uji karakter lolos walau karakter tersendat, karena uji berjalan hanya
  memeriksa jarak akhir dengan toleransi 5 %. Uji baru memeriksa TIAP langkah dari
  600 (merah di kode lama: 7 langkah diam).
- Konvensi rotasi fisika bertentangan dengan konvensi adegan sejak fisika
  ditambahkan; ditemukan agen peninjau studio, dikonfirmasi dan diukur ulang
  sebelum ditambal.
- Gerbang impor versi pertama meloloskan `import './x'` tanpa `from`; ketahuan
  lewat pelanggaran buatan, bukan lewat pemakaian.
- "Belum ada resep" untuk `batu-batu.glb` ditulis tanpa mencari; resepnya sudah
  ada di `contoh/`.

---

## [1.6.1] — 2026-09-14

**Rilis pengemasan: server MCP-nya bisa dipasang orang lain.** Tidak ada tool
baru. Yang berubah adalah hal-hal yang ternyata **hanya benar di checkout
pemiliknya** — ditemukan dengan memasang tarball lewat `npx`, dari direktori
kerja asing, dengan cache npm kosong dan tanpa Blender.

> **Kenapa 1.6.1, bukan 1.7.0.** Cabang studio yang belum ditinjau
> (`cdx/rupa3d-studio-foundation`) sudah memakai 1.7.0–1.9.0 di CHANGELOG-nya.
> Rilis ini tidak menambah kemampuan, jadi nomor tambalan yang jujur — dan
> tidak bertabrakan dengan nomor yang sudah dipakai di cabang lain.

### Diperbaiki — hanya benar di mesin pemilik

- **`npm install` polos gagal di clone bersih.** `brepjs@4.18.5` meminta
  `brepjs-opencascade ^0.5.1 || ^0.6.0 || ^0.7.0`; repo memakai `^0.8.2`, yang
  hanya terpasang dengan `--legacy-peer-deps`. Turun ke **0.7.2**: 39 uji CAD
  lulus, dan `contoh/flange-cad.mjs` menghasilkan `flange.glb` **identik bita
  per bita** dengan keluaran 0.8.2 (1.137.912 bita, 44.812 segitiga).
- **Tool CAD mati begitu dipasang lewat npm.** `cad.mjs` mencari OCCT di
  `<paket>/node_modules/brepjs-opencascade`, padahal npm meletakkan
  dependensi SEJAJAR dengan paket. Kesebelas `rupa_cad_*` lewat jalan yang
  sama (`ruangCad()` → `kernel()`); terukur pada `rupa_cad_bentuk` dengan kode
  lama di tata letak npx: `Aborted(Error: ENOENT …)`. Kini letaknya
  ditanyakan ke resolver Node (`import.meta.resolve`).
- **Ruang kerja pengguna npx masuk ke dalam cache npm.** Akar
  `../../.rupa3d` relatif `server.mjs` sama dengan `~/.rupa3d` hanya karena
  repo pemiliknya ada di `~/Downloads/Rupa3D`; di bawah npx ia menjadi
  `_npx/<hash>/.rupa3d` — direktori yang boleh dibersihkan npm kapan saja.
  Kini `~/.rupa3d`, atau `RUPA3D_RUANG`. Di mesin pemilik jalurnya identik;
  tidak ada ruang kerja yang berpindah.
- **`rupa_periksa` tidak menemukan spek bawaannya dari direktori kerja lain.**
  `spek/aset-generatif.json` dicari relatif direktori kerja, dan klien MCP
  tidak menjalankan server dari repo. Terukur dengan kode lama:
  `spek tidak bisa dimuat: ENOENT`. Kini dicari di direktori kerja dulu (spek
  pengguna menang), lalu di folder paket.

### Diperbaiki — berkas jahat (ADR-004, sebagian)

Diukur pada empat pembaca (`ukurGLB`, `topologiGLB`, `titikGLB`,
`perbaikiGLB`), tiap kasus di proses terpisah, heap dibatasi 512 MB:

| kasus | sebelum | sesudah |
|---|---|---|
| node bersiklus / anak dirinya sendiri | **4/4 gantung** sampai dibunuh | ditolak 30–51 ms, siklusnya disebut |
| indeks 65535 pada mesh 3 verteks | **4/4 lolos**, `perbaikiGLB` melapor sukses | ditolak 27–34 ms |
| `count` 2³⁰ pada buffer 36 bita | ditolak, pesan milik mesin | ditolak 25–33 ms, pesan milik berkasnya |
| skin 10 juta sendi | `ukurGLB`, `perbaikiGLB`: **proses mati** | ditolak ±1,4 s |
| rantai 100.000 node yang sah | lolos | tetap lolos |

- **`hierarki.mjs`** menggantikan lima jalan-ke-induk dan empat salinan
  `matriksNode`/perkalian matriks. Urutan perkaliannya dipertahankan: matriks
  dunia **identik bit demi bit** dengan kode lama (50 hierarki acak × 9 node
  × 16 elemen, dibandingkan dengan `Object.is`).
- Ditolak dengan pesan yang menyebut cacat berkasnya: indeks ≥ jumlah verteks,
  accessor yang melampaui bufferView-nya, node berinduk dua, dan `skin.joints`
  yang tidak unik atau bukan node.
- **Belum:** batas ukuran masukan secara umum, lapis Khronos, dan isolasi
  proses (ADR-004); dua salinan `bacaAcc` di `kulit.mjs` dan `perbaiki.mjs`
  belum lewat penjaga accessor.

### Ditambahkan

- `package.json` siap terbit: `mcpName` `io.github.tiranyx/rupa3d`,
  `bin.rupa3d` → server, daftar `files` tertutup (**42 berkas, ±164 KB**;
  tanpa uji, `docs/`, `riset/`, studio), dependensi **dipasak persis** ke
  versi yang diuji — dengan `^4.18.5`, pengguna baru akan mendapat brepjs
  4.29.3 yang tidak pernah diuji di sini.
- `server.json` — metadata registri MCP, sah terhadap skema `2025-12-11`.
- `test-berkas-jahat.mjs` (8 uji), `test-hierarki.mjs` (9), dan dua uji
  pintu paket di `test-mcp.mjs` (spek relatif dari direktori asing, akar
  ruang kerja).
- `aset-uji.mjs` — jalur aset uji di satu tempat, dengan alasan lewat.
- `docs/TERBIT.md` — langkah terbit, untuk pemilik akun.
- Petunjuk server (`instructions`) kini menyebut jalur tanpa Blender.

### Terukur

```
clone bersih, sebelum    275 uji · 245 lulus · 17 GAGAL · 13 dilewati
clone bersih, sesudah    295 uji · 277 lulus ·  0 gagal · 18 dilewati (beralasan)
dengan aset lokal        295 uji · 295 lulus ·  0 gagal ·  0 dilewati
paket via npx            11/11 langkah asap — tanpa Blender, direktori asing
```

### Terbongkar

- **17 uji gagal dan 13 dilewati di clone bersih** — ketiga puluhnya bergantung
  pada empat berkas di `.rupa3d/` yang tidak pernah masuk git. Di mesin
  pemilik semuanya hijau.
- **Penjaga yang tidak pernah bisa menyala:** `{ skip: !GLB_FLANGE }` — jalur
  berupa string selalu truthy.
- **Uji yang lulus karena alasan yang salah:** "KODE 2 — spek yang tidak ada"
  lulus di clone bersih karena BERKASNYA yang hilang, dan itu juga kode 2.
- `test-kulit.mjs` membaca aset lewat jalur absolut milik checkout pemilik;
  clone lain di mesin yang sama diam-diam membaca berkas itu.
- Kekeliruan saya sendiri, dua kali di rilis ini, keduanya dibetulkan sebelum
  commit: uji asap menuntut `!isError` dari `rupa_status` yang dengan benar
  melapor Blender tidak ada; dan komentar pertama di `cad.mjs` menyebut galat
  `__dirname is not defined` yang tidak pernah terukur — galat sebenarnya
  `Aborted(ENOENT …)`.

### Terbit

- **npm** 14 Sep 2026: `rupa3d@1.6.1`, tarball identik bita per bita dengan
  commit 96eaa9a (tag `v1.6.1`).
- **Registri MCP** 15 Sep 2026: `io.github.tiranyx/rupa3d` 1.6.1, lewat
  workflow OIDC `terbit-registri.yml` — login interaktif registri tidak bisa
  memberi namespace org. Langkahnya di runbook terbit internal (`docs/TERBIT.md`, tidak ikut repo publik).
- *(Catatan ini ditambahkan sesudah terbit; salinan CHANGELOG di dalam paket
  npm 1.6.1 masih menyebut "belum dikerjakan".)*

---

## [1.6.0] — 2026-09-11

**`riset/`** — jalur riset: penilaian desain yang dikerjakan dengan rasa,
padahal ada besarannya. Dan **LICENSE MIT**.

### Ditambahkan
- **`LICENSE` (MIT).** Repo ini sebelumnya **tidak punya lisensi sama
  sekali** — yang secara hukum berarti hak cipta penuh, bukan terbuka. Ini
  perubahan nyata, bukan formalitas.
- **`riset/GAP.md`** — 14 penilaian desain yang hari ini diputuskan dengan
  rasa, diperingkat `dampak × kelayakan × belum-digarap`. Termasuk tiga baris
  yang **sudah digarap orang lain dengan baik** dan tetap ditulis dengan skor
  rendah, supaya tidak diklaim sebagai peluang.
- **`riset/ukur/optis.mjs`** — instrumen pertama: geometri massa tinta.
  Sentroid, kecondongan bentuk, geser terhadap bingkai, pembanding dua bentuk.
  Nol kebergantungan.
- **`riset/PAPER.md`** (Inggris), **`riset/README.md`** (Inggris),
  **`riset/LIVING_LOG.md`** (Indonesia), **`riset/adr/`** (3 ADR).
- `riset/test-optis.mjs` — 13 uji, tiap acuan diturunkan dengan tangan.

### Terukur
- **Segitiga menghadap kanan condong tepat −w/6 dari pusat kotak batasnya.**
  Geseran yang setiap desainer lakukan "sedikit ke kanan" itu **seperenam
  lebar**, dan seperenam bukan angka yang bisa ditakar mata dengan andal.
- Acuan tertutup yang dipenuhi: sentroid segitiga di ⅓ kakinya (0,6 px dari
  300), massa lingkaran → πr² (0,2 %), nisbah massa lingkaran:kotak = π/4,
  skala massa-sama = 2/√π.
- Tujuh aset sungguhan: **dua ikon keluar tepat nol** di kedua sumbu, tiga
  condong beberapa persen dengan **kompensasi manual yang terlihat di
  angkanya**.

### Hasilnya biasa saja
Tidak ditemukan satu pun cacat dramatis pada aset yang diuji. Itu hasil yang
benar untuk sampel buatan profesional, dan dilaporkan apa adanya.

### Klaim yang diturunkan
Pencarian prior art **sesudah** instrumennya jadi menemukan bahwa ukurannya
**bukan baru**: momen citra klasik, metrik estetika antarmuka Ngo dkk. sejak
2000, dan model *Visual Moment Equilibrium* 2026 memakai kriteria sentroid
yang persis sama. Kolom "belum-digarap" di GAP dinilai **terlalu tinggi**
(5, yang benar 2–3). `GAP.md` tidak diedit; koreksinya ditulis di LIVING_LOG
dan PAPER, sesuai aturan entri lama tidak diubah surut.

Yang tersisa sebagai gap nyata dan bisa dipertahankan: **tingkat-piksel vs
tingkat-elemen** (metrik Ngo tidak bisa melihat ke dalam satu mark), dan
**tidak satu pun ada di tangan praktisi**.

### Batas yang ditemukan pada alat sendiri
`og-image` **ditolak**: PNG berpalet belum didukung dekoder repo ini. Alat ini
belum bisa membaca satu kelas aset produksi yang nyata.

---

## [1.5.0] — 2026-09-11

**Mesh ber-skin** — dan dua alat yang sepakat salah.

### Terbongkar
- **Spesifikasi glTF menyatakan dengan kata MUST bahwa transform node mesh
  ber-skin HARUS DIABAIKAN.** `ukurGLB` memakainya untuk semua mesh, dan
  angkanya meleset sampai **177 %** pada aset sungguhan (character: lebar
  1,6755 dilaporkan vs **0,6049** sebenarnya). **Tingginya hampir benar di
  semua model**, dan itu sebabnya kekeliruan ini tidak pernah terlihat.
- **Empat dari empat temuan `skala_diterapkan` pada uji sebelas spesimen
  ternyata PALSU.** Keempat model itu ber-skin dengan transform node 100x.
- **`perbaiki.mjs` akan merusak berkasnya, dan gerbang pembuktiannya
  meloloskan**, karena gerbangnya membandingkan kotak batas yang dihitung
  dengan cara yang sama salahnya.
  > **Dua alat saya sendiri yang sepakat tidak membuat keduanya benar.**

  Sembilan kali sebelumnya yang membongkar sebuah pemeriksa adalah pemeriksa
  lain atau rumus tertutup. Kali ini keduanya sepakat, dan yang membongkarnya
  **spesifikasinya**.

### Ditambahkan
- **`kulit.mjs`** — kotak batas **pose istirahat** lewat matriks sendi.
- **`perbaiki.mjs` + `rupa perbaiki`** — terapkan transform ke verteks,
  buang verteks lepas, dan **buktikan bentuknya tidak berubah**. Hasilnya
  **tidak ditulis** kalau pembuktiannya gagal.
- `test-kulit.mjs` (7 uji) dan gerbang pembuktian yang punya pemeriksa
  **tidak berbagi asumsi**.

### Diperbaiki
- `ukurGLB` memakai kotak **sendi** untuk mesh ber-skin, dan melaporkan
  `kotak_dari`. Aset campuran digabung, bukan dipilih salah satu.
- `skala_diterapkan` mengecualikan mesh ber-skin, dengan alasan yang
  **berbeda** dari pengecualian instans.
- `perbaiki.mjs` **menolak** mesh ber-skin, mesh instans, node ber-anak, dan
  primitif Draco — tiap satu dengan sebabnya.

### Uji
```
262 lulus · 0 gagal · 18 suite      (dari 255, 17)
```
Termasuk satu yang menuntut **mako tetap MERAH**: pedangnya mesh tanpa skin
yang benar-benar berskala.

---

## [1.4.0] — 2026-09-11

**`rupa`** — gerbangnya kini bisa dilewati tanpa menulis kode.

### Ditambahkan
- **Baris perintah `rupa`** (`rupa.mjs`, terdaftar sebagai `bin`):
  ```
  rupa periksa <berkas.glb...>   nilai terhadap spek, terbitkan sertifikat
  rupa topologi <berkas.glb...>  bagaimana verteksnya tersambung
  rupa tekstur <berkas.glb...>   piksel per meter, VRAM per format
  ```
  dengan `--spek` · `--tempel` · `--json` · `--diam` · `--sumbu`.
- **Kode keluar yang menjadikannya gerbang**: `0` lulus · `1` ada aturan
  wajib yang gagal · `2` berkasnya tidak bisa diperiksa. Membedakan `1` dan
  `2` bukan kerapian — yang pertama menuntut **asetnya** diperbaiki, yang
  kedua menuntut **alatnya**. Menyamakannya membuat CI menyalahkan orang
  yang salah.
- `test-cli.mjs` (14 uji), dan yang diuji terutama **kode keluarnya** —
  termasuk bahwa `--json` dan `--diam` **tidak mengubah verdiktnya**.
- **`docs/JURNAL.md`** — jurnal hidup: tiap temuan dan tiap perubahan,
  dengan angkanya, memakai metode **indikator · parameter · faktor-X**.
  Diisi surut dari seluruh riwayat, 29 entri.

### Uji
```
255 lulus · 0 gagal · 17 suite      (dari 241, 16)
```

---

## [1.3.0] — 2026-09-11

**Draco** — pintu masuk yang selama ini tertutup diam-diam.

### Ditambahkan
- **`draco.mjs`** — deteksi dan penguraian `KHR_draco_mesh_compression`.
  Seluruh pembaca berkas (`meshGLB`, `titikGLB`, `topologiGLB`, `ukurGLB`,
  `teksturGLB`) sekarang bekerja pada GLB terkompres Draco.
- Empat tool MCP yang membaca berkas — `rupa_periksa`, `rupa_topologi`,
  `rupa_tekstur`, `rupa_proksi` — **menyiapkan dekodernya sendiri**.
- Kosakata spek `geo_draco` dan `geo_draco_primitif`, supaya dua aturan yang
  berlawanan bisa ditulis: *aset kirim harus terkompres* dan *aset sumber
  tidak boleh terkuantisasi*.
- Status Draco **ikut dilaporkan** di hasil ukur — sertifikat atas berkas
  Draco menggambarkan versi **terkuantisasi** asetnya.
- `test-draco.mjs` (9 uji) dan `docs/DRACO.md`.

### Diperbaiki
- **Berkas Draco dibaca sebagai `0 primitif · 0 dilewati`** — sukses palsu
  yang kosong. Sebabnya satu `continue` yang polos: pada primitif Draco
  accessor **tidak punya `bufferView`** menurut spesifikasinya, `bacaAccessor`
  mengembalikan `null`, dan primitifnya dilewati tanpa suara.
- `titikGLB` melempar **TypeError telanjang** soal `byteOffset` — galat
  internal yang tidak menyebut Draco, tidak menyebut berkasnya, dan tidak
  menyebut apa yang harus dilakukan.
- `topologiGLB` menolak dengan *"tidak ada primitif segitiga"* — pesan yang
  **menyalahkan berkasnya** untuk cacat yang ada di pembacanya.
- `meshGLB` sekarang **menyebut** primitif yang dilewati beserta alasannya,
  bukan `continue` polos.

### Terbongkar
- **Empat pembaca, empat perilaku berbeda pada satu berkas — dan tidak satu
  pun menyebut Draco.** Yang paling berbahaya justru `kotakBatasGLB`, yang
  menjawab **benar** (accessor `min`/`max` tetap ditulis di GLB Draco) sambil
  geometrinya belum tersentuh sama sekali. Pemanggilnya menyimpulkan
  berkasnya terbaca.
- **Ini pelanggaran spek, bukan kekurangan fitur.** `extensionsRequired`
  berisi `KHR_draco_mesh_compression`, dan spesifikasi glTF menyatakan
  pembaca yang tidak mendukung ekstensi wajib harus **menolak** berkasnya.
- **Draco memampatkan geometri, bukan konektivitas.** Satu adegan, dua
  ekspor: verteks, indeks, segitiga, tak-manifold, tepi batas, putaran, dan
  degenerasi **identik semuanya**. Yang bergeser cuma posisinya — maks
  **9,4e−5 = 0,0027 % diagonal**, dan sudut minimum 7,3604° → 7,3215°.

### Uji
```
241 lulus · 0 gagal · 16 suite      (dari 232, 15)
```
Dua uji menjaga hal yang **berlawanan**: tanpa dekoder keempat pembaca harus
**menolak** sambil menyebut ekstensinya dan jalan keluarnya; dengan dekoder
keempatnya harus memberi angka yang **sama** dengan berkas polosnya. Yang
pertama hanya berarti kalau dijalankan sebelum dekodernya disiapkan — kalau
urutan ujinya berubah ia **dilewati sambil menyebut sebabnya**, bukan lulus
palsu.

### Regresi
Sebelas model luar dari 10 Sep diperiksa ulang: **verdiktnya tidak satu pun
berubah.**

---

## [1.2.1] — 2026-09-10

Divalidasi terhadap **sebelas model dari luar** — tidak satu pun pernah
disentuh Rupa3D.

### Divalidasi
- Arsip proyek arsitektur, paket aset publik, mesh pindai, dan keluaran
  generator. **4 dari 4 model buatan manusia GAGAL; 7 dari 7 keluaran
  generator LOLOS** — bukan karena generatornya lebih baik, melainkan karena
  yang diperiksa **kebersihan berkas**, bukan kualitas bentuk.
- Aturan wajib yang paling sering jatuh: `skala_diterapkan` **4/11**,
  `topo_tak_manifold` 3/11, `topo_putaran_salah` 1/11, `topo_degenerasi` 1/11.
- Sepuluh dari sebelas selesai **di bawah 250 ms**; yang 20 detik itu berkas
  17,9 MB berisi 3.323 objek.

### Terbongkar
- **Skala 100× tersimpan di node, pada paket aset publik yang dipakai banyak
  orang.** `skala_dunia = [100, 99.999997, 99.999997]` di tiap node ber-mesh —
  bukan derau pembulatan. Geometri di dalam buffer **seratus kali lebih kecil
  daripada yang dirender**, dan apa pun yang membaca accessor langsung
  mendapat ukuran yang salah tanpa satu pun galat.
- **Siteplan arsitektur sungguhan: 260.187 tepi tak-manifold** dari 484.644
  segitiga, UV **100 % bertindih**, sebaran texel **10×**, sudut minimum
  **0,000°**, dan **ketiga-ribu-tiga-ratus-dua-puluh-tiga** node-nya berskala.
  Model itu bisa dilihat dan terlihat benar; ia tidak bisa di-lightmap dan
  tidak bisa dipakai untuk simulasi tertutup.

### Dokumen
- `docs/SEBELAS-SPESIMEN.md` — hasil lengkap, tiga temuan, dan **enam arah
  produk** yang diurutkan menurut seberapa sulit ditiru. Tesisnya:
  **produknya sertifikatnya, bukan mesh-nya.**
- Rekomendasi: **gerbang mutu aset (CI untuk 3D)**. Penghalang terbesarnya
  **Draco** — banyak generator memakainya dan sisi berkas belum bisa
  membacanya.

### Koreksi
- Draf pertama temuan skala hampir menulis "accessor mengecil 240×", dari
  membandingkan kotak batas accessor terhadap kotak batas dunia. Itu **salah**:
  node-nya juga bergeser, jadi kotak dunianya melebar lebih dari sekadar
  skalanya. Yang benar-benar terukur cuma `skala_dunia = 100`, dan klaim yang
  lebih besar dibuang sebelum ditulis.

---

## [1.2.0] — 2026-09-10

Menilai berkas orang lain — dan tiga hal yang Blender **tidak bisa lihat**.

### Ditambahkan
- **`ukur-glb.mjs` + `rupa_periksa { berkas }`** — seluruh kosakata bentuk
  dibaca dari GLB-nya, **tanpa Blender**. 35 aturan dalam **967 ms**; jalur
  adegan menuntut tiga panggilan Blender, sekitar sepuluh detik.
- **`spek/aset-generatif.json`** — 25 aturan yang **semuanya bisa dijawab
  berkasnya sendiri**. Spek yang ada sebelumnya tidak cocok: `kora-3d-penuh`
  memuat enam aturan *pipeline* yang sebuah GLB tidak mengangkut jawabannya,
  jadi ia menolak setiap berkas dari luar tanpa memberi tahu apa pun berguna.
  **Spek punya lingkup.**
- Sertifikat sekarang membawa `sumber` — `berkas` atau `adegan`, berikut sumbu
  atas yang dipakai.
- Deteksi **verteks lepas** dari accessor: posisi yang tidak dirujuk satu
  indeks pun, dibayar penuh di VRAM sambil tidak menggambar apa-apa.
- `test-ukur-glb.mjs` (15 uji, GLB disusun di dalam ujinya sendiri) dan tiga
  uji silang terhadap Blender di `test.mjs`.

### Diubah
- `spek.sumbu_atas` **akhirnya dibaca**. Ia dideklarasikan di
  `spek/kora-3d.json` sejak 6 September dan tidak pernah dipakai satu tempat
  pun — bidang hantu kedua, sesudah `ukuran`.
- `skala_diterapkan` diukur dari **skala DUNIA**, bukan `node.scale` mentah.
  Node berskala `[1,1,1]` di bawah induk berskala `[40,40,40]` bukan node yang
  skalanya sudah diterapkan.

### Terbongkar
- **Blender MEMBUANG verteks lepas saat impor GLB.** Terukur pada
  `takora.glb`: berkas **4**, Blender **0**. Memeriksa lewat Blender akan
  selalu melaporkan nol — bukan karena berkasnya bersih, melainkan karena
  Blender tidak pernah melihatnya. **Nol yang datang dari kebutaan terbaca
  persis seperti nol yang datang dari kebersihan.**
- **`ngon 0` dari Blender adalah kabar baik palsu** — ia nol untuk GLB apa
  pun, karena impornya sudah tersegitiga.
- **Blender Z-atas, glTF Y-atas**, dan `pivot_z` ada di sumbu **kedua** sebuah
  GLB. Takora: `min[1]` = −1,4514 ✓ · `min[2]` = −1,4804 — beda 2%, satuan
  sama, **tanpa satu pun gejala**.
- Silang bidang-demi-bidang pada tiga aset dari tiga pipeline berbeda:
  **sebelas dari tiga belas bidang cocok persis.** Dua yang tidak adalah dua
  dari kebutaan di atas.

### Uji
```
232 lulus · 0 gagal · 15 suite      (dari 210, 14)
```

---

## [1.1.0] — 2026-09-10

Sisi keluaran, fisika, topologi, tekstur, dan **pintu MCP yang ternyata tidak
tersambung**. Empat belas commit, hari tersibuk proyek ini.

### Ditambahkan
- **Sisi keluaran**: format adegan (`adegan.mjs`), pemandang three.js
  (`runtime/pemandang.html`), dan terbit ke satu halaman mandiri
  (`terbit.mjs`) — aset ditanam base64, nol permintaan jaringan.
- **8 tool `rupa_adegan_*`** — adegan disusun lewat MCP.
- **Fisika Rapier** (`fisika.mjs`) dengan tiga acuan tertutup: jatuh bebas
  `h = ½gt²`, restitusi `e = |v'|/|v|`, massa `m = ρV`.
- **Karakter kinematik** (`karakter.mjs`) — WASD, lompat, naik anak tangga
  35 cm, menempel di lereng.
- **Proksi tabrakan terukur** (`tabrak.mjs`) — hull cembung diukur dengan
  collider Rapier yang **persis akan berjalan**, lewat `projectPoint()`.
- **Sketsa 2D → padat 3D** (`cad-sketsa.mjs`) — ekstrusi, putar, loft; tiap
  satu dibandingkan ke bentuk tertutupnya (shoelace, teorema Pappus).
- **Topologi dari GLB** (`topologi.mjs`) — tak-manifold, tepi batas, putaran
  salah, sliver, sebaran texel. Bekerja pada berkas **dari mana pun**, tanpa
  Blender.
- **Tumpang-tindih pulau UV** — dicuplik di **pusat texel**, supaya tepi
  bersama antar-segitiga tidak terhitung sebagai tumpang-tindih.
- **Topologi SUMBER** (`bpy/sumber.py`, `rupa_topologi_sumber`) — quad, n-gon,
  valensi, kutub, edge loop, quad tak-sebidang. Yang tidak bisa dibaca dari
  GLB, dibaca dari mesh di dalam Blender.
- **Tekstur** (`tekstur.mjs`) — **piksel per meter**, VRAM per format,
  deteksi peta rata / alfa sia-sia / resolusi semu / normal map palsu.
- **PNG ditulis sendiri** (`png.mjs`) — ~150 baris, putar-baliknya identik
  bit demi bit, nol kebergantungan.
- **Mode berantai Blender** — `jalankanBanyak()` dan `rupa_rantai`.
- **`test-mcp.mjs`** — suite pertama yang menguji **pintunya**, bukan
  pustakanya.
- Spek baru: `topologi-siap` (9), `tekstur-siap` (11), `sumber-siap` (4),
  dan `kora-3d-penuh` yang mewarisi semuanya jadi **35 aturan**.

### Diubah
- **Sertifikat diterbitkan dari ARTEFAK, bukan dari adegan.** Urutannya
  dibalik: ekspor → ukur berkasnya → terbitkan → tempel. Sertifikat
  menggambarkan berkas yang ditempelinya, jadi angkanya harus datang dari
  berkas itu.
- Perakit dipecah jadi **3 rantai** di batas keputusan yang nyata.
- `tex_vram_berlaku` — bukan `tex_vram_rgba8` — yang jadi ukuran aturan spek.
- `README` mencatat bahwa ruang kerja punya **dua akar** yang berbeda; versi
  lama menyebut yang salah.
- `replicad` dibuang dari `package.json` — terpasang sejak awal, tidak pernah
  diimpor satu kali pun.

### Diperbaiki
- **`rupa_periksa` tidak bisa membaca spek berwarisi.** Ia memakai
  `JSON.parse` polos, jadi `warisi` tidak pernah diselesaikan — dan tiga dari
  tujuh spek, termasuk `kora-3d-penuh` yang 35 aturan, ditolak dengan pesan
  yang **menyalahkan berkas speknya**.
- **Fisika tidak bisa dicapai lewat MCP sama sekali.** `rupa_adegan_node`
  tidak punya bidang `fisika`, sementara deskripsi `rupa_proksi` menyuruh
  memakainya.
- `v3()` jatuh diam-diam ke bawaan pada masukan tak sah — `skala: 0.001` jadi
  `[1,1,1]`, dan flange 140 mm terbit sebagai benda **140 meter**.
- `skalaTimpang` bisu pada n<2, persis saat adegan paling sering diperiksa.
- Ekspor GLB tidak pernah menyebut `export_animations` — **setiap GLB yang
  pernah diekspor membawa 0 animasi**, empat hari lamanya.
- `transform_apply(scale=True)` dijalankan pada objek yang skalanya
  dianimasikan; Blender menurut dan animasinya rusak tanpa galat.
- Bidang `ukuran` pada aturan spek adalah **bidang hantu** — dideklarasikan,
  tidak pernah dibaca.
- `bobot` vs `berat`: salah ketik nama bidang membuat **delapan aturan
  peringatan diam-diam jadi gerbang keras**.
- `dariTekstur` melempar pada pengukuran tak lengkap; sekarang keluar `null`.
- Laporan pipeline mencetak `NaNs` sesudah dibuat berantai.
- Docstring `op_bake` mengklaim memeriksa tumpang-tindih UV — dan tidak
  pernah.

### Terbongkar
- **`null <= 3` di JavaScript adalah `true`.** `topologi.mjs` dan
  `tekstur.mjs` sama-sama sengaja melaporkan `null` supaya aturannya
  **menolak** aset tanpa UV / tanpa tekstur, dan keduanya menulis komentar
  yang menjelaskannya. `nilaiAturan` tidak pernah membedakan `null` dari
  angka. **16 verdik "ok" palsu pada 5 dari 6 aset**, termasuk
  `tex_vram_berlaku ≤ 16 MB` yang lulus pada berkas **tanpa satu tekstur
  pun**.
- **UV Takora 100 % bertindih, 144 segitiga menumpuk di satu texel** — itu
  sebab bake AO-nya cuma mencakup 28,63 %, angka yang tercatat berhari-hari
  tanpa sebab.
- **`convexHull` Rapier rusak diam-diam di atas ~8.000 titik.** Tidak null,
  tidak melempar, tidak memperingatkan — ia mengembalikan collider bervolume
  **nol**, dan benda dengan collider bervolume nol jatuh menembus dunia.
  Bola r=1 (analitik 4,18879): 8.192 titik → 4,1736 · 16.384 → 0,2877 ·
  20.480 → **0,0000**.
- **Rapier meredam laju di 400 m/s tanpa memberi tahu.** Diminta 200.000,
  dapat 400,0 — yang membatalkan seluruh sapuan tembus pertama.
- **`requestAnimationFrame` menyala nol kali per detik saat tab tidak
  dilukis.** Enam hipotesis diuji sebelum satu pengukuran menjawabnya.
- **30.790 tepi tak-manifold ternyata 360** — menggelembung **85×**. glTF
  memecah verteks di tiap jahitan UV, jadi tiap jahitan terhitung sebagai
  lubang.
- **Memuat GLB ke Blender TIDAK memulihkan quad-nya.** Terukur: 2.976
  segitiga masuk, 2.976 segitiga keluar, nol quad. Karena itu keluaran
  `rupa_topologi_sumber` menyebutnya, bukan mendiamkannya.
- Uji tangga berjalan 13,5 m melewati tangga 4 m dan turun di sisi lain,
  lalu melaporkan "naik 0,000 m" untuk pendakian yang sempurna.
- Uji lereng bertanda putaran terbalik: ujung dekatnya terangkat ke 2,25 m —
  bagi karakter itu **tembok**, bukan tanjakan.
- **Seluruh suite menguji pustakanya, tidak pernah pintunya.** Dua kemampuan
  yang lengkap dan benar tidak bisa dicapai, dan 201 uji tetap hijau.

### Kinerja
- **Mode berantai: 22,2 s → 3,1 s, `7,14×`.** Menyalakan proses Blender cuma
  449 ms; sisanya muat + simpan berkas `.blend` yang sama, diulang tiap op.
- Perakit penuh: **24,7 s → 15,3 s**.
- `rupa_rantai` lewat MCP sungguhan: **17,3 s → 4,7 s, `3,71×`**.
- Kedua mode dibandingkan **bidang demi bidang** sebelum yang cepat
  dipercaya. Cepat yang salah lebih buruk daripada lambat yang benar.

---

## [1.0.0] — 2026-09-07

Kernel kedua, perakit, dan spek yang benar-benar menggagalkan.

### Ditambahkan
- **`rakit.mjs`** — pipeline penuh jadi satu panggilan: muat → ukur → LOD →
  tabrakan → bake → ukur ulang → nilai → buang turunan → ekspor + tempel
  sertifikat.
- **`turunan.mjs`** — ukuran turunan dan b-rep punya **nama** yang bisa
  ditulis di spek.
- **10 tool `rupa_cad_*`** — kernel b-rep dapat pintu MCP; shape bertahan
  lintas panggilan lewat `serializeShape`.
- **Warisan spek** — `kora-3d-game` = `kora-3d` + `game-siap`; anak menimpa
  induk per `kode`, bukan per posisi.
- `bpy/terrain.py` — heightmap → mesh terukur *(dihentikan atas keputusan
  Fahmi, di-commit apa adanya supaya tidak hilang)*.

### Diperbaiki
- **Pemeriksa membaca `laporan[0]`** — mengukur gelembung berdiameter 0,09
  satuan dan melaporkannya sebagai wakil seluruh aset. Dua aturan keluar
  hijau dan **keduanya bohong**. LOD kini mengambil yang **terburuk** dari
  semua objek; tabrakan mengambil yang **terbesar** menurut diagonal.
- `simpan()` tersarang ke cabang yang salah — aset tanpa objek instans
  diekspor dengan skala yang belum diterapkan, **tanpa gejala**.

### Terbongkar
- **`filletShape(shape, edges, radius)` punya TIGA argumen**, dan kode
  memanggilnya dengan dua. Penjelasan lama — "lubang baut lebih dekat dari
  2× radius" — **dikarang dan tidak pernah diukur**. Dibongkar dengan
  percobaan sepuluh detik: fillet pada kotak polos gagal juga.
  > Penjelasan yang masuk akal lebih berbahaya daripada tidak ada penjelasan,
  > karena ia menghentikan orang mencari.
- **`ok: true` BUKAN bukti bentuknya sah.** Kotak 6000 mm³, batas fillet
  teoretis 5: `r=4,99` → ok, 4883,94 · `r=5` → gagal bersih · `r=5,001` →
  **ok, 7971,72, `isShapeValid` false** — fillet **menambah** 1971 mm³. Alat
  yang meneruskan itu ke STEP akan mengirim berkas rusak ke bengkel CNC.
  Chamfer tidak begitu; ia gagal bersih di setiap nilai di atas batas.
- Sebuah aturan spek bisa menuntut perbaikan yang **merusak** asetnya.
  Blender menolak 32 gelembung Takora dengan "Cannot apply to a multi user" —
  dan **penolakan Blender benar, aturan saya yang salah**: itu instansing,
  1 mesh + 32 transform.

---

## [0.9.0] — 2026-09-06

Hari pertama. Tesisnya dinyatakan, dan langsung diuji sampai patah.

### Ditambahkan
- **MCP di atas Blender headless** — 7 tool: `rupa_status`, `rupa_baru`,
  `rupa_muat`, `rupa_skrip`, `rupa_ukur`, `rupa_lihat`, `rupa_ekspor`.
- **SVG → 3D** — jalur 2D→3D paling presisi yang ada, karena ia memakai
  kurva vektor aslinya, bukan menebak dari piksel.
- **LOD, proksi tabrakan, dan baking** — masing-masing **dengan angka
  galatnya**, bukan cuma hasilnya.
- **Kernel b-rep OCCT di Node** (`cad.mjs`) — siap 0,43 detik, volume eksak,
  ekspor STEP AP242.
- **`spek.mjs` + sertifikat yang menempel di dalam GLB** pada
  `asset.extras.rupa3d`. Rumusnya: **SPEK (janji) × UKURAN (kenyataan) →
  SERTIFIKAT (bukti)**.
- `docs/PRD.md`, `docs/ERD.md`, `docs/BACKLOG.md`,
  `docs/VISI-DAN-ARSITEKTUR.md`.

### Terbongkar
- **Takora GAGAL lima aturan speknya**, dan **tidak satu pun terlihat di
  layar**: tinggi meleset −9,19 cm, lebar −11,20 cm, nisbah 0,9975 vs
  1,1667, pivot −1,45 cm, skala belum diterapkan.
  > Itulah seluruh alasan produk ini ada.
- **Tiga alat ukur yang berbohong**, semuanya milik sendiri: "piksel gelap =
  belum tertulis" (latar peta normal justru ungu **terang** — 100 % palsu);
  "alfa = cakupan" (`use_clear` mengisi alfanya juga); "variasi menangkap
  arah terbalik" (tidak — membalik arah tetap menghasilkan bake yang **sah**,
  0,238 lawan 0,237, dan justru itu yang membuatnya berbahaya).
- **Bake AO hitam pekat, dan sebabnya sisa adegan.** Empat dugaan geometris
  dibantah sekaligus oleh satu eksperimen terkontrol: tiga adegan bersih,
  satu variabel, variasi **identik 0,394 di ketiganya**. Adegan uji ternyata
  berisi 11 mesh bertumpuk dari langkah sebelumnya. Hukumnya: bake **normal**
  cuma peduli pasangan rendah↔tinggi; bake **AO / combined / diffuse** peduli
  **seluruh adegan**.
- **Tabel tesselasi yang sudah diterbitkan ternyata palsu** — sapuan 6×5
  memberi 1004 segitiga di **ketiga puluh** selnya. OCCT menyimpan
  triangulasi **di dalam** shape dan hanya pernah memperhalusnya. Sapuan yang
  tidak memberi variasi apa pun berarti parameternya tidak tersambung.
- **Ikon bergaya garis di-extrude jadi pita setipis kertas yang melayang** —
  1.074 tepi tak-manifold. Spline **terbuka** harus di-bevel jadi tabung,
  bukan di-extrude jadi lempeng.
- Result gagal menyamar jadi sukses: helper yang cuma mengecek `value`
  membuat `{ok:false}` jadi `undefined` — **jawaban benar yang ditelan
  diam-diam oleh kode sendiri**.

---

[1.6.2]: https://github.com/tiranyx/rupa3d-core/releases/tag/v1.6.2
[1.6.1]: https://github.com/tiranyx/Rupa3D/commits/main
[1.6.0]: https://github.com/tiranyx/Rupa3D/commits/main
[1.5.0]: https://github.com/tiranyx/Rupa3D/commits/main
[1.4.0]: https://github.com/tiranyx/Rupa3D/commits/main
[1.3.0]: https://github.com/tiranyx/Rupa3D/commits/main
[1.2.1]: https://github.com/tiranyx/Rupa3D/commits/main
[1.2.0]: https://github.com/tiranyx/Rupa3D/commits/main
[1.1.0]: https://github.com/tiranyx/Rupa3D/commits/main
[1.0.0]: https://github.com/tiranyx/Rupa3D/commits/main
[0.9.0]: https://github.com/tiranyx/Rupa3D/commits/main
