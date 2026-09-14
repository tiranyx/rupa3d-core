# Integrasi — memakai Rupa3D dari luar

Versi 1.3.0 · 11 September 2026.

Rupa3D punya **tiga permukaan**, dan yang mana yang dipakai menentukan apa
yang dibutuhkan mesinnya:

| permukaan | untuk siapa | butuh apa |
|---|---|---|
| **Pustaka** — 18 modul ESM | Node, skrip, CI | Node ≥ 22.14 |
| **MCP** — 36 tool lewat stdio | agen (Claude, GPT, apa pun) | Node ≥ 22.14 |
| **Berkas** — GLB bersertifikat | siapa pun, bahkan tanpa Rupa3D | pembaca glTF apa pun |

Yang ketiga itu yang terpenting dan paling mudah terlewat: **buktinya ikut di
dalam berkasnya.** Penerima sebuah GLB bisa membaca apa yang dijanjikan, apa
yang diukur, dan siapa yang mengukurnya — tanpa memasang apa pun.

---

## Yang membutuhkan Blender, dan yang tidak

Ini pertanyaan pertama yang menentukan apakah Rupa3D bisa dipasang di CI.

**Tanpa Blender — 15 dari 18 modul, 23 dari 36 tool.** Termasuk seluruh
pemeriksa berkas:

```
rupa_topologi          topologi dari GLB mana pun
rupa_topologi_sumber   ← KECUALI ini: butuh Blender
rupa_tekstur           piksel per meter, VRAM per format
rupa_proksi            hull cembung terukur
rupa_cad_*             kernel b-rep OCCT (WASM, dari npm)
rupa_adegan_*          adegan dan terbit
rupa_periksa           dengan `berkas`: TANPA Blender
                       tanpa `berkas`:  butuh Blender (ia mengukur ADEGAN)
```

Tiga modul — `topologi.mjs`, `tekstur.mjs`, `glb.mjs` — plus `png.mjs` punya
**nol kebergantungan npm**. Hanya `node:fs` dan `node:zlib`. Keempatnya jalan
di mesin mana pun.

**Butuh Blender — 13 tool.** `blender.mjs` mencarinya di
`C:\Program Files\Blender Foundation\*`, atau `RUPA3D_BLENDER` menimpanya.

**Butuh WASM dari npm (bukan alat luar):** OCCT lewat `brepjs-opencascade`
(CAD), Rapier lewat `@dimforge/rapier3d-compat` (fisika, proksi, karakter).

---

## 1. Sebagai pustaka

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` diperlukan: jangkauan peer `brepjs` di hulu sudah basi.
> 0.8.2 bekerja.

### GLB terkompres Draco: sebutkan sekali dari pustakanya

Lewat **MCP tidak perlu memikirkannya** — empat tool pembaca berkas
menyiapkan dekodernya sendiri. Dari **pustakanya**, siapkan sekali:

```js
import { siapkanDraco } from './draco.mjs';
await siapkanDraco();          // sekali, sebelum membaca berkas apa pun
```

Tanpa itu, berkas Draco **ditolak** dengan pesan yang menyebut ekstensinya
dan jalan keluarnya — bukan dibaca sebagai kosong. Berkas non-Draco tidak
terpengaruh sama sekali.

### Menilai sebuah GLB — satu panggilan, tanpa Blender

Ini yang paling sering dibutuhkan, dan sekarang satu baris:

```
rupa_periksa { berkas: "apa-pun.glb", spek: "spek/aset-generatif.json" }
```

**967 ms untuk 35 aturan.** Sertifikatnya ditempel ke salinan
`<nama>.bersertifikat.glb`; berkas asalnya tidak pernah ditulisi.

Pakai `spek/aset-generatif.json` untuk berkas yang datang dari luar — seluruh
25 aturannya bisa dijawab berkasnya sendiri. **Jangan** pakai
`kora-3d-penuh.json`: ia memuat aturan pipeline (galat LOD, proksi tabrakan)
yang sebuah GLB tidak mengangkut jawabannya, dan aturan yang tidak bisa
dinilai **menggagalkan**. Spek punya lingkup.

### Memeriksa sebuah GLB dari pustakanya

Ini kasus paling ringan, dan biasanya yang pertama dicoba orang:

```js
import { topologiGLB, ringkasTopologi } from './topologi.mjs';
import { teksturGLB } from './tekstur.mjs';
import { dariTopologi, dariTekstur } from './turunan.mjs';
import { muatSpek, terbitkanSertifikat, ringkas } from './spek.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const berkas = 'aset.glb';
const ukuran = {
  ...dariTopologi(topologiGLB(berkas)),
  ...dariTekstur(teksturGLB(berkas)),
};

