/* Uji UKUR-GLB — kosakata bentuk yang dibaca dari berkasnya, tanpa Blender.
 *
 * ── Aturan yang mengikat berkas ini ──────────────────────────────────────
 *
 * Tiap GLB di sini DISUSUN SENDIRI, dengan angka yang dipilih supaya
 * jawabannya diketahui sebelum alatnya dijalankan. Mengambil aset repo ini
 * sebagai acuan akan membuat uji ini mengunci apa pun yang kebetulan
 * dihasilkan alatnya hari ini — termasuk kalau itu salah.
 *
 * Silang terhadap Blender ada di `test.mjs`; yang di sini acuan tertutup.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tulisGLB } from './glb.mjs';
import { ukurGLB, nodeMeshGLB, SUMBU } from './ukur-glb.mjs';

const RUANG = mkdtempSync(path.join(tmpdir(), 'rupa-ukur-'));
test.after(() => rmSync(RUANG, { recursive: true, force: true }));

/** Kotak sumbu-sejajar berukuran (lx, ly, lz), sudut minnya di titik asal.
 *  12 segitiga, 8 verteks — jumlah yang bisa dihitung tanpa alat. */
function kotak(lx, ly, lz) {
  const p = [
    0, 0, 0, lx, 0, 0, lx, ly, 0, 0, ly, 0,
    0, 0, lz, lx, 0, lz, lx, ly, lz, 0, ly, lz,
  ];
  const i = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ];
  return { posisi: p, indeks: i };
}

/**
 * Susun GLB dari daftar node. Sengaja ditulis apa adanya, bukan lewat
 * pustaka: yang diuji justru pembacaan struktur glTF-nya, dan penulis yang
 * memakai pembaca yang sama akan menyembunyikan kesalahan yang sama.
 *
 * @param {{mesh:number, scale?:number[], translation?:number[], children?:number[], name?:string}[]} nodes
 * @param {{posisi:number[], indeks:number[], verteksTambahan?:number}[]} meshes
 */
function buatGLB(nama, nodes, meshes) {
  const potong = [];
  const accessors = [];
  const meshDef = [];
  let ofs = 0;

  for (const m of meshes) {
    // Verteks tambahan ditulis ke accessor tetapi TIDAK dirujuk indeks mana
    // pun — itulah "simpul lepas", dan glTF memang mengizinkannya.
    const ekstra = m.verteksTambahan ?? 0;
    const pos = Float32Array.from([...m.posisi, ...Array(ekstra * 3).fill(0)]);
    const idx = Uint16Array.from(m.indeks);

    const min = [Infinity, Infinity, Infinity];
    const maks = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (pos[i + k] < min[k]) min[k] = pos[i + k];
        if (pos[i + k] > maks[k]) maks[k] = pos[i + k];
      }
    }

    const bufPos = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
    potong.push({ buf: bufPos, ofs });
    const aPos = accessors.length;
    accessors.push({
      bufferView: aPos, componentType: 5126, count: pos.length / 3,
      type: 'VEC3', min, max: maks,
    });
    ofs += bufPos.length;

    const bufIdx = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength);
    // Padding 4-bita: accessor yang tidak selaras ditolak sebagian pemuat.
    const isi = (4 - (bufIdx.length % 4)) % 4;
    potong.push({ buf: Buffer.concat([bufIdx, Buffer.alloc(isi)]), ofs });
    const aIdx = accessors.length;
    accessors.push({ bufferView: aIdx, componentType: 5123, count: idx.length, type: 'SCALAR' });
    ofs += bufIdx.length + isi;

    meshDef.push({
      name: m.nama ?? `mesh${meshDef.length}`,
      primitives: [{
        attributes: { POSITION: aPos }, indices: aIdx,
        ...(m.bahan != null ? { material: m.bahan } : {}),
      }],
    });
  }

  const bin = Buffer.concat(potong.map((p) => p.buf));
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i).filter((i) => !nodes.some((n) => (n.children ?? []).includes(i))) }],
    nodes: nodes.map((n) => ({ ...n })),
    meshes: meshDef,
    accessors,
    bufferViews: potong.map((p, i) => ({
      buffer: 0, byteOffset: p.ofs, byteLength: p.buf.length,
      ...(i % 2 === 0 ? { target: 34962 } : { target: 34963 }),
    })),
    buffers: [{ byteLength: bin.length }],
    ...(meshes.some((m) => m.bahan != null)
      ? { materials: [{ name: 'bahanUji' }, { name: 'bahanKedua' }] } : {}),
  };
  const jalur = path.join(RUANG, `${nama}.glb`);
  writeFileSync(jalur, tulisGLB({ json, bin }));
  return jalur;
}

