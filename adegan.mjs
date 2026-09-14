/* ADEGAN — format berkas, dan satu-satunya sumber kebenaran runtime.
 *
 * ── Kenapa adegan adalah DATA, bukan kode ────────────────────────────────
 *
 * Spline, Unity, dan Unreal sama-sama menyimpan adegan sebagai data lalu
 * menafsirkannya di runtime. Alasannya bukan selera: adegan yang berupa kode
 * hanya bisa diubah oleh yang menulis kodenya. Adegan yang berupa data bisa
 * diperiksa, dibandingkan, diberi versi, dinilai spek, dan disusun oleh
 * SIAPA PUN — termasuk agen lewat MCP, yang justru pintu masuk alat ini.
 *
 * ── Yang membedakannya dari format adegan lain ───────────────────────────
 *
 * Tiap node membawa ANGKA hasil pengukurannya: segitiga, kotak batas, dan
 * kalau asetnya bersertifikat, sertifikatnya ikut. Jadi adegan yang terbit
 * ke web tidak cuma bisa dilihat — ia bisa DIBANTAH.
 *
 * Satu adegan tanpa aset apa pun tetap sah. Itu disengaja: adegan kosong
 * berisi kamera, cahaya, dan lingkungan adalah titik mulai yang berguna,
 * bukan keadaan galat.
 */
import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { bacaSertifikat, kotakBatasGLB } from './glb.mjs';

export const VERSI = 'adegan/1';

/**
 * Vektor 3 komponen, dengan penolakan yang BERBUNYI.
 *
 * Versi pertama diam-diam jatuh ke nilai bawaan untuk masukan apa pun yang
 * bukan larik-3. Akibatnya `skala: 0.001` — bentuk yang skema MCP-nya sendiri
 * izinkan — jadi `[1, 1, 1]`, dan sebuah flange 140 mm terbit sebagai benda
 * 140 METER tanpa satu pun pesan. Kameranya berada di dalamnya, jadi yang
 * terlihat cuma lantai, dan tidak ada apa pun yang menunjuk sebabnya.
 *
 * Fallback diam pada masukan tak sah adalah kelas kesalahan yang sama dengan
 * alat ukur yang berbohong: keduanya menghasilkan angka yang kelihatan wajar
 * untuk pertanyaan yang tidak pernah benar-benar dijawab.
 *
 * `skalar` mengizinkan satu angka disiarkan ke tiga sumbu — itu bentuk yang
 * wajar untuk skala seragam, dan menerimanya di sini lebih baik daripada
 * memaksa pemanggil menulis [x, x, x].
 */
function v3(a, bawaan = [0, 0, 0], { skalar = false, nama = 'nilai' } = {}) {
  if (a == null) return bawaan.slice();
  if (skalar && typeof a === 'number') {
    if (!Number.isFinite(a)) throw new Error(`${nama} bukan angka: ${a}`);
    return [a, a, a];
  }
  if (!Array.isArray(a) || a.length !== 3) {
    throw new Error(`${nama} harus larik 3 angka`
      + (skalar ? ' atau satu angka' : '')
      + `, dapat ${JSON.stringify(a)}`);
  }
  const keluar = a.map(Number);
  if (keluar.some((x) => !Number.isFinite(x))) {
    throw new Error(`${nama} memuat nilai bukan angka: ${JSON.stringify(a)}`);
  }
  return keluar;
}

/* Warna disimpan sebagai heks karena itu yang ditulis manusia dan yang
   dibaca three.js tanpa terjemahan. Ruang warnanya sRGB — runtime yang
   mengubahnya ke linear, bukan berkasnya. */
const HEKS = /^#[0-9a-fA-F]{6}$/;

export const JENIS_CAHAYA = ['lingkungan', 'arah', 'titik', 'sorot'];

