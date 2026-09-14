/* Uji SPEK, SERTIFIKAT, dan penempelannya ke GLB.
 *
 * ── Aturan yang mengikat berkas ini ──────────────────────────────────────
 *
 * Pemeriksa yang tidak pernah MERAH bukan pemeriksa; ia hiasan. Jadi tiap
 * pembanding di sini dibuktikan GAGAL lebih dulu, baru dibuktikan lulus.
 * Uji yang hanya menguji jalur bahagia akan tetap hijau ketika pemeriksanya
 * berhenti bekerja — dan itu persis kegagalan yang paling mahal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  PEMBANDING, nilaiAturan, terbitkanSertifikat, ringkas,
  turunkanUkuran, periksaSpek, muatSpek,
} from './spek.mjs';
import { bacaGLB, tulisGLB, tempelSertifikat, bacaSertifikat } from './glb.mjs';

const SPEK = JSON.parse(readFileSync(new URL('./spek/kora-3d.json', import.meta.url), 'utf8'));

/* ── Pembanding: tiap satu MERAH dulu ─────────────────────────────────── */

test('setiap pembanding bisa GAGAL, bukan hanya lulus', () => {
  assert.equal(PEMBANDING['='](10, 12, 0.5), false);
  assert.equal(PEMBANDING['='](12.3, 12, 0.5), true);

  assert.equal(PEMBANDING['<='](5, 3), false);
  assert.equal(PEMBANDING['>='](2, 3), false);
  assert.equal(PEMBANDING.antara(9, [10, 20]), false);
  assert.equal(PEMBANDING.antara(21, [10, 20]), false);
  assert.equal(PEMBANDING.antara(15, [10, 20]), true);

  assert.equal(PEMBANDING.memuat(['a', 'b'], ['a', 'b', 'c']), false);
  assert.equal(PEMBANDING.memuat(['a', 'b', 'c'], ['a', 'c']), true);

  assert.equal(PEMBANDING.subset(['a', 'z'], ['a', 'b']), false);
  assert.equal(PEMBANDING.subset(['a'], ['a', 'b']), true);

  assert.equal(PEMBANDING.benar(false), false);
  assert.equal(PEMBANDING.benar(true), true);
});

test('ukuran yang HILANG adalah kegagalan, bukan aturan yang dilewati', () => {
  // Aturan yang diam-diam tidak dijalankan adalah cara paling halus sebuah
  // pemeriksa berbohong: sertifikatnya tetap hijau dan tidak ada yang
  // memeriksa apa pun.
  const h = nilaiAturan({ kode: 'tidak_ada', pembanding: '=', nilai: 1 }, {});
  assert.equal(h.lulus, false);
  assert.match(h.pesan, /tidak ada/);
});

test('pesan kegagalan menyebut BERAPA melesetnya, bukan sekadar "gagal"', () => {
  const h = nilaiAturan(
    { kode: 'tinggi', pembanding: '=', nilai: 12, toleransi: 0.15, satuan: 'cm' },
    { tinggi: 11.2 },
  );
  assert.equal(h.lulus, false);
  assert.match(h.pesan, /11\.2/);
  assert.match(h.pesan, /-0\.8/);      // selisihnya ikut
  assert.match(h.pesan, /0\.15/);      // toleransinya ikut
});

/* ── Spek yang salah harus ditolak, bukan meloloskan aset ─────────────── */

test('spek cacat ditolak — spek salah ketik meloloskan aset diam-diam', () => {
  assert.deepEqual(periksaSpek(SPEK), [], 'spek kora-3d harus sah');

  const rusak = periksaSpek({
    nama: 'x', versi: '1',
    aturan: [
      { kode: 'a', pembanding: 'lebih_besar_dong' },
      { kode: 'b', pembanding: 'antara', nilai: 5 },
      { kode: 'c', pembanding: '=', nilai: 1, berat: 'agak_wajib' },
    ],
  });
  assert.equal(rusak.length, 3);
  assert.ok(rusak.some((g) => /lebih_besar_dong/.test(g)));
  assert.ok(rusak.some((g) => /menuntut nilai \[min, maks\]/.test(g)));
  assert.ok(rusak.some((g) => /agak_wajib/.test(g)));
});

/* ── Turunan ukuran ───────────────────────────────────────────────────── */

