/* DRACO — pintu masuk yang selama ini tertutup diam-diam.
 *
 * ── Apa yang terjadi SEBELUM berkas ini ada ──────────────────────────────
 *
 * GLB terkompres Draco menyimpan geometrinya di dalam ekstensi
 * `KHR_draco_mesh_compression`, dan accessor-nya TIDAK punya `bufferView` —
 * bidang itu memang sengaja dikosongkan spesifikasinya. `bacaAccessor`
 * mengembalikan `null`, dan `if (!pos) continue` melewatinya tanpa suara.
 *
 * Terukur pada satu bola 2.208 segitiga, diekspor dua kali dari adegan yang
 * SAMA (154,9 KB polos vs 22,5 KB Draco), sebelum ditambal:
 *
 *   kotakBatasGLB   2,000 x 2,000 x 2,000   <- BENAR
 *   meshGLB         0 primitif, 0 dilewati  <- sukses palsu, kosong
 *   topologiGLB     melempar "tidak ada primitif segitiga"
 *   titikGLB        melempar TypeError telanjang soal `byteOffset`
 *
 * Empat pembaca, empat perilaku berbeda, dan TIDAK SATU PUN menyebut Draco.
 * Yang paling berbahaya justru yang pertama: kotak batasnya BENAR, karena
 * accessor `min`/`max` tetap ditulis di GLB Draco. Pemanggil yang memakainya
 * mendapat jawaban yang masuk akal dan menyimpulkan berkasnya terbaca.
 *
 * Dan ini bukan sekadar soal pesan galat. `extensionsRequired` berisi
 * `KHR_draco_mesh_compression`, dan spesifikasi glTF menyatakan pembaca yang
 * tidak mendukung ekstensi WAJIB harus MENOLAK berkasnya. Mengembalikan nol
 * primitif adalah pelanggaran spek, bukan kekurangan fitur.
 *
 * ── Kenapa memakai dekoder Google, bukan menulis sendiri ─────────────────
 *
 * `png.mjs` di repo ini ditulis sendiri, dan itu keputusan yang benar: PNG
 * terspesifikasi lengkap dan dekodernya sekitar 150 baris.
 *
 * Draco lain: ia memampatkan KONEKTIVITAS dengan edgebreaker dan atributnya
 * dengan prediksi paralelogram di atas pengkode entropi rANS. Menulisnya
 * ulang adalah proyek ribuan baris yang salahnya halus dan tidak berbunyi —
 * persis jenis kesalahan yang alat ini ada untuk mencegahnya.
 *
 * Jadi yang dipakai dekoder resmi Google (WASM, sama dengan yang dipakai
 * three.js dan Blender), dan yang DIBUKTIKAN bukan dekodernya melainkan
 * hasilnya: aset yang sama diekspor dua kali, lalu dibandingkan verteks demi
 * verteks. Uji itu ada di `test-draco.mjs`.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Nama ekstensinya, dieja sekali supaya salah ketik tidak jadi "tidak ada". */
export const EKSTENSI = 'KHR_draco_mesh_compression';

let modulP = null;
let modulSiap = null;

/** Modul dekoder Draco, dinyalakan sekali lalu dipakai ulang.
 *
 *  Sama seperti kernel OCCT: mahal sekali, nol sesudahnya. */
export async function dekoder() {
  if (!modulP) {
    const draco3d = require('draco3d');
    modulP = draco3d.createDecoderModule({}).then((m) => { modulSiap = m; return m; });
  }
  return modulP;
}

/** Siapkan dekodernya supaya pembaca GLB yang SINKRON bisa memakainya.
 *
 *  Pembaca GLB di repo ini sinkron sejak awal, dan WASM menuntut `await`
 *  sekali di awal. Alih-alih membuat seluruh rantai pembaca jadi asinkron —
 *  perubahan yang menyentuh belasan berkas untuk imbalan nol — dekodernya
 *  disiapkan lebih dulu, persis pola `siap()` di `fisika.mjs`.
 *
 *  Yang TIDAK dilakukan: menghampiri diam-diam kalau belum siap. Pembaca yang
 *  menemukan primitif Draco tanpa dekoder siap MELEMPAR dengan menyebut
 *  keduanya — apa yang ditemukan, dan apa yang harus dipanggil. */
export async function siapkanDraco() {
  await dekoder();
  return true;
}

/** Modul yang sudah siap, atau `null`. Sinkron, untuk pembaca sinkron. */
export function dracoSiap() { return modulSiap; }

/**
 * Apakah berkas glTF ini memakai Draco, dan seberapa mengikat.
 *
 * @returns {{ dipakai: boolean, wajib: boolean, primitif: number,
 *             primitif_total: number, catatan: string|null }}
 */
export function periksaDraco(json) {
  const dipakai = (json.extensionsUsed ?? []).includes(EKSTENSI);
  const wajib = (json.extensionsRequired ?? []).includes(EKSTENSI);
  let primitif = 0;
  let total = 0;
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      total++;
      if (p.extensions?.[EKSTENSI]) primitif++;
    }
  }
  return {
    dipakai: dipakai || primitif > 0,
    wajib,
    primitif,
    primitif_total: total,
    catatan: primitif > 0
      ? `${primitif} dari ${total} primitif terkompres Draco`
        + (wajib ? ' — dan ekstensinya WAJIB, jadi berkas ini tidak sah dibaca tanpa dekodernya' : '')
      : null,
  };
}