/** Adegan kosong yang SAH — kamera, satu cahaya lingkungan, satu matahari. */
export function adeganBaru(nama = 'adegan') {
  return {
    rupa3d: VERSI,
    nama,
    dibuat: new Date().toISOString(),
    lingkungan: {
      langit_atas: '#dfe9f5',
      langit_bawah: '#2a3140',
      kabut: null,
      paparan: 1.0,
      bayangan: true,
    },
    kamera: { posisi: [4, 3, 6], target: [0, 1, 0], fov: 40, dekat: 0.01, jauh: 2000 },
    cahaya: [
      { id: 'ambien', jenis: 'lingkungan', warna: '#ffffff', kuat: 0.8 },
      {
        id: 'matahari', jenis: 'arah', warna: '#fff6e8', kuat: 2.4,
        posisi: [5, 8, 4], bayangan: true,
      },
    ],
    aset: {},
    node: [],
  };
}

/* ── Aset ─────────────────────────────────────────────────────────────── */

/**
 * Daftarkan GLB ke adegan. Yang dicatat bukan cuma jalurnya:
 * ukuran berkas dan SERTIFIKATNYA ikut, kalau ada. Adegan yang menyebut aset
 * tanpa mencatat apa pun tentangnya menyerahkan seluruh kepercayaan pada
 * nama berkas — dan nama berkas tidak membuktikan apa-apa.
 */
export function daftarkanAset(adegan, kunci, berkas) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(kunci)) {
    throw new Error(`kunci aset tidak sah: ${JSON.stringify(kunci)}`);
  }
  const p = path.resolve(berkas);
  if (!existsSync(p)) throw new Error(`aset tidak ada: ${p}`);

  let sertifikat = null;
  try { sertifikat = bacaSertifikat(p); } catch { sertifikat = null; }

  /* `spek` di sertifikat SUDAH berbentuk "nama@versi" — versi pertama kode
     ini menempelkan `sertifikat.versi` lagi dan menghasilkan
     "kora-3d-game@1.0@undefined" di panel. Ditangkap saat panel pertama kali
     dibaca mata, bukan oleh uji: tidak ada uji yang memeriksa teks label. */
  /* Kotak batas dibaca dari accessor min/max glTF — tanpa memuat mesh.
     Tanpa angka ini tidak ada cara memeriksa skala sebelum terbit, dan
     kesalahan skala adalah kesalahan adegan yang paling sering: ia tidak
     terlihat di daftar node, cuma di layar, dan cuma kalau kebetulan
     kameranya menghadap ke sana. */
  let kotak = null;
  try { kotak = kotakBatasGLB(p); } catch { kotak = null; }

  adegan.aset[kunci] = {
    berkas: p,
    bita: statSync(p).size,
    kotak,
    sertifikat: sertifikat
      ? {
        spek: sertifikat.spek,
        lulus: sertifikat.lulus === true,
        gagal: sertifikat.gagal ?? (sertifikat.aturan ?? []).filter((a) => a.lulus === false).length,
        peringatan: sertifikat.peringatan ?? 0,
        diperiksa: sertifikat.diperiksa ?? (sertifikat.aturan ?? []).length,
        kernel: sertifikat.kernel ?? null,
      }
      : null,
  };
  return adegan.aset[kunci];
}

/* ── Node ─────────────────────────────────────────────────────────────── */

const BENTUK_DASAR = ['kotak', 'bola', 'bidang', 'silinder', 'torus', 'kapsul'];
export const JENIS_NODE = ['aset', ...BENTUK_DASAR];

