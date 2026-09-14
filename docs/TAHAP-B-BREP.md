# Tahap B — kernel b-rep OCCT di samping Blender

6 September 2026. Rupa3D sekarang punya **dua kernel**: Blender untuk mesh
(seni, animasi, game, web) dan OpenCascade untuk b-rep (CAD, CAE, manufaktur).

## Buktinya, bukan klaimnya

```
kernel OCCT siap 0,43 detik · 901 kelas
```

Flange Ø140 × 12 mm, bor tengah Ø60, enam lubang baut Ø11 pada lingkar Ø110 —
dibangun dari ANGKA BERNAMA, bukan verteks yang digeser:

```
volume b-rep   143.954,059 mm³
analitik       143.954,059 mm³      selisih 0 mm³  (0,0000%)
```

Kernel cocok dengan hitungan tangan sampai nol. Itu yang berarti "eksak".

Dan inilah ongkos mengubahnya jadi mesh — flange DIBANGUN ULANG tiap baris:

| toleransi | sudut | segitiga | volume mm³ | galat |
|---|---|---|---|---|
| 1,0 | 0,5 | 860 | 142.686,978 | −0,8802% |
| 0,1 | 0,3 | 1.588 | 143.881,098 | −0,0507% |
| 0,03 | 0,2 | 2.544 | 143.935,110 | −0,0132% |
| 0,003 | 0,05 | 9.252 | 143.951,741 | −0,0016% |

**Tidak satu pun tepat, dan tidak akan pernah.** Untuk flange yang harus pas
dengan baut M10 pada ±0,1 mm, itu bukan soal selera.

Keluaran: `flange.step` 30,9 KB (**AP242**, `ISO-10303-21` — dibaca setiap CAD
profesional dan bengkel CNC), `flange.glb` 81,9 KB untuk web, `flange.stl`
572,2 KB untuk cetak 3D.

## Lima jebakan, dan yang paling mahal ada di nomor empat

### 1. OCCT tidak mau hidup di Node — dua kali berturut-turut

Glue emscripten `brepjs-opencascade` diakhiri `export default Module`, jadi
Node **selalu** mem-parsingnya sebagai ESM — apa pun jalur impornya, meski
dipaksa `require()` dengan jalur absolut. Di ESM tidak ada `__dirname` maupun
`require`, dan glue memakai keduanya untuk menemukan berkas `.wasm`.

Keduanya dicari di lingkup **global**, jadi menyediakannya di sana cukup:

```js
globalThis.__dirname  = <dir glue>;
globalThis.__filename = <dir glue>/brepjs_single.js;
globalThis.require    = createRequire(<dir glue>/x.cjs);
```

Tanpa itu: `__dirname is not defined`, lalu `require is not defined` —
keduanya tanpa menyebut sebabnya.

### 2. Hasil GAGAL menyamar jadi sukses

brepjs mengembalikan Result `{ok, value}` atau `{ok:false, error}`. Helper
pertama saya cuma mengecek adanya `value`, jadi hasil gagal diam-diam jadi
`undefined` — tanpa exception, tanpa gejala — sampai `measureVolume` meledak
jauh di hilir dengan pesan yang tidak menyebut sebabnya.

`filletShape(padat, 2)` pada flange ini memang **ditolak kernel**: tepi lubang
baut berjarak lebih dekat satu sama lain daripada 2× radius, jadi permukaan
filletnya akan saling memotong. Itu jawaban yang benar dari kernel — yang
salah adalah kode yang menelannya diam-diam.

**Kegagalan harus berbunyi di tempat ia terjadi.**

### 3. API ekspornya tidak seragam

```
exportSTEP(shape)                b-rep EKSAK   -> CAD, CNC
exportSTL (shape, {tolerance})
exportGlb (MESH)                 hampiran      -> three.js, web
exportGltf(MESH)
```

Menyerahkan shape ke `exportGlb` gagal dengan "Cannot read properties of
undefined (reading byteLength)". Pembagiannya sendiri benar — STEP menyimpan
geometri eksak, glTF menyimpan hampiran — tetapi urutannya harus dihafal.

`importSTEP` **asinkron** dan menerima **Blob**: bukan Buffer, bukan
Uint8Array. Diberi Buffer ia gagal "blob.arrayBuffer is not a function"; tanpa
`await`, helper menerima Promise dan meledak dengan "Cannot read properties of
undefined (reading $$)".

### 4. Tabel tesselasi yang tampak masuk akal dan sepenuhnya palsu

Ini yang paling mahal, karena hasilnya **sudah saya terbitkan** sebelum
ketahuan.

OCCT menyimpan triangulasi **di dalam shape-nya** (`Poly_Triangulation` yang
menempel pada `TopoDS_Shape`), dan `BRepMesh_IncrementalMesh` hanya pernah
**memperhalus** — tidak pernah memperkasar. Jadi memanggil `meshShape`
berulang pada shape yang **sama** memberi tabel di mana tiap baris mewarisi
mesh baris sebelumnya.

Bukti yang membongkarnya:

```
shape baru, tol 1,0            ->  100 segitiga, galat 0,9705%
shape sama, tol 0,003          -> 1004 segitiga, galat 0,0104%
clearMeshCache(), tol 1,0 lagi -> 1004 segitiga   <-- TIDAK kembali ke 100
```

`clearMeshCache()` membersihkan cache sisi JS, bukan triangulasi di dalam
shape. Satu-satunya cara mengukurnya jujur: **bangun ulang shape-nya tiap
baris**. Itu sebabnya `bandingkanTesselasi()` menerima PABRIK, bukan shape.

Gejala yang seharusnya saya baca lebih awal: sebuah sapuan 6 × 5 toleransi
memberi **1004 segitiga di ketiga puluh selnya**. Sapuan parameter yang tidak
memberi variasi apa pun bukan berarti parameternya tidak penting — ia berarti
parameternya **tidak tersambung**.

### 5. Pada permukaan lengkung, SUDUT yang mengikat — bukan jarak

Silinder r=10 t=25, toleransi linier dibiarkan longgar di 1,0:

```
sudut 1,0    ->   48 segitiga, galat 3,8481%
sudut 0,5    ->  100 segitiga, galat 0,9705%
sudut 0,2    ->  248 segitiga, galat 0,1657%
sudut 0,05   -> 1004 segitiga, galat 0,0104%
```

Mengetatkan `tolerance` dari 1,0 ke 0,3 tidak mengubah apa pun; yang bergerak
`angularTolerance`. Uji pertama saya gagal justru karena mengandaikan
sebaliknya — asumsinya yang salah, bukan pustakanya.

## Yang ada sekarang

- `cad.mjs` — `kernel()`, `buka()`, `ukur()`, `bandingkanTesselasi()`,
  `volumeMesh()`, `keBita()`.
- `test-cad.mjs` — 7 uji terhadap OCCT sungguhan, semua lulus, termasuk
  putar-balik STEP dan pembuktian bahwa mesh tidak pernah tepat.
- `contoh/flange-cad.mjs` — flange parametrik lengkap sampai STEP/GLB/STL.

## Belum

Tool MCP `rupa_cad_*` belum dipasang — kernelnya sudah terbukti, permukaan
MCP-nya menyusul. Fillet selektif (memilih tepi, bukan semua) juga belum;
itu yang dibutuhkan supaya flange di atas bisa difillet.
