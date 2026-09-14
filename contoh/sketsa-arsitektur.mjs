/* B8 — sketsa 2D jadi bangunan dan benda putar, dengan acuan tertutup.
 *
 *   node contoh/sketsa-arsitektur.mjs
 *
 * Dua hal dibuktikan di sini, dan keduanya adalah bidang yang selama ini
 * kosong di Rupa3D:
 *
 *   ARSITEKTUR      denah (polyline) → dinding setinggi 3 m, dengan pintu
 *                   dan jendela dipotong boolean
 *   PEMODELAN MESIN profil penampang → wadah putar, diperiksa Pappus
 *
 * Tiap padat dibandingkan dengan rumus tertutup. Kalau kernelnya melenceng,
 * skrip ini berhenti — ia tidak menghasilkan berkas yang "kelihatan benar".
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bukaRuang, sketsaKe, boolean2, primitif, eksporBentuk, ukurBentuk } from '../cad-ruang.mjs';
import { luasCentroid, titikPath } from '../cad-sketsa.mjs';
import {
  adeganBaru, daftarkanAset, tambahNode, aturCahaya, aturKamera, aturLingkungan,
} from '../adegan.mjs';
import { terbitkan } from '../terbit.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUANG = path.join(AKAR, '.rupa3d', 'arsitektur');
const r = await bukaRuang(RUANG);

const angka = (x, d = 4) => Number(x).toFixed(d);

/* ── 1. DENAH → DINDING ────────────────────────────────────────────────
 *
 * Denah rumah kecil dalam METER. Dindingnya dibuat sebagai dua ekstrusi:
 * kontur luar dikurangi kontur dalam. Itu cara yang benar — mengekstrusi
 * "garis tebal" akan menghasilkan dinding yang sudutnya tidak bertemu. */

const TEBAL = 0.15;      // dinding 15 cm
const TINGGI = 3.0;      // 3 m

/* Denah huruf L: 8 x 6 m dengan takik 3 x 2,5 m di sudut kanan atas. */
const LUAR = [
  { h: 8 }, { v: 3.5 }, { h: -3 }, { v: 2.5 }, { h: -5 },
];

/* Kontur dalam = kontur luar yang diciutkan setebal dinding. Dihitung
   tangan di sini karena offset poligon yang benar butuh penanganan sudut
   dalam/luar; untuk denah ortogonal seperti ini, menggeser tiap sisi ke
   dalam sudah tepat. */
const DALAM_MULAI = [TEBAL, TEBAL];
const DALAM = [
  { h: 8 - 2 * TEBAL }, { v: 3.5 - TEBAL }, { h: -(3 - TEBAL) },
  { v: 2.5 - TEBAL }, { h: -(5 - TEBAL) },
];

console.log('── 1. denah → dinding ──');
const luasLuar = luasCentroid(titikPath([0, 0], LUAR).titik).luas;
const luasDalam = luasCentroid(titikPath(DALAM_MULAI, DALAM).titik).luas;
console.log(`   luas denah luar  ${angka(luasLuar, 4)} m²`);
console.log(`   luas denah dalam ${angka(luasDalam, 4)} m²  (lantai terpakai)`);
console.log(`   luas dinding     ${angka(luasLuar - luasDalam, 4)} m²`);

const blok = await sketsaKe(r, 'blok', 'ekstrusi',
  { jenis: 'path', mulai: [0, 0], segmen: LUAR },
  { jarak: TINGGI, bidang: 'XY' });
console.log(`   blok padat  V ${angka(blok.volume_eksak)} · acuan ${angka(blok.periksa.acuan)}`
  + ` · galat ${blok.periksa.galat_nisbi_persen}%`);

const rongga = await sketsaKe(r, 'rongga', 'ekstrusi',
  { jenis: 'path', mulai: DALAM_MULAI, segmen: DALAM },
  { jarak: TINGGI, bidang: 'XY' });
