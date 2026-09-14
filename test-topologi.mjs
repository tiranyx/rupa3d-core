/* Uji topologi — dengan bentuk yang jawabannya diketahui TANPA alat apa pun.
 *
 * Tetrahedron punya 4 muka, 6 tepi, dan tertutup. Segitiga tunggal punya 3
 * tepi batas. Tiga segitiga yang berbagi satu tepi memberi 1 tepi
 * tak-manifold. Semuanya bisa dihitung di kepala, jadi kalau alatnya
 * menjawab lain, alatnya yang salah — bukan acuannya.
 *
 * Ini penting justru karena kesalahan yang dikoreksi berkas ini: alat versi
 * lama melaporkan Takora punya 30.790 tepi tak-manifold. Yang sebenarnya
 * 360. Angkanya menggelembung 85x karena glTF memecah verteks di tiap
 * jahitan UV, dan tiap jahitan dihitung sebagai lubang.
 */
import test from 'node:test';
import { asetUji, lewatiTanpa } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { topologiPrimitif, topologiGLB, lasPosisi } from './topologi.mjs';

const TOL = 1e-6;
const uji = (posisi, indeks, uv = null) => topologiPrimitif(
  { posisi: new Float32Array(posisi), indeks: new Uint32Array(indeks), uv: uv && new Float32Array(uv) },
  { toleransi: TOL });

/* Tetrahedron satuan — 4 verteks, 4 muka, 6 tepi, tertutup. */
const TETRA_P = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const TETRA_I = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];

/* ── Manifold ───────────────────────────────────────────────────────── */

test('tetrahedron: 6 tepi, tertutup, tanpa cacat', () => {
  const t = uji(TETRA_P, TETRA_I);
  assert.equal(t.segitiga, 4);
  assert.equal(t.tepi_total, 6, 'tetrahedron punya persis 6 tepi');
  assert.equal(t.tepi_batas, 0);
  assert.equal(t.tepi_tak_manifold, 0);
  assert.equal(t.tertutup, true);
  assert.equal(t.tepi_putaran_salah, 0, 'orientasinya konsisten');
});

