/* TERBIT — adegan jadi satu halaman yang berdiri sendiri.
 *
 * ── Kendala yang membentuk seluruh berkas ini ────────────────────────────
 *
 * Halaman terbit berjalan di bawah CSP yang HANYA mengizinkan skrip dari
 * beberapa CDN. Tidak ada gambar, tidak ada berkas GLB, tidak ada HDR, tidak
 * ada fetch ke host mana pun. Sebuah viewer yang memuat asetnya lewat URL
 * akan tampil sebagai LAYAR KOSONG — tanpa galat yang menyebut sebabnya,
 * karena kegagalannya terjadi di dalam loader.
 *
 * Jadi seluruh aset ditanam sebagai base64 di dalam halamannya, dan runtime
 * memanggil `loader.parse()` alih-alih `loader.load()`: nol permintaan
 * jaringan sesudah skrip CDN termuat.
 *
 * Ongkosnya nyata dan diukur, bukan diabaikan: base64 membengkakkan bita
 * sekitar 4/3. GLB 1,19 MB jadi ~1,59 MB di dalam halaman. Batas halaman
 * 16 MB, jadi anggarannya diperiksa di sini dan DITOLAK sebelum terbit —
 * bukan dibiarkan gagal di server.
 */
import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { periksaAdegan, skalaTimpang } from './adegan.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const CETAKAN = path.join(DI_SINI, 'runtime', 'pemandang.html');
const KARAKTER = path.join(DI_SINI, 'karakter.mjs');

/** Batas keras halaman terbit. Diperiksa SEBELUM menulis, supaya kegagalannya
 *  terjadi di sini dengan angka, bukan di server dengan penolakan. */
export const BATAS_BITA = 16 * 1024 * 1024;

/* Marjin 4%: halaman jadi punya JSON, HTML, dan CSS di luar asetnya, dan
   pembulatan base64 tidak persis 4/3. Menabrak batas di server berarti
   kehilangan seluruh unggahan; menabraknya di sini cuma pesan. */
const MARJIN = 0.96;

/**
 * Rakit adegan jadi HTML mandiri.
 *
 * @param {object} adegan
 * @param {{judul?: string, keluar?: string}} [opsi]
 * @returns {{html: string, bita: number, aset: object[], berkas: string|null}}
 */
