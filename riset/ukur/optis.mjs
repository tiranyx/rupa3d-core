/* OPTIS — geometri massa tinta, untuk penilaian yang hari ini dikerjakan mata.
 *
 * ── Pertanyaan yang dijawab berkas ini ───────────────────────────────────
 *
 * Setiap desainer menggeser ikon "sedikit ke kanan" supaya kelihatan tengah
 * di dalam tombolnya. Geseran itu nyata dan benar — mata menengahkan pada
 * MASSA, bukan pada kotak batas — tetapi besarnya selalu ditakar dengan
 * rasa.
 *
 * Besarnya bisa dihitung. Ia momen pertama massa tinta:
 *
 *     sentroid = ( Σ m(x,y)·x , Σ m(x,y)·y ) / Σ m(x,y)
 *
 * dan untuk segitiga menghadap kanan di dalam kotak, jaraknya keluar
 * **tepat seperenam lebar segitiganya**. Bukan "sedikit". Seperenam.
 *
 * ── Kenapa acuannya bisa dipercaya ───────────────────────────────────────
 *
 * Karena tidak satu pun diambil dari alat lain. Sentroid segitiga ada di
 * sepertiga tinggi dari alasnya; itu geometri dasar, bukan hasil pengukuran.
 * Kalau berkas ini menjawab lain, BERKAS INI yang salah.
 *
 * Aturan itu sama dengan yang dipakai seluruh repo Rupa3D, dan ia satu-
 * satunya cara sebuah alat ukur baru boleh dipercaya.
 *
 * ── Yang TIDAK diklaim ───────────────────────────────────────────────────
 *
 * Berkas ini tidak tahu apakah sebuah desain bagus. Ia tahu ikonnya meleset
 * 3,4 % ke kanan. Itu dua hal yang berbeda, dan mencampurnya akan mengubah
 * alat ukur jadi rubrik — persis yang sudah ada dan bukan yang kurang.
 */
import { bacaPNG } from '../../png.mjs';
import { readFileSync } from 'node:fs';

/**
 * Apa yang dihitung sebagai TINTA.
 *
 * Dua cara, dan yang dipakai DINYATAKAN di hasilnya — bukan ditebak dari
 * gambarnya. Menebak akan membuat gambar yang sama memberi dua angka berbeda
 * tergantung apakah ia kebetulan punya alfa.
 */
export const SUMBER_MASSA = {
  /** Alfa: cocok untuk aset transparan (ikon, logo, mark). */
  alfa: 'alfa',
  /** Jarak luminansi dari warna latar: cocok untuk gambar buram. */
  luminansi: 'luminansi',
};

/* Rec. 709. Dipakai karena ia yang dipakai sRGB dan hampir seluruh alat
   desain; memilih koefisien lain akan memberi angka yang tidak bisa
   dibandingkan dengan apa pun. */
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Massa tinta sebuah gambar, berikut sentroid dan kotak batasnya.
 *
 * MASSA BERBOBOT, bukan hitung piksel. Tepi yang di-antialias membawa massa
 * SEBAGIAN, dan itu bukan kerapian: mata melihatnya sebagian juga. Membulatkan
 * tiap piksel jadi 0 atau 1 membuat sentroid bergeser pada bentuk yang miring
 * atau melengkung — persis bentuk yang paling sering butuh penengahan optis.
 *
 * @param {{rgba: Uint8Array, lebar: number, tinggi: number}} gambar
 * @param {{sumber?: 'alfa'|'luminansi', latar?: [number,number,number],
 *          ambang?: number}} opsi
 */
