/* Uji lingkar penuh Rupa3D terhadap Blender SUNGGUHAN.
 *
 * Bukan mock. Yang perlu dibuktikan justru hal-hal yang cuma muncul pada
 * Blender asli: apakah tugasnya sampai, apakah hasilnya kembali sebagai JSON,
 * apakah angka ukurnya benar, apakah rendernya menghasilkan berkas, apakah
 * GLB-nya bisa dimuat balik. Mock akan lulus untuk semuanya dan tidak
 * membuktikan satu pun.
 *
 * Dilewati (bukan gagal) kalau Blender tidak terpasang.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Blender } from './blender.mjs';

const RUANG = path.join(fileURLToPath(new URL('.', import.meta.url)), '.uji-ruang');
rmSync(RUANG, { recursive: true, force: true });
const b = new Blender({ ruang: RUANG });
const versi = await b.versi();
const lewati = { skip: versi ? false : 'Blender tidak terpasang' };

/* Ruang kerja terpisah per uji rantai — dua uji yang berbagi satu adegan
   akan saling menimpa, dan yang gagal bukan yang salah. */
const ruangUji = (nama) => path.join(RUANG, nama);

/* Kubus 2×2×2 pada skala objek 3× — sengaja: dimensinya jadi 6, dan itu yang
   membuktikan pengukur membaca matriks dunia, bukan data mesh mentah. */
const KODE_KUBUS = `
bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 1))
kubus = bpy.context.active_object
kubus.name = "kubus"
kubus.scale = (3.0, 3.0, 3.0)
keluaran["nama"] = kubus.name
`;

test('rupa_baru membuat adegan kosong', lewati, async () => {
  const r = await b.jalankan('baru', { satuan: 'METRIC' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.objek, 0);
  assert.ok(existsSync(b.adegan), 'adegan.blend harus ditulis');
});

test('rupa_skrip membangun, dan keluarannya kembali', lewati, async () => {
  const r = await b.jalankan('skrip', { kode: KODE_KUBUS });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.keluaran.nama, 'kubus');
  assert.ok(r.objek.includes('kubus'));
});

test('rupa_ukur membaca matriks DUNIA, bukan mesh mentah', lewati, async () => {
  const r = await b.jalankan('ukur');
  assert.equal(r.ok, true, r.error);
  const k = r.objek.find((o) => o.nama === 'kubus');
  assert.ok(k, 'kubus harus terukur');
  assert.equal(k.segitiga, 12, 'kubus = 12 segitiga');
  /* size 2 × skala 3 = 6. Kalau pengukurnya membaca data mesh saja ia akan
     melaporkan 2, dan seluruh gunanya hilang. */
  for (const d of k.ukuran) assert.ok(Math.abs(d - 6) < 1e-3, `ukuran ${d} harus 6`);
  assert.equal(k.skala_sudah_diterapkan, false);
  assert.equal(k.tepi_tak_manifold, 0);
  assert.ok(r.peringatan.some((p) => p.includes('skala')), 'skala belum diterapkan harus jadi peringatan');
});

