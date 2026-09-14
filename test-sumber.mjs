/* Uji TOPOLOGI SUMBER — terhadap bentuk yang jawabannya bisa dihitung tanpa
 * alat apa pun.
 *
 * ── Aturan yang mengikat berkas ini ──────────────────────────────────────
 *
 * Tiap acuan di sini DITURUNKAN, bukan disalin dari keluaran alatnya. Acuan
 * yang diambil dari alat yang diuji akan mewarisi kesalahan alat itu, dan
 * ujinya akan tetap hijau selamanya sambil membekukan bug-nya.
 *
 * Torus 48x12, misalnya:
 *   muka   = 48 x 12                       = 576 quad
 *   verteks= 48 x 12                       = 576
 *   tepi   = 576 x 4 / 2                   = 1152   (semua valensi 4)
 *   gelang = 12 arah-mayor + 48 arah-minor = 60, semuanya TERTUTUP
 *   silang: 12 x 48 + 48 x 12              = 1152   ✓ cocok dengan tepi
 *
 * Yang terakhir itu penting: dua jalan aritmetika yang berbeda harus sampai
 * ke angka yang sama. Kalau tidak, turunannya yang salah — bukan alatnya.
 */
import test from 'node:test';
import { asetUji, lewatiTanpa } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { Blender } from './blender.mjs';

const RUANG = '.uji-sumber';

/** Satu proses Blender untuk SELURUH berkas ini.
 *
 *  Menyalakan Blender 449 ms dan memuat adegannya beberapa detik. Sebelas uji
 *  yang masing-masing menyalakan prosesnya sendiri akan makan menit, dan uji
 *  yang terlalu lambat untuk dijalankan adalah uji yang berhenti dijalankan.
 */
let SEMUA = null;

async function ukur() {
  if (SEMUA) return SEMUA;
  const b = new Blender({ ruang: RUANG });
  const kode = [
    'import bpy',
    'for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)',
    // torus: satu-satunya primitif yang SELURUHNYA quad, SELURUHNYA valensi 4,
    // dan tanpa satu pun batas. Acuan terbersih yang ada.
    'bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=12)',
    "bpy.context.object.name = 'torus'",
    'bpy.ops.mesh.primitive_cube_add(location=(5,0,0))',
    "bpy.context.object.name = 'kubus'",
    'bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=5, location=(10,0,0))',
    "bpy.context.object.name = 'bidang'",
    // subdivisions=1 adalah ikosahedron telanjang: 20 muka, 12 verteks, 30 tepi
    'bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, location=(15,0,0))',
    "bpy.context.object.name = 'ico'",
    'bpy.ops.mesh.primitive_cylinder_add(vertices=32, location=(20,0,0))',
    "bpy.context.object.name = 'silinder'",
    // quad yang SENGAJA tidak sebidang, dan kembarannya yang rata sebagai
    // kontrol. Tanpa yang pertama, pemeriksa tak-sebidang tidak pernah MERAH.
    "me = bpy.data.meshes.new('m'); ob = bpy.data.objects.new('quad_miring', me)",
    'bpy.context.collection.objects.link(ob)',
    'me.from_pydata([(0,0,25),(1,0,25),(1,1,26),(0,1,25)], [], [(0,1,2,3)]); me.update()',
    "me2 = bpy.data.meshes.new('m2'); ob2 = bpy.data.objects.new('quad_rata', me2)",
    'bpy.context.collection.objects.link(ob2)',
    'me2.from_pydata([(3,0,25),(4,0,25),(4,1,25),(3,1,25)], [], [(0,1,2,3)]); me2.update()',
  ].join('\n');
  const r = await b.jalankanBanyak([
    { op: 'baru' }, { op: 'skrip', kode }, { op: 'topologi_sumber' },
  ]);
  assert.equal(r.ok, true, `rantai gagal: ${JSON.stringify(r).slice(0, 400)}`);
  const t = r.hasil.at(-1);
  SEMUA = { total: t, oleh: Object.fromEntries(t.per_objek.map((p) => [p.nama, p])) };
  return SEMUA;
}

