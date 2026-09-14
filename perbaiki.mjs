/* PERBAIKI — dan buktikan perbaikannya tidak merusak apa pun.
 *
 * ── Kenapa berkas ini ada ────────────────────────────────────────────────
 *
 * Sebelas model dari luar diperiksa 10 September. Empat dari empat model
 * buatan manusia gagal `skala_diterapkan`, dan satu punya empat verteks
 * lepas. Rupa3D bisa MENYEBUTKAN keduanya dengan angka — dan tidak bisa
 * membetulkan satu pun.
 *
 * Alat yang mendiagnosis tanpa bisa mengobati baru setengah alat.
 *
 * ── Yang membuat perbaikan boleh dipercaya ───────────────────────────────
 *
 * Bukan bahwa cacatnya hilang. Cacat apa pun bisa dihilangkan dengan merusak
 * asetnya — hapus semua verteksnya, dan `tak_manifold` jadi nol.
 *
 * Yang membuatnya boleh dipercaya adalah pembuktian bahwa **yang lain tidak
 * berubah**: kotak batas dunia, jumlah segitiga, dan seluruh ukuran topologi
 * harus SAMA sesudahnya. Perbaikan yang mengubah bentuknya bukan perbaikan.
 *
 * `perbaikiGLB()` mengukur sebelum, memperbaiki, mengukur sesudah, dan
 * MENOLAK menulis hasilnya kalau pembuktian itu gagal.
 */
import { readFileSync } from 'node:fs';
import { bacaGLB, tulisGLB } from './glb.mjs';
import { EKSTENSI as DRACO } from './draco.mjs';
import { petaInduk, matriksDunia } from './hierarki.mjs';

const UKURAN_KOMPONEN = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const JUMLAH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const LARIK = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};

const identitas = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);

function terapkanTitik(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Invers-transpos 3x3 dari matriks 4x4 kolom-mayor.
 *
 *  Normal TIDAK boleh diputar dengan matriks yang sama seperti posisi. Pada
 *  skala tak seragam, mengalikan normal dengan matriksnya membuat normalnya
 *  MIRING terhadap permukaannya — bayangannya salah, dan tidak ada galat.
 *  Yang benar invers-transposnya. */
function normalMatriks(m) {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = a;
  const det = a0 * (a4 * a8 - a5 * a7) - a3 * (a1 * a8 - a2 * a7) + a6 * (a1 * a5 - a2 * a4);
  if (Math.abs(det) < 1e-20) return null;
  const inv = [
    (a4 * a8 - a5 * a7), (a2 * a7 - a1 * a8), (a1 * a5 - a2 * a4),
    (a5 * a6 - a3 * a8), (a0 * a8 - a2 * a6), (a2 * a3 - a0 * a5),
    (a3 * a7 - a4 * a6), (a1 * a6 - a0 * a7), (a0 * a4 - a1 * a3),
  ].map((v) => v / det);
  // transpos
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}

/** Baca satu accessor jadi larik biasa (tanpa stride yang aneh-aneh). */
function bacaAcc(json, bin, i) {
  const acc = json.accessors[i];
  if (!acc || acc.bufferView == null) return null;
  const bv = json.bufferViews[acc.bufferView];
  const komp = JUMLAH[acc.type] ?? 1;
  const lebar = UKURAN_KOMPONEN[acc.componentType];
  const stride = bv.byteStride ?? komp * lebar;
  const awal = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const Larik = LARIK[acc.componentType];
  const keluar = new Larik(acc.count * komp);
  for (let k = 0; k < acc.count; k++) {
    const o = awal + k * stride;
    for (let j = 0; j < komp; j++) {
      keluar[k * komp + j] = acc.componentType === 5126
        ? bin.readFloatLE(o + j * 4)
        : acc.componentType === 5125 ? bin.readUInt32LE(o + j * 4)
          : acc.componentType === 5123 ? bin.readUInt16LE(o + j * 2)
            : acc.componentType === 5122 ? bin.readInt16LE(o + j * 2)
              : acc.componentType === 5121 ? bin.readUInt8(o + j)
                : bin.readInt8(o + j);
    }
  }
  return keluar;
}

/**
 * Susun ulang seluruh berkas dari accessor yang sudah dibaca.
 *
 * Menulis ULANG semuanya, bukan menambal di tempat. Menambal buffer di tempat
 * menuntut tiap offset dan stride tetap sah sesudahnya, dan satu offset yang
 * meleset menghasilkan berkas yang lolos di satu pemuat dan ditolak di
 * pemuat lain — jenis kerusakan yang paling mahal dilacak.
 */
function tulisUlang(json, isi) {
  const potong = [];
  const bufferViews = [];
  let ofs = 0;
  const accessors = json.accessors.map((acc, i) => {
    const data = isi.get(i);
    if (!data) return { ...acc };   // accessor tanpa bufferView (Draco) dibiarkan
    const Larik = LARIK[acc.componentType];
    const larik = data instanceof Larik ? data : Larik.from(data);
    const buf = Buffer.from(larik.buffer, larik.byteOffset, larik.byteLength);
    const isiPad = (4 - (buf.length % 4)) % 4;
    potong.push(buf);
    if (isiPad) potong.push(Buffer.alloc(isiPad));
    const bvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0, byteOffset: ofs, byteLength: buf.length,
      ...(acc.componentType === 5123 || acc.componentType === 5125
        ? {} : {}),
    });
    ofs += buf.length + isiPad;
    const komp = JUMLAH[acc.type] ?? 1;
    const baru = { ...acc, bufferView: bvIdx, count: larik.length / komp };
    delete baru.byteOffset;
    if (acc.min || acc.max) {
      const mn = new Array(komp).fill(Infinity);
      const mx = new Array(komp).fill(-Infinity);
      for (let k = 0; k < baru.count; k++) {
        for (let j = 0; j < komp; j++) {
          const v = larik[k * komp + j];
          if (v < mn[j]) mn[j] = v;
          if (v > mx[j]) mx[j] = v;
        }
      }
      /* min/max WAJIB diperbarui. Membiarkannya membuat kotak batas berkas
         menggambarkan geometri yang sudah tidak ada — dan itu justru angka
         yang dipakai pemuat untuk memutuskan frustum culling dan skala
         adegan. Terukur di repo ini: `kotakBatasGLB` membaca min/max, dan ia
         satu-satunya pembaca yang menjawab "benar" pada berkas Draco. */
      baru.min = mn; baru.max = mx;
    }
    return baru;
  });

  const bin = Buffer.concat(potong);
  return {
    json: { ...json, accessors, bufferViews, buffers: [{ byteLength: bin.length }] },
    bin,
  };
}

