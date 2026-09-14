/* PERAKIT — satu panggilan, satu aset bersertifikat.
 *
 * Sampai berkas ini ada, Rupa3D adalah tujuh alat bagus yang dipakai satu per
 * satu. Perakit inilah yang membuatnya satu PRODUK: ia menjalankan pipeline
 * penuh, mengumpulkan SETIAP angka yang dihasilkan tiap langkah, menilainya
 * terhadap spek, lalu menempelkan buktinya ke berkas kirimnya.
 *
 *     muat → ukur → LOD → tabrakan → bake → nilai → sertifikat → ekspor
 *
 * Yang membedakannya dari skrip build biasa: tiap langkah MENINGGALKAN ANGKA,
 * dan angka itu ikut dinilai. Sebuah pipeline yang "berhasil" tetapi
 * menghasilkan LOD yang merusak siluet atau peta bake yang kosong akan
 * GAGAL di sini — dan menyebut angkanya.
 */
import path from 'node:path';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { Blender } from './blender.mjs';
import { turunkanUkuran, terbitkanSertifikat } from './spek.mjs';
import { gabungTurunan, dariTopologi, dariTekstur } from './turunan.mjs';
import { topologiGLB } from './topologi.mjs';
import { teksturGLB } from './tekstur.mjs';
import { tempelSertifikat } from './glb.mjs';

/**
 * @param {object} o
 * @param {string} o.ruang        direktori ruang kerja Blender
 * @param {object} o.spek         spek yang sudah dibaca & divalidasi
 * @param {string} [o.berkas]     GLB/OBJ/… yang diimpor; kosong = pakai adegan yang ada
 * @param {string} o.aset         nama aset untuk sertifikat
 * @param {number[]} [o.lod]      nisbah rantai LOD; null = lewati
 * @param {string} [o.tabrakan]   bentuk proksi; null = lewati
 * @param {object[]} [o.bake]     [{rendah, tinggi, jenis, berkas, ukuran}]
 * @param {string} [o.keluar]     jalur GLB tujuan
 * @param {(pesan: string) => void} [o.lapor]
 */
