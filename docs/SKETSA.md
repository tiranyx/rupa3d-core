# Sketsa 2D → padat 3D — dan alat yang membuktikan dirinya sendiri

10 September 2026. B8.

Primitif + boolean cuma jalan pintas. Cara benda nyata dimodelkan — di
SketchUp, di SolidWorks, di FreeCAD — adalah **gambar penampang 2D, lalu
bangkitkan**. Satu kemampuan ini membuka tiga bidang yang sebelumnya kosong:

| arsitektur | denah → dinding, lantai, atap |
|---|---|
| **pemodelan mesin** | profil → poros, flange, wadah, roda gigi |
| **2D → 3D** | path, huruf, ikon → padat |

```
rupa_cad_sketsa { operasi: "ekstrusi" | "putar" | "loft", … }
```

---

## Yang membedakannya: hasilnya dibandingkan dengan RUMUS TERTUTUP

Seluruh alat 3D lain memberi tahu apa yang mereka hasilkan. Yang ini memberi
tahu apakah hasilnya **benar** — karena untuk ekstrusi dan revolve, jawabannya
bisa dihitung tanpa menjalankan kernel apa pun.

| operasi | acuan |
|---|---|
| ekstrusi | `V = luas × jarak`, luasnya dari **shoelace** pada polilinenya |
| putar 360° | `V = 2π · R_centroid · luas` — **teorema Pappus** |

Terukur pada OCCT 7.9.3:

```
ekstrusi persegi 20×10 × 5     galat 0 %              (1000,000000)
ekstrusi lingkaran r6 × 12     galat 1,68e−14 %
ekstrusi path L (shoelace 76)  galat 2,55e−14 %
putar profil 2×10 di R=6       galat 6,03e−14 %  ← Pappus
```

Hasil yang melenceng dari acuannya **tidak pernah disimpan**.

### Dan acuannya DIHITUNG, bukan ditulis tangan

Percobaan pertama menulis acuannya sendiri: sebuah profil L dinyatakan
"luas 64", dan kernel menjawab 76. Selama satu menit saya mengira menemukan
bug kernel.

Shoelace pada polilinenya: **76**. Bentuknya persegi 10×10 dikurangi
**4×6** di kiri atas, bukan 6×6. **Kernelnya benar; acuan saya yang salah.**

> Pemeriksa analitik hanya sebaik analisisnya. Karena itu luas dan centroid
> dihitung dari data path — `titikPath()` + `luasCentroid()` — bukan dari
> kepala.

Ini keluarga yang sama dengan hipotesis Nyquist yang gagal di terrain: sebuah
prediksi yang terdengar benar, dibantah oleh pengukuran.

---

## Pengetahuan API yang cuma bisa didapat dengan mencoba

Percobaan pertama menjalankan sembilan kasus dalam satu proses. Kasus ketiga
**mematikan seluruh proses** — abort di dalam WASM, yang `try/catch` tidak
tangkap. Delapan hasil lain hilang bersamanya.

Jadi tiap kasus dijalankan di **proses terpisah**. Hasilnya:

| | |
|---|---|
| `sketchRectangle(...).revolve()` | **gagal** — galat berupa pointer mentah `8481728`, tanpa pesan |
| `drawingToSketchOnPlane(...).revolve()` | **jalan**, sampai presisi Pappus |
| profil **menyentuh** sumbu | jalan — jadi silinder tepat `π·25·10` |
| profil **melintasi** sumbu | gagal, tanpa menyebut sebabnya |
| `importSVGPathD` → sketsa | gagal — ia mengembalikan Blueprint, bukan Drawing |

Karena itu **semua** profil di `cad-sketsa.mjs` lewat satu jalur yang sama:
`draw()` → `drawingToSketchOnPlane()`. Termasuk yang primitif. Satu jalur
berarti tidak ada operasi yang diam-diam mengambil rute yang rusak.

Dan dua penghancur revolve dijaga **di depan**, karena pesan kernelnya tidak
bisa dibaca manusia:

```
putar: profil MELINTASI sumbu putar (x dari −3.0000 sampai 5.0000).
Kernel menolak ini dengan galat yang tidak bisa dibaca;
geser profilnya supaya seluruhnya di satu sisi sumbu.
```

---

## Terbukti pada benda nyata

`node contoh/sketsa-arsitektur.mjs` — rumah huruf L, 8 × 6 m, dinding 15 cm,
tinggi 3 m:

```
luas denah luar   40,5000 m²
luas denah dalam  37,1925 m²      ← lantai terpakai
luas dinding       3,3075 m²

blok padat   V 121,5000  · acuan 121,5000  · galat 0 %
rongga       V 111,5775  · acuan 111,5775  · galat 2,547e−14 %
DINDING      V   9,9225  · analitik 9,9225 · galat 0,00000000 %

− pintu    −0,2835 m³      = 0,9 × 0,15 × 2,1   tepat
− jendela  −0,2520 m³      = 1,4 × 0,15 × 1,2   tepat
volume beton dinding: 9,387 m³
```

Angka terakhir itu bukan hiasan: **9,387 m³ beton** adalah angka yang bisa
dibawa ke tukang. Itu yang membedakan alat CAD dari alat gambar.

Gelas putar, penampang 4 × 90 mm pada jari dalam 30 mm:

```
dinding gelas V 72382,2947 mm³
Pappus          72382,2947 · galat 6,031e−14 %
centroid 32,00 · luas profil 360,00 mm²
```

Kolom berpuntir 60°, penampang segi enam r120, tinggi 2400:

```
V 89.789.520 mm³ · sah true
acuan: profil ini tidak punya acuan tertutup
```

Baris terakhir itu disengaja. **Polisegi ber-sagitta, persegi ber-fillet, dan
teks tidak diklaim punya acuan** — `acuanProfil()` mengembalikan `null`, dan
`null` dilaporkan apa adanya. Mengembalikan nol akan membuat pemeriksanya
lulus tanpa memeriksa apa pun.

### Puntiran menguji dirinya sendiri

Ekstrusi berpuntir memakai **acuan yang sama** dengan yang lurus, karena
geseran tidak menambah atau membuang material. Kalau puntirannya salah
diterapkan, volumenya berubah dan pemeriksanya menyala. Terukur: 2000,001
terhadap 2000.

---

## Kosakata segmen

Sengaja kecil — enam bentuk, tiap satu berpadanan langsung dengan pena
brepjs, jadi tidak ada terjemahan yang bisa menyimpang diam-diam.

| `ke` | garis ke titik mutlak |
|---|---|
| `garis` | garis relatif `[dx, dy]` |
| `h` · `v` | garis mendatar / tegak |
| `busur` + `sagitta` | busur ke titik, dengan tinggi busur dari talinya |
| `tangen` | busur yang menyinggung segmen sebelumnya |

Profil berbusur ditandai `hampiran: true` — talinya yang dipakai menghitung
luas, jadi toleransi pemeriksaan dilonggarkan ke 2 % di kasus itu. Yang
dilonggarkan **toleransinya**, bukan pemeriksanya dimatikan, dan alasannya
ikut dilaporkan.

---

## Yang belum

- **Offset poligon** yang benar (menangani sudut dalam/luar). Contoh
  arsitektur di atas menghitung kontur dalamnya tangan; itu sah untuk denah
  ortogonal dan tidak sah untuk denah bersudut bebas.
- **Sweep sepanjang tulang** — `sweepSketch` ada di Sketch, belum dipakai.
- **Loft belum punya acuan tertutup** — yang diperiksa baru rentang masuk
  akal antara prisma penampang terkecil dan terbesar.
- **`importSVGPathD` → sketsa** belum tersambung; SVG masih lewat jalur
  Blender (`rupa_muat`).
- **Fillet 2D pada sudut path** — `customCorner` ada di pena, belum dipakai.
