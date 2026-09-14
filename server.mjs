#!/usr/bin/env node
/* Rupa3D — MCP server 2D→3D di atas Blender headless.
 *
 * ── Kenapa bentuknya begini ──────────────────────────────────────────────
 *
 * Yang membuat pemodelan "presisi dan handal" BUKAN model AI yang menebak mesh
 * dari sebuah gambar. Mesh tebakan tidak bisa diukur, tidak bisa
 * diparameterkan, dan kalau salah tidak ada yang bisa diperbaiki — cuma bisa
 * ditebak ulang.
 *
 * Yang terbukti bekerja adalah LINGKAR TERTUTUP:
 *
 *     bangun (kode) → render → UKUR → banding ke acuan → iterasi
 *
 * Server ini adalah lingkar itu. `rupa_skrip` yang membangun (bpy penuh, jadi
 * parametrik dan bisa diulang), `rupa_ukur` yang membuatnya presisi (segitiga,
 * kotak batas, tak-manifold, skala belum diterapkan), `rupa_lihat` yang
 * membuatnya bisa dinilai, `rupa_ekspor` yang mengeluarkan GLB dengan jebakan
 * three.js sudah ditutup lebih dulu.
 *
 * Adegan hidup di satu `adegan.blend` per ruang kerja, jadi operasi bisa
 * disusun. Tanpa itu tiap panggilan mulai dari nol dan tidak ada iterasi.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'node:path';
import { existsSync, mkdirSync, statSync, readFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Blender } from './blender.mjs';
import { turunkanUkuran, terbitkanSertifikat, ringkas, periksaSpek, muatSpek } from './spek.mjs';
import { tempelSertifikat } from './glb.mjs';
import * as cad from './cad-ruang.mjs';
import * as adg from './adegan.mjs';
import { mulaiAdegan, muatAdegan, ubahAdegan, jalurAdegan } from './adegan-ruang.mjs';
import { terbitkan } from './terbit.mjs';
import { topologiGLB, ringkasTopologi } from './topologi.mjs';
import { teksturGLB, ringkasTekstur } from './tekstur.mjs';
import { ukurGLB } from './ukur-glb.mjs';
import { siapkanDraco } from './draco.mjs';
import { dariTopologi, dariTekstur, dariKompresi } from './turunan.mjs';
import { proksiCembung } from './tabrak.mjs';

/* Ruang kerja: `RUPA3D_RUANG`, atau `~/.rupa3d`.
 *
 * Versi lama menurunkannya dari letak berkas ini (`../../.rupa3d`), yang SAMA
 * dengan `~/.rupa3d` hanya karena repo pemiliknya kebetulan ada di
 * `~/Downloads/Rupa3D`. Dipasang lewat `npx`, jalur yang sama menunjuk ke
 * DALAM cache npm (`_npx/<hash>/.rupa3d`): model pengguna ditulis ke direktori
 * yang boleh dibersihkan npm kapan saja. Di mesin pemilik hasilnya identik —
 * diperiksa 14 Sep — jadi tidak ada ruang kerja yang berpindah. */
const AKAR = path.resolve(process.env.RUPA3D_RUANG || path.join(homedir(), '.rupa3d'));
mkdirSync(AKAR, { recursive: true });

const instructions = `Rupa3D membuat model 3D dengan LINGKAR TERUKUR, bukan sekali tebak.

Urutan yang bekerja:
  1. rupa_baru            — mulai adegan kosong (sekali per model)
  2. rupa_skrip / rupa_muat — bangun bentuknya, atau impor GLB/OBJ/SVG
  3. rupa_ukur            — angka: segitiga, kotak batas, tak-manifold, skala
  4. rupa_lihat           — render beberapa sudut, LALU BACA gambarnya
  5. ulangi 2-4 sampai cocok dengan acuan
  6. rupa_ekspor          — GLB, dengan skala sudah diterapkan

Aturan yang membuat hasilnya bisa dipercaya:
- JANGAN mengaku selesai tanpa rupa_lihat. Angka tidak bisa melihat komposisi.
- JANGAN mengaku ukurannya benar tanpa rupa_ukur. Mata tidak bisa membaca skala.
- Bangun dari ANGKA (rumus, satuan) bukan dari nilai yang enak dilihat; itu yang
  membuat model bisa diubah lagi nanti tanpa dibangun ulang.
- Untuk 2D→3D dari gambar acuan: ukur dulu proporsi di gambarnya, tuliskan
  sebagai konstanta bernama di rupa_skrip, baru bangun. Bandingkan render dengan
  acuannya, perbaiki konstantanya, jangan menambal verteks.
- SVG → 3D adalah jalur paling presisi yang ada: rupa_muat dengan ekstrusi
  memakai kurva aslinya, bukan tebakan.

rupa_skrip menjalankan Python bpy penuh di dalam Blender headless. Ia bisa
merusak adegan; ia tidak menyentuh apa pun di luar ruang kerjanya.

TANPA Blender — GLB dari mana pun, CAD, dan adegan web:
  - rupa_periksa { berkas, spek: "spek/aset-generatif.json" } — sertifikat 25
    aturan yang diukur dari BERKASNYA, ditempel ke salinan; asalnya tidak ditulisi
  - rupa_topologi · rupa_tekstur · rupa_proksi — ukuran GLB, tanpa Blender
  - rupa_cad_* — b-rep OCCT: bentuk, boolean, fillet, ukur eksak, ekspor .step/.glb
  - rupa_adegan_* — adegan three.js + fisika, terbit sebagai satu halaman HTML
rupa_status memberi tahu apakah Blender ditemukan (RUPA3D_BLENDER untuk jalurnya).`;

/* Spek bawaan ikut paket. Jalur relatif dicari di direktori kerja DULU — spek
   milik pengguna menang — lalu di folder paket. Tanpa jalan kedua itu,
   `spek/aset-generatif.json` yang disebut deskripsi tool ini sendiri tidak
   ditemukan oleh siapa pun yang memasang lewat npx: klien MCP menjalankan
   server dari direktori kerja yang bukan repo ini. */
const DIR_PAKET = path.dirname(fileURLToPath(import.meta.url));
function jalurSpek(p) {
  const dariKerja = path.resolve(p);
  if (path.isAbsolute(p) || existsSync(dariKerja)) return dariKerja;
  const dariPaket = path.join(DIR_PAKET, p);
  return existsSync(dariPaket) ? dariPaket : dariKerja;
}

/* Versi DIBACA dari package.json, tidak ditulis ulang di sini.
 *
 * Dua tempat yang menyimpan angka yang sama akan berbeda, dan yang berbeda
 * diam-diam adalah yang paling mahal — persis pola yang sudah menggigit repo
 * ini tiga kali (bidang `bobot`/`berat`, konvensi `null`, dan daftar
 * `BENTUK_TABRAK` yang bernama sama dengan isi berbeda). Klien MCP memakai
 * angka ini untuk memutuskan kecocokan; angka yang basi di sini berarti klien
 * mengambil keputusan atas versi yang tidak berjalan. */
const PAKET = JSON.parse(readFileSync(
  fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'));
const server = new McpServer({ name: 'rupa3d', version: PAKET.version }, { instructions });

const namaRuang = z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/)
  .default('utama').describe('Nama ruang kerja; tiap ruang punya adegan.blend sendiri.');

function ruangKe(nama) {
  const p = path.join(AKAR, nama);
  if (!path.resolve(p).startsWith(AKAR)) throw new Error('nama ruang tidak sah');
  return p;
}
const mesinBlender = (nama) => new Blender({ ruang: ruangKe(nama) });

function tool(name, description, schema, fn, readOnly = false) {
  server.registerTool(name, {
    description,
    inputSchema: schema,
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false },
  }, async (args) => {
    try {
      const keluaran = await fn(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(keluaran, null, 2) }],
        isError: keluaran?.ok === false,
      };
    } catch (error) {
      console.error(`[${name}] ${error.message}`);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.message }) }] };
    }
  });
}

tool('rupa_status', 'Versi Blender, akar ruang kerja, dan apakah adegannya sudah ada. Panggil sekali di awal.', {
  ruang: namaRuang,
}, async (a) => {
  const b = mesinBlender(a.ruang);
  const versi = await b.versi();
  return {
    ok: Boolean(versi),
    blender: b.exe,
    versi,
    ruang: b.ruang,
    adegan_ada: existsSync(b.adegan),
    adegan_bita: existsSync(b.adegan) ? statSync(b.adegan).size : 0,
    catatan: versi ? undefined : 'Blender tidak ditemukan — pasang, atau set RUPA3D_BLENDER ke jalur blender.exe',
  };
}, true);