const UKUR_PALSU = {
  total_segitiga: 13084,
  kotak_batas: { min: [-7, -7, 0], maks: [7, 7, 12], ukuran: [14, 14, 12] },
  objek: [
    { nama: 'tempurung', tepi_tak_manifold: 0, simpul_lepas: 0, sisi_ngon: 0, skala_sudah_diterapkan: true, bahan: ['shell'] },
    { nama: 'otak', tepi_tak_manifold: 0, simpul_lepas: 0, sisi_ngon: 0, skala_sudah_diterapkan: true, bahan: ['brain'] },
    { nama: 'kubah-kaca', tepi_tak_manifold: 0, simpul_lepas: 0, sisi_ngon: 0, skala_sudah_diterapkan: true, bahan: ['glass'] },
    { nama: 'cairan', tepi_tak_manifold: 0, simpul_lepas: 0, sisi_ngon: 0, skala_sudah_diterapkan: true, bahan: ['liquid'] },
    { nama: 'wajah-soket', tepi_tak_manifold: 0, simpul_lepas: 0, sisi_ngon: 0, skala_sudah_diterapkan: true, bahan: ['face'] },
  ],
};

test('bagian dipetakan dari NAMA lewat kata kunci, bukan dicocokkan persis', () => {
  // Pipeline berbeda memberi nama berbeda untuk benda yang sama; spek tidak
  // boleh pecah karena "shell" ditulis "tempurung".
  const u = turunkanUkuran(UKUR_PALSU, { peta_bagian: SPEK.peta_bagian });
  for (const b of ['shell', 'brain', 'glass', 'liquid', 'face']) {
    assert.ok(u.bagian.includes(b), `bagian "${b}" harus terdeteksi dari nama Indonesia`);
  }
  assert.equal(u.pivot_z, 0);
  assert.equal(u.tinggi, 12);
  assert.ok(Math.abs(u.nisbah_lebar_tinggi - 14 / 12) < 1e-9);
});

/* ── Sertifikat: hijau, lalu MERAH ────────────────────────────────────── */

test('aset yang benar LULUS spek Kora', () => {
  const u = turunkanUkuran(UKUR_PALSU, { peta_bagian: SPEK.peta_bagian });
  const s = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'takora' });
  assert.equal(s.lulus, true, ringkas(s));
  assert.equal(s.gagal, 0);
  assert.equal(s.diperiksa, SPEK.aturan.length);
});

test('tiap pelanggaran MENGGAGALKAN, dan namanya disebut', () => {
  const kasus = [
    ['segitiga_total', { total_segitiga: 42000 }],
    ['tinggi', { kotak_batas: { min: [-7, -7, 0], maks: [7, 7, 20], ukuran: [14, 14, 20] } }],
    ['pivot_z', { kotak_batas: { min: [-7, -7, 3], maks: [7, 7, 15], ukuran: [14, 14, 12] } }],
  ];
  for (const [kode, timpa] of kasus) {
    const u = turunkanUkuran({ ...UKUR_PALSU, ...timpa }, { peta_bagian: SPEK.peta_bagian });
    const s = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'uji' });
    assert.equal(s.lulus, false, `pelanggaran ${kode} harus menggagalkan`);
    assert.ok(s.aturan.some((a) => a.kode === kode && !a.lulus),
      `aturan "${kode}" yang harus merah, bukan yang lain`);
  }
});

test('skala yang belum diterapkan menggagalkan, walau ukurannya benar', () => {
  const objek = UKUR_PALSU.objek.map((o, i) => (i === 0 ? { ...o, skala_sudah_diterapkan: false } : o));
  const u = turunkanUkuran({ ...UKUR_PALSU, objek }, { peta_bagian: SPEK.peta_bagian });
  const s = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'uji' });
  assert.equal(s.lulus, false);
  assert.ok(s.aturan.find((a) => a.kode === 'skala_diterapkan' && !a.lulus));
});

test('bagian yang hilang menggagalkan, dan menyebut YANG MANA', () => {
  const objek = UKUR_PALSU.objek.filter((o) => o.nama !== 'wajah-soket');
  const u = turunkanUkuran({ ...UKUR_PALSU, objek }, { peta_bagian: SPEK.peta_bagian });
  const s = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'uji' });
  const a = s.aturan.find((x) => x.kode === 'bagian');
  assert.equal(a.lulus, false);
  assert.match(a.pesan, /face/);
});