/**
 * Terapkan transform node ke verteksnya, lalu jadikan node-nya identitas.
 *
 * OBJEK INSTANS DIKECUALIKAN, dan itu bukan kelalaian. Beberapa node yang
 * berbagi SATU data mesh (32 gelembung = 1 mesh + 32 transform) sah membawa
 * transform di node-nya; memanggangnya ke verteks menuntut mesh itu
 * digandakan 32 kali, dan itu melipatgandakan memori serta draw call.
 * Aturan "skala harus diterapkan" hanya masuk akal untuk mesh berpemakai
 * TUNGGAL — pendirian yang sama sudah dipasang di `turunkanUkuran()` sejak
 * 6 September, sesudah Blender menolak dengan 32 baris "Cannot apply to a
 * multi user" dan penolakannya ternyata BENAR.
 */
export function terapkanTransform(json, bin) {
  const nodes = json.nodes ?? [];
  const induk = petaInduk(json);

  const pemakai = new Map();
  for (const n of nodes) if (n.mesh != null) pemakai.set(n.mesh, (pemakai.get(n.mesh) ?? 0) + 1);

  const dunia = (i) => matriksDunia(nodes, induk, i);

  const isi = new Map();
  const ambil = (i) => {
    if (!isi.has(i)) isi.set(i, bacaAcc(json, bin, i));
    return isi.get(i);
  };
  for (let i = 0; i < (json.accessors ?? []).length; i++) ambil(i);

  const disentuh = [];
  const dilewati = [];
  const nodesBaru = nodes.map((n) => ({ ...n }));

  for (const [i, n] of nodes.entries()) {
    if (n.mesh == null) continue;
    const M = dunia(i);
    if (identitas(M)) continue;

    if ((pemakai.get(n.mesh) ?? 1) > 1) {
      dilewati.push({ node: n.name ?? `node${i}`, mesh: n.mesh, alasan: 'instans' });
      continue;
    }
    if (n.skin != null) {
      /* ── MESH BER-SKIN TIDAK BOLEH DIPANGGANG ────────────────────────
       *
       * Spesifikasi glTF: "the transform of the skinned mesh node MUST be
       * ignored". Transform itu memang TIDAK PERNAH dipakai renderer, jadi
       * memanggangnya ke verteks membuat mesh-nya 100 kali lebih besar
       * sementara sendinya tetap menerapkan transformnya sendiri.
       *
       * Versi pertama berkas ini memanggangnya, dan gerbang pembuktiannya
       * MELOLOSKAN — karena gerbangnya membandingkan kotak batas yang
       * dihitung dengan cara yang sama salahnya.
       *
       *     Dua alat saya sendiri yang sepakat tidak membuat keduanya benar.
       *
       * Yang membongkarnya bukan pemeriksa ketiga, melainkan spesifikasinya.
       * Terukur pada dua paket aset publik: keempat/kelima node yang akan
       * dipanggang SELURUHNYA ber-skin. */
      dilewati.push({
        node: n.name ?? `node${i}`, mesh: n.mesh,
        alasan: 'ber-skin — transform node-nya diabaikan spesifikasi, jadi bukan cacat',
      });
      continue;
    }
    if ((n.children ?? []).length) {
      /* Node ber-mesh yang punya ANAK: memanggang transformnya ke verteks
         sendiri lalu menjadikannya identitas akan MEMINDAHKAN anak-anaknya,
         karena transform induk juga berlaku bagi mereka. Dilewati dengan
         menyebut sebabnya, bukan dikerjakan setengah. */
      dilewati.push({ node: n.name ?? `node${i}`, mesh: n.mesh, alasan: 'punya anak' });
      continue;
    }

    const N = normalMatriks(M);
    for (const p of json.meshes[n.mesh].primitives ?? []) {
      if (p.extensions?.[DRACO]) {
        dilewati.push({ node: n.name ?? `node${i}`, mesh: n.mesh, alasan: 'terkompres Draco' });
        continue;
      }
      const iPos = p.attributes?.POSITION;
      if (iPos != null && isi.get(iPos)) {
        const pos = isi.get(iPos);
        for (let k = 0; k < pos.length; k += 3) {
          const [x, y, z] = terapkanTitik(M, pos[k], pos[k + 1], pos[k + 2]);
          pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        }
      }
      const iNor = p.attributes?.NORMAL;
      if (iNor != null && isi.get(iNor) && N) {
        const nor = isi.get(iNor);
        for (let k = 0; k < nor.length; k += 3) {
          const x = nor[k], y = nor[k + 1], z = nor[k + 2];
          let nx = N[0] * x + N[3] * y + N[6] * z;
          let ny = N[1] * x + N[4] * y + N[7] * z;
          let nz = N[2] * x + N[5] * y + N[8] * z;
          const l = Math.hypot(nx, ny, nz) || 1;
          nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
        }
      }
    }
    nodesBaru[i] = { ...n };
    delete nodesBaru[i].matrix;
    delete nodesBaru[i].translation;
    delete nodesBaru[i].rotation;
    delete nodesBaru[i].scale;
    disentuh.push(n.name ?? `node${i}`);
  }

  if (!disentuh.length) return { berubah: false, disentuh, dilewati };
  const hasil = tulisUlang({ ...json, nodes: nodesBaru }, isi);
  return { berubah: true, disentuh, dilewati, ...hasil };
}

