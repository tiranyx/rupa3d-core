/* Uji format adegan.
 *
 * Berkas ini ditulis SESUDAH dua bug ditemukan dengan tangan, dan kedua bug
 * itu punya bentuk yang sama: **alat yang diam ketika seharusnya berbunyi.**
 *
 *   1. `skala: 0.001` — bentuk yang skema MCP-nya sendiri izinkan — diam-diam
 *      jatuh ke [1,1,1], dan flange 140 mm terbit sebagai benda 140 METER.
 *      Tidak ada galat. Yang terlihat cuma lantai, karena kameranya berada
 *      di dalam flange itu.
 *
 *   2. Pemeriksa skala melihat angka 140 itu dan DIAM, karena dengan satu
 *      node properti tidak ada median untuk dibandingkan.
 *
 * Jadi yang diuji di sini bukan "apakah fungsinya jalan", melainkan **apakah
 * ia berbunyi di tempat yang seharusnya.**
 */
import test from 'node:test';
import { asetUji, lewatiTanpa } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  adeganBaru, tambahNode, ubahNode, hapusNode, daftarkanAset,
  aturCahaya, hapusCahaya, aturKamera, aturLingkungan,
  periksaAdegan, ukuranNode, skalaTimpang, bahanSah,
} from './adegan.mjs';
import { terbitkan } from './terbit.mjs';

const TMP = mkdtempSync(path.join(tmpdir(), 'rupa3d-adegan-'));
process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

const GLB_FLANGE = asetUji('flange').jalur;

/* ── Bug 1: masukan tak sah harus BERBUNYI, bukan jatuh ke bawaan ────── */

test('skala skalar DISIARKAN ke tiga sumbu, tidak dibuang', () => {
  const a = adeganBaru();
  const n = tambahNode(a, { id: 'x', jenis: 'kotak', ukuran: [10, 10, 10], skala: 0.001 });
  assert.deepEqual(n.skala, [0.001, 0.001, 0.001],
    'jatuh ke [1,1,1] berarti benda 10 mm terbit sebagai benda 10 meter');
});

test('skala tak sah DITOLAK, tidak diam-diam jadi [1,1,1]', () => {
  const a = adeganBaru();
  for (const jahat of [[1, 2], 'besar', [1, 2, 'x'], [1, 2, NaN], {}]) {
    assert.throws(() => tambahNode(a, { jenis: 'kotak', skala: jahat }), /skala/,
      `${JSON.stringify(jahat)} harus ditolak, bukan diganti bawaan`);
  }
});

test('posisi dan putar juga ditolak kalau cacat, dan pesannya menyebut BIDANG mana', () => {
  const a = adeganBaru();
  assert.throws(() => tambahNode(a, { jenis: 'kotak', posisi: [1, 2] }), /posisi/);
  assert.throws(() => tambahNode(a, { jenis: 'kotak', putar: 'miring' }), /putar/);
  assert.throws(() => aturKamera(a, { posisi: [0, 0] }), /kamera\.posisi/);
});

test('ubahNode memakai aturan yang sama dengan tambahNode', () => {
  const a = adeganBaru();
  tambahNode(a, { id: 'x', jenis: 'kotak' });
  assert.deepEqual(ubahNode(a, 'x', { skala: 2 }).skala, [2, 2, 2]);
  assert.throws(() => ubahNode(a, 'x', { skala: [1, 2] }), /skala/);
  assert.deepEqual(ubahNode(a, 'x', { skala: [1, 2, 3] }).skala, [1, 2, 3]);
});

/* ── Bug 2: pemeriksa yang bisu saat objeknya sedikit ────────────────── */

test('SATU properti raksasa di atas lantai tetap DITANGKAP tanpa median', () => {
  const a = adeganBaru();
  tambahNode(a, {
    id: 'lantai', jenis: 'bidang', peran: 'latar', ukuran: [30, 1, 30], bayangan: false,
  });
  tambahNode(a, { id: 'raksasa', jenis: 'kotak', ukuran: [140, 140, 12] });

  const s = skalaTimpang(a);
  assert.equal(s.median, null, 'satu properti memang tidak punya median');
  assert.equal(s.timpang.length, 1,
    'versi lama mengembalikan timpang 0 di sini — dan adegannya memuat flange 140 METER');
  assert.equal(s.timpang[0].id, 'raksasa');
  assert.ok(s.timpang[0].lipat_latar > 1,
    'acuannya latar, bukan median — itu yang membuatnya bisa berbunyi');
  assert.ok(s.catatan.includes('median tidak bermakna'),
    'kenapa median dilewati harus DIKATAKAN, bukan disembunyikan');
});