/* Peta tipe komponen glTF -> pembaca larik Draco yang sepadan.
   Yang tidak ada di sini DITOLAK dengan menyebut angkanya, bukan dihampiri:
   membaca 16-bit sebagai 32-bit menghasilkan angka yang salah tanpa galat. */
const KOMPONEN = {
  5120: 'Int8', 5121: 'UInt8', 5122: 'Int16',
  5123: 'UInt16', 5125: 'UInt32', 5126: 'Float32',
};
const JUMLAH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * Uraikan satu primitif ber-Draco.
 *
 * @param {object} d      modul dekoder dari `dekoder()`
 * @param {object} json   JSON glTF
 * @param {Buffer} bin    chunk biner GLB
 * @param {object} prim   primitif glTF-nya
 * @returns {{ atribut: Record<string, Float32Array|Uint32Array>,
 *             indeks: Uint32Array, verteks: number, segitiga: number }}
 */
export function uraikanPrimitif(d, json, bin, prim) {
  const ext = prim.extensions?.[EKSTENSI];
  if (!ext) throw new Error('primitif ini tidak ber-Draco');

  const bv = json.bufferViews[ext.bufferView];
  const awal = bv.byteOffset ?? 0;
  const bita = new Int8Array(bin.buffer, bin.byteOffset + awal, bv.byteLength);

  const buf = new d.DecoderBuffer();
  buf.Init(bita, bita.length);
  const dec = new d.Decoder();

  const jenis = dec.GetEncodedGeometryType(buf);
  if (jenis !== d.TRIANGULAR_MESH) {
    d.destroy(buf); d.destroy(dec);
    throw new Error(`geometri Draco bukan mesh segitiga (jenis ${jenis}) — `
      + 'awan titik belum ditangani, dan menghampirinya sebagai mesh akan '
      + 'menghasilkan topologi yang dikarang');
  }

  const mesh = new d.Mesh();
  const st = dec.DecodeBufferToMesh(buf, mesh);
  if (!st.ok()) {
    const pesan = st.error_msg();
    d.destroy(mesh); d.destroy(buf); d.destroy(dec);
    throw new Error(`Draco menolak menguraikan: ${pesan}`);
  }

  const verteks = mesh.num_points();
  const segitiga = mesh.num_faces();

  // ── Indeks ────────────────────────────────────────────────────────────
  const idxPtr = d._malloc(segitiga * 3 * 4);
  dec.GetTrianglesUInt32Array(mesh, segitiga * 3 * 4, idxPtr);
  const indeks = new Uint32Array(
    d.HEAPU32.buffer, idxPtr, segitiga * 3,
  ).slice();
  d._free(idxPtr);

  // ── Atribut ───────────────────────────────────────────────────────────
  const atribut = {};
  for (const [nama, idAtribut] of Object.entries(ext.attributes ?? {})) {
    const acc = json.accessors?.[prim.attributes?.[nama]];
    if (!acc) continue;
    const komp = JUMLAH[acc.type] ?? 1;
    const jenisKomp = KOMPONEN[acc.componentType];
    if (!jenisKomp) {
      throw new Error(`tipe komponen ${acc.componentType} tidak dikenal pada atribut ${nama}`);
    }
    const at = dec.GetAttributeByUniqueId(mesh, idAtribut);
    if (!at) continue;

    /* `GetAttributeDataArrayForAllPoints` dengan tipe yang DIMINTA accessor,
       bukan tipe simpanan Draco. Draco boleh menyimpan posisi sebagai
       bilangan bulat terkuantisasi; yang diminta di sini float, dan
       dekodernya yang mengembalikan skalanya. Meminta tipe yang salah
       menghasilkan angka yang masuk akal dan salah. */
    const lebar = jenisKomp === 'Float32' || jenisKomp === 'UInt32' || jenisKomp === 'Int32'
      ? 4 : (jenisKomp === 'UInt16' || jenisKomp === 'Int16' ? 2 : 1);
    const n = verteks * komp;
    const ptr = d._malloc(n * lebar);
    dec[`GetAttributeDataArrayForAllPoints`](
      mesh, at, d[`DT_${jenisKomp.toUpperCase()}`], n * lebar, ptr,
    );
    const heap = {
      Float32: d.HEAPF32, UInt32: d.HEAPU32, Int32: d.HEAP32,
      UInt16: d.HEAPU16, Int16: d.HEAP16, UInt8: d.HEAPU8, Int8: d.HEAP8,
    }[jenisKomp];
    atribut[nama] = heap.subarray(ptr / lebar, ptr / lebar + n).slice();
    d._free(ptr);
  }

  d.destroy(mesh);
  d.destroy(buf);
  d.destroy(dec);
  return { atribut, indeks, verteks, segitiga };
}
