/* Uji tekstur — dengan gambar yang disusun sendiri, jadi jawabannya pasti.
 *
 * Peta rata, peta hasil upscale, dan normal map yang salah konvensi adalah
 * tiga pemborosan yang TIDAK TERLIHAT SAMA SEKALI di layar. Yang pertama
 * memakan 4 MB VRAM untuk satu angka; yang kedua memakan empat kali lipat
 * memori untuk detail yang sama persis; yang ketiga membuat lekukan terlihat
 * menonjol, dan itu tidak pernah tampak sebagai galat — cuma "kok aneh".
 */
import test from 'node:test';
import { asetUji, lewatiTanpa } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { tulisPNG, bacaPNG, kepalaPNG, adalahPNG } from './png.mjs';
import { ukurGambar, teksturGLB, SLOT } from './tekstur.mjs';
import { bacaGLB, tulisGLB } from './glb.mjs';

const TMP = mkdtempSync(path.join(tmpdir(), 'rupa3d-tex-'));
process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

/** Bangun PNG dari fungsi piksel. */
function gambar(w, h, fn) {
  const a = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, al] = fn(x, y);
      const i = (y * w + x) * 4;
      a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = al ?? 255;
    }
  }
  return tulisPNG(w, h, a);
}

/* ── PNG ────────────────────────────────────────────────────────────── */

test('putar-balik PNG identik bit demi bit', () => {
  const w = 37;
  const h = 23;      // sengaja ganjil dan bukan pangkat 2
  const a = new Uint8Array(w * h * 4);
  for (let i = 0; i < a.length; i++) a[i] = (i * 7 + 13) & 255;
  const b = bacaPNG(tulisPNG(w, h, a));
  assert.equal(b.lebar, w);
  assert.equal(b.tinggi, h);
  assert.deepEqual([...b.rgba], [...a]);
});

test('format yang tidak didukung DITOLAK, bukan dihampiri', () => {
  const png = gambar(4, 4, () => [1, 2, 3]);
  const rusak = Buffer.from(png);
  rusak[24] = 16;                         // kedalaman 16-bit
  assert.throws(() => bacaPNG(rusak), /16 bit/);
  rusak[24] = 8; rusak[25] = 3;           // berpalet
  assert.throws(() => bacaPNG(rusak), /palet/);
  assert.equal(adalahPNG(Buffer.from('bukan png sama sekali')), false);
});

test('kepalaPNG tidak menyentuh piksel', () => {
  const h = kepalaPNG(gambar(256, 128, (x) => [x & 255, 0, 0]));
  assert.equal(h.lebar, 256);
  assert.equal(h.tinggi, 128);
  assert.equal(h.saluran, 4);
});

/* ── Peta rata ──────────────────────────────────────────────────────── */

test('peta RATA terdeteksi, dan warnanya disebut', () => {
  const g = ukurGambar(gambar(64, 64, () => [200, 100, 50]));
  assert.equal(g.rata, true);
  assert.equal(g.warna_rata, 'rgba(200,100,50,255)');
  assert.equal(g.saluran_mati, 3, 'ketiga saluran warna tidak bervariasi');
  /* 64² RGBA + mipmap = 21.845 bita VRAM untuk sebuah angka yang cukup
     ditulis sebagai baseColorFactor. */
  assert.ok(g.vram_bita > 20000);
});

test('peta bervariasi TIDAK salah dituduh rata', () => {
  const g = ukurGambar(gambar(64, 64, (x, y) => [x * 4, y * 4, (x ^ y) * 3]));
  assert.equal(g.rata, false);
  assert.equal(g.saluran_mati, 0);
});

/* ── Alfa sia-sia ───────────────────────────────────────────────────── */

test('alfa yang 255 di mana-mana ditandai sia-sia', () => {
  const buram = ukurGambar(gambar(32, 32, (x) => [x * 8, 0, 0, 255]));
  assert.equal(buram.alfa_terpakai, false);
  assert.ok(buram.alfa_sia_sia_bita > 0);

  const bening = ukurGambar(gambar(32, 32, (x, y) => [x * 8, 0, 0, y * 8]));
  assert.equal(bening.alfa_terpakai, true);
  assert.equal(bening.alfa_sia_sia_bita, 0);
});

/* ── Resolusi semu ──────────────────────────────────────────────────── */

