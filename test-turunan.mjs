/* Uji kosakata SPEK untuk turunan.
 *
 * Yang dijaga di sini bukan "apakah kodenya jalan", melainkan satu hal yang
 * lebih halus dan lebih berbahaya: **apakah angkanya BERARTI.**
 *
 * Sebuah aturan yang menilai angka tak bermakna lebih buruk daripada tidak
 * ada aturan — ia memberi rasa aman tanpa menjaga apa pun. Itu benar-benar
 * terjadi: `galat_lod_terburuk_persen` sempat melaporkan 0,0000 karena ia
 * hanya membaca objek PERTAMA, yang kebetulan sebuah gelembung berdiameter
 * 0,09 satuan. Aturannya lulus, dan tempurungnya tidak pernah diperiksa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dariLod, dariTabrakan, dariBake, dariBrep, dariTekstur, gabungTurunan } from './turunan.mjs';

/* Dua objek dengan galat yang sangat berbeda. Yang PERTAMA yang paling kecil
   — persis susunan yang membuat versi lama berbohong. */
const LOD_DUA_OBJEK = {
  lod: [
    {
      asal: 'gelembung', diagonal: 0.09,
      tingkat: [
        { tingkat: 0, segitiga: 80, galat: { maks_persen_diagonal: 0 } },
        { tingkat: 1, segitiga: 40, galat: { maks_persen_diagonal: 0.0 }, segitiga_nisbi: 0.5 },
      ],
    },
    {
      asal: 'tempurung', diagonal: 2.8,
      tingkat: [
        { tingkat: 0, segitiga: 5000, galat: { maks_persen_diagonal: 0 } },
        { tingkat: 1, segitiga: 2500, galat: { maks_persen_diagonal: 1.7 }, segitiga_nisbi: 0.5 },
      ],
    },
  ],
};

test('galat LOD diambil TERBURUK di seluruh objek, bukan dari yang pertama', () => {
  const u = dariLod(LOD_DUA_OBJEK);
  assert.equal(u.galat_lod_terburuk_persen, 1.7,
    'membaca objek pertama saja akan memberi 0 — dan 0 itu bohong');
  assert.equal(u.galat_lod_terburuk_objek, 'tempurung',
    'objek penyumbangnya harus disebut supaya bisa ditelusuri');
  assert.equal(u.galat_lod_terburuk_tingkat, 1);
  assert.equal(u.lod_objek, 2);
});

test('segitiga LOD DIJUMLAHKAN lintas objek', () => {
  const u = dariLod(LOD_DUA_OBJEK);
  assert.equal(u.segitiga_lod0, 5080);
  assert.equal(u.segitiga_lod1, 2540);
  assert.equal(u.nisbah_lod1, 0.5);
});

test('LOD kosong tidak menghasilkan kode palsu', () => {
  // Kode yang muncul dengan nilai 0 saat pipelinenya TIDAK dijalankan akan
  // membuat aturan lulus tanpa ada yang diukur. Lebih baik kodenya tidak ada
  // sama sekali — `nilaiAturan` menghitung ukuran yang HILANG sebagai gagal.
  assert.deepEqual(dariLod(null), {});
  assert.deepEqual(dariLod({ lod: [] }), {});
});

test('dua arah galat tabrakan diberi nama SENDIRI-SENDIRI', () => {
  // Keduanya punya arti berbeda bagi pemain, jadi spek harus bisa memberi
  // ambang yang berbeda: menembus dinding merusak, menabrak udara mengganggu.
  const u = dariTabrakan({
    objek_terpilih: 'tempurung',
    tabrakan: [{
      asal: 'tempurung', bentuk: 'cembung', segitiga_proksi: 198, volume_nisbi: 1.045,
      penyimpangan_permukaan_asli_dari_proksi: { maks_persen_diagonal: 2.56 },
      penyimpangan_proksi_dari_permukaan_asli: { maks_persen_diagonal: 0.35 },
      cocok_untuk_dinamis: true,
    }],
  });
  assert.equal(u.tabrakan_tembus_persen, 2.56);
  assert.equal(u.tabrakan_longgar_persen, 0.35);
  assert.notEqual(u.tabrakan_tembus_persen, u.tabrakan_longgar_persen);
  assert.equal(u.tabrakan_objek, 'tempurung', 'objek yang diukur harus disebut');
  assert.equal(u.tabrakan_dinamis, true);
});

