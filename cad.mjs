/* Kernel B-REP — sisi CAD Rupa3D, di samping Blender.
 *
 * ── Kenapa ada DUA kernel, dan bukan satu ────────────────────────────────
 *
 * Blender menyimpan bentuk sebagai MESH: segitiga. Mesh hanya bisa
 * MENGHAMPIRI permukaan lengkung, dan tidak punya tempat untuk menyimpan
 * toleransi. Itu cukup untuk seni, animasi, game, dan web.
 *
 * Ia TIDAK cukup untuk cabang Engineering Design — mesin pembakaran, dryer,
 * screw extruder, heat exchanger. Flange yang harus pas dengan baut M10 pada
 * ±0,1 mm bukan "sulit" di Blender; ia mustahil, karena angkanya tidak punya
 * tempat tinggal.
 *
 * B-rep menyimpan silinder sebagai SILINDER — permukaan analitik, graf
 * topologi, berikut toleransinya. Terukur pada flange uji:
 *
 *     volume b-rep  143954,059 mm³   =  analitik  143954,059 mm³   (selisih 0)
 *     mesh tol 1,00                     −0,3726 %
 *     mesh tol 0,02                     −0,0029 %
 *
 * Mesh tidak pernah tepat, berapa pun toleransinya diperkecil. Itulah
 * seluruh argumennya, dan itu bisa diukur.
 *
 * ── Menyalakan OCCT di Node ──────────────────────────────────────────────
 *
 * Glue emscripten `brepjs-opencascade` diakhiri `export default Module`,
 * jadi Node SELALU mem-parsingnya sebagai ESM — apa pun jalur impornya, dan
 * meski dipaksa lewat `require()` dengan jalur absolut. Di ESM tidak ada
 * `__dirname` maupun `require`, dan glue itu memakai keduanya untuk menemukan
 * berkas .wasm. Karena keduanya dicari di lingkup GLOBAL, menyediakannya di
 * sana sudah cukup. Tanpa itu: "__dirname is not defined", lalu
 * "require is not defined" — keduanya tanpa menyebut sebabnya.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/* Letak glue-nya DITANYAKAN ke resolver Node, bukan ditebak dari letak berkas
 * ini. Tebakan lama — `<folder ini>/node_modules/brepjs-opencascade/src` —
 * cuma benar di checkout repo. Begitu Rupa3D dipasang sebagai paket npm
 * (`npx rupa3d`, atau sebagai dependensi), npm meletakkan dependensinya
 * SEJAJAR dengan paket ini, bukan di dalamnya, dan tool CAD mati di mesin
 * semua orang kecuali pemiliknya. Terukur 14 Sep pada paket yang dipasang
 * npx dengan kode lama: `rupa_cad_bentuk` → "Aborted(Error: ENOENT: no such
 * file or directory, open '…/rupa3d/node_modules/brepjs-opencascade/…')". */
const GLUE_OC = fileURLToPath(import.meta.resolve('brepjs-opencascade'));
const DIR_OC = path.dirname(GLUE_OC);

let _siap = null;

/** Nyalakan kernel sekali, pakai berkali-kali. ±0,4 detik. */
export async function kernel() {
  if (_siap) return _siap;
  _siap = (async () => {
    globalThis.__dirname = DIR_OC;
    globalThis.__filename = GLUE_OC;
    globalThis.require = createRequire(path.join(DIR_OC, 'x.cjs'));
    const oc = await (await import('brepjs-opencascade')).default();
    const B = await import('brepjs');
    B.initFromOC(oc);
    return { B, oc, kelas: Object.keys(oc).length };
  })();
  return _siap;
}

/** brepjs mengembalikan Result `{ok, value}` / `{ok:false, error}`.
 *
 *  Kegagalan HARUS berbunyi di tempat ia terjadi. Versi pertama helper ini
 *  cuma mengecek adanya `value`, jadi hasil gagal diam-diam jadi `undefined`
 *  — tanpa exception, tanpa gejala — sampai `measureVolume` meledak jauh di
 *  hilir dengan pesan yang tidak menyebut sebabnya. */