export function massaTinta(gambar, opsi = {}) {
  const { rgba, lebar, tinggi } = gambar;
  const sumber = opsi.sumber ?? (adaAlfa(rgba) ? 'alfa' : 'luminansi');
  if (!SUMBER_MASSA[sumber]) {
    throw new Error(`sumber massa tidak dikenal: ${sumber}. `
      + `Yang ada: ${Object.keys(SUMBER_MASSA).join(', ')}`);
  }
  /* Latar DINYATAKAN, tidak ditebak dari piksel pojok. Menebak dari pojok
     gagal diam-diam pada gambar yang pojoknya kebetulan berisi tinta, dan
     kegagalannya berupa sentroid yang masuk akal dan salah. */
  const latar = opsi.latar ?? [255, 255, 255];
  const lumLatar = lum(latar[0], latar[1], latar[2]);
  const ambang = opsi.ambang ?? 0;

  let total = 0; let sx = 0; let sy = 0;
  let minX = Infinity; let minY = Infinity;
  let maksX = -Infinity; let maksY = -Infinity;
  let piksel = 0;

  for (let y = 0; y < tinggi; y++) {
    for (let x = 0; x < lebar; x++) {
      const i = (y * lebar + x) * 4;
      let m;
      if (sumber === 'alfa') {
        m = rgba[i + 3] / 255;
      } else {
        m = Math.abs(lum(rgba[i], rgba[i + 1], rgba[i + 2]) - lumLatar) / 255;
      }
      if (m <= ambang) continue;
      total += m;
      /* Pusat piksel, bukan pojoknya. Memakai (x, y) polos menggeser seluruh
         sentroid setengah piksel — kecil, tetapi ia galat SISTEMATIS yang
         tidak pernah hilang berapa pun resolusinya. */
      sx += m * (x + 0.5);
      sy += m * (y + 0.5);
      piksel++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maksX) maksX = x;
      if (y > maksY) maksY = y;
    }
  }

  if (total === 0) {
    /* Gambar tanpa tinta melaporkan `null`, bukan sentroid di tengah kanvas.
       Titik tengah kanvas adalah jawaban yang MASUK AKAL dan tidak pernah
       diukur — kelas kesalahan yang sudah beberapa kali menggigit repo ini. */
    return {
      sumber, massa: 0, piksel: 0, sentroid: null, kotak: null,
      cakupan: 0, catatan: 'tidak ada tinta di atas ambang',
    };
  }

  return {
    sumber,
    massa: Number(total.toFixed(6)),
    piksel,
    sentroid: [Number((sx / total).toFixed(6)), Number((sy / total).toFixed(6))],
    kotak: {
      min: [minX, minY],
      maks: [maksX + 1, maksY + 1],
      ukuran: [maksX + 1 - minX, maksY + 1 - minY],
      pusat: [(minX + maksX + 1) / 2, (minY + maksY + 1) / 2],
    },
    cakupan: Number((total / (lebar * tinggi)).toFixed(6)),
  };
}

function adaAlfa(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
  return false;
}

/**
 * Seberapa jauh massa tintanya dari tengah bingkai — dan ke arah mana.
 *
 * Inilah angka yang selama ini ditakar mata. Positif = tintanya condong ke
 * kanan/bawah, jadi untuk menengahkannya secara optis benda itu digeser ke
 * arah SEBALIKNYA sebanyak itu.
 *
 * @param {{rgba, lebar, tinggi}} gambar
 * @param {{bingkai?: {x, y, lebar, tinggi}}} opsi bingkai acuan; kosong =
 *        seluruh kanvas
 */