/**
 * Peran sebuah node dalam adegan. Bukan hiasan metadata — ia yang membuat
 * pemeriksa skala bisa membedakan LANTAI dari KESALAHAN.
 *
 * Versi pertama pemeriksa skala menandai lantai 40 m sebagai timpang 32,66x
 * di adegan bermedian 1,73 m. Angkanya benar; kesimpulannya salah. Godaannya
 * menaikkan ambang sampai lantai lolos, dan itu berarti melonggarkan aturan
 * supaya adegan sendiri lulus — persis kesalahan yang sama dengan aturan
 * `skala_diterapkan` yang dulu menuntut memecah instansing.
 *
 * Yang benar: lantai memang BUKAN properti. Ia dinyatakan, bukan ditebak
 * dari ukurannya, karena "besar" dan "latar" adalah dua hal berbeda yang
 * kebetulan sering bersamaan.
 *
 *   properti  benda di panggung — ikut dinilai skalanya
 *   latar     lantai, dinding, langit, kubah — dikecualikan
 *   pandu     grid, sumbu, penanda — tidak dirender di mode terbit bersih
 */
export const PERAN = ['properti', 'latar', 'pandu'];

/**
 * Tambahkan satu node. `jenis` boleh 'aset' (memakai GLB terdaftar) atau
 * salah satu bentuk dasar — bentuk dasar ada supaya adegan bisa disusun
 * SEBELUM ada aset, dan supaya lantai/latar tidak menuntut satu GLB sendiri.
 */
export function tambahNode(adegan, n) {
  const id = n.id ?? `n${adegan.node.length + 1}`;
  if (adegan.node.some((x) => x.id === id)) {
    throw new Error(`id node sudah dipakai: ${id}`);
  }
  const jenis = n.jenis ?? (n.aset ? 'aset' : 'kotak');
  if (!JENIS_NODE.includes(jenis)) {
    throw new Error(`jenis node tidak dikenal: ${jenis}. Yang ada: ${JENIS_NODE.join(', ')}`);
  }
  if (jenis === 'aset') {
    if (!n.aset) throw new Error('node berjenis aset harus menyebut `aset`');
    if (!adegan.aset[n.aset]) {
      throw new Error(`aset belum didaftarkan: ${n.aset}. `
        + `Yang ada: ${Object.keys(adegan.aset).join(', ') || '(kosong)'}`);
    }
  }
  const node = {
    id, jenis,
    ...(jenis === 'aset'
      ? { aset: n.aset }
      : { ukuran: v3(n.ukuran, [1, 1, 1], { skalar: true, nama: 'ukuran' }) }),
    posisi: v3(n.posisi, [0, 0, 0], { nama: 'posisi' }),
    putar: v3(n.putar, [0, 0, 0], { nama: 'putar' }),      // derajat, XYZ
    skala: v3(n.skala, [1, 1, 1], { skalar: true, nama: 'skala' }),
    tampak: n.tampak !== false,
    bayangan: n.bayangan !== false,
    peran: n.peran ?? 'properti',
    nama: n.nama ?? id,
  };
  if (!PERAN.includes(node.peran)) {
    throw new Error(`peran tidak dikenal: ${node.peran}. Yang ada: ${PERAN.join(', ')}`);
  }
  if (n.bahan) node.bahan = bahanSah(n.bahan);
  if (n.fisika) node.fisika = fisikaSah(n.fisika);
  adegan.node.push(node);
  return node;
}

/** Bahan PBR — nama parameternya sengaja sama dengan yang dipakai three.js
 *  dan Blender, supaya tidak ada terjemahan diam-diam di tengah jalan. */
export function bahanSah(b) {
  const keluar = {};
  if (b.warna != null) {
    if (!HEKS.test(b.warna)) throw new Error(`warna harus heks #rrggbb, dapat ${b.warna}`);
    keluar.warna = b.warna;
  }
  for (const [k, min, maks] of [['kekasaran', 0, 1], ['logam', 0, 1],
    ['pancar', 0, 20], ['bening', 0, 1], ['tembus', 0, 1]]) {
    if (b[k] != null) {
      const x = Number(b[k]);
      if (!(x >= min && x <= maks)) throw new Error(`${k} harus ${min}..${maks}, dapat ${b[k]}`);
      keluar[k] = x;
    }
  }
  if (b.warna_pancar != null) {
    if (!HEKS.test(b.warna_pancar)) throw new Error(`warna_pancar harus heks #rrggbb`);
    keluar.warna_pancar = b.warna_pancar;
  }
  return keluar;
}

