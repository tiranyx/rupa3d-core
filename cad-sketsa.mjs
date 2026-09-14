/* SKETSA 2D → PADAT 3D — jalan utama pemodelan, dan pemeriksanya sendiri.
 *
 * ── Kenapa ini yang paling ungkit ────────────────────────────────────────
 *
 * Primitif + boolean cuma jalan pintas. Cara benda nyata dimodelkan —
 * di SketchUp, di SolidWorks, di FreeCAD — adalah: gambar penampang 2D, lalu
 * dorong, putar, sapu, atau loft-kan. Satu kemampuan ini membuka tiga bidang
 * sekaligus:
 *
 *   arsitektur      denah  → dinding, lantai, atap
 *   pemodelan mesin profil → poros, flange, roda gigi, wadah
 *   2D → 3D         path   → huruf, ikon, logo jadi padat
 *
 * ── Yang membedakannya dari sketsa di alat lain ──────────────────────────
 *
 * Tiap padat yang keluar dari sini DIPERIKSA terhadap RUMUS TERTUTUP:
 *
 *   ekstrusi   V = luas × jarak            (shoelace pada polilinenya)
 *   putar 360° V = 2π·R_centroid·luas       (teorema Pappus)
 *
 * Terukur pada kernel ini: ekstrusi kotak meleset −2,27e−13, ekstrusi
 * lingkaran 1,68e−14 %, revolve cocok dengan Pappus sampai 0,000000 %.
 * Jadi bukan "kira-kira benar" — kalau kernelnya meleset, ia akan ketahuan.
 *
 * ── Dan acuannya DIHITUNG, tidak ditulis tangan ──────────────────────────
 *
 * Percobaan pertama menulis acuannya sendiri: sebuah profil L dinyatakan
 * "luas 64" padahal shoelace-nya 76. Kernelnya benar; ACUANNYA yang salah,
 * dan selama satu menit saya mengira menemukan bug kernel.
 *
 * Pemeriksa analitik hanya sebaik analisisnya. Karena itu luas dan centroid
 * di sini dihitung dari data polilinenya, bukan dari kepala.
 */
import { buka } from './cad.mjs';

/* ── Bidang gambar ────────────────────────────────────────────────────── */

export const BIDANG = ['XY', 'XZ', 'YZ'];

/* ── Segmen path ──────────────────────────────────────────────────────────
 *
 * Sengaja kecil. Enam bentuk ini cukup untuk denah bangunan dan profil mesin,
 * dan tiap satu punya padanan langsung di pena brepjs — tidak ada terjemahan
 * yang bisa menyimpang diam-diam.
 */
const SEGMEN = {
  ke: (pen, s) => pen.lineTo(s.ke),
  garis: (pen, s) => pen.line(s.garis[0], s.garis[1]),
  h: (pen, s) => pen.hLine(s.h),
  v: (pen, s) => pen.vLine(s.v),
  busur: (pen, s) => pen.sagittaArcTo(s.busur, s.sagitta ?? 0),
  tangen: (pen, s) => pen.tangentArcTo(s.tangen),
};

export const JENIS_SEGMEN = Object.keys(SEGMEN);

/**
 * Titik-titik polyline yang DIHAMPIRI dari spesifikasi path.
 *
 * Dipakai untuk menghitung luas dan centroid acuan. Busur dihampiri sebagai
 * tali busurnya — jadi acuan untuk profil berbusur bersifat HAMPIRAN, dan itu
 * dikatakan lewat `hampiran: true`, tidak disembunyikan. Toleransi
 * pemeriksaan dilonggarkan di kasus itu, bukan pemeriksanya dimatikan.
 */
