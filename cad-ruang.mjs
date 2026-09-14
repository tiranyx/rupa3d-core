/* Ruang kerja CAD — shape b-rep bernama yang bertahan lintas panggilan.
 *
 * ── Masalah yang berkas ini pecahkan ─────────────────────────────────────
 *
 * `cad.mjs` bekerja di dalam SATU proses: bangun shape, ukur, ekspor. Itu
 * cukup untuk skrip. Ia tidak cukup untuk MCP, karena tiap panggilan tool
 * adalah percakapan tersendiri — shape yang dibuat panggilan pertama sudah
 * hilang saat panggilan kedua datang.
 *
 * Blender memecahkannya dengan menyimpan `adegan.blend`. Sisi CAD memakai
 * cara yang setara: `serializeShape` menulis b-rep utuh sebagai teks, dan
 * putar-baliknya TIDAK menggeser volume sedikit pun — terukur 0 selisih pada
 * kotak dan silinder. Kalau ia menggeser walau sedikit, seluruh alasan
 * memakai b-rep hilang; mesh juga bisa "hampir benar".
 *
 * ── Pendirian yang dipasang di sini ──────────────────────────────────────
 *
 *   `ok: true` dari kernel BUKAN bukti bentuknya sah.
 *
 * Terukur pada kotak 10×20×30 (volume 6000 mm³, sisi terkecil 10 sehingga
 * batas fillet teoretisnya tepat 5):
 *
 *     r  = 4,99   ok     volume 4883,94   isShapeValid true    ← benar
 *     r  = 5      GAGAL bersih                                 ← jujur
 *     r  = 5,001  ok     volume 7971,72   isShapeValid FALSE   ← BOHONG
 *
 * Fillet yang MENAMBAH 1971 mm³ material ke sebuah kotak adalah mustahil:
 * fillet hanya membuang di tepi cembung. Kernelnya tetap bilang `ok`.
 *
 * Alat yang meneruskan hasil itu ke STEP akan mengirim berkas rusak ke CNC,
 * dan rusaknya baru ketahuan di mesin. Jadi tiap operasi di sini diperiksa
 * DUA kali, dengan dua alat yang saling bebas:
 *
 *   1. `isShapeValid` — pemeriksa topologi OCCT sendiri
 *   2. arah volume    — fillet/chamfer/potong WAJIB mengurangi
 *
 * Yang gagal tidak pernah sempat tersimpan.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { kernel, buka, volumeMesh } from './cad.mjs';

const EKST = '.brep';

/* Nama bentuk ikut aturan yang sama dengan nama ruang Blender: satu segmen,
   tanpa pemisah jalur. Bukan kerapian — `../` di nama bentuk berarti alat ini
   bisa menulis ke mana saja di cakram pemanggilnya. */
const NAMA_SAH = /^[A-Za-z0-9._-]{1,64}$/;
function periksaNama(nama) {
  if (typeof nama !== 'string' || !NAMA_SAH.test(nama) || nama === '.' || nama === '..') {
    throw new Error(`nama bentuk tidak sah: ${JSON.stringify(nama)}`);
  }
  return nama;
}

/** Nyalakan kernel dan siapkan direktori bentuk. Kernelnya di-cache global. */
export async function bukaRuang(dir) {
  const { B, oc } = await kernel();
  const bentukDir = path.join(path.resolve(dir), 'cad');
  mkdirSync(bentukDir, { recursive: true });
  return { B, oc, dir: path.resolve(dir), bentukDir };
}

const jalurBentuk = (r, nama) => path.join(r.bentukDir, periksaNama(nama) + EKST);

/** Baca shape dari cakram. Bentuk yang tidak ada BERBUNYI, tidak diam. */
export function ambil(r, nama) {
  const p = jalurBentuk(r, nama);
  if (!existsSync(p)) throw new Error(`bentuk tidak ada: ${nama}`);
  return buka(r.B.deserializeShape(readFileSync(p, 'utf8')), r.B);
}

function tulis(r, nama, shape) {
  writeFileSync(jalurBentuk(r, nama), r.B.serializeShape(shape), 'utf8');
}

