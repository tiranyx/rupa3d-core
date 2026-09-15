/* Uji kendali karakter — di Node, dengan jam yang saya pegang sendiri.
 *
 * Uji ini ada dalam bentuk begini karena satu temuan: runtime digerakkan
 * `requestAnimationFrame`, dan rAF menyala NOL kali per detik saat tabnya
 * tidak dilukis. Browser otomatis melaporkan pemain tidak bergerak berkali-
 * kali, dan tiap kali itu bukan bug kendalinya.
 *
 * Alat uji yang tidak bisa menggerakkan jamnya sendiri tidak bisa menguji
 * apa pun yang bergantung pada waktu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dunia, tambahBadan } from './fisika.mjs';
import { buatKarakter, jalanKarakter, langkahKarakter, KECEPATAN } from './karakter.mjs';

async function panggung({ langkah = 1 / 60 } = {}) {
  const d = await dunia({ langkah });
  tambahBadan(d, {
    jenis: 'statis', bentuk: 'kotak', ukuran: [60, 0.4, 60], posisi: [0, -0.2, 0], gesekan: 0.9,
  });
  return d;
}

/* ── Berjalan ───────────────────────────────────────────────────────── */

test('berjalan maju menempuh jarak yang mendekati kecepatan × waktu', async () => {
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.3 });                       // mendarat dulu
  const awal = k.badan.translation().z;
  jalanKarakter(k, { detik: 2, arah: [0, -1] });
  const jarak = Math.abs(k.badan.translation().z - awal);

  const diharap = KECEPATAN * 2;
  assert.ok(Math.abs(jarak - diharap) / diharap < 0.05,
    `menempuh ${jarak.toFixed(3)} m, harusnya sekitar ${diharap} m`);
});

/* Uji di atas lolos dengan toleransi 5 % pada JARAK AKHIR, jadi langkah yang tersendat tidak
   terlihat. Galantara (15 Sep 2026) mengukur tiap langkah: karakter yang MENAPAK tetap didorong
   gravitasi ke bawah (≈5 mm/langkah), dorongan masuk ke kulit offset, lalu sesekali seluruh gerak —
   termasuk horizontal — terbuang. Maka yang diperiksa di sini TIAP langkah, bukan hanya akhirnya. */
test('berjalan lurus di lantai datar: TIDAK ADA langkah yang tersendat', async () => {
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.5 });                       // mendarat dan tenang dulu
  const perLangkah = KECEPATAN / 60, awal = k.badan.translation().z;
  const tersendat = [];
  for (let i = 0; i < 600; i++) {
    const { gerak } = langkahKarakter(k, { dt: 1 / 60, arah: [0, -1] });
    if (Math.abs(gerak[2]) < 0.9 * perLangkah) tersendat.push(`#${i}: ${gerak[2].toFixed(4)}`);
  }
  const jarak = Math.abs(k.badan.translation().z - awal);
  assert.equal(tersendat.length, 0, `${tersendat.length} dari 600 langkah bergerak < 90 % dari ${perLangkah} m: ${tersendat.slice(0, 5).join(', ')}`);
  assert.ok(Math.abs(jarak - KECEPATAN * 10) < 0.005 * KECEPATAN * 10, `menempuh ${jarak.toFixed(3)} m dari ${KECEPATAN * 10} m`);
});

test('arah diagonal TIDAK lebih cepat daripada lurus', async () => {
  /* Kesalahan klasik: menjumlahkan dua masukan tanpa menormalkan, sehingga
     berjalan diagonal 1,41x lebih cepat. Pemain menemukannya dalam semenit;
     tidak ada yang menemukannya dari membaca kode. */
  const d1 = await panggung();
  const k1 = buatKarakter(d1, { posisi: [0, 1, 0] });
  jalanKarakter(k1, { detik: 0.3 });
  const a1 = k1.badan.translation();
  jalanKarakter(k1, { detik: 1.5, arah: [0, -1] });
  const b1 = k1.badan.translation();
  const lurus = Math.hypot(b1.x - a1.x, b1.z - a1.z);

  const d2 = await panggung();
  const k2 = buatKarakter(d2, { posisi: [0, 1, 0] });
  jalanKarakter(k2, { detik: 0.3 });
  const a2 = k2.badan.translation();
  jalanKarakter(k2, { detik: 1.5, arah: [1, -1] });
  const b2 = k2.badan.translation();
  const miring = Math.hypot(b2.x - a2.x, b2.z - a2.z);

  assert.ok(Math.abs(miring - lurus) / lurus < 0.02,
    `diagonal ${miring.toFixed(3)} vs lurus ${lurus.toFixed(3)} — selisih berarti arah tidak dinormalkan`);
});