test('segitiga tunggal: 3 tepi batas, TIDAK tertutup', () => {
  const t = uji([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
  assert.equal(t.tepi_batas, 3);
  assert.equal(t.tertutup, false);
});

test('TIGA segitiga berbagi satu tepi = 1 tepi tak-manifold', () => {
  /* Bentuk "kipas": tepi 0-1 dipakai tiga muka. Boolean, solidify, dan
     cetak 3D semuanya gagal di sini, dan tidak ada yang terlihat di render. */
  const t = uji(
    [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1],
    [0, 1, 2, 0, 1, 3, 0, 1, 4],
  );
  assert.equal(t.tepi_tak_manifold, 1);
  assert.equal(t.tertutup, false);
});

test('putaran TERBALIK terdeteksi meski tepinya manifold', () => {
  /* Dua segitiga berbagi tepi, yang kedua dibalik. Tepinya tetap dipakai
     tepat 2 muka — jadi pemeriksa manifold saja akan bilang sehat. Yang
     terlihat di render: satu sisi hitam. */
  const p = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
  const benar = uji(p, [0, 1, 2, 1, 3, 2]);
  const terbalik = uji(p, [0, 1, 2, 1, 2, 3]);
  assert.equal(benar.tepi_putaran_salah, 0);
  assert.equal(terbalik.tepi_putaran_salah, 1,
    'pemeriksa manifold saja tidak menangkap ini');
});

/* ── Pengelasan: kesalahan 85x yang dikoreksi ───────────────────────── */

test('verteks yang terpecah di jahitan DILAS sebelum dihitung', () => {
  /* Dua segitiga di posisi yang bersambung, tetapi verteks bersamanya
     DIGANDAKAN — persis yang dilakukan glTF di tiap jahitan UV. */
  const p = [
    0, 0, 0, 1, 0, 0, 0, 1, 0,      // segitiga A
    1, 0, 0, 0, 1, 0, 1, 1, 0,      // segitiga B, dua verteks pertamanya duplikat
  ];
  const t = uji(p, [0, 1, 2, 3, 5, 4]);
  assert.equal(t.verteks_mentah, 6);
  assert.equal(t.verteks_terlas, 4, 'dua verteks duplikat harus jadi satu');
  assert.equal(t.nisbah_pecah, 1.5);
  assert.equal(t.tepi_batas, 4,
    'tanpa pengelasan angkanya 6 — tepi bersamanya akan terhitung dua kali sebagai batas');
});

test('toleransi las bersifat NISBI, bukan mutlak', () => {
  /* Model dalam milimeter dan model dalam meter harus dilas sama benarnya.
     Ambang mutlak akan melas seluruh model milimeter jadi satu titik. */
  const kecil = lasPosisi(new Float32Array([0, 0, 0, 0.001, 0, 0]), 1e-9);
  assert.equal(kecil.jumlah, 2, 'dua titik berjarak 1 mm bukan titik yang sama');
  const besar = lasPosisi(new Float32Array([0, 0, 0, 1e-9, 0, 0]), 1e-6);
  assert.equal(besar.jumlah, 1, 'dua titik berjarak 1 nm memang titik yang sama');
});

/* ── Segitiga rusak ─────────────────────────────────────────────────── */

test('segitiga DEGENERASI terdeteksi — tiga titik segaris', () => {
  const t = uji([0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 1, 2]);
  assert.equal(t.segitiga_degenerasi, 1);
  assert.equal(t.sudut_min_terkecil, 0);
});

test('SLIVER terdeteksi, dan segitiga sehat tidak salah dituduh', () => {
  const sliver = uji([0, 0, 0, 1, 0, 0, 0.5, 0.0005, 0], [0, 1, 2]);
  assert.equal(sliver.segitiga_sliver, 1, `sudut min ${sliver.sudut_min_terkecil}°`);
  assert.ok(sliver.sudut_min_terkecil < 1);

  const sehat = uji([0, 0, 0, 1, 0, 0, 0.5, 0.866, 0], [0, 1, 2]);
  assert.equal(sehat.segitiga_sliver, 0);
  assert.ok(Math.abs(sehat.sudut_min_terkecil - 60) < 0.5,
    `segitiga sama sisi harus 60°, dapat ${sehat.sudut_min_terkecil}`);
});

test('segitiga yang LIPAT sesudah dilas terdeteksi', () => {
  /* Tiga verteks berbeda indeks tetapi dua di antaranya di posisi yang sama:
     luasnya bukan nol menurut indeks mentah, tetapi setelah dilas ia bukan
     lagi segitiga. */
  const t = uji([0, 0, 0, 1, 0, 0, 1, 0, 0], [0, 1, 2]);
  assert.equal(t.segitiga_lipat, 1);
});

/* ── UV ─────────────────────────────────────────────────────────────── */

test('kerapatan texel SERAGAM memberi sebaran ≈ 1', () => {
  /* Dua segitiga sama besar di dunia dan sama besar di UV. */
  const p = [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0];
  const uv = [0, 0, 0.1, 0, 0, 0.1, 0.5, 0, 0.6, 0, 0.5, 0.1];
  const t = uji(p, [0, 1, 2, 3, 4, 5], uv);
  assert.ok(Math.abs(t.uv.texel_sebaran - 1) < 0.01,
    `sebaran ${t.uv.texel_sebaran}, harusnya ~1`);
});

test('kerapatan texel TIMPANG terdeteksi', () => {
  /* Segitiga kedua sama besar di dunia tetapi 4x lebih kecil di UV:
     ia akan 4x lebih buram pada tekstur yang sama, dan itu tidak terlihat
     sampai teksturnya dipasang. */
  const p = [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0];
  const uv = [0, 0, 0.4, 0, 0, 0.4, 0.5, 0, 0.6, 0, 0.5, 0.1];
  const t = uji(p, [0, 1, 2, 3, 4, 5], uv);
  assert.ok(t.uv.texel_sebaran > 3,
    `sebaran ${t.uv.texel_sebaran} — perbedaan 4x seharusnya terlihat jelas`);
});

test('UV di luar 0–1 dihitung', () => {
  const p = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  assert.equal(uji(p, [0, 1, 2], [0, 0, 0.5, 0, 0, 0.5]).uv.segitiga_di_luar_0_1, 0);
  assert.equal(uji(p, [0, 1, 2], [0, 0, 1.5, 0, 0, 0.5]).uv.segitiga_di_luar_0_1, 1);
});

test('mesh tanpa UV melaporkan null, bukan nol', () => {
  const t = uji(TETRA_P, TETRA_I);
  assert.equal(t.uv, null,
    'nol akan membuat aturan "sebaran texel <= 3" lulus pada mesh yang tidak punya UV sama sekali');
});

/* ── Aset sungguhan ─────────────────────────────────────────────────── */

const FLANGE = asetUji('flange').jalur;
const TAKORA = asetUji('takoraHidup').jalur;
const BATU = asetUji('batu').jalur;

test('keluaran b-rep OCCT bertopologi BERSIH', { skip: lewatiTanpa('flange') }, () => {
  const t = topologiGLB(FLANGE);
  assert.equal(t.tepi_tak_manifold, 0);
  assert.equal(t.tepi_batas, 0, 'padat tertutup tidak boleh punya tepi batas');
  assert.equal(t.tepi_putaran_salah, 0);
  assert.equal(t.segitiga_degenerasi, 0);
  assert.equal(t.primitif_tertutup, t.primitif);
});

test('koreksi 85×: tak-manifold Takora ratusan, bukan puluhan ribu', { skip: lewatiTanpa('takoraHidup') }, () => {
  const t = topologiGLB(TAKORA);
  assert.ok(t.tepi_tak_manifold < 2000,
    `${t.tepi_tak_manifold} tak-manifold — alat lama melaporkan 30.790 karena `
    + 'menghitung jahitan UV sebagai lubang');
  assert.ok(t.nisbah_pecah > 2,
    'Takora memang punya banyak jahitan; itu yang menggelembungkan angka lama');
  assert.ok(t.verteks_terlas < t.verteks_mentah);
});

test('yang TIDAK bisa diukur dari GLB disebut, bukan didiamkan', { skip: lewatiTanpa('flange') }, () => {
  const t = topologiGLB(FLANGE);
  assert.ok(Array.isArray(t.tidak_bisa_diukur_dari_glb));
  assert.ok(t.tidak_bisa_diukur_dari_glb.some((s) => /quad/i.test(s)),
    'glTF selalu tersegitiga — alat yang mengklaim menilai quad-dominance dari GLB mengarang');
});

/* ── Tumpang-tindih UV ──────────────────────────────────────────────── */

import { tumpangUV } from './topologi.mjs';

const F = (p, i, u) => ({
  posisi: new Float32Array(p), indeks: new Uint32Array(i),
  uv: u ? new Float32Array(u) : null,
});

test('segitiga BERTETANGGA tidak dihitung bertindih', () => {
  /* Ini syarat yang membuat pengukurnya berguna sama sekali. Rasterisasi
     yang menghitung tiap texel tersentuh akan menandai SETIAP tepi bersama
     sebagai tumpang-tindih — ribuan temuan palsu pada mesh mana pun.
     Mencuplik di PUSAT texel menghapusnya sepenuhnya. */
  const r = tumpangUV(F(
    [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], [0, 1, 2, 1, 3, 2],
    [0.1, 0.1, 0.4, 0.1, 0.1, 0.4, 0.4, 0.4],
  ), { resolusi: 256 });
  assert.equal(r.texel_bertindih, 0);
  assert.equal(r.lapis_maks, 1);
  assert.ok(r.texel_terpakai > 1000, 'harus benar-benar merasterisasi sesuatu');
});

test('segitiga yang MENUMPUK terdeteksi 100%', () => {
  const r = tumpangUV(F(
    [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0], [0, 1, 2, 3, 4, 5],
    [0.1, 0.1, 0.4, 0.1, 0.1, 0.4, 0.1, 0.1, 0.4, 0.1, 0.1, 0.4],
  ), { resolusi: 256 });
  assert.equal(r.persen_dari_terpakai, 100);
  assert.equal(r.lapis_maks, 2);
});

test('tumpang-tindih SEBAGIAN memberi angka di antaranya', () => {
  /* Dua segitiga yang beririsan separuh. Angkanya harus di antara 0 dan 100,
     bukan salah satu ujungnya — pemeriksa yang cuma bisa menjawab ya/tidak
     tidak bisa membedakan cermin sengaja dari kekacauan. */
  const r = tumpangUV(F(
    [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0], [0, 1, 2, 3, 4, 5],
    [0.1, 0.1, 0.5, 0.1, 0.1, 0.5, 0.3, 0.1, 0.7, 0.1, 0.3, 0.5],
  ), { resolusi: 256 });
  assert.ok(r.persen_dari_terpakai > 1 && r.persen_dari_terpakai < 99,
    `${r.persen_dari_terpakai}% — harusnya di antaranya`);
  assert.equal(r.lapis_maks, 2);
});

test('mesh tanpa UV mengembalikan null, bukan nol', () => {
  assert.equal(tumpangUV(F([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], null)), null,
    'nol akan meloloskan aturan tumpang-tindih pada mesh yang tidak punya UV');
});

test('resolusi DILAPORKAN, karena ia menentukan apa yang bisa terlihat', () => {
  const f = F([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], [0.1, 0.1, 0.4, 0.1, 0.1, 0.4]);
  assert.equal(tumpangUV(f, { resolusi: 128 }).resolusi, 128);
  assert.equal(tumpangUV(f, { resolusi: 1024 }).resolusi, 1024);
  /* Dijepit ke rentang yang masuk akal, bukan dipercaya mentah-mentah. */
  assert.equal(tumpangUV(f, { resolusi: 2 }).resolusi, 16);
  assert.equal(tumpangUV(f, { resolusi: 99999 }).resolusi, 2048);
});

test('aset ber-UV bersih memberi 0%, dan yang kacau memberi angka besar',
  { skip: lewatiTanpa('batu', 'takoraHidup') }, () => {
    /* Batu di-UV-unwrap dengan smart_project; Takora tidak pernah di-unwrap
       benar. Selisihnya harus terlihat jelas — kalau tidak, pengukurnya
       tidak membedakan apa pun. */
    const bersih = topologiGLB(BATU);
    assert.equal(bersih.uv_tumpang_persen_terburuk, 0);
    assert.equal(bersih.uv_tumpang_lapis_maks, 1);

    const kacau = topologiGLB(TAKORA);
    assert.ok(kacau.uv_tumpang_persen_terburuk > 50,
      `${kacau.uv_tumpang_persen_terburuk}% — UV Takora memang tidak bisa dipakai memanggang`);
    assert.ok(kacau.uv_tumpang_lapis_maks > 10);
  });

test('tumpang-tindih boleh dimatikan kalau cuma butuh angka lain', { skip: lewatiTanpa('batu') }, () => {
  const t = topologiGLB(BATU, { tumpang: false });
  assert.equal(t.uv_tumpang_resolusi, null);
  assert.equal(t.uv_tumpang_persen_terburuk, null);
});