/**
 * Gerbang tunggal yang dilewati SETIAP hasil operasi sebelum tersimpan.
 *
 * @param {string} operasi        untuk pesan galat
 * @param {number} [volumeSebelum]
 * @param {'turun'|'naik'|'bebas'} [arah] arah volume yang wajar untuk operasi ini
 */
function periksaHasil(r, shape, { operasi, volumeSebelum = null, arah = 'bebas' }) {
  const sah = r.B.isShapeValid(shape);
  const volume = r.B.measureVolume(shape);

  if (!sah) {
    throw new Error(
      `${operasi}: kernel mengembalikan ok tetapi bentuknya TIDAK SAH `
      + `(isShapeValid=false, volume ${volume.toFixed(4)}). Hasil tidak disimpan.`);
  }
  if (volumeSebelum != null && arah !== 'bebas') {
    const naik = volume > volumeSebelum + 1e-9;
    const turun = volume < volumeSebelum - 1e-9;
    if (arah === 'turun' && naik) {
      throw new Error(
        `${operasi}: volume NAIK ${volumeSebelum.toFixed(4)} → ${volume.toFixed(4)}, `
        + `padahal operasi ini hanya bisa membuang material. Hasil tidak disimpan.`);
    }
    if (arah === 'naik' && turun) {
      throw new Error(
        `${operasi}: volume TURUN ${volumeSebelum.toFixed(4)} → ${volume.toFixed(4)}, `
        + `padahal operasi ini hanya bisa menambah material. Hasil tidak disimpan.`);
    }
  }
  return { sah, volume };
}

/** Ringkasan yang dikembalikan tiap operasi — selalu berisi ANGKA, bukan "ok". */
function ringkasan(r, nama, shape, tambahan = {}) {
  return {
    nama,
    volume_eksak: r.B.measureVolume(shape),
    luas_eksak: r.B.measureArea(shape),
    sah: r.B.isShapeValid(shape),
    tepi: r.B.getEdges(shape).length,
    ...tambahan,
  };
}

/* ── Primitif ──────────────────────────────────────────────────────────── */

const PRIMITIF = {
  kotak: (B, p) => {
    const [x, y, z] = p.ukuran ?? [1, 1, 1];
    const c = p.pusat ?? [0, 0, 0];
    return B.makeBox(c, [c[0] + x, c[1] + y, c[2] + z]);
  },
  silinder: (B, p) => B.makeCylinder(p.jari, p.tinggi, p.pusat ?? [0, 0, 0], p.arah ?? [0, 0, 1]),
  bola: (B, p) => {
    const s = B.makeSphere(p.jari);
    return p.pusat ? B.translateShape(s, p.pusat) : s;
  },
  kerucut: (B, p) => B.makeCone(p.jari_bawah ?? p.jari, p.jari_atas ?? 0, p.tinggi,
    p.pusat ?? [0, 0, 0], p.arah ?? [0, 0, 1]),
  torus: (B, p) => B.makeTorus(p.jari_besar, p.jari_kecil, p.pusat ?? [0, 0, 0], p.arah ?? [0, 0, 1]),
  elipsoid: (B, p) => {
    const s = B.makeEllipsoid(...(p.sumbu ?? [1, 1, 1]));
    return p.pusat ? B.translateShape(s, p.pusat) : s;
  },
};

export const JENIS_PRIMITIF = Object.keys(PRIMITIF);

/** Buat primitif dan simpan dengan nama. Volumenya EKSAK, bukan hampiran. */
export async function primitif(r, nama, param) {
  periksaNama(nama);
  const buat = PRIMITIF[param?.jenis];
  if (!buat) {
    throw new Error(`jenis primitif tidak dikenal: ${param?.jenis}. `
      + `Yang ada: ${JENIS_PRIMITIF.join(', ')}`);
  }
  const shape = buat(r.B, param);
  periksaHasil(r, shape, { operasi: `primitif ${param.jenis}` });
  tulis(r, nama, shape);
  return ringkasan(r, nama, shape, { jenis: param.jenis });
}

/* ── Boolean ───────────────────────────────────────────────────────────── */

