/* PNG — baca dan tulis, tanpa satu pun kebergantungan.
 *
 * ── Kenapa ditulis sendiri ───────────────────────────────────────────────
 *
 * Yang dibutuhkan cuma dua hal: ukuran gambar, dan pikselnya. PNG
 * terspesifikasi lengkap dan `zlib` sudah ada di Node, jadi ini sekitar 150
 * baris — bukan alasan untuk menambah kebergantungan yang harus diikuti
 * versinya selamanya.
 *
 * ── Yang didukung, dan yang TIDAK ────────────────────────────────────────
 *
 * Didukung: 8-bit, greyscale / greyscale+alpha / RGB / RGBA, non-interlaced.
 * Itu yang ditulis Blender, yang ditulis alat ini, dan yang ada di dalam GLB
 * pada praktiknya.
 *
 * TIDAK didukung dan DITOLAK dengan menyebut sebabnya: 16-bit, palet, dan
 * Adam7 interlace. Menghampirinya diam-diam akan menghasilkan angka piksel
 * yang salah — dan angka piksel yang salah adalah persis jenis kebohongan
 * yang alat ini ada untuk mencegahnya.
 */
import { inflateSync, deflateSync } from 'node:zlib';

const TANDA = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SALURAN = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Apakah bita ini PNG? Dipakai untuk memilah isi GLB tanpa menebak dari MIME. */
export const adalahPNG = (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(TANDA);

/** Header saja — murah, tidak menyentuh piksel. */
export function kepalaPNG(buf) {
  if (!adalahPNG(buf)) throw new Error('bukan berkas PNG');
  if (buf.readUInt32BE(8) !== 13 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('IHDR tidak ada di tempat yang seharusnya');
  }
  return {
    lebar: buf.readUInt32BE(16),
    tinggi: buf.readUInt32BE(20),
    kedalaman: buf[24],
    jenis_warna: buf[25],
    interlace: buf[28],
    saluran: SALURAN[buf[25]] ?? null,
  };
}

/** Balikkan filter PNG per baris. Inilah bagian yang membuat PNG bukan BMP. */
function balikFilter(mentah, lebar, tinggi, bpp) {
  const langkah = lebar * bpp;
  const keluar = Buffer.alloc(tinggi * langkah);
  let o = 0;
  for (let y = 0; y < tinggi; y++) {
    const filter = mentah[o++];
    const baris = mentah.subarray(o, o + langkah);
    o += langkah;
    const tujuan = keluar.subarray(y * langkah, (y + 1) * langkah);
    const atas = y > 0 ? keluar.subarray((y - 1) * langkah, y * langkah) : null;

    for (let i = 0; i < langkah; i++) {
      const a = i >= bpp ? tujuan[i - bpp] : 0;         // kiri
      const b = atas ? atas[i] : 0;                      // atas
      const c = atas && i >= bpp ? atas[i - bpp] : 0;    // kiri-atas
      let v = baris[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        /* Paeth: pilih tetangga yang paling dekat dengan perkiraan linear. */
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) {
        throw new Error(`filter PNG tidak dikenal: ${filter} di baris ${y}`);
      }
      tujuan[i] = v & 0xff;
    }
  }
  return keluar;
}

/**
 * Dekode PNG jadi RGBA8 datar.
 *
 * Selalu dikembalikan sebagai RGBA meski sumbernya greyscale — pemanggilnya
 * lalu tidak perlu bercabang, dan cabang yang lupa ditulis adalah cara paling
 * mudah membaca saluran yang salah.
 */
export function bacaPNG(buf) {
  const h = kepalaPNG(buf);
  if (h.kedalaman !== 8) {
    throw new Error(`kedalaman ${h.kedalaman} bit belum didukung — `
      + 'menghampirinya diam-diam akan memberi angka piksel yang salah');
  }
  if (h.jenis_warna === 3) throw new Error('PNG berpalet belum didukung');
  if (h.interlace) throw new Error('PNG Adam7 interlace belum didukung');
  const bpp = h.saluran;
  if (!bpp) throw new Error(`jenis warna ${h.jenis_warna} tidak dikenal`);

  const potongan = [];
  let o = 8;
  while (o < buf.length) {
    const panjang = buf.readUInt32BE(o);
    const jenis = buf.toString('ascii', o + 4, o + 8);
    if (jenis === 'IDAT') potongan.push(buf.subarray(o + 8, o + 8 + panjang));
    if (jenis === 'IEND') break;
    o += 12 + panjang;
  }
  if (!potongan.length) throw new Error('tidak ada IDAT — berkasnya tidak memuat piksel');

  const mentah = inflateSync(Buffer.concat(potongan));
  const datar = balikFilter(mentah, h.lebar, h.tinggi, bpp);

  const rgba = new Uint8Array(h.lebar * h.tinggi * 4);
  for (let i = 0, n = h.lebar * h.tinggi; i < n; i++) {
    const s = i * bpp;
    const d = i * 4;
    if (bpp === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = datar[s]; rgba[d + 3] = 255; }
    else if (bpp === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = datar[s]; rgba[d + 3] = datar[s + 1]; }
    else if (bpp === 3) { rgba[d] = datar[s]; rgba[d + 1] = datar[s + 1]; rgba[d + 2] = datar[s + 2]; rgba[d + 3] = 255; }
    else { rgba[d] = datar[s]; rgba[d + 1] = datar[s + 1]; rgba[d + 2] = datar[s + 2]; rgba[d + 3] = datar[s + 3]; }
  }
  return { ...h, rgba };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function potong(jenis, data) {
  const isi = Buffer.concat([Buffer.from(jenis, 'ascii'), data]);
  const b = Buffer.alloc(8 + data.length + 4);
  b.writeUInt32BE(data.length, 0);
  isi.copy(b, 4);
  b.writeUInt32BE(crc32(isi), 8 + data.length);
  return b;
}

/** Tulis RGBA8 jadi PNG. Dipakai untuk tekstur prosedural dan berkas uji. */
export function tulisPNG(lebar, tinggi, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lebar, 0);
  ihdr.writeUInt32BE(tinggi, 4);
  ihdr[8] = 8;      // kedalaman
  ihdr[9] = 6;      // RGBA
  const langkah = lebar * 4;
  const mentah = Buffer.alloc(tinggi * (langkah + 1));
  for (let y = 0; y < tinggi; y++) {
    mentah[y * (langkah + 1)] = 0;   // filter None: paling sederhana, dan
    // ukurannya tidak menentukan apa pun untuk berkas yang kita tulis sendiri
    Buffer.from(rgba.buffer, rgba.byteOffset + y * langkah, langkah)
      .copy(mentah, y * (langkah + 1) + 1);
  }
  return Buffer.concat([
    TANDA, potong('IHDR', ihdr),
    potong('IDAT', deflateSync(mentah, { level: 9 })),
    potong('IEND', Buffer.alloc(0)),
  ]);
}
