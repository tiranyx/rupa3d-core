/* TEKSTUR — dan satu angka yang hampir tidak pernah dihitung siapa pun.
 *
 * ── Pertanyaan yang sebenarnya ditanyakan orang ──────────────────────────
 *
 * Bukan "berapa resolusi teksturnya". Itu ada di properti berkas. Yang
 * ditanyakan sebenarnya:
 *
 *     Apakah tekstur ini CUKUP untuk benda ini?
 *     Apakah tekstur ini TERLALU BESAR untuk benda ini?
 *
 * Jawabannya satu angka: **piksel per meter**. Ia lahir dari perkalian
 * kerapatan texel (UV per meter dunia — sudah diukur `topologi.mjs`) dengan
 * ukuran teksturnya. Tekstur 2048² pada peti 0,5 m memberi ribuan piksel per
 * meter dan itu pemborosan; tekstur 512² pada dinding 20 m memberi puluhan
 * dan itu buram.
 *
 * Tidak ada alat yang menghitungnya otomatis, padahal keduanya angka yang
 * sudah tersedia.
 *
 * ── Tiga pemborosan yang tidak terlihat sama sekali ──────────────────────
 *
 *   PETA RATA        1024² berisi satu nilai yang sama = 4 MB VRAM untuk
 *                    sebuah angka yang cukup ditulis sebagai faktor
 *   ALFA SIA-SIA     RGBA yang alfanya 255 di mana-mana = 25% memori terbuang
 *   RESOLUSI SEMU    gambar 256² yang di-upscale jadi 1024² menempati memori
 *                    empat kali lipat untuk detail yang sama persis
 *
 * Ketiganya bisa diukur EKSAK dari pikselnya, dan tidak satu pun terlihat di
 * layar.
 */
import { readFileSync } from 'node:fs';
import { bacaGLB } from './glb.mjs';
import { bacaPNG, kepalaPNG, adalahPNG } from './png.mjs';
import { topologiGLB } from './topologi.mjs';

/* Peran slot glTF. Ruang warnanya BUKAN pilihan — spesifikasi glTF
   menetapkannya, dan menyalahi ketetapan itu menghasilkan bayangan yang
   salah tanpa satu pun galat. */
export const SLOT = {
  baseColorTexture: { peran: 'albedo', ruang: 'sRGB' },
  emissiveTexture: { peran: 'pancar', ruang: 'sRGB' },
  metallicRoughnessTexture: { peran: 'logam+kekasaran', ruang: 'linear' },
  normalTexture: { peran: 'normal', ruang: 'linear' },
  occlusionTexture: { peran: 'oklusi', ruang: 'linear' },
};

const pot2 = (n) => (n & (n - 1)) === 0 && n > 0;

/* ── Bita per piksel di GPU, per format ──────────────────────────────────
 *
 * `vram_bita` versi pertama cuma melaporkan RGBA8 — batas ATAS, dan itu
 * angka yang benar untuk asumsi yang salah. Produksi web memakai KTX2/Basis
 * Universal, yang di-transcode ke format blok GPU:
 *
 *   ETC1S -> BC1 / ETC1 / PVRTC   0,5 bita/piksel   (8x lebih kecil)
 *   UASTC -> BC7 / ASTC 4x4       1,0 bita/piksel   (4x lebih kecil)
 *
 * Melaporkan 4,00 MB untuk tiga tekstur 512² membuat orang menyimpulkan
 * asetnya berat, padahal terkompres ia sekitar 0,5 MB. Angka yang BENAR
 * untuk asumsi yang tidak dinyatakan sama menyesatkannya dengan angka yang
 * salah — dan itu pelajaran yang sama dengan `metallicFactor` di atas.
 *
 * Mipmap menambah 1/3 pada semuanya. */
export const BITA_PER_PIKSEL = {
  rgba8: 4,
  bc7: 1,       // UASTC
  bc1: 0.5,     // ETC1S
};
const MIPMAP = 4 / 3;

/** Apakah GLB ini sudah memakai tekstur terkompres GPU? */
function formatGpu(json, indeksGambar) {
  const im = json.images?.[indeksGambar];
  if (im?.mimeType === 'image/ktx2') return 'ktx2';
  const pakaiBasisu = (json.textures ?? []).some(
    (t) => t.extensions?.KHR_texture_basisu?.source === indeksGambar,
  );
  return pakaiBasisu ? 'ktx2' : null;
}

