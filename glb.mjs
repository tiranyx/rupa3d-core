/* Menempelkan SERTIFIKAT ke dalam berkas GLB.
 *
 * Inilah yang membuat kalimat "aset membawa buktinya" jadi harfiah: siapa pun
 * yang menerima GLB-nya bisa membaca apa yang dijanjikan, apa yang diukur,
 * dan siapa yang mengukurnya — tanpa berkas pendamping, tanpa basis data,
 * tanpa perlu mempercayai siapa pun.
 *
 * glTF menyediakan `extras` justru untuk ini: bidang bebas yang WAJIB
 * diabaikan pemuat yang tidak mengenalinya. Jadi GLB bersertifikat tetap
 * dimuat three.js, Babylon, Unity, dan Blender persis seperti sebelumnya.
 *
 * ── Bentuk berkas GLB, seperlunya ────────────────────────────────────────
 *
 *   header 12 bita   : magic "glTF" · versi 2 · panjang total
 *   chunk 0          : panjang · tipe "JSON" · JSON UTF-8, dipadding SPASI
 *   chunk 1 (opsi.)  : panjang · tipe "BIN"  · biner, dipadding NOL
 *
 * Dua hal yang membuat berkas rusak kalau dilupakan, dan keduanya senyap:
 * tiap chunk harus kelipatan 4 bita, dan padding JSON harus SPASI (0x20)
 * sedangkan padding biner harus NOL. Salah padding = berkas yang lolos di
 * satu pemuat dan ditolak di pemuat lain.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { EKSTENSI as DRACO, dracoSiap, uraikanPrimitif } from './draco.mjs';
import { petaInduk, matriksDunia } from './hierarki.mjs';

const MAGIC = 0x46546c67;      // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const BIN_CHUNK = 0x004e4942;  // "BIN\0"
const naik4 = (n) => (n + 3) & ~3;

/** Baca GLB jadi bagian-bagiannya. Melempar dengan pesan yang menyebut
 *  sebabnya, bukan "unexpected end of buffer". */
export function bacaGLB(buf) {
  if (buf.length < 12) throw new Error('bukan GLB: lebih pendek dari header');
  if (buf.readUInt32LE(0) !== MAGIC) {
    throw new Error('bukan GLB: magic bukan "glTF" (berkas .gltf teks harus dibaca sebagai JSON biasa)');
  }
  const versi = buf.readUInt32LE(4);
  if (versi !== 2) throw new Error(`GLB versi ${versi} tidak didukung; hanya 2`);

  let ofs = 12;
  let json = null;
  let bin = null;
  while (ofs + 8 <= buf.length) {
    const panjang = buf.readUInt32LE(ofs);
    const tipe = buf.readUInt32LE(ofs + 4);
    const mulai = ofs + 8;
    const akhir = mulai + panjang;
    if (akhir > buf.length) throw new Error('chunk GLB melewati akhir berkas');
    if (tipe === JSON_CHUNK) json = JSON.parse(buf.subarray(mulai, akhir).toString('utf8'));
    else if (tipe === BIN_CHUNK) bin = buf.subarray(mulai, akhir);
    ofs = akhir;
  }
  if (!json) throw new Error('GLB tanpa chunk JSON');
  return { json, bin, versi };
}

/** Rakit ulang GLB dari JSON + biner, dengan padding yang benar. */
export function tulisGLB({ json, bin }) {
  const teks = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = naik4(teks.length);
  const jsonBuf = Buffer.alloc(jsonPad, 0x20);   // SPASI, bukan nol
  teks.copy(jsonBuf);

  const bagian = [];
  let total = 12 + 8 + jsonPad;
  if (bin && bin.length) {
    const binPad = naik4(bin.length);
    const binBuf = Buffer.alloc(binPad, 0x00);   // NOL, bukan spasi
    bin.copy(binBuf);
    bagian.push(binBuf);
    total += 8 + binPad;
  }

  const keluar = Buffer.alloc(total);
  let o = 0;
  keluar.writeUInt32LE(MAGIC, o); o += 4;
  keluar.writeUInt32LE(2, o); o += 4;
  keluar.writeUInt32LE(total, o); o += 4;
  keluar.writeUInt32LE(jsonPad, o); o += 4;
  keluar.writeUInt32LE(JSON_CHUNK, o); o += 4;
  jsonBuf.copy(keluar, o); o += jsonPad;
  for (const b of bagian) {
    keluar.writeUInt32LE(b.length, o); o += 4;
    keluar.writeUInt32LE(BIN_CHUNK, o); o += 4;
    b.copy(keluar, o); o += b.length;
  }
  return keluar;
}