test('rupa_lihat membingkai dari kotak batas dan menulis PNG', lewati, async () => {
  const r = await b.jalankan('lihat', { sudut: ['hero', 'depan'], ukuran: 160, mesin: 'EEVEE', contoh: 8 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.berkas.length, 2);
  for (const f of r.berkas) {
    assert.ok(existsSync(f), `render harus ada: ${f}`);
    assert.ok(statSync(f).size > 1000, 'PNG tidak boleh kosong');
  }
  /* Kubus berpusat di z = 1 dan berukuran 6 → pusat kotak batas z = 1. */
  assert.ok(Math.abs(r.pusat[2] - 1) < 1e-2, `pusat z ${r.pusat[2]} harus 1`);
  assert.ok(r.jarak_kamera > 6, 'kamera harus mundur cukup jauh untuk objek selebar 6');
});

test('rupa_ekspor menerapkan skala, lalu GLB-nya bisa dimuat balik', lewati, async () => {
  const glb = path.join(RUANG, 'keluar', 'uji.glb');
  const r = await b.jalankan('ekspor', { berkas: glb, terapkan_transformasi: true });
  assert.equal(r.ok, true, r.error);
  assert.ok(existsSync(glb));
  assert.ok(r.ukuran_bita > 500, 'GLB tidak boleh kosong');
  assert.equal(r.total_segitiga, 12);
  assert.ok(r.catatan.some((c) => c.includes('skala diterapkan')));

  /* Sesudah diterapkan, skalanya 1 tetapi ukurannya TETAP 6 — itu inti
     "menerapkan skala": bentuknya tidak berubah, node-nya jadi bersih. */
  const u = await b.jalankan('ukur');
  const k = u.objek.find((o) => o.nama === 'kubus');
  assert.equal(k.skala_sudah_diterapkan, true);
  for (const d of k.ukuran) assert.ok(Math.abs(d - 6) < 1e-3, `ukuran ${d} harus tetap 6`);

  /* Muat balik ke adegan bersih: GLB yang ditulis harus benar-benar terbaca. */
  const b2 = new Blender({ ruang: path.join(RUANG, 'balik') });
  await b2.jalankan('baru', {});
  const m = await b2.jalankan('muat', { berkas: glb });
  assert.equal(m.ok, true, m.error);
  const u2 = await b2.jalankan('ukur');
  assert.equal(u2.total_segitiga, 12, 'segitiga harus bertahan lewat GLB');
});

test('kegagalan skrip kembali sebagai DATA, bukan lemparan', lewati, async () => {
  const r = await b.jalankan('skrip', { kode: 'raise ValueError("sengaja")' });
  assert.equal(r.ok, false);
  assert.match(r.error, /ValueError: sengaja/);
  assert.ok(r.jejak.includes('ValueError'), 'jejak tumpukan harus ikut, supaya bisa diperbaiki');
});

test('op yang tidak dikenal ditolak dengan jelas', lewati, async () => {
  const r = await b.jalankan('mengarang', {});
  assert.equal(r.ok, false);
  assert.match(r.error, /op tidak dikenal/);
});

/* ── Mode BERANTAI: optimasi yang harus membuktikan dirinya benar ────── */

test('berantai memberi hasil yang IDENTIK dengan satu-per-satu', lewati, async () => {
  /* Cepat yang salah lebih buruk daripada lambat yang benar. Yang diuji di
     sini bukan kecepatannya — itu sudah terukur 7,14x — melainkan bahwa
     angkanya tidak berubah sedikit pun. */
  const OPS = [
    { op: 'baru', satuan: 'METRIC' },
    { op: 'skrip', kode: 'bpy.ops.mesh.primitive_uv_sphere_add(radius=1.3, segments=24)' },
    { op: 'ukur' },
    { op: 'lod', nisbah: [0.5] },
  ];
  const bersih = (h) => {
    const { detik, _op, _urut, adegan, ...x } = h;
    return JSON.stringify(x);
  };

  const bA = new Blender({ ruang: ruangUji('rantai-a') });
  const A = [];
  for (const o of OPS) { const { op, ...t } = o; A.push(await bA.jalankan(op, t)); }

  const bB = new Blender({ ruang: ruangUji('rantai-b') });
  const r = await bB.jalankanBanyak(OPS);
  assert.equal(r.berantai, true);
  assert.equal(r.hasil.length, OPS.length);

  for (let i = 0; i < OPS.length; i++) {
    assert.equal(bersih(r.hasil[i]), bersih(A[i]),
      `op ${OPS[i].op} berbeda antara berantai dan satu-per-satu`);
  }
});

test('rantai BERHENTI di kegagalan pertama', lewati, async () => {
  /* Op berikutnya hampir selalu bergantung pada yang sebelumnya. Menjalankan
     sisanya di atas adegan setengah jadi menghasilkan angka yang tampak
     wajar untuk keadaan yang tidak pernah dimaksudkan. */
  const b = new Blender({ ruang: ruangUji('rantai-gagal') });
  const tujuan = path.join(ruangUji('rantai-gagal'), 'tidak-boleh-ada.glb');
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    { op: 'skrip', kode: 'bpy.ops.mesh.primitive_cube_add()' },
    { op: 'op_yang_tidak_ada' },
    { op: 'ekspor', berkas: tujuan },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.hasil[0].ok, true);
  assert.equal(r.hasil[1].ok, true);
  assert.equal(r.hasil[2].ok, false);
  assert.match(r.hasil[3].error, /rantai dihentikan/);
  assert.equal(existsSync(tujuan), false,
    'ekspor sesudah kegagalan TIDAK boleh berjalan');
});

