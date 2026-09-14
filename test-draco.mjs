/* Uji DRACO — pintu masuk yang selama ini tertutup diam-diam.
 *
 * ── Yang dibuktikan di sini, dan yang TIDAK ──────────────────────────────
 *
 * Yang TIDAK dibuktikan: kebenaran dekoder Draco-nya. Itu implementasi resmi
 * Google, dipakai three.js dan Blender, dan menguji ulang kebenarannya di
 * sini akan menghabiskan waktu untuk menegaskan sesuatu yang sudah dipakai
 * jutaan berkas.
 *
 * Yang DIBUKTIKAN: bahwa aset yang SAMA, diekspor dua kali dari adegan yang
 * SAMA — sekali polos, sekali ber-Draco — memberi angka yang sama lewat
 * seluruh pembaca di repo ini. Itu acuan silang, dan ia tetap benar walau
 * bendanya diganti.
 *
 * Dan satu lagi yang sama pentingnya: bahwa TANPA dekodernya, berkas Draco
 * DITOLAK dengan menyebut namanya — bukan dibaca sebagai kosong. Perilaku
 * itu yang paling mahal sebelum ditambal, dan ia hanya bisa diuji sebelum
 * dekodernya disiapkan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Blender } from './blender.mjs';
import { periksaDraco, siapkanDraco, EKSTENSI } from './draco.mjs';
import { bacaGLB, meshGLB, titikGLB, kotakBatasGLB } from './glb.mjs';
import { topologiGLB } from './topologi.mjs';
import { ukurGLB } from './ukur-glb.mjs';
import { readFileSync } from 'node:fs';

const RUANG = path.join(fileURLToPath(new URL('.', import.meta.url)), '.uji-draco');
const POLOS = path.join(RUANG, 'polos.glb');
const DRACO = path.join(RUANG, 'draco.glb');

/* Kedua berkasnya dibuat dari SATU adegan, dalam SATU rantai. Mengekspornya
   dari dua adegan yang dibangun terpisah akan membuat setiap perbedaan bisa
   berasal dari adegannya, dan ujinya berhenti membuktikan apa pun. */
async function siapkanBerkas() {
  if (existsSync(POLOS) && existsSync(DRACO)) return true;
  mkdirSync(RUANG, { recursive: true });
  const b = new Blender({ ruang: RUANG });
  const r = await b.jalankanBanyak([
    { op: 'baru' },
    {
      op: 'skrip',
      kode: ['import bpy',
        'bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24)',
        'bpy.context.object.name = "bola"'].join('\n'),
    },
    { op: 'ekspor', berkas: POLOS },
    { op: 'ekspor', berkas: DRACO, draco: true },
  ]);
  assert.equal(r.ok, true, `ekspor gagal: ${JSON.stringify(r).slice(0, 300)}`);
  return true;
}

test('deteksi: `periksaDraco` menyebut ekstensinya WAJIB, dan berapa primitif', async () => {
  await siapkanBerkas();

  const polos = periksaDraco(bacaGLB(readFileSync(POLOS)).json);
  assert.equal(polos.dipakai, false);
  assert.equal(polos.wajib, false);
  assert.equal(polos.catatan, null, 'berkas polos tidak boleh membawa catatan Draco');

  const draco = periksaDraco(bacaGLB(readFileSync(DRACO)).json);
  assert.equal(draco.dipakai, true);
  assert.equal(draco.wajib, true, 'glTF menaruhnya di extensionsRequired');
  assert.equal(draco.primitif, 1);
  assert.equal(draco.primitif_total, 1);
  assert.match(draco.catatan, /WAJIB/);
});

test('TANPA dekoder, berkas Draco DITOLAK dengan menyebut namanya', async (t) => {
  await siapkanBerkas();
  /* Uji ini hanya berarti kalau dekodernya BELUM disiapkan, dan `siapkanDraco`
     menyimpan modulnya di lingkup modul — jadi ia harus berjalan sebelum uji
     mana pun yang menyiapkannya. Kalau urutannya berubah, ini dilewati
     dengan menyebut sebabnya, bukan lulus palsu. */
  const { dracoSiap } = await import('./draco.mjs');
  if (dracoSiap()) {
    t.skip('dekoder sudah disiapkan uji lain — urutannya berubah');
    return;
  }
  for (const [nama, fn] of [
    ['titikGLB', () => titikGLB(DRACO)],
    ['meshGLB', () => meshGLB(DRACO)],
    ['ukurGLB', () => ukurGLB(DRACO)],
    ['topologiGLB', () => topologiGLB(DRACO)],
  ]) {
    assert.throws(fn, (e) => {
      // Pesannya harus menyebut DUA hal: apa yang ditemukan, dan apa yang
      // harus dipanggil. Yang cuma menyebut satu memaksa pembacanya menebak.
      assert.match(e.message, new RegExp(EKSTENSI), `${nama}: tidak menyebut ekstensinya`);
      assert.match(e.message, /siapkanDraco/, `${nama}: tidak menyebut jalan keluarnya`);
      return true;
    }, `${nama} harus MENOLAK, bukan mengembalikan kosong`);
  }
});