tool('rupa_baru', 'Mulai adegan KOSONG. Menghapus isi adegan ruang kerja ini — panggil sekali di awal sebuah model, bukan di tiap langkah.', {
  ruang: namaRuang,
  satuan: z.enum(['METRIC', 'IMPERIAL', 'NONE']).default('METRIC'),
}, (a) => mesinBlender(a.ruang).jalankan('baru', { satuan: a.satuan }));

tool('rupa_muat', 'Impor berkas 3D (.glb .gltf .obj .fbx .stl .ply) atau VEKTOR 2D (.svg) ke adegan. Untuk SVG, `ekstrusi` > 0 langsung menebalkannya jadi 3D — ini jalur 2D→3D paling presisi yang ada, karena memakai kurva aslinya dan bukan tebakan.', {
  ruang: namaRuang,
  berkas: z.string().min(1).max(2048).describe('Jalur absolut berkas yang diimpor.'),
  ekstrusi: z.number().min(0).max(100).default(0).describe('Hanya untuk SVG: ketebalan. Path ber-FILL (spline tertutup) di-extrude jadi lempeng padat; path ber-STROKE (spline terbuka, ikon bergaya garis) di-bevel jadi tabung bulat berjari-jari ini — memperlakukan keduanya sama menghasilkan pita setipis kertas yang melayang.'),
  tebal_nisbi: z.number().min(0).max(0.5).default(0).describe('Cara yang DISARANKAN untuk menyebut ketebalan: pecahan dari diagonal kotak batas hasil impor (mis. 0.02 = 2%). Menimpa `ekstrusi`. Satuan absolut tidak bisa ditebak — SVG 64x64 masuk sebagai objek selebar 0,0169 satuan Blender, jadi angka yang terdengar kecil bisa jadi 24% dari ikonnya.'),
  sisi_tabung: z.number().int().min(0).max(8).default(3).describe('Resolusi bevel untuk path ber-stroke; 3 = 16 sisi, cukup halus dan murah.'),
}, (a) => {
  if (!existsSync(a.berkas)) return { ok: false, error: `berkas tidak ada: ${a.berkas}` };
  return mesinBlender(a.ruang).jalankan('muat', { berkas: path.resolve(a.berkas), ekstrusi: a.ekstrusi, tebal_nisbi: a.tebal_nisbi, sisi_tabung: a.sisi_tabung });
});

tool('rupa_skrip', 'PRIMITIF PEMODELAN: jalankan Python `bpy` di dalam Blender headless, lalu simpan adegannya. Tersedia: bpy, bmesh, math, mathutils, RUANG (jalur ruang kerja), dan dict `keluaran` yang ikut dikembalikan. Tulis bentuk dari ANGKA BERNAMA, bukan nilai ajaib — itu yang membuatnya bisa diubah lagi tanpa dibangun ulang.', {
  ruang: namaRuang,
  kode: z.string().min(1).max(200000),
}, (a) => mesinBlender(a.ruang).jalankan('skrip', { kode: a.kode }));

tool('rupa_ukur', 'Angka untuk tiap objek mesh: segitiga, simpul, n-gon, tepi tak-manifold, simpul lepas, luas, ukuran, letak, skala, apakah skala sudah diterapkan, bahan — plus kotak batas seluruh adegan dan daftar peringatan. Inilah yang membuat hasilnya presisi; mata tidak bisa membaca skala.', {
  ruang: namaRuang,
}, (a) => mesinBlender(a.ruang).jalankan('ukur'), true);

tool('rupa_lihat', 'Render beberapa sudut ke PNG dan kembalikan jalurnya — BACA gambarnya sesudah ini, jangan mengaku selesai dari angka saja. Kamera dan lampu dipasang otomatis dari kotak batas adegan, jadi objek sekecil atau sebesar apa pun tetap terbingkai. Sudut bernama: depan, belakang, kiri, kanan, atas, bawah, hero, serong; atau "yaw,pitch" dalam derajat.', {
  ruang: namaRuang,
  sudut: z.array(z.string().min(1).max(32)).min(1).max(8).default(['hero']),
  ukuran: z.number().int().min(128).max(2048).default(640),
  mesin: z.enum(['CYCLES', 'EEVEE']).default('CYCLES').describe('CYCLES untuk kaca/pembiasan yang benar; EEVEE jauh lebih cepat tapi menampilkan kaca sebagai susu buram.'),
  contoh: z.number().int().min(4).max(512).default(48),
  fov: z.number().min(5).max(120).default(38),
  latar_tembus: z.boolean().default(false),
}, (a) => mesinBlender(a.ruang).jalankan('lihat', a), true);

tool('rupa_ekspor', 'Ekspor adegan ke GLB. Skala diterapkan ke verteks lebih dulu (manual three.js menyebut skala pada node sebagai sumber masalah runtime), dan hasilnya dilaporkan bersama jumlah segitiga, kotak batas, dan peringatan.', {
  ruang: namaRuang,
  berkas: z.string().min(1).max(2048).describe('Jalur absolut tujuan .glb'),
  draco: z.boolean().default(false).describe('Kompresi Draco: berkas jauh lebih kecil, tapi pemuatnya butuh decoder Draco.'),
  draco_level: z.number().int().min(0).max(10).default(6),
  terapkan_transformasi: z.boolean().default(true),
}, (a) => mesinBlender(a.ruang).jalankan('ekspor', {
  berkas: path.resolve(a.berkas), draco: a.draco, draco_level: a.draco_level,
  terapkan_transformasi: a.terapkan_transformasi,
}));

/* ── Tahap A: aset siap-game ──────────────────────────────────────────── */

tool('rupa_lod', 'Rantai LOD dengan GALAT GEOMETRIS tiap tingkat — jarak sesungguhnya tiap simpul hasil ke permukaan asli, mutlak dan sebagai persen diagonal. Mengecilkan mesh selalu "berhasil"; yang menentukan layak atau tidak adalah berapa banyak yang hilang. Di atas 2% diagonal, siluetnya mulai terbaca berubah.', {
  ruang: namaRuang,
  objek: z.string().min(1).max(200).optional().describe('Nama mesh; kosong = semua mesh di adegan.'),
  nisbah: z.array(z.number().min(0.001).max(1)).min(1).max(6).default([0.5, 0.25, 0.1])
    .describe('Pecahan segitiga yang DIPERTAHANKAN per tingkat, sama seperti Decimate modifier.'),
}, (a) => mesinBlender(a.ruang).jalankan('lod', { objek: a.objek, nisbah: a.nisbah }));

tool('rupa_tabrakan', 'Proksi tabrakan + dua arah kesalahannya. "tembus" = permukaan asli yang berada DI LUAR proksi (benda menembus dinding); "longgar" = proksi yang jauh di luar permukaan asli (tabrakan terasa di udara kosong). Untuk mesin fisika web seperti Rapier, `cembung` adalah kuda bebannya — `mesh_sederhana` hanya untuk benda STATIS, karena trimesh dinamis tidak didukung sebagian besar mesin.', {
  ruang: namaRuang,
  objek: z.string().min(1).max(200).optional(),
  bentuk: z.enum(['kotak', 'bola', 'kapsul', 'cembung', 'mesh_sederhana']).default('cembung'),
  nisbah: z.number().min(0.01).max(1).optional()
    .describe('Penyederhanaan untuk `cembung` (bawaan 0,15) dan `mesh_sederhana` (0,25). Hull mentah bisa ribuan segitiga; mesin fisika ingin puluhan.'),
}, (a) => mesinBlender(a.ruang).jalankan('tabrakan', { objek: a.objek, bentuk: a.bentuk, nisbah: a.nisbah }));

tool('rupa_bake', 'Panggang detail dari mesh RAPAT ke mesh RENGGANG jadi peta tekstur. UV dibuat otomatis kalau belum ada, jarak cage DIHITUNG dari selisih kedua permukaan (bukan ditebak), dan hasilnya dilaporkan dengan cakupan UV serta variasi piksel. Arah terbalik diperiksa dari kerapatan poligon — ia tidak bisa dideteksi dari gambarnya, karena membalik arah tetap menghasilkan peta yang tampak sah.', {
  ruang: namaRuang,
  rendah: z.string().min(1).max(200).describe('Mesh tujuan (renggang) — yang akan dipakai di game/web.'),
  tinggi: z.string().min(1).max(200).describe('Mesh sumber (rapat) — yang punya detailnya.'),
  jenis: z.enum(['normal', 'ao', 'diffuse', 'combined', 'roughness', 'emit']).default('normal'),
  berkas: z.string().min(1).max(2048).describe('Jalur absolut PNG tujuan.'),
  ukuran: z.number().int().min(64).max(8192).default(1024),
  contoh: z.number().int().min(1).max(512).default(32),
  cage: z.number().min(0).max(1000).optional().describe('Kosongkan supaya dihitung dari selisih permukaan.'),
  jarak_sinar: z.number().min(0).max(1000).optional(),
  margin: z.number().int().min(0).max(256).default(16),
}, (a) => mesinBlender(a.ruang).jalankan('bake', {
  rendah: a.rendah, tinggi: a.tinggi, jenis: a.jenis, berkas: path.resolve(a.berkas),
  ukuran: a.ukuran, contoh: a.contoh, cage: a.cage, jarak_sinar: a.jarak_sinar, margin: a.margin,
}));

