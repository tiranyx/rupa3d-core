# Adegan & runtime — sisi keluaran, dan dua bug yang DIAM

10 September 2026.

Sampai kemarin Rupa3D bisa membangun, mengukur, dan mensertifikasi — tetapi
hasilnya berhenti sebagai berkas. Sekarang ia jadi halaman yang bisa dibuka
siapa pun: orbit, klik-pilih, dan tiap objek membawa angkanya.

```
rupa_adegan_baru  aset  node  cahaya  kamera  lingkungan  lihat  terbit
```

Terbukti lewat stdio MCP sungguhan — 9/9 langkah menyusun satu adegan lengkap
dari nol, termasuk **membaca kotak batas aset lalu memakai angka itu untuk
memilih skala**, bukan menebaknya:

```
ok  daftar aset flange
    kotak batas 140.0 x 140.0 x 12.0 · diagonal 198.34
ok  flange (skala 0.001 dari kotak batas)
    flange   0.140 x 0.140 x 0.012
```

---

## Dua bug, satu bentuk: alat yang DIAM

Keduanya lolos setiap uji yang ada dan hanya terlihat karena halamannya
**dibuka di browser sungguhan**. Bukan angka yang salah — keheningan di
tempat yang seharusnya berbunyi.

### Bug 1 — fallback diam pada masukan tak sah

| | |
|---|---|
| **indikator** | benda tidak terlihat, padahal panel melaporkan geometrinya termuat (44.814 segitiga) |
| **parameter** | helper `v3(a, bawaan)` mengembalikan bawaan untuk apa pun yang bukan larik-3 |
| **faktor-X** | skema MCP-nya sendiri mengizinkan bentuk (`z.union([number, v3])`) yang helper-nya tolak diam-diam |

`skala: 0.001` jadi `[1, 1, 1]`. Flange 140 **mm** terbit sebagai benda 140
**meter**. Kameranya berada di dalam benda itu, jadi yang terlihat cuma
lantai — dan tidak ada satu pun galat yang menunjuk sebabnya.

Diperbaiki: skalar disiarkan ke tiga sumbu bila memang diizinkan, sisanya
**dilempar**, dan pesannya menyebut bidang mana yang cacat.

### Bug 2 — pemeriksa yang bisu justru saat paling dibutuhkan

| | |
|---|---|
| **indikator** | pemeriksa mengembalikan 0 temuan pada adegan yang jelas rusak |
| **parameter** | statistik berbasis MEDIAN pada populasi < 2 |
| **faktor-X** | lubangnya persis di keadaan yang paling sering terjadi saat sesuatu sedang DISUSUN |

Pemeriksa skala melihat angka 140 meter itu dan **diam**: dengan satu node
`properti`, tidak ada median untuk dibandingkan, jadi ia mengembalikan
`median: null · timpang 0`.

Adegan yang sedang disusun hampir selalu berisi **satu benda di atas satu
lantai**. Pemeriksanya buta persis di jam-jam ia paling dibutuhkan.

Diperbaiki dengan pemeriksa **mutlak** yang tidak butuh populasi: latar
memberi acuan, dan properti yang lebih besar daripada lantainya sendiri
hampir selalu salah skala. Alasan median dilewati sekarang **dikatakan** di
`catatan`, bukan disembunyikan di balik angka nol.

> **Hukum umum:** setiap statistik pembanding — median, rata-rata, z-score,
> persentil — punya populasi minimum, dan di bawah itu ia mengembalikan
> sesuatu yang **terlihat seperti "aman"**. Selalu pasangkan dengan pemeriksa
> mutlak yang bekerja pada n=1, dan buat keheningannya **terbaca**:
> kembalikan alasan, bukan nol.

---

## Temuan ketiga: aturan saya sendiri terlalu tumpul, lagi

Pemeriksa skala yang baru langsung menandai **lantai 32,66× median**. Angkanya
benar; kesimpulannya salah — lantai 40 m memang sengaja besar.

Godaannya menaikkan ambang sampai lantai lolos. Itu berarti melonggarkan
aturan supaya adegan sendiri lulus — persis kesalahan `skala_diterapkan` yang
dulu menuntut memecah instansing ([SERTIFIKAT.md](SERTIFIKAT.md)).