export const JENIS_FISIKA = ['statis', 'dinamis', 'kinematik'];
/* Sengaja BERBEDA dari `BENTUK_TABRAK` di `fisika.mjs`, yang punya `trimesh`
 * sebagai anggota keenam. Node adegan harus bisa DINAMIS, dan trimesh dinamis
 * tidak didukung mesin fisika web mana pun; `fisika.mjs` menyertakannya karena
 * ia juga melayani badan STATIS.
 *
 * Namanya sama dan isinya beda — itu jebakan, dan disebut di sini supaya tidak
 * dipakai bergantian. Yang mengimpor keduanya dengan satu nama mendapat yang
 * terakhir diimpor, tanpa satu pun tanda. Collider terrain statis yang butuh
 * trimesh belum ada di sini; ia butir tersendiri di BACKLOG. */
export const BENTUK_TABRAK = ['kotak', 'bola', 'kapsul', 'silinder', 'cembung'];

/**
 * Fisika sebuah node.
 *
 * Bentuk collider DINYATAKAN, tidak diturunkan dari bentuk visualnya. Itu
 * disengaja: collider yang mengikuti mesh persis adalah trimesh, dan trimesh
 * tidak bisa dinamis di mesin fisika mana pun yang dipakai di web. Yang
 * dipakai adalah proksi — dan proksi yang dipilih diam-diam adalah proksi
 * yang tidak pernah diperiksa. `rupa_tabrakan` sudah mengukur dua arah
 * galatnya sejak A2; angka itu yang seharusnya memandu pilihan ini.
 */
export function fisikaSah(f) {
  const keluar = { jenis: f.jenis ?? 'dinamis', bentuk: f.bentuk ?? 'kotak' };
  if (!JENIS_FISIKA.includes(keluar.jenis)) {
    throw new Error(`jenis fisika tidak dikenal: ${keluar.jenis}. `
      + `Yang ada: ${JENIS_FISIKA.join(', ')}`);
  }
  if (!BENTUK_TABRAK.includes(keluar.bentuk)) {
    throw new Error(`bentuk tabrakan tidak dikenal: ${keluar.bentuk}. `
      + `Yang ada: ${BENTUK_TABRAK.join(', ')}`);
  }
  if (f.massa != null && f.kerapatan != null) {
    throw new Error('sebutkan `massa` ATAU `kerapatan`, bukan keduanya — '
      + 'mesin fisikanya menerima keduanya dan diam-diam mengabaikan salah satunya');
  }
  for (const [k, min, maks] of [['massa', 0, 1e9], ['kerapatan', 0, 1e6],
    ['gesekan', 0, 10], ['pantul', 0, 1]]) {
    if (f[k] != null) {
      const x = Number(f[k]);
      if (!(x >= min && x <= maks)) throw new Error(`fisika.${k} harus ${min}..${maks}, dapat ${f[k]}`);
      keluar[k] = x;
    }
  }
  if (f.ukuran != null) keluar.ukuran = v3(f.ukuran, [1, 1, 1], { skalar: true, nama: 'fisika.ukuran' });

  /* Hull cembung membawa TITIKNYA, bukan cuma namanya. Proksi yang dihitung
     ulang di runtime adalah proksi yang tidak pernah diukur; yang disimpan
     di sini sudah dibandingkan terhadap permukaan aslinya di Node, dengan
     collider Rapier yang persis akan berjalan. */
  if (keluar.bentuk === 'cembung') {
    if (!Array.isArray(f.titik) || f.titik.length < 12 || f.titik.length % 3) {
      throw new Error('fisika.bentuk "cembung" butuh `titik`: larik datar [x,y,z,...] '
        + 'berisi setidaknya 4 titik. Hasilkan dengan proksiCembung() dari tabrak.mjs, '
        + 'yang sekalian mengukur berapa jauh permukaan aslinya menembus proksi ini.');
    }
    if (f.titik.length / 3 > 4096) {
      throw new Error(`fisika.titik ${f.titik.length / 3} titik melewati batas aman 4096 — `
        + 'convexHull Rapier rusak diam-diam di atas ~8.000 titik dan mengembalikan '
        + 'collider bervolume NOL, yang tidak menabrak apa pun');
    }
    keluar.titik = f.titik.map(Number);
    if (f.tembus_persen != null) keluar.tembus_persen = Number(f.tembus_persen);
  }
  if (f.kendali != null) keluar.kendali = Boolean(f.kendali);
  return keluar;
}

