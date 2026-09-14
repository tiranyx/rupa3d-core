/* TOPOLOGI — bagaimana verteksnya TERSAMBUNG, bukan di mana letaknya.
 *
 * ── Kenapa ini celah terbesar Rupa3D ─────────────────────────────────────
 *
 * Sampai sekarang alat ini mengukur GEOMETRI: tinggi, volume, pivot, galat
 * LOD, tembus tabrakan. Semuanya tentang BENTUK. Tidak satu pun tentang
 * bagaimana bentuk itu dibangun.
 *
 * Dan justru di situ aset generatif gagal. Laporan produksi 2026 menyebut
 * retopology sebagai hambatan utama — dua sampai empat jam kerja manual per
 * aset — karena mesh yang dihasilkan tidak punya struktur yang bisa
 * dideformasi, di-UV, atau di-subdivide.
 *
 * ── Yang TIDAK bisa diukur dari GLB, dan itu bukan kekurangan alat ini ───
 *
 * **glTF selalu tersegitiga.** Quad, n-gon, dan edge loop sudah hilang
 * sebelum berkasnya ditulis. Alat mana pun yang mengklaim menilai
 * "quad-dominance" dari sebuah GLB sedang mengarang.
 *
 * Yang bisa diukur dari GLB adalah apa yang SELAMAT: manifold, lubang, arah
 * putaran, segitiga rusak, kerapatan texel, tumpang-tindih UV. Itu yang ada
 * di sini. Quad-dominance dan pola edge loop harus diukur di SUMBERNYA,
 * dan itu berkas terpisah.
 *
 * ── Jebakan yang membuat laporan tak-manifold hampir selalu palsu ────────
 *
 * glTF MEMECAH verteks di tiap jahitan UV, batas normal, dan batas material:
 * satu titik geometris jadi dua, tiga, atau enam verteks. Menghitung
 * manifold pada indeks mentah berarti setiap jahitan terlihat sebagai
 * LUBANG.
 *
 * Terukur pada Takora: alat versi lama melaporkan 30.790 tepi tak-manifold
 * dan itu praktis tidak berarti apa-apa. Di sini verteksnya DILAS menurut
 * posisi lebih dulu, dan KEDUA angkanya dilaporkan karena artinya berbeda:
 *
 *   mentah  = ongkos verteks di GPU
 *   terlas  = kesehatan geometrinya
 */
import { meshGLB } from './glb.mjs';

/* Toleransi las: relatif terhadap diagonal, bukan mutlak. Ambang mutlak
   akan melas seluruh model milimeter jadi satu titik, dan tidak melas apa
   pun pada model berskala kilometer. */
const LAS_NISBI = 1e-6;

/** Las verteks menurut posisi. Mengembalikan peta indeks lama → baru. */
export function lasPosisi(posisi, toleransi) {
  const n = posisi.length / 3;
  const peta = new Uint32Array(n);
  const ember = new Map();
  const q = Math.max(toleransi, 1e-12);
  let berikut = 0;
  const unik = [];

  for (let i = 0; i < n; i++) {
    const x = posisi[i * 3];
    const y = posisi[i * 3 + 1];
    const z = posisi[i * 3 + 2];
    const kunci = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
    const ada = ember.get(kunci);
    if (ada != null) { peta[i] = ada; continue; }
    ember.set(kunci, berikut);
    peta[i] = berikut++;
    unik.push(x, y, z);
  }
  return { peta, unik: new Float32Array(unik), jumlah: berikut };
}

const luasSegitiga = (p, a, b, c) => {
  const ux = p[b * 3] - p[a * 3];
  const uy = p[b * 3 + 1] - p[a * 3 + 1];
  const uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3];
  const vy = p[c * 3 + 1] - p[a * 3 + 1];
  const vz = p[c * 3 + 2] - p[a * 3 + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
};

/** Sudut terkecil sebuah segitiga, dalam derajat. */
function sudutMin(p, a, b, c) {
  const sisi = [[a, b], [b, c], [c, a]].map(([i, j]) => Math.hypot(
    p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1], p[i * 3 + 2] - p[j * 3 + 2]));
  const [x, y, z] = sisi;
  if (x < 1e-12 || y < 1e-12 || z < 1e-12) return 0;
  const sudut = [
    Math.acos(Math.min(1, Math.max(-1, (y * y + z * z - x * x) / (2 * y * z)))),
    Math.acos(Math.min(1, Math.max(-1, (z * z + x * x - y * y) / (2 * z * x)))),
    Math.acos(Math.min(1, Math.max(-1, (x * x + y * y - z * z) / (2 * x * y)))),
  ];
  return (Math.min(...sudut) * 180) / Math.PI;
}

