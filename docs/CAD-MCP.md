# CAD lewat MCP — dan penjelasan masuk akal yang saya karang sendiri

7 September 2026.

Sepuluh tool `rupa_cad_*` menutup satu-satunya kemampuan Rupa3D yang selama
ini tidak punya pintu: kernel b-rep. Agen lain sekarang bisa membangun,
memotong, memfillet, mengukur, dan mengekspor bentuk presisi — tanpa menulis
satu baris JavaScript.

```
rupa_cad_status   rupa_cad_bentuk   rupa_cad_boolean  rupa_cad_tepi    rupa_cad_fillet
rupa_cad_ubah     rupa_cad_ukur     rupa_cad_daftar   rupa_cad_ekspor  rupa_cad_impor
```

Terbukti hidup lewat stdio MCP sungguhan, bukan `node --check`:

```
server : rupa3d 1.0.0
tool   : 21 — 10 di antaranya CAD

kotak    volume 19199.999999999996 · 12 tepi · sah true
silinder volume 8042.4772 | analitik 8042.4772
potong   volume 16787.2568 | harusnya 16787.2568
tepi     15 tepi — {"Z":5,"Y":4,"X":4,"lengkung":2}
fillet Z 5 tepi · 16787.26 -> 16622.44 · sah true

r=20     DITOLAK · Fillet operation failed
bentuk?  DITOLAK · bentuk tidak ada: tidakada

.step     35484 bita · eksak=true
.glb      20032 bita · eksak=false · galat 0.0182% · 524 segitiga
STEP↺     selisih 3.64e-11
```

---

## Temuan 1: penjelasan yang masuk akal, dan tidak pernah diukur

`contoh/flange-cad.mjs` membawa komentar ini sejak kemarin:

> *Fillet SELURUH tepi sekaligus sering ditolak kernel: pada flange ini tepi
> lubang baut berjarak lebih dekat satu sama lain daripada 2× radius, jadi
> permukaan filletnya akan saling memotong.*

Kedengarannya masuk akal. Ia juga masuk ke `BACKLOG.md` sebagai utang
geometri: *"Fillet semua-tepi ditolak kernel pada flange — butuh B6."*

**Tidak satu pun angkanya pernah diukur.** Jarak antar-lubang tidak pernah
dihitung, 2× radius tidak pernah dibandingkan dengan apa pun. Kalimat itu
dikarang untuk menjelaskan kegagalan, lalu diperlakukan sebagai temuan.

Sebab sebenarnya, dari `modifierFns.d.ts`:

```ts
filletShape(shape, edges, radius)
```

**Tiga argumen.** Saya memanggil `filletShape(padat, R_FILLET)` — radius masuk
ke slot `edges`, `radius` jadi `undefined`, dan kernel menjawab dengan pesan
generik "Fillet operation failed".

Yang membongkarnya satu percobaan sepuluh detik: **panggil fillet pada kotak
10×20×30.** Geometri yang tidak mungkin punya masalah jarak antar-lubang. Ia
gagal juga — di setiap radius. Kalau penjelasan saya benar, kotak itu harus
lolos.

Dengan urutan yang benar, flange-nya fillet tanpa keluhan:

```
fillet 2 mm diterapkan ke SEMUA 24 tepi — 56 tepi sesudahnya
volume 142490,465 mm³   (dari 143954,059 — terbuang 1463,593 mm³, 1,0167%)
```

### indikator · parameter · faktor-X

| | |
|---|---|
| **indikator** | pesan galat generik pada geometri yang sederhana |
| **parameter** | urutan argumen |
| **faktor-X** | "kernel menolak" terdengar seperti keterangan **sebab**, padahal ia cuma keterangan **gejala** |

> Penjelasan yang masuk akal lebih berbahaya daripada tidak ada penjelasan,
> karena ia **menghentikan orang mencari.** "Belum tahu kenapa" akan tetap
> mengganggu sampai diselidiki; "kernel menolak karena filletnya bertabrakan"
> terasa selesai — dan bertahan sehari penuh di backlog.

Uji tandingannya sekarang permanen: kalau fillet gagal pada kotak polos, yang
salah pemanggilnya, bukan geometrinya.

---

