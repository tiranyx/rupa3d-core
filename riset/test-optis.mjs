/* Uji OPTIS — seluruh acuannya dihitung tanpa alat apa pun.
 *
 * Sentroid segitiga ada di sepertiga tinggi dari alasnya. Itu geometri dasar,
 * bukan hasil pengukuran, dan bukan angka yang diambil dari alat lain.
 *
 * Kalau instrumennya menjawab lain, INSTRUMENNYA yang salah. Itu satu-satunya
 * cara sebuah alat ukur baru boleh dipercaya — dan itu pendirian yang sama
 * yang sudah sepuluh kali menyelamatkan repo ini.
 *
 * Bentuk digambar SENDIRI ke dalam buffer di sini, bukan dimuat dari berkas
 * gambar. Berkas gambar membawa antialias, gamma, dan pembulatan alat yang
 * membuatnya — dan acuan yang mewarisi ketidakpastian alat lain bukan acuan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { massaTinta, penengahanOptis, bandingBentuk, SUMBER_MASSA } from './ukur/optis.mjs';

/** Kanvas RGBA kosong, alfa nol. */
function kanvas(lebar, tinggi) {
  return { rgba: new Uint8Array(lebar * tinggi * 4), lebar, tinggi };
}

/** Isi tiap piksel yang PUSATNYA memenuhi `di`, dengan massa penuh.
 *
 *  Tanpa antialias, dan itu disengaja: bentuk yang tepinya tegas punya
 *  sentroid yang bisa dihitung persis, dan galat sisa cuma diskretisasi —
 *  yang mengecil dengan resolusi dan bisa diperiksa dengan menaikkannya. */
function isi(k, di) {
  for (let y = 0; y < k.tinggi; y++) {
    for (let x = 0; x < k.lebar; x++) {
      if (!di(x + 0.5, y + 0.5)) continue;
      const i = (y * k.lebar + x) * 4;
      k.rgba[i] = 0; k.rgba[i + 1] = 0; k.rgba[i + 2] = 0; k.rgba[i + 3] = 255;
    }
  }
  return k;
}

const dekat = (a, b, tol, pesan) =>
  assert.ok(Math.abs(a - b) <= tol, `${pesan}: ${a} vs ${b} (toleransi ${tol})`);

/* ── Bentuk yang sentroidnya diketahui geometri dasar ──────────────────── */

test('BUJUR SANGKAR — sentroid tepat di pusat geometrisnya', () => {
  const N = 200;
  const k = isi(kanvas(N, N), (x, y) => x >= 40 && x < 160 && y >= 40 && y < 160);
  const m = massaTinta(k);
  assert.equal(m.sumber, 'alfa');
  dekat(m.sentroid[0], 100, 1e-6, 'sentroid x');
  dekat(m.sentroid[1], 100, 1e-6, 'sentroid y');
  assert.equal(m.massa, 120 * 120, 'massa = luasnya, karena alfa penuh');
  assert.deepEqual(m.kotak.ukuran, [120, 120]);
});

test('LINGKARAN — sentroid di pusat, dan massanya mendekati πr²', () => {
  const N = 400; const r = 150;
  const k = isi(kanvas(N, N), (x, y) => (x - 200) ** 2 + (y - 200) ** 2 <= r * r);
  const m = massaTinta(k);
  dekat(m.sentroid[0], 200, 1e-6, 'sentroid x');
  dekat(m.sentroid[1], 200, 1e-6, 'sentroid y');
  // Diskretisasi: luas terhitung mendekati πr² dari bawah/atas dengan galat
  // yang berskala dengan kelilingnya, jadi ~O(r) piksel dari ~O(r²).
  const analitik = Math.PI * r * r;
  const galat = Math.abs(m.massa - analitik) / analitik;
  assert.ok(galat < 0.002, `luas meleset ${(galat * 100).toFixed(3)} % dari πr²`);
});

test('SEGITIGA — sentroid di SEPERTIGA tinggi dari alasnya', () => {
  /* Segitiga siku-siku, alas di bawah (y = 300), apeks di kiri-atas.
     Sentroid segitiga = rata-rata ketiga titik sudutnya. Titiknya
     (0,0), (300,300), (0,300)  →  sentroid (100, 200).
     Yaitu SEPERTIGA lebar dari sisi tegaknya, dan sepertiga tinggi dari
     alasnya. Tidak ada alat yang dipakai untuk mengetahui itu. */
  const N = 300;
  const k = isi(kanvas(N, N), (x, y) => y >= x && y < N);
  const m = massaTinta(k);
  dekat(m.sentroid[0], 100, 0.6, 'sentroid x harus di sepertiga lebar');
  dekat(m.sentroid[1], 200, 0.6, 'sentroid y harus di dua-pertiga tinggi');
});

/* ── Kasus yang membuat riset ini ada ──────────────────────────────────── */