test('kotak 1x2x3 — ukurannya persis, dan pivotnya di titik asal', () => {
  const f = buatGLB('kotak', [{ mesh: 0, name: 'kubus' }], [kotak(1, 2, 3)]);
  const u = ukurGLB(f);
  assert.equal(u.segitiga_total, 12, '6 sisi x 2 segitiga');
  assert.equal(u.objek_mesh, 1);
  assert.deepEqual(u.kotak_batas.ukuran, [1, 2, 3]);
  assert.equal(u.pivot_z, 0, 'sudut min ada di titik asal');
  assert.deepEqual(u.nama_objek, ['kubus']);
});

test('SUMBU ATAS menentukan mana yang `tinggi` — dan salah sumbu tidak bergejala', () => {
  const f = buatGLB('sumbu', [{ mesh: 0 }], [kotak(1, 2, 3)]);
  // glTF baku Y-atas: tinggi = sumbu ke-1, dalam = sumbu ke-2.
  const y = ukurGLB(f, { sumbu_atas: 'Y' });
  assert.equal(y.lebar, 1);
  assert.equal(y.tinggi, 2);
  assert.equal(y.dalam, 3);
  // Konvensi Blender Z-atas pada berkas yang sama memberi angka LAIN, dan
  // keduanya sama-sama "masuk akal" kalau sumbunya tidak ikut disebut.
  const z = ukurGLB(f, { sumbu_atas: 'Z' });
  assert.equal(z.tinggi, 3);
  assert.equal(z.dalam, 2);
  assert.notEqual(y.tinggi, z.tinggi, 'kalau sama, ujinya tidak membuktikan apa-apa');
  assert.equal(y.sumbu_atas, 'Y');
  assert.equal(z.sumbu_atas, 'Z');
  assert.match(z.sumbu_catatan, /Blender/);
});

test('sumbu atas yang tidak dikenal DITOLAK, bukan jatuh ke bawaan', () => {
  const f = buatGLB('sumbu2', [{ mesh: 0 }], [kotak(1, 1, 1)]);
  assert.throws(() => ukurGLB(f, { sumbu_atas: 'X' }), /sumbu_atas tidak dikenal/);
});

test('SKALA NODE ikut kotak batas — accessor sendirian akan salah', () => {
  const f = buatGLB('skala', [{ mesh: 0, scale: [2, 2, 2] }], [kotak(1, 2, 3)]);
  const u = ukurGLB(f);
  assert.deepEqual(u.kotak_batas.ukuran, [2, 4, 6], 'accessor menyimpan 1x2x3');
  assert.equal(u.skala_diterapkan, false);
});

test('skala INDUK tertangkap — node berskala 1 di bawah induk berskala 40', () => {
  // Inilah yang membuat `node.scale` mentah tidak cukup. Anaknya berskala 1
  // dan sepenuhnya terlihat "bersih"; yang dirender 40 kali lipat.
  const f = buatGLB('induk',
    [{ children: [1], scale: [40, 40, 40], name: 'induk' },
      { mesh: 0, name: 'anak' }],
    [kotak(1, 1, 1)]);
  const n = nodeMeshGLB(f);
  assert.equal(n.length, 1, 'cuma node ber-mesh yang dihitung');
  assert.deepEqual(n[0].skala_dunia, [40, 40, 40]);
  const u = ukurGLB(f);
  assert.equal(u.skala_diterapkan, false,
    'node.scale anaknya [1,1,1] — pembaca yang tidak naik ke induk akan bilang true');
  assert.deepEqual(u.kotak_batas.ukuran, [40, 40, 40]);
});

test('skala 1 melaporkan diterapkan — pemeriksanya tidak asal merah', () => {
  const f = buatGLB('bersih', [{ mesh: 0, translation: [5, 5, 5] }], [kotak(1, 1, 1)]);
  const u = ukurGLB(f);
  assert.equal(u.skala_diterapkan, true, 'geser bukan skala');
  assert.equal(u.pivot_z, 5);
});

test('VERTEKS LEPAS terhitung — posisi yang tidak dirujuk indeks mana pun', () => {
  const f = buatGLB('lepas', [{ mesh: 0 }], [{ ...kotak(1, 1, 1), verteksTambahan: 4 }]);
  const u = ukurGLB(f);
  assert.equal(u.simpul_lepas, 4);
  assert.equal(u.segitiga_total, 12, 'verteks lepas tidak menambah segitiga');
});