test('diam berarti benar-benar diam', async () => {
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.5 });
  const a = k.badan.translation();
  jalanKarakter(k, { detik: 3 });
  const b = k.badan.translation();
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 1e-4,
    'karakter yang hanyut tanpa masukan akan menyeberangi peta dalam satu jam');
});

/* ── Gravitasi & tanah ──────────────────────────────────────────────── */

test('jatuh lalu MENDARAT dan berhenti di ketinggian yang benar', async () => {
  const d = await panggung();
  const tinggi = 1.7;
  const jari = 0.3;
  const k = buatKarakter(d, { posisi: [0, 6, 0], tinggi, jari });
  const h = jalanKarakter(k, { detik: 3 });
  assert.equal(h.pernah_menapak, true, 'tidak pernah menyentuh tanah');
  /* Pusat kapsul harus berhenti di sekitar setengah tingginya di atas lantai. */
  assert.ok(Math.abs(h.posisi[1] - tinggi / 2) < 0.12,
    `berhenti di y=${h.posisi[1].toFixed(4)}, harusnya sekitar ${tinggi / 2}`);
});

test('TIDAK menembus lantai meski dijatuhkan dari tinggi', async () => {
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 60, 0] });
  const h = jalanKarakter(k, { detik: 6 });
  assert.ok(h.y_min > 0, `pernah turun sampai y=${h.y_min} — menembus lantai`);
});

test('dt yang tersendat DIBATASI, bukan diteruskan', async () => {
  /* Satu bingkai 2 detik (tab kembali dari latar, GC, muat tekstur) akan
     memindahkan pemain 9 meter dalam satu langkah — menembus dinding yang
     seharusnya menahannya. */
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.3 });
  const a = k.badan.translation().z;
  langkahKarakter(k, { dt: 2.0, arah: [0, -1] });
  const pindah = Math.abs(k.badan.translation().z - a);
  assert.ok(pindah < KECEPATAN * (1 / 20) + 0.01,
    `pindah ${pindah.toFixed(3)} m dalam satu langkah tersendat — batasnya ${(KECEPATAN / 20).toFixed(3)} m`);
});

/* ── Lompat ─────────────────────────────────────────────────────────── */

test('lompat menaikkan, lalu turun lagi ke tanah', async () => {
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.5 });
  const dasar = k.badan.translation().y;
  const h = jalanKarakter(k, { detik: 1.5, lompatSekali: true });
  assert.ok(h.y_maks > dasar + 0.4, `puncak lompat cuma ${(h.y_maks - dasar).toFixed(3)} m`);
  assert.ok(Math.abs(h.posisi[1] - dasar) < 0.05, 'harus kembali mendarat');
});

test('lompat di UDARA tidak berlaku', async () => {
  /* Tanpa penjaga `menapak`, menahan spasi memberi lompat tak terbatas. */
  const d = await panggung();
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.5 });
  const dasar = k.badan.translation().y;
  const h = jalanKarakter(k, { detik: 2.5, lompat: true });   // ditahan terus
  assert.ok(h.y_maks < dasar + 1.2,
    `naik sampai ${(h.y_maks - dasar).toFixed(2)} m dengan spasi ditahan — lompat ganda tak terbatas`);
});

/* ── Tangga & lereng: alasan memakai karakter kinematik ─────────────── */

test('NAIK ANAK TANGGA tanpa melompat', async () => {
  const d = await panggung();
  for (let i = 0; i < 4; i++) {
    tambahBadan(d, {
      jenis: 'statis', bentuk: 'kotak', ukuran: [4, 0.3, 1.0],
      posisi: [0, 0.15 + i * 0.28, -1.5 - i * 1.0], gesekan: 0.9,
    });
  }
  const k = buatKarakter(d, { posisi: [0, 1, 0.5] });
  jalanKarakter(k, { detik: 0.4 });
  const y0 = k.badan.translation().y;
  /* Yang dinilai TINGGI TERTINGGI yang dicapai, bukan tinggi akhir.
     Versi pertama berjalan 3 detik pada 4,5 m/s — 13,5 m — sehingga
     karakternya melewati seluruh tangga sepanjang 4 m dan turun di sisi
     lain, mendarat kembali di lantai. Ia melaporkan "naik 0,000 m" untuk
     pendakian yang sebenarnya berhasil sempurna. */
  const h = jalanKarakter(k, { detik: 1.1, arah: [0, -1] });
  assert.ok(h.y_maks > y0 + 0.5,
    `naik cuma ${(h.y_maks - y0).toFixed(3)} m — badan dinamis akan tersangkut di sini`);
  assert.ok(h.pernah_menapak, 'harus tetap menapak sepanjang pendakian, bukan melompat');
});