test('gambar hasil UPSCALE terdeteksi', () => {
  /* Setiap blok 2×2 berisi nilai yang sama: separuh resolusinya tidak
     membawa satu bit informasi pun. */
  const g = ukurGambar(gambar(128, 128, (x, y) => {
    const v = ((x >> 1) * 3 + (y >> 1) * 5) & 255;
    return [v, 255 - v, (v * 2) & 255];
  }));
  assert.equal(g.resolusi_efektif.kemungkinan_upscale, true,
    `galat turun-naik ${g.resolusi_efektif.galat_turun_naik} — harusnya ~0`);
});

test('gambar berdetail penuh TIDAK dituduh upscale', () => {
  const g = ukurGambar(gambar(128, 128, (x, y) => {
    const v = ((x * 37 + y * 91) ^ (x * y)) & 255;
    return [v, (v * 3) & 255, (v * 7) & 255];
  }));
  assert.equal(g.resolusi_efektif.kemungkinan_upscale, false,
    `galat ${g.resolusi_efektif.galat_turun_naik} — derau harusnya jauh dari nol`);
});

/* ── Normal map ─────────────────────────────────────────────────────── */

const kodeNormal = (x, y, z) => [
  Math.round((x + 1) / 2 * 255), Math.round((y + 1) / 2 * 255), Math.round((z + 1) / 2 * 255),
];

test('normal map SAH: |v| ≈ 1', () => {
  const g = ukurGambar(gambar(64, 64, (px, py) => {
    const a = (px / 63 - 0.5) * 0.8;
    const b = (py / 63 - 0.5) * 0.8;
    const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
    return kodeNormal(a, b, c);
  }), { peran: 'normal' });
  assert.ok(Math.abs(g.normal.panjang_rerata - 1) < 0.02,
    `|v| rerata ${g.normal.panjang_rerata}`);
  assert.ok(g.normal.piksel_menyimpang_persen < 1);
  assert.equal(g.normal.terlihat_seperti_normal, true);
});

test('gambar biasa di slot normal TERTANGKAP — dan |v| saja tidak cukup', () => {
  /* Foto atau peta albedo yang salah pasang di slot normal terlihat sebagai
     permukaan yang bergelombang aneh — bukan sebagai galat.
     
     Percobaan pertama uji ini menuntut |v| jauh dari 1. Ternyata gambar
     gradien sembarang memberi |v| = 1,105 — cuma 10% meleset, di dalam
     toleransi mana pun yang masuk akal. **|v| ≈ 1 adalah syarat PERLU, bukan
     syarat CUKUP.**
     
     Yang membedakannya: normal map yang sah hampir selalu berbiru tinggi
     (normal datar = biru 255, dan permukaan nyata jarang miring lebih dari
     60°). Gambar ini berbiru 30. Dua syarat bersama yang menangkapnya. */
  const g = ukurGambar(gambar(64, 64, (x, y) => [x * 4, y * 4, 30]),
    { peran: 'normal' });
  assert.equal(g.normal.terlihat_seperti_normal, false,
    'dua syarat bersama: |v| dekat 1 DAN biru tinggi');
  assert.ok(g.normal.biru_rerata < 150,
    `biru ${g.normal.biru_rerata} — inilah yang menangkapnya, bukan |v|`);
  assert.ok(Math.abs(g.normal.panjang_rerata - 1) < 0.2,
    `|v| ${g.normal.panjang_rerata} — cukup dekat 1 untuk membuktikan bahwa `
    + '|v| sendirian TIDAK bisa dipakai sebagai pemeriksa');
});

test('konvensi hijau dilaporkan supaya terbalik bisa dilihat', () => {
  /* Normal datar OpenGL = (128,128,255). Membalik Y memberi hijau yang
     mencerminkan di sekitar 128; lekukan lalu terlihat MENONJOL. */
  const atas = ukurGambar(gambar(64, 64, (px, py) => {
    const b = (py / 63 - 0.5) * 0.9;
    return kodeNormal(0, b, Math.sqrt(1 - b * b));
  }), { peran: 'normal' });
  const bawah = ukurGambar(gambar(64, 64, (px, py) => {
    const b = -(py / 63 - 0.5) * 0.9;
    return kodeNormal(0, b, Math.sqrt(1 - b * b));
  }), { peran: 'normal' });
  assert.ok(atas.normal.hijau_rerata != null && bawah.normal.hijau_rerata != null);
  /* Keduanya sah sebagai normal; yang membedakan cuma konvensinya, dan
     alat ini MELAPORKAN angkanya alih-alih menebak mana yang benar. */
  assert.ok(atas.normal.terlihat_seperti_normal && bawah.normal.terlihat_seperti_normal);
});

/* ── Pangkat dua & VRAM ─────────────────────────────────────────────── */

