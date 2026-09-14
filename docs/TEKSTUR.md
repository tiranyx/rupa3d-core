# Tekstur — dan satu angka yang hampir tidak pernah dihitung siapa pun

10 September 2026.

Pertanyaan yang sebenarnya ditanyakan orang **bukan** "berapa resolusi
teksturnya" — itu ada di properti berkas. Yang ditanyakan:

> Apakah tekstur ini **cukup** untuk benda ini?
> Apakah tekstur ini **terlalu besar** untuk benda ini?

Jawabannya satu angka: **piksel per meter**. Ia lahir dari perkalian
kerapatan texel (UV per meter dunia — sudah diukur `topologi.mjs` kemarin)
dengan ukuran teksturnya. Kedua bahannya sudah tersedia di setiap GLB, dan
tidak ada alat yang mengalikannya.

```
rupa_tekstur { berkas: "apa-pun.glb" }
```

Terukur pada batu 1,2 m dengan tekstur 512²:

```
px/meter  228,1 – 508,1 (sebaran 2,228×)
```

Di bawah ~100 px/m benda seukuran manusia terlihat buram dari dekat; di atas
~2000 px/m hampir selalu pemborosan.

---

## PNG ditulis sendiri, dan alasannya

Yang dibutuhkan cuma dua hal: ukuran gambar dan pikselnya. PNG terspesifikasi
lengkap dan `zlib` sudah ada di Node, jadi dekodernya sekitar 150 baris —
bukan alasan untuk menambah kebergantungan yang harus diikuti versinya
selamanya. Putar-baliknya terbukti **identik bit demi bit**.

Yang **tidak** didukung ditolak dengan menyebut sebabnya: 16-bit, palet, dan
Adam7 interlace. Menghampirinya diam-diam akan menghasilkan angka piksel yang
salah — dan angka piksel yang salah persis jenis kebohongan yang alat ini ada
untuk mencegahnya.

---

## Tiga pemborosan yang tidak terlihat sama sekali

| **peta rata** | 1024² berisi satu nilai yang sama = **4 MB VRAM** untuk sebuah angka yang cukup ditulis sebagai faktor |
|---|---|
| **alfa sia-sia** | RGBA yang alfanya 255 di mana-mana = **25 % memori terbuang** |
| **resolusi semu** | gambar 256² yang di-upscale jadi 1024² menempati memori **empat kali lipat** untuk detail yang sama persis |

Yang ketiga diukur dengan cara yang sederhana dan tepat: gambar diturunkan 2×
lalu dinaikkan lagi, dan selisihnya dihitung. Kalau selisihnya di bawah
kuantisasi 8-bit, separuh resolusinya benar-benar tidak membawa apa-apa.

**Dan pemeriksa ini langsung menangkap keluaran generator saya sendiri.**
Bake pertama menghasilkan normal map berjangkauan 125–130 dari 0–255 —
praktis rata, ditandai sebagai kemungkinan upscale. Kekuatan bump dinaikkan
0,6 → 2,0, dan tandanya hilang: variasi 0,4 → 0,945, `|v| = 0,99889`.
Berkasnya tumbuh 665 → 1131 KB karena petanya sekarang benar-benar membawa
informasi.

---

## Normal map: |v| ≈ 1 **perlu**, tetapi **tidak cukup**

Normal map yang sah memenuhi `|2c−1| ≈ 1` sesudah didekode. Percobaan pertama
memakai itu saja sebagai pemeriksa.

Ternyata gambar gradien sembarang memberi **|v| = 1,105** — cuma 10 % meleset,
di dalam toleransi mana pun yang masuk akal. Sebuah peta albedo yang salah
pasang di slot normal akan lolos.

Yang membedakannya: normal map yang sah hampir selalu **berbiru tinggi**
(normal datar = biru 255, dan permukaan nyata jarang miring lebih dari 60°).
Gambar gradien itu berbiru 30. **Dua syarat bersama** yang menangkapnya.

Konvensi hijau juga dilaporkan, bukan ditebak: OpenGL (+Y) dan DirectX (−Y)
sama-sama sah, dan yang salah pilih membuat **lekukan terlihat menonjol** —
kesalahan yang tidak pernah tampak sebagai galat, cuma "kok aneh".

---

## Faktor dilaporkan bersama teksturnya — dan saya sendiri hampir tertipu

Laporan versi pertama menyebut peta MR punya **saluran B = 255**. Di glTF,
saluran B peta MR adalah **metallic**, jadi saya menyimpulkan batu itu
dirender sebagai logam mengkilap penuh, dan hampir menuliskannya sebagai bug.

Materialnya ternyata punya `metallicFactor: 0`, dan spesifikasi glTF
menetapkan nilai **efektif = faktor × saluran tekstur**. 0 × 255 = 0. Tidak
ada bug.

> Sebuah angka yang benar bisa mengundang kesimpulan yang salah kalau
> pendampingnya tidak ikut disebut.

Sekarang `baseColorFactor`, `metallicFactor`, `roughnessFactor`,
`normalScale`, dan `occlusionStrength` dilaporkan bersama gambarnya, dan peta
MR diurai per saluran sesuai arti yang **ditetapkan spesifikasi** — R tidak
dipakai, G kekasaran, B logam. Membaca "rerata RGB" pada peta MR tanpa tahu
itu tidak berarti apa-apa.

---

## Sisi pembuatan: prosedural → dipanggang → GLB

Material prosedural Blender (noise, voronoi, wave) **tidak bisa diekspor ke
glTF**. Eksportirnya cuma mengerti nilai tetap dan peta gambar. Material
prosedural yang indah di Blender terbit ke web sebagai **abu-abu rata**, tanpa
satu pun peringatan.