const spek = muatSpek('spek/kora-3d-penuh.json',
  (j) => readFileSync(j, 'utf8'),
  (j, n) => path.join(path.dirname(j), n));

console.log(ringkas(terbitkanSertifikat({ spek, ukuran, aset: 'aset' })));
```

**Pakai `muatSpek`, bukan `JSON.parse`.** Tiga spek di repo ini tidak punya
aturan sendiri sama sekali — mereka murni titik komposisi lewat bidang
`warisi`, dan `JSON.parse` polos akan menolaknya dengan pesan yang
menyalahkan berkas speknya.

### Merakit satu aset ujung ke ujung

```js
import { rakitSalinan } from './rakit.mjs';

const { sertifikat, ekspor } = await rakitSalinan({
  ruang: '.kerja/aset-saya',
  spek,
  berkas: 'masukan/model.glb',
  lod: [0.5, 0.25, 0.1],
  tabrakan: 'cembung',
  keluar: 'kirim/model.glb',
  lapor: console.log,
});
```

`rakitSalinan` menyalin masukannya lebih dulu; **berkas asal tidak pernah
disentuh.** Ini bukan kesantunan, ini agar pipeline bisa diulang.

### Bentuk kembalian yang perlu diketahui

`sertifikat` selalu berbentuk:

```js
{
  skema: 'rupa3d/sertifikat@1',
  aset, revisi, spek: 'nama@versi',
  lulus,                 // hanya menghitung aturan `wajib`
  diperiksa, gagal, peringatan,
  aturan: [{ kode, lulus, berat, nilai, harap, satuan, pesan }],
  ukuran,                // seluruh ukuran mentahnya
  kernel: [],            // alat apa yang mengukurnya
  pada,                  // ISO
}
```

---

## 2. Sebagai server MCP

Stdio. Dari paket npm:

```bash
claude mcp add rupa3d -- npx -y rupa3d
```

```json
{
  "mcpServers": {
    "rupa3d": { "command": "npx", "args": ["-y", "rupa3d"] }
  }
}
```

Dari checkout repo:

```json
{
  "mcpServers": {
    "rupa3d": {
      "command": "node",
      "args": ["C:/jalur/ke/Rupa3D/server.mjs"],
      "env": { "RUPA3D_RUANG": "C:/jalur/ke/ruang-kerja" }
    }
  }
}
```

Spek bawaan boleh disebut relatif (`spek/aset-generatif.json`) dari direktori
kerja mana pun: dicari di direktori kerja dulu, lalu di folder paket.

### Ruang kerja punya DUA akar, dan itu membingungkan

| server MCP | `~/.rupa3d/<nama>` — sejak 1.6.1 dari direktori rumah; sebelumnya dari `../../` relatif `server.mjs`, yang di bawah npx jatuh ke dalam cache npm |
|---|---|
| contoh di `contoh/` | relatif **direktori kerja**, jadi biasanya `<repo>/.rupa3d/<nama>` |

Keduanya nyata dan keduanya terpakai. `RUPA3D_RUANG` menimpa yang pertama.
**`rupa_status` selalu melaporkan akar yang sedang dipakai** — panggil itu
kalau sebuah berkas "hilang"; hampir selalu ia ada, di akar yang satunya.

Tiap ruang kerja berisi `adegan.blend` (Blender), `adegan.json` (adegan), dan
`cad/*.brep` (bentuk b-rep).

### Bentuk balasan setiap tool

Seragam, tanpa kecuali:

```js
{ content: [{ type: 'text', text: '<JSON>' }], isError: <keluaran.ok === false> }
```

Jadi sisi klien selalu `JSON.parse` isi `text`-nya. Kegagalan datang sebagai
**data**, bukan lemparan: `{ ok: false, error: '…' }`.

### Urutan yang bekerja

```
rupa_baru → rupa_skrip / rupa_muat → rupa_ukur → rupa_lihat → ulangi → rupa_ekspor
```

**Dan pakai `rupa_rantai` begitu langkahnya lebih dari dua.** Terukur lewat
stdio MCP sungguhan, lima op yang sama: **17,3 s → 4,7 s, 3,71×**. Sebabnya
bukan MCP-nya mahal — menyalakan proses Blender cuma 449 ms, sisanya muat +
simpan berkas `.blend` yang sama, diulang tiap op.

`rupa_rantai` **berhenti di kegagalan pertama**, dan itu disengaja: op
berikutnya hampir selalu bergantung pada yang sebelumnya.

Yang **tidak bisa** dirantai: urutan yang punya keputusan di tengah — misalnya
memilih objek proksi berdasarkan hasil pengukuran sebelumnya. Pecah di batas
keputusannya, seperti `rakit.mjs` yang jadi tiga rantai.

### Tool yang perlu disebut

| | |
|---|---|
| `rupa_topologi` | Bekerja pada GLB **dari mana pun**, termasuk keluaran generator AI. Tanpa Blender. |
| `rupa_topologi_sumber` | Quad / n-gon / edge loop / kutub. **Butuh Blender**, karena keempatnya musnah di glTF. |
| `rupa_tekstur` | Piksel per meter, VRAM per format. Tanpa Blender. |
| `rupa_proksi` | Hull cembung, diukur dengan collider Rapier yang **persis akan berjalan**. Titiknya langsung dipasang ke `rupa_adegan_node` lewat `fisika_titik`. |
| `rupa_periksa` | SPEK × UKURAN → SERTIFIKAT. Menyelesaikan `warisi`. |
| `rupa_cad_tepi` | Panggil **sebelum** fillet selektif — indeks tepi tidak bisa ditebak. |

---

## 3. Menulis spek sendiri

Sebuah spek adalah JSON. Bidang aturannya **daftar tertutup**; bidang tak
dikenal ditolak di depan.

```json
{
  "nama": "spek-saya",
  "versi": "1.0",
  "warisi": ["topologi-siap.json"],
  "aturan": [
    {
      "kode": "segitiga_total",
      "ukuran": "topo_segitiga",
      "pembanding": "<=",
      "nilai": 20000,
      "berat": "wajib",
      "satuan": "segitiga",
      "alasan": "Anggaran per aset di panggung ramai."
    }
  ]
}
```

| bidang | arti |
|---|---|
| `kode` | **identitas** aturan — namanya di sertifikat |
| `ukuran` | ukuran yang **DIBACA**-nya; kosong = sama dengan `kode` |
| `pembanding` | `=` `<=` `>=` `<` `>` `antara` `memuat` `subset` `benar` |
| `nilai` | yang diharapkan; larik `[min, maks]` untuk `antara` |
| `toleransi` | hanya untuk `=` |
| `berat` | `wajib` (gerbang) atau `peringatan` (dilaporkan, tidak menggagalkan) |
| `satuan` · `alasan` · `catatan` | dokumentasi yang ikut ke sertifikat |

Memisahkan `kode` dari `ukuran` bukan hiasan: dua aturan bisa membaca ukuran
**yang sama** dengan ambang berbeda, dan masing-masing punya namanya sendiri.

`warisi` menyelesaikan secara rekursif. Aturan anak dengan `kode` yang sama
**menimpa** induknya — per `kode`, bukan per posisi.

### Tiga jebakan yang sudah menggigit repo ini

1. **`bobot` bukan `berat`.** Salah ketik nama bidang tidak pernah terlihat
   sebagai galat; ia terlihat sebagai **nilai bawaan**. Dua berkas spek
   pernah ditulis dengan `bobot`, dan delapan aturan peringatan diam-diam jadi
   gerbang keras. Validator sekarang menolak bidang tak dikenal, dengan pesan
   khusus untuk yang satu ini.

2. **`null` berarti TIDAK TERUKUR, dan itu MENGGAGALKAN.** Pengukur yang tidak
   bisa mengukur sesuatu menulis `null` — bukan `0`, dan bukan menghilangkan
   bidangnya. Kalau spek Anda menulis ambang terhadap ukuran yang kadang tidak
   ada (UV, tekstur), aset yang tidak punya akan **gagal**, bukan lolos.
   Itu disengaja.

3. **Tulis ambang terhadap ukuran yang BERLAKU.** `tex_vram_berlaku`, bukan
   `tex_vram_rgba8` — aset ber-KTX2 yang sebenarnya empat kali lebih ringan
   akan ditolak kalau ambangnya ditulis terhadap angka mentah. Angka yang
   benar untuk asumsi yang tidak dinyatakan sama menyesatkannya dengan angka
   yang salah.

---

## 4. Membaca sertifikat dari GLB — tanpa Rupa3D

Ini yang membuat "aset membawa buktinya" jadi kenyataan, bukan slogan.
Sertifikatnya ada di `asset.extras.rupa3d` di dalam JSON chunk GLB-nya.

```js
// three.js
new GLTFLoader().parse(buffer, '', (gltf) => {
  const bukti = gltf.parser.json.asset?.extras?.rupa3d;
  if (bukti) console.log(bukti.spek, bukti.lulus, bukti.gagal);
});
```

```python
# Python, tanpa pustaka glTF apa pun
import json, struct
with open('aset.glb', 'rb') as f:
    f.read(12)                                   # kepala
    n, _ = struct.unpack('<II', f.read(8))       # panjang chunk JSON + jenis
    bukti = json.loads(f.read(n)).get('asset', {}).get('extras', {}).get('rupa3d')
```

Sertifikatnya menempel lewat `rupa_periksa { tempel_ke }` atau
`tempelSertifikat()`. **Berkas asalnya tidak pernah ditulisi**; yang
bersertifikat ditulis sebagai `<nama>.bersertifikat.glb`.

---

## Ganjalan yang perlu diketahui sebelum tersandung

- **`BENTUK_TABRAK` diekspor DUA kali dengan isi berbeda.** `adegan.mjs`
  punya 5 anggota, `fisika.mjs` punya 6 (dengan `trimesh`). Bedanya nyata —
  trimesh sah untuk badan statis dan ditolak untuk dinamis — tetapi yang
  mengimpor keduanya dengan satu nama mendapat yang terakhir, tanpa tanda.
  Impor dengan alias.

- **`rupa_skrip` menjalankan Python arbitrer** di dalam Blender headless.
  Sesuai desain, dan ruangnya terkurung — tetapi ia *tidak* sandbox. Jangan
  paparkan ke masukan yang tidak dipercaya.

- **Batas halaman terbit 16 MB**, diperiksa **sebelum** menulis, dengan
  menyebut aset penyumbang terbesar. Base64 membengkakkan bita ~4/3.

- **Blender di mesin ini tanpa FFmpeg** — bisa menulis gambar, tidak bisa
  menulis video.

- **OCCT WASM 41 MB.** Untuk web ia butuh worker + muat malas.

- **`convexHull` Rapier rusak diam-diam di atas ~8.000 titik** dan
  mengembalikan collider bervolume **nol** — benda dengan collider bervolume
  nol jatuh menembus dunia. `tabrak.mjs` mematok batas amannya di 4.096 titik.
  Kalau Anda memakai Rapier langsung, patok sendiri.

- **`requestAnimationFrame` menyala nol kali per detik saat tab tidak
  dilukis.** Halaman terbit yang disembunyikan **berhenti** mensimulasikan.
  Uji apa pun yang bergantung pada waktu harus memegang jamnya sendiri.

---

## Uji

```bash
npm test                       # seluruh suite
node --test test-topologi.mjs  # satu suite
node --test test-mcp.mjs       # lewat PINTU MCP, bukan pustakanya
```

Suite terakhir itu ada karena semua yang lain menguji pustakanya, dan dua
kemampuan yang lengkap dan benar ternyata **tidak bisa dicapai** lewat MCP —
sementara 201 uji tetap hijau. Kalau Anda menambah tool, tambahkan ujinya di
sana, bukan cuma di pustakanya.

Suite Blender dan OCCT **tidak aman dijalankan paralel** di satu ruang kerja.

---

## Yang belum ada, dan sebaiknya tidak dikira ada

- **PROYEK / ASET / REVISI belum ada.** Yang ada ruang kerja di disk.
  Sertifikatnya sudah membawa bidang `revisi`, dan bidang itu `null` di
  hampir semua aset.
- **Atlas multi-objek**, **transcoding KTX2**, **piksel JPEG**, **collider
  trimesh terrain**, **anggaran draw call** — semuanya disebut di
  backlog, tidak satu pun ada.
- **Tidak ada model izin.** Satu pengguna.
