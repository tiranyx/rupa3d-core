/* Uji BERKAS JAHAT — GLB yang sengaja rusak, seperti yang akan dikirim orang
 * asing ke pemeriksa yang terbit di registri publik.
 *
 * Diukur 14 September 2026 SEBELUM ditambal, pada empat pembaca (ukurGLB,
 * topologiGLB, titikGLB, perbaikiGLB), heap dibatasi 512 MB:
 *
 *   node bersiklus / anak dirinya sendiri   keempatnya GANTUNG sampai dibunuh
 *   indeks 65535 pada mesh tiga verteks      keempatnya LOLOS — perbaiki melapor sukses
 *   skin 10 juta sendi                       ukur & perbaiki: proses MATI
 *   count 2^30 pada buffer 36 bita           ditolak, dengan pesan milik mesin
 *
 * ── Kenapa tiap kasus jalan di PROSES ANAK ───────────────────────────────
 *
 * Loop tak berujung yang sinkron memblokir event loop. `timeout` milik
 * node:test tidak akan pernah sempat menyala di proses yang sama, jadi
 * penjaga siklus yang kelak rusak lagi tidak akan membuat uji ini MERAH —
 * ia akan menggantungkan seluruh suite tanpa menyebut sebabnya. Proses anak
 * dengan batas waktu mengubah gantung menjadi kegagalan yang bernama.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { glbDari as glb } from './aset-uji.mjs';

const REPO = path.dirname(fileURLToPath(import.meta.url));
const DIR = mkdtempSync(path.join(tmpdir(), 'rupa-jahat-'));

const POS = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
const IDX = Buffer.from(new Uint16Array([0, 1, 2, 0]).buffer);
const BIN = Buffer.concat([POS, IDX]);
const dasar = () => ({
  asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
  ],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
  buffers: [{ byteLength: BIN.length }],
});

function tulis(nama, isi) {
  const f = path.join(DIR, `${nama}.glb`);
  writeFileSync(f, isi);
  return f;
}

/* Keempat pembaca, di satu proses anak, berurutan. Hasil tiap pembaca
   dicetak SEBELUM pembaca berikutnya dijalankan, supaya kalau satu
   menggantung, yang sebelumnya tetap terbaca. */
function periksaDiAnak(berkas) {
  const url = (m) => pathToFileURL(path.join(REPO, m)).href;
  const kode = `
    const PEMBACA = [
      ['ukurGLB', async (f) => (await import(${JSON.stringify(url('ukur-glb.mjs'))})).ukurGLB(f).segitiga_total],
      ['topologiGLB', async (f) => (await import(${JSON.stringify(url('topologi.mjs'))})).topologiGLB(f).segitiga],
      ['titikGLB', async (f) => (await import(${JSON.stringify(url('glb.mjs'))})).titikGLB(f).length / 3],
      ['perbaikiGLB', async (f) => (await (await import(${JSON.stringify(url('perbaiki.mjs'))})).perbaikiGLB(f, { jenis: ['skala'] })).ok],
    ];
    for (const [nama, pakai] of PEMBACA) {
      try { const nilai = await pakai(${JSON.stringify(berkas)});
        console.log(JSON.stringify({ nama, hasil: 'LOLOS', nilai }));
      } catch (e) { console.log(JSON.stringify({ nama, hasil: 'MELEMPAR', pesan: String(e.message) })); }
    }`;
  const r = spawnSync(process.execPath, ['--max-old-space-size=512', '--input-type=module', '-e', kode], {
    encoding: 'utf8', timeout: 20000,
  });
  const baris = (r.stdout ?? '').trim().split('\n').filter(Boolean).map((b) => JSON.parse(b));
  return { terbunuh: r.signal != null || r.error?.code === 'ETIMEDOUT', kode: r.status, baris, galat: r.stderr };
}

function tuntutDitolak(berkas, pola) {
  const r = periksaDiAnak(berkas);
  assert.equal(r.terbunuh, false,
    `pembaca MENGGANTUNG — yang sempat menjawab: ${r.baris.map((b) => b.nama).join(', ') || 'tidak ada'}`);
  assert.equal(r.kode, 0, `proses anak mati: ${r.galat.split('\n').find((l) => /Error|heap/i.test(l)) ?? r.galat.slice(0, 200)}`);
  assert.equal(r.baris.length, 4);
  for (const b of r.baris) {
    assert.equal(b.hasil, 'MELEMPAR', `${b.nama} MELOLOSKAN berkas tak sah (nilai ${JSON.stringify(b.nilai)})`);
    assert.match(b.pesan, pola, `${b.nama} menolak dengan pesan yang tidak menyebut cacatnya: ${b.pesan}`);
  }
}

