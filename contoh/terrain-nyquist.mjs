/* Sapuan resolusi terrain — membuktikan Nyquist, bukan menyebutnya.
 *
 *   node contoh/terrain-nyquist.mjs
 *
 * Sumbernya prosedural dengan sengaja: h(u,v) bisa dievaluasi di titik MANA
 * PUN dengan ketepatan mesin, jadi galat yang terukur benar-benar galat
 * MESH-nya — bukan galat penafsiran sebuah peta yang sendirinya sudah
 * hampiran.
 *
 * Yang dicari: apakah galat benar-benar meledak saat petaknya lebih renggang
 * daripada setengah gelombang terpendek sumbernya. Kalau kurvanya mulus dan
 * tidak berpatah di sana, teori saya salah dan angkanya yang benar.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blender } from '../blender.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = new Blender({ ruang: path.join(AKAR, '.rupa3d', 'terrain') });

/* frekuensi 4, oktaf 4  ->  oktaf terakhir 4 x 2^3 = 32 siklus per lebar.
   Satu gelombang = 1/32 lebar. Nyquist menuntut petak <= setengahnya,
   yaitu >= 64 petak. Angka itu dihitung, bukan dipilih. */
const SUMBER = { benih: 3, oktaf: 4, frekuensi: 4.0, persistensi: 0.5 };
const PETAK = [8, 16, 32, 48, 64, 96, 128, 256, 512];

console.log(`sumber: oktaf ${SUMBER.oktaf} · frekuensi ${SUMBER.frekuensi}`);
console.log('wilayah 200×200 m · tinggi 40 m\n');

await b.jalankan('baru', { satuan: 'METRIC' });

const baris = [];
for (const petak of PETAK) {
  const h = await b.jalankan('terrain', {
    nama: 'T', petak, ukuran: [200, 200], tinggi: 40,
    sumber: 'prosedural', ...SUMBER, contoh_uji: 8000,
  });
  if (h.ok === false) { console.error('GAGAL', h.error); process.exit(1); }
  baris.push(h);
}

const n = baris[0].nyquist;
console.log(`gelombang terpendek : ${n.gelombang_terpendek_dunia} m`);
console.log(`petak minimum       : ${n.petak_minimum}  (Nyquist)\n`);

console.log('petak   m/petak  segitiga   galat maks   galat rata   puncak hilang   Nyq');
console.log('─'.repeat(80));
for (const h of baris) {
  const g = h.galat_antar_simpul;
  console.log(
    String(h.petak).padStart(5)
    + (h.nyquist.petak_dunia).toFixed(2).padStart(9)
    + String(h.segitiga).padStart(11)
    + (g.maks_persen_jangkauan.toFixed(2) + '%').padStart(13)
    + (g.rata_persen_jangkauan.toFixed(2) + '%').padStart(13)
    + (h.puncak.hilang_persen.toFixed(2) + '%').padStart(16)
    + (h.nyquist.cukup ? '   ok' : '   ✗'));
}

console.log('\n── di mana kurvanya berpatah ──');
for (let i = 1; i < baris.length; i++) {
  const a = baris[i - 1].galat_antar_simpul.maks_persen_jangkauan;
  const c = baris[i].galat_antar_simpul.maks_persen_jangkauan;
  const lipat = a / Math.max(c, 1e-9);
  console.log(`  ${String(baris[i - 1].petak).padStart(3)} → ${String(baris[i].petak).padEnd(3)}`
    + `  galat maks turun ${lipat.toFixed(2)}×`
    + (baris[i].nyquist.cukup && !baris[i - 1].nyquist.cukup ? '   ← garis Nyquist dilewati di sini' : ''));
}

console.log('\n── galat DI simpul, sebagai pembanding ──');
console.log('  Angka ini ~0 di setiap resolusi, termasuk yang paling renggang.');
for (const h of baris) {
  console.log(`  petak ${String(h.petak).padStart(3)}  di simpul ${h.galat_di_simpul.maks.toExponential(2)}`
    + `   antar simpul ${h.galat_antar_simpul.maks.toFixed(4)} m`);
}
console.log('\n  Kalau pemeriksanya mengambil contoh di simpul, SEMUA baris di atas');
console.log('  lulus sempurna — termasuk petak 8, yang kehilangan puncaknya.');