## Temuan 2: `ok: true` bukan bukti bentuknya sah

Sesudah urutan argumennya benar, muncul yang lebih serius. Kotak 10×20×30,
volume 6000 mm³, sisi terkecil 10 sehingga batas fillet teoretisnya tepat 5:

| radius | kernel | volume | Δ | `isShapeValid` | segitiga |
|---|---|---|---|---|---|
| 4,00 | ok | 5261,64 | −738,36 | `true` | 1380 |
| 4,99 | ok | 4883,94 | −1116,06 | `true` | 1380 |
| **5,00** | **GAGAL bersih** | — | — | — | — |
| **5,001** | **ok** | **7971,72** | **+1971,72** | **`false`** | 964 |
| 6,00 | ok | 7602,93 | +1602,93 | `false` | 1006 |
| 8,00 | ok | 7822,91 | +1822,91 | `false` | 1272 |

**Fillet yang MENAMBAH 1971 mm³ material ke sebuah kotak.** Itu mustahil —
fillet hanya membuang di tepi cembung. Kernelnya tetap bilang `ok`.

Alat yang meneruskan hasil itu ke STEP akan mengirim berkas rusak ke bengkel
CNC, dan rusaknya baru ketahuan di mesin.

Jadi tiap operasi lewat **dua pemeriksa yang saling bebas**, dan yang gagal
tidak pernah sempat tersimpan:

1. **`isShapeValid`** — pemeriksa topologi OCCT sendiri
2. **arah volume** — fillet/chamfer/potong wajib mengurangi, gabung wajib menambah

Dua, bukan satu, karena keduanya menangkap kelas yang berbeda: `isShapeValid`
menangkap topologi rusak, arah volume menangkap boolean yang gagal separuh dan
mengembalikan salah satu operand utuh — bentuk yang **sah** tetapi salah.

### Fillet dan chamfer TIDAK sama, dan itu tidak disebut dokumentasi mana pun

Batas keduanya sama (½ sisi terkecil). Perilaku di atas batas tidak:

| | di atas batas |
|---|---|
| `fillet` | **ok** + solid rusak |
| `chamfer` | **GAGAL bersih** di setiap nilai yang diuji (5 · 5,001 · 6 · 8 · 10 · 20) |

Karena itu ujinya menyatakan keduanya terpisah. Menyamakannya akan
menyembunyikan bahwa hanya satu dari dua operasi yang bisa berbohong — dan
kalau chamfer suatu hari ikut berbohong, uji yang menyamakan tidak akan
berubah warna.

---

## Temuan 3: b-rep bertahan lintas panggilan tanpa kehilangan ketepatan

MCP tidak punya memori: shape yang dibuat panggilan pertama sudah hilang saat
panggilan kedua datang. Blender memecahkannya dengan `adegan.blend`; sisi CAD
memakai `serializeShape` → teks → cakram.

Yang harus dibuktikan bukan "bisa disimpan", melainkan **tidak menggeser
volume sedikit pun**. Kalau ia menggeser walau sedikit, seluruh alasan memakai
b-rep hilang — mesh juga bisa "hampir benar".

```
silinder r=7,5 t=12   simpan → muat → ukur   selisih 0
STEP tulis → baca      volume 16622,442632 → 16622,442632   selisih 3,64e−11
```

Satu kotak 10×20×30 memakan 2.545 karakter.

### Catatan jujur soal kata "eksak"

`makeBox([0,0,0],[40,40,12])` memberi **19199,999999999996**, bukan 19200.
"Eksak" di sini berarti **metodenya analitik** — integrasi atas permukaan
b-rep, bukan penjumlahan segitiga — bukan berarti nol galat IEEE-754. Bedanya
tetap besar dan tetap yang menentukan: 1e−12 versus 0,88%.

---

## Temuan 4: fillet mahal untuk ditesselasi

Flange yang sama, sebelum dan sesudah fillet 2 mm:

| toleransi | tanpa fillet | berfillet | |
|---|---|---|---|
| 1,0 | 860 | 6.820 | ×7,9 |
| 0,1 | 1.588 | 21.396 | ×13,5 |
| 0,03 | 2.544 | 50.288 | ×19,8 |
| 0,003 | 9.252 | **688.340** | **×74,4** |