export function ambilNode(adegan, id) {
  const n = adegan.node.find((x) => x.id === id);
  if (!n) {
    throw new Error(`node tidak ada: ${id}. `
      + `Yang ada: ${adegan.node.map((x) => x.id).join(', ') || '(kosong)'}`);
  }
  return n;
}

export function ubahNode(adegan, id, u) {
  const n = ambilNode(adegan, id);
  if (u.posisi != null) n.posisi = v3(u.posisi, n.posisi, { nama: 'posisi' });
  if (u.putar != null) n.putar = v3(u.putar, n.putar, { nama: 'putar' });
  if (u.skala != null) n.skala = v3(u.skala, n.skala, { skalar: true, nama: 'skala' });
  if (u.ukuran != null && n.jenis !== 'aset') {
    n.ukuran = v3(u.ukuran, n.ukuran, { skalar: true, nama: 'ukuran' });
  }
  if (u.tampak != null) n.tampak = Boolean(u.tampak);
  if (u.bayangan != null) n.bayangan = Boolean(u.bayangan);
  if (u.nama != null) n.nama = String(u.nama);
  if (u.peran != null) {
    if (!PERAN.includes(u.peran)) {
      throw new Error(`peran tidak dikenal: ${u.peran}. Yang ada: ${PERAN.join(', ')}`);
    }
    n.peran = u.peran;
  }
  if (u.bahan) n.bahan = { ...(n.bahan ?? {}), ...bahanSah(u.bahan) };
  if (u.fisika !== undefined) {
    n.fisika = u.fisika === null ? undefined : fisikaSah({ ...(n.fisika ?? {}), ...u.fisika });
    if (n.fisika === undefined) delete n.fisika;
  }
  return n;
}

export function hapusNode(adegan, id) {
  ambilNode(adegan, id);
  adegan.node = adegan.node.filter((x) => x.id !== id);
  return { dihapus: id, sisa: adegan.node.length };
}

/* ── Cahaya & kamera ──────────────────────────────────────────────────── */

export function aturCahaya(adegan, c) {
  const id = c.id ?? `c${adegan.cahaya.length + 1}`;
  if (c.jenis && !JENIS_CAHAYA.includes(c.jenis)) {
    throw new Error(`jenis cahaya tidak dikenal: ${c.jenis}. Yang ada: ${JENIS_CAHAYA.join(', ')}`);
  }
  const ada = adegan.cahaya.find((x) => x.id === id);
  const baru = {
    id, jenis: c.jenis ?? ada?.jenis ?? 'arah',
    warna: c.warna ?? ada?.warna ?? '#ffffff',
    kuat: c.kuat != null ? Number(c.kuat) : (ada?.kuat ?? 1),
    posisi: c.posisi != null ? v3(c.posisi, [5, 8, 4], { nama: 'cahaya.posisi' })
      : (ada?.posisi ?? [5, 8, 4]),
    bayangan: c.bayangan != null ? Boolean(c.bayangan) : (ada?.bayangan ?? false),
  };
  if (!HEKS.test(baru.warna)) throw new Error(`warna cahaya harus heks #rrggbb, dapat ${baru.warna}`);
  if (baru.jenis === 'lingkungan') { delete baru.posisi; delete baru.bayangan; }
  if (ada) Object.assign(ada, baru); else adegan.cahaya.push(baru);
  return baru;
}