/* ── Rantai: beberapa op Blender dalam SATU proses ────────────────────── */


tool('rupa_rantai', 'Jalankan beberapa op Blender dalam SATU proses. Ini bukan kemudahan — ini perbedaan 7 kali lipat, dan angkanya diukur.\n\nMenyalakan proses Blender cuma 449 ms; sisa 2,5–4 detik tiap panggilan adalah MUAT dan SIMPAN berkas .blend yang sama, diulang untuk setiap op. Enam op satu per satu makan 22,2 detik; enam op yang sama berantai makan 3,1 detik. Hasilnya terbukti IDENTIK bidang demi bidang, termasuk galat LOD dan dua arah galat proksi tabrakan.\n\nRANTAI BERHENTI DI KEGAGALAN PERTAMA, dan itu disengaja: op berikutnya hampir selalu bergantung pada yang sebelumnya, dan menjalankannya di atas adegan setengah jadi menghasilkan angka yang tampak wajar untuk keadaan yang tidak pernah dimaksudkan.\n\nYANG TIDAK BISA DIRANTAI: urutan yang punya KEPUTUSAN di tengah — misalnya memilih objek proksi tabrakan dari hasil pengukuran sebelumnya. Pecah jadi beberapa rantai di batas keputusan yang nyata; `rakit.mjs` memakai tiga.\n\nWaktu per-op TIDAK diukur dalam mode ini; yang dilaporkan waktu seluruh rantai.', {
  ruang: namaRuang,
  ops: z.array(z.object({
    op: z.enum(['baru', 'muat', 'skrip', 'ukur', 'lihat', 'ekspor',
      'lod', 'tabrakan', 'bake', 'terrain', 'tekstur'])
      .describe('Op yang dijalankan; sama persis dengan tool `rupa_*` padanannya.'),
  }).passthrough()).min(1).max(32)
    .describe('Daftar op berurutan. Tiap entri memuat `op` plus argumen yang sama dengan tool tunggalnya — mis. { "op": "lod", "nisbah": [0.5, 0.25] }.'),
}, async (a) => {
  /* Jalur berkas di dalam op DIRESOLUSI di sini, sama seperti tool tunggal.
     Tanpa ini, jalur relatif diartikan terhadap direktori kerja Blender —
     yang bukan direktori kerja pemanggilnya, dan berkasnya muncul di tempat
     yang tidak diminta siapa pun. */
  const BIDANG_JALUR = ['berkas', 'keluar'];
  const ops = a.ops.map((o) => {
    const t = { ...o };
    for (const k of BIDANG_JALUR) if (typeof t[k] === 'string') t[k] = path.resolve(t[k]);
    return t;
  });

  const hilang = ops.find((o) => o.op === 'muat' && !existsSync(o.berkas));
  if (hilang) return { ok: false, error: `berkas tidak ada: ${hilang.berkas}` };

  const r = await mesinBlender(a.ruang).jalankanBanyak(ops);
  return {
    ...r,
    catatan: r.ok === false
      ? 'rantai berhenti di kegagalan pertama; op sesudahnya TIDAK dijalankan'
      : `${ops.length} op dalam satu proses`,
  };
});

/* ── Spek & sertifikat: tesis Rupa3D ──────────────────────────────────── */

tool('rupa_periksa', 'Nilai adegan terhadap SPEK, dan terbitkan SERTIFIKAT. Inilah yang membuat Rupa3D berbeda: hasilnya bukan "berhasil", melainkan daftar janji berikut angka yang membuktikan atau membantahnya. Aturan berbobot `wajib` menggagalkan; `peringatan` dilaporkan lengkap dengan angkanya tetapi tidak menjadi gerbang. Ukuran yang HILANG dihitung GAGAL — aturan yang diam-diam tidak dijalankan adalah cara paling halus sebuah pemeriksa berbohong.', {
  ruang: namaRuang,
  spek: z.string().min(1).max(2048).describe('Jalur berkas spek JSON. Spek bawaan ikut paket dan boleh disebut relatif: spek/aset-generatif.json (GLB umum, 25 aturan), spek/kora-3d-penuh.json (35 aturan).'),
  berkas: z.string().min(1).max(2048).optional()
    .describe('GLB yang diukur LANGSUNG, tanpa Blender. Ini yang seharusnya dipakai untuk aset yang sudah jadi — termasuk keluaran generator mana pun. Sertifikat menggambarkan berkas yang ditempelinya, jadi angkanya harus datang dari berkas itu. Kosongkan untuk mengukur ADEGAN di `ruang` (butuh Blender).'),
  aset: z.string().min(1).max(200).default('adegan').describe('Nama aset untuk dicatat di sertifikat.'),
  tempel_ke: z.string().min(1).max(2048).optional().describe('Jalur GLB yang akan DISALIN lalu ditempeli sertifikat pada `asset.extras.rupa3d`. Berkas asal tidak pernah ditulisi.'),
}, async (a) => {
  /* `muatSpek`, BUKAN JSON.parse polos.
   *
   * Versi lama membaca berkasnya mentah, jadi bidang `warisi` tidak pernah
   * diselesaikan. Tiga dari tujuh spek di repo ini - `kora-3d-game`,
   * `kora-3d-lengkap`, dan `kora-3d-penuh` - tidak punya aturan sendiri sama
   * sekali; mereka MURNI titik komposisi. Lewat pintu ini ketiganya ditolak
   * dengan "spek tanpa `aturan`", yaitu pesan yang MENYALAHKAN BERKAS
   * SPEKNYA untuk cacat yang ada di pembacanya.
   *
   * Yang paling telak: `kora-3d-penuh` adalah spek 35 aturan yang dokumen
   * repo ini sebut "spek terlengkap yang bisa ditulis alat ini hari ini" -
   * dan ia tidak bisa dipakai lewat pintu utamanya sendiri. Fiturnya ada dan
   * benar (`muatSpek` menyelesaikan 15 / 24 / 35 aturan dengan tepat); cuma
   * pintunya yang tidak tersambung.
   *
   * Kelas kesalahan tersendiri: bukan fitur yang salah, melainkan fitur yang
   * TIDAK BISA DICAPAI. Uji berjalan lewat `muatSpek`, jadi ia hijau; yang
   * memakai lewat MCP menemukan tembok. */
  let spek;
  try {
    spek = muatSpek(jalurSpek(a.spek),
      (jalur) => readFileSync(jalur, 'utf8'),
      (jalur, nama) => path.join(path.dirname(jalur), nama));
  } catch (e) {
    return { ok: false, error: `spek tidak bisa dimuat: ${e.message}`, berkas: a.spek };
  }
  const cacat = periksaSpek(spek);
  if (cacat.length) return { ok: false, error: 'spek cacat', rincian: cacat };

  /* ── DUA sumber pengukuran, dan bedanya bukan soal kenyamanan ─────────
   *
   * `berkas` mengukur BERKASNYA. `ruang` mengukur ADEGAN Blender.
   *
   * Yang pertama yang seharusnya jadi bawaan untuk aset yang sudah jadi:
   * sertifikat menggambarkan berkas yang ditempelinya, jadi angkanya harus
   * datang dari berkas itu. Repo ini sudah membayar mahal untuk kekeliruan
   * yang sebaliknya — `tak_manifold 30790` yang menggelembung 85x bertahan
   * berbulan karena diukur dari adegan lalu ditempel ke hasil ekspor.
   *
   * Dan bedanya bukan cuma soal ketepatan angka. Terukur pada `takora.glb`:
   *   verteks lepas   Blender 0    ·  berkas 4
   *   tak-manifold    Blender 30790 ·  berkas 0
   * Importir glTF Blender MEMBUANG verteks tak-terujuk saat impor, jadi
   * Blender secara struktural TIDAK BISA melaporkan cacat itu untuk sebuah
   * GLB. Angka nolnya bukan kabar baik; ia kebutaan.
   *
   * Mode `berkas` juga tidak menyalakan Blender sama sekali, jadi seluruh
   * kosakata bentuk + topologi + tekstur — 35 aturan `kora-3d-penuh` —
   * bisa dinilai di mesin tanpa Blender, dalam ratusan milidetik. */
  let ukuran; let kernel; let sumber;
  if (a.berkas) {
    const jalur = path.resolve(a.berkas);
    if (!existsSync(jalur)) return { ok: false, error: `berkas tidak ada: ${jalur}` };
    /* `sumbu_atas` dibaca dari SPEK kalau ada. Sampai hari ini bidang itu
       dideklarasikan di `spek/kora-3d.json` dan tidak pernah dibaca satu
       tempat pun — bidang hantu kedua di repo ini. Ia justru bidang yang
       menentukan di sini: Blender Z-atas, glTF Y-atas, dan `pivot_z` yang
       diambil dari sumbu yang salah memberi angka yang masuk akal dan
       salah. */
    /* Dekoder Draco disiapkan LEBIH DULU, tanpa diminta.
       Sisi server bisa `await`; pembaca GLB-nya tidak. Membiarkan pemanggil
       MCP mengurus itu sendiri berarti tiap agen harus tahu soal Draco
       sebelum bisa menilai berkas — dan yang tidak tahu akan mendapat
       penolakan untuk berkas yang sebenarnya bisa dibaca. */
    await siapkanDraco();
    const u = ukurGLB(jalur, { sumbu_atas: spek.sumbu_atas ?? 'Y', peta_bagian: spek.peta_bagian });
    ukuran = {
      ...u,
      ...dariTopologi(topologiGLB(jalur)),
      ...dariTekstur(teksturGLB(jalur)),
      ...dariKompresi(u),
    };
    kernel = [`Rupa3D ${PAKET.version} (pembaca berkas, tanpa Blender)`];
    sumber = { jenis: 'berkas', jalur, sumbu_atas: ukuran.sumbu_atas };
  } else {
    const mesin = mesinBlender(a.ruang);
    const hasil = await mesin.jalankan('ukur');
    if (hasil.ok === false) return hasil;
    ukuran = turunkanUkuran(hasil, { peta_bagian: spek.peta_bagian });
    kernel = [(await mesin.versi()) ?? 'Blender'];
    sumber = { jenis: 'adegan', ruang: a.ruang };
  }

  const sertifikat = terbitkanSertifikat({ spek, ukuran, aset: a.aset, kernel });
  sertifikat.sumber = sumber;

  let tempel = null;
  // Di mode berkas, yang ditempeli jelas: berkas itu sendiri (salinannya).
  a = a.tempel_ke || !a.berkas ? a : { ...a, tempel_ke: a.berkas };
  if (a.tempel_ke) {
    const asal = path.resolve(a.tempel_ke);
    const tujuan = asal.replace(/\.glb$/i, '') + '.bersertifikat.glb';
    copyFileSync(asal, tujuan);
    tempel = { berkas: tujuan, ...tempelSertifikat(tujuan, sertifikat) };
  }

  return { ok: sertifikat.lulus, sertifikat, ringkasan: ringkas(sertifikat), tempel };
});