test('properti yang wajar tidak ditandai', () => {
  const a = adeganBaru();
  tambahNode(a, { id: 'lantai', jenis: 'bidang', peran: 'latar', ukuran: [30, 1, 30] });
  tambahNode(a, { id: 'wajar', jenis: 'kotak', ukuran: [1, 1, 1] });
  assert.equal(skalaTimpang(a).timpang.length, 0);
});

test('LATAR dikecualikan lewat peran, bukan lewat ambang yang dilonggarkan', () => {
  const a = adeganBaru();
  tambahNode(a, { id: 'lantai', jenis: 'bidang', peran: 'latar', ukuran: [40, 1, 40] });
  for (const i of [1, 2, 3]) tambahNode(a, { id: `p${i}`, jenis: 'bola', ukuran: [1, 1, 1] });

  const s = skalaTimpang(a);
  assert.deepEqual(s.dikecualikan, ['lantai']);
  assert.equal(s.timpang.length, 0, 'lantai 40 m di adegan bermedian 1,7 BUKAN kesalahan');
  assert.equal(s.ambang, 25, 'ambangnya tidak boleh dinaikkan untuk meloloskan lantai');
});

test('median tetap menangkap yang timpang saat propertinya banyak', () => {
  const a = adeganBaru();
  for (const i of [1, 2, 3]) tambahNode(a, { id: `p${i}`, jenis: 'bola', ukuran: [1, 1, 1] });
  tambahNode(a, { id: 'salah', jenis: 'kotak', ukuran: [400, 400, 400] });
  const s = skalaTimpang(a);
  assert.equal(s.timpang.length, 1);
  assert.equal(s.timpang[0].id, 'salah');
  assert.ok(s.timpang[0].lipat > 25);
});

test('aset tanpa kotak batas DISEBUT, tidak dilewati diam-diam', () => {
  const a = adeganBaru();
  a.aset.hantu = { berkas: 'x.glb', bita: 0, kotak: null };
  tambahNode(a, { id: 'h', jenis: 'aset', aset: 'hantu' });
  const u = ukuranNode(a);
  assert.deepEqual(u.tanpa_ukuran, ['h'],
    'dilewati diam-diam berarti pemeriksanya berpura-pura memeriksa');
});

/* ── Adegan cacat ditolak DI DEPAN ──────────────────────────────────── */

test('node yang menyebut aset tak terdaftar ditolak', () => {
  const a = adeganBaru();
  assert.throws(() => tambahNode(a, { jenis: 'aset', aset: 'tidak_ada' }), /belum didaftarkan/);
});

test('adegan tanpa cahaya berkekuatan > 0 dinyatakan CACAT', () => {
  const a = adeganBaru();
  hapusCahaya(a, 'ambien');
  hapusCahaya(a, 'matahari');
  const cacat = periksaAdegan(a);
  assert.ok(cacat.some((c) => /HITAM/.test(c)),
    'layar hitam tanpa pesan adalah kegagalan yang paling mahal');
});

test('cahaya berkekuatan 0 tidak dihitung sebagai cahaya', () => {
  const a = adeganBaru();
  aturCahaya(a, { id: 'ambien', kuat: 0 });
  aturCahaya(a, { id: 'matahari', kuat: 0 });
  assert.ok(periksaAdegan(a).some((c) => /HITAM/.test(c)));
});

test('id node ganda ditolak', () => {
  const a = adeganBaru();
  tambahNode(a, { id: 'sama', jenis: 'kotak' });
  assert.throws(() => tambahNode(a, { id: 'sama', jenis: 'bola' }), /sudah dipakai/);
});

test('peran dan jenis yang tak dikenal ditolak, dan pesannya menyebut yang ADA', () => {
  const a = adeganBaru();
  assert.throws(() => tambahNode(a, { jenis: 'kubus' }), /kotak, bola/);
  assert.throws(() => tambahNode(a, { jenis: 'kotak', peran: 'hiasan' }), /properti, latar, pandu/);
});

