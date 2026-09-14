/* Aset yang dipakai uji tetapi TIDAK ada di git.
 *
 * Diukur 14 September 2026 di clone bersih: 275 uji, 17 GAGAL dan 13
 * dilewati — ketiga puluhnya karena empat berkas di `.rupa3d/` yang hanya ada
 * di disk mesin pemilik. Di mesin itu semuanya hijau. Uji yang lulus karena
 * isi disk satu mesin bukan bukti; ia kebetulan.
 *
 * Dua yang lebih buruk dari gagal ditemukan sekalian:
 *
 *   - `test-adegan.mjs` menjaga dengan `{ skip: !GLB_FLANGE }`. GLB_FLANGE
 *     adalah STRING jalur — selalu truthy — jadi penjaganya tidak pernah bisa
 *     menyala. Pemeriksa yang kondisinya tidak pernah tercapai.
 *   - `test-cli.mjs` "KODE 2 — spek yang tidak ada" LULUS di clone bersih
 *     karena alasan yang salah: berkasnya yang tidak ada, dan itu juga kode 2.
 *
 * Jadi: satu tempat untuk jalurnya (relatif ke REPO, bukan ke CWD, dan bukan
 * jalur absolut satu mesin), dan alasan lewat yang menyebut CARA
 * mendapatkannya. Lewat yang beralasan terlihat di laporan uji; gagal karena
 * disk kosong menyembunyikan kegagalan yang sungguhan di antara 17 palsu.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPO = path.dirname(fileURLToPath(import.meta.url));

const ASET = {
  flange: {
    jalur: '.rupa3d/cad/flange.glb',
    cara: 'buat dengan `node contoh/flange-cad.mjs` (±40 dtk, tanpa Blender)',
  },
  batu: {
    jalur: '.rupa3d/tekstur/batu-batu.glb',
    // Versi pertama menulis "belum ada resep di repo". Keliru: contoh
    // tekstur-batu.mjs tanpa argumen menulis persis jalur ini (15 Sep 2026).
    cara: 'buat dengan `node contoh/tekstur-batu.mjs` (butuh Blender untuk bake)',
  },
  kulit: {
    jalur: '.rupa3d/uji/kulit/character.glb',
    env: 'RUPA3D_UJI_KULIT',
    cara: 'model karakter ber-skin yang angka ujinya dikunci (5 mesh ber-skin); tidak ikut repo — taruh di jalur ini atau set RUPA3D_UJI_KULIT',
  },
  bunny: {
    jalur: '.rupa3d/uji/kulit/bunny.glb',
    env: 'RUPA3D_UJI_BUNNY',
    cara: 'model ber-skin kedua yang angka ujinya dikunci; tidak ikut repo — taruh di jalur ini atau set RUPA3D_UJI_BUNNY',
  },
  takora: {
    jalur: '.rupa3d/rakit/masukan/takora.glb',
    cara: 'aset Takora (KoraMo); tidak ikut repo',
  },
  takoraHidup: {
    jalur: '.rupa3d/animasi/takora-hidup.glb',
    cara: 'aset Takora (KoraMo); tidak ikut repo',
  },
};

/** Jalur absolut sebuah aset uji, dan apakah ia ada di clone ini. */
export function asetUji(nama) {
  const a = ASET[nama];
  if (!a) throw new Error(`aset uji tak dikenal: ${nama} — yang ada: ${Object.keys(ASET).join(', ')}`);
  const jalur = (a.env && process.env[a.env]) || path.join(REPO, a.jalur);
  return { jalur, ada: existsSync(jalur) };
}

/** Nilai `skip` untuk node:test: `false` kalau semua aset ada, atau alasan
 *  yang menyebut berkas mana yang hilang dan bagaimana mendapatkannya. */
export function lewatiTanpa(...nama) {
  const hilang = nama.filter((n) => !asetUji(n).ada);
  if (!hilang.length) return false;
  return 'aset uji tidak ada di clone ini: '
    + hilang.map((n) => {
      const a = ASET[n];
      // Kalau jalurnya dari variabel lingkungan, sebut ITU — bukan jalur bawaan
      // yang tidak pernah diperiksa.
      const letak = a.env && process.env[a.env] ? `${a.env}=${process.env[a.env]}` : a.jalur;
      return `${letak} — ${a.cara}`;
    }).join('; ');
}

/* ── GLB buatan sendiri, untuk uji yang tidak boleh bergantung pada disk ──
 *
 * Satu pembangun untuk semua uji yang butuh GLB buatan sendiri, supaya tiap
 * berkas uji tidak menulis ulang kepala dan padding chunk-nya. */

/** GLB dari JSON glTF dan chunk biner opsional, dengan padding 4 bita yang
 *  diwajibkan spesifikasi. Sengaja TIDAK memvalidasi: uji berkas jahat
 *  memakainya untuk membangun berkas yang tidak sah. */
export function glbDari(json, bin = Buffer.alloc(0)) {
  const pad4 = (b, isi) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, isi)]);
  const j = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const bb = pad4(bin, 0);
  const total = 12 + 8 + j.length + (bb.length ? 8 + bb.length : 0);
  const kepala = Buffer.alloc(12);
  kepala.writeUInt32LE(0x46546c67, 0); // 'glTF'
  kepala.writeUInt32LE(2, 4);
  kepala.writeUInt32LE(total, 8);
  const cj = Buffer.alloc(8);
  cj.writeUInt32LE(j.length, 0);
  cj.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const bagian = [kepala, cj, j];
  if (bb.length) {
    const cb = Buffer.alloc(8);
    cb.writeUInt32LE(bb.length, 0);
    cb.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
    bagian.push(cb, bb);
  }
  return Buffer.concat(bagian);
}

/** GLB sah terkecil yang punya geometri: satu segitiga berindeks. */
export function glbSegitiga() {
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const idx = Buffer.from(new Uint16Array([0, 1, 2, 0]).buffer);
  return glbDari({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    buffers: [{ byteLength: 42 }],
  }, Buffer.concat([pos, idx]));
}