function persentil(urut, p) {
  if (!urut.length) return null;
  const i = Math.min(urut.length - 1, Math.max(0, Math.round((p / 100) * (urut.length - 1))));
  return urut[i];
}

/**
 * Topologi satu primitif.
 *
 * Semua yang dilaporkan di sini EKSAK — tidak ada pencuplikan, tidak ada
 * hampiran, kecuali yang disebut sebaliknya.
 */
export function topologiPrimitif({ posisi, indeks, uv }, { toleransi }) {
  const nTri = indeks.length / 3;
  const { peta, jumlah: nUnik } = lasPosisi(posisi, toleransi);

  /* ── Segitiga rusak ──
     `degenerasi` = luas nol: tiga titik segaris atau berimpit. Ia tidak
     terlihat di layar sama sekali dan merusak normal, bake, dan boolean. */
  let degenerasi = 0;
  let lipat = 0;                 // dua verteks segitiga yang sama SETELAH dilas
  const sudut = [];
  let luasTotal = 0;

  for (let t = 0; t < nTri; t++) {
    const a = indeks[t * 3];
    const b = indeks[t * 3 + 1];
    const c = indeks[t * 3 + 2];
    const A = luasSegitiga(posisi, a, b, c);
    luasTotal += A;
    if (A < 1e-14) degenerasi++;
    const [la, lb, lc] = [peta[a], peta[b], peta[c]];
    if (la === lb || lb === lc || lc === la) lipat++;
    sudut.push(sudutMin(posisi, a, b, c));
  }
  sudut.sort((x, y) => x - y);

  /* ── Manifold, DI ATAS verteks yang sudah dilas ──
     Tepi dipakai 2 muka = sehat. 1 = batas (lubang, atau memang permukaan
     terbuka). >2 = tak-manifold: boolean, solidify, dan cetak 3D gagal. */
  const tepi = new Map();
  const arah = new Map();
  for (let t = 0; t < nTri; t++) {
    const v = [peta[indeks[t * 3]], peta[indeks[t * 3 + 1]], peta[indeks[t * 3 + 2]]];
    for (let e = 0; e < 3; e++) {
      const i = v[e];
      const j = v[(e + 1) % 3];
      if (i === j) continue;
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      tepi.set(k, (tepi.get(k) ?? 0) + 1);
      /* Arah putaran: pada mesh yang konsisten, tiap tepi dilalui sekali
         maju dan sekali mundur. Dua kali ke arah yang sama = satu segitiga
         terbalik, dan itu tampak sebagai lubang hitam di render. */
      const d = i < j ? 1 : -1;
      arah.set(k, (arah.get(k) ?? 0) + d);
    }
  }
  let batas = 0;
  let takManifold = 0;
  for (const n of tepi.values()) {
    if (n === 1) batas++;
    else if (n > 2) takManifold++;
  }
  let putaranSalah = 0;
  for (const [k, d] of arah) {
    if (tepi.get(k) === 2 && d !== 0) putaranSalah++;
  }

  /* ── UV ── */
  let uvInfo = null;
  if (uv) {
    let luasUV = 0;
    let diLuar = 0;
    const rasio = [];
    for (let t = 0; t < nTri; t++) {
      const a = indeks[t * 3];
      const b = indeks[t * 3 + 1];
      const c = indeks[t * 3 + 2];
      const A = Math.abs(
        (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1])
        - (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1])) / 2;
      luasUV += A;
      const D = luasSegitiga(posisi, a, b, c);
      if (D > 1e-12 && A > 1e-16) rasio.push(Math.sqrt(A / D));
      for (const i of [a, b, c]) {
        if (uv[i * 2] < -1e-6 || uv[i * 2] > 1 + 1e-6
          || uv[i * 2 + 1] < -1e-6 || uv[i * 2 + 1] > 1 + 1e-6) { diLuar++; break; }
      }
    }
    rasio.sort((x, y) => x - y);
    const p10 = persentil(rasio, 10);
    const p90 = persentil(rasio, 90);
    uvInfo = {
      cakupan_uv_persen: Number((luasUV * 100).toFixed(4)),
      segitiga_di_luar_0_1: diLuar,
      /* Sebaran kerapatan texel: p90/p10. Nilai 1 berarti seragam sempurna;
         di atas 3 berarti sebagian model tajam dan sebagian buram pada
         tekstur yang SAMA, dan itu tidak terlihat sampai teksturnya dipasang. */
      texel_p10: p10 == null ? null : Number(p10.toFixed(6)),
      texel_p90: p90 == null ? null : Number(p90.toFixed(6)),
      texel_sebaran: p10 && p10 > 1e-12 ? Number((p90 / p10).toFixed(3)) : null,
    };
  }

  return {
    segitiga: nTri,
    verteks_mentah: posisi.length / 3,
    verteks_terlas: nUnik,
    /* Nisbah pecah: berapa kali verteks digandakan untuk jahitan. 1 berarti
       tidak ada jahitan sama sekali; di atas 3 berarti hampir tiap verteks
       terpecah, dan itu ongkos GPU yang nyata. */
    nisbah_pecah: Number(((posisi.length / 3) / Math.max(nUnik, 1)).toFixed(3)),
    luas_permukaan: Number(luasTotal.toFixed(6)),

    segitiga_degenerasi: degenerasi,
    segitiga_lipat: lipat,
    sudut_min_terkecil: Number((sudut[0] ?? 0).toFixed(4)),
    sudut_min_p1: Number((persentil(sudut, 1) ?? 0).toFixed(4)),
    sudut_min_median: Number((persentil(sudut, 50) ?? 0).toFixed(4)),
    /* Segitiga di bawah 1° praktis adalah garis: normalnya tidak stabil,
       raycast-nya meleset, dan penyelesai fisika menghasilkan gaya liar. */
    segitiga_sliver: sudut.filter((s) => s < 1).length,

    tepi_total: tepi.size,
    tepi_batas: batas,
    tepi_tak_manifold: takManifold,
    tepi_putaran_salah: putaranSalah,
    tertutup: batas === 0 && takManifold === 0,

    uv: uvInfo,
  };
}