test('nisbah menangkap skala seragam yang lolos lebar & tinggi sendiri-sendiri', () => {
  // Aset yang tingginya benar tetapi lebarnya salah masih bisa lolos kalau
  // toleransinya longgar; nisbah yang menangkapnya.
  const u = turunkanUkuran({
    ...UKUR_PALSU,
    kotak_batas: { min: [-8, -8, 0], maks: [8, 8, 12], ukuran: [16, 16, 12] },
  }, { peta_bagian: SPEK.peta_bagian });
  const s = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'uji' });
  assert.ok(s.aturan.find((a) => a.kode === 'nisbah_lebar_tinggi' && !a.lulus),
    'nisbah 16/12 = 1,333 harus melanggar 1,167 ± 0,03');
});

test('peringatan DILAPORKAN tetapi tidak menggagalkan', () => {
  const objek = UKUR_PALSU.objek.map((o, i) => (i === 0 ? { ...o, tepi_tak_manifold: 17 } : o));
  const u = turunkanUkuran({ ...UKUR_PALSU, objek }, { peta_bagian: SPEK.peta_bagian });
  const s = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'uji' });
  assert.equal(s.lulus, true, 'peringatan tidak boleh jadi gerbang');
  assert.equal(s.peringatan, 1);
  assert.ok(s.aturan.find((a) => a.kode === 'tak_manifold' && !a.lulus));
});

test('ringkas() bisa dibaca orang yang tidak hadir saat pengukuran', () => {
  const u = turunkanUkuran(UKUR_PALSU, { peta_bagian: SPEK.peta_bagian });
  const t = ringkas(terbitkanSertifikat({
    spek: SPEK, ukuran: u, aset: 'takora', kernel: ['Blender 5.2.1'],
  }));
  assert.match(t, /LULUS/);
  assert.match(t, /kora-3d@1\.0/);
  assert.match(t, /segitiga_total/);
  assert.match(t, /Blender 5\.2\.1/);
});

/* ── GLB: sertifikat menempel dan bisa dibaca kembali ─────────────────── */

function glbMinimal() {
  const json = { asset: { version: '2.0', generator: 'uji' }, scenes: [{ nodes: [] }], scene: 0 };
  const bin = Buffer.from([1, 2, 3, 4, 5]);   // panjang 5: sengaja bukan kelipatan 4
  return tulisGLB({ json, bin });
}

test('GLB dirakit dengan padding yang benar — chunk kelipatan 4', () => {
  const buf = glbMinimal();
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'magic harus "glTF"');
  assert.equal(buf.readUInt32LE(8), buf.length, 'panjang di header harus sama dengan berkasnya');
  const panjangJson = buf.readUInt32LE(12);
  assert.equal(panjangJson % 4, 0, 'chunk JSON harus kelipatan 4');
  // Padding JSON WAJIB spasi; nol membuat sebagian pemuat menolaknya.
  const akhirJson = 20 + panjangJson;
  assert.equal(buf[akhirJson - 1], 0x20, 'padding JSON harus SPASI');
  const panjangBin = buf.readUInt32LE(akhirJson);
  assert.equal(panjangBin % 4, 0, 'chunk BIN harus kelipatan 4');
  assert.equal(buf[buf.length - 1], 0x00, 'padding BIN harus NOL');
});