/**
 * Buang verteks yang tidak dirujuk satu indeks pun, lalu petakan ulang
 * indeksnya.
 *
 * Verteks begitu dibayar penuh di VRAM dan tidak menggambar apa-apa. Blender
 * TIDAK BISA melihatnya pada sebuah GLB — importirnya membuangnya saat impor,
 * jadi memeriksanya lewat Blender selalu melaporkan nol.
 */
export function buangVerteksLepas(json, bin) {
  const isi = new Map();
  for (let i = 0; i < (json.accessors ?? []).length; i++) isi.set(i, bacaAcc(json, bin, i));

  let dibuang = 0;
  const meshBaru = (json.meshes ?? []).map((m) => ({
    ...m,
    primitives: (m.primitives ?? []).map((p) => {
      if (p.indices == null || p.extensions?.[DRACO]) return p;
      const idx = isi.get(p.indices);
      const iPos = p.attributes?.POSITION;
      const pos = iPos != null ? isi.get(iPos) : null;
      if (!idx || !pos) return p;

      const n = pos.length / 3;
      const dipakai = new Uint8Array(n);
      for (const v of idx) dipakai[v] = 1;
      let sisa = 0;
      for (let i = 0; i < n; i++) if (dipakai[i]) sisa++;
      if (sisa === n) return p;
      dibuang += n - sisa;

      const peta = new Int32Array(n).fill(-1);
      let b = 0;
      for (let i = 0; i < n; i++) if (dipakai[i]) peta[i] = b++;

      // SELURUH atribut ikut dipadatkan, bukan cuma POSITION. Atribut yang
      // tertinggal panjangnya akan tidak sejajar dengan posisinya, dan glTF
      // tidak mensyaratkan apa pun yang menangkap itu.
      for (const ia of Object.values(p.attributes ?? {})) {
        const lama = isi.get(ia);
        if (!lama) continue;
        const komp = JUMLAH[json.accessors[ia].type] ?? 1;
        if (lama.length / komp !== n) continue;
        const baru = new lama.constructor(sisa * komp);
        for (let i = 0; i < n; i++) {
          if (peta[i] < 0) continue;
          for (let j = 0; j < komp; j++) baru[peta[i] * komp + j] = lama[i * komp + j];
        }
        isi.set(ia, baru);
      }
      const idxBaru = new idx.constructor(idx.length);
      for (let i = 0; i < idx.length; i++) idxBaru[i] = peta[idx[i]];
      isi.set(p.indices, idxBaru);
      return p;
    }),
  }));

  if (!dibuang) return { berubah: false, dibuang: 0 };
  return { berubah: true, dibuang, ...tulisUlang({ ...json, meshes: meshBaru }, isi) };
}