test('TOMBOL PUTAR — segitiga menghadap kanan condong TEPAT seperenam lebarnya', () => {
  /* Ini kasus yang setiap desainer selesaikan dengan menggeser "sedikit ke
     kanan". Besarnya bisa dihitung, dan hasilnya bukan "sedikit":

       titik sudut (0,0), (0,h), (w,h/2)
       sentroid x  = (0 + 0 + w) / 3 = w/3
       pusat kotak = w/2
       selisih     = w/3 - w/2 = -w/6

     Seperenam lebar segitiganya, ke KIRI. Jadi untuk menengahkannya secara
     optis, segitiga itu digeser ke KANAN sebanyak w/6 — dan seperenam bukan
     angka yang bisa ditakar mata dengan andal. */
  const W = 300; const H = 300;
  const k = isi(kanvas(W, H), (x, y) => {
    // di dalam segitiga (0,0)-(0,H)-(W,H/2)
    const t = x / W;               // 0 di sisi tegak, 1 di apeks
    return y >= (H / 2) * t && y <= H - (H / 2) * t;
  });
  const p = penengahanOptis(k);

  dekat(p.condong_bentuk_persen[0], -100 / 6, 0.35,
    'condong x harus -16,667 % lebar segitiganya');
  dekat(p.condong_bentuk_persen[1], 0, 0.05, 'simetris tegak, jadi condong y nol');

  // Dan sentroidnya sendiri di sepertiga lebar.
  dekat(p.sentroid[0], W / 3, 1.0, 'sentroid x = w/3');
});

test('bentuk SIMETRIS tidak condong — pemeriksanya tidak asal menemukan', () => {
  /* Alat yang menemukan kecondongan pada bentuk simetris akan menyuruh orang
     menggeser hal yang sudah benar. Diuji supaya ia tidak bisa. */
  const N = 200;
  for (const [nama, di] of [
    ['bujur sangkar', (x, y) => x >= 50 && x < 150 && y >= 50 && y < 150],
    ['lingkaran', (x, y) => (x - 100) ** 2 + (y - 100) ** 2 <= 60 * 60],
  ]) {
    const p = penengahanOptis(isi(kanvas(N, N), di));
    dekat(p.condong_bentuk_persen[0], 0, 0.01, `${nama} condong x`);
    dekat(p.condong_bentuk_persen[1], 0, 0.01, `${nama} condong y`);
  }
});

test('geser dilaporkan terhadap BINGKAI dan terhadap BENDANYA — keduanya', () => {
  // Bujur sangkar 60x60 di pojok kiri-atas kanvas 300x300.
  const k = isi(kanvas(300, 300), (x, y) => x >= 20 && x < 80 && y >= 20 && y < 80);
  const p = penengahanOptis(k);
  // Sentroid di (50,50); pusat kanvas (150,150); geser = -100.
  dekat(p.geser[0], -100, 1e-6, 'geser x');
  dekat(p.geser_persen_bingkai[0], -100 / 3, 1e-3, 'terhadap bingkai 300 px');
  dekat(p.geser_persen_benda[0], -100 / 60 * 100, 1e-3, 'terhadap benda 60 px');
  // Dan bentuknya sendiri tidak condong — ia cuma diletakkan di tempat lain.
  dekat(p.condong_bentuk_persen[0], 0, 0.01, 'bujur sangkar tidak condong');
});

/* ── Yang membuat angkanya bisa dibaca dengan benar ────────────────────── */

test('massa BERBOBOT, bukan hitung piksel — tepi separuh membawa massa separuh', () => {
  const k = kanvas(10, 1);
  for (let x = 0; x < 10; x++) {
    const i = x * 4;
    // alfa naik rata 0..255; massanya harus mengikuti, bukan jadi 0/1
    k.rgba[i + 3] = Math.round((x / 9) * 255);
  }
  const m = massaTinta(k, { ambang: -1 });
  const harap = Array.from({ length: 10 }, (_, x) => Math.round((x / 9) * 255) / 255)
    .reduce((a, b) => a + b, 0);
  dekat(m.massa, harap, 1e-5, 'massa harus jumlah alfa, bukan jumlah piksel');
  assert.notEqual(m.massa, 10, 'kalau sama dengan hitung piksel, bobotnya tidak dipakai');
});

test('gambar TANPA tinta melaporkan null, bukan pusat kanvas', () => {
  const m = massaTinta(kanvas(100, 100));
  assert.equal(m.massa, 0);
  assert.equal(m.sentroid, null,
    'pusat kanvas adalah jawaban yang masuk akal dan tidak pernah diukur');
  assert.equal(m.kotak, null);
  assert.match(m.catatan, /tidak ada tinta/);
  assert.equal(penengahanOptis(kanvas(100, 100)).geser, null);
});

