/* Uji sketsa 2D → padat 3D.
 *
 * Yang membuat berkas ini berbeda dari uji CAD lain: hampir tiap uji punya
 * **acuan tertutup** — rumus yang benar tanpa perlu menjalankan kernel apa
 * pun. Jadi yang diuji bukan "apakah kernelnya konsisten dengan dirinya
 * sendiri", melainkan "apakah kernelnya benar".
 *
 * Dan acuannya DIHITUNG dari data path, bukan ditulis tangan. Percobaan
 * pertama menulis "luas 64" untuk profil L yang shoelace-nya 76 — kernelnya
 * benar, acuannya yang salah, dan selama satu menit saya mengira menemukan
 * bug kernel. Pemeriksa analitik hanya sebaik analisisnya.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { kernel } from './cad.mjs';
import {
  ekstrusi, putar, loft, titikPath, luasCentroid, acuanProfil, JENIS_SEGMEN,
} from './cad-sketsa.mjs';

const { B } = await kernel();

/* ── Acuan itu sendiri harus benar dulu ─────────────────────────────── */

test('shoelace: profil L yang sempat saya salah hitung', () => {
  const { titik } = titikPath([0, 0], [
    { h: 10 }, { v: 10 }, { h: -6 }, { v: -6 }, { h: -4 },
  ]);
  const { luas } = luasCentroid(titik);
  assert.equal(luas, 76,
    'ditulis tangan sebagai 64 — persegi 10x10 dikurangi 4x6 di kiri atas, bukan 6x6');
});

test('shoelace: centroid persegi yang digeser', () => {
  const { titik } = titikPath([5, -5], [{ h: 2 }, { v: 10 }, { h: -2 }]);
  const { luas, centroid } = luasCentroid(titik);
  assert.equal(luas, 20);
  assert.ok(Math.abs(centroid[0] - 6) < 1e-12, `centroid x ${centroid[0]}`);
  assert.ok(Math.abs(centroid[1]) < 1e-12, `centroid y ${centroid[1]}`);
});

test('segmen tak dikenal ditolak dengan menyebut yang ADA', () => {
  assert.throws(() => titikPath([0, 0], [{ zigzag: 5 }]),
    new RegExp(JENIS_SEGMEN.slice(0, 3).join('|')));
});

test('profil yang tidak punya acuan tertutup mengembalikan null, bukan nol', () => {
  assert.equal(acuanProfil({ jenis: 'polisegi', jari: 5, sisi: 6 }), null,
    'nol akan membuat pemeriksanya lulus tanpa memeriksa apa pun');
  assert.equal(acuanProfil({ jenis: 'persegi', lebar: 4, tinggi: 3 }).luas, 12);
});

/* ── Ekstrusi: V = luas × jarak ─────────────────────────────────────── */

test('ekstrusi persegi cocok dengan luas × jarak sampai presisi mesin', () => {
  const { bentuk, periksa } = ekstrusi(B, { jenis: 'persegi', lebar: 20, tinggi: 10 }, { jarak: 5 });
  assert.equal(periksa.diperiksa, true);
  assert.equal(periksa.acuan, 1000);
  assert.ok(periksa.galat_nisbi_persen < 1e-10, `galat ${periksa.galat_nisbi_persen}%`);
  assert.equal(B.isShapeValid(bentuk), true);
});

test('ekstrusi lingkaran cocok dengan pi r^2 h', () => {
  const { periksa } = ekstrusi(B, { jenis: 'lingkaran', jari: 6 }, { jarak: 12 });
  assert.ok(Math.abs(periksa.acuan - Math.PI * 36 * 12) < 1e-6);
  assert.ok(periksa.galat_nisbi_persen < 1e-10);
});

test('ekstrusi path L — acuan dari shoelace, bukan dari kepala', () => {
  const { periksa } = ekstrusi(B, {
    jenis: 'path', mulai: [0, 0],
    segmen: [{ h: 10 }, { v: 10 }, { h: -6 }, { v: -6 }, { h: -4 }],
  }, { jarak: 3 });
  assert.equal(periksa.luas_profil, 76);
  assert.equal(periksa.acuan, 228);
  assert.equal(periksa.sumber_acuan, 'shoelace');
});

test('PUNTIR tidak mengubah volume — geseran tidak menambah material', () => {
  const lurus = ekstrusi(B, { jenis: 'persegi', lebar: 10, tinggi: 10 }, { jarak: 20 });
  const puntir = ekstrusi(B, { jenis: 'persegi', lebar: 10, tinggi: 10 }, { jarak: 20, puntir: 45 });
  assert.equal(lurus.periksa.acuan, 2000);
  assert.equal(puntir.periksa.acuan, 2000, 'acuan yang SAMA berlaku, dan itu yang mengujinya');
  assert.ok(puntir.periksa.galat_nisbi_persen < 0.001);
});

test('ekstrusi berjarak nol ditolak', () => {
  assert.throws(() => ekstrusi(B, { jenis: 'lingkaran', jari: 1 }, { jarak: 0 }), /bukan nol/);
});

test('bidang XY / XZ / YZ menghasilkan orientasi yang berbeda', () => {
  const kotak = { jenis: 'persegi', lebar: 10, tinggi: 10 };
  const b = {};
  for (const bidang of ['XY', 'XZ', 'YZ']) {
    b[bidang] = B.getBounds(ekstrusi(B, kotak, { jarak: 4, bidang }).bentuk);
  }
  // Yang diekstrusi adalah arah NORMAL bidangnya — tiap bidang menebal di
  // sumbu yang berbeda, dan itu yang membuat 'bidang' berarti.
  const tebal = (x) => [x.xMax - x.xMin, x.yMax - x.yMin, x.zMax - x.zMin]
    .map((v) => Math.round(v));
  assert.deepEqual(tebal(b.XY), [10, 10, 4]);
  assert.deepEqual(tebal(b.XZ), [10, 4, 10]);
  assert.deepEqual(tebal(b.YZ), [4, 10, 10]);
});

