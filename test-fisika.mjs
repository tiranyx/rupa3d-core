/* Uji fisika terhadap MEKANIKA DASAR, bukan terhadap dirinya sendiri.
 *
 * Uji regresi fisika membuktikan mesinnya konsisten dengan kemarin. Uji di
 * sini membuktikan ia sesuai dengan h = ½gt², dengan e = |v'|/|v|, dan
 * dengan m = ρV — hal-hal yang benar tanpa perlu menjalankan apa pun.
 *
 * Dan satu pelajaran yang berulang tiga kali hari ini: yang gagal duluan
 * biasanya PEMERIKSANYA. Versi pertama `periksaPantulan` melaporkan restitusi
 * Rapier hancur (0,00015 m dari teori 0,4275); yang hancur adalah deteksi
 * tumbukan saya, yang menunggu bola berada dalam jendela posisi selebar 1 mm
 * sementara bola bergerak 120 mm per langkah.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dunia, tambahBadan, jalankan, periksaJatuhBebas, periksaPantulan,
  periksaDiam, periksaMassa, batasLaju, cariAmbangTembus,
} from './fisika.mjs';

/* ── Terhadap rumus tertutup ────────────────────────────────────────── */

test('jatuh bebas cocok dengan h = ½gt² dalam SATU langkah, di tiap timestep', async () => {
  const galat = [];
  for (const langkah of [1 / 30, 1 / 60, 1 / 240]) {
    const r = await periksaJatuhBebas({ langkah });
    assert.equal(r.dalam_satu_langkah, true,
      `${(1 / langkah).toFixed(0)} Hz: selisih ${r.selisih} > langkah ${langkah}`);
    galat.push(r.galat_persen);
  }
  /* Galatnya harus MENGECIL saat timestep dipersempit. Kalau ia tetap atau
     membesar, yang terjadi bukan resolusi pencuplikan melainkan hanyut
     integrator — dan itu masalah yang sama sekali berbeda. */
  assert.ok(galat[0] > galat[1] && galat[1] > galat[2],
    `galat harus mengecil dengan timestep: ${galat.join(' > ')}`);
});

test('restitusi TEPAT — diukur di tumbukan, bukan dari tinggi pantul', async () => {
  for (const e of [0.2, 0.5, 0.8, 0.95]) {
    const r = await periksaPantulan({ e });
    assert.ok(r.e_terukur != null, `tumbukan tidak terdeteksi untuk e=${e}`);
    assert.ok(Math.abs(r.e_terukur - e) < 1e-3,
      `diminta ${e}, terukur ${r.e_terukur} — versi lama melaporkan ini hancur, `
      + 'dan yang hancur adalah deteksinya');
  }
});

test('massa = kerapatan × volume', async () => {
  for (const bentuk of ['kotak', 'bola', 'silinder']) {
    const r = await periksaMassa({ bentuk, ukuran: [2, 3, 4], kerapatan: 7850 });
    assert.ok(Math.abs(r.galat_persen) < 1e-4,
      `${bentuk}: rapier ${r.massa_rapier} vs analitik ${r.massa_analitik}`);
  }
});

test('massa salah berarti benda berperilaku seperti benda lain', async () => {
  /* Baja dan gabus dengan bentuk sama harus berbeda massanya ~15x.
     Kalau kerapatan diabaikan, keduanya sama — dan itu tidak terlihat. */
  const baja = await periksaMassa({ bentuk: 'kotak', ukuran: [1, 1, 1], kerapatan: 7850 });
  const gabus = await periksaMassa({ bentuk: 'kotak', ukuran: [1, 1, 1], kerapatan: 240 });
  assert.ok(baja.massa_rapier / gabus.massa_rapier > 30);
});

/* ── Kegagalan diam ─────────────────────────────────────────────────── */

test('benda diam TIDAK hanyut', async () => {
  const r = await periksaDiam({ detik: 5 });
  /* Ambangnya dinyatakan per JAM, bukan per detik: hanyut 1 mm/detik tidak
     terlihat sama sekali dalam demo 5 detik dan menjadi 3,6 meter dalam satu
     jam permainan. */
  assert.ok(r.hanyut_per_jam_m < 1,
    `hanyut ${r.hanyut_per_jam_m} m/jam — tidak terlihat di demo, fatal di permainan`);
});

test('Rapier MEREDAM laju di 400 m/s tanpa peringatan', async () => {
  const r = await batasLaju();
  assert.equal(r.ada_peredaman, true);
  assert.equal(r.laju_maks_terukur, 400,
    'kalau angka ini berubah di versi Rapier lain, seluruh klaim tembus di '
    + 'bawah ikut berubah — karena itu ia diuji, bukan diasumsikan');
  const minta5000 = r.hasil.find((h) => h.diminta === 5000);
  assert.equal(minta5000.tercapai, 400,
    'peluru yang disetel 5000 m/s berjalan 400 m/s, dan tidak ada satu pun tanda');
});

test('klaim TIDAK TEMBUS menyebut batas ujinya, bukan cuma "aman"', async () => {
  const r = await cariAmbangTembus({ tebal: 0.02, langkahLaju: 100 });
  assert.equal(r.v_tembus_terukur, null);
  assert.equal(r.laju_maks_yang_bisa_diuji, 400);
  assert.ok(/BELUM diuji/.test(r.catatan),
    'klaim aman tanpa menyebut apa yang tidak diuji adalah klaim kosong');
  assert.ok(r.lipat_di_atas_naif > 100,
    'model naif tebal/langkah tidak berlaku untuk Rapier — kontak spekulatif');
});

/* ── Batas mesin yang harus DIKATAKAN, bukan ditemukan sendiri ──────── */

