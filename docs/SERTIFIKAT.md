# Spek & sertifikat — tesis Rupa3D, dan pembuktiannya

6 September 2026.

```
SPEK (janji)  ×  UKURAN (kenyataan)  →  SERTIFIKAT (bukti)
```

Sertifikatnya menempel **di dalam berkas GLB-nya**, pada `asset.extras.rupa3d`.
Siapa pun yang menerimanya bisa membaca apa yang dijanjikan, apa yang diukur,
dan siapa yang mengukurnya — tanpa berkas pendamping, tanpa basis data, tanpa
perlu mempercayai siapa pun.

---

## Pembuktiannya: Takora GAGAL lima aturan

Aset yang saya render, animasikan, dan tunjukkan berkali-kali sepanjang hari
ini — dan yang tampak baik-baik saja setiap kali:

```
GAGAL — takora terhadap kora-3d@1.0
9 aturan diperiksa · 5 gagal · 1 peringatan

  ok   segitiga_total                18458
 GAGAL tinggi                       2.8092 cm   ← 2.8092 vs 12 (meleset -9.1908, toleransi ±0.15)
 GAGAL lebar                        2.8021 cm   ← 2.8021 vs 14 (meleset -11.1979, toleransi ±0.15)
 GAGAL nisbah_lebar_tinggi          0.9975      ← 0.9975 vs 1.1667 (meleset -0.1692, toleransi ±0.03)
 GAGAL pivot_z                     -1.4514 cm   ← -1.4514 vs 0 (meleset -1.4514, toleransi ±0.02)
 GAGAL skala_diterapkan              false      ← false (harus true)
  ok   bagian                    [6 nilai]
 warn  tak_manifold                  30790      ← 30790 vs 0
  ok   simpul_lepas                      0

kernel: Blender 5.2.1 LTS
```

Lima cacat, semuanya nyata:

| | apa yang terjadi |
|---|---|
| **tinggi & lebar** | aset dalam satuan Blender (±2,8), bukan sentimeter. Ini kelas kesalahan skala 1000× yang saya sebut di PRD — dan ia ada di aset saya sendiri |
| **nisbah 0,9975** | ia nyaris **bulat**, bukan 140:120 seperti spek |
| **pivot_z −1,4514** | alasnya 1,45 satuan **di bawah** titik nol, bukan duduk di z = 0 |
| **skala_diterapkan false** | skala menempel di node — persis jebakan yang disebut manual three.js |
| **tak_manifold 30.790** | ⚠️ **angka ini kemudian terbukti palsu** — lihat di bawah |

**Tidak satu pun dari kelimanya terlihat di layar.** Saya melihat aset itu
belasan kali hari ini — render harness, render Cycles, viewport Blender,
empat bingkai animasi. Semuanya tampak benar.

Itulah seluruh alasan produk ini ada.

Dan `nisbah_lebar_tinggi` ada sebagai aturan terpisah justru untuk kasus ini:
aset yang diskalakan seragam bisa lolos `tinggi` dan `lebar` sendiri-sendiri
kalau toleransinya longgar; nisbah yang menangkapnya.

---

## Pendirian yang dipasang di kodenya

### Ukuran yang HILANG adalah kegagalan

Aturan yang diam-diam tidak dijalankan adalah cara paling halus sebuah
pemeriksa berbohong: sertifikatnya tetap hijau dan tidak ada yang diperiksa.
`nilaiAturan` mengembalikan **gagal** untuk ukuran yang tidak ada.

### Koreksi 10 Sep: dan `null` melewatinya selama ini

Aturan di atas ditulis untuk `undefined`. Ada cara **kedua** sebuah ukuran
tidak bisa dinilai, dan cara itu lolos:

`topologi.mjs` dan `tekstur.mjs` sama-sama sengaja melaporkan **`null`**
alih-alih `0` — mesh tanpa UV, aset tanpa tekstur. Keduanya menulis komentar
yang menjelaskan alasannya: *nol akan meloloskan aturan yang justru paling
perlu menolak.*

