/* Ruang kerja ADEGAN — adegan yang bertahan lintas panggilan MCP.
 *
 * Masalahnya sama persis dengan sisi CAD: tiap panggilan tool adalah
 * percakapan tersendiri, jadi adegan yang disusun panggilan pertama sudah
 * hilang saat panggilan kedua datang. Bedanya, adegan MEMANG data JSON,
 * jadi tidak ada yang perlu diserialisasi — ia tinggal ditulis.
 *
 * Satu berkas per ruang: `<ruang>/adegan.json`. Ruang yang sama juga memuat
 * `adegan.blend` (Blender) dan `cad/` (b-rep), jadi satu nama ruang membawa
 * ketiga sisi alat ini — dan aset yang dihasilkan Blender di ruang itu bisa
 * langsung ditunjuk adegannya tanpa menyalin apa pun.
 */
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { adeganBaru, periksaAdegan } from './adegan.mjs';

const BERKAS = 'adegan.json';

export const jalurAdegan = (ruang) => path.join(ruang, BERKAS);

/** Baca adegan ruang ini. Adegan yang belum ada BERBUNYI, tidak diam-diam
 *  dibuatkan: membuatkan diam-diam berarti `rupa_adegan_node` pada ruang yang
 *  salah ketik akan berhasil, dan node-nya menghilang ke adegan hantu. */
export function muatAdegan(ruang) {
  const p = jalurAdegan(ruang);
  if (!existsSync(p)) {
    throw new Error('belum ada adegan di ruang ini — panggil rupa_adegan_baru dulu');
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function simpanAdegan(ruang, adegan) {
  mkdirSync(ruang, { recursive: true });
  adegan.diubah = new Date().toISOString();
  writeFileSync(jalurAdegan(ruang), JSON.stringify(adegan, null, 2), 'utf8');
  return adegan;
}

/** Buat adegan baru di ruang ini, menimpa yang lama. */
export function mulaiAdegan(ruang, nama) {
  return simpanAdegan(ruang, adeganBaru(nama));
}

/**
 * Baca → ubah → periksa → simpan.
 *
 * Pemeriksaan berjalan SEBELUM menulis, jadi ruang kerjanya tidak pernah
 * memuat adegan cacat. Tanpa ini, satu panggilan yang salah meninggalkan
 * adegan rusak yang baru ketahuan saat terbit — jauh dari sebabnya.
 */
export function ubahAdegan(ruang, fn) {
  const adegan = muatAdegan(ruang);
  const hasil = fn(adegan);
  const cacat = periksaAdegan(adegan);
  if (cacat.length) {
    throw new Error(`perubahan ini membuat adegan cacat, TIDAK disimpan:\n  ${cacat.join('\n  ')}`);
  }
  simpanAdegan(ruang, adegan);
  return hasil;
}