console.log(`   rongga      V ${angka(rongga.volume_eksak)} · acuan ${angka(rongga.periksa.acuan)}`
  + ` · galat ${rongga.periksa.galat_nisbi_persen}%`);

const dinding = await boolean2(r, 'potong', 'blok', 'rongga', { ke: 'dinding' });
const diharap = (luasLuar - luasDalam) * TINGGI;
console.log(`   DINDING     V ${angka(dinding.volume_eksak)} · analitik ${angka(diharap)}`
  + ` · galat ${angka(Math.abs(dinding.volume_eksak - diharap) / diharap * 100, 8)}%`);

/* ── 2. BUKAAN: pintu dan jendela ──────────────────────────────────── */
console.log('\n── 2. bukaan ──');
await primitif(r, 'pintu', {
  jenis: 'kotak', ukuran: [0.9, TEBAL * 3, 2.1], pusat: [2.5, -TEBAL, 0],
});
await primitif(r, 'jendela', {
  jenis: 'kotak', ukuran: [1.4, TEBAL * 3, 1.2], pusat: [5.6, -TEBAL, 0.9],
});
let hasil = await boolean2(r, 'potong', 'dinding', 'pintu', { ke: 'dinding' });
console.log(`   − pintu   V ${angka(hasil.volume_eksak)} (−${angka(dinding.volume_eksak - hasil.volume_eksak)})`);
const sebelumJendela = hasil.volume_eksak;
hasil = await boolean2(r, 'potong', 'dinding', 'jendela', { ke: 'dinding' });
console.log(`   − jendela V ${angka(hasil.volume_eksak)} (−${angka(sebelumJendela - hasil.volume_eksak)})`);
console.log(`   volume beton dinding: ${angka(hasil.volume_eksak, 3)} m³`);

/* ── 3. PROFIL → WADAH PUTAR ───────────────────────────────────────── */
console.log('\n── 3. profil → wadah putar (Pappus) ──');
/* Penampang dinding sebuah gelas: tebal 4 mm, tinggi 90 mm, jari dalam 30 mm.
   Seluruhnya di sisi + sumbu, jadi revolve-nya sah. */
const gelas = await sketsaKe(r, 'gelas', 'putar', {
  jenis: 'path', mulai: [30, 0],
  segmen: [{ h: 4 }, { v: 90 }, { h: -4 }],
}, { bidang: 'XZ', sumbu: [0, 0, 1] });
console.log(`   dinding gelas V ${angka(gelas.volume_eksak)} mm³`);
console.log(`   Pappus        ${angka(gelas.periksa.acuan)} · galat ${gelas.periksa.galat_nisbi_persen}%`);
console.log(`   centroid      ${gelas.periksa.centroid.map((x) => angka(x, 2)).join(', ')}`
  + ` · luas profil ${angka(gelas.periksa.luas_profil, 2)} mm²`);

/* ── 4. PUNTIR — volume tidak boleh berubah ────────────────────────── */
console.log('\n── 4. kolom berpuntir ──');
const kolom = await sketsaKe(r, 'kolom', 'ekstrusi',
  { jenis: 'polisegi', jari: 120, sisi: 6 },
  { jarak: 2400, puntir: 60, bidang: 'XY' });
console.log(`   V ${angka(kolom.volume_eksak, 1)} mm³ · sah ${kolom.sah}`
  + ` · acuan ${kolom.periksa.diperiksa ? angka(kolom.periksa.acuan) : kolom.periksa.alasan}`);