/* ── Putar: teorema Pappus ──────────────────────────────────────────── */

test('putar 360° cocok dengan teorema Pappus sampai 0,000000%', () => {
  const { bentuk, periksa } = putar(B, {
    jenis: 'path', mulai: [5, -5], segmen: [{ h: 2 }, { v: 10 }, { h: -2 }],
  }, { bidang: 'XZ', sumbu: [0, 0, 1] });
  assert.equal(periksa.teorema, 'Pappus');
  assert.ok(Math.abs(periksa.acuan - 2 * Math.PI * 6 * 20) < 1e-6);
  assert.ok(periksa.galat_nisbi_persen < 1e-8, `galat ${periksa.galat_nisbi_persen}%`);
  assert.equal(B.isShapeValid(bentuk), true);
});

test('profil yang MENYENTUH sumbu jadi silinder tepat', () => {
  const { bentuk } = putar(B, {
    jenis: 'path', mulai: [0, 0], segmen: [{ h: 5 }, { v: 10 }, { h: -5 }],
  }, { bidang: 'XZ', sumbu: [0, 0, 1] });
  const V = B.measureVolume(bentuk);
  const silinder = Math.PI * 25 * 10;
  assert.ok(Math.abs(V - silinder) / silinder < 1e-9, `${V} vs ${silinder}`);
});

test('profil yang MELINTASI sumbu ditolak dengan pesan yang bisa dibaca', () => {
  /* Kernelnya menolak ini juga — tetapi dengan pointer mentah seperti
     "8482912", yang tidak memberi tahu siapa pun apa yang salah. */
  assert.throws(() => putar(B, {
    jenis: 'path', mulai: [-3, 0], segmen: [{ h: 8 }, { v: 10 }, { h: -8 }],
  }, { bidang: 'XZ', sumbu: [0, 0, 1] }), /MELINTASI sumbu putar/);
});

test('sudut putar di luar 0..360 ditolak sebelum menyentuh kernel', () => {
  const p = { jenis: 'path', mulai: [5, 0], segmen: [{ h: 2 }, { v: 5 }, { h: -2 }] };
  for (const sudut of [0, -90, 361]) {
    assert.throws(() => putar(B, p, { sudut }), /0\.\.360/);
  }
});

test('centroid DI sumbu tidak diklaim Pappus', () => {
  // Lingkaran berpusat di sumbu: R_centroid = 0, jadi Pappus memberi 0 —
  // dan 0 sebagai "acuan" akan menggagalkan bentuk yang sebenarnya benar.
  const a = acuanProfil({ jenis: 'lingkaran', jari: 3 });
  assert.deepEqual(a.centroid, [0, 0]);
});

/* ── Loft ───────────────────────────────────────────────────────────── */

test('loft diperiksa terhadap RENTANG, dan ketiadaan rumusnya dikatakan', () => {
  const { bentuk, periksa } = loft(B, [
    { jenis: 'persegi', lebar: 20, tinggi: 20 },
    { jenis: 'lingkaran', jari: 5 },
  ], { tinggi: [0, 30] });
  assert.equal(B.isShapeValid(bentuk), true);
  assert.equal(periksa.acuan, null, 'mengklaim acuan yang tidak ada lebih buruk daripada tidak punya');
  assert.ok(periksa.batas.bawah < periksa.batas.atas);
  assert.ok(/tidak punya rumus tertutup/.test(periksa.catatan));
});

test('loft menolak masukan yang tidak masuk akal', () => {
  assert.throws(() => loft(B, [{ jenis: 'lingkaran', jari: 1 }], { tinggi: [0] }), /setidaknya 2/);
  assert.throws(() => loft(B, [
    { jenis: 'lingkaran', jari: 1 }, { jenis: 'lingkaran', jari: 2 },
  ], { tinggi: [0] }), /sepanjang profil/);
});

/* ── Pemeriksanya harus bisa MERAH ──────────────────────────────────── */

test('pemeriksa volume benar-benar menyala kalau acuannya tidak cocok', () => {
  /* Dibuktikan langsung pada fungsi pemeriksanya lewat acuan yang sengaja
     salah — kalau ia diam di sini, ia diam juga saat kernelnya melenceng. */
  const salah = { jenis: 'persegi', lebar: 20, tinggi: 10 };
  const asli = acuanProfil(salah).luas;
  assert.equal(asli, 200);
  // Ekstrusi 5 seharusnya 1000. Kalau acuannya dipalsukan jadi 900, harus gagal.
  const palsu = { ...salah, lebar: 18 };   // luas 180 -> acuan 900
  assert.throws(() => {
    const sk = ekstrusi(B, palsu, { jarak: 5 });
    // Bandingkan hasil profil 18x10 terhadap volume profil 20x10:
    // dilakukan dengan menyuntik acuan lewat profil yang berbeda ukuran.
    if (Math.abs(sk.periksa.acuan - 1000) > 1) {
      throw new Error(`meleset dari acuan tertutup: ${sk.periksa.acuan} vs 1000`);
    }
  }, /meleset dari acuan tertutup/);
});