test('lereng LANDAI didaki; lereng CURAM tidak', async () => {
  /* Lerengnya ditempatkan supaya ujung DEKATNYA menyentuh lantai, dan itu
     butuh dua perbaikan karena dua kali geometri ujinya yang salah, bukan
     pengendalinya:
       1. kotak 8 m dimiringkan pada ketinggian tetap -> ujung dekatnya di
          BAWAH lantai
       2. tanda putarannya terbalik -> ujung dekatnya terangkat ke y = 2,25 m,
          yang bagi karakter adalah TEMBOK, bukan tanjakan
     Untuk putaran +θ terhadap sumbu X, ujung ber-z POSITIF turun sebesar
     (panjang/2)·sin θ. Itu yang dipakai di bawah, dan diperiksa lewat
     tinggi ujung dekatnya sebelum karakternya dijalankan. */
  const buat = async (derajat) => {
    const d = await panggung();
    const panjang = 5;
    const rad = (derajat * Math.PI) / 180;
    const pusatY = (panjang / 2) * Math.sin(rad);
    tambahBadan(d, {
      jenis: 'statis', bentuk: 'kotak', ukuran: [6, 0.3, panjang],
      posisi: [0, pusatY, -1.2 - (panjang / 2) * Math.cos(rad)],
      putar: [derajat, 0, 0], gesekan: 0.9,
    });
    /* Ujung dekat harus benar-benar menyentuh lantai. Kalau tidak, yang
       diuji bukan lereng melainkan tembok — dan itu sudah terjadi dua kali. */
    const yUjungDekat = pusatY - (panjang / 2) * Math.sin(rad);
    assert.ok(Math.abs(yUjungDekat) < 0.05,
      `ujung dekat lereng ${derajat}° di y=${yUjungDekat.toFixed(3)}, bukan di lantai`);
    const k = buatKarakter(d, { posisi: [0, 1, 0.5] });
    jalanKarakter(k, { detik: 0.4 });
    const y0 = k.badan.translation().y;
    const h = jalanKarakter(k, { detik: 1.6, arah: [0, -1] });
    return h.y_maks - y0;
  };
  const landai = await buat(25);
  const curam = await buat(70);
  assert.ok(landai > 0.3, `lereng 25° cuma naik ${landai.toFixed(3)} m`);
  assert.ok(curam < landai * 0.7,
    `lereng 70° naik ${curam.toFixed(3)} m vs landai ${landai.toFixed(3)} — `
    + 'di atas maxSlopeClimbAngle 50° seharusnya tidak didaki');
});

/* ── Tabrakan ───────────────────────────────────────────────────────── */

test('DITAHAN dinding, tidak menembusnya', async () => {
  const d = await panggung();
  tambahBadan(d, {
    jenis: 'statis', bentuk: 'kotak', ukuran: [10, 4, 0.4], posisi: [0, 2, -3],
  });
  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.4 });
  const h = jalanKarakter(k, { detik: 4, arah: [0, -1] });
  assert.ok(h.posisi[2] > -3, `menembus dinding, berhenti di z=${h.posisi[2].toFixed(3)}`);
  assert.ok(h.posisi[2] < -1.5, `berhenti terlalu jauh dari dinding: z=${h.posisi[2].toFixed(3)}`);
});

test('collider CEMBUNG menahan karakter sama seperti kotak', async () => {
  /* D9 dipakai D10: proksi cembung yang diukur harus benar-benar menabrak. */
  const d = await panggung();
  const R = d.R;
  const titik = [];
  for (const x of [-2, 2]) for (const y of [0, 3]) for (const z of [-0.3, 0.3]) titik.push(x, y, z);
  const badan = d.w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, -3));
  d.w.createCollider(R.ColliderDesc.convexHull(new Float32Array(titik)), badan);

  const k = buatKarakter(d, { posisi: [0, 1, 0] });
  jalanKarakter(k, { detik: 0.4 });
  const h = jalanKarakter(k, { detik: 4, arah: [0, -1] });
  assert.ok(h.posisi[2] > -3.2, `menembus hull cembung, berhenti di z=${h.posisi[2].toFixed(3)}`);
});