/* ── Sisi CAD: kernel b-rep, di samping Blender ───────────────────────── */

const namaBentuk = z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/)
  .describe('Nama bentuk di ruang CAD; satu segmen, tanpa pemisah jalur.');

const ruangCad = (nama) => cad.bukaRuang(ruangKe(nama));

tool('rupa_cad_status', 'Kernel b-rep OCCT: nyala atau tidak, dan bentuk apa saja yang ada di ruang ini. Panggil sekali sebelum memakai tool `rupa_cad_*` lain — menyalakan kernelnya makan sekitar 0,4 detik, dan sesudah itu gratis.', {
  ruang: namaRuang,
}, async (a) => {
  const r = await ruangCad(a.ruang);
  const d = await cad.daftarBentuk(r);
  return {
    ok: true, kernel: 'OpenCascade (OCCT) via brepjs', ruang: r.dir,
    jenis_primitif: cad.JENIS_PRIMITIF, bentuk: d.bentuk.map((b) => b.nama), jumlah: d.jumlah,
  };
}, true);

tool('rupa_cad_bentuk', 'Buat primitif b-rep bernama. Beda mendasar dengan `rupa_skrip`: silinder di sini disimpan sebagai SILINDER — permukaan analitik berikut toleransinya — bukan segitiga yang menghampirinya. Volumenya EKSAK, dan itu bisa dibuktikan: silinder r=7,5 t=12 memberi angka yang sama persis dengan pi*r^2*t.', {
  ruang: namaRuang,
  nama: namaBentuk,
  jenis: z.enum(['kotak', 'silinder', 'bola', 'kerucut', 'torus', 'elipsoid']),
  ukuran: z.array(z.number()).length(3).optional().describe('kotak: [x, y, z].'),
  sumbu: z.array(z.number()).length(3).optional().describe('elipsoid: [a, b, c].'),
  jari: z.number().positive().optional().describe('silinder / bola / kerucut (jari bawah).'),
  jari_atas: z.number().min(0).optional().describe('kerucut; 0 = lancip.'),
  jari_besar: z.number().positive().optional().describe('torus: jari lingkaran besar.'),
  jari_kecil: z.number().positive().optional().describe('torus: jari penampang.'),
  tinggi: z.number().positive().optional(),
  pusat: z.array(z.number()).length(3).optional().default([0, 0, 0]),
  arah: z.array(z.number()).length(3).optional().describe('Sumbu untuk silinder/kerucut/torus; bawaan [0,0,1].'),
}, async (a) => cad.primitif(await ruangCad(a.ruang), a.nama, a));

tool('rupa_cad_boolean', 'Potong, gabung, atau iris dua bentuk. Arah volumenya DIPERIKSA, dan itu bukan formalitas: boolean yang gagal separuh sering mengembalikan salah satu operand utuh, yang tampak berhasil sampai ada yang mengukurnya. Hasil yang arah volumenya salah tidak pernah tersimpan.', {
  ruang: namaRuang,
  operasi: z.enum(['potong', 'gabung', 'iris']),
  a: namaBentuk.describe('Bentuk dasar.'),
  b: namaBentuk.describe('Bentuk alat.'),
  ke: namaBentuk.optional().describe('Nama hasil; kosong = timpa `a`.'),
}, async (x) => cad.boolean2(await ruangCad(x.ruang), x.operasi, x.a, x.b, { ke: x.ke }));

tool('rupa_cad_tepi', 'Daftar tepi sebuah bentuk berikut ARAH dan PANJANGNYA. Panggil ini SEBELUM fillet selektif — tanpa daftar ini, "fillet tepi tegak saja" berarti menebak indeks, dan indeks tepi bukan sesuatu yang bisa ditebak.', {
  ruang: namaRuang,
  nama: namaBentuk,
}, async (a) => cad.tepiBentuk(await ruangCad(a.ruang), a.nama), true);

tool('rupa_cad_fillet', 'Bulatkan (fillet) atau serong (chamfer) tepi — SEMUA tepi, tepi searah tertentu, atau daftar indeks dari `rupa_cad_tepi`.\n\nPERINGATAN YANG TERUKUR: di atas setengah sisi terkecil, `fillet` mengembalikan ok dengan solid RUSAK. Pada kotak 10x20x30, radius 5,001 memberi volume 7971 dari 6000 — fillet yang MENAMBAH material. Kernelnya tidak mengeluh. Tool ini menolaknya lewat dua pemeriksa bebas (isShapeValid dan arah volume), dan hasil yang gagal tidak pernah tersimpan. `chamfer` tidak punya masalah itu; ia gagal bersih.', {
  ruang: namaRuang,
  nama: namaBentuk,
  jenis: z.enum(['fillet', 'chamfer']).default('fillet'),
  ukuran: z.number().positive().describe('Radius fillet, atau jarak chamfer. Batas amannya setengah sisi terkecil.'),
  arah: z.enum(['X', 'Y', 'Z']).optional().describe('Hanya tepi yang sejajar sumbu ini.'),
  tepi: z.array(z.number().int().min(0)).max(500).optional().describe('Daftar indeks tepi dari `rupa_cad_tepi`. Menimpa `arah`.'),
  ke: namaBentuk.optional().describe('Nama hasil; kosong = timpa asalnya.'),
}, async (a) => {
  const r = await ruangCad(a.ruang);
  const opsi = { ke: a.ke, arah: a.arah, tepi: a.tepi };
  return a.jenis === 'chamfer'
    ? cad.chamfer(r, a.nama, { ...opsi, jarak: a.ukuran })
    : cad.fillet(r, a.nama, { ...opsi, radius: a.ukuran });
});