export function buka(r, B) {
  if (!r || typeof r !== 'object' || !('ok' in r)) return r;
  if (r.ok === false) {
    const e = r.error;
    throw new Error(typeof e === 'string' ? e : (e?.message ?? JSON.stringify(e)));
  }
  return B.unwrap(r);
}

/** Volume mesh dari segitiga bertanda — untuk MEMBANDINGKAN dengan yang eksak. */
export function volumeMesh(m) {
  const p = m.vertices, idx = m.triangles;
  if (!p || !idx) return null;
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return Math.abs(v);
}

/** Bandingkan ongkos hampiran pada beberapa toleransi — dengan SHAPE BARU tiap kali.
 *
 *  ── Jebakan yang membuat fungsi ini ada ─────────────────────────────────
 *
 *  OCCT menyimpan triangulasi DI DALAM shape-nya (`Poly_Triangulation` yang
 *  menempel pada `TopoDS_Shape`), dan `BRepMesh_IncrementalMesh` hanya pernah
 *  MEMPERHALUS — ia tidak pernah memperkasar. Akibatnya, memanggil
 *  `meshShape` berulang kali pada shape yang SAMA memberi tabel yang tampak
 *  masuk akal dan sepenuhnya palsu: tiap baris mewarisi mesh baris sebelumnya.
 *
 *  Terukur: shape yang sama, tol 1,0 lalu 0,003, lalu `clearMeshCache()` dan
 *  tol 1,0 lagi — hasilnya TETAP 1004 segitiga, bukan kembali ke 100.
 *  `clearMeshCache()` membersihkan cache sisi JS, bukan triangulasi di dalam
 *  shape-nya.
 *
 *  Satu-satunya cara mengukurnya jujur: bangun ulang shape-nya tiap baris.
 *  Itu sebabnya fungsi ini menerima PABRIK, bukan shape.
 *
 *  @param {() => object} buatShape pabrik yang mengembalikan shape BARU
 */
export function bandingkanTesselasi(B, buatShape, daftar = [
  { tolerance: 1.0, angularTolerance: 0.5 },
  { tolerance: 0.1, angularTolerance: 0.3 },
  { tolerance: 0.03, angularTolerance: 0.2 },
  { tolerance: 0.003, angularTolerance: 0.05 },
]) {
  const eksak = B.measureVolume(buatShape());
  return daftar.map((opsi) => {
    const m = B.meshShape(buatShape(), opsi);
    const vm = volumeMesh(m);
    return {
      ...opsi,
      segitiga: m.triangles.length / 3,
      volume: vm,
      galat_persen: ((vm - eksak) / eksak) * 100,
    };
  });
}

/** Ukuran EKSAK sebuah shape, plus ongkos hampiran meshnya pada satu toleransi.
 *
 *  Dua angka itu selalu dilaporkan bersama, disengaja: yang eksak sendirian
 *  tidak memberi tahu berapa yang HILANG saat bentuknya dikirim ke web. */
export function ukur(B, shape, toleransi = 0.05) {
  const volume = B.measureVolume(shape);
  const luas = B.measureArea(shape);
  const m = B.meshShape(shape, { tolerance: toleransi, angularTolerance: 0.2 });
  const vm = volumeMesh(m);
  return {
    volume_eksak: volume,
    luas_eksak: luas,
    mesh: {
      toleransi,
      segitiga: m.triangles.length / 3,
      simpul: m.vertices.length / 3,
      volume: vm,
      galat_persen: vm == null ? null : ((vm - volume) / volume) * 100,
    },
  };
}

/** Pembagian yang mudah terlewat, dan tidak disebut pesan galatnya:
 *
 *      exportSTEP(shape)   b-rep EKSAK — untuk CAD & CNC
 *      exportSTL(shape, {tolerance})
 *      exportGlb(MESH)     hampiran   — untuk three.js/web
 *      exportGltf(MESH)
 *
 *  Menyerahkan shape ke `exportGlb` gagal jauh di dalam dengan
 *  "Cannot read properties of undefined (reading 'byteLength')". */
export async function keBita(hasil, B) {
  const b = buka(hasil, B);
  return Buffer.from(await (b.arrayBuffer ? b.arrayBuffer() : b));
}
