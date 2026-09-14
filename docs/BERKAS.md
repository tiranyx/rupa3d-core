# Menilai berkas orang lain — dan tiga hal yang Blender tidak bisa lihat

10 September 2026.

Pertanyaan yang paling sering ditanyakan orang tentang aset 3D cuma satu:

> Ini berkas dari generator. Bagus tidak?

Sampai hari ini Rupa3D tidak bisa menjawabnya. `rupa_periksa` mengukur
**adegan Blender**, jadi menjawab pertanyaan tentang sebuah *berkas* menuntut
menyalakan Blender, mengimpor, lalu mengukur sesuatu yang **bukan berkas itu**.

Sekarang:

```
rupa_periksa { berkas: "apa-pun.glb", spek: "spek/aset-generatif.json" }
```

**967 ms untuk 35 aturan. Tanpa Blender.** Jalur adegan menuntut tiga panggilan
Blender, sekitar sepuluh detik.

---

## Kenapa ini bukan sekadar jalan pintas yang lebih cepat

Repo ini sudah pernah membayar mahal untuk mengukur benda yang salah:
sertifikat yang diukur dari **adegan** lalu ditempel ke berkas **ekspor**
membawa `tak_manifold 30790` — angka yang menggelembung 85× — berbulan-bulan.

> **Sertifikat menggambarkan berkas yang ditempelinya, jadi angkanya harus
> datang dari berkas itu.**

Dan bedanya bukan cuma ketepatan. Terukur pada `takora.glb`, aset yang sama,
dua jalan:

| | lewat Blender | dari berkas |
|---|---|---|
| verteks lepas | **0** | **4** |
| tak-manifold | **30.790** | **0** |
| n-gon | **0** | *tidak bisa diukur* |

Ketiganya menyesatkan lewat Blender, dan **ketiganya menyesatkan ke arah
"bersih"**.

### 1. Blender MEMBUANG verteks lepas saat impor

Verteks yang ada di accessor tetapi tidak dirujuk satu indeks pun tetap
dibayar penuh di VRAM dan tidak menggambar apa-apa. Importir glTF Blender
membuangnya, jadi memeriksa lewat Blender akan **selalu** melaporkan nol —
bukan karena berkasnya bersih, melainkan karena Blender tidak pernah
melihatnya.

**Nol yang datang dari kebutaan terbaca persis seperti nol yang datang dari
kebersihan.** Itu dikunci sebagai uji di `test.mjs`, lengkap dengan kalimat
bahwa kalau Blender suatu hari melaporkannya, komentarnya yang salah — bukan
ujinya.

### 2. `tak_manifold` 30.790 vs 0

glTF memecah verteks di tiap jahitan UV. Menghitung manifold pada indeks
mentah membuat **setiap jahitan terlihat sebagai lubang**. Sisi berkas melas
menurut posisi lebih dulu.

### 3. `ngon 0` dari Blender adalah kabar baik palsu

Blender melaporkan nol n-gon untuk **GLB apa pun** — karena impornya sudah
tersegitiga, bukan karena sumbernya bersih. Sisi berkas melaporkan `null`,
yang **menggagalkan** aturannya, dan menunjuk ke `rupa_topologi_sumber` untuk
pertanyaan yang sebenarnya.

---

## Jebakan yang membuat seluruh modul ini bisa salah diam-diam

**Blender Z-atas. glTF Y-atas.**

`pivot_z` — tinggi dasar benda, ukuran paling sering dipakai di spek — ada di
sumbu **kedua** sebuah GLB, bukan ketiga.

```
Takora, Blender  : pivot_z = -1,4514
GLB min[1]       =          -1,4514   ✓
GLB min[2]       =          -1,4804   ← beda 2%, ukuran sama, sumbu salah
```

Beda dua persen, satuan yang sama, dan **tidak ada satu pun gejala**. Karena
itu sumbu atasnya **dinyatakan**, dilaporkan bersama hasilnya, dan bisa
ditimpa — bukan diasumsikan.

### Dan satu bidang hantu yang jadi berguna

`spek/kora-3d.json` membawa `"sumbu_atas": "Z"` sejak 6 September, dan bidang
itu **tidak pernah dibaca di satu tempat pun**. Bidang hantu kedua di repo ini,
sesudah `ukuran`.

Sekarang ia dibaca — dan ia justru bidang yang menentukan di sini.

---

## Silang terhadap Blender, bidang demi bidang

Dua implementasi yang mengukur benda yang sama harus **diikat**, kalau tidak
keduanya bergeser sendiri-sendiri dan tak satu pun tahu. Repo ini sudah sekali
terbakar oleh dua berkas yang diam-diam berbeda niat.

Tiga aset dari pipeline yang **berbeda-beda** — prosedural Blender, b-rep
OCCT, dan Blender+bake:

```
segitiga_total       sama        pivot_z               sama
objek_mesh           sama        nisbah_lebar_tinggi   sama
lebar · dalam        sama        skala_diterapkan      sama
tinggi               sama        objek_instans         sama
simpul_lepas         sama        objek_tunggal         sama
```