tool('rupa_cad_sketsa', 'Sketsa 2D \u2192 padat 3D: dorong (ekstrusi), putar (revolve), atau loft. Inilah cara benda nyata dimodelkan \u2014 gambar penampang, lalu bangkitkan. Satu tool ini membuka arsitektur (denah \u2192 dinding), pemodelan mesin (profil \u2192 poros/flange/wadah), dan 2D\u21923D (path \u2192 padat).\n\nYANG MEMBEDAKANNYA: tiap padat DIPERIKSA terhadap RUMUS TERTUTUP. Ekstrusi dibandingkan dengan luas \u00d7 jarak (luasnya dihitung shoelace dari polilinenya, bukan ditulis tangan); putar 360\u00b0 dibandingkan dengan teorema Pappus (2\u03c0\u00b7R_centroid\u00b7luas). Terukur pada kernel ini: ekstrusi meleset 1e-14%, putar cocok dengan Pappus sampai 0,000000%. Hasil yang melenceng dari acuannya TIDAK disimpan.\n\nDUA HAL YANG MENGHANCURKAN PUTAR, dijaga di depan karena galat kernelnya berupa pointer mentah yang tak terbaca: profil yang MELINTASI sumbu putar, dan sudut di luar 0..360.', {
  ruang: namaRuang,
  nama: namaBentuk.describe('Nama untuk menyimpan hasilnya.'),
  operasi: z.enum(['ekstrusi', 'putar', 'loft']).default('ekstrusi'),

  jenis: z.enum(['path', 'persegi', 'lingkaran', 'elips', 'polisegi', 'teks'])
    .default('path').describe('Bentuk profil 2D-nya.'),
  mulai: z.array(z.number()).length(2).optional().describe('path: titik awal pena.'),
  segmen: z.array(z.object({
    ke: z.array(z.number()).length(2).optional().describe('garis ke titik MUTLAK'),
    garis: z.array(z.number()).length(2).optional().describe('garis RELATIF [dx, dy]'),
    h: z.number().optional().describe('garis mendatar sejauh ini'),
    v: z.number().optional().describe('garis tegak sejauh ini'),
    busur: z.array(z.number()).length(2).optional().describe('busur ke titik mutlak'),
    sagitta: z.number().optional().describe('tinggi busur dari talinya; wajib bersama `busur`'),
    tangen: z.array(z.number()).length(2).optional().describe('busur yang menyinggung segmen sebelumnya'),
  })).max(500).optional().describe('path: urutan segmen. Jalurnya ditutup otomatis.'),
  lebar: z.number().positive().optional().describe('persegi'),
  tinggi_profil: z.number().positive().optional().describe('persegi (tinggi 2D-nya, bukan ekstrusi)'),
  jari: z.number().positive().optional().describe('lingkaran / polisegi'),
  jari_besar: z.number().positive().optional().describe('elips'),
  jari_kecil: z.number().positive().optional().describe('elips'),
  sisi: z.number().int().min(3).max(64).optional().describe('polisegi'),
  teks: z.string().min(1).max(200).optional(),
  ukuran_teks: z.number().positive().optional(),

  bidang: z.enum(['XY', 'XZ', 'YZ']).default('XY')
    .describe('Bidang gambarnya. Ekstrusi terjadi pada arah NORMAL bidang ini.'),
  asal: z.number().default(0).describe('Geseran sepanjang normal bidang.'),
  jarak: z.number().optional().describe('ekstrusi: sejauh mana didorong.'),
  puntir: z.number().min(-360).max(360).default(0)
    .describe('ekstrusi: derajat puntiran sepanjang jaraknya. Volumenya tidak berubah \u2014 geseran tidak menambah material \u2014 dan itu justru yang mengujinya.'),
  sumbu: z.array(z.number()).length(3).optional().describe('putar: sumbu putarnya; bawaan [0,0,1].'),
  sudut: z.number().min(0).max(360).default(360).describe('putar: derajat.'),
  profil_loft: z.array(z.record(z.any())).max(20).optional()
    .describe('loft: daftar profil, bentuknya sama dengan bidang profil di atas.'),
  tinggi_loft: z.array(z.number()).max(20).optional()
    .describe('loft: posisi tiap profil sepanjang normal bidang; harus sepanjang profil_loft.'),
  lurus: z.boolean().default(false).describe('loft: sisi lurus antar penampang, bukan melengkung.'),
}, async (a) => {
  const r = await ruangCad(a.ruang);
  const profil = {
    jenis: a.jenis, mulai: a.mulai, segmen: a.segmen,
    lebar: a.lebar, tinggi: a.tinggi_profil, jari: a.jari,
    jari_besar: a.jari_besar, jari_kecil: a.jari_kecil, sisi: a.sisi,
    teks: a.teks, ukuran: a.ukuran_teks,
  };
  if (a.operasi === 'loft') {
    if (!a.profil_loft?.length) throw new Error('loft butuh `profil_loft`');
    return cad.sketsaKe(r, a.nama, 'loft', a.profil_loft, {
      bidang: a.bidang, tinggi: a.tinggi_loft ?? [], lurus: a.lurus,
    });
  }
  if (a.operasi === 'putar') {
    return cad.sketsaKe(r, a.nama, 'putar', profil, {
      bidang: a.bidang, asal: a.asal, sumbu: a.sumbu ?? [0, 0, 1], sudut: a.sudut,
    });
  }
  if (a.jarak == null) throw new Error('ekstrusi butuh `jarak`');
  return cad.sketsaKe(r, a.nama, 'ekstrusi', profil, {
    jarak: a.jarak, bidang: a.bidang, asal: a.asal, puntir: a.puntir,
  });
});

tool('rupa_cad_ubah', 'Geser, putar, skala, atau cermin sebuah bentuk. Volumenya diperiksa terhadap yang DIHARAPKAN secara matematis: geser dan putar tidak boleh mengubahnya sama sekali, skala mengubahnya pangkat tiga. Transformasi yang menggeser volume adalah gejala matriks yang salah, dan itu tidak terlihat sampai ada yang mengukur.', {
  ruang: namaRuang,
  nama: namaBentuk,
  geser: z.array(z.number()).length(3).optional(),
  skala: z.number().positive().optional(),
  putar_sudut: z.number().optional().describe('Derajat.'),
  putar_sumbu: z.array(z.number()).length(3).optional().default([0, 0, 1]),
  putar_titik: z.array(z.number()).length(3).optional().default([0, 0, 0]),
  cermin_normal: z.array(z.number()).length(3).optional(),
  ke: namaBentuk.optional(),
}, async (a) => cad.ubah(await ruangCad(a.ruang), a.nama, {
  geser: a.geser, skala: a.skala, ke: a.ke,
  putar: a.putar_sudut == null ? undefined
    : { sudut: a.putar_sudut, sumbu: a.putar_sumbu, titik: a.putar_titik },
  cermin: a.cermin_normal ? { normal: a.cermin_normal } : undefined,
}));

tool('rupa_cad_ukur', 'Volume dan luas EKSAK, jumlah tepi dan muka, kotak batas — plus ongkos hampiran meshnya pada satu toleransi. Dua angka itu selalu dilaporkan bersama, disengaja: yang eksak sendirian tidak memberi tahu berapa yang HILANG saat bentuknya dikirim ke web.', {
  ruang: namaRuang,
  nama: namaBentuk,
  toleransi: z.number().positive().max(100).default(0.05),
}, async (a) => cad.ukurBentuk(await ruangCad(a.ruang), a.nama, { toleransi: a.toleransi }), true);

tool('rupa_cad_daftar', 'Semua bentuk di ruang CAD ini berikut volume, luas, jumlah tepi, dan apakah bentuknya sah — bukan cuma namanya.', {
  ruang: namaRuang,
}, async (a) => cad.daftarBentuk(await ruangCad(a.ruang)), true);

tool('rupa_cad_ekspor', 'Tulis bentuk ke berkas. Pembagian yang menentukan, dan tidak disebut pesan galat mana pun:\n\n  .step .iges     b-rep EKSAK, permukaan analitik — untuk CAD & CNC\n  .stl .glb .obj  SEGITIGA, hampiran — untuk web & cetak\n\nYang kedua SELALU melenceng, berapa pun toleransinya diperkecil, jadi galatnya ikut dilaporkan. "Sudah diekspor" tanpa angka adalah kalimat yang tidak bisa dipercaya.', {
  ruang: namaRuang,
  nama: namaBentuk,
  berkas: z.string().min(1).max(2048).describe('Jalur absolut; formatnya diambil dari ekstensinya.'),
  toleransi: z.number().positive().max(100).default(0.05).describe('Hanya berlaku untuk format bersegitiga.'),
}, async (a) => cad.eksporBentuk(await ruangCad(a.ruang), a.nama, path.resolve(a.berkas), { toleransi: a.toleransi }));

