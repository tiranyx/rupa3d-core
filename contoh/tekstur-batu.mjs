/* Material prosedural → peta dipanggang → GLB bertekstur → DIUKUR.
 *
 *   node contoh/tekstur-batu.mjs
 *
 * Lingkar penuh sisi tekstur, dan tiap langkah meninggalkan angka. Yang
 * paling penting di ujungnya: **piksel per meter** — satu-satunya jawaban
 * atas "apakah teksturnya cukup untuk benda ini", dan angka yang hampir
 * tidak pernah dihitung siapa pun meski kedua bahannya sudah tersedia.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blender } from '../blender.mjs';
import { teksturGLB, ringkasTekstur } from '../tekstur.mjs';
import { topologiGLB } from '../topologi.mjs';
import {
  adeganBaru, daftarkanAset, tambahNode, aturCahaya, aturKamera, aturLingkungan,
} from '../adegan.mjs';
import { terbitkan } from '../terbit.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUANG = path.join(AKAR, '.rupa3d', 'tekstur');
const b = new Blender({ ruang: RUANG });

const GAYA = process.argv[2] ?? 'batu';
const UKURAN = Number(process.argv[3] ?? 512);

console.log(`── 1. adegan + bentuk uji (gaya "${GAYA}") ──`);
await b.jalankan('baru', { satuan: 'METRIC' });
const bangun = await b.jalankan('skrip', {
  kode: `
import bmesh
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=48, ring_count=32)
bola = bpy.context.active_object
bola.name = "batu"
# Sedikit deformasi supaya bukan bola sempurna — permukaan datar sempurna
# membuat kerapatan texel seragam palsu, dan itu menyembunyikan justru hal
# yang mau diukur.
bpy.ops.object.modifier_add(type="DISPLACE")
tex = bpy.data.textures.new("d", type="CLOUDS")
tex.noise_scale = 0.35
bola.modifiers["Displace"].texture = tex
bola.modifiers["Displace"].strength = 0.18
bpy.ops.object.modifier_apply(modifier="Displace")
bpy.ops.object.shade_smooth()
keluaran["objek"] = bola.name
keluaran["verteks"] = len(bola.data.vertices)
`,
});
if (bangun.ok === false) { console.error(bangun.error); process.exit(1); }
console.log(`   ${bangun.keluaran.objek} · ${bangun.keluaran.verteks} verteks`);

console.log('\n── 2. panggang peta dari material prosedural ──');
const tex = await b.jalankan('tekstur', {
  objek: 'batu', gaya: GAYA, ukuran: UKURAN,
  jenis: ['albedo', 'kekasaran', 'normal'],
  keluar: path.join(RUANG, 'peta'), contoh: 24,
});
if (tex.ok === false) { console.error(tex.error); console.error(tex.jejak ?? ''); process.exit(1); }
for (const c of tex.catatan ?? []) console.log(`   catatan: ${c}`);
for (const p of tex.peta) {
  console.log(`   ${p.jenis.padEnd(10)} ${p.ukuran}² · ${p.ruang_warna.padEnd(9)}`
    + ` · variasi cuplik ${p.variasi_cuplik}`
    + (p.variasi_cuplik < 1e-4 ? '  ← RATA, tidak membawa informasi' : ''));
}

console.log('\n── 3. ekspor GLB bertekstur ──');
const GLB = path.join(RUANG, `batu-${GAYA}.glb`);
const eks = await b.jalankan('ekspor', { berkas: GLB, animasi: false });
if (eks.ok === false) { console.error(eks.error); process.exit(1); }
console.log(`   ${(eks.ukuran_bita / 1024).toFixed(1)} KB · ${eks.total_segitiga} segitiga`);

console.log('\n── 4. UKUR teksturnya di dalam berkasnya ──');
const t = teksturGLB(GLB);
console.log(ringkasTekstur(t));

if (t.gambar === 0) {
  console.error('\nGAGAL: GLB-nya tidak membawa satu pun tekstur.');
  console.error('Material prosedural TIDAK bisa diekspor ke glTF — ia harus');
  console.error('dipanggang lalu materialnya diganti dengan yang berbasis gambar.');
  process.exit(1);
}

console.log('\n── 5. topologi, sebagai pasangannya ──');
const topo = topologiGLB(GLB);
console.log(`   ${topo.segitiga} segitiga · ${topo.tepi_tak_manifold} tak-manifold`
  + ` · sebaran texel ${topo.texel_sebaran_terburuk}×`);

console.log('\n── 6. panggung ──');
const adegan = adeganBaru(`Tekstur ${GAYA[0].toUpperCase()}${GAYA.slice(1)}`);
aturLingkungan(adegan, { langit_atas: '#dce6f4', langit_bawah: '#141a24', paparan: 0.75 });
tambahNode(adegan, {
  id: 'lantai', jenis: 'bidang', peran: 'latar', ukuran: [14, 1, 14], bayangan: false,
  bahan: { warna: '#39414d', kekasaran: 0.95 },
});
daftarkanAset(adegan, 'batu', GLB);
/* TIDAK memberi `bahan` di node ini — bahan node MENIMPA bahan GLB, dan
   menimpanya di sini akan membuang justru tekstur yang baru dipanggang. */
tambahNode(adegan, {
  id: 'batu', jenis: 'aset', aset: 'batu', nama: `Batu bertekstur (${GAYA})`,
  posisi: [0, 0.62, 0], skala: 1.2,
});
aturCahaya(adegan, { id: 'ambien', jenis: 'lingkungan', warna: '#cbd9ee', kuat: 0.5 });
aturCahaya(adegan, {
  id: 'matahari', jenis: 'arah', warna: '#fff3e0', kuat: 2.4, posisi: [4, 6, 4], bayangan: true,
});
aturCahaya(adegan, { id: 'isi', jenis: 'arah', warna: '#7fa8ff', kuat: 0.7, posisi: [-4, 2, -4] });
aturKamera(adegan, { posisi: [1.9, 1.5, 2.4], target: [0, 0.6, 0], fov: 40 });

for (const mandiri of [true, false]) {
  const h = terbitkan(adegan, {
    mandiri, keluar: path.join(RUANG, mandiri ? 'tekstur.html' : 'tekstur-potongan.html'),
  });
  console.log(`   ${mandiri ? 'mandiri ' : 'potongan'} ${(h.bita / 1024).toFixed(0)} KB`);
}
console.log(`\nsiap: ${path.relative(AKAR, path.join(RUANG, 'tekstur.html'))}`);