Permukaan fillet melengkung di dua arah, dan itu tepat kasus yang paling mahal
bagi tesselator. Konsekuensi rancangan yang nyata: **fillet dan anggaran
segitiga web adalah dua hal yang saling tarik.** Bentuk yang bagus di CNC
belum tentu bentuk yang bagus di browser, dan angka di atas adalah nilai
tukarnya.

Ini juga sebabnya `bandingkanTesselasi` menerima **pabrik**, bukan shape: OCCT
menyimpan triangulasi di dalam shape dan hanya pernah memperhalus. Tabel di
atas menuntut bentuk dibangun ulang tiap baris, dan sesudah filletnya berhasil
ia harus dibangun ulang **berikut filletnya** — kalau tidak, tabelnya
menggambarkan benda yang berbeda dari berkas yang diekspor.

---

## Melihat sebelum memilih: `rupa_cad_tepi`

Fillet selektif menuntut tahu tepi mana yang mana, dan indeks tepi bukan
sesuatu yang bisa ditebak. `rupa_cad_tepi` melaporkan tiap tepi berikut arah
dan panjangnya:

```
plat berlubang → 15 tepi — {"Z":5, "Y":4, "X":4, "lengkung":2}
```

Lima tepi Z, bukan empat: empat sudut kotaknya **plus jahitan silinder
lubangnya**. Dua tepi "lengkung" adalah lingkaran atas dan bawah lubang itu.
Angka itu langsung memberi tahu bahwa `arah: 'Z'` akan ikut menyentuh
lubangnya — sesuatu yang tidak akan terlihat dari nama parameter mana pun.

Pemilihan bisa lewat `arah` (X/Y/Z) atau `tepi` (daftar indeks).

---

## Ekspor: pembagian yang tidak disebut pesan galat mana pun

```
.step .iges      b-rep EKSAK, permukaan analitik   → CAD & CNC
.stl .glb .obj   SEGITIGA, hampiran                → web & cetak
```

Yang kedua **selalu** melenceng, berapa pun toleransinya diperkecil. Karena
itu galatnya ikut dilaporkan:

```
.glb  20032 bita · eksak=false · galat 0.0182% · 524 segitiga
```

> "Sudah diekspor" tanpa angka adalah kalimat yang tidak bisa dipercaya.

Menyerahkan shape ke `exportGlb` (yang menerima MESH) gagal jauh di dalam
dengan `Cannot read properties of undefined (reading 'byteLength')` — pesan
yang tidak menyebut sebabnya sama sekali. Tool ini memilih jalurnya sendiri
dari ekstensi berkasnya.

---

## Uji

14 uji terhadap OCCT sungguhan, di atas 7 yang sudah ada. Yang menentukan:

- **fillet rusak DITOLAK meski kernel bilang ok** — dan berkasnya dipastikan
  tidak sempat tertulis
- **putar-balik simpan→muat tidak menggeser volume**
- **fillet selektif** — 4 tepi Z membuang lebih sedikit daripada 12 tepi
- **skala 2× harus 8× volume** — transformasi yang menggeser volume adalah
  gejala matriks yang salah, dan itu tidak terlihat sampai ada yang mengukur
- **nama bentuk tidak boleh keluar dari ruang kerjanya** — `../lolos`,
  `a/b`, `C:\mutlak`, `..` semuanya ditolak

Total repo: **51 uji hijau**, seluruhnya terhadap Blender dan OCCT sungguhan.

---

## Yang belum

- Sketsa 2D → extrude/revolve/sweep (B8). `sketchRectangle`, `sketchExtrude`,
  `sketchRevolve`, `sketchLoft`, `sketchSweep` semuanya ada di brepjs dan
  belum satu pun dipakai — itu jalan utama pemodelan mesin.
- `shellShape` (mengosongkan solid jadi dinding tipis) menuntut memilih MUKA,
  dan `rupa_cad_tepi` belum punya pasangan `rupa_cad_muka`.
- Assembly: banyak part berikut kendalanya (B10).
- Impor STEP dari CAD luar sudah jalan; belum ada aset uji dari dunia nyata
  untuk membuktikannya (B7).
