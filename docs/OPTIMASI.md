# Optimasi — diprofil dulu, baru dioptimasi

10 September 2026.

"Optimasi" tanpa profil adalah tebakan. Jadi alat ini diukur terhadap dirinya
sendiri sebelum satu baris pun diubah.

---

## Profil: ke mana waktunya pergi

```
── Blender ──────────────────────────────────────
versi (proses saja, tanpa adegan)          449 ms
baru (adegan kosong)                      4611 ms
skrip kosong                              3140 ms
ukur (adegan kosong)                      3779 ms
ukur (1 kubus)                            3845 ms

── OCCT ─────────────────────────────────────────
kernel() pertama                           460 ms
kernel() kedua (cache)                       0 ms
makeBox ×100                                18 ms
measureVolume ×100                          31 ms

── Pembacaan GLB murni-Node ─────────────────────
kotakBatasGLB (accessor saja)                3 ms
titikGLB 36k verteks                        17 ms
meshGLB 36k verteks                         19 ms
topologiGLB 19k segitiga                   108 ms
teksturGLB (dengan px/m)                    81 ms

── Proksi & terbit ──────────────────────────────
proksiCembung 96 arah                      480 ms
proksiCembung 256 arah                     512 ms
terbitkan (aset 1,2 MB)                     11 ms
```

Kesimpulannya tidak ambigu: **Blender menguasai segalanya.** Semua yang lain
di bawah 110 ms; Blender 3–4,6 detik **per panggilan**.

Dan angka yang menentukan arah perbaikannya: **menyalakan proses Blender cuma
449 ms.** Sisa 2,5–4 detik adalah **muat + simpan berkas `.blend` yang sama**,
diulang untuk setiap op.

Pipeline delapan langkah membayar sekitar **25 detik ongkos murni**.

---

## Perbaikannya: satu proses, satu muat, satu simpan

```js
await b.jalankanBanyak([
  { op: 'baru' },
  { op: 'skrip', kode: '…' },
  { op: 'ukur' },
  { op: 'lod', nisbah: [0.5, 0.25] },
  { op: 'tabrakan', bentuk: 'cembung' },
  { op: 'ukur' },
]);
```

`muat_adegan()` jadi idempoten per proses; `simpan()` cuma menandai kotor, dan
penyimpanan sungguhannya terjadi **sekali di akhir**.

**Terukur pada enam op yang sama:**

```
satu-per-satu   22,2 s
berantai         3,1 s
                 ─────
hemat 19,1 s · 7,14× lebih cepat
```

---

## Cepat yang salah lebih buruk daripada lambat yang benar

Kecepatan tidak berarti apa-apa kalau angkanya berubah. Kedua mode
dijalankan pada op yang identik dan hasilnya dibandingkan **bidang demi
bidang**:

```
baru       IDENTIK (kecuali jalur ruang kerja, yang memang berbeda)
skrip      IDENTIK
ukur       IDENTIK
lod        IDENTIK
tabrakan   IDENTIK
ukur       IDENTIK
```

Termasuk galat LOD dan dua arah galat proksi tabrakan — angka yang paling
sensitif terhadap urutan operasi. Dikunci empat uji di `test.mjs`.

### Rantai BERHENTI di kegagalan pertama

Op berikutnya hampir selalu bergantung pada yang sebelumnya. Menjalankan
sisanya di atas adegan setengah jadi menghasilkan **angka yang tampak wajar
untuk keadaan yang tidak pernah dimaksudkan** — persis kelas kesalahan yang
alat ini ada untuk mencegahnya.

Diuji: rantai dengan op tak dikenal di posisi ketiga menghentikan ekspor di
posisi keempat, dan berkasnya **tidak pernah ditulis**.

---

## Perakit: 8 panggilan → 3 rantai

`rakit.mjs` **tidak bisa** jadi satu rantai tunggal, dan itu bukan
kekurangan: pemilihan objek proksi tabrakan bergantung pada hasil pengukuran
sebelumnya. Jadi ia dipecah di **batas keputusan yang nyata**:

| rantai | isi |
|---|---|
| `siap` | baru → muat → ukur |
| *(keputusan)* | pilih objek terbesar menurut diagonal |
| `turunan` | LOD → tabrakan → bake… → ukur ulang |
| `kirim` | buang turunan → ekspor |

```
sebelum  8 langkah · 24,7 s
sesudah  8 op dalam 3 rantai · 15,3 s
```