export function titikPath(mulai, segmen) {
  let [x, y] = mulai;
  const titik = [[x, y]];
  let hampiran = false;
  for (const s of segmen) {
    if (s.ke) { [x, y] = s.ke; }
    else if (s.garis) { x += s.garis[0]; y += s.garis[1]; }
    else if (s.h != null) { x += s.h; }
    else if (s.v != null) { y += s.v; }
    else if (s.busur) { [x, y] = s.busur; hampiran = true; }
    else if (s.tangen) { [x, y] = s.tangen; hampiran = true; }
    else throw new Error(`segmen tidak dikenal: ${JSON.stringify(s)}. `
      + `Yang ada: ${JENIS_SEGMEN.join(', ')}`);
    titik.push([x, y]);
  }
  return { titik, hampiran };
}

/** Luas bertanda dan centroid sebuah poligon tertutup — rumus shoelace. */
export function luasCentroid(titik) {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < titik.length; i++) {
    const [x0, y0] = titik[i];
    const [x1, y1] = titik[(i + 1) % titik.length];
    const silang = x0 * y1 - x1 * y0;
    a2 += silang;
    cx += (x0 + x1) * silang;
    cy += (y0 + y1) * silang;
  }
  const luas = a2 / 2;
  if (Math.abs(luas) < 1e-12) return { luas: 0, centroid: [0, 0] };
  return { luas: Math.abs(luas), centroid: [cx / (3 * a2), cy / (3 * a2)] };
}

/* ── Membangun sketsa ─────────────────────────────────────────────────── */

/**
 * Semua profil melewati `draw()` + `drawingToSketchOnPlane()`, TERMASUK yang
 * primitif.
 *
 * Alasannya terukur, bukan selera: `sketchRectangle(...).revolve()` gagal di
 * kernel ini (galat berupa pointer mentah "8481728", tanpa pesan), sementara
 * `drawingToSketchOnPlane(...).revolve()` bekerja sampai presisi Pappus. Satu
 * jalur untuk semua berarti tidak ada operasi yang diam-diam mengambil rute
 * yang rusak.
 */
function pena(B, profil) {
  const { jenis } = profil;
  if (jenis === 'path') {
    const mulai = profil.mulai ?? [0, 0];
    let pen = B.draw(mulai);
    for (const s of profil.segmen ?? []) {
      const fn = SEGMEN[Object.keys(SEGMEN).find((k) => s[k] != null)];
      if (!fn) throw new Error(`segmen tidak dikenal: ${JSON.stringify(s)}`);
      pen = fn(pen, s);
    }
    return profil.tutup === false ? pen.done() : pen.close();
  }
  if (jenis === 'persegi') return B.drawRectangle(profil.lebar, profil.tinggi, profil.jari ?? 0);
  if (jenis === 'lingkaran') return B.drawCircle(profil.jari);
  if (jenis === 'elips') return B.drawEllipse(profil.jari_besar, profil.jari_kecil);
  if (jenis === 'polisegi') return B.drawPolysides(profil.jari, profil.sisi, profil.sagitta ?? 0);
  if (jenis === 'teks') {
    return B.drawText(profil.teks, {
      startX: profil.x ?? 0, startY: profil.y ?? 0,
      fontSize: profil.ukuran ?? 16, fontFamily: profil.font,
    });
  }
  throw new Error(`jenis profil tidak dikenal: ${jenis}. `
    + `Yang ada: ${JENIS_PROFIL.join(', ')}`);
}

export const JENIS_PROFIL = ['path', 'persegi', 'lingkaran', 'elips', 'polisegi', 'teks'];

function sketsa(B, profil, bidang = 'XY', asal = 0) {
  if (!BIDANG.includes(bidang)) {
    throw new Error(`bidang tidak dikenal: ${bidang}. Yang ada: ${BIDANG.join(', ')}`);
  }
  return B.drawingToSketchOnPlane(pena(B, profil), bidang, asal);
}

/**
 * Luas & centroid acuan untuk profil ini — atau `null` kalau tidak bisa
 * dihitung dari data yang ada.
 *
 * `null` DILAPORKAN, bukan diganti nol: pemeriksa yang diam-diam melewati
 * profil yang tidak bisa dianalisisnya adalah pemeriksa yang berpura-pura.
 */
