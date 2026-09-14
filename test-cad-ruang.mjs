/* Uji ruang kerja CAD — shape bernama yang bertahan lintas panggilan.
 *
 * Yang dijaga di sini ada dua, dan yang kedua lebih penting:
 *
 * 1. Shape bisa disimpan dan dibaca lagi TANPA kehilangan ketepatan. Kalau
 *    putar-baliknya menggeser volume sedikit saja, seluruh alasan memakai
 *    b-rep hilang — mesh juga bisa "hampir benar".
 *
 * 2. `ok: true` dari kernel BUKAN bukti bentuknya sah. Terukur: fillet
 *    berradius di atas setengah sisi terkecil mengembalikan `ok` dengan solid
 *    rusak yang volumenya NAIK 1971 mm³ dari kotak 6000 mm³ — fillet yang
 *    menambah material. Alat yang meneruskan itu ke STEP akan mengirim berkas
 *    rusak ke CNC.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  bukaRuang, primitif, boolean2, fillet, chamfer, ubah,
  ukurBentuk, daftarBentuk, eksporBentuk, imporBerkas, tepiBentuk,
} from './cad-ruang.mjs';

const RUANG = mkdtempSync(path.join(tmpdir(), 'rupa3d-cad-'));
process.on('exit', () => { try { rmSync(RUANG, { recursive: true, force: true }); } catch {} });

const R = () => bukaRuang(RUANG);

/* Kotak 10×20×30 dipakai berulang: volume 6000 mm³ persis, dan sisi terkecil
   10 membuat batas fillet teoretisnya tepat 5 — angka bulat yang enak diuji. */
const KOTAK = { jenis: 'kotak', ukuran: [10, 20, 30] };

test('primitif tersimpan dengan volume EKSAK, bukan hampiran', async () => {
  const r = await R();
  const h = await primitif(r, 'kotak1', KOTAK);
  assert.equal(h.volume_eksak, 6000, '10×20×30 = 6000, bukan 5999,9998');
  assert.equal(h.luas_eksak, 2 * (10 * 20 + 10 * 30 + 20 * 30));
  assert.equal(h.sah, true);
});

test('putar-balik simpan→muat tidak menggeser volume sedikit pun', async () => {
  const r = await R();
  await primitif(r, 'putarbalik', { jenis: 'silinder', jari: 7.5, tinggi: 12 });
  const a = await ukurBentuk(r, 'putarbalik');
  const b = await ukurBentuk(r, 'putarbalik');   // dibaca ulang dari cakram
  assert.equal(a.volume_eksak, b.volume_eksak,
    'kalau ini geser, seluruh alasan memakai b-rep hilang');
  const analitik = Math.PI * 7.5 ** 2 * 12;
  assert.ok(Math.abs(a.volume_eksak - analitik) / analitik < 1e-9,
    `silinder ${a.volume_eksak} vs analitik ${analitik}`);
});

test('FILLET RUSAK DITOLAK meski kernel bilang ok', async () => {
  const r = await R();
  await primitif(r, 'kotak2', KOTAK);
  // r = 5,001 > setengah sisi terkecil. Kernel mengembalikan ok; solidnya
  // rusak dan volumenya NAIK jadi 7971,72.
  await assert.rejects(
    () => fillet(r, 'kotak2', { radius: 5.001, ke: 'kotak2f' }),
    /tidak sah|volume/i,
    'kernel bilang ok — pemeriksa kita yang harus menolak');
  assert.equal(existsSync(path.join(RUANG, 'cad', 'kotak2f.brep')), false,
    'hasil rusak tidak boleh sempat tersimpan');
});

test('fillet yang WAJAR diterima, dan volumenya turun', async () => {
  const r = await R();
  await primitif(r, 'kotak3', KOTAK);
  const h = await fillet(r, 'kotak3', { radius: 2, ke: 'kotak3f' });
  assert.equal(h.sah, true);
  assert.ok(h.volume_eksak < 6000, 'fillet membuang material di tepi cembung');
  assert.equal(h.volume_sebelum, 6000);
  assert.ok(h.volume_eksak > 5000, `turun terlalu jauh: ${h.volume_eksak}`);
});