export function hapusCahaya(adegan, id) {
  const n = adegan.cahaya.length;
  adegan.cahaya = adegan.cahaya.filter((x) => x.id !== id);
  if (adegan.cahaya.length === n) throw new Error(`cahaya tidak ada: ${id}`);
  return { dihapus: id, sisa: adegan.cahaya.length };
}

export function aturKamera(adegan, k) {
  const c = adegan.kamera;
  if (k.posisi != null) c.posisi = v3(k.posisi, c.posisi, { nama: 'kamera.posisi' });
  if (k.target != null) c.target = v3(k.target, c.target, { nama: 'kamera.target' });
  if (k.fov != null) {
    const f = Number(k.fov);
    if (!(f > 1 && f < 179)) throw new Error(`fov harus 1..179, dapat ${k.fov}`);
    c.fov = f;
  }
  return c;
}

export function aturLingkungan(adegan, l) {
  const e = adegan.lingkungan;
  for (const k of ['langit_atas', 'langit_bawah']) {
    if (l[k] != null) {
      if (!HEKS.test(l[k])) throw new Error(`${k} harus heks #rrggbb, dapat ${l[k]}`);
      e[k] = l[k];
    }
  }
  if (l.paparan != null) {
    const p = Number(l.paparan);
    if (!(p > 0 && p <= 8)) throw new Error(`paparan harus 0..8, dapat ${l.paparan}`);
    e.paparan = p;
  }
  if (l.bayangan != null) e.bayangan = Boolean(l.bayangan);
  if (l.kabut !== undefined) {
    e.kabut = l.kabut === null ? null : {
      warna: l.kabut.warna ?? '#8fa3bf',
      dekat: Number(l.kabut.dekat ?? 10),
      jauh: Number(l.kabut.jauh ?? 120),
    };
  }
  return e;
}

/* ── Pemeriksaan ──────────────────────────────────────────────────────── */

/**
 * Tolak adegan cacat DI DEPAN, bukan saat runtime.
 *
 * Adegan yang menyebut aset tak terdaftar akan tampil sebagai layar kosong
 * di browser, tanpa pesan apa pun — kegagalan yang paling mahal karena ia
 * terlihat seperti "belum selesai memuat".
 */
export function periksaAdegan(adegan) {
  const cacat = [];
  if (adegan?.rupa3d !== VERSI) cacat.push(`versi harus "${VERSI}", dapat ${JSON.stringify(adegan?.rupa3d)}`);
  if (!adegan?.kamera) cacat.push('kamera tidak ada');
  if (!Array.isArray(adegan?.node)) cacat.push('node harus larik');
  if (!Array.isArray(adegan?.cahaya)) cacat.push('cahaya harus larik');

  const idNode = new Set();
  for (const n of adegan?.node ?? []) {
    if (idNode.has(n.id)) cacat.push(`id node ganda: ${n.id}`);
    idNode.add(n.id);
    if (n.jenis === 'aset' && !adegan.aset?.[n.aset]) {
      cacat.push(`node ${n.id} menyebut aset tak terdaftar: ${n.aset}`);
    }
    if (!JENIS_NODE.includes(n.jenis)) cacat.push(`node ${n.id} berjenis tak dikenal: ${n.jenis}`);
  }
  for (const [k, a] of Object.entries(adegan?.aset ?? {})) {
    if (!existsSync(a.berkas)) cacat.push(`aset ${k} menunjuk berkas yang tidak ada: ${a.berkas}`);
  }
  const cahayaNyata = (adegan?.cahaya ?? []).filter((c) => (c.kuat ?? 0) > 0);
  if (!cahayaNyata.length) {
    cacat.push('tidak ada cahaya berkekuatan > 0 — adegannya akan terbit HITAM');
  }

  /* Badan dinamis tanpa satu pun badan statis berarti semuanya jatuh
     selamanya. Di layar itu terlihat seperti "adegannya kosong" beberapa
     detik sesudah dibuka — kegagalan yang tidak menunjuk sebabnya sama
     sekali, karena bendanya memang ADA, cuma sudah di bawah kamera. */
  const berfisika = (adegan?.node ?? []).filter((n) => n.fisika);
  const dinamis = berfisika.filter((n) => n.fisika.jenis === 'dinamis');
  const statis = berfisika.filter((n) => n.fisika.jenis === 'statis');
  if (dinamis.length && !statis.length) {
    cacat.push(`${dinamis.length} node berfisika DINAMIS tanpa satu pun node STATIS — `
      + 'semuanya akan jatuh selamanya dan adegannya tampak kosong beberapa detik '
      + 'sesudah dibuka. Beri lantai `fisika: { jenis: "statis" }`.');
  }
  return cacat;
}