export function acuanProfil(profil) {
  if (profil.jenis === 'path') {
    const { titik, hampiran } = titikPath(profil.mulai ?? [0, 0], profil.segmen ?? []);
    const { luas, centroid } = luasCentroid(titik);
    return { luas, centroid, hampiran, sumber: 'shoelace' };
  }
  if (profil.jenis === 'lingkaran') {
    return { luas: Math.PI * profil.jari ** 2, centroid: [0, 0], hampiran: false, sumber: 'analitik' };
  }
  if (profil.jenis === 'elips') {
    return {
      luas: Math.PI * profil.jari_besar * profil.jari_kecil,
      centroid: [0, 0], hampiran: false, sumber: 'analitik',
    };
  }
  if (profil.jenis === 'persegi' && !profil.jari) {
    return { luas: profil.lebar * profil.tinggi, centroid: [0, 0], hampiran: false, sumber: 'analitik' };
  }
  return null;   // persegi ber-fillet, polisegi, teks — sengaja tidak diklaim
}

/* ── Pemeriksaan ──────────────────────────────────────────────────────── */

const TOL_TEPAT = 1e-6;      // profil bersegmen lurus: mesin harus tepat
const TOL_HAMPIRAN = 0.02;   // profil berbusur: acuannya sendiri hampiran

function periksaVolume(V, acuan, { operasi, hampiran }) {
  if (acuan == null) {
    return { diperiksa: false, alasan: 'profil ini tidak punya acuan tertutup' };
  }
  const tol = hampiran ? TOL_HAMPIRAN : TOL_TEPAT;
  const nisbi = Math.abs(V - acuan) / Math.max(Math.abs(acuan), 1e-12);
  const lulus = nisbi <= tol;
  if (!lulus) {
    throw new Error(
      `${operasi}: volume ${V.toFixed(6)} meleset ${(nisbi * 100).toFixed(6)}% `
      + `dari acuan tertutup ${acuan.toFixed(6)} (toleransi ${(tol * 100).toFixed(4)}%). `
      + `Hasil tidak disimpan.`);
  }
  return {
    diperiksa: true, acuan: Number(acuan.toFixed(6)),
    galat_nisbi_persen: Number((nisbi * 100).toExponential(3)),
    toleransi_persen: tol * 100, hampiran,
  };
}

/* ── Operasi ──────────────────────────────────────────────────────────── */

/**
 * Dorong profil 2D jadi padat. Acuan: V = luas × jarak.
 *
 * `puntir` memiringkan penampangnya sepanjang ekstrusi. Volumenya TIDAK
 * berubah — geseran tidak menambah atau membuang material — jadi acuan yang
 * sama tetap berlaku, dan itu justru pemeriksa yang bagus untuk puntiran.
 */
export function ekstrusi(B, profil, { jarak, bidang = 'XY', asal = 0, puntir = 0 }) {
  if (!(Math.abs(jarak) > 0)) throw new Error(`jarak ekstrusi harus bukan nol, dapat ${jarak}`);
  const sk = sketsa(B, profil, bidang, asal);
  const opsi = puntir ? { twistAngle: puntir } : undefined;
  const bentuk = buka(sk.extrude(jarak, opsi), B);

  const a = acuanProfil(profil);
  const cek = periksaVolume(B.measureVolume(bentuk), a && a.luas * Math.abs(jarak), {
    operasi: `ekstrusi ${profil.jenis}`, hampiran: a?.hampiran ?? false,
  });
  return { bentuk, periksa: { ...cek, luas_profil: a?.luas, sumber_acuan: a?.sumber } };
}

/**
 * Putar profil mengelilingi sumbu. Acuan: teorema Pappus,
 * V = 2π · jarak_centroid_ke_sumbu · luas.
 *
 * Dua hal yang menghancurkan revolve, dan keduanya dijaga DI DEPAN karena
 * pesan kernelnya tidak bisa dibaca manusia (galat berupa pointer mentah):
 *
 *   1. Profil yang MELINTASI sumbu putar. Kernel menolaknya, tetapi tanpa
 *      menyebut sebabnya sama sekali.
 *   2. Sudut di luar 0..360.
 */
