/* Flange berlubang baut — kasus yang TIDAK bisa dikerjakan Blender.
 *
 *   node contoh/flange-cad.mjs
 *
 * Bukan karena Blender kurang fitur, melainkan karena representasinya. Mesh
 * hanya bisa MENGHAMPIRI permukaan lengkung dengan poligon; b-rep menyimpan
 * silinder sebagai silinder, berikut toleransinya. Untuk flange yang harus
 * pas dengan baut M10 pada ±0,1 mm, selisih itu bukan soal selera.
 *
 * Berkas ini membuktikannya dengan angka: volume EKSAK dari kernel b-rep
 * dibandingkan volume mesh hasil tesselasi pada beberapa toleransi.
 */
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bandingkanTesselasi } from '../cad.mjs';

/* ── Menyalakan kernel OCCT di Node ───────────────────────────────────────
 * Glue emscripten `brepjs-opencascade` diakhiri `export default Module`, jadi
 * Node SELALU mem-parsingnya sebagai ESM — apa pun jalur impornya, dan meski
 * dipaksa lewat require() dengan jalur absolut. Di ESM tidak ada `__dirname`
 * maupun `require`, dan glue itu memakai keduanya untuk menemukan .wasm-nya.
 * Karena keduanya dicari di lingkup GLOBAL, menyediakannya di sana sudah
 * cukup. Tiga baris ini yang membuat OCCT hidup di Node; tanpanya gagal
 * dengan "__dirname is not defined" yang tidak menyebut sebabnya. */
const DIR_OC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'node_modules', 'brepjs-opencascade', 'src',
);
globalThis.__dirname = DIR_OC;
globalThis.__filename = path.join(DIR_OC, 'brepjs_single.js');
globalThis.require = createRequire(path.join(DIR_OC, 'x.cjs'));

const t0 = Date.now();
const oc = await (await import('brepjs-opencascade')).default();
const B = await import('brepjs');
B.initFromOC(oc);
console.log(`kernel OCCT siap ${((Date.now() - t0) / 1000).toFixed(2)}s · ${Object.keys(oc).length} kelas`);

/* ── Ukuran flange, dalam MILIMETER dan bernama ──────────────────────────
 * Semua turunan dihitung dari yang di atasnya. Inilah yang membuatnya
 * PARAMETRIK: ubah D_LUAR, dan lingkar bautnya ikut — tanpa membangun ulang. */
const D_LUAR = 140;      // diameter piringan
const TEBAL = 12;        // tebal piringan
const D_BOR = 60;        // lubang tengah
const N_BAUT = 6;
const D_BAUT = 11;       // lubang baut, untuk M10 dengan kelonggaran
const D_LINGKAR = 110;   // lingkar pusat lubang baut
const R_FILLET = 2;      // radius tepi luar

const bulat = (n, d = 3) => Number(n.toFixed(d));
/* brepjs mengembalikan Result `{ok, value}` atau `{ok:false, error}`.
   Versi pertama helper ini cuma mengecek adanya `value`, jadi hasil GAGAL
   diam-diam jadi `undefined` — tanpa exception, tanpa gejala, sampai
   `measureVolume` meledak jauh di hilir dengan pesan yang tidak menyebut
   sebabnya. Kegagalan harus berbunyi di tempat ia terjadi. */
const buka = (r) => {
  if (!r || typeof r !== 'object' || !('ok' in r)) return r;
  if (r.ok === false) {
    const e = r.error;
    throw new Error(typeof e === 'string' ? e : (e?.message ?? JSON.stringify(e)));
  }
  return B.unwrap(r);
};

/* PABRIK, bukan satu shape: pengukuran tesselasi di bawah menuntut shape
   yang benar-benar baru tiap kali. Lihat catatannya di sana. */
function buatFlange() {
  let s = B.makeCylinder(D_LUAR / 2, TEBAL, [0, 0, 0], [0, 0, 1]);
  s = buka(B.cutShape(s, B.makeCylinder(D_BOR / 2, TEBAL * 3, [0, 0, -TEBAL], [0, 0, 1])));
  for (let i = 0; i < N_BAUT; i += 1) {
    const a = (i / N_BAUT) * Math.PI * 2;
    const bor = B.makeCylinder(
      D_BAUT / 2, TEBAL * 3,
      [Math.cos(a) * (D_LINGKAR / 2), Math.sin(a) * (D_LINGKAR / 2), -TEBAL],
      [0, 0, 1],
    );
    s = buka(B.cutShape(s, bor));
  }
  return s;
}
const padat = buatFlange();

