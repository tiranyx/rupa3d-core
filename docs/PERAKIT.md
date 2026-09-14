# Perakit — dan dua kali pemeriksa saya mengukur benda yang salah

7 September 2026.

```
muat → ukur → LOD → tabrakan → bake → ukur ulang → nilai → buang turunan → ekspor + tempel
```

Satu panggilan, satu aset bersertifikat. Yang membedakannya dari skrip build
biasa: **tiap langkah meninggalkan angka, dan angka itu ikut dinilai.**
Pipeline yang "berhasil" tetapi menghasilkan LOD yang merusak siluet atau peta
bake yang kosong akan GAGAL di sini — dan menyebut angkanya.

```bash
node contoh/rakit-takora.mjs
```

---

## Temuan utama: angka yang lulus tanpa mengukur apa pun

Jalan pertama pipeline penuh keluar hijau di dua aturan baru:

```
  ok   galat_lod_terburuk_persen      0.0000     ← palsu
  ok   tabrakan_segitiga                 26      ← palsu
```

Keduanya **tidak boleh dipercaya**, dan saya baru sadar sesudah melihat
angkanya terlalu bagus. 0,0000% galat pada penyederhanaan ke 10% segitiga itu
mustahil. 26 segitiga untuk proksi cembung sebuah tempurung kelapa juga
mustahil.

**Sebabnya sama untuk keduanya: pemeriksanya mengukur objek PERTAMA.**

Takora punya 37 objek. Yang pertama, menurut urutan adegan, sebuah gelembung
berdiameter **0,09 satuan** — 3% dari diagonal tempurungnya. Menyederhanakan
gelembung yang sudah hampir bola memang bergalat nol. Proksi cembung gelembung
memang 26 segitiga. Kedua angka itu **benar** untuk gelembung itu, dan tidak
mengatakan apa pun tentang aset yang sedang dinilai.

### indikator · parameter · faktor-X

| | |
|---|---|
| **indikator** | angka pemeriksa yang terlalu bagus untuk operasi yang dilakukan |
| **parameter** | `laporan[0]` — objek pertama menurut urutan adegan |
| **faktor-X** | urutan adegan tidak berhubungan dengan kepentingan objek |

Urutan objek di adegan Blender ditentukan urutan pembuatan, bukan ukuran atau
peran. Memakai indeks 0 sebagai wakil seluruh aset adalah **asumsi yang tidak
pernah ditulis** — dan asumsi yang tidak ditulis tidak pernah diperiksa.

### Perbaikannya berbeda untuk dua kasus, dan itu bukan kebetulan

| | siapa yang diukur | kenapa |
|---|---|---|
| **LOD** | **semua objek**, ambil yang terburuk | LOD dibuat untuk SETIAP objek; satu objek yang siluetnya rusak sudah merusak asetnya |
| **tabrakan** | **satu objek terbesar** menurut diagonal | proksi memang dibuat per objek; yang terbesar yang paling menentukan rasa fisika |

Sesudah diperbaiki, di aset yang sama:

```
  ok   galat_lod_terburuk_persen      1.0678     ← nyata
 warn  tabrakan_segitiga                324      ← nyata, dan di atas anggaran 300
```

Angka kedua langsung **memicu peringatan yang sebelumnya tidak pernah muncul.**
Itu ukuran seberapa besar kebohongannya: pemeriksa yang salah sasaran bukan
cuma tidak berguna — ia menyembunyikan cacat yang sudah ada.

> **Pemeriksa yang menilai angka tak bermakna lebih buruk daripada tidak ada
> pemeriksa.** Tidak ada pemeriksa berarti tidak tahu. Pemeriksa yang salah
> sasaran berarti **mengira sudah tahu**, dan itu menghentikan orang mencari.

### Yang membuatnya bisa ditelusuri lain kali

Tiap ukuran turunan sekarang membawa **siapa yang diukurnya**:

```
galat_lod_terburuk_objek     nama objek penyumbang galat terburuk
galat_lod_terburuk_tingkat   tingkat LOD ke berapa
tabrakan_objek               objek yang proksinya dibuat
```

Kalau angkanya aneh, sekarang bisa langsung dicek objeknya. Versi lama tidak
punya cara apa pun untuk mengetahui bahwa yang diukur adalah gelembung.

---

## Uji: 8 uji, dan keempat harapan intinya dibuktikan MERAH dulu

`test-turunan.mjs` dijalankan terhadap implementasi lama sebelum dipercaya:

```
implementasi LAMA memberi: {"segitiga_lod0":80,"segitiga_lod1":40,"galat_lod_terburuk_persen":0}

  MERAH  galat_lod_terburuk_persen === 1.7
  MERAH  galat_lod_terburuk_objek === tempurung
  MERAH  segitiga_lod0 === 5080
  MERAH  segitiga_lod1 === 2540

4/4 harapan MERAH terhadap implementasi lama.
```

Data ujinya sengaja disusun seperti aset aslinya: **objek pertama yang paling
kecil dan bergalat nol.** Uji yang objek pertamanya kebetulan yang terburuk
akan tetap hijau di kedua implementasi — dan tidak menjaga apa pun.

---

## Kosakata baru yang bisa ditulis di spek