test('fillet SELEKTIF — hanya tepi searah tertentu (B6)', async () => {
  const r = await R();
  await primitif(r, 'kotak4', KOTAK);
  const tepi = await tepiBentuk(r, 'kotak4');
  assert.equal(tepi.jumlah, 12, 'kotak punya 12 tepi');
  assert.deepEqual(tepi.per_arah, { X: 4, Y: 4, Z: 4 });

  const semua = await fillet(r, 'kotak4', { radius: 2, ke: 'k4semua' });
  const hanyaZ = await fillet(r, 'kotak4', { radius: 2, arah: 'Z', ke: 'k4z' });
  assert.equal(hanyaZ.tepi_difillet, 4);
  assert.equal(semua.tepi_difillet, 12);
  assert.ok(hanyaZ.volume_eksak > semua.volume_eksak,
    'memfillet 4 tepi membuang lebih sedikit daripada 12');
});

test('boolean: potong lubang, volume turun sesuai analitik', async () => {
  const r = await R();
  await primitif(r, 'blok', KOTAK);
  // Silinder menembus penuh sumbu Z: tinggi 30, jari 3, dipusatkan di 5,10.
  await primitif(r, 'bor', { jenis: 'silinder', jari: 3, tinggi: 30, pusat: [5, 10, 0] });
  const h = await boolean2(r, 'potong', 'blok', 'bor', { ke: 'berlubang' });
  const diharap = 6000 - Math.PI * 9 * 30;
  assert.ok(Math.abs(h.volume_eksak - diharap) / diharap < 1e-9,
    `${h.volume_eksak} vs analitik ${diharap}`);
  assert.equal(h.sah, true);
});

test('daftar menyebut tiap bentuk berikut volumenya', async () => {
  const r = await R();
  await primitif(r, 'daftar_a', KOTAK);
  await primitif(r, 'daftar_b', { jenis: 'bola', jari: 5 });
  const d = await daftarBentuk(r);
  const nama = d.bentuk.map((b) => b.nama);
  assert.ok(nama.includes('daftar_a') && nama.includes('daftar_b'));
  const bola = d.bentuk.find((b) => b.nama === 'daftar_b');
  assert.ok(Math.abs(bola.volume_eksak - (4 / 3) * Math.PI * 125) < 1e-6);
});

test('ekspor STEP membawa b-rep EKSAK; GLB membawa hampiran yang TERUKUR', async () => {
  const r = await R();
  await primitif(r, 'ekspor1', { jenis: 'silinder', jari: 10, tinggi: 20 });
  const step = await eksporBentuk(r, 'ekspor1', path.join(RUANG, 'x.step'));
  assert.ok(step.bita > 1000);
  assert.equal(step.eksak, true, 'STEP menyimpan permukaan analitik');

  const glb = await eksporBentuk(r, 'ekspor1', path.join(RUANG, 'x.glb'), { toleransi: 0.05 });
  assert.equal(glb.eksak, false, 'GLB adalah segitiga — tidak pernah eksak');
  assert.ok(glb.galat_persen != null, 'dan galatnya WAJIB disebut, bukan disembunyikan');
  assert.ok(Math.abs(glb.galat_persen) < 1, `galat ${glb.galat_persen}% terlalu besar untuk tol 0,05`);
});

test('STEP putar-balik: tulis, baca lagi, volume bertahan', async () => {
  const r = await R();
  await primitif(r, 'pb', { jenis: 'silinder', jari: 6, tinggi: 15 });
  const asal = await ukurBentuk(r, 'pb');
  const berkas = path.join(RUANG, 'pb.step');
  await eksporBentuk(r, 'pb', berkas);
  const balik = await imporBerkas(r, berkas, 'pb_balik');
  const nisbi = Math.abs(balik.volume_eksak - asal.volume_eksak) / asal.volume_eksak;
  assert.ok(nisbi < 1e-9, `STEP menggeser volume ${nisbi * 100}%`);
});