const BOOLEAN = {
  potong: { fn: 'cutShape', arah: 'turun' },
  gabung: { fn: 'fuseShapes', arah: 'naik' },
  iris: { fn: 'intersectShapes', arah: 'turun' },
};

/**
 * Dua shape jadi satu. Arah volumenya diperiksa, dan itu bukan formalitas:
 * boolean yang gagal separuh sering mengembalikan salah satu operand utuh,
 * yang tampak "berhasil" sampai ada yang mengukurnya.
 */
export async function boolean2(r, operasi, namaA, namaB, { ke } = {}) {
  const spek = BOOLEAN[operasi];
  if (!spek) throw new Error(`operasi boolean tidak dikenal: ${operasi}. Yang ada: ${Object.keys(BOOLEAN).join(', ')}`);
  const tujuan = periksaNama(ke ?? namaA);
  const a = ambil(r, namaA);
  const b = ambil(r, namaB);
  const vA = r.B.measureVolume(a);

  const hasil = buka(r.B[spek.fn](a, b), r.B);
  periksaHasil(r, hasil, { operasi: `${operasi} ${namaA}/${namaB}`, volumeSebelum: vA, arah: spek.arah });
  tulis(r, tujuan, hasil);
  return ringkasan(r, tujuan, hasil, { operasi, dari: [namaA, namaB], volume_sebelum: vA });
}

/* ── Tepi: melihat sebelum memilih ─────────────────────────────────────── */

/** Arah sebuah tepi lurus, atau 'lengkung' kalau ujungnya berimpit. */
function arahTepi(B, e) {
  const a = B.curveStartPoint(e);
  const b = B.curveEndPoint(e);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const p = Math.hypot(...d);
  if (p < 1e-9) return 'lengkung';
  const n = d.map((x) => Math.abs(x) / p);
  const i = n.findIndex((x) => x > 1 - 1e-6);
  return i < 0 ? 'miring' : 'XYZ'[i];
}

/**
 * Daftar tepi berikut arahnya — supaya fillet selektif bisa DILIHAT dulu,
 * bukan ditebak. Tanpa ini "fillet tepi tegak saja" berarti menebak indeks.
 */
export async function tepiBentuk(r, nama) {
  const s = ambil(r, nama);
  const tepi = r.B.getEdges(s);
  const per = {};
  const rinci = tepi.map((e, i) => {
    const arah = arahTepi(r.B, e);
    per[arah] = (per[arah] ?? 0) + 1;
    return { indeks: i, arah, panjang: r.B.measureLength(e), mulai: r.B.curveStartPoint(e) };
  });
  return { nama, jumlah: tepi.length, per_arah: per, tepi: rinci };
}

/** Tepi mana yang kena — `undefined` berarti SEMUA (itu arti brepjs juga). */
function pilihTepi(r, shape, opsi) {
  const semua = r.B.getEdges(shape);
  if (Array.isArray(opsi.tepi)) {
    const dipilih = opsi.tepi.map((i) => {
      if (!Number.isInteger(i) || i < 0 || i >= semua.length) {
        throw new Error(`indeks tepi di luar jangkauan: ${i} (ada ${semua.length} tepi)`);
      }
      return semua[i];
    });
    return { tepi: dipilih, jumlah: dipilih.length };
  }
  if (opsi.arah) {
    const dipilih = semua.filter((e) => arahTepi(r.B, e) === opsi.arah);
    if (!dipilih.length) {
      throw new Error(`tidak ada tepi berarah ${opsi.arah}; `
        + `yang ada: ${JSON.stringify((({ per_arah }) => per_arah)({
          per_arah: semua.reduce((m, e) => { const a = arahTepi(r.B, e); m[a] = (m[a] ?? 0) + 1; return m; }, {}),
        }))}`);
    }
    return { tepi: dipilih, jumlah: dipilih.length };
  }
  return { tepi: undefined, jumlah: semua.length };
}

/* ── Fillet & chamfer ──────────────────────────────────────────────────── */