export function putar(B, profil, { bidang = 'XZ', sumbu = [0, 0, 1], sudut = 360, asal = 0 }) {
  if (!(sudut > 0 && sudut <= 360)) throw new Error(`sudut putar harus 0..360, dapat ${sudut}`);

  const a = acuanProfil(profil);
  /* Sumbu putar dalam koordinat sketsa: untuk bidang XZ + sumbu Z, jarak ke
     sumbu adalah koordinat X profil. Diperiksa dari titik-titiknya, bukan
     diasumsikan. */
  if (profil.jenis === 'path') {
    const { titik } = titikPath(profil.mulai ?? [0, 0], profil.segmen ?? []);
    const xMin = Math.min(...titik.map((t) => t[0]));
    const xMaks = Math.max(...titik.map((t) => t[0]));
    if (xMin < -1e-9 && xMaks > 1e-9) {
      throw new Error(
        `putar: profil MELINTASI sumbu putar (x dari ${xMin.toFixed(4)} sampai `
        + `${xMaks.toFixed(4)}). Kernel menolak ini dengan galat yang tidak bisa `
        + `dibaca; geser profilnya supaya seluruhnya di satu sisi sumbu.`);
    }
  }

  const sk = sketsa(B, profil, bidang, asal);
  const bentuk = buka(sk.revolve(sumbu), B);

  let acuan = null;
  if (a && sudut === 360) {
    const r = Math.abs(a.centroid[0]);
    acuan = 2 * Math.PI * r * a.luas;
    if (r < 1e-9) acuan = null;   // centroid di sumbu: Pappus tidak berlaku
  }
  const cek = periksaVolume(B.measureVolume(bentuk), acuan, {
    operasi: `putar ${profil.jenis}`, hampiran: a?.hampiran ?? false,
  });
  return {
    bentuk,
    periksa: {
      ...cek, teorema: acuan == null ? null : 'Pappus',
      luas_profil: a?.luas, centroid: a?.centroid, sudut,
    },
  };
}

/**
 * Loft antar beberapa penampang.
 *
 * TIDAK ada acuan tertutup di sini, dan itu dikatakan apa adanya: volume
 * benda loft bergantung pada cara kernel meng-interpolasi antar-wire, dan
 * tidak ada rumus umum yang menggambarkannya. Yang tetap diperiksa: bentuknya
 * sah dan volumenya di antara batas atas dan bawah yang masuk akal —
 * prisma penampang terkecil dan prisma penampang terbesar.
 */
export function loft(B, profil, { bidang = 'XY', tinggi = [], lurus = false }) {
  if (!Array.isArray(profil) || profil.length < 2) {
    throw new Error('loft butuh setidaknya 2 profil');
  }
  if (tinggi.length !== profil.length) {
    throw new Error(`tinggi harus sepanjang profil: ${profil.length} profil, ${tinggi.length} tinggi`);
  }
  const wires = profil.map((p, i) => sketsa(B, p, bidang, tinggi[i]).wire);
  const bentuk = buka(B.loft(wires, { ruled: lurus }), B);

  const luas = profil.map((p) => acuanProfil(p)?.luas).filter((x) => x != null);
  const rentang = Math.abs(Math.max(...tinggi) - Math.min(...tinggi));
  const batas = luas.length === profil.length
    ? { bawah: Math.min(...luas) * rentang, atas: Math.max(...luas) * rentang }
    : null;

  const V = B.measureVolume(bentuk);
  if (batas && (V < batas.bawah * 0.5 || V > batas.atas * 1.5)) {
    throw new Error(
      `loft: volume ${V.toFixed(4)} di luar rentang masuk akal `
      + `${batas.bawah.toFixed(4)}..${batas.atas.toFixed(4)} (±50%). Hasil tidak disimpan.`);
  }
  return {
    bentuk,
    periksa: {
      diperiksa: Boolean(batas), acuan: null, batas,
      catatan: 'loft tidak punya rumus tertutup — yang diperiksa hanya rentang masuk akal',
    },
  };
}