test('sertifikat menempel di GLB dan terbaca kembali utuh', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rupa3d-glb-'));
  try {
    const jalur = path.join(dir, 'uji.glb');
    writeFileSync(jalur, glbMinimal());

    const u = turunkanUkuran(UKUR_PALSU, { peta_bagian: SPEK.peta_bagian });
    const sert = terbitkanSertifikat({ spek: SPEK, ukuran: u, aset: 'takora' });

    const { sebelum, sesudah } = tempelSertifikat(jalur, sert);
    assert.ok(sesudah > sebelum, 'berkas harus tumbuh');

    const kembali = bacaSertifikat(jalur);
    assert.equal(kembali.aset, 'takora');
    assert.equal(kembali.spek, 'kora-3d@1.0');
    assert.equal(kembali.lulus, true);
    assert.equal(kembali.aturan.length, SPEK.aturan.length);

    // Dan yang paling penting: GLB-nya masih GLB yang sah.
    const { json, bin } = bacaGLB(readFileSync(jalur));
    assert.equal(json.asset.version, '2.0');
    assert.equal(json.scene, 0);
    assert.equal(bin.length, 8, 'biner 5 bita tetap terpadding jadi 8');
    assert.deepEqual([...bin.subarray(0, 5)], [1, 2, 3, 4, 5], 'isi biner tidak boleh berubah');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('berkas yang bukan GLB ditolak dengan alasan yang menyebut sebabnya', () => {
  assert.throws(() => bacaGLB(Buffer.from('{"asset":{}}')), /bukan GLB/);
  assert.throws(() => bacaGLB(Buffer.alloc(4)), /lebih pendek/);
});

/* ── Bidang yang salah ketik: lubang yang saya buat sendiri ──────────── */

test('bidang aturan yang TIDAK DIKENAL ditolak', () => {
  /* Dua berkas spek saya sendiri ditulis dengan `bobot` alih-alih `berat`.
     Bidang `berat` lalu tidak ada, jadi tiap aturan jatuh ke bawaan `wajib`
     — dan delapan aturan yang sengaja ditulis sebagai PERINGATAN diam-diam
     jadi GERBANG KERAS.
     
     Validator versi lama tidak bisa menangkapnya: ia memvalidasi `berat`,
     dan `berat` memang tidak ada. **Salah ketik nama bidang tidak pernah
     terlihat sebagai galat; ia terlihat sebagai nilai bawaan.** */
  const cacat = periksaSpek({
    nama: 'uji', versi: '1',
    aturan: [{ kode: 'x', ukuran: 'x', pembanding: '<=', nilai: 1, bobot: 'peringatan' }],
  });
  assert.ok(cacat.some((c) => /bidang "bobot" tidak dikenal/.test(c)),
    `harus menolak: ${JSON.stringify(cacat)}`);
  assert.ok(cacat.some((c) => /maksudnya `berat`/.test(c)),
    'salah ketik yang paling mungkin harus disebut namanya');
});

test('bidang yang SAH tidak salah dituduh', () => {
  assert.deepEqual(periksaSpek({
    nama: 'uji', versi: '1',
    aturan: [{
      kode: 'x', ukuran: 'x', pembanding: 'antara', nilai: [1, 2],
      toleransi: 0.1, berat: 'peringatan', satuan: 'm',
      alasan: 'penjelasan kenapa aturannya ada', catatan: 'catatan tambahan',
    }],
  }), []);
});

test('spek nyata di repo ini semuanya BERSIH', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const berkas = readdirSync('spek').filter((f) => f.endsWith('.json'));
  assert.ok(berkas.length >= 4, 'harus ada beberapa spek');
  for (const f of berkas) {
    const s = muatSpek(path.join('spek', f), (p) => readFileSync(p, 'utf8'),
      (d, n) => path.join(path.dirname(d), n));
    assert.deepEqual(periksaSpek(s), [], `spek/${f} cacat`);
  }
});

test('bidang `ukuran` benar-benar dibaca, bukan bidang hantu', () => {
  /* `kode` adalah identitas aturan; `ukuran` adalah ukuran yang dibacanya.
     Versi lama mengabaikan `ukuran` sepenuhnya dan selalu membaca lewat
     `kode`. Selama keduanya kebetulan sama namanya itu tidak terlihat —
     dan spek tekstur saya menulisnya BERBEDA, sehingga tiap aturannya
     mencari ukuran yang tidak ada dan gagal sebagai wajib. */
  const a = { kode: 'nama_aturan', ukuran: 'nama_ukuran', pembanding: '<=', nilai: 10 };
  assert.equal(nilaiAturan(a, { nama_ukuran: 5 }).lulus, true);
  assert.equal(nilaiAturan(a, { nama_ukuran: 50 }).lulus, false);
  /* Dan pesannya menyebut KEDUANYA supaya bisa ditelusuri. */
  const hilang = nilaiAturan(a, {});
  assert.match(hilang.pesan, /nama_ukuran/);
  assert.match(hilang.pesan, /nama_aturan/);
});

test('dua aturan boleh membaca ukuran yang SAMA dengan ambang berbeda', () => {
  const spek = {
    nama: 'uji', versi: '1',
    aturan: [
      { kode: 'minimal', ukuran: 'px', pembanding: '>=', nilai: 100, berat: 'wajib' },
      { kode: 'boros', ukuran: 'px', pembanding: '<=', nilai: 2000, berat: 'peringatan' },
    ],
  };
  const s = terbitkanSertifikat({ spek, ukuran: { px: 5000 }, aset: 'x' });
  assert.equal(s.lulus, true, 'yang wajib lulus');
  assert.equal(s.peringatan, 1, 'yang peringatan menyala');
});

test('peringatan TIDAK menggagalkan, wajib menggagalkan', () => {
  const spek = {
    nama: 'uji', versi: '1',
    aturan: [
      { kode: 'w', ukuran: 'a', pembanding: '<=', nilai: 1, berat: 'peringatan' },
      { kode: 'g', ukuran: 'b', pembanding: '<=', nilai: 1, berat: 'wajib' },
    ],
  };
  const cumaPeringatan = terbitkanSertifikat({ spek, ukuran: { a: 9, b: 0 }, aset: 'x' });
  assert.equal(cumaPeringatan.lulus, true, 'peringatan bukan gerbang');
  assert.equal(cumaPeringatan.peringatan, 1);

  const wajibGagal = terbitkanSertifikat({ spek, ukuran: { a: 0, b: 9 }, aset: 'x' });
  assert.equal(wajibGagal.lulus, false);
});

/* ── `null` TIDAK BOLEH lolos aturan ────────────────────────────────────
 *
 * Ini mengunci bug yang paling mahal di berkas ini: `topologi.mjs` dan
 * `tekstur.mjs` sengaja melaporkan `null` alih-alih `0` supaya aturannya
 * MENOLAK aset yang tidak punya UV atau tidak punya tekstur. Keduanya
 * menulis komentar yang menjelaskan itu. Dan `nilaiAturan` membatalkannya
 * tanpa suara, karena `null <= 3` di JavaScript adalah `true`.
 *
 * 16 verdik "ok" palsu pada 5 dari 6 aset repo ini sebelum ditambal. */

test('null GAGAL pada tiap pembanding yang memaksanya jadi nol', () => {
  // Ketiganya lolos sebelum ditambal — `<=`, `<`, dan `=` lewat
  // Math.abs(null - 0) <= 0. Diuji satu per satu karena jalannya berbeda.
  for (const [pembanding, harap] of [['<=', 3], ['<', 5], ['=', 0], ['>=', 0]]) {
    const h = nilaiAturan({ kode: 'x', pembanding, nilai: harap }, { x: null });
    assert.equal(h.lulus, false, `null lolos "${pembanding} ${harap}"`);
    assert.match(h.pesan, /tidak terukur/, `sebabnya harus disebut untuk "${pembanding}"`);
  }
});

test('null dan undefined dibedakan — sebabnya beda, tindakannya beda', () => {
  const kosong = nilaiAturan({ kode: 'x', pembanding: '<=', nilai: 3 }, { x: null });
  const hilang = nilaiAturan({ kode: 'x', pembanding: '<=', nilai: 3 }, {});
  assert.equal(kosong.lulus, false);
  assert.equal(hilang.lulus, false);
  assert.match(kosong.pesan, /tidak terukur pada aset ini/, 'null = pengukurnya jalan, asetnya tidak punya');
  assert.match(hilang.pesan, /tidak ada/, 'undefined = pengukurnya tidak menghasilkan bidang ini');
  assert.notEqual(kosong.pesan, hilang.pesan);
});

test('nol SUNGGUHAN tetap lolos — tambalannya tidak menggagalkan semuanya', () => {
  // Tambalan yang membuat setiap angka rendah gagal akan "memperbaiki" bug
  // ini dengan cara merusak seluruh pemeriksanya.
  assert.equal(nilaiAturan({ kode: 'x', pembanding: '<=', nilai: 3 }, { x: 0 }).lulus, true);
  assert.equal(nilaiAturan({ kode: 'x', pembanding: '=', nilai: 0 }, { x: 0 }).lulus, true);
  assert.equal(nilaiAturan({ kode: 'x', pembanding: '<=', nilai: 3 }, { x: 6.04 }).lulus, false);
});

test('null menggagalkan sebagai WAJIB, bukan diam-diam jadi peringatan', () => {
  const spek = {
    nama: 'uji', versi: '1',
    aturan: [{ kode: 'a', pembanding: '<=', nilai: 3, berat: 'wajib' }],
  };
  assert.equal(terbitkanSertifikat({ spek, ukuran: { a: null }, aset: 'x' }).lulus, false);
});
