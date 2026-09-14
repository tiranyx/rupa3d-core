# Draco — pintu masuk yang selama ini tertutup diam-diam

11 September 2026.

Sebuah studio 3D serba guna yang tidak bisa membuka separuh berkas di dunia
luar bukan serba guna. Draco adalah cara paling umum GLB dimampatkan — banyak
generator, marketplace, dan eksportir memakainya secara bawaan — dan sampai
hari ini Rupa3D **tidak bisa membacanya sama sekali**.

Yang lebih buruk daripada tidak bisa: ia tidak bilang.

---

## Apa yang terjadi sebelum ini

Satu bola 2.208 segitiga, diekspor **dua kali dari adegan yang sama**:
154,9 KB polos, 22,5 KB ber-Draco. Empat pembaca, empat perilaku berbeda:

```
kotakBatasGLB   2,000 x 2,000 x 2,000     ← BENAR
meshGLB         0 primitif · 0 dilewati   ← sukses palsu, kosong
topologiGLB     melempar "tidak ada primitif segitiga"
titikGLB        melempar TypeError telanjang soal `byteOffset`
```

**Tidak satu pun menyebut Draco.**

Dan yang paling berbahaya justru yang pertama. Accessor `min`/`max` tetap
ditulis di GLB Draco, jadi kotak batasnya **benar** — pemanggil yang memakai
pembaca itu mendapat jawaban yang masuk akal dan menyimpulkan berkasnya
terbaca, sementara geometrinya belum tersentuh sama sekali.

> Empat perilaku untuk satu sebab adalah tanda sebabnya ditangani di tempat
> yang salah.

### Dan ini pelanggaran spek, bukan kekurangan fitur

`extensionsRequired` berisi `KHR_draco_mesh_compression`. Spesifikasi glTF
menyatakan pembaca yang tidak mendukung ekstensi **wajib** harus **menolak**
berkasnya. Mengembalikan nol primitif bukan "belum mendukung" — itu menjawab
pertanyaan yang seharusnya ditolak.

### Sebabnya satu baris

Pada primitif Draco, accessor **tidak punya `bufferView`** — bidang itu
sengaja dikosongkan spesifikasinya, karena geometrinya ada di ekstensinya.

```js
if (!acc || acc.bufferView == null) return null;   // -> null
...
if (!pos) continue;                                 // -> dilewati diam-diam
```

`continue` yang polos. Itu saja.

---

## Kenapa dekoder Google, bukan ditulis sendiri

`png.mjs` di repo ini ditulis sendiri, dan itu keputusan yang benar: PNG
terspesifikasi lengkap, `zlib` sudah ada di Node, dekodernya ~150 baris.

Draco lain. Ia memampatkan **konektivitas** dengan edgebreaker dan
**atributnya** dengan prediksi paralelogram di atas pengkode entropi rANS.
Menulisnya ulang adalah proyek ribuan baris yang salahnya halus dan tidak
berbunyi — persis jenis kesalahan yang alat ini ada untuk mencegahnya.

Jadi yang dipakai dekoder resmi Google (WASM, sama dengan yang dipakai
three.js dan Blender). Dan **yang dibuktikan bukan dekodernya, melainkan
hasilnya.**

---

## Acuan silangnya: satu adegan, dua ekspor

Kedua berkas dibuat dari **satu adegan, dalam satu rantai**. Mengekspornya
dari dua adegan yang dibangun terpisah akan membuat setiap perbedaan bisa
berasal dari adegannya, dan ujinya berhenti membuktikan apa pun.

### Yang IDENTIK

```
verteks             4.512   =   4.512
indeks              6.624   =   6.624
segitiga            2.208   =   2.208
verteks terlas      1.106   =   1.106
tak-manifold            0   =       0
tepi batas              0   =       0
putaran salah           0   =       0
degenerasi              0   =       0
```

**Draco memampatkan geometri, bukan konektivitas.** Seluruh topologinya utuh.

### Yang BERGESER

```
selisih verteks terdekat, terhadap diagonal 3,4641
  maks   9,389e-5   =  0,0027 % diagonal
  rata   6,789e-5

sudut minimum   7,3604°  ->  7,3215°
```

Draco **lossy**: ia mengkuantisasi posisi. Pergeserannya kecil, dan
**bukan nol** — itu ditahan dua arah oleh ujinya. Uji yang menuntut kesamaan
persis akan merah pada berkas yang benar; uji yang tidak menuntut apa pun
tidak membuktikan dekodernya benar-benar dipakai.

Karena itu status Draco **ikut dilaporkan** di hasil ukur:

```
draco            true
draco_primitif   1
draco_catatan    "... Draco memampatkan dengan KUANTISASI: topologinya utuh,
                  tetapi posisi verteksnya bergeser. Angka geometris di bawah
                  menggambarkan berkas ini apa adanya, bukan aset sebelum
                  dimampatkan."
```

**Sertifikat atas berkas Draco menggambarkan versi terkuantisasi asetnya,
dan pembacanya berhak tahu itu tanpa harus bertanya.**

---

## Sinkron vs asinkron, dan kenapa tidak menghampiri diam-diam

Pembaca GLB di repo ini sinkron sejak awal; WASM menuntut satu `await` di
awal. Membuat seluruh rantai pembaca jadi asinkron akan menyentuh belasan
berkas untuk imbalan nol.

Jadi dekodernya **disiapkan lebih dulu** — persis pola `siap()` di
`fisika.mjs`:

```js
import { siapkanDraco } from './draco.mjs';
await siapkanDraco();      // sekali
// sesudah ini seluruh pembaca sinkron bekerja pada berkas Draco
```

Yang **tidak** dilakukan: menghampiri diam-diam kalau belum siap. Pembaca
yang menemukan primitif Draco tanpa dekoder siap **melempar**, dan pesannya
menyebut **dua** hal — apa yang ditemukan, dan apa yang harus dipanggil:

```
primitif ini terkompres KHR_draco_mesh_compression, dan dekodernya belum
disiapkan. Panggil `await siapkanDraco()` dari `draco.mjs` sekali sebelum
membaca berkasnya.
```

Pesan yang cuma bilang "gagal" memaksa pembacanya menebak, dan tebakan
pertama hampir selalu *"berkasnya rusak"* — padahal berkasnya sah dan alat
inilah yang belum siap.

**Lewat MCP tidak perlu memikirkannya sama sekali.** Empat tool yang membaca
berkas — `rupa_periksa`, `rupa_topologi`, `rupa_tekstur`, `rupa_proksi` —
menyiapkannya sendiri, karena sisi server bisa `await`.

---

## Hasilnya

```
                     sebelum        sesudah
titikGLB    polos    4.512          4.512
            draco    TypeError      4.512
meshGLB     polos    1 primitif     1 primitif
            draco    0 primitif     1 primitif
ukurGLB     polos    2.208 tri      2.208 tri
            draco    melempar       2.208 tri
```

Dan lewat spek yang sama, berkas Draco sekarang bersertifikat dengan angka
yang **identik** dengan kembaran tak-terkompresnya:

```
LULUS  bola polos   draco false   2.208 tri   0 gagal / 6 peringatan
LULUS  bola DRACO   draco true    2.208 tri   0 gagal / 6 peringatan
```

Sebelas model luar yang diuji kemarin diperiksa ulang: **verdiktnya tidak
satu pun berubah.**

---

## Kosakata spek yang lahir dari sini

```
geo_draco             benar/salah
geo_draco_primitif    berapa primitif terkompres
```

Kecil, tetapi ia yang membuat dua aturan yang berlawanan bisa ditulis sama
sekali: *"aset kirim HARUS terkompres"* untuk anggaran unduh, dan *"aset
sumber TIDAK BOLEH terkuantisasi"* untuk arsip yang masih akan dikerjakan.

---

## Uji

9 uji, dan dua di antaranya menjaga hal yang berlawanan:

| **tanpa dekoder** | keempat pembaca harus **menolak** sambil menyebut ekstensinya **dan** jalan keluarnya |
|---|---|
| **dengan dekoder** | keempatnya harus memberi angka yang **sama** dengan berkas polosnya |

Uji pertama hanya berarti kalau dijalankan **sebelum** dekodernya disiapkan.
Kalau urutan ujinya berubah, ia **dilewati sambil menyebut sebabnya** —
bukan lulus palsu.

Total repo: **241 uji · 0 gagal · 16 suite.**

---

## Yang belum

- **`.gltf` terpisah** dengan `.bin` di sebelahnya — baru `.glb` biner.
- **Awan titik Draco** (`POINT_CLOUD`) ditolak dengan menyebut sebabnya;
  menghampirinya sebagai mesh akan menghasilkan topologi yang dikarang.
- **Menulis** Draco. Yang ada baru membaca; mengekspornya masih lewat
  Blender (`rupa_ekspor { draco: true }`).
- **Meshopt** (`EXT_meshopt_compression`) — ekstensi kompresi kedua yang
  makin sering dipakai, dan belum disentuh sama sekali.