Urutan yang benar: graf prosedural → UV → **panggang** → **ganti materialnya
dengan yang berbasis gambar** → ekspor. Langkah penggantian itu yang paling
mudah terlupa.

Tiga hal yang menentukan hasilnya dan tidak jelas dari kodenya:

1. **Node gambar harus AKTIF** sebelum bake. Tanpa itu Blender memanggang ke
   tempat yang tidak ditentukan dan diam saja.
2. **Bake DIFFUSE bawaannya menyertakan pencahayaan.** Untuk albedo itu
   salah — bayangan lampu ikut terpanggang ke warna dasarnya.
   `use_pass_direct` dan `use_pass_indirect` harus dimatikan.
3. **Ruang warna disetel SEBELUM disimpan.** Albedo sRGB; normal, kekasaran,
   dan oklusi Non-Color. Salah ruang warna tidak menghasilkan galat — ia
   menghasilkan bayangan yang salah.

```bash
node contoh/tekstur-batu.mjs batu 512
node contoh/tekstur-batu.mjs kayu 1024
node contoh/tekstur-batu.mjs logam 512
```

---

## Jebakan yang ditutup di runtime

`bahan` pada node **menambal**, tidak mengganti. Versi pertama mengganti
seluruh material; pada aset tanpa tekstur itu tidak apa-apa, pada aset
**bertekstur** itu membuang seluruh peta yang baru dipanggang dan
menggantinya dengan satu warna rata. Tidak ada galat — yang terlihat cuma
benda yang tiba-tiba polos, dan mudah dikira teksturnya memang gagal dibuat.

Sekarang hanya properti yang **disebut** yang ditimpa, dan peta teksturnya
dipertahankan.

---

## Uji

17 uji, semuanya dengan gambar yang **disusun sendiri** sehingga jawabannya
pasti: peta rata, peta hasil upscale, normal map sah dan tidak sah, alfa
sia-sia, bukan-pangkat-dua, dan GLB yang disisipi tekstur untuk menguji
pembacaan slot.

Total repo: **161 uji hijau**, 12 suite.

---

## VRAM: satu angka menyembunyikan asumsi yang menentukan

Laporan versi pertama menyebut **`VRAM 4,00 MB`** untuk tiga tekstur 512².
Angka itu benar — untuk RGBA8 tak terkompres. Produksi web tidak memakai itu.

KTX2 / Basis Universal di-transcode ke format blok GPU:

| RGBA8 | 4 bita/piksel | batas **atas** |
|---|---|---|
| BC7 / ASTC (UASTC) | 1 bita/piksel | **4×** lebih kecil |
| BC1 / ETC1 (ETC1S) | 0,5 bita/piksel | **8×** lebih kecil |

Jadi tiga tekstur yang sama: **4,00 MB mentah · 1,00 MB BC7 · 0,50 MB BC1.**
Sekarang ketiganya dilaporkan, berikut **mana yang berlaku**:

```
unduh     1061 KB  ·  0/3 terkompres GPU (KTX2)
VRAM      4.00 MB mentah · 1.00 MB BC7/UASTC · 0.50 MB BC1/ETC1S
                                        ← yang BERLAKU sekarang: mentah
```

> **Angka yang benar untuk asumsi yang tidak dinyatakan sama menyesatkannya
> dengan angka yang salah.** Ini pelajaran yang sama persis dengan
> `metallicFactor` di atas, muncul dua kali dalam satu berkas.

Dan `tex_vram_berlaku` — bukan `tex_vram_rgba8` — yang jadi ukuran untuk
aturan spek. Menuliskan ambang terhadap angka mentah akan menolak aset
ber-KTX2 yang sebenarnya empat kali lebih ringan.

**Ukuran berkas dan ukuran memori adalah dua hal berbeda.** PNG rata 256²
terkompres jadi beberapa ratus bita; di GPU ia tetap memakan 349 KB — lebih
dari **50×**. Alat yang cuma melaporkan ukuran berkas menyembunyikan ongkos
yang sebenarnya dibayar.

---

## Dan sepuluh aturannya nyaris tidak memeriksa apa pun

`spek/tekstur-siap.json` punya sepuluh aturan. Pada aset **tanpa tekstur**,
enam ukurannya `null` — dan `null <= 2000` di JavaScript adalah `true`. Jadi
`tex_vram_berlaku <= 16 MB` melaporkan **ok** pada berkas yang tidak punya
satu gambar pun.

Sebabnya ada di `spek.mjs`, bukan di sini, dan ditulis lengkap di
[SERTIFIKAT.md](SERTIFIKAT.md). Yang perlu dicatat di berkas ini: **komentar
yang menjelaskan konvensi `null` di atas ada sejak hari pertama, dan salah
selama itu juga** — bukan karena keliru menulisnya, tetapi karena tidak ada
uji yang memerah kalau konvensinya dilanggar dari berkas lain.

Satu tambahan yang lahir dari situ: `tex_gambar >= 1` sekarang aturan
tersendiri, dan `tex_normal_sah` berhenti merangkap dua pertanyaan.

---

## Yang belum

- **JPEG** — ukurannya bisa dibaca, pikselnya belum. Yang tidak bisa diukur
  dikatakan, bukan ditebak.
- **Transcoding KTX2 sungguhan** — deteksinya sudah ada, pembuatannya belum.
  Itu menuntut `basisu` atau `toktx`, dan keduanya alat luar.
- **Atlas multi-objek** — beberapa mesh berbagi satu tekstur.
- **Kanal terpisah untuk oklusi** — sekarang oklusi bisa dipanggang tetapi
  belum dipaketkan ke saluran R peta MR seperti yang biasa dilakukan.