Kenaikannya lebih kecil daripada 7,14× karena tiga proses tetap dinyalakan
**dan** kerja sesungguhnya (LOD, hull, ekspor) tetap berbiaya. Yang hilang
cuma ongkos tetapnya — dan itu memang yang seharusnya hilang.

**Waktu per-op hilang dalam mode berantai.** Itu disebut di `langkah`, bukan
disamarkan jadi angka per-op yang sebenarnya tidak diukur.

---

## Satu bug yang ditemukan justru karena dioptimasi

Laporan pipeline mencetak **`NaNs`** — total waktu menjumlahkan `detik`
per-op yang dalam mode berantai tidak ada lagi.

> `NaN` yang dicetak sebagai "NaNs" adalah laporan yang lebih buruk daripada
> tidak ada laporan: ia menempati tempat sebuah angka dan tidak membawa
> satu pun informasi.

---

## Dan satu koreksi yang jauh lebih penting

Menyusun ulang perakit memaksa satu pertanyaan: **kapan sertifikat
diterbitkan?**

Versi lama menerbitkannya dari pengukuran **adegan**, lalu menempelkannya ke
berkas hasil ekspor. Itu membuat satu angka menyesatkan bertahan berbulan:

```
warn  tak_manifold   30790   ← 30790 vs 0
```

Angka itu datang dari Blender, yang menghitung indeks **mentah** glTF. glTF
memecah verteks di tiap jahitan UV, jadi tiap jahitan terhitung sebagai
lubang.

Sekarang urutannya dibalik — **ekspor dulu, ukur artefaknya, baru terbitkan
sertifikat**:

```
ok    tak_manifold       0
```

> **Sertifikat menggambarkan berkas yang ditempelinya, jadi angkanya harus
> datang dari berkas itu.**

Efek sampingnya besar: seluruh kosakata `topo_*` dan `tex_*` kini tersedia
untuk spek pada aset apa pun yang lewat perakit, tanpa langkah tambahan. Dan
bidang `ukuran` yang baru diperbaiki kemarin langsung terpakai — aturan
bernama `tak_manifold` membaca ukuran `topo_tak_manifold`.

---

## Yang TIDAK dioptimasi, dan alasannya

- **OCCT** sudah 460 ms sekali lalu nol. Tidak ada yang perlu diperbaiki.
- **Pembacaan GLB** paling lambat 108 ms untuk 19 ribu segitiga. Mengoptimasi
  ini akan menghemat milidetik di sebelah Blender yang menghabiskan detik.
- **`proksiCembung`** 480 ms, dan hampir seluruhnya penyalaan Rapier. Ia
  sudah di-cache.

Optimasi yang tidak mengubah angka terbesar bukan optimasi; ia perubahan
yang berisiko tanpa imbalan.

---

## Pintu berantai untuk agen: `rupa_rantai`

Agen adalah pemakai utama alat ini, dan sampai tadi ia membayar ongkos penuh
**tiap tool**. Sekarang tidak:

```
rupa_rantai { ruang, ops: [ {op, ...}, {op, ...} ] }
```

Diuji lewat stdio MCP sungguhan, lima op yang sama:

```
tool satu per satu   17,3 s
rupa_rantai           4,7 s
                      ─────
hemat 12,6 s · 3,71×
```

Kenaikannya lebih kecil daripada 7,14× di Node karena lima op ini memuat
kerja nyata yang lebih berat (LOD dan hull cembung), bukan karena MCP-nya
mahal — dan itu justru yang seharusnya terjadi.

Jalur berkas **diresolusi di sisi server**, sama seperti tool tunggal. Tanpa
itu jalur relatif diartikan terhadap direktori kerja Blender — yang bukan
direktori kerja pemanggilnya — dan berkasnya muncul di tempat yang tidak
diminta siapa pun. Berkas `muat` yang tidak ada ditolak **sebelum Blender
dinyalakan**, karena membayar 4 detik untuk mengetahui berkasnya tidak ada
adalah pemborosan yang bisa dihindari sepenuhnya.

---

## Yang belum

- **Kolam proses Blender** yang tetap hidup antar-panggilan. Itu menghapus
  449 ms terakhir, tetapi menuntut protokol dua arah dan penanganan proses
  yang macet — jauh lebih rumit daripada berantai, untuk imbalan yang jauh
  lebih kecil.
- **Uji berjalan berurutan** — 87 detik untuk 12 suite. Sebagian besar
  Blender dan OCCT, dan keduanya tidak aman dijalankan paralel di satu ruang
  kerja.
