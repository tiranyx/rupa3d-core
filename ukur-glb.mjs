/* UKUR sebuah GLB — seluruh kosakata bentuk, tanpa Blender.
 *
 * ── Kenapa berkas ini ada ────────────────────────────────────────────────
 *
 * Sampai hari ini `rupa_periksa` mengukur ADEGAN Blender. Akibatnya sertifikat
 * cuma bisa diterbitkan untuk sesuatu yang sedang dibuka di Blender — dan
 * pertanyaan yang paling sering ditanyakan orang justru:
 *
 *     "Ini berkas dari generator. Bagus tidak?"
 *
 * Itu pertanyaan tentang BERKAS, dan menjawabnya lewat adegan berarti
 * menyalakan Blender (4 detik), mengimpor, lalu mengukur sesuatu yang BUKAN
 * berkas itu. Repo ini sudah pernah membayar mahal untuk kekeliruan yang sama:
 * sertifikat yang diukur dari adegan lalu ditempel ke berkas ekspor membawa
 * angka `tak_manifold 30790` yang menggelembung 85x, berbulan-bulan.
 *
 *     Sertifikat menggambarkan berkas yang ditempelinya,
 *     jadi angkanya harus datang dari berkas itu.
 *
 * Di sini angkanya datang dari berkas itu. Nol kebergantungan npm, nol
 * Blender — cuma `node:fs` dan `node:zlib` lewat `glb.mjs` dan `topologi.mjs`.
 *
 * ── Satu jebakan yang membuat seluruh berkas ini bisa salah diam-diam ────
 *
 * BLENDER Z-ATAS. glTF Y-ATAS. Eksportirnya memutar (x, y, z) jadi (x, z, -y).
 *
 * Jadi `pivot_z` — tinggi dasar benda, ukuran paling sering dipakai di spek —
 * ada di sumbu KEDUA sebuah GLB, bukan ketiga. Terukur pada Takora: Blender
 * melaporkan pivot_z = -1,4514, dan di GLB-nya angka itu ada di `min[1]`.
 * `min[2]` memberi -1,4804: beda 2%, ukuran yang sama, sumbu yang salah, dan
 * tidak ada satu pun gejala.
 *
 * Karena itu sumbu atasnya DINYATAKAN, dilaporkan bersama hasilnya, dan
 * bisa ditimpa — bukan diasumsikan.
 */
import { readFileSync } from 'node:fs';
import { bacaGLB, titikGLB, meshGLB } from './glb.mjs';
import { periksaDraco } from './draco.mjs';
import { petaInduk, matriksDunia } from './hierarki.mjs';
import { nodeBerkulit, kotakBerkulit } from './kulit.mjs';
import { topologiGLB } from './topologi.mjs';

/** Indeks sumbu untuk tiap konvensi. glTF mewajibkan Y-atas; `Z` disediakan
 *  untuk berkas yang ditulis alat yang melanggar itu (dan ada). */
export const SUMBU = {
  // [lebar, dalam, tinggi] diambil dari indeks mana
  Y: { lebar: 0, dalam: 2, tinggi: 1, nama: 'Y-atas (glTF baku)' },
  Z: { lebar: 0, dalam: 1, tinggi: 2, nama: 'Z-atas (Blender)' },
};

/** Skala yang TERKANDUNG di sebuah matriks kolom-mayor 4x4: panjang tiap
 *  vektor basisnya. Rotasi tidak mengubahnya, jadi ini benar juga untuk node
 *  yang diputar — dan itu yang membedakannya dari membaca `node.scale`
 *  mentah, yang buta terhadap skala INDUKNYA. */
function skalaMatriks(m) {
  const p = (a, b, c) => Math.hypot(m[a], m[b], m[c]);
  return [p(0, 1, 2), p(4, 5, 6), p(8, 9, 10)];
}

/** Tiap node ber-mesh, berikut skala DUNIA-nya dan berapa node lain berbagi
 *  data mesh yang sama (itulah instansing). */
export function nodeMeshGLB(jalur) {
  const { json } = bacaGLB(readFileSync(jalur));
  const nodes = json.nodes ?? [];
  const induk = petaInduk(json);

  const pemakai = new Map();
  for (const n of nodes) if (n.mesh != null) pemakai.set(n.mesh, (pemakai.get(n.mesh) ?? 0) + 1);

  const keluar = [];
  nodes.forEach((n, i) => {
    if (n.mesh == null) return;
    const berkulit = n.skin != null;
    // Naik ke akar: skala induk ikut menentukan, dan node yang skalanya 1
    // tetapi induknya 40 BUKAN node yang skalanya sudah diterapkan.
    const m = matriksDunia(nodes, induk, i);
    const mesh = json.meshes?.[n.mesh] ?? {};
    const bahan = [...new Set((mesh.primitives ?? [])
      .map((pr) => (pr.material != null ? json.materials?.[pr.material]?.name : null))
      .filter(Boolean))];
    keluar.push({
      indeks: i,
      nama: n.name ?? mesh.name ?? `node${i}`,
      mesh_indeks: n.mesh,
      mesh_nama: mesh.name ?? null,
      skala_dunia: skalaMatriks(m).map((v) => Number(v.toFixed(6))),
      pemakai_data: pemakai.get(n.mesh) ?? 1,
      berkulit,
      bahan,
      primitif: (mesh.primitives ?? []).length,
    });
  });
  return keluar;
}