test('bukan pangkat dua ditandai, dan VRAM dihitung dengan mipmap', () => {
  assert.equal(ukurGambar(gambar(256, 256, () => [1, 2, 3])).pot, true);
  assert.equal(ukurGambar(gambar(200, 256, () => [1, 2, 3])).pot, false);
  const g = ukurGambar(gambar(512, 512, () => [1, 2, 3]));
  assert.equal(g.vram_bita, Math.round(512 * 512 * 4 * (4 / 3)),
    'VRAM yang dibayar bukan ukuran berkas — PNG terkompres, tekstur GPU tidak');
});

/* ── GLB ────────────────────────────────────────────────────────────── */

const FLANGE = asetUji('flange').jalur;

/** Sisipkan gambar + tekstur + bahan ke GLB yang sudah ada. */
function glbBertekstur(sumber, png, slot) {
  const { json, bin } = bacaGLB(readFileSync(sumber));
  const awal = bin.length;
  const isi = Buffer.concat([bin, png, Buffer.alloc((4 - (png.length % 4)) % 4)]);
  json.buffers = [{ byteLength: isi.length }];
  json.bufferViews = [...(json.bufferViews ?? []),
    { buffer: 0, byteOffset: awal, byteLength: png.length }];
  json.images = [{ bufferView: json.bufferViews.length - 1, mimeType: 'image/png', name: 'uji' }];
  json.textures = [{ source: 0 }];
  const pbr = {};
  const mat = { name: 'uji', pbrMetallicRoughness: pbr };
  for (const s of slot) {
    if (s === 'baseColorTexture' || s === 'metallicRoughnessTexture') pbr[s] = { index: 0 };
    else mat[s] = { index: 0 };
  }
  json.materials = [mat];
  const keluar = path.join(TMP, `t-${slot.join('_')}.glb`);
  writeFileSync(keluar, tulisGLB({ json, bin: isi }));
  return keluar;
}

test('peran ditentukan dari SLOT, bukan dari nama berkas', { skip: lewatiTanpa('flange') }, () => {
  const png = gambar(64, 64, (x, y) => [x * 4, y * 4, 128]);
  const a = teksturGLB(glbBertekstur(FLANGE, png, ['baseColorTexture']), { hitungPikselPerMeter: false });
  assert.equal(a.per_gambar[0].peran, 'albedo');
  assert.equal(a.per_gambar[0].ruang_warna_semestinya, 'sRGB');

  const b = teksturGLB(glbBertekstur(FLANGE, png, ['normalTexture']), { hitungPikselPerMeter: false });
  assert.equal(b.per_gambar[0].peran, 'normal');
  assert.equal(b.per_gambar[0].ruang_warna_semestinya, 'linear');
  assert.ok(b.per_gambar[0].normal, 'slot normal harus memicu pemeriksaan |v|');
});

test('satu gambar di dua slot BEDA RUANG WARNA ditandai bentrok', { skip: lewatiTanpa('flange') }, () => {
  /* Albedo sRGB dan normal linear tidak mungkin gambar yang sama. */
  const png = gambar(32, 32, (x) => [x * 8, 128, 255]);
  const t = teksturGLB(glbBertekstur(FLANGE, png, ['baseColorTexture', 'normalTexture']),
    { hitungPikselPerMeter: false });
  assert.equal(t.slot_bertentangan, 1);
  assert.equal(t.per_gambar[0].slot_bertentangan, true);
});

test('peta rata di dalam GLB ikut terhitung', { skip: lewatiTanpa('flange') }, () => {
  const t = teksturGLB(glbBertekstur(FLANGE, gambar(128, 128, () => [77, 77, 77]), ['baseColorTexture']),
    { hitungPikselPerMeter: false });
  assert.equal(t.peta_rata, 1);
  assert.ok(t.vram_bita_total > 80000);
});

test('GLB tanpa tekstur sama sekali tidak mengarang angka', { skip: lewatiTanpa('flange') }, () => {
  const t = teksturGLB(FLANGE, { hitungPikselPerMeter: false });
  assert.equal(t.gambar, 0);
  assert.equal(t.bita_total, 0);
  assert.equal(t.piksel_per_meter, null,
    'tanpa tekstur, piksel-per-meter tidak punya arti — null, bukan 0');
});

test('slot glTF punya ruang warna yang DITETAPKAN spesifikasi', () => {
  assert.equal(SLOT.baseColorTexture.ruang, 'sRGB');
  assert.equal(SLOT.emissiveTexture.ruang, 'sRGB');
  assert.equal(SLOT.normalTexture.ruang, 'linear');
  assert.equal(SLOT.metallicRoughnessTexture.ruang, 'linear');
  assert.equal(SLOT.occlusionTexture.ruang, 'linear');
});

