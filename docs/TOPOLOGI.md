# Topologi — celah terbesar, dan angka lama yang menggelembung 85×

10 September 2026.

Sampai hari ini Rupa3D mengukur **geometri**: tinggi, volume, pivot, galat
LOD, tembus tabrakan. Semuanya tentang **bentuk**. Tidak satu pun tentang
bagaimana bentuk itu **dibangun**.

Dan justru di situ aset generatif gagal. Laporan produksi 2026 menyebut
retopology sebagai hambatan utama — **dua sampai empat jam kerja manual per
aset** — karena mesh yang dihasilkan tidak punya struktur yang bisa
dideformasi, di-UV, atau di-subdivide.

```
rupa_topologi { berkas: "apa-pun.glb" }
```

Bekerja pada berkas **dari mana pun**, termasuk keluaran generator AI, tanpa
Blender.

---

## Koreksi: 30.790 → 360

Alat versi lama melaporkan Takora punya **30.790 tepi tak-manifold**. Yang
sebenarnya **360**. Menggelembung **85×**.

Sebabnya: **glTF memecah verteks** di tiap jahitan UV, batas normal, dan
batas material. Satu titik geometris jadi dua, tiga, atau enam verteks.
Menghitung manifold pada indeks mentah berarti **setiap jahitan terlihat
sebagai lubang**.

Di sini verteksnya **dilas menurut posisi** lebih dulu, dan **kedua** angkanya
dilaporkan karena artinya berbeda:

| mentah | ongkos verteks di GPU |
|---|---|
| **terlas** | **kesehatan geometrinya** |

Takora: 36.403 mentah → 10.081 terlas, nisbah pecah **3,611×**.

Toleransi lasnya **nisbi terhadap diagonal**, bukan mutlak — ambang mutlak
akan melas seluruh model milimeter jadi satu titik, dan tidak melas apa pun
pada model berskala kilometer.

---

## Apa yang ditemukan pada aset sungguhan

| | flange (OCCT b-rep) | Takora (Blender) |
|---|---|---|
| tak-manifold | **0** | 360 |
| tepi batas | **0** | 1.210 |
| putaran salah | **0** | 62 |
| degenerasi | **0** | 0 |
| sliver (<1°) | **0** | 28 |
| sudut min terkecil | 1,1993° | **0,005°** |
| tertutup | **1/1** | 19/32 |
| sebaran texel | — (tanpa UV) | **6,037×** |

**Keluaran b-rep bertopologi bersih tanpa dikerjakan.** Itu bukan kebetulan:
kernel b-rep menghasilkan mesh dari permukaan analitik yang topologinya sudah
terdefinisi, bukan dari rekonstruksi.

Dua temuan pada Takora yang selama ini **tenggelam di balik angka 30.790**:

- **sudut minimum 0,005°** — segitiga yang praktis adalah garis. Normalnya
  tidak stabil, raycast meleset, penyelesai fisika menghasilkan gaya liar.
- **sebaran texel 6,037×** — sebagian model **6× lebih buram** daripada bagian
  lain pada tekstur yang **sama**. Ini tidak terlihat sampai teksturnya
  dipasang, dan tidak ada di daftar cacat mana pun sebelumnya.

---

## Yang TIDAK bisa diukur dari GLB — dan itu bukan kekurangan alat ini

**glTF selalu tersegitiga.** Quad, n-gon, dan edge loop sudah hilang sebelum
berkasnya ditulis.

> Alat mana pun yang mengklaim menilai **quad-dominance dari sebuah GLB**
> sedang mengarang.

Yang tidak bisa diukur, dan **dilaporkan apa adanya** di setiap keluaran:

- nisbah quad / n-gon
- pola edge loop
- kerapatan poles (valensi verteks) pada mesh quad sumbernya

Ketiganya harus diukur **di sumbernya** (bmesh Blender, atau b-rep),
dan itu berkas terpisah yang belum ada.

Alat yang diam soal batasnya membuat pembacanya menyimpulkan lebih banyak
daripada yang sebenarnya diukur.