test('trimesh ditandai TIDAK cocok untuk dinamis', () => {
  const u = dariTabrakan({
    tabrakan: [{ bentuk: 'mesh_sederhana', segitiga_proksi: 1280, cocok_untuk_dinamis: false }],
  });
  assert.equal(u.tabrakan_dinamis, false,
    'sebagian besar mesin fisika, Rapier termasuk, menolak trimesh dinamis');
});

test('bake: variasi TERKECIL yang dilaporkan — satu peta kosong sudah cukup buruk', () => {
  const u = dariBake([
    { jenis: 'normal', cakupan_uv_persen: 28.63, variasi_piksel: 0.23732, ukuran: 512 },
    { jenis: 'ao', cakupan_uv_persen: 28.63, variasi_piksel: 0.00000, ukuran: 512 },
  ]);
  assert.equal(u.bake_jumlah, 2);
  assert.equal(u.bake_variasi_min, 0,
    'peta AO yang kosong tidak boleh tersembunyi di balik peta normal yang bagus');
  assert.equal(u.bake_normal_variasi, 0.23732);
  assert.equal(u.bake_ao_variasi, 0);
});

test('galat tesselasi dilaporkan MUTLAK — arah melesetnya bukan urusan spek', () => {
  const u = dariBrep({
    volume_eksak: 143954.059, luas_eksak: 34020.307,
    mesh: { toleransi: 0.05, segitiga: 2316, galat_persen: -0.0016 },
  });
  assert.equal(u.galat_tesselasi_persen, 0.0016, 'tanda minus akan membalik makna `<=`');
  assert.equal(u.volume_eksak, 143954.059);
  assert.equal(u.tesselasi_toleransi, 0.05);
});

test('gabungTurunan menyatukan tanpa saling menimpa', () => {
  const u = gabungTurunan({
    lod: LOD_DUA_OBJEK,
    tabrakan: { tabrakan: [{ bentuk: 'cembung', segitiga_proksi: 198, cocok_untuk_dinamis: true }] },
    bake: [{ jenis: 'normal', variasi_piksel: 0.2, cakupan_uv_persen: 30 }],
    brep: { volume_eksak: 100, luas_eksak: 50, mesh: { galat_persen: -0.01 } },
  });
  assert.equal(u.galat_lod_terburuk_persen, 1.7);
  assert.equal(u.tabrakan_segitiga, 198);
  assert.equal(u.bake_variasi_min, 0.2);
  assert.equal(u.galat_tesselasi_persen, 0.01);
});

/* KEABSAHAN vs KEBERADAAN — dua pertanyaan yang mudah dicampur, dan
 * campurannya menyebut sebab yang salah pada pembacanya. */

test('tex_normal_sah benar secara HAMPA kalau tidak ada normal map', () => {
  const u = dariTekstur({ gambar: 1, per_gambar: [{ normal: null }] });
  assert.equal(u.tex_normal_jumlah, 0);
  assert.equal(u.tex_normal_sah, true,
    'aset beralbedo saja sah di glTF — menolaknya lewat "normal map tidak sah" '
    + 'mengirim pembacanya memperbaiki peta yang tidak pernah ada');
});

test('tex_normal_sah salah kalau ADA normal map yang tidak sah', () => {
  const sah = dariTekstur({ gambar: 1, per_gambar: [{ normal: { terlihat_seperti_normal: true } }] });
  const tidak = dariTekstur({ gambar: 2, per_gambar: [
    { normal: { terlihat_seperti_normal: true } },
    { normal: { terlihat_seperti_normal: false } },
  ] });
  assert.equal(sah.tex_normal_sah, true);
  assert.equal(tidak.tex_normal_sah, false, 'satu yang tidak sah cukup untuk menggagalkan');
  assert.equal(tidak.tex_normal_jumlah, 2);
});

test('tex_gambar yang menjawab KEBERADAAN, dan ia tidak pernah null', () => {
  assert.equal(dariTekstur({ gambar: 0, per_gambar: [] }).tex_gambar, 0);
  assert.equal(dariTekstur({ gambar: 3, per_gambar: [] }).tex_gambar, 3);
});