test('kontrol: GLB sah yang sama LOLOS di keempat pembaca — penjaganya tidak asal menolak', () => {
  const r = periksaDiAnak(tulis('kontrol', glb(dasar(), BIN)));
  assert.equal(r.terbunuh, false);
  assert.deepEqual(r.baris.map((b) => [b.nama, b.hasil]), [
    ['ukurGLB', 'LOLOS'], ['topologiGLB', 'LOLOS'], ['titikGLB', 'LOLOS'], ['perbaikiGLB', 'LOLOS'],
  ]);
});

test('node bersiklus DITOLAK dan siklusnya disebut, bukan menggantung selamanya', () => {
  const j = dasar();
  j.nodes = [{ mesh: 0, children: [1] }, { children: [0] }];
  tuntutDitolak(tulis('siklus', glb(j, BIN)), /bersiklus \(0 → 1 → 0\)/);
});

test('node yang menjadi anak dirinya sendiri DITOLAK', () => {
  const j = dasar();
  j.nodes[0].children = [0];
  tuntutDitolak(tulis('anak-sendiri', glb(j, BIN)), /bersiklus \(0 → 0\)/);
});

test('indeks yang menunjuk verteks tak ada DITOLAK — dulu lolos, dan perbaiki melapor sukses', () => {
  const rusak = Buffer.concat([POS, Buffer.from(new Uint16Array([0, 1, 65535, 0]).buffer)]);
  tuntutDitolak(tulis('indeks', glb(dasar(), rusak)), /indeks ke-2 bernilai 65535.*3 verteks/);
});

test('accessor yang mengaku 2^30 elemen DITOLAK sebelum dialokasikan, dengan pesan milik berkasnya', () => {
  const j = dasar();
  j.accessors[0].count = 2 ** 30;
  tuntutDitolak(tulis('count', glb(j, BIN)), /accessor 0 .* melampaui bufferView/);
});

test('node dengan dua induk DITOLAK — spesifikasi mengizinkan paling banyak satu', () => {
  const j = dasar();
  j.nodes = [{ mesh: 0 }, { children: [0] }, { children: [0] }];
  tuntutDitolak(tulis('dua-induk', glb(j, BIN)), /node 0 punya lebih dari satu induk/);
});

test('skin 10 juta sendi pada GLB satu node: ukur DITOLAK, proses tidak mati', () => {
  const j = dasar();
  j.nodes[0].skin = 0;
  j.skins = [{ joints: Array(10_000_000).fill(0) }];
  const r = periksaDiAnak(tulis('sendi', glb(j, BIN)));
  assert.equal(r.terbunuh, false, 'menggantung');
  assert.equal(r.kode, 0, `proses anak mati: ${r.galat.slice(0, 200)}`);
  const oleh = Object.fromEntries(r.baris.map((b) => [b.nama, b]));
  // topologi dan titik tidak membaca skin; yang membaca skin wajib menolak.
  for (const nama of ['ukurGLB', 'perbaikiGLB']) {
    assert.equal(oleh[nama].hasil, 'MELEMPAR', `${nama} meloloskannya`);
    assert.match(oleh[nama].pesan, /10000000 sendi, padahal hanya ada 1 node/);
  }
});

test('rantai 100.000 node yang SAH tetap lolos — penjaganya linear, bukan kuadrat', () => {
  const j = dasar();
  const N = 100_000;
  j.nodes = Array.from({ length: N }, (_, i) => (i === N - 1 ? { mesh: 0 } : { children: [i + 1] }));
  const r = periksaDiAnak(tulis('rantai', glb(j, BIN)));
  assert.equal(r.terbunuh, false, 'rantai sah yang dalam tidak boleh menggantung');
  assert.deepEqual(r.baris.map((b) => b.hasil), ['LOLOS', 'LOLOS', 'LOLOS', 'LOLOS']);
});
