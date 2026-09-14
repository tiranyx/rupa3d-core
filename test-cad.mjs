/* Uji kernel b-rep terhadap OCCT SUNGGUHAN.
 *
 * Yang perlu dibuktikan di sini bukan "apakah kodenya jalan", melainkan
 * apakah b-rep benar-benar EKSAK — dan itu cuma bisa dibuktikan dengan
 * membandingkannya pada bentuk yang volumenya bisa dihitung tangan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { kernel, buka, ukur, keBita, volumeMesh, bandingkanTesselasi } from './cad.mjs';

const { B, kelas } = await kernel();

test('kernel OCCT hidup di Node', () => {
  assert.ok(kelas > 500, `kelas OCCT ${kelas} terlalu sedikit — kernel tidak utuh`);
  assert.equal(typeof B.makeBox, 'function');
});

test('volume b-rep EKSAK, bukan hampiran', () => {
  // Kotak 50x30x20 = 30.000 mm³, tanpa sisa desimal.
  const kotak = B.makeBox([0, 0, 0], [50, 30, 20]);
  assert.equal(B.measureVolume(kotak), 30000);

  // Silinder r=10 t=25: pi*r^2*t. Mesh TIDAK PERNAH memberi angka ini.
  const sil = B.makeCylinder(10, 25, [0, 0, 0], [0, 0, 1]);
  const tepat = Math.PI * 100 * 25;
  assert.ok(Math.abs(B.measureVolume(sil) - tepat) < 1e-6,
    `silinder ${B.measureVolume(sil)} != ${tepat}`);
});

test('mesh selalu MELESET, dan pada permukaan lengkung SUDUT yang mengikat', () => {
  // Pabrik, bukan shape: OCCT menyimpan triangulasi DI DALAM shape dan hanya
  // pernah memperhalus, tidak pernah memperkasar. Mengukur beberapa toleransi
  // pada shape yang sama memberi tabel yang tampak masuk akal dan palsu.
  const pabrik = () => B.makeCylinder(10, 25, [0, 0, 0], [0, 0, 1]);
  const baris = bandingkanTesselasi(B, pabrik);

  // Tidak satu pun tepat. Inilah yang tidak bisa dilakukan mesh, titik.
  for (const b of baris) assert.ok(Math.abs(b.galat_persen) > 0, 'mesh tidak mungkin tepat');

  // Dan galatnya MENGECIL monoton begitu toleransinya diketatkan.
  for (let i = 1; i < baris.length; i += 1) {
    assert.ok(Math.abs(baris[i].galat_persen) < Math.abs(baris[i - 1].galat_persen),
      `galat harus mengecil: ${baris.map((b) => b.galat_persen.toFixed(4)).join(' , ')}`);
  }

  // Toleransi SUDUT sendirian sudah menentukan pada silinder — linier
  // dibiarkan longgar di 1,0 pada keduanya. Terukur 3,85% -> 0,0104%.
  const kasar = B.meshShape(pabrik(), { tolerance: 1.0, angularTolerance: 1.0 });
  const halus = B.meshShape(pabrik(), { tolerance: 1.0, angularTolerance: 0.05 });
  assert.ok(halus.triangles.length > kasar.triangles.length * 10,
    `sudut harus menggerakkan kerapatan: ${kasar.triangles.length / 3} vs ${halus.triangles.length / 3} segitiga`);
});

test('boolean: potong silinder dari kotak, volumenya persis selisihnya', () => {
  const kotak = B.makeBox([0, 0, 0], [40, 40, 10]);
  const bor = B.makeCylinder(5, 30, [20, 20, -10], [0, 0, 1]);
  const hasil = buka(B.cutShape(kotak, bor), B);
  const tepat = 40 * 40 * 10 - Math.PI * 25 * 10;
  assert.ok(Math.abs(B.measureVolume(hasil) - tepat) < 1e-6,
    `${B.measureVolume(hasil)} != ${tepat}`);
});

test('kegagalan berbunyi di tempatnya, tidak jadi undefined', () => {
  // Result gagal harus melempar, bukan mengembalikan undefined yang meledak
  // jauh di hilir. Ini regresi yang benar-benar terjadi saat membangun flange.
  assert.throws(() => buka({ ok: false, error: 'sengaja' }, B), /sengaja/);
  assert.equal(buka({ ok: true, value: 7 }, B), B.unwrap({ ok: true, value: 7 }));
});

test('putar-balik STEP: tulis, baca lagi, volumenya bertahan', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rupa3d-cad-'));
  try {
    const kotak = B.makeBox([0, 0, 0], [12, 34, 56]);
    const asal = B.measureVolume(kotak);

    const bita = await keBita(B.exportSTEP(kotak), B);
    const berkas = path.join(dir, 'uji.step');
    writeFileSync(berkas, bita);
    assert.ok(statSync(berkas).size > 500, 'STEP tidak boleh kosong');
    assert.match(bita.subarray(0, 40).toString(), /^ISO-10303-21/,
      'harus STEP sungguhan, bukan berkas apa pun');

    // `importSTEP` ASINKRON dan menerima Blob — bukan Buffer, bukan
    // Uint8Array. Diserahkan Buffer, ia gagal dengan "blob.arrayBuffer is
    // not a function"; tanpa await, `buka()` menerima Promise dan meledak
    // jauh di hilir dengan "Cannot read properties of undefined (reading '$$')".
    const balik = buka(await B.importSTEP(new Blob([bita])), B);
    const kembali = Array.isArray(balik) ? balik[0] : balik;
    const sesudah = B.measureVolume(kembali);
    // Toleransi longgar karena STEP menulis desimal terbatas; yang dibuktikan
    // adalah geometrinya BERTAHAN, bukan bit-per-bit sama.
    assert.ok(Math.abs(sesudah - asal) / asal < 1e-9,
      `volume berubah lewat STEP: ${asal} -> ${sesudah}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ukur() melaporkan eksak DAN ongkos hampirannya sekaligus', () => {
  const sil = B.makeCylinder(10, 25, [0, 0, 0], [0, 0, 1]);
  const u = ukur(B, sil, 0.05);
  assert.ok(u.volume_eksak > 0 && u.luas_eksak > 0);
  assert.ok(u.mesh.segitiga > 0 && u.mesh.simpul > 0);
  assert.ok(u.mesh.galat_persen !== null && Math.abs(u.mesh.galat_persen) < 1,
    `galat ${u.mesh.galat_persen}% terlalu besar untuk toleransi 0,05`);
});