---

## Pemeriksa yang tidak ditangkap pemeriksa lain

**Putaran terbalik.** Dua segitiga berbagi tepi, yang kedua dibalik. Tepinya
tetap dipakai **tepat dua muka** — jadi pemeriksa manifold bilang sehat. Yang
terlihat di render: satu sisi hitam. Diperiksa lewat arah tepi: pada mesh yang
konsisten, tiap tepi dilalui sekali maju dan sekali mundur.

**Segitiga lipat.** Tiga verteks berbeda **indeks** tetapi dua di antaranya di
posisi yang sama: luasnya bukan nol menurut indeks mentah, tetapi setelah
dilas ia bukan lagi segitiga.

**Mesh tanpa UV melaporkan `null`, bukan `0`.** Nol akan meloloskan aturan
`texel_sebaran <= 3` pada mesh yang sama sekali tidak punya UV — yaitu kasus
yang justru paling perlu ditolak.

> **Koreksi 10 Sep — kalimat di atas menyebut niatnya, dan selama ini niat
> itu tidak berlaku.** `nilaiAturan` di `spek.mjs` tidak pernah membedakan
> `null` dari angka, dan `null <= 3` di JavaScript adalah `true`. Jadi
> `topo_texel_sebaran` **lulus** pada flange dan rumah — dua mesh yang sama
> sekali tidak punya UV. Sudah ditambal dan dikunci empat uji; ceritanya di
> [SERTIFIKAT.md](SERTIFIKAT.md). Kalimat aslinya dibiarkan utuh di atas,
> karena kesalahannya ada pada kepercayaan bahwa menuliskan konvensi sama
> dengan memberlakukannya.

---

## Spek

`spek/topologi-siap.json` — 9 aturan, tiap satu menyebut **apa yang rusak**
kalau dilanggar, bukan cuma angkanya:

| wajib | `topo_tak_manifold` · `topo_putaran_salah` · `topo_degenerasi` |
|---|---|
| peringatan | `topo_sudut_min` · `topo_sliver` · `topo_nisbah_pecah` · `topo_texel_sebaran` · `topo_uv_di_luar` · `topo_uv_tumpang_persen` |

`spek/kora-3d-lengkap.json` mewarisi **bentuk + pipeline + topologi** =
23 aturan. Itu spek terlengkap yang bisa ditulis alat ini hari ini.

Beberapa sengaja **peringatan, bukan gerbang**: mesh hasil tesselasi kurva
hampir selalu punya beberapa sliver, dan UV di luar 0–1 sah untuk tekstur
berulang tetapi salah untuk atlas. Niat yang memutuskan, bukan alatnya.

---

## Uji

23 uji, semuanya terhadap bentuk yang jawabannya **bisa dihitung di kepala**:

```
tetrahedron            4 muka, 6 tepi, tertutup
segitiga tunggal       3 tepi batas
3 segitiga 1 tepi      1 tepi tak-manifold
segitiga sama sisi     sudut min 60°
dua segitiga tertumpuk lapis 2, 100% texel bertindih
dua segitiga bersebelahan  lapis 1 — tepi bersama BUKAN tumpang-tindih
```

Kalau alatnya menjawab lain, **alatnya** yang salah — bukan acuannya. Itu
penting justru karena kesalahan yang dikoreksi berkas ini: acuan yang
diturunkan dari alat lain akan mewarisi kesalahan alat itu.

---

## Tumpang-tindih pulau UV

Dua segitiga yang menempati ruang UV yang sama berarti bake salah satunya
**menimpa** yang lain. Cacat yang tidak terlihat sampai teksturnya dipanggang
— dan saat itu yang terlihat cuma "bake-nya aneh di sebelah sini".

**Yang membuat pengukurnya berguna sama sekali: mencuplik di PUSAT texel.**
Segitiga bertetangga **berbagi tepi**; rasterisasi yang menghitung tiap texel
tersentuh akan menandai setiap tepi bersama sebagai tumpang-tindih — ribuan
temuan palsu pada mesh mana pun. Titik pusat texel hanya bisa berada di dalam
satu segitiga, kecuali segitiganya benar-benar bertindih.