/**
 * Topologi seluruh GLB.
 *
 * Angka per primitif DIJUMLAHKAN, bukan dirata-rata. Rata-rata akan
 * menenggelamkan satu primitif yang rusak parah di antara tiga puluh yang
 * sehat — dan primitif yang rusak itu yang akan terlihat di layar.
 */
export function topologiGLB(jalur, { toleransi = null, tumpang = true, resolusiUV = 512 } = {}) {
  const { primitif, dilewati } = meshGLB(jalur);
  if (!primitif.length) throw new Error(`tidak ada primitif segitiga di ${jalur}`);

  /* Toleransi las diturunkan dari diagonal SELURUH berkas, bukan per
     primitif: dua primitif berdampingan harus dilas dengan ukuran yang sama,
     atau jahitan di antara keduanya jadi lubang. */
  let mn = [Infinity, Infinity, Infinity];
  let mx = [-Infinity, -Infinity, -Infinity];
  for (const p of primitif) {
    for (let i = 0; i < p.posisi.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], p.posisi[i + k]);
        mx[k] = Math.max(mx[k], p.posisi[i + k]);
      }
    }
  }
  const diagonal = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const tol = toleransi ?? diagonal * LAS_NISBI;

  const per = primitif.map((p) => {
    const t = { mesh: p.mesh, primitif: p.primitif, ...topologiPrimitif(p, { toleransi: tol }) };
    /* Tumpang-tindih diukur per PRIMITIF, bukan lintas primitif: dua mesh
       berbeda yang berbagi ruang UV hanya bertindih kalau mereka juga
       berbagi tekstur, dan itu keputusan material — bukan cacat topologi. */
    if (tumpang && p.uv) t.uv_tumpang = tumpangUV(p, { resolusi: resolusiUV });
    return t;
  });

  const jml = (k) => per.reduce((n, x) => n + (x[k] ?? 0), 0);
  const berUV = per.filter((x) => x.uv);
  const sebaran = berUV.map((x) => x.uv.texel_sebaran).filter((x) => x != null);

  return {
    berkas: jalur,
    diagonal: Number(diagonal.toFixed(6)),
    toleransi_las: Number(tol.toExponential(3)),
    primitif: per.length,
    primitif_dilewati: dilewati,

    segitiga: jml('segitiga'),
    verteks_mentah: jml('verteks_mentah'),
    verteks_terlas: jml('verteks_terlas'),
    nisbah_pecah: Number((jml('verteks_mentah') / Math.max(jml('verteks_terlas'), 1)).toFixed(3)),

    segitiga_degenerasi: jml('segitiga_degenerasi'),
    segitiga_lipat: jml('segitiga_lipat'),
    segitiga_sliver: jml('segitiga_sliver'),
    sudut_min_terkecil: Math.min(...per.map((x) => x.sudut_min_terkecil)),
    sudut_min_median_terburuk: Math.min(...per.map((x) => x.sudut_min_median)),

    tepi_batas: jml('tepi_batas'),
    tepi_tak_manifold: jml('tepi_tak_manifold'),
    tepi_putaran_salah: jml('tepi_putaran_salah'),
    primitif_tertutup: per.filter((x) => x.tertutup).length,

    uv_primitif: berUV.length,
    uv_tanpa: per.length - berUV.length,
    texel_sebaran_terburuk: sebaran.length ? Number(Math.max(...sebaran).toFixed(3)) : null,
    uv_segitiga_di_luar: berUV.reduce((n, x) => n + x.uv.segitiga_di_luar_0_1, 0),

    /* Tumpang-tindih UV: yang TERBURUK di antara primitif, bukan rata-rata.
       Satu primitif yang seluruh UV-nya bertindih akan tenggelam di antara
       tiga puluh yang bersih kalau dirata-rata — dan justru primitif itu
       yang bake-nya rusak. */
    uv_tumpang_persen_terburuk: (() => {
      const a = per.map((x) => x.uv_tumpang?.persen_dari_terpakai).filter((x) => x != null);
      return a.length ? Number(Math.max(...a).toFixed(4)) : null;
    })(),
    uv_tumpang_lapis_maks: (() => {
      const a = per.map((x) => x.uv_tumpang?.lapis_maks).filter((x) => x != null);
      return a.length ? Math.max(...a) : null;
    })(),
    uv_tumpang_resolusi: tumpang && berUV.length ? resolusiUV : null,

    /* Dikatakan, bukan disembunyikan. Alat yang diam soal batasnya membuat
       pembacanya menyimpulkan lebih banyak daripada yang sebenarnya diukur. */
    tidak_bisa_diukur_dari_glb: [
      'nisbah quad / n-gon — glTF selalu tersegitiga, informasinya sudah hilang',
      'pola edge loop — hilang bersama quad-nya',
      'kerapatan poles (valensi verteks) pada mesh quad sumbernya',
    ],
    per_primitif: per,
  };
}