test('kotakBatasGLB tetap benar tanpa dekoder — dan itu yang paling berbahaya', async () => {
  await siapkanBerkas();
  /* Accessor min/max tetap ditulis di GLB Draco, jadi pembaca ini menjawab
     BENAR sementara semua yang lain gagal. Diuji supaya perilakunya tercatat,
     bukan supaya dianggap aman: pemanggil yang cuma memakai ini akan
     menyimpulkan berkasnya terbaca padahal geometrinya belum tersentuh. */
  const a = kotakBatasGLB(POLOS);
  const b = kotakBatasGLB(DRACO);
  assert.ok(a && b);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(a.ukuran[i] - b.ukuran[i]) < 1e-4,
      `sumbu ${i}: ${a.ukuran[i]} vs ${b.ukuran[i]}`);
  }
});

test('SESUDAH disiapkan, kedua berkas memberi jumlah yang sama persis', async () => {
  await siapkanBerkas();
  await siapkanDraco();

  const a = meshGLB(POLOS);
  const b = meshGLB(DRACO);
  assert.equal(a.primitif.length, 1);
  assert.equal(b.primitif.length, 1, 'sebelum ditambal, ini 0 tanpa satu pun suara');
  assert.equal(b.primitif[0].draco, true);
  assert.equal(a.primitif[0].draco, false);

  assert.equal(b.primitif[0].posisi.length, a.primitif[0].posisi.length);
  assert.equal(b.primitif[0].indeks.length, a.primitif[0].indeks.length);
  assert.equal(titikGLB(DRACO).length, titikGLB(POLOS).length);
});

test('TOPOLOGINYA identik — Draco memampatkan geometri, bukan konektivitas', async () => {
  await siapkanBerkas();
  await siapkanDraco();
  const a = topologiGLB(POLOS);
  const b = topologiGLB(DRACO);
  for (const k of ['segitiga', 'verteks_terlas', 'tepi_tak_manifold', 'tepi_batas',
    'tepi_putaran_salah', 'segitiga_degenerasi', 'segitiga_lipat']) {
    assert.equal(b[k], a[k], `${k}: polos ${a[k]} vs draco ${b[k]}`);
  }
});

test('GEOMETRINYA bergeser, dan pergeserannya kecil tapi BUKAN nol', async () => {
  await siapkanBerkas();
  await siapkanDraco();
  const a = topologiGLB(POLOS);
  const b = topologiGLB(DRACO);
  /* Draco lossy: ia mengkuantisasi posisi. Kalau uji ini menuntut kesamaan
     persis ia akan merah pada berkas yang benar; kalau ia tidak menuntut apa
     pun ia tidak membuktikan bahwa dekodernya benar-benar dipakai. Yang
     ditahan: dekat, dan TIDAK identik. */
  const beda = Math.abs(a.sudut_min_terkecil - b.sudut_min_terkecil);
  assert.ok(beda > 0, 'kalau sudut minimumnya identik, kuantisasinya tidak terjadi — curigai ujinya');
  assert.ok(beda < 0.5, `sudut minimum meleset ${beda}°, jauh lebih besar daripada kuantisasi wajar`);

  const ua = ukurGLB(POLOS);
  const ub = ukurGLB(DRACO);
  const diag = Math.hypot(ua.lebar, ua.tinggi, ua.dalam);
  for (const k of ['lebar', 'tinggi', 'dalam']) {
    const rel = Math.abs(ua[k] - ub[k]) / diag;
    assert.ok(rel < 1e-4, `${k} meleset ${(rel * 100).toFixed(5)} % diagonal`);
  }
});

test('status Draco DILAPORKAN di hasil ukur, bukan disimpan sendiri', async () => {
  await siapkanBerkas();
  await siapkanDraco();
  const polos = ukurGLB(POLOS);
  assert.equal(polos.draco, false);
  assert.equal(polos.draco_catatan, null);

  const draco = ukurGLB(DRACO);
  assert.equal(draco.draco, true);
  assert.equal(draco.draco_primitif, 1);
  // Sertifikat atas berkas Draco menggambarkan versi TERKUANTISASI asetnya,
  // dan pembacanya berhak tahu itu tanpa harus bertanya.
  assert.match(draco.draco_catatan, /KUANTISASI/);
});

test('kosakata spek `geo_draco` bisa dipakai menulis aturan', async () => {
  const { dariKompresi } = await import('./turunan.mjs');
  await siapkanBerkas();
  await siapkanDraco();
  assert.deepEqual(dariKompresi(ukurGLB(DRACO)), { geo_draco: true, geo_draco_primitif: 1 });
  assert.deepEqual(dariKompresi(ukurGLB(POLOS)), { geo_draco: false, geo_draco_primitif: 0 });
  assert.deepEqual(dariKompresi(null), {});
});

test('mampatnya nyata — dan angkanya ikut dicatat', async () => {
  await siapkanBerkas();
  const { statSync } = await import('node:fs');
  const polos = statSync(POLOS).size;
  const draco = statSync(DRACO).size;
  assert.ok(draco < polos / 3,
    `Draco ${(draco / 1024).toFixed(1)} KB vs polos ${(polos / 1024).toFixed(1)} KB — `
    + 'kalau nisbahnya tipis, kemungkinan ekspornya tidak benar-benar memampatkan');
});