/** Tempelkan sertifikat ke GLB di disk. Mengembalikan ukuran sebelum/sesudah. */
export function tempelSertifikat(jalur, sertifikat, tujuan = jalur) {
  const asal = readFileSync(jalur);
  const { json, bin } = bacaGLB(asal);
  json.asset = json.asset ?? {};
  json.asset.extras = { ...(json.asset.extras ?? {}), rupa3d: sertifikat };
  const keluar = tulisGLB({ json, bin });
  writeFileSync(tujuan, keluar);
  return { sebelum: asal.length, sesudah: keluar.length, tumbuh: keluar.length - asal.length };
}

/** Baca sertifikat dari GLB. Ini sisi penerima — dan sisi inilah yang
 *  membuat seluruh gagasan berguna. */
export function bacaSertifikat(jalur) {
  const { json } = bacaGLB(readFileSync(jalur));
  return json.asset?.extras?.rupa3d ?? null;
}

/* ── Kotak batas tanpa memuat satu pun mesh ──────────────────────────────
 *
 * Spesifikasi glTF MEWAJIBKAN accessor POSITION membawa `min` dan `max`.
 * Artinya kotak batas sebuah GLB bisa dibaca dari JSON-nya saja — tanpa
 * three.js, tanpa Blender, tanpa mengurai satu bita biner pun.
 *
 * Itu yang membuat pemeriksaan skala bisa berjalan SEBELUM terbit, bukan
 * sesudah halamannya dibuka dan seseorang menyadari ada dinding raksasa.
 *
 * BATASNYA, dan ini disebut bukan disembunyikan: angka ini di ruang LOKAL
 * tiap mesh. Transform node di dalam GLB tidak ikut dihitung, jadi aset yang
 * menyimpan skala di node-nya akan terbaca lebih kecil daripada tampilannya.
 * Untuk menangkap kesalahan berlipat 40x itu lebih dari cukup; untuk
 * toleransi mesin, pakai `rupa_ukur` yang menjalankan Blender.
 */
export function kotakBatasGLB(jalur) {
  const { json } = bacaGLB(readFileSync(jalur));
  const min = [Infinity, Infinity, Infinity];
  const maks = [-Infinity, -Infinity, -Infinity];
  let mesh = 0;

  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      const i = p.attributes?.POSITION;
      if (i == null) continue;
      const acc = json.accessors?.[i];
      if (!acc?.min || !acc?.max) continue;
      mesh++;
      for (let k = 0; k < 3; k++) {
        if (acc.min[k] < min[k]) min[k] = acc.min[k];
        if (acc.max[k] > maks[k]) maks[k] = acc.max[k];
      }
    }
  }
  if (!mesh) return null;
  const ukuran = maks.map((x, k) => x - min[k]);
  return {
    min, maks, ukuran,
    diagonal: Math.hypot(...ukuran),
    primitif: mesh,
    catatan: 'ruang lokal mesh; transform node di dalam GLB tidak dihitung',
  };
}

/* ── Titik verteks dari GLB, tanpa three.js dan tanpa Blender ────────────
 *
 * Dibutuhkan untuk membangun proksi tabrakan di Node. Membaca posisi berarti
 * mengurai chunk biner: accessor menunjuk bufferView, bufferView menunjuk
 * rentang bita, dan stride bisa lebih besar daripada satu verteks kalau
 * atributnya di-interleave.
 *
 * Transform node DIHITUNG di sini — beda dengan `kotakBatasGLB`, yang sengaja
 * melewatkannya karena ia cuma perlu ketelitian orde besaran. Proksi tabrakan
 * tidak boleh melewatkannya: hull yang dibangun dari verteks ruang-lokal pada
 * aset yang node-nya berskala akan seukuran benda yang salah.
 */
const terapkan = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

