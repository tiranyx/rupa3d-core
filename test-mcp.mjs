/* Uji lewat PINTU MCP, bukan lewat pustakanya.
 *
 * ── Kenapa berkas ini harus ada ──────────────────────────────────────────
 *
 * Sampai 10 September 2026, dua belas suite di repo ini menguji setiap modul
 * secara langsung — dan tidak satu pun menyentuh `server.mjs`. Akibatnya dua
 * kemampuan yang LENGKAP dan BENAR ternyata TIDAK BISA DICAPAI, dan uji
 * tetap hijau selama itu:
 *
 *   1. `rupa_periksa` membaca spek dengan `JSON.parse` polos, jadi bidang
 *      `warisi` tidak pernah diselesaikan. Tiga dari tujuh spek — termasuk
 *      `kora-3d-penuh`, yang 35 aturan dan disebut "spek terlengkap yang
 *      bisa ditulis alat ini" — ditolak dengan "spek tanpa `aturan`", pesan
 *      yang menyalahkan berkas speknya untuk cacat yang ada di pembacanya.
 *
 *   2. `rupa_adegan_node` tidak punya bidang `fisika` sama sekali, jadi
 *      seluruh sisi fisika Rupa3D tidak bisa dicapai lewat MCP — sementara
 *      deskripsi `rupa_proksi` MENYURUH memakainya.
 *
 * Keduanya cuma terlihat dari sisi ini. Pustaka yang benar di balik pintu
 * yang tidak tersambung adalah pustaka yang tidak ada, bagi yang memakainya
 * lewat pintu itu.
 *
 * Uji di sini sengaja SEDIKIT dan MAHAL: ia menyalakan server sungguhan,
 * berbicara JSON-RPC di atas stdio, dan menjalankan Blender. Yang diperiksa
 * bukan logika — itu urusan suite lain — melainkan apakah PINTUNYA TEMBUS.
 */
import test from 'node:test';
import { asetUji, lewatiTanpa, glbSegitiga } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(fileURLToPath(import.meta.url));

/** Satu server untuk seluruh berkas — menyalakannya per uji makan menit. */
let SRV = null;

function server() {
  if (SRV) return SRV;
  SRV = nyalakan({ cwd: REPO, env: { ...process.env, RUPA3D_RUANG: path.join(REPO, '.uji-mcp') } });
  return SRV;
}

/** Server baru dengan direktori kerja dan lingkungan sendiri. */
function nyalakan({ cwd, env }) {
  const anak = spawn(process.execPath, [path.join(REPO, 'server.mjs')], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  const tunggu = new Map();
  let buf = '';
  anak.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const baris = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!baris) continue;
      // stdout mengangkut protokol saja; baris bukan-JSON diabaikan diam-diam
      // karena mengurainya sebagai galat akan membuat uji ini rapuh terhadap
      // keluaran pustaka pihak ketiga.
      try {
        const p = JSON.parse(baris);
        if (p.id != null && tunggu.has(p.id)) { tunggu.get(p.id)(p); tunggu.delete(p.id); }
      } catch { /* bukan JSON-RPC */ }
    }
  });
  anak.stderr.resume();

  let n = 0;
  const kirim = (method, params) => new Promise((res) => {
    const id = ++n;
    tunggu.set(id, res);
    anak.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const siap = (async () => {
    await kirim('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'test-mcp', version: '1' },
    });
    anak.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  })();

  return {
    anak,
    async panggil(nama, args) {
      await siap;
      const r = await kirim('tools/call', { name: nama, arguments: args });
      const teks = r.result?.content?.[0]?.text ?? JSON.stringify(r.error ?? r);
      try { return JSON.parse(teks); } catch { return { _mentah: teks }; }
    },
    async daftar() {
      await siap;
      return (await kirim('tools/list', {})).result.tools;
    },
  };
}

test.after(() => { SRV?.anak.kill(); });

test('server menyala dan mendaftarkan toolnya lewat stdio', async () => {
  const alat = (await server().daftar()).map((t) => t.name);
  assert.ok(alat.length >= 36, `cuma ${alat.length} tool terdaftar`);
  for (const wajib of ['rupa_periksa', 'rupa_adegan_node', 'rupa_proksi',
    'rupa_topologi', 'rupa_topologi_sumber', 'rupa_rantai']) {
    assert.ok(alat.includes(wajib), `tool "${wajib}" tidak terdaftar`);
  }
});