/* ── Urutan argumen, dan cerita yang saya karang untuk menutupinya ──────
 *
 *     filletShape(shape, edges, radius)
 *
 * Versi pertama berkas ini memanggilnya `filletShape(padat, R_FILLET)` —
 * radius masuk ke slot `edges`, dan `radius` jadi `undefined`. Kernelnya
 * menjawab "Fillet operation failed".
 *
 * Yang saya tulis di sini sebagai keterangan sebab: "pada flange ini tepi
 * lubang baut berjarak lebih dekat satu sama lain daripada 2x radius, jadi
 * permukaan filletnya akan saling memotong." Kedengarannya masuk akal.
 * **Tidak satu pun angkanya pernah diukur.** Ia dikarang untuk menjelaskan
 * kegagalan, lalu masuk ke backlog sebagai utang geometri.
 *
 * Yang membongkarnya: memanggil fillet pada KOTAK 10x20x30 — geometri yang
 * tidak mungkin punya masalah jarak antar-lubang. Ia gagal juga, di setiap
 * radius. Kalau penjelasannya benar, kotak itu harus lolos.
 *
 * indikator - pesan galat generik pada geometri yang sederhana
 * parameter - urutan argumen
 * faktor-X  - "kernel menolak" terdengar seperti keterangan SEBAB, padahal
 *             ia cuma keterangan GEJALA; dan penjelasan yang masuk akal
 *             lebih berbahaya daripada tidak ada penjelasan, karena ia
 *             menghentikan orang mencari.
 *
 * Uji tandingannya sekarang permanen di `test-cad-ruang.mjs`: kalau fillet
 * gagal pada kotak polos, yang salah pemanggilnya — bukan geometrinya. */
/* Filletnya masuk ke dalam PABRIK, bukan diterapkan sekali di luar.
   Alasannya bukan kerapian: `bandingkanTesselasi` menuntut shape BARU tiap
   baris (OCCT menyimpan triangulasi di dalam shape-nya dan hanya pernah
   memperhalus), jadi tabel toleransi di bawah harus membangun ulang bentuk
   yang SAMA dengan yang diekspor. Selama filletnya selalu gagal, keduanya
   kebetulan sama; begitu ia berhasil, tabelnya akan menggambarkan benda
   yang berbeda dari berkasnya. */
function buatFlangeFinal() {
  const kasar = buatFlange();
  const f = buka(B.filletShape(kasar, undefined, R_FILLET));
  /* Kernel bisa mengembalikan ok dengan solid rusak. Terukur pada kotak
     10x20x30: radius 5,001 memberi volume 7971 dari 6000 — fillet yang
     MENAMBAH material. Diperiksa di sini juga, bukan cuma di modulnya. */
  const naik = B.measureVolume(f) > B.measureVolume(kasar);
  if (!B.isShapeValid(f) || naik) {
    throw new Error(`fillet ${R_FILLET} mm menghasilkan bentuk tidak sah `
      + `(sah=${B.isShapeValid(f)}, volume naik=${naik})`);
  }
  return f;
}

let berfillet;
let catatanFillet;
try {
  berfillet = buatFlangeFinal();
  catatanFillet = `fillet ${R_FILLET} mm diterapkan ke SEMUA ${B.getEdges(padat).length} tepi`
    + ` — ${B.getEdges(berfillet).length} tepi sesudahnya`;
} catch (e) {
  berfillet = padat;
  catatanFillet = `fillet ${R_FILLET} mm gagal: ${e.message}`;
}
console.log(catatanFillet);

/* ── Ukuran EKSAK dari kernel, bukan dari poligon ────────────────────── */
const volume = B.measureVolume(berfillet);
const luas = B.measureArea(berfillet);

/* Volume yang dihitung tangan, sebagai pemeriksa silang. Fillet mengurangi
   sedikit, jadi angka analitik ini batas ATAS dan selisihnya harus kecil. */
const L = Math.PI / 4;
const analitik = (L * D_LUAR ** 2 - L * D_BOR ** 2 - N_BAUT * L * D_BAUT ** 2) * TEBAL;