test('rantai kosong ditolak, bukan diam-diam sukses', lewati, async () => {
  const b = new Blender({ ruang: ruangUji('rantai-kosong') });
  await assert.rejects(() => b.jalankanBanyak([]), /setidaknya satu op/);
});

test('adegan tersimpan SEKALI di akhir rantai, dan isinya benar', lewati, async () => {
  /* `simpan()` ditunda dalam mode berantai. Kalau penundaannya bocor, adegan
     terakhir tidak pernah tertulis dan op berikutnya di panggilan LAIN akan
     bekerja di atas keadaan lama — kegagalan yang muncul jauh dari sebabnya. */
  const ruang = ruangUji('rantai-simpan');
  const b = new Blender({ ruang });
  await b.jalankanBanyak([
    { op: 'baru' },
    { op: 'skrip', kode: 'bpy.ops.mesh.primitive_cube_add()\nbpy.ops.mesh.primitive_uv_sphere_add(location=(3,0,0))' },
  ]);
  /* Panggilan TERPISAH: kalau simpannya bocor, adegannya kosong di sini. */
  const u = await b.jalankan('ukur', {});
  assert.equal(u.ok !== false, true);
  assert.equal(u.objek.length, 2,
    `${u.objek.length} objek — adegan rantai sebelumnya tidak tersimpan`);
});

/* ── SILANG: pembaca berkas vs Blender, bidang demi bidang ──────────────
 *
 * Dua implementasi yang mengukur benda yang sama harus DIIKAT, kalau tidak
 * keduanya akan bergeser sendiri-sendiri dan tak satu pun tahu. Repo ini
 * sudah sekali terbakar oleh dua berkas yang diam-diam berbeda niat
 * (konvensi `null` di `spek.mjs` lawan `topologi.mjs`), jadi kali ini
 * ikatannya ditulis lebih dulu.
 *
 * Yang diuji bukan "angkanya sekian" melainkan "kedua jalan sampai ke angka
 * yang sama". Uji begitu tetap benar walau modelnya diganti.
 */
test('ukurGLB cocok dengan Blender, bidang demi bidang', async () => {
  const { turunkanUkuran } = await import('./spek.mjs');
  const { ukurGLB } = await import('./ukur-glb.mjs');

  // Dibangun di sini, bukan mengambil aset repo: aset repo bisa berubah, dan
  // uji yang bergantung padanya akan merah karena alasan yang salah.
  const keluar = path.join(RUANG, 'silang.glb');
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    {
      op: 'skrip',
      kode: [
        'import bpy',
        'bpy.ops.mesh.primitive_cube_add(size=2, location=(0,0,1))',
        'bpy.context.object.name = "kubus"',
        'bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(3,0,0.5))',
        'bpy.context.object.name = "bola"',
      ].join('\n'),
    },
    { op: 'ukur' },
    { op: 'ekspor', berkas: keluar },
  ]);
  assert.equal(r.ok, true, `rantai gagal: ${JSON.stringify(r).slice(0, 300)}`);

  const dariBlender = turunkanUkuran(r.hasil[2]);
  const dariBerkas = ukurGLB(keluar);

  // Blender Z-atas, glTF Y-atas. Kalau konversinya salah, `tinggi` dan
  // `pivot_z` yang pertama meleset — dan keduanya angka yang paling sering
  // dipakai spek.
  for (const k of ['lebar', 'dalam', 'tinggi', 'pivot_z', 'nisbah_lebar_tinggi']) {
    assert.ok(Math.abs(dariBlender[k] - dariBerkas[k]) < 1e-3,
      `${k}: Blender ${dariBlender[k]} vs berkas ${dariBerkas[k]}`);
  }
  assert.equal(dariBerkas.segitiga_total, dariBlender.segitiga_total);
  assert.equal(dariBerkas.objek_mesh, dariBlender.objek_mesh);
  assert.equal(dariBerkas.skala_diterapkan, dariBlender.skala_diterapkan);
  assert.equal(dariBerkas.sumbu_atas, 'Y');
});

