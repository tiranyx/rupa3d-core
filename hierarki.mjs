/* Hierarki node glTF: matriks lokal, perkaliannya, dan jalan ke akar.
 * SATU tempat, dan kali ini dengan penjaga.
 *
 * ── Kenapa modul ini ada ─────────────────────────────────────────────────
 *
 * Sampai 14 September 2026 jalan-ke-induk ini ditulis LIMA kali (glb.mjs dua
 * kali, kulit.mjs, perbaiki.mjs, ukur-glb.mjs), dan `matriksNode` serta
 * perkalian matriksnya empat kali — tanpa satu pun penjaga siklus:
 *
 *     while (p != null) { m = kali(matriksNode(nodes[p]), m); p = induk.get(p); }
 *
 * GLB 200 bita yang node-nya menjadi anak dirinya sendiri membuat loop itu
 * berputar SELAMANYA. Diukur di empat pembaca (ukurGLB, topologiGLB,
 * titikGLB, perbaikiGLB): keempatnya menggantung sampai dibunuh. Validator
 * Khronos menolak berkas yang sama dalam 24 ms.
 *
 * Spesifikasi glTF 2.0 tegas: hierarki node MUST berupa kumpulan pohon yang
 * saling lepas — tanpa siklus, dan tiap node punya NOL atau SATU induk.
 * `petaInduk` menegakkan itu sekali, sebelum siapa pun berjalan ke akar, dan
 * menolak dengan menyebut node mana dan kenapa.
 *
 * ── Yang SENGAJA tidak berubah ───────────────────────────────────────────
 *
 * Urutan perkaliannya sama persis dengan kelima salinan lama: mulai dari
 * matriks lokal node, lalu dikalikan induk demi induk dari KIRI. Perkalian
 * matriks asosiatif di atas kertas, tidak di floating point; menyimpan hasil
 * induk (memoisasi) akan menggeser digit terakhir sertifikat yang sudah
 * terbit. Jadi tidak dimemoisasi — dan biayanya O(kedalaman) per node,
 * sama seperti sebelumnya.
 */

/** Matriks lokal 4×4 kolom-mayor dari `matrix`, atau dari TRS. */
export function matriksNode(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** a × b, keduanya 4×4 kolom-mayor. Urutan penjumlahannya identik dengan
 *  salinan-salinan lama, jadi hasilnya identik bit demi bit. */
export function kaliMatriks(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

/**
 * Peta anak → induk, SESUDAH memastikan hierarkinya pohon yang sah.
 *
 * Melempar, dengan menyebut node-nya, kalau:
 *   - `children` bukan larik, atau berisi indeks yang bukan node;
 *   - satu node disebut sebagai anak oleh DUA induk (atau dua kali);
 *   - ada siklus, termasuk node yang menjadi anak dirinya sendiri.
 *
 * Linear terhadap jumlah node: tiap node ditandai sekali saat jalannya ke
 * akar selesai diperiksa, jadi rantai 100.000 node tidak diperiksa ulang
 * 100.000 kali.
 */
export function petaInduk(json) {
  const nodes = json.nodes ?? [];
  const induk = new Map();
  nodes.forEach((n, i) => {
    if (n.children == null) return;
    if (!Array.isArray(n.children)) {
      throw new Error(`glTF tidak sah: node ${i} punya "children" yang bukan larik`);
    }
    for (const c of n.children) {
      if (!Number.isInteger(c) || c < 0 || c >= nodes.length) {
        throw new Error(`glTF tidak sah: node ${i} menyebut anak ${JSON.stringify(c)}, `
          + `padahal hanya ada ${nodes.length} node`);
      }
      if (induk.has(c)) {
        throw new Error(`glTF tidak sah: node ${c} punya lebih dari satu induk `
          + `(${induk.get(c)} dan ${i}) — spesifikasi mengizinkan paling banyak satu`);
      }
      induk.set(c, i);
    }
  });

  // 0 = belum, 1 = sedang di jalan ini, 2 = jalannya ke akar sudah sah.
  const tanda = new Uint8Array(nodes.length);
  for (let awal = 0; awal < nodes.length; awal++) {
    if (tanda[awal]) continue;
    const jalan = [];
    let p = awal;
    while (p != null && tanda[p] === 0) {
      tanda[p] = 1;
      jalan.push(p);
      p = induk.get(p);
    }
    if (p != null && tanda[p] === 1) {
      const siklus = jalan.slice(jalan.indexOf(p)).concat(p).join(' → ');
      throw new Error(`glTF tidak sah: hierarki node bersiklus (${siklus}) — `
        + 'spesifikasi mewajibkan pohon, dan jalan ke akarnya tidak akan pernah selesai');
    }
    for (const q of jalan) tanda[q] = 2;
  }
  return induk;
}

/** Matriks dunia node `i`. `induk` HARUS dari `petaInduk`, yang sudah
 *  menjamin jalannya berakhir; batas langkahnya cuma sabuk pengaman kalau
 *  suatu hari ada yang membangun peta sendiri. */
export function matriksDunia(nodes, induk, i) {
  let m = matriksNode(nodes[i]);
  let p = induk.get(i);
  let langkah = 0;
  while (p != null) {
    if (++langkah > nodes.length) {
      throw new Error(`jalan ke akar dari node ${i} melebihi jumlah node — peta induknya bersiklus`);
    }
    m = kaliMatriks(matriksNode(nodes[p]), m);
    p = induk.get(p);
  }
  return m;
}