export function penengahanOptis(gambar, opsi = {}) {
  const m = massaTinta(gambar, opsi);
  if (!m.sentroid) return { ...m, geser: null };

  const b = opsi.bingkai ?? { x: 0, y: 0, lebar: gambar.lebar, tinggi: gambar.tinggi };
  const pusatBingkai = [b.x + b.lebar / 2, b.y + b.tinggi / 2];

  const dx = m.sentroid[0] - pusatBingkai[0];
  const dy = m.sentroid[1] - pusatBingkai[1];

  /* Dua persentase, dan bedanya penting:
       - terhadap BINGKAI  = seberapa terlihat melesetnya di dalam tombolnya
       - terhadap BENDANYA = seberapa jauh bendanya harus digeser
     Melaporkan satu saja memaksa pembacanya membagi sendiri, dan angka yang
     harus diolah lagi sebelum dipakai adalah angka yang akan salah dipakai. */
  const bulat = (v) => Number(v.toFixed(4));
  return {
    ...m,
    pusat_bingkai: pusatBingkai,
    pusat_kotak: m.kotak.pusat,
    geser: [bulat(dx), bulat(dy)],
    geser_persen_bingkai: [bulat((dx / b.lebar) * 100), bulat((dy / b.tinggi) * 100)],
    geser_persen_benda: [
      bulat((dx / m.kotak.ukuran[0]) * 100),
      bulat((dy / m.kotak.ukuran[1]) * 100),
    ],
    /* Selisih sentroid terhadap pusat KOTAK BATASNYA sendiri — inilah
       besaran yang murni sifat bentuknya, lepas dari di mana ia diletakkan.
       Segitiga menghadap kanan: tepat -16,667 % lebarnya. */
    condong_bentuk_persen: [
      bulat(((m.sentroid[0] - m.kotak.pusat[0]) / m.kotak.ukuran[0]) * 100),
      bulat(((m.sentroid[1] - m.kotak.pusat[1]) / m.kotak.ukuran[1]) * 100),
    ],
  };
}

/**
 * Bandingkan dua bentuk yang DIMAKSUDKAN terbaca seukuran.
 *
 * Menjawab pertanyaan overshoot dengan besaran, bukan dengan kebiasaan:
 * berapa nisbah tinggi kotaknya, berapa nisbah massa tintanya, dan berapa
 * tinggi yang DIPERLUKAN kalau keduanya harus bermassa sama.
 *
 * ── Yang tidak dijawabnya ────────────────────────────────────────────────
 *
 * Berapa overshoot yang BENAR. Itu psikofisika — seberapa besar sebuah
 * lingkaran harus digambar supaya TERLIHAT setinggi kotak — dan tidak ada
 * rumus tertutupnya. Yang ada di sini bahan untuk memutuskannya, bukan
 * keputusannya.
 *
 * Acuan yang memang tertutup, dan dilaporkan: lingkaran bermassa sama dengan
 * bujur sangkar bergaris tengah 2/√π ≈ 1,1284 kali sisinya.
 */
export function bandingBentuk(a, b, opsi = {}) {
  const ma = massaTinta(a, opsi);
  const mb = massaTinta(b, opsi);
  if (!ma.sentroid || !mb.sentroid) {
    return { ok: false, alasan: 'salah satu gambar tidak punya tinta' };
  }
  const bulat = (v) => Number(v.toFixed(4));
  const tinggiA = ma.kotak.ukuran[1];
  const tinggiB = mb.kotak.ukuran[1];

  /* Kalau massanya harus sama, dan bentuknya sebangun terhadap dirinya
     sendiri, tingginya harus dikalikan akar nisbah massanya. */
  const skalaMassaSama = Math.sqrt(ma.massa / mb.massa);

  return {
    ok: true,
    tinggi: [tinggiA, tinggiB],
    nisbah_tinggi: bulat(tinggiB / tinggiA),
    massa: [ma.massa, mb.massa],
    nisbah_massa: bulat(mb.massa / ma.massa),
    /* Berapa B harus diskalakan supaya massanya sama dengan A. */
    skala_untuk_massa_sama: bulat(skalaMassaSama),
    /* Overshoot yang BENAR-BENAR ADA di kedua gambar, dalam persen. */
    overshoot_persen: bulat((tinggiB / tinggiA - 1) * 100),
    catatan: 'Overshoot yang BENAR adalah psikofisika, bukan rumus. Yang di '
      + 'sini bahan untuk memutuskannya: nisbah tinggi yang ada, nisbah massa '
      + 'yang ada, dan skala yang menyamakan massanya.',
  };
}

/** Muat PNG jadi bentuk yang dipakai berkas ini. */
export function muatPNG(jalur) {
  const p = bacaPNG(readFileSync(jalur));
  return { rgba: p.rgba, lebar: p.lebar, tinggi: p.tinggi };
}