| kode | dari |
|---|---|
| `galat_lod_terburuk_persen` · `_objek` · `_tingkat` | terburuk lintas SELURUH objek |
| `segitiga_lod{i}` · `nisbah_lod{i}` · `jumlah_lod` | dijumlahkan lintas objek |
| `tabrakan_tembus_persen` | permukaan asli di LUAR proksi → benda menembus dinding |
| `tabrakan_longgar_persen` | proksi jauh di luar permukaan → tabrakan di udara kosong |
| `tabrakan_bentuk` · `_segitiga` · `_volume_nisbi` · `_dinamis` · `_objek` | |
| `bake_variasi_min` · `bake_cakupan_uv_min` | terkecil — satu peta kosong sudah cukup buruk |
| `bake_{jenis}_variasi` · `_cakupan_uv` · `_ukuran` | per jenis peta |
| `volume_eksak` · `luas_eksak` · `galat_tesselasi_persen` | b-rep OCCT |

Tiga keputusan rancangan di dalamnya:

**Dua arah galat tabrakan diberi nama sendiri-sendiri.** Keduanya berarti
berbeda bagi pemain: menembus dinding merusak, menabrak udara mengganggu.
Untuk lantai, tembus 0 wajib dan longgar 5% tidak apa-apa; untuk benda yang
dipungut pemain, kebalikannya. Satu angka gabungan menghilangkan pilihan itu.

**`galat_tesselasi_persen` disimpan MUTLAK.** Mesh selalu sedikit lebih kecil
daripada b-rep-nya, jadi galatnya selalu negatif — dan `<= 0,05` pada angka
negatif akan lulus untuk kesalahan sebesar apa pun.

**Ukuran yang HILANG tetap kegagalan.** `dariLod(null)` mengembalikan `{}`,
bukan `{galat: 0}`. Kode yang muncul bernilai 0 saat pipelinenya tidak
dijalankan akan meloloskan aturan tanpa ada yang diukur.

---

## Warisan spek: `kora-3d-game` = bentuk + kesiapan game

```json
{ "warisi": ["kora-3d.json", "game-siap.json"] }
```

9 aturan bentuk + 6 aturan pipeline = 15. Anak menimpa induk **per `kode`**,
bukan per posisi — jadi satu spek turunan bisa melonggarkan satu ambang tanpa
menyalin ulang seluruh induknya, dan tanpa bergantung pada urutan.

Alasannya: aturan bentuk Kora berlaku untuk semua keluaran Kora, tetapi
anggaran segitiga proksi hanya berlaku untuk yang masuk game. Menyatukannya
dalam satu berkas memaksa aset non-game membawa aturan yang tidak relevan.

---

## Hasil pada Takora hari ini

```
GAGAL — takora terhadap kora-3d-game@1.0
15 aturan diperiksa · 4 gagal · 2 peringatan

  ok   galat_lod_terburuk_persen      1.0678
  ok   jumlah_lod                          3
  ok   tabrakan_tembus_persen        2.3804
  ok   tabrakan_longgar_persen       0.3594
  ok   tabrakan_dinamis                true
 warn  tabrakan_segitiga                324      ← 324 vs <= 300
 GAGAL tinggi · lebar · nisbah_lebar_tinggi · pivot_z

pipeline: 8 langkah · 24,7s
ekspor  : .rupa3d/rakit/takora-siap.glb · 1.190,0 KB (sertifikat +4,0 KB)
```

Enam aturan pipeline **lulus dengan angka yang bermakna**. Empat kegagalan
yang tersisa adalah cacat bentuk yang sama seperti kemarin — dan dua di
antaranya (`lebar`, `nisbah`) sebenarnya **satu keputusan rancangan** yang
bukan milik alat ini: lebarkan modelnya sampai 140:120, atau ubah speknya
kalau bentuk bulat memang yang diinginkan. Rinciannya di
[SERTIFIKAT.md](SERTIFIKAT.md).

---

## Keputusan lain yang dipasang di perakit

**Proksi tabrakan diturunkan dari mesh ASLI, bukan dari LOD terakhir.** Proksi
yang dibangun dari bentuk yang sudah disederhanakan mewarisi galat dua kali,
dan galat kedua itu tidak pernah terukur karena pembandingnya sudah bukan
bentuk aslinya.

**Ukuran BENTUK diambil dari pengukuran AWAL.** LOD dan proksi menambah objek
ke adegan; aturan `segitiga_total antara 10.000 dan 20.000` berbicara tentang
asetnya, bukan tentang asetnya plus seluruh turunannya.

**Adegan diukur ULANG sesudah pipeline.** Sertifikat harus menggambarkan
adegan yang benar-benar diekspor, bukan yang diukur sebelum semuanya dibuat.

**Turunan DIBUANG sebelum ekspor.** LOD dan proksi adalah berkas tersendiri
dalam pipeline game, bukan bagian dari mesh kirim.

**Berkas asal tidak pernah disentuh.** `rakitSalinan` menyalin dulu.

---

## Batas yang sengaja tidak disembunyikan

- Proksi tabrakan dibuat untuk **satu objek**, bukan seluruh aset. Proksi
  gabungan menuntut penyatuan mesh lebih dulu — keputusan pipeline tersendiri.
- Perakit belum punya pintu MCP; baru bisa dipanggil dari Node.
- `bake` di perakit menerima daftar pasangan rendah/tinggi secara manual;
  ia belum bisa memasangkannya sendiri dari nama objek.