/** Turunkan gambar 2× dengan rata-rata kotak 2×2. */
function turunkan(rgba, w, h) {
  const W = w >> 1;
  const H = h >> 1;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 4; c++) {
        const i = (y * 2 * w + x * 2) * 4 + c;
        out[(y * W + x) * 4 + c] = (rgba[i] + rgba[i + 4] + rgba[i + w * 4] + rgba[i + w * 4 + 4]) >> 2;
      }
    }
  }
  return { rgba: out, lebar: W, tinggi: H };
}

/** Naikkan 2× dengan pengulangan piksel — pasangan `turunkan`. */
function naikkan(rgba, w, h) {
  const W = w * 2;
  const H = h * 2;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = ((y >> 1) * w + (x >> 1)) * 4;
      const d = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = rgba[s + c];
    }
  }
  return out;
}

/**
 * Ukur satu gambar.
 *
 * `resolusi_efektif` adalah bagian yang paling berguna dan paling jarang
 * dihitung: gambar diturunkan 2× lalu dinaikkan lagi, dan selisihnya diukur.
 * Kalau selisihnya hampir nol, separuh resolusinya tidak membawa informasi
 * apa pun — gambarnya hasil upscale, dan memorinya empat kali lipat untuk
 * detail yang sama persis.
 */