Dibuktikan pada dua aset yang dibuat dengan cara berbeda:

```
batu (di-UV-unwrap smart_project)    0 %   · lapis maks 1
Takora (tidak pernah di-unwrap)    100 %   · lapis maks 144
```

**144 segitiga menumpuk di texel yang sama.** Itu menjelaskan sesuatu yang
tercatat berhari-hari tanpa sebab: bake AO Takora hanya mencakup 28,63 % UV.
**UV-nya memang tidak bisa dipakai memanggang.**

Ini **peringatan, bukan gerbang**: UV bercermin pada benda simetris dan
tekstur berulang keduanya menumpuk UV dengan **sengaja dan benar**. Yang
memutuskan niatnya, bukan alatnya.

Batasnya disebut: resolusinya terbatas, jadi tumpang-tindih yang lebih sempit
daripada satu texel bisa terlewat. `resolusi` ikut dilaporkan supaya angkanya
bisa dibaca dengan benar.

---

## Topologi SUMBER — dan kenapa ia berkas terpisah

`rupa_topologi_sumber` mengukur yang **tidak ada** di GLB: quad, n-gon,
valensi verteks, **kutub**, **edge loop**, dan quad **tak-sebidang**. Ia
membaca mesh di dalam Blender lewat bmesh, karena di sanalah keenamnya masih
ada.

Acuannya **diturunkan**, bukan disalin dari keluaran alatnya. Torus 48×12:

```
muka    48 × 12                        = 576 quad
verteks 48 × 12                        = 576
tepi    576 × 4 / 2                    = 1152
gelang  12 arah-mayor + 48 arah-minor  = 60, SEMUA tertutup
silang  12 × 48 + 48 × 12              = 1152   ✓ cocok dengan tepi
```

Dua jalan aritmetika yang berbeda sampai ke angka yang sama. Kalau tidak,
turunannya yang salah — bukan alatnya.

**Dua hal yang paling mudah salah, dan keduanya diuji:**

- **Verteks BATAS dikeluarkan dari analisis kutub.** Valensi ≠ 4 di tepi
  terbuka itu **wajar**. Sebuah bidang datar 5×5 punya seluruh 20 verteks
  tepinya bervalensi 2 atau 3; menghitungnya sebagai kutub akan membuat tiap
  mesh terbuka terlihat rusak.
- **Edge loop menerus lewat tepi yang TIDAK berbagi muka** dengan tepi
  asalnya, dan hanya di verteks bervalensi 4. Titik **berhentinya** yang
  berarti: loop yang putus di daerah deformasi — siku, lutut, kelopak —
  adalah persis cacat yang membuat lipatannya salah.

Bidang 5×5 memberi **28 gelang**: 20 tepi batas berdiri sendiri, plus 8
gelang dalam (4 baris + 4 kolom) sepanjang 5. Angka itu tidak diperkirakan
lebih dulu — ia diturunkan sesudahnya, dan cocok.

### Batas yang disebut, bukan didiamkan

**Memuat GLB ke Blender TIDAK memulihkan quad-nya.** Terukur: 2.976 segitiga
masuk, 2.976 segitiga keluar, nol quad.

Jadi `quad_persen 0` punya **dua arti** yang alat ini tidak bisa bedakan —
mesh memang bertopologi segitiga, atau quad-nya musnah sebelum berkasnya
dibaca. Keluarannya membawa peringatan yang menyatakan itu. Tanpa peringatan
itu, pembacanya menyimpulkan asetnya rusak.

---

## Yang belum
- **Kesinambungan edge loop** di area deformasi (siku, lutut, kelopak).
- **Kerapatan texel terhadap ukuran tekstur sebenarnya** — sekarang yang
  diukur baru sebarannya, bukan piksel-per-meternya.
