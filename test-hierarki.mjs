/* Uji HIERARKI — `hierarki.mjs` menggantikan lima jalan-ke-induk dan empat
 * salinan matriks. Dua janjinya diuji terpisah:
 *
 *   1. ia MENOLAK hierarki yang dilarang spesifikasi glTF, dengan menyebut
 *      node-nya;
 *   2. ia menghasilkan matriks dunia yang IDENTIK BIT DEMI BIT dengan
 *      salinan-salinan lama — karena angka sertifikat yang sudah terbit
 *      berasal dari sana, dan "sama sampai 1e-12" bukan "sama".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { petaInduk, matriksDunia, matriksNode, kaliMatriks } from './hierarki.mjs';

test('pohon sah: peta anak → induk benar, akar tidak punya induk', () => {
  const induk = petaInduk({ nodes: [{ children: [1, 2] }, { children: [3] }, {}, {}] });
  assert.deepEqual([...induk.entries()].sort(), [[1, 0], [2, 0], [3, 1]]);
  assert.equal(induk.has(0), false);
});

test('GLB tanpa node sama sekali bukan kesalahan', () => {
  assert.equal(petaInduk({}).size, 0);
});

test('anak di luar jangkauan DITOLAK dengan menyebut jumlah node', () => {
  assert.throws(() => petaInduk({ nodes: [{ children: [5] }, {}] }),
    /node 0 menyebut anak 5, padahal hanya ada 2 node/);
  assert.throws(() => petaInduk({ nodes: [{ children: [0.5] }] }), /menyebut anak 0.5/);
  assert.throws(() => petaInduk({ nodes: [{ children: [-1] }] }), /menyebut anak -1/);
});

test('children yang bukan larik DITOLAK, bukan TypeError telanjang', () => {
  assert.throws(() => petaInduk({ nodes: [{ children: 3 }] }), /"children" yang bukan larik/);
});

test('satu anak disebut DUA kali oleh induk yang sama juga dua induk', () => {
  assert.throws(() => petaInduk({ nodes: [{ children: [1, 1] }, {}] }),
    /node 1 punya lebih dari satu induk \(0 dan 0\)/);
});

test('siklus tiga node disebut LENGKAP — tanpa node yang cuma jalan masuknya', () => {
  // induk: 0→1, 1→2, 2→3, 3→1. Jalan dari node 0 masuk ke siklus 1 → 2 → 3;
  // node 0 sendiri bukan anggota siklus dan tidak boleh ikut disebut.
  const nodes = [{}, { children: [0, 3] }, { children: [1] }, { children: [2] }];
  assert.throws(() => petaInduk({ nodes }), /bersiklus \(1 → 2 → 3 → 1\)/);
});

test('matriksDunia punya sabuk pengaman untuk peta yang TIDAK dari petaInduk', () => {
  const nodes = [{}, {}];
  const induk = new Map([[0, 1], [1, 0]]);
  assert.throws(() => matriksDunia(nodes, induk, 0), /melebihi jumlah node/);
});

/* Salinan lama PERSIS, disimpan di sini sebagai acuan. Dari glb.mjs sebelum
   14 Sep: perkaliannya menjumlahkan langsung ke o[] dengan `+=` — berbeda
   bentuk dari salinan di kulit/perbaiki/ukur-glb yang memakai `s` lokal. Uji
   ini yang membuktikan keduanya memberi bit yang sama dengan modul barunya. */
const kaliLamaGlb = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
  }
  return o;
};

function duniaLama(nodes, i) {
  const anak = new Map();
  nodes.forEach((n, j) => (n.children ?? []).forEach((c) => anak.set(c, j)));
  let m = matriksNode(nodes[i]);
  let p = anak.get(i);
  while (p != null) { m = kaliLamaGlb(matriksNode(nodes[p]), m); p = anak.get(p); }
  return m;
}

test('matriks dunia IDENTIK BIT DEMI BIT dengan jalan-ke-induk lama, pada hierarki TRS acak', () => {
  // Pembangkit deterministik: kegagalan harus bisa diulang persis.
  let benih = 20260914;
  const acak = () => ((benih = (benih * 1103515245 + 12345) % 2147483648) / 2147483648);
  const nodeAcak = () => {
    const q = [acak() - 0.5, acak() - 0.5, acak() - 0.5, acak() - 0.5];
    const n = Math.hypot(...q);
    return {
      translation: [acak() * 200 - 100, acak() * 200 - 100, acak() * 200 - 100],
      rotation: q.map((v) => v / n),
      scale: [acak() * 40 + 0.001, acak() * 40 + 0.001, acak() * 40 + 0.001],
    };
  };
  let dibandingkan = 0;
  for (let ulang = 0; ulang < 50; ulang++) {
    // rantai 6 tingkat + cabang, supaya urutan perkalian benar-benar diuji
    const nodes = Array.from({ length: 9 }, nodeAcak);
    for (let k = 0; k < 5; k++) nodes[k].children = [k + 1];
    nodes[2].children.push(7);
    nodes[7].children = [8];
    const induk = petaInduk({ nodes });
    for (let i = 0; i < nodes.length; i++) {
      const baru = matriksDunia(nodes, induk, i);
      const lama = duniaLama(nodes, i);
      for (let e = 0; e < 16; e++) {
        assert.ok(Object.is(baru[e], lama[e]),
          `ulang ${ulang}, node ${i}, elemen ${e}: ${baru[e]} ≠ ${lama[e]}`);
        dibandingkan++;
      }
    }
  }
  assert.equal(dibandingkan, 50 * 9 * 16);
});

test('kaliMatriks sama bit demi bit dengan bentuk `+=` lama, termasuk tanda nol', () => {
  const a = [-0, 1e-300, 3, 0, 5, -0, 7, 0, 9, 10, 1e300, 0, -13, 14, 15, 1];
  const b = [1, -0, 0, 0, 0, 1, -0, 0, 0, 0, 1, 0, 2.5, -3.5, 4.5, 1];
  const baru = kaliMatriks(a, b);
  const lama = kaliLamaGlb(a, b);
  for (let e = 0; e < 16; e++) assert.ok(Object.is(baru[e], lama[e]), `elemen ${e}`);
});