/* ── 5. Ekspor + panggung ──────────────────────────────────────────── */
console.log('\n── 5. ekspor ──');
const keluar = path.join(RUANG, 'keluar');
for (const [nama, berkas] of [['dinding', 'rumah.glb'], ['gelas', 'gelas.glb'], ['kolom', 'kolom.glb']]) {
  const e = await eksporBentuk(r, nama, path.join(keluar, berkas), { toleransi: 0.01 });
  console.log(`   ${berkas.padEnd(11)} ${(e.bita / 1024).toFixed(0).padStart(5)} KB`
    + ` · ${e.segitiga} segitiga · galat ${angka(e.galat_persen, 4)}%`);
}
await eksporBentuk(r, 'dinding', path.join(keluar, 'rumah.step'));
console.log(`   rumah.step  b-rep eksak, siap masuk CAD mana pun`);

const adegan = adeganBaru('Denah jadi Bangunan');
aturLingkungan(adegan, { langit_atas: '#eef3fb', langit_bawah: '#1a2029', paparan: 1.1 });
tambahNode(adegan, {
  id: 'tanah', jenis: 'bidang', peran: 'latar', ukuran: [40, 1, 40], bayangan: false,
  bahan: { warna: '#4d5544', kekasaran: 0.96 },
});
daftarkanAset(adegan, 'rumah', path.join(keluar, 'rumah.glb'));
tambahNode(adegan, {
  id: 'rumah', jenis: 'aset', aset: 'rumah', nama: 'Dinding dari denah',
  posisi: [-4, 0, -3], putar: [-90, 0, 0],
  bahan: { warna: '#d6cfc2', kekasaran: 0.85 },
});
daftarkanAset(adegan, 'gelas', path.join(keluar, 'gelas.glb'));
tambahNode(adegan, {
  id: 'gelas', jenis: 'aset', aset: 'gelas', nama: 'Gelas (revolve, Pappus 0,000000%)',
  posisi: [1.6, 0.5, 6.4], skala: 0.001, putar: [-90, 0, 0],
  bahan: { warna: '#9fd8e8', kekasaran: 0.1, logam: 0, bening: 0.85 },
});
daftarkanAset(adegan, 'kolom', path.join(keluar, 'kolom.glb'));
tambahNode(adegan, {
  id: 'kolom', jenis: 'aset', aset: 'kolom', nama: 'Kolom berpuntir 60°',
  posisi: [-1.4, 0, 6.2], skala: 0.001, putar: [-90, 0, 0],
  bahan: { warna: '#b8a689', kekasaran: 0.6 },
});
/* Alas untuk dua benda kecil — supaya keduanya terbaca tanpa memalsukan
   skalanya. Gelas 6 cm di sebelah rumah 8 m memang kecil; yang diubah
   komposisinya, bukan angkanya. */
tambahNode(adegan, {
  id: 'alas', jenis: 'silinder', nama: 'alas', peran: 'latar',
  ukuran: [1.1, 0.5, 1.1], posisi: [1.6, 0.25, 6.4],
  bahan: { warna: '#8d8577', kekasaran: 0.9 },
});

aturCahaya(adegan, { id: 'ambien', jenis: 'lingkungan', warna: '#cfe0f5', kuat: 0.6 });
aturCahaya(adegan, {
  id: 'matahari', jenis: 'arah', warna: '#fff2df', kuat: 3.1, posisi: [7, 10, 5], bayangan: true,
});
aturKamera(adegan, { posisi: [6.2, 4.2, 10.5], target: [0.5, 1.1, 1.5], fov: 42 });

for (const mandiri of [true, false]) {
  const h = terbitkan(adegan, {
    mandiri,
    keluar: path.join(RUANG, mandiri ? 'arsitektur.html' : 'arsitektur-potongan.html'),
  });
  console.log(`   halaman ${mandiri ? 'mandiri ' : 'potongan'} ${(h.bita / 1024).toFixed(0)} KB`);
  if (mandiri && h.skala.timpang.length) {
    for (const t of h.skala.timpang) console.log(`   TIMPANG ${t.id} ${t.lipat ?? t.lipat_latar}x`);
  }
}
console.log(`\nsiap: ${path.relative(AKAR, path.join(RUANG, 'arsitektur.html'))}`);