export function titikGLB(jalur, { maks = 200000 } = {}) {
  const { json, bin } = bacaGLB(readFileSync(jalur));
  const titik = [];
  const induk = petaInduk(json);
  const dunia = (i) => matriksDunia(json.nodes, induk, i);

  for (const [i, n] of (json.nodes ?? []).entries()) {
    if (n.mesh == null) continue;
    const M = dunia(i);
    for (const prim of json.meshes[n.mesh].primitives ?? []) {
      const ai = prim.attributes?.POSITION;
      if (ai == null) continue;
      const acc = json.accessors[ai];
      if (acc.componentType !== 5126 || acc.type !== 'VEC3') continue;   // FLOAT VEC3
      /* Lewat `atributPrimitif`, bukan langsung ke bufferView-nya.
         Versi lama membaca `json.bufferViews[acc.bufferView]` begitu saja —
         dan pada primitif Draco `acc.bufferView` memang TIDAK ADA menurut
         spesifikasinya, jadi ia melempar TypeError telanjang soal
         `byteOffset` yang tidak menyebut Draco, tidak menyebut berkasnya,
         dan tidak menyebut apa yang harus dilakukan. */
      const pos = atributPrimitif(json, bin, prim).pos;
      if (!pos) continue;
      for (let k = 0; k < pos.length / 3 && titik.length < maks * 3; k++) {
        const [x, y, z] = terapkan(M, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
        titik.push(x, y, z);
      }
    }
  }
  return new Float32Array(titik);
}

/* ── Mesh utuh dari GLB: posisi, indeks, UV ──────────────────────────────
 *
 * `titikGLB` cukup untuk hull cembung karena hull tidak peduli segitiga.
 * Topologi peduli: yang menentukan manifold, lubang, arah putaran, dan
 * kerapatan texel adalah bagaimana verteksnya TERSAMBUNG.
 *
 * Satu hal yang harus dikatakan di depan dan tidak bisa diakali: **glTF
 * selalu tersegitiga.** Quad, n-gon, dan edge loop sudah hilang sebelum
 * berkasnya ditulis. Apa pun yang dilaporkan dari sini adalah topologi
 * SEGITIGA, bukan topologi sumbernya — dan alat yang mengklaim bisa menilai
 * "quad-dominance" dari sebuah GLB sedang mengarang.
 */
const UKURAN_KOMPONEN = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const JUMLAH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/* Atribut sebuah primitif, dari accessor biasa ATAU dari Draco.
 *
 * Satu tempat, dipakai semua pembaca. Versi lama membiarkan tiap pembaca
 * memanggil `bacaAccessor` sendiri-sendiri, dan pada berkas Draco keempatnya
 * gagal dengan cara yang BERBEDA — satu mengembalikan kosong tanpa suara,
 * satu melempar TypeError telanjang, satu menyalahkan berkasnya, dan satu
 * lagi justru menjawab benar karena accessor min/max tetap ada. Empat
 * perilaku untuk satu sebab adalah tanda sebabnya ditangani di tempat yang
 * salah.
 *
 * Cache per-primitif: menguraikan Draco mahal, dan `meshGLB` + `titikGLB`
 * membaca primitif yang sama.
 */
const CACHE_DRACO = new WeakMap();

/* Indeks yang menunjuk verteks yang tidak ada TIDAK melempar di JavaScript:
   membaca Float32Array di luar batas memberi `undefined`, dan menulis ke
   Uint8Array di luar batas diam-diam tidak melakukan apa-apa. Diukur 14 Sep:
   GLB berindeks 65535 pada mesh tiga verteks LOLOS di keempat pembaca, dan
   `perbaikiGLB` bahkan melapor sukses. Spesifikasi glTF mewajibkan tiap
   indeks lebih kecil dari jumlah verteks; ditegakkan di sini, sekali, untuk
   semua pembaca. */
function periksaIndeks(a) {
  if (!a.idx || !a.pos) return a;
  const n = a.pos.length / 3;
  for (let k = 0; k < a.idx.length; k++) {
    if (a.idx[k] >= n) {
      throw new Error(`glTF tidak sah: indeks ke-${k} bernilai ${a.idx[k]}, padahal primitif `
        + `ini hanya punya ${n} verteks`);
    }
  }
  return a;
}

function atributPrimitif(json, bin, p) {
  if (!p.extensions?.[DRACO]) {
    return periksaIndeks({
      draco: false,
      pos: bacaAccessor(json, bin, p.attributes?.POSITION),
      idx: p.indices != null ? bacaAccessor(json, bin, p.indices) : null,
      uv: p.attributes?.TEXCOORD_0 != null
        ? bacaAccessor(json, bin, p.attributes.TEXCOORD_0) : null,
      berindeks: p.indices != null,
    });
  }

  let simpan = CACHE_DRACO.get(p);
  if (!simpan) {
    const d = dracoSiap();
    /* Menyebut KEDUANYA: apa yang ditemukan, dan apa yang harus dipanggil.
       Pesan yang cuma bilang "gagal" memaksa pembacanya menebak, dan tebakan
       pertama hampir selalu "berkasnya rusak" — padahal berkasnya sah dan
       alat inilah yang belum siap. */
    if (!d) {
      throw new Error(
        `primitif ini terkompres ${DRACO}, dan dekodernya belum disiapkan. `
        + 'Panggil `await siapkanDraco()` dari `draco.mjs` sekali sebelum '
        + 'membaca berkasnya. (Pembaca GLB di sini sinkron; WASM menuntut '
        + 'satu `await` di awal.)');
    }
    simpan = uraikanPrimitif(d, json, bin, p);
    CACHE_DRACO.set(p, simpan);
  }
  return periksaIndeks({
    draco: true,
    pos: simpan.atribut.POSITION ?? null,
    idx: simpan.indeks,
    uv: simpan.atribut.TEXCOORD_0 ?? null,
    berindeks: true,
  });
}

function bacaAccessor(json, bin, i) {
  const acc = json.accessors?.[i];
  if (!acc || acc.bufferView == null) return null;
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) throw new Error(`glTF tidak sah: accessor ${i} menunjuk bufferView ${acc.bufferView} yang tidak ada`);
  const komp = JUMLAH[acc.type] ?? 1;
  const lebar = UKURAN_KOMPONEN[acc.componentType];
  if (!lebar) return null;
  const stride = bv.byteStride ?? komp * lebar;
  const awal = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  /* Ukuran yang DIKLAIM diperiksa terhadap ukuran yang ADA sebelum larik
     dialokasikan. `count` 2^30 pada buffer 36 bita dulu ditolak dengan
     "Array buffer allocation failed" — benar menolak, tetapi dengan pesan
     milik mesin, bukan milik berkasnya. Rumusnya dari spesifikasi:
     byteOffset + stride × (count − 1) + ukuran satu elemen ≤ byteLength. */
  if (acc.count > 0) {
    const perlu = (acc.count - 1) * stride + komp * lebar;
    if ((acc.byteOffset ?? 0) + perlu > (bv.byteLength ?? Infinity)
      || awal + perlu > (bin?.length ?? 0)) {
      throw new Error(`glTF tidak sah: accessor ${i} (${acc.count} × ${acc.type}) butuh ${perlu} bita, `
        + `melampaui bufferView ${acc.bufferView} (${bv.byteLength} bita) atau buffer biner `
        + `(${bin?.length ?? 0} bita)`);
    }
  }
  const keluar = acc.componentType === 5126
    ? new Float32Array(acc.count * komp)
    : new Uint32Array(acc.count * komp);

  for (let k = 0; k < acc.count; k++) {
    const o = awal + k * stride;
    for (let c = 0; c < komp; c++) {
      const p = o + c * lebar;
      keluar[k * komp + c] = acc.componentType === 5126 ? bin.readFloatLE(p)
        : acc.componentType === 5125 ? bin.readUInt32LE(p)
          : acc.componentType === 5123 ? bin.readUInt16LE(p)
            : acc.componentType === 5122 ? bin.readInt16LE(p)
              : acc.componentType === 5121 ? bin.readUInt8(p) : bin.readInt8(p);
    }
  }
  return keluar;
}