Komentar itu benar. Kodenya tidak menjalankannya.

```js
null <= 3   // → true
null < 5    // → true
Math.abs(null - 0) <= 0   // → true   (pembanding '=')
```

JavaScript memaksa `null` jadi `0` di operator relasional. Jadi nilai yang
**ditulis khusus untuk menolak** justru meloloskan — dan tiga pembanding
sekaligus kena.

**Terukur sebelum ditambal, bukan diperkirakan:**

```
16 verdik "ok" palsu · 5 dari 6 aset di repo ini
```

Dua di antaranya menjelaskan kenapa ini bukan soal kerapian:

| `tex_vram_berlaku <= 16 MB` | **ok** pada berkas tanpa satu tekstur pun |
|---|---|
| `topo_texel_sebaran <= 3` | **ok** pada mesh tanpa UV — aturan yang dokumennya sendiri mengklaim terlindung oleh konvensi `null` itu |

Sekarang `null` ditangkap **sebelum** pembandingnya dipanggil, dan pesannya
dibedakan dari `undefined` karena tindakan pembacanya berbeda:

| `undefined` | pengukurnya tidak menghasilkan bidang ini — salah nama, atau pengukurnya belum ada |
|---|---|
| `null` | pengukurnya **jalan** dan menyatakan tidak terukur pada aset ini |

> **Tiga berkas menulis niat yang sama. Berkas keempat membatalkannya. Tidak
> satu pun dari keempatnya tahu.**
>
> Komentar yang menjelaskan sebuah pendirian bukan bukti pendirian itu
> berlaku. Yang membuktikannya cuma uji yang MERAH kalau pendiriannya
> dilanggar — dan uji itu tidak ada sampai hari ini.

Empat uji sekarang mengunci tiap pembanding yang memaksa `null` jadi nol,
plus satu yang membuktikan **nol sungguhan tetap lolos** — karena tambalan
yang menggagalkan setiap angka rendah akan "memperbaiki" bug ini dengan cara
merusak seluruh pemeriksanya.

### Keabsahan dan keberadaan adalah dua pertanyaan

Temuan di atas menyingkap satu lagi, jenisnya berbeda. `tex_normal_sah`
bernilai `null` kalau asetnya tidak punya normal map, dan aturannya `wajib`.
Efeknya: aset **beralbedo saja** — yang sepenuhnya sah di glTF — ditolak
dengan pesan **"normal map tidak sah"**, padahal ia tidak punya satu pun.

Verdiknya kebetulan benar untuk aset tanpa tekstur; **sebabnya salah**, dan
sebab yang salah mengirim pembacanya memperbaiki hal yang tidak ada.

Dipisah jadi dua:

- `tex_normal_sah` — "semua normal map yang ADA itu sah". Pada aset tanpa
  normal map ini **benar secara hampa**, dan itu jawaban yang jujur.
- `tex_gambar >= 1` — aturan **baru** yang menjawab keberadaan, dan angkanya
  tidak pernah `null`.

Sekarang flange gagal dengan `tex_gambar 0 vs >= 1`, dan aturan yang
bergantung padanya berkata **"tidak terukur pada aset ini"** alih-alih diam
melaporkan ok.

### Pesan kegagalan menyebut BERAPA melesetnya

`GAGAL tinggi` tidak berguna. `2.8092 vs 12 (meleset -9.1908, toleransi ±0.15)`
langsung memberi tahu apa yang harus diperbaiki.

### Spek yang cacat DITOLAK, bukan dijalankan sebagian

Spek dengan pembanding salah ketik akan meloloskan aset diam-diam — kegagalan
yang paling mahal, karena ia terlihat seperti keberhasilan. `periksaSpek()`
menolaknya di depan.

### Bagian dipetakan lewat KATA KUNCI, bukan nama persis

Spek Kora menyebut `shell, brain, glass, liquid, face`; asetnya bernama
`tempurung, otak, kubah-kaca, cairan, wajah-soket`. Pipeline yang berbeda
memberi nama berbeda untuk benda yang sama, dan spek tidak boleh pecah karena
"shell" ditulis "tempurung".