test('konversi sumbu terbukti PERLU — Z-atas pada GLB memberi angka lain', async () => {
  // Kalau uji di atas lulus dengan konvensi mana pun, ia tidak membuktikan
  // konversinya benar; ia cuma membuktikan bendanya kebetulan simetris.
  const { ukurGLB } = await import('./ukur-glb.mjs');
  const keluar = path.join(RUANG, 'sumbu.glb');
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    // Balok 1 x 2 x 4 di Blender: tinggi (Z) = 4, dalam (Y) = 2.
    {
      op: 'skrip',
      kode: ['import bpy',
        'bpy.ops.mesh.primitive_cube_add(size=1)',
        'bpy.context.object.scale = (1, 2, 4)',
        'bpy.ops.object.transform_apply(scale=True)'].join('\n'),
    },
    { op: 'ekspor', berkas: keluar },
  ]);
  assert.equal(r.ok, true);
  const y = ukurGLB(keluar, { sumbu_atas: 'Y' });
  const z = ukurGLB(keluar, { sumbu_atas: 'Z' });
  assert.ok(Math.abs(y.tinggi - 4) < 1e-3, `Y-atas harus memberi tinggi 4, dapat ${y.tinggi}`);
  assert.ok(Math.abs(z.tinggi - 2) < 1e-3, `Z-atas pada berkas Y-atas memberi DALAM-nya: ${z.tinggi}`);
  assert.notEqual(y.tinggi, z.tinggi);
});

test('Blender TIDAK BISA melihat verteks lepas di GLB — pembaca berkas bisa', async () => {
  /* Ini alasan paling kuat kenapa pengukur sisi-berkas ada sama sekali.
     Importir glTF Blender membuang verteks tak-terujuk saat impor, jadi
     `simpul_lepas` lewat Blender akan SELALU nol untuk sebuah GLB — bukan
     karena berkasnya bersih, melainkan karena Blender tidak pernah
     melihatnya. Nol yang datang dari kebutaan terbaca persis seperti nol
     yang datang dari kebersihan. */
  const { turunkanUkuran } = await import('./spek.mjs');
  const { ukurGLB } = await import('./ukur-glb.mjs');
  const { tulisGLB, bacaGLB } = await import('./glb.mjs');
  const { readFileSync, writeFileSync } = await import('node:fs');

  const asal = path.join(RUANG, 'lepas-asal.glb');
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    { op: 'skrip', kode: 'import bpy\nbpy.ops.mesh.primitive_cube_add()' },
    { op: 'ekspor', berkas: asal },
  ]);
  assert.equal(r.ok, true);

  // Tambahkan empat verteks yang tidak dirujuk indeks mana pun, dengan
  // menaikkan `count` accessor POSITION-nya. Bita nolnya sudah ada di
  // bufferView karena padding, jadi berkasnya tetap sah.
  const { json, bin } = bacaGLB(readFileSync(asal));
  const iPos = json.meshes[0].primitives[0].attributes.POSITION;
  const bv = json.bufferViews[json.accessors[iPos].bufferView];
  const tambah = Buffer.alloc(4 * 12);
  const binBaru = Buffer.concat([bin, tambah]);
  bv.byteOffset = binBaru.length - tambah.length - bv.byteLength;
  // Sisipkan di akhir supaya offset lain tidak bergeser: pindahkan datanya.
  binBaru.copy(binBaru, bv.byteOffset, bv.byteOffset, bv.byteOffset + bv.byteLength);
  bv.byteLength += tambah.length;
  json.accessors[iPos].count += 4;
  json.buffers[0].byteLength = binBaru.length;
  const rusak = path.join(RUANG, 'lepas.glb');
  writeFileSync(rusak, tulisGLB({ json, bin: binBaru }));

  const berkas = ukurGLB(rusak);
  assert.equal(berkas.simpul_lepas, 4, 'pembaca berkas harus melihat keempatnya');

  const rb = await b.jalankanBanyak([
    { op: 'baru' }, { op: 'muat', berkas: rusak }, { op: 'ukur' },
  ]);
  assert.equal(rb.ok, true);
  assert.equal(turunkanUkuran(rb.hasil[2]).simpul_lepas, 0,
    'kalau Blender tiba-tiba melaporkannya, kalimat di komentar ini yang salah — '
    + 'dan itu perlu diketahui, bukan didiamkan');
});