console.log(`\n── ukuran eksak (b-rep) ──`);
console.log(`volume  ${bulat(volume)} mm³`);
console.log(`luas    ${bulat(luas)} mm²`);
console.log(`analitik tanpa fillet ${bulat(analitik)} mm³ · selisih ${bulat(analitik - volume)} mm³ (${bulat((analitik - volume) / analitik * 100, 4)}%)`);

/* ── Inilah argumennya: mesh HANYA MENGHAMPIRI ─────────────────────────
 *
 * Tiap toleransi memberi volume yang BERBEDA, dan tidak satu pun sama dengan
 * yang eksak.
 *
 * PENTING, dan versi pertama berkas ini salah di sini: flange-nya HARUS
 * dibangun ulang tiap baris. OCCT menyimpan triangulasi di dalam shape dan
 * `BRepMesh` hanya pernah MEMPERHALUS, tidak pernah memperkasar — jadi
 * memanggil `meshShape` berulang pada shape yang sama menghasilkan tabel
 * yang tampak masuk akal dan sepenuhnya palsu: tiap baris mewarisi mesh
 * baris sebelumnya. `clearMeshCache()` tidak menolong; ia membersihkan cache
 * sisi JS, bukan triangulasi di dalam shape-nya. */
console.log(`
── mesh: hampiran, dan ongkosnya ──`);
console.log(`(dibandingkan terhadap b-rep ${berfillet === padat ? 'TANPA' : 'ber'}fillet — pabrik yang sama dengan berkas keluarannya)`);
console.log('toleransi  sudut   segitiga   volume mm³     galat vs eksak');
for (const b of bandingkanTesselasi(B, berfillet === padat ? buatFlange : buatFlangeFinal)) {
  console.log(
    String(b.tolerance).padEnd(10),
    String(b.angularTolerance).padEnd(7),
    String(b.segitiga).padStart(8),
    bulat(b.volume).toString().padStart(14),
    `   ${b.galat_persen > 0 ? '+' : ''}${bulat(b.galat_persen, 4)}%`,
  );
}

/* ── Keluaran: STEP untuk manufaktur, GLB untuk web ──────────────────── */
const KELUAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.rupa3d', 'cad');
mkdirSync(KELUAR, { recursive: true });

const tulis = async (nama, hasil) => {
  const b = buka(hasil);
  const buf = Buffer.from(await (b.arrayBuffer ? b.arrayBuffer() : b));
  const jalur = path.join(KELUAR, nama);
  writeFileSync(jalur, buf);
  console.log(`${nama.padEnd(16)} ${(buf.length / 1024).toFixed(1)} KB`);
};

console.log(`\n── keluaran ──`);
/* Perbedaan yang mudah terlewat, dan tidak disebut pesan galatnya:
   `exportSTEP` menerima SHAPE (b-rep), sedangkan `exportGlb`/`exportGltf`/
   `exportSTL` menerima MESH — mereka butuh vertices/normals/triangles yang
   sudah jadi. Menyerahkan shape ke sana gagal jauh di dalam dengan
   "Cannot read properties of undefined (reading 'byteLength')".

   Pembagian itu memang benar dan bukan kerepotan: STEP menyimpan geometri
   EKSAK, glTF menyimpan HAMPIRAN. Jadi toleransi tesselasinya harus disebut
   di sini, sebagai keputusan yang sadar. */
const TOL_WEB = 0.05;   // mm — di bawah ketebalan lapis cetak 3D biasa
const meshWeb = B.meshShape(berfillet, { tolerance: TOL_WEB, angularTolerance: 0.2 });
await tulis('flange.step', B.exportSTEP(berfillet));
await tulis('flange.glb', B.exportGlb(meshWeb));
/* Dan `exportSTL` justru menerima SHAPE — kebalikan dari `exportGlb`. Ia
   memanggil BRepMesh sendiri di dalam. API-nya memang tidak seragam, jadi
   ketiganya ditulis berdampingan di sini supaya bedanya terlihat sekali baca:
     exportSTEP(shape)  ·  exportGlb(mesh)  ·  exportSTL(shape, {tolerance}) */
await tulis('flange.stl', B.exportSTL(berfillet, { tolerance: TOL_WEB }));
console.log(`(GLB & STL ditesselasi pada ${TOL_WEB} mm · ${meshWeb.triangles.length / 3} segitiga)`);
console.log(`\nSTEP = b-rep eksak, dibaca setiap CAD profesional dan bengkel CNC.`);
console.log(`GLB  = mesh hampiran, untuk three.js/web.`);