test('spek BERWARISI bisa dipakai lewat rupa_periksa', async () => {
  const s = server();
  await s.panggil('rupa_baru', { ruang: 'p' });
  await s.panggil('rupa_skrip', {
    ruang: 'p', kode: ['import bpy', 'bpy.ops.mesh.primitive_cube_add()'].join('\n'),
  });

  // Spek datar sebagai kontrol: kalau yang ini pun gagal, yang rusak bukan
  // penyelesaian warisannya.
  const datar = await s.panggil('rupa_periksa', { ruang: 'p', spek: 'spek/kora-3d.json' });
  assert.equal(datar.error, undefined, `spek datar gagal: ${JSON.stringify(datar)}`);
  assert.equal(datar.sertifikat.diperiksa, 9);

  // Dan yang benar-benar diuji berkas ini: tiga tingkat warisan, nol aturan
  // sendiri. Sebelum ditambal, ini ditolak "spek tanpa `aturan`".
  const penuh = await s.panggil('rupa_periksa', { ruang: 'p', spek: 'spek/kora-3d-penuh.json' });
  assert.equal(penuh.error, undefined, `spek berwarisi ditolak: ${JSON.stringify(penuh)}`);
  assert.equal(penuh.sertifikat.diperiksa, 35);
  assert.match(penuh.sertifikat.spek, /^kora-3d-penuh@/);
});

test('spek yang tidak ada ditolak dengan menyebut BERKASNYA', async () => {
  const r = await server().panggil('rupa_periksa', { ruang: 'p', spek: 'spek/tidak-ada.json' });
  assert.equal(r.ok, false);
  assert.match(r.error, /tidak bisa dimuat/);
  assert.equal(r.berkas, 'spek/tidak-ada.json');
});

test('FISIKA bisa dipasang ke node lewat MCP — statis dan dinamis', async () => {
  const s = server();
  await s.panggil('rupa_adegan_baru', { ruang: 'f', nama: 'uji fisika' });

  const lantai = await s.panggil('rupa_adegan_node', {
    ruang: 'f', jenis: 'bidang', ukuran: [20, 1, 20], peran: 'latar',
    fisika_jenis: 'statis', fisika_bentuk: 'kotak',
  });
  assert.deepEqual(lantai.node.fisika, { jenis: 'statis', bentuk: 'kotak' });

  const bola = await s.panggil('rupa_adegan_node', {
    ruang: 'f', jenis: 'bola', posisi: [0, 5, 0],
    fisika_jenis: 'dinamis', fisika_bentuk: 'bola',
    fisika_kerapatan: 1000, fisika_pantul: 0.6,
  });
  assert.equal(bola.node.fisika.jenis, 'dinamis');
  assert.equal(bola.node.fisika.kerapatan, 1000);
  assert.equal(bola.node.fisika.pantul, 0.6);
});

test('alur rupa_proksi → node cembung, yang deskripsinya sendiri janjikan', { skip: lewatiTanpa('batu') }, async () => {
  const s = server();
  const pr = await s.panggil('rupa_proksi', {
    berkas: '.rupa3d/tekstur/batu-batu.glb', arah: 64,
  });
  assert.ok(Array.isArray(pr.titik) && pr.titik.length >= 12);

  const hull = await s.panggil('rupa_adegan_node', {
    ruang: 'f', jenis: 'bola', posisi: [3, 2, 0],
    fisika_jenis: 'dinamis', fisika_bentuk: 'cembung', fisika_titik: pr.titik,
  });
  assert.equal(hull.error, undefined, `node cembung ditolak: ${JSON.stringify(hull)}`);
  assert.equal(hull.node.fisika.bentuk, 'cembung');
  assert.equal(hull.node.fisika.titik.length, pr.titik.length);
});