/**
 * Seluruh kosakata bentuk sebuah GLB — sebangun dengan `turunkanUkuran()`,
 * supaya spek yang sudah ada berlaku tanpa diubah satu baris pun.
 *
 * @param {string} jalur
 * @param {{ sumbu_atas?: 'Y'|'Z', peta_bagian?: object, toleransi_skala?: number }} opsi
 */
export function ukurGLB(jalur, opsi = {}) {
  const kunci = (opsi.sumbu_atas ?? 'Y').toUpperCase();
  const sumbu = SUMBU[kunci];
  if (!sumbu) {
    throw new Error(`sumbu_atas tidak dikenal: ${opsi.sumbu_atas}. `
      + `Yang ada: ${Object.keys(SUMBU).join(', ')}`);
  }
  const tolSkala = opsi.toleransi_skala ?? 1e-4;

  const node = nodeMeshGLB(jalur);
  const topo = topologiGLB(jalur);

  /* VERTEKS LEPAS: posisi yang ada di accessor tetapi TIDAK PERNAH dirujuk
     satu indeks pun.
     Godaannya melaporkan 0 di sini dengan alasan "glTF tidak mengangkut
     verteks tanpa muka". Itu tidak benar — accessor POSITION boleh berisi
     lebih banyak verteks daripada yang dipakai indeksnya, dan sisanya
     dibayar penuh di VRAM sambil tidak menggambar apa-apa. Melaporkan 0
     akan meloloskan aturan `simpul_lepas = 0` tanpa satu pun pengukuran. */
  let lepas = 0;
  for (const pr of meshGLB(jalur).primitif) {
    if (!pr.berindeks) continue;
    const n = pr.posisi.length / 3;
    const dipakai = new Uint8Array(n);
    for (const i of pr.indeks) dipakai[i] = 1;
    for (let i = 0; i < n; i++) if (!dipakai[i]) lepas++;
  }

  const berkulitAwal = node.filter((n) => n.berkulit);

  /* ── KOTAK BATAS MESH BER-SKIN ────────────────────────────────────────
   *
   * Spesifikasi glTF: "the transform of the skinned mesh node MUST be
   * ignored". Posisi verteksnya ada di ruang SENDI, dan yang membawanya ke
   * dunia adalah matriks sendi — bukan transform node-nya.
   *
   * Memakai transform node untuk mesh ber-skin memberi angka yang meleset
   * sampai 177 % pada aset sungguhan (character: lebar 1,6755 dilaporkan vs
   * 0,6049 sebenarnya), sementara TINGGINYA hampir benar — dan itu sebabnya
   * kekeliruan ini tidak pernah terlihat.
   *
   * Kalau ADA mesh ber-skin, kotaknya dihitung dari POSE ISTIRAHAT lewat
   * `kulit.mjs`, dan itu yang dipakai. */
  const kotakKulit = berkulitAwal.length ? kotakBerkulit(jalur) : null;

  /* Kotak batas dari titik DUNIA, bukan dari accessor min/max.
     Accessor menyimpan kotak batas dalam ruang LOKAL mesh; aset yang menyimpan
     skala di node-nya akan terbaca seukuran benda yang salah — dan itu persis
     cacat yang membuat flange 140 mm terbit sebagai benda 140 meter. */
  const titik = titikGLB(jalur);
  let min = null; let maks = null;
  if (titik.length >= 3) {
    min = [Infinity, Infinity, Infinity];
    maks = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < titik.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (titik[i + k] < min[k]) min[k] = titik[i + k];
        if (titik[i + k] > maks[k]) maks[k] = titik[i + k];
      }
    }
  }
  const bulat = (v) => Number(v.toFixed(6));
  const ukuran3 = min ? maks.map((v, i) => bulat(v - min[i])) : [0, 0, 0];

  /* Gabungan: mesh biasa lewat transform node, mesh ber-skin lewat sendinya.
     Aset campuran (karakter ber-skin + properti kaku) sering, dan mengambil
     salah satunya saja akan memotong sebagian bendanya. */
  let minPakai = min; let maksPakai = maks;
  if (kotakKulit) {
    const kaku = node.some((n) => !n.berkulit);
    minPakai = kaku && min
      ? min.map((v, i) => Math.min(v, kotakKulit.min[i])) : kotakKulit.min;
    maksPakai = kaku && maks
      ? maks.map((v, i) => Math.max(v, kotakKulit.maks[i])) : kotakKulit.maks;
  }
  const ukuranPakai = minPakai ? maksPakai.map((v, i) => bulat(v - minPakai[i])) : [0, 0, 0];

  const lebar = ukuranPakai[sumbu.lebar];
  const dalam = ukuranPakai[sumbu.dalam];
  const tinggi = ukuranPakai[sumbu.tinggi];

  const tunggal = node.filter((n) => n.pemakai_data <= 1);
  const instans = node.filter((n) => n.pemakai_data > 1);
  const berkulit = node.filter((n) => n.berkulit);

  const u = {
    segitiga_total: topo.segitiga,
    objek_mesh: node.length,
    lebar,
    dalam,
    tinggi,
    /* Dinamai `pivot_z` karena spek yang sudah ada memakainya, dan spek tidak
       boleh pecah gara-gara berkasnya dibaca dari sisi lain. Tetapi di GLB ia
       diambil dari sumbu ATAS, yang menurut spesifikasi glTF adalah Y. Sumbu
       yang dipakai dilaporkan di `sumbu_atas` di bawah — angka tanpa
       sumbunya adalah angka yang bisa dibaca salah tanpa terlihat salah. */
    pivot_z: minPakai ? bulat(minPakai[sumbu.tinggi]) : 0,
    nisbah_lebar_tinggi: tinggi ? Number((lebar / tinggi).toFixed(6)) : 0,

    tak_manifold: topo.tepi_tak_manifold,
    simpul_lepas: lepas,

    /* n-gon TIDAK BISA diukur dari GLB, dan `0` akan meloloskan aturan
       `ngon <= 0` pada berkas apa pun — memberi kesan sumbernya bersih
       padahal pertanyaannya tidak pernah dijawab. `null` MENGGAGALKAN
       aturannya, dan itu yang benar: yang mau tahu n-gon sumbernya harus
       memakai `rupa_topologi_sumber`. */
    ngon: null,

    /* Skala DUNIA, bukan `node.scale`. Node berskala 1 di bawah induk
       berskala 40 tetap membawa skala yang belum diterapkan. */
    /* Objek INSTANS dan objek BER-SKIN sama-sama dikecualikan, dengan alasan
       yang berbeda:
         instans   menerapkan skalanya akan MEMECAH instansing
         ber-skin  transform node-nya memang TIDAK PERNAH dipakai renderer,
                   jadi menyebutnya "skala belum diterapkan" adalah temuan
                   PALSU — dan memperbaikinya akan merusak asetnya
       Terukur: keempat model buatan manusia yang gagal aturan ini pada uji
       11 spesimen (10 Sep) SELURUHNYA ber-skin. Empat dari empat temuan itu
       palsu. */
    skala_diterapkan: tunggal.filter((n) => !n.berkulit).every((n) =>
      n.skala_dunia.every((s) => Math.abs(s - 1) <= tolSkala)),
    objek_berkulit: berkulit.length,
    objek_instans: instans.length,
    objek_tunggal: tunggal.length,
    nama_objek: node.map((n) => n.nama),
    bahan: [...new Set(node.flatMap((n) => n.bahan))],
  };

  if (opsi.peta_bagian) {
    const ada = new Set();
    for (const nama of u.nama_objek) {
      const rendah = nama.toLowerCase();
      for (const [bagian, kata] of Object.entries(opsi.peta_bagian)) {
        if (kata.some((k) => rendah.includes(k))) ada.add(bagian);
      }
    }
    u.bagian = [...ada];
  }

  /* Status Draco IKUT DILAPORKAN, dan itu bukan hiasan.
     Draco lossy: terukur pada bola 2.208 segitiga yang diekspor dua kali dari
     adegan yang SAMA, verteksnya bergeser sampai 9,4e-5 (0,0027 % diagonal)
     dan sudut minimumnya berubah 7,3604 -> 7,3215 derajat. Topologinya
     identik, geometrinya tidak.
     Sertifikat atas berkas Draco karena itu menggambarkan versi TERKUANTISASI
     dari asetnya, dan pembacanya berhak tahu itu tanpa harus bertanya. */
  const draco = periksaDraco(bacaGLB(readFileSync(jalur)).json);

  return {
    ...u,
    draco: draco.dipakai,
    draco_primitif: draco.dipakai ? draco.primitif : 0,
    draco_catatan: draco.dipakai
      ? `${draco.catatan}. Draco memampatkan dengan KUANTISASI: topologinya `
        + 'utuh, tetapi posisi verteksnya bergeser. Angka geometris di bawah '
        + 'menggambarkan berkas ini apa adanya, bukan aset sebelum dimampatkan.'
      : null,
    sumbu_atas: kunci,
    sumbu_catatan: sumbu.nama,
    kotak_batas: minPakai
      ? { min: minPakai.map(bulat), maks: maksPakai.map(bulat), ukuran: ukuranPakai } : null,
    kotak_dari: kotakKulit
      ? (node.some((n) => !n.berkulit) ? 'sendi + transform node' : 'sendi (pose istirahat)')
      : 'transform node',
    kotak_transform_node: min ? { ukuran: ukuran3 } : null,
    diukur_dari: 'berkas',
    tidak_bisa_diukur_dari_glb: [
      'nisbah quad / n-gon (`ngon` dilaporkan null)',
      'pola edge loop dan valensi verteks',
      'jumlah quad/segitiga di mesh SUMBER — pakai `rupa_topologi_sumber`',
    ],
  };
}
