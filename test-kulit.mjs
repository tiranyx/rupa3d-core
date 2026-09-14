/* Uji MESH BER-SKIN — dan temuan paling dalam di repo ini sejauh ini.
 *
 * Spesifikasi glTF, dengan kata MUST:
 *
 *     "the transform of the skinned mesh node MUST be ignored"
 *
 * `ukur-glb.mjs` memakainya untuk SEMUA mesh sampai 11 September, dan
 * `perbaiki.mjs` memanggangnya ke verteks untuk "membetulkan"
 * `skala_diterapkan`. Gerbang pembuktian perbaikan itu MELOLOSKANNYA —
 * karena gerbangnya membandingkan kotak batas yang dihitung dengan cara yang
 * sama salahnya.
 *
 *     Dua alat saya sendiri yang sepakat tidak membuat keduanya benar.
 *
 * Uji di sini mengunci ketiganya: ukurannya benar, temuan palsunya hilang,
 * dan perbaikannya MENOLAK menyentuh mesh ber-skin.
 */
import test from 'node:test';
import { asetUji, lewatiTanpa } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { bacaGLB } from './glb.mjs';
import { nodeBerkulit, kotakBerkulit, titikBerkulit } from './kulit.mjs';
import { ukurGLB } from './ukur-glb.mjs';

/* Aset ber-skin ada di luar repo. Uji yang bergantung padanya DILEWATI kalau
   berkasnya tidak ada, dengan menyebut sebab dan cara mendapatkannya;
   melewatinya diam-diam akan membuat suite ini hijau sambil tidak menguji
   apa pun. Jalurnya lewat aset-uji.mjs (bisa ditimpa RUPA3D_UJI_KULIT dan
   RUPA3D_UJI_BUNNY) — sampai 15 Sep 2026 di sini tertulis jalur absolut satu
   mesin. */
const KULIT = asetUji('kulit').jalur;
const BUNNY = asetUji('bunny').jalur;
const POLOS = asetUji('batu').jalur;

const ada = (f) => existsSync(f);

test('mesh ber-skin dikenali, dan yang tanpa skin tidak', (t) => {
  if (!ada(KULIT)) return t.skip(lewatiTanpa('kulit'));
  if (!ada(POLOS)) return t.skip(lewatiTanpa('batu'));
  const berkulit = nodeBerkulit(bacaGLB(readFileSync(KULIT)).json);
  assert.equal(berkulit.length, 5);
  for (const b of berkulit) assert.ok(Number.isInteger(b.skin));

  assert.equal(nodeBerkulit(bacaGLB(readFileSync(POLOS)).json).length, 0);
  assert.equal(kotakBerkulit(POLOS), null, 'tanpa skin harus null, bukan kotak yang dikarang');
});

test('kotak POSE ISTIRAHAT berbeda jauh dari kotak transform-node', (t) => {
  if (!ada(KULIT)) return t.skip(lewatiTanpa('kulit'));
  const kulit = kotakBerkulit(KULIT);
  const u = ukurGLB(KULIT);

  // Yang dilaporkan sekarang HARUS yang dari sendinya.
  assert.equal(u.kotak_dari, 'sendi (pose istirahat)');
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(u.kotak_batas.ukuran[i] - kulit.ukuran[i]) < 1e-4);
  }

  /* Dan bedanya harus BESAR. Kalau kedua jalan memberi angka yang mirip, uji
     ini tidak membuktikan apa pun — dan tambalannya tidak perlu ada. Terukur
     11 Sep: lebar 1,6755 (transform node) vs 0,6049 (sendi), meleset 177 %. */
  const nodeUkur = u.kotak_transform_node.ukuran;
  const beda = Math.abs(nodeUkur[0] - kulit.ukuran[0]) / kulit.ukuran[0];
  assert.ok(beda > 0.5,
    `lebar cuma beda ${(beda * 100).toFixed(1)} % — kalau kecil, tambalannya tidak perlu ada`);
});