test('warna wajib heks — nama warna CSS ditolak', () => {
  assert.throws(() => bahanSah({ warna: 'merah' }), /heks/);
  assert.throws(() => bahanSah({ warna: '#fff' }), /heks/);
  assert.deepEqual(bahanSah({ warna: '#FF8800' }), { warna: '#FF8800' });
  assert.throws(() => bahanSah({ kekasaran: 1.5 }), /kekasaran/);
});

/* ── Terbit ─────────────────────────────────────────────────────────── */

test('terbit menolak adegan cacat sebelum menulis apa pun', () => {
  const a = adeganBaru();
  hapusCahaya(a, 'ambien');
  hapusCahaya(a, 'matahari');
  assert.throws(() => terbitkan(a, { keluar: path.join(TMP, 'jangan.html') }), /cacat/);
});

test('halaman mandiri membawa charset sendiri, potongan tidak membawa <html>', () => {
  const a = adeganBaru('Uji');
  tambahNode(a, { id: 'k', jenis: 'kotak' });

  const mandiri = terbitkan(a, { mandiri: true });
  assert.ok(mandiri.html.startsWith('<!doctype html>'));
  assert.ok(/<meta charset="utf-8">/.test(mandiri.html),
    'tanpa ini server statis menyajikannya windows-1252 dan tiap em-dash rusak');
  assert.ok(/<head>[\s\S]*<title>[\s\S]*<\/title>[\s\S]*<\/head>/.test(mandiri.html),
    'title harus DI DALAM head, bukan mengandalkan pemulihan parser');

  const potongan = terbitkan(a, { mandiri: false });
  assert.ok(!/<html/i.test(potongan.html));
  assert.ok(!/<!doctype/i.test(potongan.html));
});

test('judul yang memuat < tidak merusak halaman', () => {
  const a = adeganBaru('<script>x</script>');
  tambahNode(a, { id: 'k', jenis: 'kotak' });
  const h = terbitkan(a, {});
  assert.ok(!/<title><script>/.test(h.html));
  assert.ok(/&lt;script&gt;/.test(h.html));
});

test('aset yang tidak dipakai node mana pun TIDAK ditanam', { skip: lewatiTanpa('flange') }, () => {
  const a = adeganBaru();
  daftarkanAset(a, 'nganggur', GLB_FLANGE);
  tambahNode(a, { id: 'k', jenis: 'kotak' });
  const h = terbitkan(a, {});
  const lap = h.aset.find((x) => x.kunci === 'nganggur');
  assert.equal(lap.ditanam, false, 'menanamnya menambah megabita untuk yang tidak pernah dirender');
  assert.ok(h.bita < 200 * 1024);
});

test('kotak batas GLB dibaca tanpa memuat mesh, dan angkanya benar', { skip: lewatiTanpa('flange') }, () => {
  const a = adeganBaru();
  const info = daftarkanAset(a, 'flange', GLB_FLANGE);
  // flange dibangun Ø140 mm, tebal 12 mm — angka dari contoh/flange-cad.mjs
  assert.ok(Math.abs(info.kotak.ukuran[0] - 140) < 0.1, `lebar ${info.kotak.ukuran[0]}`);
  assert.ok(Math.abs(info.kotak.ukuran[2] - 12) < 0.001, `tebal ${info.kotak.ukuran[2]}`);
  assert.ok(info.kotak.primitif > 0);
});

test('anggaran halaman ditolak dengan menyebut aset penyumbang terbesar', () => {
  const a = adeganBaru();
  const besar = path.join(TMP, 'besar.glb');
  writeFileSync(besar, Buffer.alloc(13 * 1024 * 1024));
  a.aset.besar = { berkas: besar, bita: 13 * 1024 * 1024, kotak: null };
  tambahNode(a, { id: 'b', jenis: 'aset', aset: 'besar' });
  assert.throws(() => terbitkan(a, {}), /penyumbang terbesar: aset "besar"/);
});

test('lingkungan menolak nilai di luar jangkauan', () => {
  const a = adeganBaru();
  assert.throws(() => aturLingkungan(a, { paparan: 0 }), /paparan/);
  assert.throws(() => aturLingkungan(a, { langit_atas: 'biru' }), /heks/);
  assert.equal(aturLingkungan(a, { paparan: 1.4 }).paparan, 1.4);
});

test('hapusNode dan hapusCahaya berbunyi kalau tidak ada', () => {
  const a = adeganBaru();
  assert.throws(() => hapusNode(a, 'hantu'), /tidak ada/);
  assert.throws(() => hapusCahaya(a, 'hantu'), /tidak ada/);
});