export function ukurGambar(buf, { peran = null } = {}) {
  if (!adalahPNG(buf)) {
    /* JPEG dan format lain: ukurannya bisa dibaca, pikselnya belum. Yang
       tidak bisa diukur dikatakan, bukan ditebak. */
    return {
      format: 'bukan-png', bita: buf.length,
      catatan: 'hanya PNG yang bisa diurai pikselnya di sini; ukuran dan '
        + 'pemeriksaan isi tidak tersedia untuk format ini',
    };
  }
  const g = bacaPNG(buf);
  const { rgba, lebar, tinggi } = g;
  const n = lebar * tinggi;

  /* ── Rata? ── */
  const p0 = [rgba[0], rgba[1], rgba[2], rgba[3]];
  let rata = true;
  let alfaPenuh = true;
  const mn = [255, 255, 255, 255];
  const mx = [0, 0, 0, 0];
  let jml = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) {
      const v = rgba[i * 4 + c];
      if (v !== p0[c]) rata = false;
      if (c === 3 && v !== 255) alfaPenuh = false;
      if (v < mn[c]) mn[c] = v;
      if (v > mx[c]) mx[c] = v;
      jml[c] += v;
    }
  }
  const rerata = jml.map((s) => s / n);

  /* ── Resolusi efektif ── */
  let efektif = null;
  if (lebar >= 4 && tinggi >= 4 && (lebar & 1) === 0 && (tinggi & 1) === 0) {
    const kecil = turunkan(rgba, lebar, tinggi);
    const balik = naikkan(kecil.rgba, kecil.lebar, kecil.tinggi);
    let galat = 0;
    for (let i = 0; i < n * 4; i++) galat += Math.abs(rgba[i] - balik[i]);
    const rerataGalat = galat / (n * 4);
    efektif = {
      galat_turun_naik: Number(rerataGalat.toFixed(4)),
      /* Ambang 0,5 level (dari 255) dipilih karena di bawah itu selisihnya
         di bawah kuantisasi 8-bit — separuh resolusinya benar-benar tidak
         membawa apa-apa. */
      kemungkinan_upscale: rerataGalat < 0.5,
    };
  }

  /* ── Normal map: |v| harus ≈ 1 sesudah didekode ── */
  let normal = null;
  if (peran === 'normal') {
    let jumlahPanjang = 0;
    let menyimpang = 0;
    const langkah = Math.max(1, Math.floor(n / 20000));   // cuplik, dan sebut
    let dicuplik = 0;
    for (let i = 0; i < n; i += langkah) {
      const x = (rgba[i * 4] / 255) * 2 - 1;
      const y = (rgba[i * 4 + 1] / 255) * 2 - 1;
      const z = (rgba[i * 4 + 2] / 255) * 2 - 1;
      const L = Math.hypot(x, y, z);
      jumlahPanjang += L;
      if (Math.abs(L - 1) > 0.1) menyimpang++;
      dicuplik++;
    }
    normal = {
      panjang_rerata: Number((jumlahPanjang / dicuplik).toFixed(5)),
      piksel_menyimpang_persen: Number(((menyimpang / dicuplik) * 100).toFixed(3)),
      dicuplik,
      /* Normal datar adalah (128,128,255). Rerata hijau jauh di bawah 128
         menandakan konvensi terbalik (DirectX −Y vs OpenGL +Y): lekukannya
         akan terlihat MENONJOL dan tonjolannya terlihat melekuk — salah yang
         tidak pernah tampak sebagai galat, cuma "kok aneh". */
      hijau_rerata: Number(rerata[1].toFixed(2)),
      biru_rerata: Number(rerata[2].toFixed(2)),
      terlihat_seperti_normal: Math.abs(jumlahPanjang / dicuplik - 1) < 0.15 && rerata[2] > 150,
    };
  }

  return {
    format: 'png', bita: buf.length, lebar, tinggi,
    jenis_warna: g.jenis_warna, saluran: g.saluran,
    pot: pot2(lebar) && pot2(tinggi),
    rata,
    warna_rata: rata ? `rgba(${p0.join(',')})` : null,
    alfa_terpakai: !alfaPenuh,
    alfa_sia_sia_bita: !alfaPenuh ? 0 : Math.round(lebar * tinggi),
    jangkauan: { min: mn, maks: mx },
    rerata: rerata.map((v) => Number(v.toFixed(2))),
    /* Variasi per saluran: peta yang jangkauannya nol tidak membawa
       informasi apa pun di saluran itu. */
    saluran_mati: [0, 1, 2].filter((c) => mn[c] === mx[c]).length,
    resolusi_efektif: efektif,
    normal,
    /* Peta MR memaketkan tiga hal berbeda di tiga saluran, dan spesifikasi
       glTF yang menetapkannya: R tidak dipakai, G = kekasaran, B = logam.
       Membaca "rerata RGB" pada peta ini tanpa tahu itu tidak berarti apa-apa. */
    mr: peran === 'logam+kekasaran' ? {
      kekasaran_rerata: Number((rerata[1] / 255).toFixed(4)),
      logam_rerata: Number((rerata[2] / 255).toFixed(4)),
      kekasaran_jangkauan: [mn[1] / 255, mx[1] / 255].map((v) => Number(v.toFixed(4))),
      catatan: 'nilai EFEKTIF = faktor × saluran ini; lihat `faktor`',
    } : null,
    /* VRAM: tiga angka, bukan satu. Yang dibayar di GPU bergantung pada
       format transcode-nya, dan menyebut satu angka saja berarti menyembunyikan
       asumsi yang menentukan hasilnya. Ukuran berkas (`bita`) adalah ongkos
       UNDUH; ini ongkos MEMORI, dan keduanya berbeda sampai delapan kali. */
    vram_bita: Math.round(lebar * tinggi * BITA_PER_PIKSEL.rgba8 * MIPMAP),
    vram: {
      rgba8: Math.round(lebar * tinggi * BITA_PER_PIKSEL.rgba8 * MIPMAP),
      bc7_uastc: Math.round(lebar * tinggi * BITA_PER_PIKSEL.bc7 * MIPMAP),
      bc1_etc1s: Math.round(lebar * tinggi * BITA_PER_PIKSEL.bc1 * MIPMAP),
      catatan: 'rgba8 = tak terkompres (batas ATAS). KTX2/Basis Universal '
        + 'di-transcode ke BC7 (UASTC, 4x lebih kecil) atau BC1 (ETC1S, 8x). '
        + 'Semua sudah termasuk mipmap penuh (+1/3).',
    },
  };
}

/**
 * Semua tekstur di sebuah GLB, berikut PERAN dan piksel-per-meternya.
 *
 * Peran ditentukan dari slot material yang menunjuknya — bukan dari nama
 * berkas. Nama berkas berbohong; slot tidak.
 */
