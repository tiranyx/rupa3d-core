/* D3 — fisika Rapier di panggung, dan angkanya diperiksa dulu di Node.
 *
 *   node contoh/fisika-tumpukan.mjs
 *
 * Adegan ini bukan demo. Ia panggung uji: tiap perilaku yang ditampilkan
 * sudah diperiksa terhadap mekanika dasar sebelum satu piksel dirender.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  periksaJatuhBebas, periksaPantulan, periksaDiam, periksaMassa, batasLaju,
} from '../fisika.mjs';
import {
  adeganBaru, tambahNode, aturCahaya, aturKamera, aturLingkungan, periksaAdegan,
} from '../adegan.mjs';
import { terbitkan } from '../terbit.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUANG = path.join(AKAR, '.rupa3d', 'fisika');

/* ── 1. Periksa mesinnya SEBELUM memakainya ────────────────────────── */
console.log('── mesin fisika, terhadap mekanika dasar ──');
const jatuh = await periksaJatuhBebas();
console.log(`  jatuh bebas  sim ${jatuh.simulasi}s · analitik ${jatuh.analitik}s`
  + ` · selisih ${jatuh.selisih}s · dalam 1 langkah: ${jatuh.dalam_satu_langkah}`);

for (const e of [0.3, 0.9]) {
  const p = await periksaPantulan({ e });
  console.log(`  restitusi    diminta ${e} · terukur ${p.e_terukur} · galat ${p.galat_e_persen}%`);
}
const massa = await periksaMassa({ bentuk: 'kotak', ukuran: [1, 1, 1], kerapatan: 7850 });
console.log(`  massa        ${massa.massa_rapier} kg · analitik ${massa.massa_analitik} kg`
  + ` · galat ${massa.galat_persen}%`);
const diam = await periksaDiam({ detik: 5 });
console.log(`  hanyut       ${diam.hanyut_per_jam_m} m/jam · tidur ${diam.tidur}`);
const batas = await batasLaju();
console.log(`  batas laju   ${batas.laju_maks_terukur} m/s — di atas itu DIREDAM diam-diam`);

if (!jatuh.dalam_satu_langkah) { console.error('mesin fisikanya tidak lulus'); process.exit(1); }

/* ── 2. Panggung ───────────────────────────────────────────────────── */
console.log('\n── panggung ──');
const adegan = adeganBaru('Tumpukan Jatuh');
adegan.fisika = { gravitasi: [0, -9.81, 0] };
aturLingkungan(adegan, { langit_atas: '#e9eef7', langit_bawah: '#151b25', paparan: 1.1 });

tambahNode(adegan, {
  id: 'lantai', jenis: 'kotak', nama: 'lantai', peran: 'latar',
  ukuran: [24, 0.4, 24], posisi: [0, -0.2, 0], bayangan: false,
  bahan: { warna: '#3f4753', kekasaran: 0.93 },
  fisika: { jenis: 'statis', bentuk: 'kotak', gesekan: 0.9 },
});

/* Menara 7 kotak — ujian klasik penyelesai tabrakan. Menara yang getar atau
   hanyut akan terlihat langsung, dan `periksaDiam` di atas sudah mengukur
   bahwa hanyutnya 0,05 m/jam. */
const WARNA = ['#e0685f', '#e8a34a', '#e3d264', '#7fc36b', '#5eb6d6', '#7f8fdb', '#b47fd0'];
for (let i = 0; i < 7; i++) {
  tambahNode(adegan, {
    id: `blok${i}`, jenis: 'kotak', nama: `blok ${i + 1}`,
    ukuran: [0.8, 0.8, 0.8], posisi: [0, 0.4 + i * 0.82, 0],
    putar: [0, i * 7, 0],
    bahan: { warna: WARNA[i], kekasaran: 0.55 },
    fisika: { jenis: 'dinamis', bentuk: 'kotak', kerapatan: 700, gesekan: 0.7, pantul: 0.05 },
  });
}

/* Tiga bola berkoefisien pantul berbeda — perbedaannya harus TERLIHAT,
   dan `periksaPantulan` sudah membuktikan angkanya tepat. */
for (const [i, e] of [0.1, 0.5, 0.9].entries()) {
  tambahNode(adegan, {
    id: `bola${i}`, jenis: 'bola', nama: `bola pantul e=${e}`,
    ukuran: [0.7, 0.7, 0.7], posisi: [-3 + i * 3, 5.5, 3],
    bahan: { warna: ['#8a8f98', '#c9a227', '#3fbf8f'][i], kekasaran: 0.35, logam: i === 1 ? 0.9 : 0.1 },
    fisika: { jenis: 'dinamis', bentuk: 'bola', kerapatan: 900, pantul: e, gesekan: 0.4 },
  });
}

/* Bidang miring — menguji gesekan, bukan cuma gravitasi. */
tambahNode(adegan, {
  id: 'ramp', jenis: 'kotak', nama: 'bidang miring', peran: 'latar',
  ukuran: [5, 0.25, 3], posisi: [5.5, 1.2, -2.5], putar: [0, 0, -22],
  bahan: { warna: '#6b6357', kekasaran: 0.8 },
  fisika: { jenis: 'statis', bentuk: 'kotak', gesekan: 0.35 },
});
tambahNode(adegan, {
  id: 'peluncur', jenis: 'silinder', nama: 'silinder meluncur',
  ukuran: [0.6, 1.2, 0.6], posisi: [7.0, 2.4, -2.5], putar: [90, 0, -22],
  bahan: { warna: '#d2b48c', kekasaran: 0.7 },
  fisika: { jenis: 'dinamis', bentuk: 'silinder', kerapatan: 600, gesekan: 0.3 },
});

aturCahaya(adegan, { id: 'ambien', jenis: 'lingkungan', warna: '#cddcf0', kuat: 0.55 });
aturCahaya(adegan, {
  id: 'matahari', jenis: 'arah', warna: '#fff3e2', kuat: 3.1, posisi: [6, 10, 6], bayangan: true,
});
aturCahaya(adegan, { id: 'isi', jenis: 'arah', warna: '#86aaff', kuat: 0.8, posisi: [-6, 4, -5] });
aturKamera(adegan, { posisi: [7.5, 4.5, 10], target: [1, 1.8, 0], fov: 42 });

const cacat = periksaAdegan(adegan);
console.log(`  ${adegan.node.length} node · ${adegan.node.filter((n) => n.fisika).length} berfisika`
  + ` · cacat: ${cacat.length ? cacat.join('; ') : 'tidak ada'}`);

/* ── 3. Buktikan pemeriksa "dinamis tanpa statis" menyala ───────────── */
const uji = adeganBaru('uji');
tambahNode(uji, { id: 'x', jenis: 'kotak', fisika: { jenis: 'dinamis' } });
const cacatUji = periksaAdegan(uji);
console.log(`  pemeriksa dinamis-tanpa-statis: `
  + `${cacatUji.some((c) => /jatuh selamanya/.test(c)) ? 'MENYALA' : 'DIAM (bahaya)'}`);

/* ── 4. Terbit ─────────────────────────────────────────────────────── */
for (const mandiri of [true, false]) {
  const h = terbitkan(adegan, {
    mandiri,
    keluar: path.join(RUANG, mandiri ? 'fisika.html' : 'fisika-potongan.html'),
  });
  console.log(`  halaman ${mandiri ? 'mandiri ' : 'potongan'} ${(h.bita / 1024).toFixed(0)} KB`
    + ` · timpang ${h.skala.timpang.length}`);
}
console.log(`\nsiap: ${path.relative(AKAR, path.join(RUANG, 'fisika.html'))}`);
