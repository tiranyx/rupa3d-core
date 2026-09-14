/* KULIT — mesh ber-skin, dan satu asumsi yang salah selama ini.
 *
 * ── Yang terbongkar 11 September 2026 ────────────────────────────────────
 *
 * Spesifikasi glTF menyatakan, dengan kata MUST:
 *
 *     "the transform of the skinned mesh node MUST be ignored"
 *
 * Posisi verteks mesh ber-skin ada di ruang SENDI, dan yang membawanya ke
 * ruang dunia adalah matriks sendi — bukan transform node mesh-nya. Node itu
 * boleh berisi apa saja; renderer tidak melihatnya sama sekali.
 *
 * `ukur-glb.mjs` memakai transform node untuk SEMUA mesh, termasuk yang
 * ber-skin. Terukur pada dua paket aset publik:
 *
 *                        dilaporkan       sebenarnya dirender     meleset
 *   bunny      lebar        3,3988             2,5333              34 %
 *              tinggi       3,7502             3,5516               6 %
 *   character  lebar        1,6755             0,6049             177 %
 *              tinggi       1,8572             1,8270               2 %
 *
 * TINGGINYA hampir benar di keduanya. Itu sebabnya kekeliruan ini tidak
 * pernah terlihat: ukuran yang paling sering dilihat orang adalah yang paling
 * kebetulan mendekati.
 *
 * ── Dan akibat keduanya, yang lebih dalam ────────────────────────────────
 *
 * `perbaiki.mjs` memanggang transform node ke verteks untuk membetulkan
 * `skala_diterapkan`. Pada mesh ber-skin itu MERUSAK berkasnya: transformnya
 * memang tidak pernah dipakai, dan memanggangnya membuat verteksnya 100 kali
 * lebih besar sementara sendinya tetap menerapkan transformnya sendiri.
 *
 * Gerbang pembuktian perbaikan itu MELOLOSKANNYA — karena gerbangnya
 * membandingkan kotak batas yang dihitung dengan cara yang sama salahnya.
 *
 *     Dua alat saya sendiri yang sepakat tidak membuat keduanya benar.
 *
 * Itu versi paling dalam dari pelajaran yang berulang di repo ini, dan yang
 * membongkarnya bukan pemeriksa ketiga melainkan SPESIFIKASINYA.
 */
import { readFileSync } from 'node:fs';
import { bacaGLB } from './glb.mjs';
import { petaInduk, matriksDunia, kaliMatriks as kali } from './hierarki.mjs';

const UKURAN_KOMPONEN = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const JUMLAH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function bacaAcc(json, bin, i) {
  const a = json.accessors?.[i];
  if (!a || a.bufferView == null) return null;
  const bv = json.bufferViews[a.bufferView];
  const komp = JUMLAH[a.type] ?? 1;
  const lebar = UKURAN_KOMPONEN[a.componentType];
  const stride = bv.byteStride ?? komp * lebar;
  const awal = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const keluar = a.componentType === 5126
    ? new Float32Array(a.count * komp) : new Uint32Array(a.count * komp);
  for (let n = 0; n < a.count; n++) {
    for (let j = 0; j < komp; j++) {
      const o = awal + n * stride + j * lebar;
      keluar[n * komp + j] = a.componentType === 5126 ? bin.readFloatLE(o)
        : a.componentType === 5125 ? bin.readUInt32LE(o)
          : a.componentType === 5123 ? bin.readUInt16LE(o) : bin.readUInt8(o);
    }
  }
  return keluar;
}

const titik = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/* `joints` menurut skema glTF: larik indeks node, minimal satu, dan UNIK
   (`uniqueItems: true`). Tanpa pemeriksaan ini, skin berisi 10 juta sendi
   yang semuanya node 0 menghabiskan memori sebelum satu titik pun dihitung —
   diukur 14 Sep: prosesnya mati di batas heap 512 MB. Larik unik yang tiap
   anggotanya node sah tidak mungkin lebih panjang dari jumlah node, jadi
   panjangnya diperiksa DULU, sebelum apa pun dibangun darinya. */