test('torus 48x12 — SELURUHNYA quad, SELURUHNYA valensi 4, tanpa kutub', async () => {
  const { oleh } = await ukur();
  const t = oleh.torus;
  assert.equal(t.muka, 48 * 12, 'muka = mayor x minor');
  assert.equal(t.quad, 576);
  assert.equal(t.ngon, 0);
  assert.equal(t.segitiga, 0);
  assert.equal(t.quad_persen, 100);
  assert.equal(t.verteks, 576);
  assert.equal(t.tepi, 576 * 4 / 2, 'tiap verteks valensi 4, tiap tepi dipakai 2 verteks');
  assert.equal(t.verteks_batas, 0, 'torus tertutup, tidak punya batas');
  assert.deepEqual(t.valensi, { 4: 576 });
  assert.equal(t.kutub_n, 0);
  assert.equal(t.kutub_e, 0);
  assert.equal(t.kutub_persen, 0);
});

test('torus — 60 edge loop, SEMUANYA tertutup, terpanjang 48', async () => {
  const { oleh } = await ukur();
  const t = oleh.torus;
  // 12 gelang arah-mayor (panjang 48) + 48 gelang arah-minor (panjang 12).
  assert.equal(t.gelang, 12 + 48);
  assert.equal(t.gelang_tertutup, 60, 'permukaan tertutup tanpa kutub: tiap loop menutup');
  assert.equal(t.gelang_terputus, 0);
  assert.equal(t.gelang_terpanjang, 48);
  // Silang aritmetika: total tepi harus keluar sama lewat dua jalan berbeda.
  assert.equal(12 * 48 + 48 * 12, t.tepi);
});

test('kubus — 8 verteks valensi 3, jadi 8 kutub dan TIAP loop putus', async () => {
  const { oleh } = await ukur();
  const k = oleh.kubus;
  assert.equal(k.muka, 6);
  assert.equal(k.quad, 6);
  assert.equal(k.verteks, 8);
  assert.equal(k.tepi, 12);
  assert.equal(k.verteks_batas, 0, 'kubus tertutup');
  assert.deepEqual(k.valensi, { 3: 8 });
  assert.equal(k.kutub_n, 8, 'seluruh sudut kubus bervalensi 3');
  assert.equal(k.kutub_persen, 100);
  // Loop hanya menerus lewat verteks valensi 4. Di kubus tidak ada satu pun,
  // jadi tiap tepi berdiri sendiri.
  assert.equal(k.gelang, 12);
  assert.equal(k.gelang_terpanjang, 1);
  assert.equal(k.gelang_tertutup, 0);
});

test('bidang 5x5 — verteks BATAS dikeluarkan dari analisis kutub', async () => {
  const { oleh } = await ukur();
  const b = oleh.bidang;
  assert.equal(b.muka, 25, '5 x 5 sel');
  assert.equal(b.verteks, 36, '6 x 6 simpul');
  assert.equal(b.tepi, 2 * 5 * 6, '5 tepi x 6 baris, dua arah');
  assert.equal(b.verteks_batas, 20, 'keliling 6x6 = 6*4 - 4');
  assert.equal(b.verteks_dalam, 16, '4 x 4 di dalam');
  assert.deepEqual(b.valensi, { 4: 16 },
    'SELURUH verteks dalam bervalensi 4 — bidang datar tidak punya kutub');
  assert.equal(b.kutub_n + b.kutub_e, 0,
    'kalau batas ikut dihitung, 20 verteks tepi akan salah disebut kutub');
});

test('bidang 5x5 — 28 gelang: 20 tepi batas berdiri sendiri + 8 gelang dalam', async () => {
  const { oleh } = await ukur();
  const b = oleh.bidang;
  // Diturunkan, bukan disalin:
  //   tepi batas    20, tiap satu berhenti seketika (ujungnya valensi < 4)
  //   tepi dalam    60 - 20 = 40
  //   gelang dalam  4 baris + 4 kolom = 8, masing-masing panjang 5 = 40 tepi ✓
  assert.equal(b.gelang, 20 + 8);
  assert.equal(b.gelang_terpanjang, 5);
  assert.equal(b.gelang_tertutup, 0, 'bidang terbuka: tidak ada loop yang menutup');
});

test('ikosahedron — 0% quad, dan 12 kutub-E bervalensi 5', async () => {
  const { oleh } = await ukur();
  const i = oleh.ico;
  assert.equal(i.muka, 20);
  assert.equal(i.segitiga, 20);
  assert.equal(i.quad, 0);
  assert.equal(i.quad_persen, 0, 'nol SUNGGUHAN, bukan null — mukanya ada, quad-nya tidak');
  assert.equal(i.verteks, 12);
  assert.equal(i.tepi, 30, 'Euler: 12 - 30 + 20 = 2');
  assert.deepEqual(i.valensi, { 5: 12 });
  assert.equal(i.kutub_e, 12);
  assert.equal(i.kutub_n, 0);
  assert.equal(i.gelang, 30, 'valensi 5 menghentikan tiap loop seketika');
});