/* Ambang 25x dipilih dari kasus nyata: sebuah ikon terbit 438 satuan di
   adegan bermedian 1,7 — 253x. Ambangnya berlaku HANYA pada node berperan
   `properti`; latar dikecualikan lewat pernyataan, bukan lewat ambang yang
   dilonggarkan sampai muat. */
const AMBANG_SKALA = 25;

/**
 * Ukuran DUNIA tiap node, dan mana yang timpang.
 *
 * Kesalahan skala adalah cacat adegan yang paling sering dan paling tidak
 * kelihatan: ia tidak muncul di daftar node, tidak menggagalkan apa pun,
 * dan baru ketahuan kalau kebetulan kameranya menghadap ke sana. Terjadi
 * pada adegan pertama alat ini sendiri — skala 40 dipakai berdasarkan
 * konstanta yang diingat dari aset LAIN, tanpa mengukur aset ini.
 *
 * Bentuk dasar memakai `ukuran`-nya; aset memakai kotak batas GLB-nya.
 * Aset tanpa kotak batas dilewati dan DISEBUT — dilewati diam-diam berarti
 * pemeriksanya berpura-pura memeriksa.
 */
export function ukuranNode(adegan) {
  const daftar = [];
  const tanpaUkuran = [];
  const latar = [];
  for (const n of adegan.node ?? []) {
    if (n.peran && n.peran !== 'properti') { latar.push(n.id); continue; }
    let dasar = null;
    if (n.jenis === 'aset') {
      const k = adegan.aset?.[n.aset]?.kotak;
      if (!k) { tanpaUkuran.push(n.id); continue; }
      dasar = k.ukuran;
    } else {
      dasar = n.ukuran ?? [1, 1, 1];
    }
    const dunia = dasar.map((x, i) => Math.abs(x * (n.skala?.[i] ?? 1)));
    daftar.push({
      id: n.id, jenis: n.jenis, aset: n.aset ?? null,
      ukuran_dunia: dunia.map((x) => Number(x.toFixed(4))),
      diagonal: Number(Math.hypot(...dunia).toFixed(4)),
    });
  }
  return { node: daftar, tanpa_ukuran: tanpaUkuran, dikecualikan: latar };
}