/* ── VRAM: satu angka menyembunyikan asumsi yang menentukan ─────────── */

test('VRAM dilaporkan per FORMAT, bukan satu angka', () => {
  const g = ukurGambar(gambar(512, 512, (x, y) => [x & 255, y & 255, 0]));
  /* 512² dengan mipmap = 349.525 texel efektif. */
  assert.equal(g.vram.rgba8, Math.round(512 * 512 * 4 * (4 / 3)));
  assert.equal(g.vram.bc7_uastc, Math.round(512 * 512 * 1 * (4 / 3)));
  assert.equal(g.vram.bc1_etc1s, Math.round(512 * 512 * 0.5 * (4 / 3)));
  /* Rasionya 7,99998, bukan 8 tepat — tiap format dibulatkan sendiri.
     Godaannya menyeragamkan pembulatan supaya rasionya pas; itu berarti
     mencocokkan angka dengan uji, bukan sebaliknya. Yang benar: toleransi
     sebesar pembulatannya. */
  const rasio = g.vram.rgba8 / g.vram.bc1_etc1s;
  assert.ok(Math.abs(rasio - 8) < 0.001,
    `ETC1S ${rasio}x lebih kecil — harusnya ~8, dan itu selisih yang menentukan keputusan`);
  assert.equal(g.vram_bita, g.vram.rgba8, 'bidang lama tetap batas ATAS');
});

test('ukuran BERKAS dan ukuran MEMORI adalah dua hal berbeda', () => {
  /* PNG rata terkompres jadi beberapa ratus bita; di GPU ia tetap memakan
     ukuran penuh. Alat yang cuma melaporkan ukuran berkas menyembunyikan
     ongkos yang sebenarnya dibayar. */
  const g = ukurGambar(gambar(256, 256, () => [128, 128, 128]));
  assert.ok(g.bita < 5000, `PNG rata ${g.bita} bita`);
  assert.ok(g.vram.rgba8 > 300000, `VRAM ${g.vram.rgba8} bita`);
  assert.ok(g.vram.rgba8 / g.bita > 50,
    'selisihnya puluhan kali — dan itu yang membuat "ukuran berkas" bukan jawaban');
});

test('KTX2 terdeteksi lewat mimeType maupun ekstensi', { skip: lewatiTanpa('flange') }, () => {
  const png = gambar(64, 64, (x) => [x * 4, 0, 0]);
  const biasa = teksturGLB(glbBertekstur(FLANGE, png, ['baseColorTexture']),
    { hitungPikselPerMeter: false });
  assert.equal(biasa.gambar_terkompres_gpu, 0);
  assert.equal(biasa.per_gambar[0].format_gpu, null);

  /* Tandai gambarnya sebagai KTX2 dan pastikan terdeteksi. Isinya tetap PNG —
     yang diuji deteksinya, bukan transcodingnya. */
  const jalur = glbBertekstur(FLANGE, png, ['baseColorTexture']);
  const { json, bin } = bacaGLB(readFileSync(jalur));
  json.images[0].mimeType = 'image/ktx2';
  const jalur2 = path.join(TMP, 'ktx2.glb');
  writeFileSync(jalur2, tulisGLB({ json, bin }));
  const ktx = teksturGLB(jalur2, { hitungPikselPerMeter: false });
  assert.equal(ktx.gambar_terkompres_gpu, 1);
  assert.equal(ktx.per_gambar[0].format_gpu, 'ktx2');
});

test('total VRAM dijumlahkan untuk ketiga format', { skip: lewatiTanpa('flange') }, () => {
  const t = teksturGLB(glbBertekstur(FLANGE, gambar(128, 128, (x, y) => [x, y, 0]),
    ['baseColorTexture']), { hitungPikselPerMeter: false });
  /* Selisih satu bita berasal dari pembulatan tiap format; yang dijaga di
     sini nisbahnya, bukan kesamaan bit demi bit. */
  assert.ok(Math.abs(t.vram_total.rgba8 - t.vram_total.bc7_uastc * 4) <= 4);
  assert.ok(Math.abs(t.vram_total.bc7_uastc - t.vram_total.bc1_etc1s * 2) <= 2);
  assert.ok(t.vram_total.rgba8 > t.vram_total.bc7_uastc);
  assert.ok(t.vram_total.bc7_uastc > t.vram_total.bc1_etc1s);
});