tool('rupa_cad_impor', 'Baca STEP/IGES/STL dari CAD lain, lalu UKUR isinya. Impor tanpa ukur tidak memberi tahu apa pun tentang apa yang masuk — dan STEP dari dunia luar sering membawa bentuk yang tidak sah, yang baru ketahuan saat dioperasikan.', {
  ruang: namaRuang,
  berkas: z.string().min(1).max(2048),
  nama: namaBentuk.describe('Nama untuk menyimpannya di ruang ini.'),
}, async (a) => cad.imporBerkas(await ruangCad(a.ruang), path.resolve(a.berkas), a.nama));

/* ── Adegan & runtime: sisi KELUARAN ──────────────────────────────────── */

const v3 = z.array(z.number()).length(3);
const heks = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'warna harus heks #rrggbb');
const idNode = z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/);

tool('rupa_adegan_baru', 'Mulai adegan KOSONG yang sudah sah: kamera, cahaya lingkungan, dan matahari. Menimpa adegan ruang ini. Adegan adalah DATA — ia bisa diperiksa, dibandingkan, diberi versi, dan disusun oleh siapa pun, termasuk agen lewat tool ini.', {
  ruang: namaRuang,
  nama: z.string().min(1).max(120).default('adegan').describe('Nama adegan; jadi judul halaman saat terbit.'),
}, async (a) => {
  const adegan = mulaiAdegan(ruangKe(a.ruang), a.nama);
  return { ok: true, berkas: jalurAdegan(ruangKe(a.ruang)), ringkas: adg.ringkasAdegan(adegan) };
});

tool('rupa_adegan_aset', 'Daftarkan GLB ke adegan. Yang dicatat bukan cuma jalurnya: ukuran berkas, KOTAK BATAS (dibaca dari accessor min/max glTF, tanpa memuat mesh), dan SERTIFIKATNYA kalau ada. Kotak batas itu yang membuat kesalahan skala bisa ditangkap sebelum terbit — kesalahan skala tidak muncul di daftar node, tidak menggagalkan apa pun, dan baru ketahuan kalau kebetulan kameranya menghadap ke sana.', {
  ruang: namaRuang,
  kunci: idNode.describe('Nama pendek untuk menyebut aset ini di node.'),
  berkas: z.string().min(1).max(2048).describe('Jalur absolut .glb'),
}, async (a) => ubahAdegan(ruangKe(a.ruang), (ad) => {
  const info = adg.daftarkanAset(ad, a.kunci, path.resolve(a.berkas));
  return { ok: true, kunci: a.kunci, ...info };
}));

tool('rupa_adegan_node', 'Tambah, ubah, atau hapus node. `jenis` boleh `aset` (memakai GLB terdaftar) atau bentuk dasar — bentuk dasar ada supaya lantai dan latar tidak menuntut satu GLB sendiri.\n\n`peran` menentukan apakah node ikut dinilai skalanya: `properti` = benda di panggung (dinilai), `latar` = lantai/dinding/langit (dikecualikan), `pandu` = grid/sumbu/penanda. Lantai 40 m di adegan bermedian 1,7 m BUKAN kesalahan skala, dan membedakannya lewat peran lebih jujur daripada melonggarkan ambang sampai lantai lolos.', {
  ruang: namaRuang,
  aksi: z.enum(['tambah', 'ubah', 'hapus']).default('tambah'),
  id: idNode.optional().describe('Wajib untuk ubah/hapus; kosong saat tambah = dibuatkan.'),
  jenis: z.enum(['aset', 'kotak', 'bola', 'bidang', 'silinder', 'torus', 'kapsul']).optional(),
  aset: idNode.optional().describe('Kunci aset terdaftar; wajib kalau jenis = aset.'),
  nama: z.string().min(1).max(120).optional(),
  peran: z.enum(['properti', 'latar', 'pandu']).optional(),
  posisi: v3.optional(),
  putar: v3.optional().describe('Derajat, XYZ.'),
  skala: z.union([z.number().positive(), v3]).optional(),
  ukuran: v3.optional().describe('Untuk bentuk dasar; tidak berlaku pada aset.'),
  tampak: z.boolean().optional(),
  bayangan: z.boolean().optional(),
  warna: heks.optional(),
  kekasaran: z.number().min(0).max(1).optional(),
  logam: z.number().min(0).max(1).optional(),
  pancar: z.number().min(0).max(20).optional(),
  bening: z.number().min(0).max(1).optional().describe('Transmisi kaca 0..1.'),
  tembus: z.number().min(0).max(1).optional().describe('Kebalikan opasitas sederhana.'),

  /* ── FISIKA ────────────────────────────────────────────────────────────
   *
   * Sampai 10 Sep 2026 bidang ini TIDAK ADA di sini, dan akibatnya seluruh
   * sisi fisika Rupa3D tidak bisa dicapai lewat MCP sama sekali -
   * `adegan.mjs` menerima dan memvalidasi `fisika` sejak awal, tetapi satu-
   * satunya pintu untuk membuat node tidak pernah meneruskannya.
   *
   * Yang membuatnya terbaca sebagai cacat, bukan sekadar bidang yang belum
   * ditulis: deskripsi `rupa_proksi` MENYURUH memakainya - "titiknya bisa
   * langsung dipasang ke rupa_adegan_node sebagai fisika.bentuk = cembung".
   * Alur kerja yang ditulis di deskripsi sebuah tool, dan tidak bisa
   * dijalankan lewat tool mana pun.
   *
   * Uji tidak menangkapnya karena uji memakai pustakanya langsung. Yang
   * memakai lewat MCP menemukan tembok tanpa pesan. */
  fisika_jenis: z.enum(['statis', 'dinamis', 'kinematik']).optional()
    .describe('Jenis badan. Kosongkan kalau node ini tidak ikut fisika.'),
  fisika_bentuk: z.enum(['kotak', 'bola', 'kapsul', 'silinder', 'cembung']).optional()
    .describe('Bentuk collider. DINYATAKAN, bukan diturunkan dari bentuk visualnya: collider yang mengikuti mesh persis adalah trimesh, dan trimesh tidak bisa dinamis di mesin fisika web mana pun.'),
  fisika_massa: z.number().min(0).max(1e9).optional()
    .describe('kg. Sebutkan massa ATAU kerapatan, jangan keduanya - Rapier menerima keduanya dan diam-diam mengabaikan salah satunya.'),
  fisika_kerapatan: z.number().min(0).max(1e6).optional().describe('kg/m3.'),
  fisika_gesekan: z.number().min(0).max(10).optional(),
  fisika_pantul: z.number().min(0).max(1).optional().describe('Restitusi 0..1.'),
  fisika_ukuran: v3.optional().describe('Ukuran collider kalau berbeda dari ukuran visualnya.'),
  fisika_titik: z.array(z.number()).max(12288).optional()
    .describe('WAJIB untuk bentuk `cembung`: larik datar [x,y,z,...] dari rupa_proksi. Maksimum 4096 titik (12288 angka) - convexHull Rapier rusak diam-diam di atas ~8.000 titik dan mengembalikan collider bervolume NOL.'),
  fisika_kendali: z.boolean().optional().describe('Node ini dikendalikan pemain (WASD + lompat).'),
  fisika_hapus: z.boolean().default(false).describe('Buang fisika dari node ini.'),
}, async (a) => ubahAdegan(ruangKe(a.ruang), (ad) => {
  const bahan = {};
  for (const k of ['warna', 'kekasaran', 'logam', 'pancar', 'bening', 'tembus']) {
    if (a[k] != null) bahan[k] = a[k];
  }
  /* Bidang datar `fisika_*` di skema MCP, objek bersarang di adegan. Skema
     MCP yang dalam sulit dipakai agen dan mudah salah bentuk; yang
     memvalidasi tetap `fisikaSah()` di `adegan.mjs`, satu tempat. */
  const fisika = {};
  for (const k of ['jenis', 'bentuk', 'massa', 'kerapatan', 'gesekan', 'pantul',
    'ukuran', 'titik', 'kendali']) {
    if (a[`fisika_${k}`] != null) fisika[k] = a[`fisika_${k}`];
  }
  const umum = {
    id: a.id, jenis: a.jenis, aset: a.aset, nama: a.nama, peran: a.peran,
    posisi: a.posisi, putar: a.putar, skala: a.skala, ukuran: a.ukuran,
    tampak: a.tampak, bayangan: a.bayangan,
    ...(Object.keys(bahan).length ? { bahan } : {}),
    ...(a.fisika_hapus ? { fisika: null }
      : Object.keys(fisika).length ? { fisika } : {}),
  };
  if (a.aksi === 'hapus') {
    if (!a.id) throw new Error('hapus butuh `id`');
    return { ok: true, ...adg.hapusNode(ad, a.id) };
  }
  if (a.aksi === 'ubah') {
    if (!a.id) throw new Error('ubah butuh `id`');
    return { ok: true, node: adg.ubahNode(ad, a.id, umum) };
  }
  return { ok: true, node: adg.tambahNode(ad, umum) };
}));