/**
 * ── Urutan argumen yang membuat saya salah selama dua hari ──────────────
 *
 *     filletShape(shape, edges, radius)
 *
 * Saya memanggilnya `filletShape(padat, R_FILLET)` — radius masuk ke slot
 * `edges`, dan `radius` jadi `undefined`. Kegagalannya berbunyi "Fillet
 * operation failed", yang terdengar seperti kernel menolak geometrinya. Saya
 * mencatatnya sebagai utang "fillet semua-tepi ditolak kernel pada flange",
 * padahal ia gagal pada KOTAK POLOS di setiap radius.
 *
 * indikator · pesan galat kernel yang generik pada geometri yang sederhana
 * parameter · urutan argumen
 * faktor-X  · "kernel menolak" terdengar seperti keterangan sebab, padahal
 *             ia cuma keterangan gejala
 *
 * Ujinya sekarang memakai KOTAK, bukan flange. Kalau fillet gagal pada kotak
 * 10×20×30, yang salah pemanggilnya — bukan geometrinya.
 */
export async function fillet(r, nama, { radius, ke, arah, tepi } = {}) {
  return _bulatkan(r, 'fillet', 'filletShape', nama, radius, { ke, arah, tepi });
}

export async function chamfer(r, nama, { jarak, ke, arah, tepi } = {}) {
  return _bulatkan(r, 'chamfer', 'chamferShape', nama, jarak, { ke, arah, tepi });
}

function _bulatkan(r, label, fn, nama, ukur_, { ke, arah, tepi }) {
  if (!(ukur_ > 0)) throw new Error(`${label}: ukurannya harus lebih besar dari 0, dapat ${ukur_}`);
  const tujuan = periksaNama(ke ?? nama);
  const s = ambil(r, nama);
  const vSebelum = r.B.measureVolume(s);
  const dipilih = pilihTepi(r, s, { arah, tepi });

  const hasil = buka(r.B[fn](s, dipilih.tepi, ukur_), r.B);
  periksaHasil(r, hasil, {
    operasi: `${label} ${nama} (${ukur_})`, volumeSebelum: vSebelum, arah: 'turun',
  });
  tulis(r, tujuan, hasil);
  return ringkasan(r, tujuan, hasil, {
    operasi: label, dari: nama, ukuran: ukur_,
    tepi_difillet: dipilih.jumlah, volume_sebelum: vSebelum,
  });
}

/* ── Transformasi ──────────────────────────────────────────────────────── */

/**
 * Geser, putar, skala, cermin. Volumenya diperiksa terhadap yang DIHARAPKAN
 * secara matematis — geser dan putar tidak boleh mengubahnya sama sekali,
 * skala mengubahnya pangkat tiga. Transformasi yang menggeser volume adalah
 * gejala matriks yang salah, dan itu tidak terlihat sampai ada yang mengukur.
 */
export async function ubah(r, nama, { geser, putar, skala, cermin, ke } = {}) {
  const tujuan = periksaNama(ke ?? nama);
  let s = ambil(r, nama);
  const vSebelum = r.B.measureVolume(s);
  let faktorVolume = 1;
  const dilakukan = [];

  if (geser) { s = r.B.translateShape(s, geser); dilakukan.push(`geser ${geser}`); }
  if (putar) {
    const { sudut, sumbu = [0, 0, 1], titik = [0, 0, 0] } = putar;
    s = r.B.rotateShape(s, sudut, titik, sumbu);
    dilakukan.push(`putar ${sudut}° pada ${sumbu}`);
  }
  if (skala != null) {
    if (!(skala > 0)) throw new Error(`skala harus lebih besar dari 0, dapat ${skala}`);
    s = r.B.scaleShape(s, skala);
    faktorVolume *= skala ** 3;
    dilakukan.push(`skala ${skala}×`);
  }
  if (cermin) { s = r.B.mirrorShape(s, cermin.normal ?? [1, 0, 0], cermin.titik ?? [0, 0, 0]); dilakukan.push('cermin'); }
  if (!dilakukan.length) throw new Error('ubah: tidak ada yang diminta (geser/putar/skala/cermin)');

  periksaHasil(r, s, { operasi: `ubah ${nama}` });
  const vSesudah = r.B.measureVolume(s);
  const diharap = vSebelum * faktorVolume;
  const nisbi = Math.abs(vSesudah - diharap) / Math.max(diharap, 1e-12);
  if (nisbi > 1e-6) {
    throw new Error(`ubah ${nama}: volume ${vSesudah.toFixed(6)} melenceng `
      + `${(nisbi * 100).toFixed(6)}% dari yang seharusnya ${diharap.toFixed(6)}. Hasil tidak disimpan.`);
  }

  tulis(r, tujuan, s);
  return ringkasan(r, tujuan, s, { operasi: 'ubah', dari: nama, dilakukan, volume_sebelum: vSebelum });
}

