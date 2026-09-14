/* Uji BARIS PERINTAH — dan yang diuji terutama KODE KELUARNYA.
 *
 * ── Kenapa kode keluarnya yang paling penting ────────────────────────────
 *
 * `rupa` ada supaya jadi gerbang: `rupa periksa kirim/*.glb` di CI harus
 * MENGHENTIKAN build ketika ada aset yang tidak lolos. Alat yang mencetak
 * laporan bagus tetapi selalu keluar `0` tidak menghentikan apa pun — ia
 * hiasan yang mahal, dan cacatnya tidak terlihat dari keluarannya sama
 * sekali.
 *
 * Jadi tiap uji di sini menuntut kode keluar yang TEPAT, dan tiga-tiganya
 * dibuktikan: `0` lulus, `1` gagal spek, `2` tidak bisa diperiksa.
 *
 * Perbedaan `1` dan `2` bukan kerapian: yang pertama menuntut ASETNYA
 * diperbaiki, yang kedua menuntut ALATNYA diperbaiki. Menyamakan keduanya
 * membuat CI menyalahkan orang yang salah.
 */
import test from 'node:test';
import { asetUji, lewatiTanpa, glbDari } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Blender } from './blender.mjs';

const REPO = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(REPO, 'rupa.mjs');
const RUANG = path.join(REPO, '.uji-cli');

const BERSIH = asetUji('batu').jalur;
const CACAT = asetUji('takora').jalur;

/* GLB sah terkecil: kepala + satu chunk JSON berisi `asset` saja. Untuk uji
   yang cuma butuh berkas yang ADA, supaya kode keluarnya disebabkan hal yang
   memang diuji dan bukan oleh berkas yang hilang. */
function glbKosong() {
  const jalur = path.join(RUANG, 'kosong.glb');
  if (existsSync(jalur)) return jalur;
  mkdirSync(RUANG, { recursive: true });
  writeFileSync(jalur, glbDari({ asset: { version: '2.0' } }));
  return jalur;
}