test('nama bentuk tidak boleh keluar dari ruang kerjanya', async () => {
  const r = await R();
  for (const jahat of ['../lolos', 'a/b', 'C:\\mutlak', '..']) {
    await assert.rejects(() => primitif(r, jahat, KOTAK), /nama/i,
      `"${jahat}" harus ditolak`);
  }
});

test('operasi pada bentuk yang tidak ada berbunyi, bukan diam', async () => {
  const r = await R();
  await assert.rejects(() => ukurBentuk(r, 'tidak_pernah_ada'), /tidak ada/i);
  await assert.rejects(() => fillet(r, 'tidak_pernah_ada', { radius: 1, ke: 'x' }), /tidak ada/i);
});

test('ubah: geser tidak mengubah volume, skala mengubahnya pangkat tiga', async () => {
  const r = await R();
  await primitif(r, 'ubah1', KOTAK);
  const geser = await ubah(r, 'ubah1', { geser: [100, 0, 0], ke: 'ubah1g' });
  assert.ok(Math.abs(geser.volume_eksak - 6000) < 1e-6, 'geser tidak menambah material');

  const skala = await ubah(r, 'ubah1', { skala: 2, ke: 'ubah1s' });
  assert.ok(Math.abs(skala.volume_eksak - 6000 * 8) / (6000 * 8) < 1e-9,
    `skala 2× harus 8× volume, dapat ${skala.volume_eksak}`);
});

test('chamfer memakai urutan argumen yang sama, dan kernelnya JUJUR', async () => {
  /* Perbedaan yang terukur dan tidak disebut dokumentasi mana pun: fillet dan
     chamfer punya batas yang SAMA (setengah sisi terkecil = 5 di sini) tetapi
     berperilaku BERBEDA di atasnya.

       fillet  d>5   ok  + solid rusak  (isShapeValid false, volume NAIK)
       chamfer d>=5  GAGAL bersih di setiap nilai yang diuji

     Jadi di jalur chamfer pemeriksa kita adalah lapis KEDUA, bukan satu-
     satunya. Uji ini menyatakan itu apa adanya; menyamakan keduanya akan
     menyembunyikan bahwa hanya satu dari dua operasi yang bisa berbohong. */
  const r = await R();
  await primitif(r, 'cham', KOTAK);
  const h = await chamfer(r, 'cham', { jarak: 1, ke: 'chamf' });
  assert.equal(h.sah, true);
  assert.ok(h.volume_eksak < 6000);

  await assert.rejects(() => chamfer(r, 'cham', { jarak: 20, ke: 'chamx' }),
    /Chamfer operation failed/, 'kernel menolak sendiri, dan itu memang benar');
  assert.equal(existsSync(path.join(RUANG, 'cad', 'chamx.brep')), false);

  await assert.rejects(() => chamfer(r, 'cham', { jarak: 0, ke: 'chamy' }),
    /lebih besar dari 0/, 'ukuran nol ditolak SEBELUM menyentuh kernel');
});

test('pemeriksa volume menangkap kebohongan yang isShapeValid saja bisa lewatkan', async () => {
  /* Dua pemeriksa dipasang sengaja, dan keduanya harus bisa MERAH sendiri-
     sendiri. Yang ini membuktikan pemeriksa arah-volume benar-benar menyala:
     ia menolak hasil yang volumenya naik, tanpa bergantung pada isShapeValid. */
  const r = await R();
  await primitif(r, 'dua_a', KOTAK);
  await primitif(r, 'dua_b', { jenis: 'kotak', ukuran: [10, 20, 30], pusat: [100, 0, 0] });
  // `potong` dengan alat yang tidak bersinggungan: volume TIDAK berubah —
  // sah, dan memang tidak naik. Ini batas bawah yang harus tetap lolos.
  const h = await boolean2(r, 'potong', 'dua_a', 'dua_b', { ke: 'dua_c' });
  assert.equal(h.volume_eksak, 6000, 'memotong dengan benda yang jauh tidak membuang apa pun');

  // Dan `gabung` dua kotak terpisah WAJIB menaikkan volume jadi 12000.
  const g = await boolean2(r, 'gabung', 'dua_a', 'dua_b', { ke: 'dua_g' });
  assert.equal(g.volume_eksak, 12000);
});