/** Ringkasan sebaris untuk CLI dan MCP. */
export function ringkasTopologi(t) {
  const b = [];
  b.push(`${t.berkas.split(/[\\/]/).pop()} · ${t.primitif} primitif · ${t.segitiga} segitiga`);
  b.push(`  verteks   ${t.verteks_mentah} mentah → ${t.verteks_terlas} terlas `
    + `(pecah ${t.nisbah_pecah}×)`);
  b.push(`  manifold  ${t.tepi_tak_manifold} tak-manifold · ${t.tepi_batas} tepi batas · `
    + `${t.tepi_putaran_salah} putaran salah · ${t.primitif_tertutup}/${t.primitif} tertutup`);
  b.push(`  segitiga  ${t.segitiga_degenerasi} degenerasi · ${t.segitiga_lipat} lipat · `
    + `${t.segitiga_sliver} sliver (<1°) · sudut min terkecil ${t.sudut_min_terkecil}°`);
  b.push(`  UV        ${t.uv_primitif} ber-UV, ${t.uv_tanpa} tanpa · `
    + `sebaran texel terburuk ${t.texel_sebaran_terburuk ?? '—'} · `
    + `${t.uv_segitiga_di_luar} segitiga di luar 0–1`);
  if (t.uv_tumpang_resolusi) {
    b.push(`  tumpang   ${t.uv_tumpang_persen_terburuk}% texel terpakai · `
      + `lapis maks ${t.uv_tumpang_lapis_maks} · diukur pada ${t.uv_tumpang_resolusi}²`);
  }
  return b.join('\n');
}