**Sebelas dari tiga belas bidang cocok persis.** Dua yang tidak — `ngon` dan
`tak_manifold` — adalah dua dari tiga kebutaan di atas.

Silangnya sekarang **uji permanen**, dan bendanya dibangun di dalam ujinya
sendiri. Uji yang bergantung pada aset repo akan merah karena alasan yang
salah begitu asetnya berubah.

---

## `skala_diterapkan` diukur dari skala DUNIA

Node berskala `[1,1,1]` di bawah induk berskala `[40,40,40]` **bukan** node
yang skalanya sudah diterapkan. Membaca `node.scale` mentah akan melaporkannya
bersih.

Diukur dari panjang vektor basis matriks dunianya, jadi ia benar juga untuk
node yang **diputar** — dan itu yang membedakannya dari mengalikan angka skala
begitu saja.

Objek **instans** tetap dikecualikan, dengan alasan yang sama seperti dulu:
32 gelembung yang berbagi satu mesh **sah** membawa skala di node-nya, dan
menerapkannya justru memecah instansing.

---

## `spek/aset-generatif.json` — 25 aturan yang bisa dijawab BERKASNYA sendiri

Spek yang ada sebelumnya tidak cocok untuk ini. `kora-3d-penuh` memuat enam
aturan **pipeline** — galat LOD, proksi tabrakan — dan sebuah GLB tidak
mengangkut jawabannya. Aturan yang tidak bisa dinilai **menggagalkan**, jadi
spek itu akan menolak setiap berkas dari luar tanpa memberi tahu apa pun yang
berguna.

> **Spek punya LINGKUP.** Aturan yang menuntut riwayat pipeline tidak boleh
> ada di spek yang ditujukan untuk berkas yang datang dari luar.

`aset-generatif` mewarisi `topologi-siap` + `tekstur-siap`, lalu **menimpa**
tiga aturan tekstur dari wajib jadi peringatan — aset bergeometri saja
sepenuhnya sah — dan menambahkan empat yang cuma bisa dijawab dari berkasnya:

| `skala_diterapkan` | keluhan produksi nomor satu untuk aset generatif |
|---|---|
| `simpul_lepas` | **yang Blender tidak bisa lihat sama sekali** |
| `objek_mesh >= 1` | ekspor yang gagal separuh jalan tetap menulis GLB yang sah |
| `tinggi` antara 0,001 dan 1000 | bukan ukuran yang benar — ukuran yang **masuk akal**. Di luar itu hampir selalu salah satuan |

### Terukur pada enam aset repo ini

```
LULUS  batu-batu.glb     205 ms   0 gagal ·  2 peringatan
GAGAL  takora.glb        741 ms   2 gagal · 12 peringatan   ← putaran salah, simpul lepas
GAGAL  takora-hidup.glb  838 ms   3 gagal · 12 peringatan   ← + skala belum diterapkan
LULUS  flange.glb        271 ms   0 gagal ·  9 peringatan
LULUS  rumah.glb           7 ms   0 gagal ·  9 peringatan
GAGAL  ikon.glb          157 ms   1 gagal ·  9 peringatan   ← segitiga degenerasi
```

Keduanya penting: ia **merah** pada aset yang memang cacat, dan **hijau** pada
aset yang bersih. Pemeriksa yang cuma pernah hijau bukan pemeriksa.

Dan dua yang lulus dengan nol gagal adalah keluaran **b-rep** — flange dan
rumah. Itu bukan kebetulan; kernel b-rep menghasilkan mesh dari permukaan
analitik yang topologinya sudah terdefinisi.

---

## Uji

15 uji dengan GLB yang **disusun sendiri di dalam ujinya**, bukan diambil dari
repo — supaya jawabannya diketahui sebelum alatnya dijalankan. Penulis GLB-nya
ditulis apa adanya, bukan lewat pustaka: yang diuji justru pembacaan struktur
glTF-nya, dan penulis yang memakai pembaca yang sama akan menyembunyikan
kesalahan yang sama.

```
kotak 1x2x3          12 segitiga, 8 verteks, ukuran persis
sumbu Y vs Z         tinggi 2 lawan 3 pada berkas yang SAMA
induk berskala 40    anak node.scale [1,1,1] — harus tetap tertangkap
4 verteks tambahan   simpul_lepas = 4, segitiga tetap 12
dua node satu mesh   instans 2, tunggal 0
```

Plus tiga uji silang terhadap Blender di `test.mjs`, dan empat lewat pintu MCP
di `test-mcp.mjs`.

---

## Yang belum

- **Draco** — GLB terkompres Draco belum bisa dibaca sisi berkas; geometrinya
  terkunci di balik dekoder yang belum ada.
- **`.gltf` terpisah** — baru `.glb` biner. Berkas `.gltf` dengan `.bin` dan
  tekstur di sebelahnya belum ditangani.
- **Sertifikat berantai** — kalau sebuah GLB sudah membawa sertifikat, yang
  baru menimpanya. Menyimpan riwayatnya menuntut keputusan tentang REVISI, dan
  revisi belum ada.