### Koreksi 10 Sep: angka 30.790 itu menggelembung 85×

Tabel di atas dibiarkan apa adanya karena itu yang benar-benar dilaporkan
pada 6 September. Empat hari kemudian `rupa_topologi` mengukurnya dengan
benar: **360**, bukan 30.790.

Sebabnya sudah setengah tertulis di baris tabelnya sendiri ("GLB memisahkan
tiap segitiga") — tetapi angkanya tetap diterima sebagai temuan, bukan
sebagai gejala alat ukur. glTF memecah verteks di tiap jahitan UV, jadi tiap
jahitan terhitung sebagai lubang. Yang benar mengelas verteks menurut posisi
lebih dulu.

**Menjelaskan sebab sebuah angka tidak sama dengan memperbaikinya.** Selama
empat hari alat ini membawa satu angka yang sudah diketahui menyesatkan, dan
angka itu menenggelamkan dua cacat Takora yang nyata: sudut minimum 0,005°
dan sebaran texel 6,037×. Rinciannya: [TOPOLOGI.md](TOPOLOGI.md).

### Peringatan bukan gerbang

`tak_manifold` dilaporkan lengkap dengan angkanya tetapi tidak menggagalkan
build: GLB dengan tepi tak-manifold tetap dimuat three.js. Yang gagal adalah
boolean, solidify, dan cetak 3D — masalah nyata, tetapi bukan masalah *ini*.

### Berkas asal TIDAK PERNAH ditulisi

Sertifikat ditempel ke **salinan**. Alat yang menulis ulang berkas sumber
orang lain tanpa diminta adalah alat yang tidak akan dipercaya dua kali.

---

## GLB: dua hal yang membuat berkas rusak diam-diam

Penempelan sertifikat menulis ulang chunk JSON GLB. Dua hal yang harus benar,
dan keduanya gagal tanpa suara:

1. **Tiap chunk harus kelipatan 4 bita.**
2. **Padding JSON harus SPASI (0x20); padding biner harus NOL (0x00).**

Salah padding menghasilkan berkas yang lolos di satu pemuat dan ditolak di
pemuat lain — kegagalan yang muncul di mesin orang lain, bukan di mesin
sendiri. Uji `GLB dirakit dengan padding yang benar` memeriksa keempatnya,
termasuk bahwa isi binernya tidak berubah satu bita pun.

`extras` dipilih karena spesifikasi glTF **mewajibkan** pemuat mengabaikan
bidang yang tidak dikenalinya. GLB bersertifikat tetap dimuat three.js,
Babylon, Unity, dan Blender persis seperti sebelumnya — 1.127,5 KB →
1.129,7 KB, tumbuh 2,2 KB.

---

## Uji

15 uji, semua lulus. Yang membedakannya dari uji biasa: **tiap pembanding
dibuktikan MERAH dulu**, baru dibuktikan lulus.

> Pemeriksa yang tidak pernah merah bukan pemeriksa; ia hiasan. Uji yang
> hanya menguji jalur bahagia akan tetap hijau ketika pemeriksanya berhenti
> bekerja.

Termasuk lima uji yang membuktikan pelanggaran **menggagalkan dan menyebut
aturan yang mana** — bukan sekadar gagal.

---

## Cara memakainya

```bash
node contoh/periksa-takora.mjs [berkas.glb] [spek.json]
```

Atau lewat MCP:

```
rupa_periksa { spek: "spek/kora-3d.json", aset: "takora",
               tempel_ke: "keluaran/takora.glb" }
```

Keluar dengan kode 1 kalau ada aturan wajib yang gagal — jadi ia bisa langsung
jadi gerbang di CI.

---

## Menutup lingkarnya: perbaikan, dan yang SENGAJA tidak diperbaiki

`contoh/perbaiki-takora.mjs` menjalankan lingkar penuhnya — deteksi, perbaiki,
nilai ulang, ekspor bersertifikat:

```
DIPERBAIKI (3): tinggi, pivot_z, skala_diterapkan

TIDAK BISA DIPERBAIKI TRANSFORM (2): lebar, nisbah_lebar_tinggi
```

Dua yang tersisa sebenarnya **satu masalah**: proporsi bendanya. Nisbah
terukur 0,9975 sementara spek menuntut 1,1667 — benda ini nyaris **bulat**,
acuannya lebih lebar daripada tinggi.

Skala seragam tidak bisa memperbaikinya: menyetel tinggi ke 12 membuat lebar
jadi ~12; menyetel lebar ke 14 membuat tinggi jadi ~14. Yang salah
**proporsinya**, bukan ukurannya.

**Alat ini sengaja tidak memilih sendiri.** Menskalakan tak-seragam akan
membuat sertifikatnya hijau dan bendanya penyok — dan sertifikat yang bisa
dibuat hijau dengan merusak asetnya tidak bernilai apa pun. Itu keputusan
rancangan: lebarkan modelnya sampai 140:120, atau ubah speknya kalau bentuk
bulat memang yang diinginkan. Keduanya sah; keduanya milik manusia.

Pembagian itulah yang membuat laporannya berguna:

| bisa diperbaiki transform | satuan, pivot, skala node |
| **tidak bisa** | proporsi bendanya sendiri |

---

## Aturan yang saya sendiri tulis terlalu tumpul: `skala_diterapkan`

Saat perbaikan dijalankan, Blender menolak dengan 32 baris galat:

```
Cannot apply to a multi user: Object "Mesh_12", Mesh "Mesh_12", aborting
```

Tiga puluh dua gelembung Takora **berbagi satu datablock mesh**. Itu bukan
cacat — itu instansing, dan itu yang diinginkan: **1 mesh + 32 transform,
bukan 32 mesh**. Memecahnya demi "skala diterapkan" melipatgandakan memori
DAN draw call di runtime.

Jadi penolakan Blender benar, dan **aturan saya yang salah**. Objek instans
SAH membawa skala di node-nya; aturan "skala harus diterapkan" hanya masuk
akal untuk objek berdata **tunggal**.

Diperbaiki di tiga tempat sekaligus:

- `op_ukur` melaporkan `pemakai_data` per objek — instansing harus **terlihat**,
  bukan tersembunyi.
- `turunkanUkuran` menghitung `skala_diterapkan` hanya dari objek berdata
  tunggal, dan menambahkan `objek_instans` / `objek_tunggal`.
- `op_ekspor` menerapkan skala hanya pada yang tunggal, dan **melaporkan**
  berapa yang sengaja dilewati.

Perbaikan itu sendiri juga ditulis ulang: tanpa induk sementara, tanpa
`transform_apply` — verteks tiap datablock unik diskalakan sekali, letak tiap
objek diskalakan. Hasilnya identik secara matematis dengan menskalakan seluruh
adegan seragam, dan instansingnya utuh.

**Pelajarannya lebih besar daripada instansing:** sebuah aturan spek bisa
menuntut perbaikan yang MERUSAK aset. Aturan yang tidak pernah diuji terhadap
aset sungguhan adalah aturan yang belum diketahui benar-salahnya.

---

## Sudah, sesudah tulisan ini: turunan & b-rep masuk kosakata

Dua butir pertama daftar "yang belum" di bawah sudah selesai — `turunan.mjs`
memberi nama pada ukuran LOD, tabrakan, bake, dan b-rep, sehingga aturan
seperti `galat_lod_terburuk_persen <= 2` bisa ditulis. Dan pemeriksanya
langsung ketahuan **mengukur objek yang salah** dua kali:
[PERAKIT.md](PERAKIT.md).

## Yang belum

- Belum ada aturan **palet** — spek Kora menyebut delapan heks, dan
  memeriksanya menuntut membaca warna material, bukan namanya.
- Belum ada **regresi visual**: render acuan disimpan, geseran piksel di luar
  ambang menggagalkan build.
- Perakit belum punya **pintu MCP**; baru bisa dipanggil dari Node.