test('sumber massa DINYATAKAN di hasilnya, dan yang tak dikenal DITOLAK', () => {
  const k = isi(kanvas(50, 50), (x) => x < 25);
  assert.equal(massaTinta(k).sumber, 'alfa', 'ada alfa → alfa');

  // Gambar buram: alfa penuh di mana-mana, jadi luminansi yang dipakai.
  const buram = kanvas(50, 50);
  for (let i = 0; i < buram.rgba.length; i += 4) {
    buram.rgba[i] = buram.rgba[i + 1] = buram.rgba[i + 2] = 255;
    buram.rgba[i + 3] = 255;
  }
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 25; x++) {
      const i = (y * 50 + x) * 4;
      buram.rgba[i] = buram.rgba[i + 1] = buram.rgba[i + 2] = 0;
    }
  }
  const m = massaTinta(buram);
  assert.equal(m.sumber, 'luminansi', 'tanpa alfa → luminansi');
  dekat(m.sentroid[0], 12.5, 1e-6, 'setengah kiri hitam → sentroid di seperempat');

  assert.throws(() => massaTinta(k, { sumber: 'entah' }), /tidak dikenal/);
  assert.deepEqual(Object.keys(SUMBER_MASSA).sort(), ['alfa', 'luminansi']);
});

test('LATAR dinyatakan, tidak ditebak dari piksel pojok', () => {
  /* Menebak latar dari pojok gagal diam-diam pada gambar yang pojoknya
     kebetulan berisi tinta — dan kegagalannya berupa sentroid yang masuk akal
     dan salah. Di sini latarnya WAJIB disebut kalau bukan putih. */
  const k = kanvas(40, 40);
  for (let i = 0; i < k.rgba.length; i += 4) {
    k.rgba[i] = k.rgba[i + 1] = k.rgba[i + 2] = 0; k.rgba[i + 3] = 255;   // latar hitam
  }
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 20; x++) {
      const i = (y * 40 + x) * 4;
      k.rgba[i] = k.rgba[i + 1] = k.rgba[i + 2] = 255;                     // tinta putih
    }
  }
  const salah = massaTinta(k);                                  // latar dikira putih
  const benar = massaTinta(k, { latar: [0, 0, 0] });
  dekat(benar.sentroid[0], 10, 1e-6, 'dengan latar benar: sentroid di seperempat kiri');
  dekat(salah.sentroid[0], 30, 1e-6, 'dengan latar salah: sentroid pindah ke kanan');
  assert.notEqual(salah.sentroid[0], benar.sentroid[0],
    'kalau latar tidak berpengaruh, parameternya tidak tersambung');
});

/* ── Overshoot: bahan keputusan, bukan keputusannya ────────────────────── */

test('LINGKARAN vs BUJUR SANGKAR setinggi sama — nisbah massanya π/4', () => {
  const N = 400;
  const kotak = isi(kanvas(N, N), (x, y) => x >= 50 && x < 350 && y >= 50 && y < 350);
  const bulat = isi(kanvas(N, N), (x, y) => (x - 200) ** 2 + (y - 200) ** 2 <= 150 * 150);
  const b = bandingBentuk(kotak, bulat);
  assert.equal(b.ok, true);
  dekat(b.nisbah_tinggi, 1, 0.01, 'tingginya memang dibuat sama');
  // Lingkaran bergaris tengah s bermassa πs²/4; bujur sangkar sisi s bermassa s².
  dekat(b.nisbah_massa, Math.PI / 4, 0.005, 'nisbah massa harus π/4 ≈ 0,7854');
  /* Dan untuk menyamakan massanya, lingkarannya harus 2/√π kali lebih besar.
     KOREKSI: assert pertama menulis `1 / skala_untuk_massa_sama` dan keluar
     0,8862 — yaitu √π/2, kebalikannya. Yang salah UJINYA, bukan
     instrumennya: `skala_untuk_massa_sama` memang sudah menjawab "berapa B
     harus diskalakan", jadi ia langsung 1,1284. Dicatat di sini karena angka
     0,8862 itu masuk akal, konsisten, dan salah — persis jenis yang lolos. */
  dekat(b.skala_untuk_massa_sama, 2 / Math.sqrt(Math.PI), 0.005,
    'skala massa-sama harus 2/√π ≈ 1,1284');
});

test('overshoot yang BENAR tidak diklaim — catatannya menyebutkan itu', () => {
  const N = 200;
  const a = isi(kanvas(N, N), (x, y) => x >= 50 && x < 150 && y >= 50 && y < 150);
  const b = isi(kanvas(N, N), (x, y) => (x - 100) ** 2 + (y - 100) ** 2 <= 52 * 52);
  const r = bandingBentuk(a, b);
  assert.match(r.catatan, /psikofisika/,
    'alat yang diam soal batasnya membuat pembacanya menyimpulkan lebih banyak '
    + 'daripada yang diukur');
  assert.ok(r.overshoot_persen > 0, 'lingkaran uji ini memang dibuat lebih tinggi');
});

test('bandingBentuk menolak gambar tanpa tinta, bukan mengarang nisbah', () => {
  const a = isi(kanvas(50, 50), (x) => x < 25);
  const r = bandingBentuk(a, kanvas(50, 50));
  assert.equal(r.ok, false);
  assert.match(r.alasan, /tidak punya tinta/);
});