test('nol verteks lepas dilaporkan nol — bukan pemeriksa yang macet', () => {
  const f = buatGLB('rapi', [{ mesh: 0 }], [kotak(1, 1, 1)]);
  assert.equal(ukurGLB(f).simpul_lepas, 0);
});

test('INSTANSING terbaca: dua node berbagi satu mesh', () => {
  const f = buatGLB('instans',
    [{ mesh: 0, name: 'a' }, { mesh: 0, translation: [3, 0, 0], name: 'b' },
      { mesh: 1, translation: [6, 0, 0], name: 'c' }],
    [kotak(1, 1, 1), kotak(2, 2, 2)]);
  const u = ukurGLB(f);
  assert.equal(u.objek_mesh, 3);
  assert.equal(u.objek_instans, 2, 'a dan b berbagi mesh 0');
  assert.equal(u.objek_tunggal, 1, 'cuma c yang berdata tunggal');
});

test('objek INSTANS dikecualikan dari aturan skala — dan itu disengaja', () => {
  // Dua node berbagi satu mesh, keduanya berskala. Menerapkan skalanya akan
  // MEMECAH instansing dan melipatgandakan memori serta draw call, jadi
  // aturannya hanya berlaku untuk objek berdata TUNGGAL.
  const f = buatGLB('instans-skala',
    [{ mesh: 0, scale: [2, 2, 2] }, { mesh: 0, scale: [3, 3, 3], translation: [9, 0, 0] }],
    [kotak(1, 1, 1)]);
  const u = ukurGLB(f);
  assert.equal(u.objek_instans, 2);
  assert.equal(u.objek_tunggal, 0);
  assert.equal(u.skala_diterapkan, true,
    'tanpa satu pun objek tunggal, tidak ada yang dilanggar');
});

test('n-gon dilaporkan `null`, bukan 0 — dan itu MENGGAGALKAN aturannya', () => {
  const f = buatGLB('ngon', [{ mesh: 0 }], [kotak(1, 1, 1)]);
  const u = ukurGLB(f);
  assert.equal(u.ngon, null,
    'glTF selalu tersegitiga; 0 akan meloloskan `ngon <= 0` tanpa mengukur apa pun');
  assert.ok(u.tidak_bisa_diukur_dari_glb.length >= 1);
});

test('BAHAN terbaca dari slot materialnya, bukan dari nama mesh', () => {
  const f = buatGLB('bahan',
    [{ mesh: 0 }, { mesh: 1, translation: [3, 0, 0] }],
    [{ ...kotak(1, 1, 1), bahan: 0 }, { ...kotak(1, 1, 1), bahan: 1 }]);
  const u = ukurGLB(f);
  assert.deepEqual(u.bahan.sort(), ['bahanKedua', 'bahanUji']);
});

test('peta_bagian mencocokkan KATA KUNCI, bukan nama persis', () => {
  const f = buatGLB('bagian',
    [{ mesh: 0, name: 'Tempurung_Luar' }, { mesh: 1, name: 'otak_kiri' }],
    [kotak(1, 1, 1), kotak(1, 1, 1)]);
  const u = ukurGLB(f, {
    peta_bagian: { shell: ['tempurung', 'shell'], brain: ['otak', 'brain'], glass: ['kubah'] },
  });
  assert.deepEqual(u.bagian.sort(), ['brain', 'shell'], 'glass tidak ada, dan itu benar');
});

test('nisbah lebar/tinggi dihitung dari sumbu yang BENAR', () => {
  const f = buatGLB('nisbah', [{ mesh: 0 }], [kotak(4, 2, 1)]);
  const u = ukurGLB(f);          // Y-atas: lebar 4, tinggi 2
  assert.equal(u.nisbah_lebar_tinggi, 2);
  const z = ukurGLB(f, { sumbu_atas: 'Z' });  // Z-atas: lebar 4, tinggi 1
  assert.equal(z.nisbah_lebar_tinggi, 4);
});

test('SUMBU diekspor supaya pemakainya bisa memeriksa pilihannya sendiri', () => {
  assert.deepEqual(Object.keys(SUMBU).sort(), ['Y', 'Z']);
  assert.equal(SUMBU.Y.tinggi, 1);
  assert.equal(SUMBU.Z.tinggi, 2);
});