test('penjaga fisika tetap MERAH lewat MCP, bukan cuma di pustakanya', async () => {
  const s = server();
  // Pintu yang meneruskan masukan tanpa validasi sama berbahayanya dengan
  // pintu yang tidak tersambung — jadi keduanya diuji.
  const tanpaTitik = await s.panggil('rupa_adegan_node', {
    ruang: 'f', jenis: 'bola', fisika_jenis: 'dinamis', fisika_bentuk: 'cembung',
  });
  assert.equal(tanpaTitik.ok, false, 'cembung tanpa titik harus DITOLAK');

  const dua = await s.panggil('rupa_adegan_node', {
    ruang: 'f', jenis: 'bola',
    fisika_jenis: 'dinamis', fisika_massa: 5, fisika_kerapatan: 1000,
  });
  assert.equal(dua.ok, false, 'massa DAN kerapatan bersamaan harus DITOLAK');
});

test('fisika bisa DIBUANG dari node yang sudah punya', async () => {
  const s = server();
  const buat = await s.panggil('rupa_adegan_node', {
    ruang: 'f', jenis: 'kotak', fisika_jenis: 'statis', fisika_bentuk: 'kotak',
  });
  assert.ok(buat.node.fisika);
  const buang = await s.panggil('rupa_adegan_node', {
    ruang: 'f', aksi: 'ubah', id: buat.node.id, fisika_hapus: true,
  });
  assert.equal(buang.node.fisika, undefined);
});

test('rupa_topologi_sumber tembus, dan menyembunyikan rincian sampai diminta', async () => {
  const s = server();
  await s.panggil('rupa_baru', { ruang: 's' });
  await s.panggil('rupa_skrip', {
    ruang: 's',
    kode: ['import bpy',
      'bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=12)'].join('\n'),
  });
  const ringkas = await s.panggil('rupa_topologi_sumber', { ruang: 's' });
  assert.equal(ringkas.quad_persen, 100);
  assert.equal(ringkas.kutub, 0);
  assert.equal(ringkas.gelang, 60);
  assert.equal(ringkas.per_objek, undefined, 'rincian tidak dikirim kecuali diminta');

  const rinci = await s.panggil('rupa_topologi_sumber', { ruang: 's', per_objek: true });
  assert.equal(rinci.per_objek.length, 1);
  assert.equal(rinci.per_objek[0].verteks, 576);
});

test('berkas yang tidak ada ditolak SEBELUM Blender dinyalakan', async () => {
  const mulai = Date.now();
  const r = await server().panggil('rupa_muat', {
    ruang: 's', berkas: 'tidak/ada/sama-sekali.glb',
  });
  assert.equal(r.ok, false);
  // Menyalakan Blender saja 449 ms, memuat adegannya beberapa detik. Kalau
  // penolakannya butuh selama itu, ia terjadi di tempat yang salah.
  assert.ok(Date.now() - mulai < 1500,
    `penolakan makan ${Date.now() - mulai} ms — Blender kemungkinan ikut dinyalakan`);
});

test('rupa_periksa mode BERKAS: sertifikat tanpa menyalakan Blender', { skip: lewatiTanpa('batu') }, async () => {
  const s = server();
  const mulai = Date.now();
  const r = await s.panggil('rupa_periksa', {
    berkas: '.rupa3d/tekstur/batu-batu.glb',
    spek: 'spek/aset-generatif.json',
    aset: 'batu',
  });
  assert.equal(r.error, undefined, `ditolak: ${JSON.stringify(r).slice(0, 300)}`);
  assert.equal(r.sertifikat.sumber.jenis, 'berkas');
  assert.equal(r.sertifikat.sumber.sumbu_atas, 'Y');
  assert.equal(r.sertifikat.diperiksa, 25);
  assert.match(r.sertifikat.kernel[0], /tanpa Blender/);
  // Jalur adegan menuntut rupa_baru + rupa_muat + ukur, sekitar sepuluh detik.
  // Kalau mode berkas mendekati angka itu, ia diam-diam menyalakan Blender.
  assert.ok(Date.now() - mulai < 5000,
    `mode berkas makan ${Date.now() - mulai} ms — Blender kemungkinan ikut jalan`);
});