/**
 * Primitif mesh GLB, sudah di ruang DUNIA.
 *
 * Primitif ber-mode selain TRIANGLES (4) DILEWATI dan disebut — strip dan
 * fan punya aturan konektivitas yang berbeda, dan memperlakukannya sebagai
 * segitiga terpisah akan melaporkan lubang yang tidak ada.
 */
export function meshGLB(jalur) {
  const { json, bin } = bacaGLB(readFileSync(jalur));
  const induk = petaInduk(json);
  const dunia = (i) => matriksDunia(json.nodes, induk, i);

  const primitif = [];
  const dilewati = [];
  for (const [i, n] of (json.nodes ?? []).entries()) {
    if (n.mesh == null) continue;
    const M = dunia(i);
    const nama = json.meshes[n.mesh].name ?? `mesh${n.mesh}`;
    for (const [pi, p] of (json.meshes[n.mesh].primitives ?? []).entries()) {
      const mode = p.mode ?? 4;
      if (mode !== 4) { dilewati.push({ mesh: nama, primitif: pi, mode }); continue; }
      const a = atributPrimitif(json, bin, p);
      const pos = a.pos;
      /* Primitif tanpa posisi DISEBUT, bukan dilewati diam-diam. `continue`
         yang polos di sini adalah cara berkas Draco dulu terbaca sebagai
         "0 primitif · 0 dilewati" — sukses palsu yang kosong. */
      if (!pos) { dilewati.push({ mesh: nama, primitif: pi, mode, alasan: 'tanpa POSITION' }); continue; }
      const n3 = pos.length / 3;
      const posDunia = new Float32Array(pos.length);
      for (let k = 0; k < n3; k++) {
        const [x, y, z] = terapkan(M, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
        posDunia[k * 3] = x; posDunia[k * 3 + 1] = y; posDunia[k * 3 + 2] = z;
      }
      const idx = a.idx ?? Uint32Array.from({ length: n3 }, (_, k) => k);
      primitif.push({
        mesh: nama, primitif: pi, posisi: posDunia, indeks: idx,
        uv: a.uv, berindeks: a.berindeks, draco: a.draco,
      });
    }
  }
  return { primitif, dilewati, sumber: jalur };
}