test('trimesh dinamis DITOLAK dengan menyebut alasannya', async () => {
  const d = await dunia();
  assert.throws(() => tambahBadan(d, { jenis: 'dinamis', bentuk: 'trimesh' }),
    /trimesh TIDAK bisa dinamis/);
  /* Statis boleh — dan itu memang cara memakai trimesh yang benar. */
});

test('massa DAN kerapatan bersamaan ditolak', async () => {
  const d = await dunia();
  assert.throws(() => tambahBadan(d, { massa: 10, kerapatan: 1000 }),
    /bukan keduanya/);
});

test('jenis badan tak dikenal ditolak dengan menyebut yang ADA', async () => {
  const d = await dunia();
  assert.throws(() => tambahBadan(d, { jenis: 'melayang' }), /statis, dinamis, kinematik/);
});

/* ── Perilaku dasar ─────────────────────────────────────────────────── */

test('badan statis tidak bergerak meski ditimpa badan dinamis', async () => {
  const d = await dunia();
  const lantai = tambahBadan(d, {
    jenis: 'statis', bentuk: 'kotak', ukuran: [10, 0.4, 10], posisi: [0, -0.2, 0],
  });
  tambahBadan(d, { bentuk: 'kotak', ukuran: [1, 1, 1], posisi: [0, 4, 0], kerapatan: 8000 });
  const y0 = lantai.badan.translation().y;
  jalankan(d, lantai.badan, { detik: 3 });
  assert.equal(lantai.badan.translation().y, y0);
});

test('gravitasi nol berarti benda melayang tepat di tempatnya', async () => {
  const d = await dunia({ gravitasi: [0, 0, 0] });
  const b = tambahBadan(d, { bentuk: 'bola', ukuran: [1, 1, 1], posisi: [0, 5, 0] });
  const lintasan = jalankan(d, b.badan, { detik: 2 });
  assert.ok(Math.abs(lintasan[lintasan.length - 1].y - 5) < 1e-9,
    `melayang ke ${lintasan[lintasan.length - 1].y}`);
});

test('lintasan mencatat tiap langkah, dan waktunya konsisten', async () => {
  const d = await dunia({ langkah: 1 / 60 });
  const b = tambahBadan(d, { bentuk: 'bola', ukuran: [1, 1, 1], posisi: [0, 100, 0] });
  const l = jalankan(d, b.badan, { detik: 1 });
  assert.equal(l.length, 60);
  assert.ok(Math.abs(l[59].waktu - 1) < 1e-9);
  assert.ok(l[59].y < l[0].y, 'harus turun');
});

/* ── Rotasi: konvensi yang SAMA dengan adegan dan runtime ───────────────
 *
 * Format adegan menulis `putar` sebagai derajat berurutan XYZ (adegan.mjs),
 * dan runtime web memakai `obj.rotation.set(...)` three.js — juga XYZ. Sampai
 * 15 Sep 2026 `tambahBadan` mengubahnya dengan rumus urutan ZYX. Untuk satu
 * sumbu keduanya sama, jadi tak satu pun uji di sini — yang semuanya satu
 * sumbu atau tanpa rotasi — pernah melihatnya. Ditemukan saat meninjau studio:
 * lantai yang diputar [30, 45, 0] melompat 22,74° begitu simulasi dijalankan.
 *
 * Acuannya dihitung lewat jalan LAIN dari yang diuji: matriks Rx·Ry·Rz
 * dikalikan ke vektor basis, dibandingkan dengan vektor yang sama diputar
 * quaternion badan dari Rapier. Membandingkan vektor, bukan quaternion,
 * menghindari ambiguitas tanda q ≡ −q. */

const radian = (d) => (d * Math.PI) / 180;

function matriksXYZ([dx, dy, dz]) {
  const [a, b, g] = [radian(dx), radian(dy), radian(dz)];
  const Rx = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Ry = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
  const Rz = [[Math.cos(g), -Math.sin(g), 0], [Math.sin(g), Math.cos(g), 0], [0, 0, 1]];
  const kali = (A, B) => A.map((_, i) => B[0].map((__, j) => A[i].reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
  return kali(kali(Rx, Ry), Rz);
}

const kenakanMatriks = (M, v) => M.map((baris) => baris[0] * v[0] + baris[1] * v[1] + baris[2] * v[2]);

function putarDenganQuat(q, [x, y, z]) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return [
    x + q.w * tx + (q.y * tz - q.z * ty),
    y + q.w * ty + (q.z * tx - q.x * tz),
    z + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

test('putar badan mengikuti urutan XYZ adegan — juga untuk rotasi DUA dan TIGA sumbu', async () => {
  const d = await dunia();
  const kasus = [[30, 45, 0], [10, 20, 30], [90, 0, -22], [-35, 120, 60], [0, 0, -22], [0, 63, 0]];
  for (const putar of kasus) {
    const { badan } = tambahBadan(d, { jenis: 'statis', bentuk: 'kotak', ukuran: [1, 1, 1], putar });
    const q = badan.rotation();
    const M = matriksXYZ(putar);
    for (const basis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const harap = kenakanMatriks(M, basis);
      const dapat = putarDenganQuat(q, basis);
      const selisih = Math.max(...harap.map((h, i) => Math.abs(h - dapat[i])));
      // Rapier menyimpan quaternion dalam float32: galat ~1e-7 wajar, 1e-5 tidak.
      assert.ok(selisih < 1e-5,
        `putar [${putar}] sumbu [${basis}]: harap [${harap.map((v) => v.toFixed(4))}], dapat [${dapat.map((v) => v.toFixed(4))}]`);
    }
  }
});