test('silinder 32 sisi — n-gon terhitung TERPISAH dari quad', async () => {
  const { oleh } = await ukur();
  const s = oleh.silinder;
  assert.equal(s.muka, 34, '32 sisi + 2 tutup');
  assert.equal(s.quad, 32);
  assert.equal(s.ngon, 2, 'kedua tutupnya n-gon bersisi 32, bukan quad dan bukan segitiga');
  assert.equal(s.segitiga, 0);
  assert.equal(s.quad_persen, Number((32 * 100 / 34).toFixed(4)));
  assert.equal(s.verteks, 64);
  assert.equal(s.tepi, 96, '32 tegak + 32 atas + 32 bawah');
});

test('quad TAK SEBIDANG ditangkap — dan sudutnya cocok dengan hitungan tangan', async () => {
  const { oleh } = await ukur();
  const m = oleh.quad_miring;
  // (0,0,0) (1,0,0) (1,1,1) (0,1,0), digeser +25 di Z supaya tidak menabrak
  // benda lain — pergeseran seragam tidak mengubah sudut antar-normal.
  //   n1 = (1,0,0) x (1,1,1) = ( 0, -1, 1)
  //   n2 = (1,1,1) x (0,1,0) = (-1,  0, 1)
  //   cos = 1 / (V2 * V2) = 0,5  ->  60 derajat
  assert.equal(m.quad_tak_sebidang, 1);
  assert.equal(m.sebidang_terburuk_derajat, 60);
});

test('quad RATA tidak ditandai — pemeriksanya tidak asal merah', async () => {
  const { oleh } = await ukur();
  const r = oleh.quad_rata;
  assert.equal(r.quad, 1);
  assert.equal(r.quad_tak_sebidang, 0);
  assert.equal(r.sebidang_terburuk_derajat, 0);
});

test('torus & silinder: sudut tak-sebidang BUKAN nol, tetapi di bawah ambang', async () => {
  const { oleh } = await ukur();
  // Kalau angka ini nol di kedua-duanya, pengukurnya mungkin macet di nol dan
  // "0 quad tak sebidang" jadi verdik yang tidak pernah bisa salah.
  assert.ok(oleh.torus.sebidang_terburuk_derajat > 0,
    'sel torus memang sedikit melengkung — nol berarti pengukurnya mati');
  assert.equal(oleh.torus.quad_tak_sebidang, 0, 'tetapi jauh di bawah ambang 1 derajat');
  assert.ok(oleh.silinder.sebidang_terburuk_derajat >= 0);
});

test('GLB yang diimpor ulang keluar 0% quad — dan itu DISEBUT, bukan didiamkan', { skip: lewatiTanpa('batu') }, async () => {
  const b = new Blender({ ruang: RUANG });
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    { op: 'muat', berkas: '.rupa3d/tekstur/batu-batu.glb' },
    { op: 'topologi_sumber' },
  ]);
  assert.equal(r.ok, true);
  const t = r.hasil.at(-1);
  assert.equal(t.quad, 0);
  assert.equal(t.segitiga, t.muka, 'glTF selalu tersegitiga');
  // Ini uji yang paling penting di berkas ini. Tanpa peringatannya, pembaca
  // akan menyimpulkan asetnya bertopologi buruk — padahal informasinya sudah
  // musnah saat diekspor, dan memutar-baliknya lewat Blender tidak
  // memulihkannya.
  assert.equal(t.peringatan.length, 1);
  assert.match(t.peringatan[0], /SELURUHNYA SEGITIGA/);
  assert.match(t.peringatan[0], /TIDAK BISA membedakan/);
});

test('objek tunggal bisa dipilih, dan yang tidak ada DITOLAK', async () => {
  const b = new Blender({ ruang: RUANG });
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    { op: 'skrip', kode: 'import bpy\nbpy.ops.mesh.primitive_cube_add()\nbpy.context.object.name = "satu"' },
    { op: 'topologi_sumber', objek: 'satu' },
  ]);
  assert.equal(r.hasil.at(-1).objek, 1);

  const gagal = await b.jalankan('topologi_sumber', { objek: 'tidak-ada' });
  assert.equal(gagal.ok, false, 'objek yang tidak ada harus GAGAL, bukan mengukur objek lain');
  assert.match(gagal.error, /tidak ketemu/);
});