function periksaSendi(json, skin, b) {
  const nNode = (json.nodes ?? []).length;
  if (!skin || !Array.isArray(skin.joints) || skin.joints.length === 0) {
    throw new Error(`glTF tidak sah: node ${b.indeks} memakai skin ${b.skin} `
      + 'yang tidak ada, atau yang tidak punya sendi');
  }
  if (skin.joints.length > nNode) {
    throw new Error(`glTF tidak sah: skin ${b.skin} menyebut ${skin.joints.length} sendi, `
      + `padahal hanya ada ${nNode} node — sendi wajib unik`);
  }
  const dilihat = new Set();
  for (const j of skin.joints) {
    if (!Number.isInteger(j) || j < 0 || j >= nNode) {
      throw new Error(`glTF tidak sah: skin ${b.skin} menyebut sendi ${JSON.stringify(j)} yang bukan node`);
    }
    if (dilihat.has(j)) {
      throw new Error(`glTF tidak sah: skin ${b.skin} menyebut node ${j} dua kali — sendi wajib unik`);
    }
    dilihat.add(j);
  }
}

/** Node ber-mesh mana yang ber-skin. Dipakai untuk MENGECUALIKAN, bukan
 *  sekadar melaporkan: transform node mereka diabaikan spesifikasinya. */
export function nodeBerkulit(json) {
  const keluar = [];
  (json.nodes ?? []).forEach((n, i) => {
    if (n.mesh != null && n.skin != null) {
      keluar.push({ indeks: i, nama: n.name ?? `node${i}`, skin: n.skin, mesh: n.mesh });
    }
  });
  return keluar;
}

/**
 * Titik dunia mesh ber-skin pada POSE ISTIRAHAT.
 *
 *     posisi_dunia = SUM_i  w_i * (globalSendi_i * inverseBind_i) * posisi
 *
 * "Pose istirahat" berarti animasinya tidak dijalankan — sendinya dipakai
 * apa adanya dari hierarki node. Itu keadaan yang benar untuk mengukur
 * UKURAN aset; ukuran saat beranimasi berubah tiap bingkai dan bukan sifat
 * asetnya.
 *
 * @returns {Float32Array|null} null kalau tidak ada mesh ber-skin
 */
export function titikBerkulit(jalur) {
  const { json, bin } = bacaGLB(readFileSync(jalur));
  const berkulit = nodeBerkulit(json);
  if (!berkulit.length) return null;

  const induk = petaInduk(json);
  const global = (i) => matriksDunia(json.nodes, induk, i);

  const keluar = [];
  for (const b of berkulit) {
    const skin = json.skins?.[b.skin];
    periksaSendi(json, skin, b);
    const ibm = skin.inverseBindMatrices != null
      ? bacaAcc(json, bin, skin.inverseBindMatrices) : null;
    /* Tanpa inverseBindMatrices spesifikasi menyuruh menganggapnya identitas.
       Itu sah, dan menebak selain itu akan menghasilkan skala yang dikarang. */
    const sendi = skin.joints.map((j, k) => {
      const g = global(j);
      if (!ibm) return g;
      return kali(g, Array.from(ibm.slice(k * 16, k * 16 + 16)));
    });

    for (const p of json.meshes[b.mesh].primitives ?? []) {
      const pos = bacaAcc(json, bin, p.attributes?.POSITION);
      const jo = bacaAcc(json, bin, p.attributes?.JOINTS_0);
      const we = bacaAcc(json, bin, p.attributes?.WEIGHTS_0);
      if (!pos) continue;
      if (!jo || !we) {
        /* Node ber-skin yang primitifnya tidak punya JOINTS_0/WEIGHTS_0
           melanggar spek. Dilewati apa adanya (ruang lokal), bukan
           dihampiri dengan transform node — yang justru sedang dibuktikan
           salah di berkas ini. */
        for (let k = 0; k < pos.length; k++) keluar.push(pos[k]);
        continue;
      }
      for (let v = 0; v < pos.length / 3; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        let ox = 0, oy = 0, oz = 0, tot = 0;
        for (let k = 0; k < 4; k++) {
          const w = we[v * 4 + k];
          if (!w) continue;
          const m = sendi[jo[v * 4 + k]];
          if (!m) continue;
          const [a, bb, c] = titik(m, x, y, z);
          ox += a * w; oy += bb * w; oz += c * w; tot += w;
        }
        if (tot < 1e-6) { ox = x; oy = y; oz = z; }
        keluar.push(ox, oy, oz);
      }
    }
  }
  return Float32Array.from(keluar);
}

/** Kotak batas pose istirahat, atau `null` kalau tidak ada mesh ber-skin. */
export function kotakBerkulit(jalur) {
  const t = titikBerkulit(jalur);
  if (!t || !t.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const maks = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (t[i + k] < min[k]) min[k] = t[i + k];
      if (t[i + k] > maks[k]) maks[k] = t[i + k];
    }
  }
  const b = (v) => Number(v.toFixed(6));
  return { min: min.map(b), maks: maks.map(b), ukuran: maks.map((v, i) => b(v - min[i])) };
}