/* ── Ukur & daftar ─────────────────────────────────────────────────────── */

/** Ukuran EKSAK plus ongkos hampiran meshnya — dua angka yang selalu bersama. */
export async function ukurBentuk(r, nama, { toleransi = 0.05 } = {}) {
  const s = ambil(r, nama);
  const volume = r.B.measureVolume(s);
  const m = r.B.meshShape(s, { tolerance: toleransi, angularTolerance: 0.2 });
  const vm = volumeMesh(m);
  const b = r.B.getBounds(s);
  return {
    nama,
    volume_eksak: volume,
    luas_eksak: r.B.measureArea(s),
    sah: r.B.isShapeValid(s),
    tepi: r.B.getEdges(s).length,
    muka: r.B.getFaces(s).length,
    kotak_batas: b,
    mesh: {
      toleransi,
      segitiga: m.triangles.length / 3,
      simpul: m.vertices.length / 3,
      volume: vm,
      galat_persen: vm == null ? null : ((vm - volume) / volume) * 100,
    },
  };
}

/** Semua bentuk di ruang ini, berikut volumenya — bukan cuma namanya. */
export async function daftarBentuk(r) {
  const berkas = readdirSync(r.bentukDir).filter((f) => f.endsWith(EKST));
  const bentuk = berkas.map((f) => {
    const nama = f.slice(0, -EKST.length);
    try {
      const s = ambil(r, nama);
      return {
        nama, volume_eksak: r.B.measureVolume(s), luas_eksak: r.B.measureArea(s),
        sah: r.B.isShapeValid(s), tepi: r.B.getEdges(s).length,
        bita: statSync(path.join(r.bentukDir, f)).size,
      };
    } catch (e) { return { nama, error: e.message }; }
  });
  return { ruang: r.dir, jumlah: bentuk.length, bentuk };
}

/* ── Ekspor & impor ────────────────────────────────────────────────────── */

/* Pembagian yang menentukan, dan tidak disebut pesan galat mana pun:
 *
 *   .step .iges   b-rep EKSAK — permukaan analitik, untuk CAD & CNC
 *   .stl .glb .obj  SEGITIGA  — hampiran, untuk web/cetak
 *
 * Yang kedua SELALU melenceng, berapa pun toleransinya diperkecil. Karena
 * itu galatnya wajib dilaporkan, bukan disembunyikan: "sudah diekspor" tanpa
 * angka adalah kalimat yang tidak bisa dipercaya. */
const EKSAK = new Set(['.step', '.stp', '.iges', '.igs']);