tool('rupa_adegan_cahaya', 'Atur atau tambah cahaya. `id` yang sudah ada akan DITIMPA, jadi tool ini juga cara mengubah matahari bawaan. Adegan tanpa satu pun cahaya berkekuatan > 0 ditolak saat terbit — ia akan terbit HITAM, dan layar hitam tanpa pesan adalah kegagalan yang paling mahal.', {
  ruang: namaRuang,
  id: idNode.optional(),
  jenis: z.enum(['lingkungan', 'arah', 'titik', 'sorot']).optional(),
  warna: heks.optional(),
  kuat: z.number().min(0).max(200).optional(),
  posisi: v3.optional(),
  bayangan: z.boolean().optional(),
  hapus: z.boolean().default(false),
}, async (a) => ubahAdegan(ruangKe(a.ruang), (ad) => {
  if (a.hapus) {
    if (!a.id) throw new Error('hapus butuh `id`');
    return { ok: true, ...adg.hapusCahaya(ad, a.id) };
  }
  return { ok: true, cahaya: adg.aturCahaya(ad, a) };
}));

tool('rupa_adegan_kamera', 'Posisi, target, dan bidang pandang kamera awal. Ini kamera yang dilihat orang saat halaman pertama dibuka — orbit sesudahnya milik pembaca.', {
  ruang: namaRuang,
  posisi: v3.optional(),
  target: v3.optional(),
  fov: z.number().min(1).max(179).optional(),
}, async (a) => ubahAdegan(ruangKe(a.ruang), (ad) => ({ ok: true, kamera: adg.aturKamera(ad, a) })));

tool('rupa_adegan_lingkungan', 'Langit gradien, paparan (tone mapping ACES), bayangan, dan kabut. Paparan adalah pengatur terang yang BENAR di alur kerja PBR — menaikkan kekuatan cahaya untuk membuat gambar lebih terang akan merusak pantulan dan bayangannya.', {
  ruang: namaRuang,
  langit_atas: heks.optional(),
  langit_bawah: heks.optional(),
  paparan: z.number().min(0.05).max(8).optional(),
  bayangan: z.boolean().optional(),
  kabut_warna: heks.optional(),
  kabut_dekat: z.number().min(0).optional(),
  kabut_jauh: z.number().min(0).optional(),
  kabut_mati: z.boolean().default(false),
}, async (a) => ubahAdegan(ruangKe(a.ruang), (ad) => {
  const l = {
    langit_atas: a.langit_atas, langit_bawah: a.langit_bawah,
    paparan: a.paparan, bayangan: a.bayangan,
  };
  if (a.kabut_mati) l.kabut = null;
  else if (a.kabut_warna || a.kabut_dekat != null || a.kabut_jauh != null) {
    l.kabut = { warna: a.kabut_warna, dekat: a.kabut_dekat, jauh: a.kabut_jauh };
  }
  return { ok: true, lingkungan: adg.aturLingkungan(ad, l) };
}));

tool('rupa_adegan_lihat', 'Isi adegan berikut ANGKANYA: tiap node dengan ukuran DUNIA-nya, sertifikat tiap aset, dan pemeriksaan SKALA TIMPANG — node yang diagonalnya menyimpang jauh dari median adegan. Panggil ini sebelum terbit. Kesalahan skala terjadi pada adegan pertama alat ini sendiri: sebuah ikon terbit 438 satuan di adegan bermedian 1,7 karena skalanya dipakai dari ingatan tentang aset LAIN, tanpa mengukur aset itu.', {
  ruang: namaRuang,
}, async (a) => {
  const ad = muatAdegan(ruangKe(a.ruang));
  return {
    ok: true, nama: ad.nama,
    node: ad.node.length, cahaya: ad.cahaya.length, aset: Object.keys(ad.aset).length,
    ukuran: adg.ukuranNode(ad),
    skala: adg.skalaTimpang(ad),
    cacat: adg.periksaAdegan(ad),
    ringkas: adg.ringkasAdegan(ad),
  };
}, true);

tool('rupa_adegan_terbit', 'Adegan jadi SATU halaman HTML yang berdiri sendiri — orbit, klik-pilih, dan tiap objek membawa angkanya. Aset ditanam sebagai base64 di dalam halamannya, bukan ditunjuk lewat URL: halaman yang memuat asetnya lewat jaringan akan tampil sebagai LAYAR KOSONG di lingkungan ber-CSP ketat, tanpa galat yang menyebut sebabnya.\n\nOngkosnya diukur, bukan diabaikan: base64 membengkakkan bita sekitar 4/3, dan anggaran 16 MB diperiksa SEBELUM menulis dengan menyebut aset penyumbang terbesar. Mode `mandiri` menghasilkan dokumen utuh untuk server statis mana pun; `mandiri: false` menghasilkan potongan tanpa <html>/<head> untuk penerbit yang memasang kerangkanya sendiri.', {
  ruang: namaRuang,
  berkas: z.string().min(1).max(2048).describe('Jalur absolut .html tujuan.'),
  judul: z.string().min(1).max(160).optional(),
  mandiri: z.boolean().default(true),
}, async (a) => {
  const ad = muatAdegan(ruangKe(a.ruang));
  const h = terbitkan(ad, {
    judul: a.judul, mandiri: a.mandiri, keluar: path.resolve(a.berkas),
  });
  return {
    ok: true, berkas: h.berkas, bita: h.bita,
    megabita: Number((h.bita / 1048576).toFixed(3)),
    mandiri: h.mandiri, aset: h.aset, skala: h.skala,
  };
});

/* ── Topologi & proksi: memeriksa aset dari MANA PUN ──────────────────── */

tool('rupa_topologi', 'Periksa TOPOLOGI sebuah GLB — bagaimana verteksnya TERSAMBUNG, bukan di mana letaknya. Bekerja pada berkas dari mana pun, termasuk keluaran generator AI, tanpa perlu Blender.\n\nYang dilaporkan: tepi tak-manifold, tepi batas (lubang), segitiga berputar terbalik, segitiga degenerasi dan sliver, nisbah pecah verteks, sebaran kerapatan texel, dan UV di luar 0–1.\n\nSATU HAL YANG MENENTUKAN: verteks DILAS menurut posisi sebelum dihitung. glTF memecah verteks di tiap jahitan UV, jadi menghitung manifold pada indeks mentah membuat setiap jahitan terlihat sebagai lubang — terukur pada satu aset: 30.790 mentah vs 360 setelah dilas, menggelembung 85 kali.\n\nDAN YANG TIDAK BISA DIUKUR DARI GLB, disebut apa adanya: nisbah quad/n-gon dan pola edge loop sudah HILANG sebelum berkasnya ditulis, karena glTF selalu tersegitiga. Alat mana pun yang mengklaim menilai quad-dominance dari sebuah GLB sedang mengarang.', {
  berkas: z.string().min(1).max(2048).describe('Jalur absolut .glb'),
  toleransi_las: z.number().positive().optional()
    .describe('Jarak maksimum dua titik dianggap sama. Kosongkan supaya diturunkan dari diagonal berkasnya (1e-6 x diagonal) — ambang MUTLAK akan melas seluruh model milimeter jadi satu titik.'),
  per_primitif: z.boolean().default(false)
    .describe('Sertakan rincian tiap primitif. Angka gabungan DIJUMLAHKAN bukan dirata-rata: rata-rata menenggelamkan satu primitif rusak parah di antara tiga puluh yang sehat.'),
}, async (a) => {
  if (!existsSync(a.berkas)) return { ok: false, error: `berkas tidak ada: ${a.berkas}` };
  await siapkanDraco();
  const t = topologiGLB(path.resolve(a.berkas), { toleransi: a.toleransi_las ?? null });
  const { per_primitif, ...ringkas } = t;
  return {
    ok: true, ...(a.per_primitif ? t : ringkas), ringkasan: ringkasTopologi(t),
  };
}, true);