export function terbitkan(adegan, { judul, keluar = null, mandiri = true } = {}) {
  const cacat = periksaAdegan(adegan);
  if (cacat.length) throw new Error(`adegan cacat, tidak diterbitkan:\n  ${cacat.join('\n  ')}`);

  /* Skala timpang dilaporkan, TIDAK menggagalkan: adegan yang sengaja
     memuat gedung dan gagang pintu memang timpang, dan alat yang menolak
     itu akan dimatikan orang. Yang penting angkanya SAMPAI ke mata. */
  const skala = skalaTimpang(adegan);

  /* Aset yang TIDAK dipakai node mana pun sengaja tidak ditanam. Menanamnya
     akan menambah megabita ke halaman untuk sesuatu yang tidak pernah
     dirender — dan itu tidak akan terlihat oleh siapa pun. */
  const dipakai = new Set(adegan.node.filter((n) => n.jenis === 'aset').map((n) => n.aset));
  const laporanAset = [];
  const asetTerbit = {};

  for (const [kunci, a] of Object.entries(adegan.aset)) {
    if (!dipakai.has(kunci)) {
      laporanAset.push({ kunci, bita: a.bita, ditanam: false, alasan: 'tidak dipakai node mana pun' });
      continue;
    }
    const b64 = readFileSync(a.berkas).toString('base64');
    asetTerbit[kunci] = { b64, bita: a.bita, sertifikat: a.sertifikat };
    laporanAset.push({
      kunci, bita: a.bita, base64_bita: b64.length, ditanam: true,
      mengembang: Number((b64.length / a.bita).toFixed(4)),
    });
  }

  const muatan = { ...adegan, aset: asetTerbit };
  /* Jalur berkas absolut dibuang: ia tidak berguna bagi pembaca halaman dan
     ia membocorkan susunan direktori mesin yang menerbitkannya. */
  for (const a of Object.values(muatan.aset)) delete a.berkas;

  const cetakan = readFileSync(CETAKAN, 'utf8');
  const nama = judul ?? adegan.nama ?? 'Adegan Rupa3D';
  /* Sumber `karakter.mjs` DISUNTIKKAN, bukan disalin ke cetakan.
     Salinan bisa menyimpang dari yang diuji, dan kalau ia menyimpang, uji
     karakter yang hijau di Node tidak mengatakan apa pun tentang halaman
     yang dikirim. `export` dan `import` dibuang karena isinya masuk ke
     lingkup modul yang sudah ada. */
  const karakter = readFileSync(KARAKTER, 'utf8')
    .replace(/^import[\s\S]*?;$/gm, '')
    .replace(/^export /gm, '');

  const badan = cetakan
    .replace('__JUDUL__', escHtml(nama))
    .replace('/*__KARAKTER__*/', karakter)
    .replace('/*__ADEGAN__*/ null', JSON.stringify(muatan));

  /* Dokumen MANDIRI membawa charset sendiri. Tanpa itu server statis apa pun
     menyajikannya sebagai windows-1252 dan tiap em-dash jadi "â€”" — terukur
     di halaman pertama alat ini, dan tidak terlihat sampai judulnya dibaca.
     Mode `mandiri: false` menghasilkan POTONGAN tanpa <html>/<head>/<body>,
     untuk penerbit yang memasang kerangkanya sendiri (Artifact claude.ai). */
  const html = mandiri ? dokumenPenuh(badan) : badan;

  const bita = Buffer.byteLength(html, 'utf8');
  if (bita > BATAS_BITA * MARJIN) {
    const besar = laporanAset.filter((x) => x.ditanam)
      .sort((a, b) => b.base64_bita - a.base64_bita)[0];
    throw new Error(
      `halaman ${(bita / 1048576).toFixed(2)} MB melewati anggaran `
      + `${((BATAS_BITA * MARJIN) / 1048576).toFixed(2)} MB.\n`
      + (besar ? `  penyumbang terbesar: aset "${besar.kunci}" `
        + `${(besar.base64_bita / 1048576).toFixed(2)} MB tertanam `
        + `(${(besar.bita / 1048576).toFixed(2)} MB asli)\n` : '')
      + `  turunkan dengan LOD (rupa_lod) atau kompresi Draco saat ekspor.`);
  }

  let berkas = null;
  if (keluar) {
    berkas = path.resolve(keluar);
    mkdirSync(path.dirname(berkas), { recursive: true });
    writeFileSync(berkas, html, 'utf8');
  }
  return { html, bita, aset: laporanAset, berkas, judul: nama, skala, mandiri };
}

/**
 * Bungkus potongan jadi dokumen HTML utuh.
 *
 * `<title>` DIPINDAHKAN ke head, bukan dibiarkan di badan. Browser memang
 * memulihkan `<title>` yang salah tempat, tetapi bergantung pada pemulihan
 * parser berarti hasilnya berbeda antar-browser dan antar-pembaca berkas —
 * dan berkas ini juga dibaca oleh pengindeks, pratinjau, dan alat lain yang
 * tidak sekedermawan browser.
 */
function dokumenPenuh(badan) {
  const cocok = badan.match(/<title>[\s\S]*?<\/title>\s*/i);
  const title = cocok ? cocok[0].trim() : '<title>Adegan Rupa3D</title>';
  const sisa = cocok ? badan.replace(cocok[0], '') : badan;
  return [
    '<!doctype html>',
    '<html lang="id">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    title,
    '<style>*{box-sizing:border-box;margin:0;padding:0}'
    + 'img{max-width:100%}[hidden]{display:none!important}</style>',
    '</head>',
    '<body>',
    sisa.trim(),
    '</body>',
    '</html>',
  ].join('\n');
}

/* Cetakan menaruh judul di dalam <title>; sebuah `<` di nama adegan akan
   memotong tag itu dan merusak seluruh halaman. */
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