function rupa(...argv) {
  const r = spawnSync(process.execPath, [CLI, ...argv], {
    cwd: REPO, encoding: 'utf8',
    // NO_COLOR supaya assert terhadap teksnya tidak pecah oleh kode ANSI.
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { kode: r.status, keluar: r.stdout ?? '', galat: r.stderr ?? '' };
}

let dracoP = null;
async function berkasDraco() {
  if (dracoP) return dracoP;
  const keluar = path.join(RUANG, 'draco.glb');
  dracoP = (async () => {
    if (existsSync(keluar)) return keluar;
    mkdirSync(RUANG, { recursive: true });
    const b = new Blender({ ruang: RUANG });
    const r = await b.jalankanBanyak([
      { op: 'baru' },
      { op: 'skrip', kode: 'import bpy\nbpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16)' },
      { op: 'ekspor', berkas: keluar, draco: true },
    ]);
    assert.equal(r.ok, true, `ekspor draco gagal: ${JSON.stringify(r).slice(0, 200)}`);
    return keluar;
  })();
  return dracoP;
}

test('tanpa argumen: bantuan, dan keluar 0', () => {
  const r = rupa();
  assert.equal(r.kode, 0);
  assert.match(r.keluar, /PERINTAH/);
  assert.match(r.keluar, /KODE KELUAR/);
});

test('KODE 0 — aset yang lolos seluruh aturan wajib', { skip: lewatiTanpa('batu') }, () => {
  const r = rupa('periksa', BERSIH);
  assert.equal(r.kode, 0, `keluar ${r.kode}: ${r.keluar.slice(0, 300)}`);
  assert.match(r.keluar, /LULUS/);
  assert.match(r.keluar, /batu-batu\.glb/);
});

test('KODE 1 — aset yang melanggar aturan wajib', { skip: lewatiTanpa('takora') }, () => {
  const r = rupa('periksa', CACAT);
  assert.equal(r.kode, 1, 'aset cacat HARUS menghentikan CI');
  assert.match(r.keluar, /GAGAL/);
  // Aturan yang gagal harus DISEBUT, bukan cuma dihitung.
  assert.match(r.keluar, /simpul_lepas|topo_putaran_salah/);
});

test('KODE 2 — berkas yang tidak ada, dan itu BEDA dari gagal spek', () => {
  const r = rupa('periksa', 'tidak/ada/sama-sekali.glb');
  assert.equal(r.kode, 2,
    'berkas tak terperiksa menuntut ALATNYA diperiksa, bukan asetnya diperbaiki');
  assert.match(r.galat, /berkas tidak ada/);
});

test('KODE 2 — spek yang tidak ada, dan sumbu yang cacat', () => {
  // Berkasnya HARUS ada. Versi lama uji ini memakai aset lokal, dan di clone
  // bersih ia LULUS karena alasan yang salah: berkasnya yang hilang, dan itu
  // juga kode 2. Jadi berkas yang pasti ada, dan PESANNYA ikut dituntut.
  const glb = glbKosong();
  const spek = rupa('periksa', glb, '--spek', 'spek/tidak-ada.json');
  assert.equal(spek.kode, 2);
  assert.match(spek.galat, /spek tidak ada/);
  const sumbu = rupa('periksa', glb, '--sumbu', 'X');
  assert.equal(sumbu.kode, 2);
  assert.match(sumbu.galat, /--sumbu harus Y atau Z/);
});

test('KODE 2 — tanpa berkas, dan perintah tak dikenal', () => {
  assert.equal(rupa('periksa').kode, 2, 'tanpa berkas');
  assert.equal(rupa('mengarang').kode, 2, 'perintah tak dikenal');
});

test('BANYAK berkas: satu yang gagal menggagalkan seluruhnya', { skip: lewatiTanpa('batu', 'takora') }, () => {
  const r = rupa('periksa', BERSIH, CACAT);
  assert.equal(r.kode, 1, 'gerbang tidak boleh lolos gara-gara sebagian lulus');
  assert.match(r.keluar, /1 lulus/);
  assert.match(r.keluar, /1 gagal/);
});

test('`--diam` memberi kode keluar TANPA keluaran', { skip: lewatiTanpa('batu', 'takora') }, () => {
  const lulus = rupa('periksa', BERSIH, '--diam');
  assert.equal(lulus.kode, 0);
  assert.equal(lulus.keluar.trim(), '', 'diam harus benar-benar diam');

  const gagal = rupa('periksa', CACAT, '--diam');
  assert.equal(gagal.kode, 1, 'diam tidak boleh mengubah verdiktnya');
  assert.equal(gagal.keluar.trim(), '');
});

test('`--json` menghasilkan JSON yang bisa diurai, dan kodenya tetap benar', { skip: lewatiTanpa('takora') }, () => {
  const r = rupa('periksa', CACAT, '--json');
  assert.equal(r.kode, 1, 'format keluaran tidak boleh mengubah verdiktnya');
  const j = JSON.parse(r.keluar);
  assert.equal(j.skema, 'rupa3d/sertifikat@1');
  assert.equal(j.lulus, false);
  assert.equal(j.sumber.jenis, 'berkas');
  assert.ok(Array.isArray(j.aturan) && j.aturan.length >= 20);
  assert.match(j.kernel[0], /tanpa Blender/);
});

test('`--json` pada banyak berkas menghasilkan LARIK', { skip: lewatiTanpa('batu', 'takora') }, () => {
  const j = JSON.parse(rupa('periksa', BERSIH, CACAT, '--json').keluar);
  assert.ok(Array.isArray(j));
  assert.equal(j.length, 2);
});

test('aturan yang GAGAL diurutkan ke ATAS', { skip: lewatiTanpa('takora') }, () => {
  const baris = rupa('periksa', CACAT).keluar.split('\n')
    .filter((b) => /^\s*(ok|GAGAL|warn)\s/.test(b));
  assert.ok(baris.length > 5);
  const gagalTerakhir = baris.findLastIndex((b) => b.trim().startsWith('GAGAL'));
  const okPertama = baris.findIndex((b) => b.trim().startsWith('ok'));
  assert.ok(gagalTerakhir < okPertama,
    'laporan yang mengurut menurut posisi di spek memaksa pembacanya memindai');
});

test('`--tempel` menulis SALINAN, dan tidak menyentuh berkas asalnya', { skip: lewatiTanpa('batu') }, async () => {
  const { statSync, copyFileSync } = await import('node:fs');
  mkdirSync(RUANG, { recursive: true });
  const asal = path.join(RUANG, 'tempel.glb');
  copyFileSync(BERSIH, asal);
  const sebelum = statSync(asal).size;

  const r = rupa('periksa', asal, '--tempel');
  assert.equal(r.kode, 0);
  const salinan = path.join(RUANG, 'tempel.bersertifikat.glb');
  assert.ok(existsSync(salinan), 'salinan bersertifikat harus ditulis');
  assert.equal(statSync(asal).size, sebelum, 'berkas ASAL tidak boleh berubah');

  const { bacaSertifikat } = await import('./glb.mjs');
  const bukti = bacaSertifikat(salinan);
  assert.equal(bukti.spek, 'aset-generatif@1.0');
  assert.equal(bukti.sumber.jenis, 'berkas');
});

test('berkas DRACO diperiksa tanpa diminta apa-apa, dan ditandai terkuantisasi', async () => {
  const f = await berkasDraco();
  const r = rupa('periksa', f);
  assert.equal(r.kode, 0);
  // Pemakai baris perintah tidak seharusnya perlu tahu berkas mana yang
  // terkompres; yang mereka perlu tahu adalah bahwa angkanya terkuantisasi.
  assert.match(r.keluar, /Draco/);
  assert.match(r.keluar, /TERKUANTISASI/);
});

test('`topologi` dan `tekstur` berjalan, dan keluar 0 — keduanya PELAPOR, bukan gerbang', { skip: lewatiTanpa('batu', 'takora') }, () => {
  const t = rupa('topologi', BERSIH);
  assert.equal(t.kode, 0);
  assert.match(t.keluar, /segitiga/i);

  const x = rupa('tekstur', BERSIH);
  assert.equal(x.kode, 0);

  // Perbedaannya disengaja: `periksa` menilai terhadap JANJI dan karena itu
  // bisa gagal; kedua ini cuma melaporkan apa adanya, dan tidak ada janji
  // yang bisa dilanggar.
  assert.equal(rupa('topologi', CACAT).kode, 0);
});

test('`versi` menyebut versinya dan keadaan Draco', () => {
  const r = rupa('versi');
  assert.equal(r.kode, 0);
  assert.match(r.keluar, /^rupa \d+\.\d+\.\d+/m);
  assert.match(r.keluar, /draco/);
});

test.after(() => rmSync(RUANG, { recursive: true, force: true }));