export async function rakit({
  ruang, spek, berkas = null, aset = 'aset',
  lod = [0.5, 0.25, 0.1], tabrakan = 'cembung', bake = [],
  keluar = null, lapor = () => {},
}) {
  const b = new Blender({ ruang });
  const versi = await b.versi();
  const langkah = [];

  /* ── Op dijalankan BERANTAI, bukan satu per satu ─────────────────────
   *
   * Terukur: satu panggilan Blender makan 3–4,6 detik, padahal menyalakan
   * prosesnya cuma 449 ms. Sisanya muat + simpan berkas .blend yang sama,
   * berulang untuk tiap op. Pipeline delapan langkah membayar sekitar 25
   * detik ongkos murni.
   *
   * Perakit ini TIDAK bisa jadi satu rantai tunggal, dan itu bukan
   * kekurangan: pemilihan objek tabrakan bergantung pada hasil pengukuran
   * sebelumnya. Jadi ia dipecah jadi tiga rantai di batas keputusan yang
   * nyata — 8 panggilan jadi 3.
   *
   * Waktu PER-OP hilang dalam mode berantai; yang tercatat waktu per rantai.
   * Itu disebut di `langkah`, bukan disamarkan jadi angka per-op yang
   * sebenarnya tidak diukur. */
  const rantai = async (nama, ops) => {
    const daftar = ops.filter(Boolean);
    if (!daftar.length) return [];
    const t0 = Date.now();
    const r = await b.jalankanBanyak(daftar);
    const detik = Math.round((Date.now() - t0) / 100) / 10;
    const hasil = r.hasil ?? [];

    for (const h of hasil) {
      if (h._op == null) continue;
      langkah.push({
        nama: `${nama}/${h._op}`, op: h._op, rantai: nama,
        ok: h.ok !== false, galat: h.ok === false ? h.error : null,
      });
      lapor(`${h.ok === false ? 'GAGAL' : 'ok   '} ${nama}/${h._op}`);
    }
    langkah.push({ nama: `rantai ${nama}`, op: null, detik, rantai: nama, ok: r.ok !== false });
    lapor(`  rantai ${nama}: ${daftar.length} op · ${detik}s`);

    const gagal = hasil.find((h) => h.ok === false);
    if (gagal) throw new Error(`${nama}/${gagal._op ?? '?'}: ${gagal.error}`);
    return hasil;
  };

  /* ── Rantai A: siapkan adegan lalu ukur bentuknya ── */
  if (berkas && !existsSync(berkas)) throw new Error(`berkas tidak ada: ${berkas}`);
  const A = await rantai('siap', [
    berkas && { op: 'baru' },
    berkas && { op: 'muat', berkas: path.resolve(berkas) },
    { op: 'ukur' },
  ]);
  const hasilUkur = A[A.length - 1];

  /* 3-5. Turunan. Tiap satu OPSIONAL, tetapi yang dijalankan WAJIB
     meninggalkan angkanya — itu syarat supaya spek bisa menilainya. */
  let hasilLod = null;
  let hasilTabrakan = null;
  const hasilBake = [];

  let namaTerbesar = null;
  if (tabrakan) {
    /* Proksi tabrakan dibuat SESUDAH LOD dan sengaja diturunkan dari mesh
       ASLI, bukan dari LOD terakhir: proksi yang dibangun dari bentuk yang
       sudah disederhanakan mewarisi galat dua kali, dan galat kedua itu tidak
       pernah terukur karena pembandingnya sudah bukan bentuk aslinya.

       Objeknya dipilih yang TERBESAR menurut diagonal kotak batas, bukan yang
       pertama. Versi pertama memakai objek pertama — pada aset ini itu sebuah
       gelembung berdiameter 0,09 satuan, dan hasilnya aturan tabrakan lulus
       dengan mengukur benda yang salah: 26 segitiga untuk proksi sebuah
       gelembung, sementara tempurungnya tidak pernah diperiksa.

       Batas yang masih ada dan sengaja tidak disembunyikan: ini proksi untuk
       SATU objek, bukan untuk seluruh aset. Proksi gabungan menuntut
       penyatuan mesh lebih dulu, dan itu keputusan pipeline tersendiri. */
    const kandidat = (hasilUkur.objek ?? []).filter((o) => !o.nama.startsWith('TABRAK_'));
    const diagonal = (o) => Math.hypot(...(o.ukuran ?? [0, 0, 0]));
    namaTerbesar = kandidat.reduce(
      (a, o) => (a && diagonal(a) >= diagonal(o) ? a : o), null,
    )?.nama ?? null;
  }

  /* ── Rantai B: seluruh turunan, lalu ukur ULANG ──
     Ukur ulang bukan formalitas: LOD dan proksi tabrakan MENAMBAH objek ke
     adegan, dan sertifikat harus menggambarkan adegan yang benar-benar
     diekspor — bukan yang diukur sebelum semuanya dibuat. */
  const perluUkurUlang = Boolean(lod?.length || tabrakan || bake.length);
  const B = await rantai('turunan', [
    lod?.length && { op: 'lod', nisbah: lod },
    tabrakan && { op: 'tabrakan', objek: namaTerbesar, bentuk: tabrakan },
    ...bake.map((p) => ({ op: 'bake', ...p })),
    perluUkurUlang && { op: 'ukur' },
  ]);

  let i = 0;
  if (lod?.length) hasilLod = B[i++];
  if (tabrakan) {
    hasilTabrakan = B[i++];
    if (namaTerbesar) hasilTabrakan.objek_terpilih = namaTerbesar;
  }
  for (let k = 0; k < bake.length; k++) hasilBake.push(B[i++]);
  const ukurAkhir = perluUkurUlang ? B[i] : hasilUkur;

  /* 7. Nilai. Ukuran BENTUK diambil dari pengukuran AWAL — sebelum LOD dan
     proksi menambah segitiga ke adegan — karena aturan seperti
     `segitiga_total antara 10.000 dan 20.000` berbicara tentang asetnya,
     bukan tentang asetnya plus seluruh turunannya. */
  const ukuran = {
    ...turunkanUkuran(hasilUkur, { peta_bagian: spek.peta_bagian }),
    ...gabungTurunan({ lod: hasilLod, tabrakan: hasilTabrakan, bake: hasilBake }),
    segitiga_adegan_akhir: ukurAkhir.total_segitiga,
  };

  /* Sertifikat diterbitkan SESUDAH ekspor, bukan sebelum — lihat di bawah.
     Ukuran adegan dikumpulkan di sini; ukuran ARTEFAK menyusul. */

  /* 8. Ekspor + tempel bukti.
     Turunan DIBUANG dari adegan sebelum ekspor: LOD dan proksi tabrakan
     adalah berkas TERSENDIRI dalam pipeline game, bukan bagian dari mesh
     kirim. Membiarkannya ikut akan melipatgandakan ukuran GLB tanpa ada yang
     memintanya. */
  let ekspor = null;
  if (keluar) {
    mkdirSync(path.dirname(path.resolve(keluar)), { recursive: true });
    const C = await rantai('kirim', [
      {
        op: 'skrip',
        kode: `
buang = [o for o in bpy.data.objects
         if o.name.startswith("TABRAK_") or "_LOD" in o.name]
for o in buang:
    bpy.data.objects.remove(o, do_unlink=True)
keluaran["dibuang"] = len(buang)
`,
      },
      { op: 'ekspor', berkas: path.resolve(keluar) },
    ]);
    const e = C[C.length - 1];
    ekspor = { berkas: path.resolve(keluar), ...e };
  }

  /* ── Ukur ARTEFAKNYA, bukan cuma adegannya ──────────────────────────
   *
   * Sertifikat menggambarkan berkas yang ditempelinya, jadi angkanya harus
   * datang dari berkas itu. Versi pertama menerbitkan sertifikat dari
   * pengukuran ADEGAN saja, dan itu membuat satu angka menyesatkan lolos
   * bertahan: `tak_manifold` dari Blender menghitung indeks MENTAH glTF,
   * yang memecah verteks di tiap jahitan UV. Pada Takora ia melaporkan
   * 30.790; yang sebenarnya, sesudah verteksnya dilas, 360 — menggelembung
   * 85 kali.
   *
   * Sekarang topologi dan tekstur diukur DARI GLB yang baru ditulis, dan
   * kosakatanya (`topo_*`, `tex_*`) tersedia untuk spek. */
  let ukuranArtefak = {};
  if (ekspor) {
    try {
      ukuranArtefak = {
        ...dariTopologi(topologiGLB(ekspor.berkas)),
        ...dariTekstur(teksturGLB(ekspor.berkas)),
      };
    } catch (e) {
      langkah.push({ nama: 'ukur artefak', op: null, ok: false, galat: e.message });
      lapor(`GAGAL ukur artefak: ${e.message}`);
    }
  }
  Object.assign(ukuran, ukuranArtefak);

  const sertifikat = terbitkanSertifikat({
    spek, ukuran, aset, kernel: [versi ?? 'Blender'],
  });
  sertifikat.pipeline = langkah;

  if (ekspor) {
    ekspor.sertifikat = tempelSertifikat(ekspor.berkas, sertifikat);
  }

  return { sertifikat, ukuran, langkah, ekspor };
}

/** Salin berkas lalu rakit dari salinannya — berkas asal tidak pernah disentuh. */
export async function rakitSalinan(opsi) {
  if (!opsi.berkas) return rakit(opsi);
  const dir = path.join(opsi.ruang, 'masukan');
  mkdirSync(dir, { recursive: true });
  const salinan = path.join(dir, path.basename(opsi.berkas));
  copyFileSync(opsi.berkas, salinan);
  return rakit({ ...opsi, berkas: salinan });
}