test('mode berkas MENEMPEL sertifikat, dan tidak pernah menulisi berkas asalnya', { skip: lewatiTanpa('batu') }, async () => {
  const { statSync } = await import('node:fs');
  const asal = path.join(REPO, '.rupa3d/tekstur/batu-batu.glb');
  const sebelum = statSync(asal).size;

  const r = await server().panggil('rupa_periksa', {
    berkas: '.rupa3d/tekstur/batu-batu.glb', spek: 'spek/aset-generatif.json',
  });
  assert.ok(r.tempel, 'mode berkas harus menempel tanpa diminta — yang ditempeli sudah jelas');
  assert.match(r.tempel.berkas, /\.bersertifikat\.glb$/);
  assert.ok(r.tempel.tumbuh > 0);
  assert.equal(statSync(asal).size, sebelum, 'berkas asal TIDAK BOLEH berubah');

  const { bacaSertifikat } = await import('./glb.mjs');
  const bukti = bacaSertifikat(r.tempel.berkas);
  assert.equal(bukti.spek, r.sertifikat.spek);
  assert.equal(bukti.sumber.jenis, 'berkas');
});

test('berkas yang tidak ada ditolak dengan menyebut jalurnya', async () => {
  const r = await server().panggil('rupa_periksa', {
    berkas: 'tidak/ada.glb', spek: 'spek/aset-generatif.json',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /berkas tidak ada/);
});

test('spek aset-generatif MERAH pada aset yang memang cacat', { skip: lewatiTanpa('takora') }, async () => {
  // Pemeriksa yang cuma pernah hijau bukan pemeriksa. Takora mentah punya
  // putaran segitiga terbalik dan verteks lepas; keduanya wajib.
  const r = await server().panggil('rupa_periksa', {
    berkas: '.rupa3d/rakit/masukan/takora.glb', spek: 'spek/aset-generatif.json',
  });
  assert.equal(r.ok, false, 'harus GAGAL');
  const gagal = r.sertifikat.aturan.filter((a) => !a.lulus && a.berat === 'wajib')
    .map((a) => a.kode);
  assert.ok(gagal.includes('simpul_lepas'), `yang gagal: ${gagal.join(', ')}`);
  assert.ok(gagal.includes('topo_putaran_salah'));
});

/* ── Pintu PAKET: server dinyalakan seperti klien MCP menyalakannya ───────
 *
 * Klien MCP — dan `npx rupa3d` — menjalankan server dari direktori kerja
 * yang BUKAN repo ini. Sampai 14 Sep dua hal hanya benar di checkout repo:
 * spek relatif dicari di direktori kerja, dan ruang kerja diturunkan dari
 * letak berkas server (yang di bawah npx berarti DI DALAM cache npm). Semua
 * uji di atas menyalakan server dengan cwd = repo, jadi keduanya tidak
 * pernah bisa terlihat dari sini. */

test('spek bawaan RELATIF ditemukan dari direktori kerja asing', async () => {
  const asing = mkdtempSync(path.join(tmpdir(), 'rupa-asing-'));
  const glb = path.join(asing, 'segitiga.glb');
  writeFileSync(glb, glbSegitiga());
  const s = nyalakan({ cwd: asing, env: { ...process.env, RUPA3D_RUANG: path.join(asing, 'ruang') } });
  try {
    const r = await s.panggil('rupa_periksa', { berkas: glb, spek: 'spek/aset-generatif.json' });
    assert.doesNotMatch(String(r.error ?? ''), /spek tidak bisa dimuat/);
    assert.equal(r.sertifikat?.diperiksa, 25, JSON.stringify(r).slice(0, 300));
  } finally {
    s.anak.kill();
  }
});

test('ruang kerja bawaan adalah ~/.rupa3d, bukan diturunkan dari letak berkas server', async () => {
  const rumah = mkdtempSync(path.join(tmpdir(), 'rupa-rumah-'));
  const env = { ...process.env, HOME: rumah, USERPROFILE: rumah };
  delete env.RUPA3D_RUANG;
  const s = nyalakan({ cwd: rumah, env });
  try {
    const st = await s.panggil('rupa_status', { ruang: 'akar' });
    assert.equal(path.resolve(st.ruang), path.join(rumah, '.rupa3d', 'akar'));
  } finally {
    s.anak.kill();
  }
});