Yang benar: lantai secara **makna** bukan properti. Node sekarang punya
`peran`, dan ia dinyatakan, bukan ditebak dari ukurannya:

| `properti` | benda di panggung — ikut dinilai skalanya |
|---|---|
| `latar` | lantai, dinding, langit, kubah — dikecualikan, dan jadi acuan mutlak |
| `pandu` | grid, sumbu, penanda |

Ambangnya tetap 25×, dan satu uji menyatakan bahwa ia **tidak boleh**
dinaikkan untuk meloloskan lantai.

---

## Kendala yang membentuk rancangan runtime-nya

**Halaman terbit tidak boleh mengambil apa pun dari jaringan.** `loader.load()`
memakai `fetch()` di dalam, jadi ia gagal sebagai **layar kosong** tanpa pesan.
Aset ditanam base64 dan `loader.parse()` dipanggil langsung: nol permintaan
sesudah skrip CDN termuat.

Ongkosnya diukur, bukan diabaikan: base64 membengkakkan bita **×1,3333**
(1,19 MB → 1,59 MB). Anggaran 16 MB diperiksa **sebelum** menulis, dengan
menyebut aset penyumbang terbesar dan menyarankan LOD atau Draco.

**Tanpa `<meta charset>` server statis mana pun menyajikannya sebagai
windows-1252**, dan tiap em-dash jadi `â€"`. Terukur di halaman pertama, dan
tidak terlihat sampai judulnya dibaca. Mode `mandiri` membawa dokumen penuh;
`mandiri: false` menghasilkan potongan untuk penerbit yang punya kerangkanya
sendiri.

**`<title>` dipindahkan ke `<head>`**, tidak dibiarkan di badan. Browser
memang memulihkannya, tetapi bergantung pada pemulihan parser berarti
hasilnya berbeda antar-pembaca berkas — dan berkas ini juga dibaca pengindeks
dan pratinjau yang tidak sekedermawan browser.

**Aset yang tidak dipakai node mana pun tidak ditanam.** Menanamnya menambah
megabita untuk sesuatu yang tidak pernah dirender, dan itu tidak akan terlihat
oleh siapa pun.

---

## Pilihan render

| | |
|---|---|
| tone mapping | ACES filmic, keluaran sRGB |
| lingkungan | `RoomEnvironment` lewat PMREM — pantulan masuk akal tanpa satu berkas HDR pun, dan HDR memang tidak bisa diambil di sini |
| latar | gradien dua warna sebagai tekstur 2×256, bukan shader — tidak menambah program GLSL yang harus dikompilasi saat halaman pertama dibuka |
| bayangan | PCFSoft, 2048², `normalBias` 0,02 |
| huruf | IBM Plex Sans + Mono — keluarga **instrumentasi**, dirancang untuk papan ukur dan dokumentasi teknik |

Halaman ini **sengaja satu tema**. Viewer 3D yang chrome-nya ikut tema terang
melawan render-nya sendiri: panel putih di sebelah bayangan lembut membuat
mata menilai paparan gambar dari panelnya, bukan dari adegannya.

---

## Cara memakainya

```bash
node contoh/adegan-takora.mjs
```

Atau lewat MCP — dan urutan ini yang disarankan, karena langkah `lihat`
adalah tempat kesalahan skala tertangkap:

```
rupa_adegan_baru   { ruang: "panggung", nama: "Meja Kerja" }
rupa_adegan_aset   { kunci: "flange", berkas: "...flange.glb" }   → kotak batas
rupa_adegan_node   { id: "flange", jenis: "aset", aset: "flange", skala: 0.001 }
rupa_adegan_lihat  { }                                            ← periksa di sini
rupa_adegan_terbit { berkas: "...meja.html" }
```

---

## Yang belum

- **Gizmo tarik-pakai-mouse** — ini bagian tersulit Spline, dan sengaja
  ditaruh sesudah formatnya mantap.
- **Fisika Rapier** dari proksi tabrakan yang sudah dibuat A2.
- **Animasi** belum bisa keluar ke web sama sekali (F5).
- **Anggaran waktu-jalan** sebagai angka yang dijaga: draw call, tekstur,
  segitiga per bingkai.
- Runtime belum membaca **LOD** yang sudah bisa dibuat pipeline-nya.