/* ── Tumpang-tindih pulau UV ─────────────────────────────────────────────
 *
 * Dua segitiga yang menempati ruang UV yang sama berarti bake salah satunya
 * MENIMPA yang lain, dan lightmap-nya rusak. Ini kelas cacat yang tidak
 * terlihat sama sekali sampai teksturnya dipanggang — dan saat itu yang
 * terlihat cuma "bake-nya aneh di sebelah sini".
 *
 * ── Kenapa mencuplik di PUSAT texel ─────────────────────────────────────
 *
 * Segitiga bertetangga BERBAGI TEPI. Rasterisasi yang menghitung tiap texel
 * yang tersentuh akan menandai setiap tepi bersama sebagai tumpang-tindih —
 * dan pada mesh mana pun itu berarti ribuan temuan palsu.
 *
 * Titik pusat texel hanya bisa berada di dalam SATU segitiga, kecuali
 * segitiganya benar-benar bertindih. Jadi hitungan >1 adalah tumpang-tindih
 * sungguhan, bukan artefak rasterisasi.
 *
 * ── Yang tetap merupakan HAMPIRAN, dan disebut ──────────────────────────
 *
 * Resolusinya terbatas. Tumpang-tindih yang lebih sempit daripada satu texel
 * bisa terlewat, dan itu dilaporkan lewat `resolusi` supaya angkanya bisa
 * dibaca dengan benar. Menaikkan resolusi menaikkan ketelitian dan ongkos
 * secara kuadrat.
 *
 * ── Dan tumpang-tindih SENGAJA itu sah ──────────────────────────────────
 *
 * UV bercermin pada benda simetris, dan tekstur berulang, keduanya
 * menumpuk UV dengan sengaja dan benar. Karena itu ini PERINGATAN berikut
 * angkanya, bukan gerbang: yang memutuskan niatnya, bukan alatnya.
 */
export function tumpangUV(primitif, { resolusi = 512 } = {}) {
  const { posisi, indeks, uv } = primitif;
  if (!uv) return null;
  const R = Math.max(16, Math.min(2048, resolusi | 0));
  const hitung = new Uint16Array(R * R);
  const nTri = indeks.length / 3;
  let texelTerpakai = 0;

  for (let t = 0; t < nTri; t++) {
    const a = indeks[t * 3];
    const b = indeks[t * 3 + 1];
    const c = indeks[t * 3 + 2];
    const ax = uv[a * 2]; const ay = uv[a * 2 + 1];
    const bx = uv[b * 2]; const by = uv[b * 2 + 1];
    const cx = uv[c * 2]; const cy = uv[c * 2 + 1];

    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-14) continue;             // segitiga UV degenerasi

    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) * R));
    const x1 = Math.min(R - 1, Math.ceil(Math.max(ax, bx, cx) * R));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) * R));
    const y1 = Math.min(R - 1, Math.ceil(Math.max(ay, by, cy) * R));

    for (let y = y0; y <= y1; y++) {
      const py = (y + 0.5) / R;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) / R;
        /* Koordinat barisentrik. Ambang 0 tepat: titik di TEPI dihitung
           milik satu segitiga saja, dan itu yang membuat tepi bersama tidak
           jadi temuan palsu. */
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const i = y * R + x;
        if (hitung[i] === 0) texelTerpakai++;
        if (hitung[i] < 65535) hitung[i]++;
      }
    }
  }

  let bertindih = 0;
  let maks = 0;
  for (let i = 0; i < hitung.length; i++) {
    if (hitung[i] > 1) bertindih++;
    if (hitung[i] > maks) maks = hitung[i];
  }
  return {
    resolusi: R,
    texel_terpakai: texelTerpakai,
    texel_bertindih: bertindih,
    lapis_maks: maks,
    persen_dari_terpakai: texelTerpakai
      ? Number(((bertindih / texelTerpakai) * 100).toFixed(4)) : 0,
    cakupan_uv_persen: Number(((texelTerpakai / (R * R)) * 100).toFixed(3)),
    catatan: 'dicuplik di PUSAT texel supaya tepi bersama tidak terhitung; '
      + 'tumpang-tindih lebih sempit daripada satu texel bisa terlewat',
  };
}