/** Node yang diagonalnya jauh menyimpang dari median adegan. */
export function skalaTimpang(adegan, ambang = AMBANG_SKALA) {
  const { node, tanpa_ukuran, dikecualikan } = ukuranNode(adegan);

  /* ── Pemeriksa MUTLAK: properti lebih besar daripada latarnya ─────────
   *
   * Pemeriksa median saja punya lubang yang terbukti mahal: dengan hanya
   * SATU node properti tidak ada median, jadi ia mengembalikan
   * `median: null · timpang 0` — diam. Adegan yang diperiksanya memuat
   * flange 140 METER, dan ia tidak mengatakan apa pun.
   *
   * Pemeriksa yang justru bisu ketika objeknya sedikit adalah pemeriksa
   * berlubang, dan lubangnya persis di tempat adegan paling sering berada
   * saat sedang disusun: satu benda di atas satu lantai.
   *
   * Latar memberi acuan MUTLAK yang tidak butuh median. Sebuah properti
   * yang lebih besar daripada lantainya sendiri hampir selalu salah skala
   * — dan kalau memang disengaja, jadikan ia `latar`. */
  const latar = (adegan.node ?? []).filter((n) => n.peran === 'latar');
  const acuanLatar = latar.length
    ? Math.max(...latar.map((n) => Math.hypot(...(n.ukuran ?? [1, 1, 1])
      .map((x, i) => Math.abs(x * (n.skala?.[i] ?? 1))))))
    : null;
  const lebihBesarDariLatar = acuanLatar
    ? node.filter((x) => x.diagonal > acuanLatar)
      .map((x) => ({ ...x, lipat_latar: Number((x.diagonal / acuanLatar).toFixed(2)) }))
    : [];

  const dasar = {
    ambang, tanpa_ukuran, dikecualikan,
    acuan_latar: acuanLatar == null ? null : Number(acuanLatar.toFixed(4)),
    lebih_besar_dari_latar: lebihBesarDariLatar,
  };

  if (node.length < 2) {
    return {
      ...dasar, median: null, timpang: lebihBesarDariLatar,
      catatan: node.length
        ? `cuma ${node.length} node properti — median tidak bermakna; `
          + `yang dipakai acuan latar${acuanLatar == null ? ' (tidak ada latar juga)' : ''}`
        : 'tidak ada node properti untuk dinilai',
    };
  }

  const d = node.map((x) => x.diagonal).sort((a, b) => a - b);
  const median = d.length % 2 ? d[(d.length - 1) / 2]
    : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  const perMedian = node
    .map((x) => ({ ...x, lipat: Number((x.diagonal / Math.max(median, 1e-9)).toFixed(2)) }))
    .filter((x) => x.lipat > ambang || x.lipat < 1 / ambang);

  /* Gabungkan kedua pemeriksa tanpa menyebut satu node dua kali. */
  const per_id = new Map();
  for (const x of [...perMedian, ...lebihBesarDariLatar]) {
    per_id.set(x.id, { ...(per_id.get(x.id) ?? {}), ...x });
  }
  const timpang = [...per_id.values()]
    .sort((a, b) => (b.lipat ?? b.lipat_latar ?? 0) - (a.lipat ?? a.lipat_latar ?? 0));

  return { ...dasar, median: Number(median.toFixed(4)), timpang };
}

/** Ringkasan yang bisa dibaca sekilas — dipakai tool MCP dan CLI. */
export function ringkasAdegan(adegan) {
  const baris = [`adegan "${adegan.nama}" · ${adegan.node.length} node · `
    + `${adegan.cahaya.length} cahaya · ${Object.keys(adegan.aset).length} aset`];
  for (const n of adegan.node) {
    const p = n.posisi.map((x) => x.toFixed(2)).join(', ');
    baris.push(`  ${n.tampak ? ' ' : '·'} ${n.id.padEnd(10)} ${n.jenis.padEnd(9)}`
      + `${(n.aset ?? '').padEnd(12)} (${p})`);
  }
  for (const [k, a] of Object.entries(adegan.aset)) {
    const s = a.sertifikat;
    baris.push(`  aset ${k.padEnd(10)} ${(a.bita / 1024).toFixed(1)} KB`
      + (s ? ` · sertifikat ${s.spek} — ${s.lulus ? 'LULUS' : `GAGAL ${s.gagal}/${s.diperiksa}`}` : ' · tanpa sertifikat'));
  }
  return baris.join('\n');
}

export function bacaAdegan(jalur) {
  const a = JSON.parse(readFileSync(jalur, 'utf8'));
  const cacat = periksaAdegan(a);
  if (cacat.length) throw new Error(`adegan cacat:\n  ${cacat.join('\n  ')}`);
  return a;
}
