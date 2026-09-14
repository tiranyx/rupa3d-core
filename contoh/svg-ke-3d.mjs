/* Contoh terkerja: SVG → 3D → GLB, dengan pengukuran di antaranya.
 *
 *   node contoh/svg-ke-3d.mjs [berkas.svg]
 *
 * Ini jalur 2D→3D yang paling presisi yang ada di Rupa3D: ia memakai KURVA
 * vektor aslinya, bukan menebak bentuk dari piksel. Konsekuensinya ada dua,
 * dan keduanya ditunjukkan di sini alih-alih disembunyikan:
 *
 *  1. Ada DUA jenis path, dan memperlakukannya sama menghasilkan sampah.
 *     Spline TERTUTUP (ber-fill) harus di-EXTRUDE jadi lempeng padat; spline
 *     TERBUKA (ber-stroke, ikon bergaya garis) harus di-BEVEL jadi tabung.
 *     Di-extrude, garis jadi pita setipis kertas yang melayang — terukur
 *     1.074 tepi tak-manifold pada ikon ini, dan tidak terbaca sebagai apa
 *     pun. `rupa_muat` sekarang memilih sendiri berdasarkan `use_cyclic_u`.
 *  2. SVG 64×64 masuk sebagai objek ±0,0169 satuan Blender (1 px SVG =
 *     1/96 inci = 0,000265 m). Kalau spek menuntut sentimeter, skalakan —
 *     dan buktikan dengan `rupa_ukur`, jangan dikira.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blender } from '../blender.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const SVG = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(DI_SINI, 'ikon-garis.svg');

const b = new Blender({ ruang: path.join(DI_SINI, '..', '.rupa3d', 'svg') });
const langkah = async (nama, op, tugas) => {
  const r = await b.jalankan(op, tugas);
  console.log(`\n── ${nama} (${r.detik}s) ──`);
  if (r.ok === false) { console.error('GAGAL:', r.error, r.jejak?.slice(-400) ?? ''); process.exit(1); }
  return r;
};

await langkah('adegan baru', 'baru', {});

/* Tebal disebut NISBI, bukan absolut. Ikon ini stroke-width 3 pada viewBox 64,
   jadi jari-jari garisnya 1,5/64 = 2,3% dari ukuran ikon — itu angkanya. */
const masuk = await langkah('impor SVG + tebal 2,3%', 'muat', { berkas: SVG, tebal_nisbi: 0.023 });
console.log('objek masuk:', masuk.objek_baru.length, '· bentuk:', JSON.stringify(masuk.bentuk_svg));

/* Ubah kurva jadi mesh, skalakan ke tinggi 120 mm sesuai spek, dan taruh
   pivot di pusat alas. Semua lewat ANGKA, supaya bisa diperiksa. */
await langkah('kurva → mesh, skala ke spek', 'skrip', {
  kode: `
TINGGI_SASARAN = 12.0            # 120 mm, dengan 1 unit = 1 cm

bpy.ops.object.select_all(action="DESELECT")
kurva = [o for o in bpy.data.objects if o.type == "CURVE"]
for o in kurva:
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
if kurva:
    bpy.ops.object.convert(target="MESH")

mesh = [o for o in bpy.data.objects if o.type == "MESH"]
if mesh:
    # Gabung jadi satu supaya skala & pivot berlaku untuk seluruhnya.
    bpy.ops.object.select_all(action="DESELECT")
    for o in mesh:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh[0]
    if len(mesh) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = "ikon"

    # Tinggi sekarang -> faktor skala. Diukur, bukan ditebak.
    tinggi = max(obj.dimensions[1], 1e-9)
    faktor = TINGGI_SASARAN / tinggi
    obj.scale = (faktor, faktor, faktor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # SVG datar di bidang XY; didirikan supaya "depan" menghadap kamera.
    obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Pivot di pusat ALAS, sesuai spek.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.location = (0, 0, 0)
    kotak = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    obj.location = (0, 0, -min(p.z for p in kotak))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    keluaran["faktor_skala"] = round(faktor, 4)
    keluaran["tinggi_akhir_cm"] = round(obj.dimensions[2], 4)
`,
});

const ukur = await langkah('ukur', 'ukur', {});
console.log('segitiga:', ukur.total_segitiga);
console.log('ukuran (cm):', ukur.kotak_batas.ukuran);
console.log('peringatan:', ukur.peringatan.length ? ukur.peringatan : '(tidak ada)');

const lihat = await langkah('render', 'lihat', {
  sudut: ['depan', 'hero', 'kanan'], ukuran: 480, mesin: 'EEVEE', contoh: 16,
});
lihat.berkas.forEach((f) => console.log('  ', f));

const glb = path.join(DI_SINI, '..', '.rupa3d', 'svg', 'ikon.glb');
const eks = await langkah('ekspor GLB', 'ekspor', { berkas: glb });
console.log(`GLB: ${(eks.ukuran_bita / 1024).toFixed(1)} KB · ${eks.total_segitiga} segitiga`);