test('TINGGINYA hampir sama — dan itu sebabnya kekeliruannya tak pernah terlihat', (t) => {
  if (!ada(KULIT) || !ada(BUNNY)) return t.skip(lewatiTanpa('kulit', 'bunny'));
  for (const f of [KULIT, BUNNY]) {
    const u = ukurGLB(f);
    const node = u.kotak_transform_node.ukuran[1];   // sumbu Y = tinggi
    const sendi = u.kotak_batas.ukuran[1];
    const beda = Math.abs(node - sendi) / sendi;
    assert.ok(beda < 0.1,
      `tinggi beda ${(beda * 100).toFixed(1)} % — kalimat di komentar ini yang salah, bukan ujinya`);
  }
});

test('`skala_diterapkan` TIDAK LAGI menuduh mesh ber-skin', (t) => {
  if (!ada(KULIT) || !ada(BUNNY)) return t.skip(lewatiTanpa('kulit', 'bunny'));
  /* Keempat model buatan manusia yang gagal aturan ini pada uji 11 spesimen
     (10 Sep) SELURUHNYA ber-skin dengan transform node 100x. Transform itu
     diabaikan spesifikasinya, jadi keempat temuan itu PALSU. */
  for (const f of [KULIT, BUNNY]) {
    const u = ukurGLB(f);
    assert.ok(u.objek_berkulit > 0);
    assert.equal(u.skala_diterapkan, true,
      'mesh ber-skin tidak boleh dituduh membawa skala yang belum diterapkan');
  }
});

test('mesh TANPA skin masih dituduh kalau memang berskala', async (t) => {
  /* Pemeriksa yang berhenti merah sesudah ditambal bukan ditambal, ia
     dimatikan. Aset ber-skala tanpa skin harus TETAP tertangkap. */
  const { tulisGLB } = await import('./glb.mjs');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'rupa-kulit-'));
  try {
    const pos = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const idx = Uint16Array.from([0, 1, 2, 0, 0, 0]);
    const bp = Buffer.from(pos.buffer);
    const bi = Buffer.concat([Buffer.from(idx.buffer), Buffer.alloc(0)]);
    const bin = Buffer.concat([bp, bi]);
    const json = {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, scale: [7, 7, 7] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: bp.length },
        { buffer: 0, byteOffset: bp.length, byteLength: 6 },
      ],
      buffers: [{ byteLength: bin.length }],
    };
    const f = path.join(dir, 'berskala.glb');
    writeFileSync(f, tulisGLB({ json, bin }));
    const u = ukurGLB(f);
    assert.equal(u.objek_berkulit, 0);
    assert.equal(u.skala_diterapkan, false, 'mesh tanpa skin yang berskala HARUS tertangkap');
    assert.equal(u.kotak_dari, 'transform node');
    assert.equal(u.lebar, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PERBAIKAN menolak menyentuh mesh ber-skin, dan menyebut sebabnya', async (t) => {
  if (!ada(BUNNY)) return t.skip(lewatiTanpa('bunny'));
  const { terapkanTransform } = await import('./perbaiki.mjs');
  const { json, bin } = bacaGLB(readFileSync(BUNNY));
  const h = terapkanTransform(json, bin);
  assert.equal(h.berubah, false, 'tidak boleh ada satu node pun yang dipanggang');
  assert.equal(h.disentuh.length, 0);
  assert.ok(h.dilewati.length >= 4);
  for (const d of h.dilewati) assert.match(d.alasan, /ber-skin/);
});

test('titikBerkulit menghasilkan titik sebanyak verteks ber-skinnya', (t) => {
  if (!ada(BUNNY)) return t.skip(lewatiTanpa('bunny'));
  const titik = titikBerkulit(BUNNY);
  assert.ok(titik instanceof Float32Array);
  assert.ok(titik.length > 0 && titik.length % 3 === 0);
  // Setiap koordinat harus angka terhingga; NaN di sini berarti ada matriks
  // sendi yang tidak terselesaikan, dan kotak batasnya jadi omong kosong.
  for (let i = 0; i < titik.length; i++) {
    assert.ok(Number.isFinite(titik[i]), `titik ${i} bukan angka terhingga`);
  }
});