tool('rupa_topologi_sumber', 'Topologi SUMBER: quad, n-gon, valensi verteks, KUTUB, dan EDGE LOOP — diukur dari mesh di dalam Blender, satu-satunya tempat keempatnya masih ada.\n\nglTF SELALU tersegitiga, jadi `rupa_topologi` (yang membaca GLB) menyebut keempat ukuran ini "tidak bisa diukur" di tiap keluarannya. Itu benar, dan tool ini bukan penghampirannya — ia membaca sumbernya.\n\nKENAPA INI YANG MENENTUKAN: yang membuat aset generatif menuntut dua sampai empat jam retopology manual bukan jumlah segitiganya, melainkan tidak adanya STRUKTUR — tidak ada edge loop yang mengikuti lipatan, valensi kacau, quad tidak ada. Mesh begitu tidak bisa dideformasi, di-subdivide, atau di-UV tanpa dibangun ulang.\n\nBATAS YANG DISEBUT: memuat GLB ke Blender TIDAK memulihkan quad-nya. Kalau mesh yang diukur seluruhnya segitiga, keluarannya memuat `peringatan` yang menyatakan bahwa itu bisa berarti mesh memang bertopologi segitiga ATAU informasinya sudah musnah saat impor — dan alat ini tidak bisa membedakannya. Terukur: sebuah GLB 2.976 segitiga diimpor ulang keluar sebagai 2.976 segitiga dan NOL quad.\n\nVERTEKS BATAS dikeluarkan dari analisis kutub: valensi != 4 di tepi terbuka itu wajar, bukan cacat — bidang datar 4x4 punya seluruh tepinya bervalensi 2 atau 3.', {
  ruang: namaRuang,
  objek: z.string().min(1).max(200).optional().describe('Satu objek mesh; kosong = seluruh mesh di adegan.'),
  ambang_sebidang: z.number().positive().max(90).default(1)
    .describe('Derajat. Quad yang keempat verteksnya menyimpang lebih dari ini dihitung TAK SEBIDANG — Blender, mesin game, dan eksportir glTF masing-masing memilih diagonal segitiganya sendiri, jadi bayangannya berubah bentuk antar-alat tanpa satu pun yang salah.'),
  per_objek: z.boolean().default(false).describe('Sertakan rincian tiap objek.'),
}, async (a) => {
  const r = await mesinBlender(a.ruang).jalankan('topologi_sumber', {
    objek: a.objek, ambang_sebidang: a.ambang_sebidang,
  });
  if (r.ok === false) return r;
  if (a.per_objek) return r;
  const { per_objek, ...ringkas } = r;
  return ringkas;
}, true);

tool('rupa_proksi', 'Bangun proksi tabrakan CEMBUNG dari sebuah GLB, berikut ongkosnya yang terukur. Titiknya bisa langsung dipasang ke `rupa_adegan_node` sebagai `fisika.bentuk = "cembung"`.\n\nDiukur dengan collider Rapier yang PERSIS akan berjalan (`projectPoint`), bukan dengan model hull terpisah — mengukur proksi dengan alat yang berbeda dari yang menjalankannya berarti mengukur benda yang berbeda.\n\nPERINGATAN YANG TERUKUR: `convexHull` Rapier RUSAK DIAM-DIAM di atas sekitar 8.000 titik — tidak null, tidak melempar, tidak memperingatkan; ia mengembalikan collider bervolume NOL, dan benda dengan collider bervolume nol tidak menabrak apa pun: ia jatuh menembus dunia. Karena itu titiknya selalu direduksi lebih dulu dan hasilnya dijaga dua pemeriksa eksak.', {
  berkas: z.string().min(1).max(2048).describe('Jalur absolut .glb'),
  arah: z.number().int().min(8).max(1024).default(96)
    .describe('Banyak arah penopang. Makin banyak makin rapat proksinya, dan ongkos ketepatannya ikut dilaporkan supaya bisa dipilih dengan angka.'),
  sertakan_titik: z.boolean().default(true)
    .describe('Sertakan larik titiknya. Matikan kalau cuma ingin angkanya.'),
}, async (a) => {
  if (!existsSync(a.berkas)) return { ok: false, error: `berkas tidak ada: ${a.berkas}` };
  await siapkanDraco();
  const p = await proksiCembung(path.resolve(a.berkas), { arah: a.arah });
  return a.sertakan_titik ? { ok: true, ...p } : { ok: true, ...p, titik: undefined };
}, true);

tool('rupa_tekstur', 'Periksa TEKSTUR sebuah GLB, dan jawab pertanyaan yang sebenarnya ditanyakan orang: apakah teksturnya CUKUP untuk benda ini, atau TERLALU BESAR.\n\nJawabannya PIKSEL PER METER — kerapatan texel (UV per meter dunia) dikalikan ukuran tekstur. Kedua bahannya sudah ada di setiap GLB dan tidak ada alat yang mengalikannya. Di bawah ~100 px/m benda seukuran manusia buram dari dekat; di atas ~2000 px/m hampir selalu pemborosan.\n\nTIGA PEMBOROSAN YANG TIDAK TERLIHAT DI LAYAR: peta RATA (1024² berisi satu nilai = 4 MB VRAM untuk sebuah angka), ALFA SIA-SIA (RGBA yang alfanya 255 di mana-mana = 25% memori terbuang), dan RESOLUSI SEMU (gambar 256² yang di-upscale jadi 1024² = memori empat kali lipat untuk detail yang sama persis).\n\nNormal map diperiksa DUA syarat sekaligus: |v| mendekati 1 DAN biru tinggi. |v| sendirian tidak cukup — gambar gradien sembarang memberi |v|=1,105, cukup dekat untuk lolos.\n\nFAKTOR ikut dilaporkan, dan itu bukan kelengkapan: di glTF nilai efektif = faktor × saluran tekstur. Melaporkan "saluran B = 255" tanpa menyebut metallicFactor: 0 mengundang kesimpulan bahwa bendanya logam penuh, padahal hasilnya nol.', {
  berkas: z.string().min(1).max(2048).describe('Jalur absolut .glb'),
  piksel_per_meter: z.boolean().default(true)
    .describe('Hitung px/meter. Menuntut pembacaan topologi juga, jadi sedikit lebih lambat.'),
  per_gambar: z.boolean().default(false).describe('Sertakan rincian tiap gambar.'),
}, async (a) => {
  if (!existsSync(a.berkas)) return { ok: false, error: `berkas tidak ada: ${a.berkas}` };
  await siapkanDraco();
  const t = teksturGLB(path.resolve(a.berkas), { hitungPikselPerMeter: a.piksel_per_meter });
  const { per_gambar, ...ringkas } = t;
  return { ok: true, ...(a.per_gambar ? t : ringkas), ringkasan: ringkasTekstur(t) };
}, true);

tool('rupa_tekstur_buat', 'Bangun material PROSEDURAL di Blender, PANGGANG jadi peta gambar, lalu ganti materialnya dengan yang berbasis gambar supaya bisa diekspor.\n\nLangkah terakhir itu yang paling mudah terlupa dan paling mahal: material prosedural Blender TIDAK BISA diekspor ke glTF sama sekali. Eksportirnya cuma mengerti nilai tetap dan peta gambar, jadi material prosedural yang indah di Blender terbit ke web sebagai ABU-ABU RATA, tanpa satu pun peringatan.\n\nTiga hal yang menentukan hasilnya: node gambar harus AKTIF sebelum bake (kalau tidak Blender memanggang ke tempat tak tentu dan diam saja); bake DIFFUSE bawaannya menyertakan pencahayaan sehingga bayangan lampu ikut terpanggang ke albedo; dan ruang warna harus disetel SEBELUM disimpan — albedo sRGB, sisanya Non-Color.', {
  ruang: namaRuang,
  objek: z.string().min(1).max(200).optional().describe('Nama mesh; kosong = yang terbesar di adegan.'),
  gaya: z.enum(['batu', 'kayu', 'logam']).default('batu'),
  ukuran: z.number().int().min(64).max(4096).default(512),
  jenis: z.array(z.enum(['albedo', 'kekasaran', 'normal', 'oklusi']))
    .min(1).max(4).default(['albedo', 'kekasaran', 'normal']),
  keluar: z.string().min(1).max(2048).describe('Direktori tujuan peta PNG.'),
  kuat_bump: z.number().min(0).max(20).default(2)
    .describe('Kekuatan relief yang dipanggang ke normal map. Terlalu rendah menghasilkan peta yang praktis RATA — sah, tetapi memakan VRAM penuh tanpa membawa informasi. Terukur: 0,6 memberi jangkauan 125–130 dari 0–255; 2,0 memberi peta yang benar-benar berisi.'),
  contoh: z.number().int().min(1).max(512).default(24),
}, async (a) => mesinBlender(a.ruang).jalankan('tekstur', {
  objek: a.objek, gaya: a.gaya, ukuran: a.ukuran, jenis: a.jenis,
  keluar: path.resolve(a.keluar), kuat_bump: a.kuat_bump, contoh: a.contoh,
}));

await server.connect(new StdioServerTransport());
