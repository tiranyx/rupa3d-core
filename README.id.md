# Rupa3D

**Alat 3D di mana setiap aset membawa buktinya sendiri.**

[English](README.md)

Bukan editor 3D dengan AI di dalamnya. Bukan Blender yang dibungkus web.
Sebuah **sistem build untuk 3D** — seperti CI untuk kode: aset punya spek,
pipeline membuktikannya dengan angka, regresi menggagalkan build.

```
bangun (kode)  →  render  →  UKUR  →  banding ke spek  →  iterasi
```

> **Keadaan** — 1.6.2 · 297 uji · MIT · npm [`rupa3d`](https://www.npmjs.com/package/rupa3d)
> · registri MCP `io.github.tiranyx/rupa3d`. Dikembangkan dan diuji di
> Windows 11 dengan Node 22.

```bash
claude mcp add rupa3d -- npx -y rupa3d
```

---

## Kenapa

Semua alat 3D hari ini punya satu lubang yang sama: **aset yang rusak dikirim
tanpa suara.** LOD yang merusak siluet, proksi tabrakan yang bocor, peta AO
yang hitam seluruhnya, mesh yang melenceng dari geometri CAD-nya — semuanya
"berhasil", tidak satu pun terlihat sebagai galat.

Alat-alat itu dibuat untuk manusia yang **melihat**. Mata cepat, tetapi ia
tidak bisa membaca skala, menghitung galat, atau membandingkan dua hal yang
tidak ada di layar bersamaan.

Rupa3D dibuat untuk agen yang **mengukur** — dan manusia yang memutuskan.

Selengkapnya: [spek & sertifikat](docs/SERTIFIKAT.md) ·
[perakit](docs/PERAKIT.md) · [CAD lewat MCP](docs/CAD-MCP.md) ·
[adegan & runtime](docs/ADEGAN.md) · [sketsa 2D→3D](docs/SKETSA.md) ·
[fisika](docs/FISIKA.md) · [topologi](docs/TOPOLOGI.md) ·
[tekstur](docs/TEKSTUR.md) · [optimasi](docs/OPTIMASI.md) ·
[integrasi](docs/INTEGRASI.md)

---

## Dua kernel, karena bentuk punya dua sifat

| | **b-rep** (OpenCascade) | **mesh** (Blender) |
|---|---|---|
| menyimpan | permukaan analitik + topologi + **toleransi** | segitiga |
| eksak? | ya | tidak pernah |
| untuk | CAD, CAE, CAM, manufaktur | seni, animasi, game, web |

Terukur pada flange Ø140: b-rep **143.954,059 mm³** = hitungan analitik
**143.954,059 mm³**, selisih **0**. Mesh terbaik pada 9.252 segitiga masih
meleset **−0,0016%**.

Untuk flange yang harus pas dengan baut M10 pada ±0,1 mm, itu bukan soal
selera. Di alat berbasis mesh, toleransi itu **tidak punya tempat tinggal**.

---

## Tool MCP

**Tanpa Blender — 23 dari 36 tool.** Termasuk seluruh pemeriksa berkas, kernel
b-rep, dan adegan. Rinciannya di [docs/INTEGRASI.md](docs/INTEGRASI.md).

| tool | guna |
|---|---|
| `rupa_status` | Blender mana, versi berapa, adegan ada belum |
| `rupa_baru` | adegan kosong |
| `rupa_muat` | impor `.glb .gltf .obj .fbx .stl .ply` dan **`.svg`** |
| `rupa_skrip` | `bpy` penuh, headless — primitif pemodelan parametrik |
| `rupa_ukur` | segitiga, n-gon, tak-manifold, ukuran, skala, kotak batas |
| `rupa_lihat` | render beberapa sudut; kamera & lampu dihitung dari kotak batas |
| `rupa_ekspor` | GLB dengan skala sudah diterapkan |
| `rupa_periksa` | nilai terhadap SPEK dan terbitkan SERTIFIKAT; dengan `berkas`, tanpa Blender |

### Sisi CAD — 11 tool `rupa_cad_*`

| | |
|---|---|
| `rupa_cad_bentuk` | primitif b-rep: kotak, silinder, bola, kerucut, torus, elipsoid |
| `rupa_cad_boolean` | potong · gabung · iris, dengan arah volume diperiksa |
| `rupa_cad_tepi` | daftar tepi berikut arah & panjangnya — dilihat SEBELUM memilih |
| `rupa_cad_fillet` | fillet/chamfer: semua tepi, searah tertentu, atau daftar indeks |
| `rupa_cad_sketsa` | sketsa 2D → ekstrusi/putar, diperiksa terhadap rumus tertutup |
| `rupa_cad_ubah` | geser · putar · skala · cermin, volume diperiksa terhadap yang seharusnya |
| `rupa_cad_ukur` | volume & luas EKSAK + ongkos hampiran meshnya |
| `rupa_cad_ekspor` | .step .iges (eksak) · .stl .glb .obj (hampiran, galat disebut) |
| `rupa_cad_impor` | STEP/IGES/STL dari CAD lain, langsung diukur |
| `rupa_cad_status` · `rupa_cad_daftar` | kernel & isi ruang |

Shape bertahan lintas panggilan lewat `serializeShape` — putar-baliknya tidak
menggeser volume sedikit pun (STEP: selisih 3,64e−11).

**`ok: true` dari kernel bukan bukti bentuknya sah.** Terukur: fillet di atas
setengah sisi terkecil mengembalikan `ok` dengan solid rusak yang volumenya
NAIK 1971 mm³ dari kotak 6000 mm³. Dua pemeriksa bebas menolaknya, dan hasil
yang gagal tidak pernah tersimpan. Rinciannya: [CAD-MCP.md](docs/CAD-MCP.md).

### Perakit — satu panggilan, satu aset bersertifikat

```
muat → ukur → LOD → tabrakan → bake → ukur ulang → nilai → buang turunan → ekspor + tempel
```

Tiap langkah **meninggalkan angka, dan angka itu ikut dinilai**. Pipeline yang
"berhasil" tetapi menghasilkan LOD yang merusak siluet atau peta bake yang
kosong akan GAGAL — dan menyebut angkanya. Perakit sudah berjalan dari Node,
tetapi **belum punya tool MCP**. Rinciannya: [PERAKIT.md](docs/PERAKIT.md).

### SVG → 3D

Jalur 2D→3D paling presisi yang ada di sini: ia memakai **kurva vektor
aslinya**, bukan menebak dari piksel. Dua jenis path diperlakukan berbeda,
dan itu menentukan:

- spline **tertutup** (ber-fill) → *extrude* jadi lempeng padat
- spline **terbuka** (ber-stroke) → *bevel* jadi tabung bulat

Di-extrude, ikon garis jadi pita setipis kertas yang melayang — terukur 1.074
tepi tak-manifold. Contoh terkerja: [`contoh/svg-ke-3d.mjs`](contoh/svg-ke-3d.mjs).

---

## Jalankan

```bash
npm install
npm test                          # SELURUHNYA — 297 uji, 21 berkas

node --test test.mjs              # 14  Blender SUNGGUHAN, termasuk mode berantai
node --test test-mcp.mjs          # 15  lewat PINTU MCP, termasuk dari direktori asing
node --test test-cad.mjs          #  7  OCCT SUNGGUHAN
node --test test-cad-ruang.mjs    # 14  ruang kerja CAD
node --test test-cad-sketsa.mjs   # 18  sketsa, terhadap rumus tertutup
node --test test-spek.mjs         # 25  mesin aturan
node --test test-turunan.mjs      # 11  kosakata turunan
node --test test-adegan.mjs       # 23  adegan & terbit
node --test test-fisika.mjs       # 14  fisika, terhadap mekanika dasar dan rotasi XYZ
node --test test-tabrak.mjs       # 11  proksi tabrakan
node --test test-karakter.mjs     # 13  kendali pemain
node --test test-topologi.mjs     # 23  topologi GLB, thd bentuk yang dihitung di kepala
node --test test-sumber.mjs       # 12  topologi SUMBER (torus, kubus, ikosahedron)
node --test test-tekstur.mjs      # 21  tekstur + dekoder PNG sendiri
node --test test-ukur-glb.mjs     # 15  ukur GLB tanpa Blender, GLB disusun di ujinya
node --test test-draco.mjs        #  9  Draco: satu adegan, dua ekspor, angka sama
node --test test-cli.mjs          # 15  baris perintah — terutama KODE KELUARNYA
node --test test-kulit.mjs        #  7  mesh ber-skin: transform node DIABAIKAN spek
node --test test-berkas-jahat.mjs #  8  GLB yang sengaja rusak, tiap kasus di proses anak
node --test test-hierarki.mjs     #  9  hierarki node: siklus ditolak, matriks identik bit
node --test riset/test-optis.mjs  # 13  geometri massa tinta, acuan diturunkan tangan
node server.mjs                   # stdio MCP
```

Uji yang butuh aset di `.rupa3d/` — yang tidak ikut git — **dilewati dengan
alasan dan cara mendapatkannya**. `node contoh/flange-cad.mjs` membangun
`flange.glb` (±40 dtk, tanpa Blender); `node contoh/tekstur-batu.mjs`
membangun `batu-batu.glb` (butuh Blender). Model karakter uji tidak ikut repo.

Blender dicari otomatis di `C:\Program Files\Blender Foundation\*`; timpa
dengan `RUPA3D_BLENDER`.

**Ruang kerja ada DUA akar, dan itu mudah membingungkan:**

| server MCP | `~/.rupa3d/<nama>` — sejak 1.6.1 dari direktori rumah. Sebelumnya dihitung dari `../../` relatif `server.mjs`, yang di bawah npx jatuh ke dalam cache npm |
|---|---|
| contoh di `contoh/` | relatif **direktori kerja**, jadi biasanya `<repo>/.rupa3d/<nama>` |

Keduanya nyata dan keduanya terpakai. `RUPA3D_RUANG` menimpa yang pertama, dan
`rupa_status` selalu melaporkan akar yang sedang dipakai — panggil itu kalau
sebuah berkas "hilang"; hampir selalu ia ada, di akar yang satunya.

### Contoh

| | |
|---|---|
| [`contoh/svg-ke-3d.mjs`](contoh/svg-ke-3d.mjs) | ikon vektor → GLB, terukur di tiap langkah |
| [`contoh/flange-cad.mjs`](contoh/flange-cad.mjs) | flange parametrik → STEP AP242 + GLB + STL |
| [`contoh/sketsa-arsitektur.mjs`](contoh/sketsa-arsitektur.mjs) | sketsa 2D jadi bangunan dan benda putar, dengan acuan tertutup |
| [`contoh/fisika-tumpukan.mjs`](contoh/fisika-tumpukan.mjs) | fisika Rapier di panggung, angkanya diperiksa dulu di Node |
| [`contoh/tekstur-batu.mjs`](contoh/tekstur-batu.mjs) | material prosedural → peta dipanggang → GLB bertekstur → diukur |
| [`contoh/terrain-nyquist.mjs`](contoh/terrain-nyquist.mjs) | sapuan resolusi terrain yang membuktikan Nyquist |

---

## Disiplin

Uji dijalankan terhadap **Blender, OCCT, dan Rapier sungguhan, bukan mock** —
**297 uji, 21 berkas**, dan salah satunya lewat **stdio MCP sungguhan**.

Yang terakhir itu ada karena suite lain menguji PUSTAKANYA, dan dua kemampuan
yang lengkap dan benar pernah **tidak bisa dicapai** lewat MCP — sementara 201
uji tetap hijau. Pustaka yang benar di balik pintu yang tidak tersambung adalah
pustaka yang tidak ada, bagi yang memakainya lewat pintu itu. Sejak 1.6.1 uji
itu juga menyalakan server dari direktori asing, seperti klien MCP
menyalakannya — tiga jalur yang cuma benar di checkout pemilik ditemukan
dengan cara itu.

Dan satu aturan yang lahir dari pengalaman mahal: **alat ukur yang berbohong
lebih buruk daripada tidak ada alat ukur.** Sampai 15 September 2026 tercatat
enam belas kegagalan yang sebabnya ada di pemeriksa buatan sendiri, bukan di
kernel yang diperiksa — cakupan bake yang melaporkan 100% palsu, tabel
tesselasi yang seluruh selnya identik, sapuan parameter yang tidak tersambung.
Pemeriksanya **diperbaiki, bukan dilonggarkan**.

Karena itu setiap pemeriksa baru harus dibuktikan **MERAH dulu** sebelum
dipercaya hijau.

---

## Catatan keamanan

`rupa_skrip` menjalankan Python `bpy` arbitrer di dalam Blender headless. Itu
memang kemampuan pemodelannya — bukan celah — tetapi perlu diketahui: ia bisa
merusak adegan di ruang kerjanya. Jangan membuka server ini untuk masukan yang
tidak dipercaya lewat jaringan.

Berkas GLB jahat — node bersiklus, indeks di luar batas, `count` palsu, skin
raksasa — ditolak dengan pesan yang menyebut cacatnya. Batas ukuran masukan
umum dan isolasi proses **belum** ada.

---

## Lisensi

MIT. Dependensi memakai lisensinya masing-masing — terutama
`brepjs-opencascade` (LGPL-2.1-only). Skrip di `bpy/` berjalan di dalam
Blender.

Rupa3D dipisahkan dari proyek internal pada 6 September 2026 sebagai alat 3D
umum.

---

## Dokumen

- **[docs/INTEGRASI.md](docs/INTEGRASI.md)** — memakai Rupa3D dari luar:
  pustaka, server MCP, atau membaca sertifikat dari dalam GLB tanpa memasang
  apa pun.
- **[docs/BERKAS.md](docs/BERKAS.md)** — menilai berkas orang lain dalam
  967 ms tanpa Blender, dan tiga cacat yang Blender **tidak bisa lihat** pada
  sebuah GLB.
- **[docs/DRACO.md](docs/DRACO.md)** — pintu masuk yang tertutup diam-diam:
  empat pembaca, empat perilaku berbeda, dan tidak satu pun menyebut Draco.
- **[CHANGELOG.md](CHANGELOG.md)** — tiap rilis, berikut apa yang **terbongkar**
  di dalamnya.