const PERBAIKAN = {
  skala: {
    nama: 'terapkan transform ke verteks',
    jalan: terapkanTransform,
    ukur: (u) => u.skala_diterapkan,
    kalimat: (h) => `${h.disentuh.length} node dipanggang`
      + (h.dilewati.length ? `, ${h.dilewati.length} dilewati` : ''),
  },
  lepas: {
    nama: 'buang verteks lepas',
    jalan: buangVerteksLepas,
    ukur: (u) => u.simpul_lepas === 0,
    kalimat: (h) => `${h.dibuang} verteks dibuang`,
  },
};

export const JENIS_PERBAIKAN = Object.keys(PERBAIKAN);

/**
 * Perbaiki sebuah GLB, dan BUKTIKAN perbaikannya tidak merusak apa pun.
 *
 * @param {string} jalur
 * @param {{ jenis?: string[], toleransi?: number }} opsi
 * @returns {{ ok, sebelum, sesudah, dilakukan, bukti, glb }}
 */
export async function perbaikiGLB(jalur, opsi = {}) {
  const { ukurGLB } = await import('./ukur-glb.mjs');
  const { topologiGLB } = await import('./topologi.mjs');
  const jenis = opsi.jenis ?? JENIS_PERBAIKAN;
  const tol = opsi.toleransi ?? 1e-4;

  const sebelum = ukurGLB(jalur);
  const topoSebelum = topologiGLB(jalur);

  let { json, bin } = bacaGLB(readFileSync(jalur));
  const dilakukan = [];
  for (const k of jenis) {
    const P = PERBAIKAN[k];
    if (!P) throw new Error(`jenis perbaikan tidak dikenal: ${k}. Yang ada: ${JENIS_PERBAIKAN.join(', ')}`);
    if (P.ukur(sebelum)) continue;              // sudah benar, tidak disentuh
    const h = P.jalan(json, bin);
    if (!h.berubah) continue;
    json = h.json; bin = h.bin;
    dilakukan.push({ jenis: k, nama: P.nama, catatan: P.kalimat(h), ...h, json: undefined, bin: undefined });
  }

  if (!dilakukan.length) {
    return { ok: true, berubah: false, sebelum, sesudah: sebelum, dilakukan: [], bukti: null, glb: null };
  }

  const glb = tulisGLB({ json, bin });

  /* ── PEMBUKTIANNYA ────────────────────────────────────────────────────
   *
   * Hasilnya ditulis ke berkas SEMENTARA lalu diukur ulang dengan pengukur
   * yang sama — bukan diperkirakan dari operasinya. Perbaikan yang "menurut
   * hitungan seharusnya benar" adalah perbaikan yang belum diperiksa. */
  const { writeFileSync, rmSync, mkdtempSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'rupa-perbaiki-'));
  const uji = path.join(dir, 'uji.glb');
  let sesudah; let topoSesudah;
  try {
    writeFileSync(uji, glb);
    sesudah = ukurGLB(uji);
    topoSesudah = topologiGLB(uji);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }

  const gagal = [];
  // 1. Cacat yang dituju HARUS hilang.
  for (const d of dilakukan) {
    if (!PERBAIKAN[d.jenis].ukur(sesudah)) gagal.push(`${d.jenis}: cacatnya masih ada sesudah diperbaiki`);
  }
  // 2. BENTUKNYA tidak boleh berubah. Ini yang membedakan perbaikan dari
  //    perusakan: cacat apa pun bisa dihilangkan dengan menghapus geometrinya.
  const diag = Math.hypot(sebelum.lebar, sebelum.tinggi, sebelum.dalam) || 1;
  for (const k of ['lebar', 'tinggi', 'dalam', 'pivot_z']) {
    const d = Math.abs(sebelum[k] - sesudah[k]) / diag;
    if (d > tol) gagal.push(`${k} bergeser ${(d * 100).toFixed(5)} % diagonal`);
  }
  if (sesudah.segitiga_total !== sebelum.segitiga_total) {
    gagal.push(`segitiga ${sebelum.segitiga_total} → ${sesudah.segitiga_total}`);
  }
  // 3. Kotak batas RUANG-LOKAL (accessor min/max) diperiksa TERPISAH.
  //    Ini pemeriksa yang tidak berbagi asumsi dengan `ukurGLB`: ia membaca
  //    angka yang ditulis di berkasnya sendiri, bukan menghitung ulang lewat
  //    transform. Gerbang yang seluruh pemeriksanya memakai jalan yang sama
  //    akan meloloskan kesalahan yang ada di jalan itu — dan itu persis yang
  //    terjadi pada mesh ber-skin sebelum ditambal.
  const { kotakBatasGLB } = await import('./glb.mjs');
  const lokalSebelum = kotakBatasGLB(jalur);
  const lokalSesudah = kotakBatasGLB(uji);
  if (lokalSebelum && lokalSesudah) {
    const dl = Math.hypot(...lokalSebelum.ukuran) || 1;
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(lokalSebelum.ukuran[i] - lokalSesudah.ukuran[i]) / dl;
      /* Ruang LOKAL memang BERUBAH kalau transformnya dipanggang — itu
         justru maksudnya. Yang diperiksa di sini cuma kalau TIDAK ada
         pemanggangan sama sekali. */
      if (!dilakukan.some((x) => x.jenis === 'skala') && d > tol) {
        gagal.push(`kotak lokal sumbu ${i} bergeser ${(d * 100).toFixed(5)} % tanpa ada pemanggangan`);
      }
    }
  }

  // 4. TOPOLOGINYA tidak boleh berubah.
  for (const k of ['tepi_tak_manifold', 'tepi_batas', 'tepi_putaran_salah',
    'segitiga_degenerasi', 'verteks_terlas']) {
    if (topoSesudah[k] !== topoSebelum[k]) {
      gagal.push(`topologi ${k}: ${topoSebelum[k]} → ${topoSesudah[k]}`);
    }
  }

  rmSync(dir, { recursive: true, force: true });

  return {
    ok: gagal.length === 0,
    berubah: true,
    sebelum, sesudah, dilakukan,
    bukti: {
      lulus: gagal.length === 0,
      gagal,
      kotak_sama: gagal.every((g) => !/bergeser|segitiga/.test(g)),
      topologi_sama: gagal.every((g) => !/^topologi/.test(g)),
      bita: { sebelum: readFileSync(jalur).length, sesudah: glb.length },
    },
    glb: gagal.length === 0 ? glb : null,
  };
}