export function teksturGLB(jalur, { hitungPikselPerMeter = true } = {}) {
  const { json, bin } = bacaGLB(readFileSync(jalur));
  const gambar = json.images ?? [];
  const tekstur = json.textures ?? [];
  const bahan = json.materials ?? [];

  /* Peta gambar → daftar peran. Satu gambar bisa dipakai beberapa slot,
     dan kalau perannya bertentangan (albedo sekaligus normal) itu sendiri
     temuan. */
  const peran = new Map();
  const faktor = new Map();
  const pakai = (idxTekstur, slot, f) => {
    const t = tekstur[idxTekstur];
    if (!t || t.source == null) return;
    if (!peran.has(t.source)) peran.set(t.source, new Set());
    peran.get(t.source).add(slot);
    if (f) faktor.set(t.source, { ...(faktor.get(t.source) ?? {}), ...f });
  };
  for (const m of bahan) {
    const pbr = m.pbrMetallicRoughness ?? {};
    /* FAKTORNYA ikut dicatat, dan itu bukan kelengkapan — di glTF nilai
       efektifnya adalah faktor DIKALI saluran teksturnya. Melaporkan
       "saluran B = 255" tanpa menyebut `metallicFactor: 0` mengundang
       kesimpulan bahwa bendanya logam penuh, padahal hasilnya nol. Saya
       sendiri hampir menyimpulkan itu dari laporan versi pertama. */
    if (pbr.baseColorTexture) {
      pakai(pbr.baseColorTexture.index, 'baseColorTexture',
        { baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1] });
    }
    if (pbr.metallicRoughnessTexture) {
      pakai(pbr.metallicRoughnessTexture.index, 'metallicRoughnessTexture', {
        metallicFactor: pbr.metallicFactor ?? 1,
        roughnessFactor: pbr.roughnessFactor ?? 1,
      });
    }
    if (m.normalTexture) {
      pakai(m.normalTexture.index, 'normalTexture', { normalScale: m.normalTexture.scale ?? 1 });
    }
    if (m.occlusionTexture) {
      pakai(m.occlusionTexture.index, 'occlusionTexture', { occlusionStrength: m.occlusionTexture.strength ?? 1 });
    }
    if (m.emissiveTexture) {
      pakai(m.emissiveTexture.index, 'emissiveTexture', { emissiveFactor: m.emissiveFactor ?? [0, 0, 0] });
    }
  }

  const hasil = gambar.map((im, i) => {
    let buf = null;
    if (im.bufferView != null) {
      const bv = json.bufferViews[im.bufferView];
      buf = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    } else if (im.uri && im.uri.startsWith('data:')) {
      buf = Buffer.from(im.uri.slice(im.uri.indexOf(',') + 1), 'base64');
    }
    const slot = [...(peran.get(i) ?? [])];
    const utama = slot.length ? SLOT[slot[0]] : null;

    if (!buf) {
      return {
        indeks: i, nama: im.name ?? null, slot,
        catatan: 'gambar menunjuk URI luar — tidak tertanam, tidak bisa diperiksa',
      };
    }
    const gpu = formatGpu(json, i);
    return {
      indeks: i, nama: im.name ?? null, mime: im.mimeType ?? null,
      format_gpu: gpu,
      slot, peran: utama?.peran ?? null, ruang_warna_semestinya: utama?.ruang ?? null,
      faktor: faktor.get(i) ?? null,
      /* Satu gambar yang dipakai sebagai albedo DAN normal sekaligus tidak
         mungkin benar: yang satu sRGB, yang lain linear. */
      slot_bertentangan: slot.length > 1
        && new Set(slot.map((s) => SLOT[s]?.ruang)).size > 1,
      ...ukurGambar(buf, { peran: utama?.peran ?? null }),
    };
  });

  /* ── Piksel per meter, dari kerapatan texel yang sudah diukur topologi ── */
  let ppm = null;
  if (hitungPikselPerMeter && hasil.length) {
    const t = topologiGLB(jalur);
    const berUV = t.per_primitif.filter((p) => p.uv && p.uv.texel_p10 != null);
    if (berUV.length) {
      /* texel_pXX = akar(luas UV / luas dunia) = satuan UV per meter.
         Dikalikan ukuran tekstur = piksel per meter. */
      const ukuran = hasil.filter((h) => h.lebar).map((h) => h.lebar);
      const sisi = ukuran.length ? Math.max(...ukuran) : null;
      if (sisi) {
        const p10 = Math.min(...berUV.map((p) => p.uv.texel_p10));
        const p90 = Math.max(...berUV.map((p) => p.uv.texel_p90));
        ppm = {
          ukuran_tekstur_terbesar: sisi,
          piksel_per_meter_min: Number((p10 * sisi).toFixed(1)),
          piksel_per_meter_maks: Number((p90 * sisi).toFixed(1)),
          sebaran: Number((p90 / Math.max(p10, 1e-12)).toFixed(3)),
          catatan: 'dihitung dari kerapatan texel × sisi tekstur terbesar. '
            + 'Di bawah ~100 px/m benda seukuran manusia terlihat buram dari dekat; '
            + 'di atas ~2000 px/m hampir selalu pemborosan.',
        };
      }
    }
  }

  const jml = (f) => hasil.reduce((n, h) => n + (f(h) ? 1 : 0), 0);
  return {
    berkas: jalur,
    gambar: hasil.length,
    tekstur: tekstur.length,
    bahan: bahan.length,
    bita_total: hasil.reduce((n, h) => n + (h.bita ?? 0), 0),
    vram_bita_total: hasil.reduce((n, h) => n + (h.vram_bita ?? 0), 0),
    vram_total: {
      rgba8: hasil.reduce((n, h) => n + (h.vram?.rgba8 ?? 0), 0),
      bc7_uastc: hasil.reduce((n, h) => n + (h.vram?.bc7_uastc ?? 0), 0),
      bc1_etc1s: hasil.reduce((n, h) => n + (h.vram?.bc1_etc1s ?? 0), 0),
    },
    /* Berapa gambar yang SUDAH terkompres GPU. Nol berarti seluruh tekstur
       dikirim mentah, dan angka VRAM yang berlaku adalah rgba8 — yang paling
       besar dari ketiganya. */
    gambar_terkompres_gpu: hasil.filter((h) => h.format_gpu).length,
    peta_rata: jml((h) => h.rata),
    peta_alfa_sia_sia: jml((h) => h.alfa_terpakai === false),
    peta_kemungkinan_upscale: jml((h) => h.resolusi_efektif?.kemungkinan_upscale),
    peta_bukan_pot: jml((h) => h.lebar && !h.pot),
    peta_tanpa_slot: jml((h) => Array.isArray(h.slot) && h.slot.length === 0),
    slot_bertentangan: jml((h) => h.slot_bertentangan),
    piksel_per_meter: ppm,
    per_gambar: hasil,
  };
}