export async function eksporBentuk(r, nama, berkas, { toleransi = 0.05, biner = true } = {}) {
  const s = ambil(r, nama);
  const ext = path.extname(berkas).toLowerCase();
  const volume = r.B.measureVolume(s);
  mkdirSync(path.dirname(path.resolve(berkas)), { recursive: true });

  let isi;
  let galat = null;
  let segitiga = null;

  if (ext === '.step' || ext === '.stp') isi = await _bita(r, r.B.exportSTEP(s));
  else if (ext === '.iges' || ext === '.igs') isi = await _bita(r, r.B.exportIGES(s));
  else if (ext === '.stl') isi = await _bita(r, r.B.exportSTL(s, { tolerance: toleransi, angularTolerance: 0.2, binary: biner }));
  else if (ext === '.glb' || ext === '.gltf' || ext === '.obj') {
    const m = r.B.meshShape(s, { tolerance: toleransi, angularTolerance: 0.2 });
    segitiga = m.triangles.length / 3;
    const vm = volumeMesh(m);
    galat = vm == null ? null : ((vm - volume) / volume) * 100;
    isi = ext === '.obj' ? Buffer.from(r.B.exportOBJ(m), 'utf8') : Buffer.from(r.B.exportGlb(m));
  } else {
    throw new Error(`format tidak didukung: ${ext}. `
      + `Eksak: .step .iges — hampiran: .stl .glb .gltf .obj`);
  }

  if (galat == null && !EKSAK.has(ext)) {
    /* STL juga segitiga; galatnya diukur lewat mesh setara supaya angkanya
       tetap ada, meski OCCT yang menulis berkasnya. */
    const m = r.B.meshShape(s, { tolerance: toleransi, angularTolerance: 0.2 });
    segitiga = m.triangles.length / 3;
    const vm = volumeMesh(m);
    galat = vm == null ? null : ((vm - volume) / volume) * 100;
  }

  writeFileSync(berkas, isi);
  return {
    nama, berkas: path.resolve(berkas), bita: isi.length,
    eksak: EKSAK.has(ext),
    volume_eksak: volume,
    toleransi: EKSAK.has(ext) ? null : toleransi,
    segitiga, galat_persen: galat,
  };
}

async function _bita(r, hasil) {
  const b = buka(hasil, r.B);
  if (typeof b === 'string') return Buffer.from(b, 'utf8');
  if (b instanceof ArrayBuffer) return Buffer.from(b);
  return Buffer.from(await b.arrayBuffer());
}

/** Impor STEP/IGES/STL dari CAD lain, lalu UKUR — impor tanpa ukur tidak
 *  memberi tahu apa pun tentang apa yang masuk. */
export async function imporBerkas(r, berkas, nama) {
  periksaNama(nama);
  if (!existsSync(berkas)) throw new Error(`berkas tidak ada: ${berkas}`);
  const ext = path.extname(berkas).toLowerCase();
  const isi = readFileSync(berkas);
  const blob = new Blob([isi]);

  let shape;
  if (ext === '.step' || ext === '.stp') shape = buka(await r.B.importSTEP(blob), r.B);
  else if (ext === '.stl') shape = buka(await r.B.importSTL(blob), r.B);
  else if (ext === '.iges' || ext === '.igs') shape = buka(await r.B.importIGES(blob), r.B);
  else throw new Error(`format impor tidak didukung: ${ext}. Yang ada: .step .iges .stl`);

  periksaHasil(r, shape, { operasi: `impor ${path.basename(berkas)}` });
  tulis(r, nama, shape);
  return ringkasan(r, nama, shape, { dari_berkas: path.resolve(berkas), bita: isi.length });
}

/* ── Sketsa 2D → padat 3D ───────────────────────────────────────────────
 *
 * Jalur ini melewati gerbang yang SAMA dengan operasi lain (isShapeValid +
 * arah volume), lalu MENAMBAH satu lapis lagi yang tidak dimiliki operasi
 * lain: perbandingan terhadap rumus tertutup. Lihat `cad-sketsa.mjs`.
 */
import { ekstrusi, putar, loft } from './cad-sketsa.mjs';

const OPERASI_SKETSA = { ekstrusi, putar, loft };
export const JENIS_OPERASI_SKETSA = Object.keys(OPERASI_SKETSA);

export async function sketsaKe(r, nama, operasi, profil, opsi = {}) {
  periksaNama(nama);
  const fn = OPERASI_SKETSA[operasi];
  if (!fn) {
    throw new Error(`operasi sketsa tidak dikenal: ${operasi}. `
      + `Yang ada: ${JENIS_OPERASI_SKETSA.join(', ')}`);
  }
  const { bentuk, periksa } = fn(r.B, profil, opsi);
  periksaHasil(r, bentuk, { operasi: `sketsa ${operasi}` });
  tulis(r, nama, bentuk);
  return ringkasan(r, nama, bentuk, { operasi: `sketsa ${operasi}`, periksa });
}