/** Ringkasan sebaris. */
export function ringkasTekstur(t) {
  const b = [`${t.berkas.split(/[\\/]/).pop()} · ${t.gambar} gambar · ${t.bahan} bahan`];
  if (!t.gambar) { b.push('  tidak ada tekstur sama sekali'); return b.join('\n'); }
  const mb = (x) => (x / 1048576).toFixed(2);
  b.push(`  unduh     ${(t.bita_total / 1024).toFixed(0)} KB`
    + `  ·  ${t.gambar_terkompres_gpu}/${t.gambar} terkompres GPU (KTX2)`);
  b.push(`  VRAM      ${mb(t.vram_total.rgba8)} MB mentah`
    + `  ·  ${mb(t.vram_total.bc7_uastc)} MB BC7/UASTC`
    + `  ·  ${mb(t.vram_total.bc1_etc1s)} MB BC1/ETC1S`
    + (t.gambar_terkompres_gpu ? '' : '   ← yang BERLAKU sekarang: mentah'));
  b.push(`  boros     ${t.peta_rata} rata · ${t.peta_alfa_sia_sia} alfa sia-sia · `
    + `${t.peta_kemungkinan_upscale} kemungkinan upscale · ${t.peta_bukan_pot} bukan pangkat-2`);
  if (t.slot_bertentangan) b.push(`  BENTROK   ${t.slot_bertentangan} gambar dipakai slot beda ruang warna`);
  if (t.piksel_per_meter) {
    const p = t.piksel_per_meter;
    b.push(`  px/meter  ${p.piksel_per_meter_min} – ${p.piksel_per_meter_maks} `
      + `(tekstur ${p.ukuran_tekstur_terbesar}px, sebaran ${p.sebaran}×)`);
  }
  for (const g of t.per_gambar) {
    if (!g.lebar) { b.push(`   #${g.indeks} ${g.catatan}`); continue; }
    b.push(`   #${g.indeks} ${String(g.lebar) + '×' + g.tinggi} ${(g.peran ?? 'tanpa slot').padEnd(16)}`
      + `${g.rata ? 'RATA ' : ''}${g.resolusi_efektif?.kemungkinan_upscale ? 'UPSCALE ' : ''}`
      + (g.normal ? `|v|=${g.normal.panjang_rerata} hijau=${g.normal.hijau_rerata}` : ''));
  }
  return b.join('\n');
}
