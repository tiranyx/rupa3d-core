#!/usr/bin/env node
/* Rupa3D di baris perintah — gerbang mutu aset, satu perintah.
 *
 * ── Kenapa berkas ini ada ────────────────────────────────────────────────
 *
 * Semua yang dibangun sampai hari ini cuma bisa dipakai lewat DUA pintu:
 * mengimpor modulnya dari Node, atau lewat MCP sebagai agen. Keduanya
 * menuntut pemakainya menulis kode lebih dulu.
 *
 * Arah produk nomor satu adalah "gerbang mutu aset — CI untuk 3D", dan
 * sebuah gerbang yang menuntut kode untuk dilewati bukan gerbang; ia
 * perpustakaan.
 *
 * ── Satu hal yang membuatnya benar-benar gerbang ─────────────────────────
 *
 * KODE KELUARNYA. `0` kalau seluruh aturan wajib lulus, `1` kalau ada yang
 * gagal, `2` kalau berkasnya sendiri tidak bisa diperiksa. Itu yang membuat
 * baris ini bekerja di CI mana pun tanpa satu baris kode pun:
 *
 *     rupa periksa aset/*.glb || exit 1
 *
 * Alat yang mencetak laporan bagus tetapi selalu keluar 0 tidak menghentikan
 * apa pun. Ia hiasan yang mahal.
 */
import { readFileSync, existsSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.dirname(fileURLToPath(import.meta.url));
const PAKET = JSON.parse(readFileSync(path.join(AKAR, 'package.json'), 'utf8'));

/* ── Warna, yang mati sendiri kalau keluarannya bukan terminal ───────────
 *
 * Kode ANSI yang bocor ke berkas log atau ke pipa membuat keluarannya sulit
 * di-grep, dan `--json` jadi tidak bisa diurai sama sekali. */
const WARNA = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (kode, t) => (WARNA ? `[${kode}m${t}[0m` : t);
const merah = (t) => c('31', t);
const hijau = (t) => c('32', t);
const kuning = (t) => c('33', t);
const redup = (t) => c('90', t);
const tebal = (t) => c('1', t);

const BANTUAN = `
${tebal('rupa')} ${redup(`v${PAKET.version}`)} — bangun DAN buktikan aset 3D

${tebal('PERINTAH')}
  rupa periksa <berkas.glb...>     nilai terhadap spek, terbitkan sertifikat
  rupa topologi <berkas.glb...>    bagaimana verteksnya tersambung
  rupa tekstur <berkas.glb...>     piksel per meter, VRAM per format
  rupa perbaiki <berkas.glb...>    betulkan cacat yang bisa dibetulkan,
                                   lalu BUKTIKAN bentuknya tidak berubah
  rupa versi                       versi dan kemampuan

${tebal('PILIHAN')}
  --spek <jalur>     spek yang dipakai (bawaan: spek/aset-generatif.json)
  --tempel           tulis salinan bersertifikat <nama>.bersertifikat.glb
  --json             keluarkan JSON, bukan laporan terbaca
  --diam             cuma kode keluar, tanpa keluaran
  --sumbu <Y|Z>      sumbu atas berkasnya (bawaan Y, sesuai glTF)

${tebal('KODE KELUAR')}
  0   seluruh aturan wajib lulus
  1   ada aturan wajib yang gagal
  2   berkasnya tidak bisa diperiksa

${tebal('CONTOH')}
  ${redup('# gerbang di CI — berhenti kalau ada yang tidak lolos')}
  rupa periksa kirim/*.glb

  ${redup('# spek sendiri, plus sertifikatnya ditempel')}
  rupa periksa aset.glb --spek spek/kora-3d-penuh.json --tempel

  ${redup('# untuk diurai alat lain')}
  rupa periksa aset.glb --json > laporan.json
`;

function urai(argv) {
  const opsi = { berkas: [], spek: null, tempel: false, json: false, diam: false, sumbu: 'Y' };
  let perintah = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spek') opsi.spek = argv[++i];
    else if (a === '--sumbu') opsi.sumbu = (argv[++i] ?? 'Y').toUpperCase();
    else if (a === '--tempel') opsi.tempel = true;
    else if (a === '--json') opsi.json = true;
    else if (a === '--diam') opsi.diam = true;
    else if (a === '-h' || a === '--help') perintah = 'bantuan';
    else if (a.startsWith('-')) throw new Error(`pilihan tidak dikenal: ${a}`);
    else if (!perintah) perintah = a;
    else opsi.berkas.push(a);
  }
  return { perintah, opsi };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/** Baris aturan yang bisa dibaca orang yang tidak hadir saat pengukurannya. */
function barisAturan(a) {
  const tanda = a.lulus ? hijau('  ok  ')
    : a.berat === 'wajib' ? merah(' GAGAL') : kuning(' warn ');
  const nilai = Array.isArray(a.nilai) ? `[${a.nilai.length} nilai]` : String(a.nilai);
  const satuan = a.satuan ? ` ${a.satuan}` : '';
  const pesan = a.pesan ? redup(`   ← ${a.pesan}`) : '';
  return `${tanda} ${a.kode.padEnd(26)} ${nilai.padStart(12)}${satuan}${pesan}`;
}

async function periksaBerkas(jalur, opsi, spek, alat) {
  const { ukurGLB, topologiGLB, teksturGLB, dariTopologi, dariTekstur,
    dariKompresi, terbitkanSertifikat, tempelSertifikat } = alat;

  const t0 = Date.now();
  const u = ukurGLB(jalur, { sumbu_atas: opsi.sumbu, peta_bagian: spek.peta_bagian });
  const ukuran = {
    ...u,
    ...dariTopologi(topologiGLB(jalur)),
    ...dariTekstur(teksturGLB(jalur)),
    ...dariKompresi(u),
  };
  const sertifikat = terbitkanSertifikat({
    spek, ukuran, aset: path.basename(jalur),
    kernel: [`Rupa3D ${PAKET.version} (pembaca berkas, tanpa Blender)`],
  });
  sertifikat.sumber = { jenis: 'berkas', jalur, sumbu_atas: u.sumbu_atas };
  const ms = Date.now() - t0;

  let tempel = null;
  if (opsi.tempel) {
    const tujuan = `${jalur.replace(/\.glb$/i, '')}.bersertifikat.glb`;
    copyFileSync(jalur, tujuan);
    tempel = { berkas: tujuan, ...tempelSertifikat(tujuan, sertifikat) };
  }
  return { sertifikat, ukuran: u, ms, tempel };
}

function cetakLaporan(jalur, hasil) {
  const { sertifikat: s, ukuran: u, ms, tempel } = hasil;
  const kepala = s.lulus ? hijau('LULUS') : merah('GAGAL');
  const bita = statSync(jalur).size;

  console.log(`\n${kepala}  ${tebal(path.basename(jalur))}  ${redup(`${kb(bita)} · ${ms} ms`)}`);
  console.log(redup(`       ${s.spek} · ${s.diperiksa} aturan · `
    + `${s.gagal} gagal · ${s.peringatan} peringatan`));

  const bentuk = `${u.segitiga_total.toLocaleString('id')} segitiga · ${u.objek_mesh} objek`
    + `${u.objek_instans ? ` (${u.objek_instans} instans)` : ''}`;
  const dim = [u.lebar, u.tinggi, u.dalam].map((v) => Number(v.toFixed(3))).join(' × ');
  console.log(redup(`       ${bentuk} · ${dim} · sumbu ${u.sumbu_atas}-atas`));
  if (u.draco) console.log(kuning(`       terkompres Draco — angka geometris di bawah menggambarkan versi TERKUANTISASI`));

  console.log('');
  // Yang GAGAL dulu, lalu peringatan, lalu yang lulus. Laporan yang mengurut
  // menurut posisi di spek memaksa pembacanya memindai untuk menemukan
  // sesuatu yang sudah diketahui ada.
  const urut = [...s.aturan].sort((a, b) => {
    const nilai = (x) => (!x.lulus && x.berat === 'wajib' ? 0 : !x.lulus ? 1 : 2);
    return nilai(a) - nilai(b);
  });
  for (const a of urut) console.log(barisAturan(a));

  if (tempel) {
    console.log(redup(`\n       sertifikat → ${path.basename(tempel.berkas)} `
      + `(+${tempel.tumbuh} bita)`));
  }
}

async function jalan() {
  const { perintah, opsi } = urai(process.argv.slice(2));

  if (!perintah || perintah === 'bantuan') { console.log(BANTUAN); return 0; }
  if (perintah === 'versi') {
    const { dracoSiap } = await import('./draco.mjs');
    console.log(`rupa ${PAKET.version}`);
    console.log(`node ${process.version}`);
    console.log(`draco ${dracoSiap() ? 'siap' : 'tersedia'}`);
    return 0;
  }

  if (!['periksa', 'topologi', 'tekstur', 'perbaiki'].includes(perintah)) {
    console.error(merah(`perintah tidak dikenal: ${perintah}`));
    console.error(redup('coba `rupa --help`'));
    return 2;
  }
  if (!opsi.berkas.length) {
    console.error(merah(`\`rupa ${perintah}\` butuh setidaknya satu berkas`));
    return 2;
  }

  /* Berkas yang tidak ada ditolak SEBELUM apa pun dinyalakan. Membayar
     penyalaan WASM untuk mengetahui berkasnya tidak ada adalah pemborosan
     yang bisa dihindari sepenuhnya. */
  const hilang = opsi.berkas.filter((f) => !existsSync(f));
  if (hilang.length) {
    for (const f of hilang) console.error(merah(`berkas tidak ada: ${f}`));
    return 2;
  }

  // Dekoder Draco disiapkan sekali di depan: pemakai baris perintah tidak
  // seharusnya perlu tahu berkas mana yang terkompres.
  const { siapkanDraco } = await import('./draco.mjs');
  await siapkanDraco();

  if (perintah === 'perbaiki') {
    const { perbaikiGLB } = await import('./perbaiki.mjs');
    const { writeFileSync } = await import('node:fs');
    let ditolak = 0; let diubah = 0;
    const semua = [];
    for (const f of opsi.berkas) {
      const jalur = path.resolve(f);
      const r = await perbaikiGLB(jalur);
      semua.push({ berkas: f, ok: r.ok, berubah: r.berubah, dilakukan: r.dilakukan, bukti: r.bukti });
      if (!r.berubah) {
        if (!opsi.diam && !opsi.json) console.log(`${redup('  —   ')} ${path.basename(f)} ${redup('tidak ada yang perlu diperbaiki')}`);
        continue;
      }
      if (!r.ok) {
        ditolak++;
        if (!opsi.diam && !opsi.json) {
          console.log(`${merah('TOLAK ')} ${tebal(path.basename(f))}`);
          for (const g of r.bukti.gagal) console.log(`        ${g}`);
          console.log(redup('        hasilnya TIDAK ditulis — perbaikan yang mengubah bentuknya bukan perbaikan'));
        }
        continue;
      }
      diubah++;
      const tujuan = `${jalur.replace(/\.glb$/i, '')}.diperbaiki.glb`;
      writeFileSync(tujuan, r.glb);
      if (!opsi.diam && !opsi.json) {
        console.log(`${hijau('  ok  ')} ${tebal(path.basename(f))} → ${path.basename(tujuan)}`);
        for (const d of r.dilakukan) console.log(`        ${d.nama}: ${d.catatan}`);
        console.log(redup(`        bentuk terbukti tidak berubah · ${kb(r.bukti.bita.sebelum)} → ${kb(r.bukti.bita.sesudah)}`));
      }
    }
    if (opsi.json) console.log(JSON.stringify(semua.length === 1 ? semua[0] : semua, null, 2));
    /* Perbaikan yang DITOLAK gerbang pembuktiannya keluar 2, bukan 1:
       yang gagal bukan asetnya melainkan alat perbaikannya. */
    return ditolak ? 2 : 0;
  }

  if (perintah === 'topologi' || perintah === 'tekstur') {
    const mod = perintah === 'topologi'
      ? await import('./topologi.mjs') : await import('./tekstur.mjs');
    const ukur = perintah === 'topologi' ? mod.topologiGLB : mod.teksturGLB;
    const ringkas = perintah === 'topologi' ? mod.ringkasTopologi : mod.ringkasTekstur;
    const semua = [];
    for (const f of opsi.berkas) {
      const t = ukur(path.resolve(f));
      semua.push({ berkas: f, ...t });
      if (opsi.diam || opsi.json) continue;
      console.log(`\n${tebal(path.basename(f))}`);
      console.log(ringkas(t));
    }
    if (opsi.json) console.log(JSON.stringify(semua.length === 1 ? semua[0] : semua, null, 2));
    return 0;
  }

  // ── periksa ──────────────────────────────────────────────────────────
  const { muatSpek, periksaSpek, terbitkanSertifikat } = await import('./spek.mjs');
  const { ukurGLB } = await import('./ukur-glb.mjs');
  const { topologiGLB } = await import('./topologi.mjs');
  const { teksturGLB } = await import('./tekstur.mjs');
  const { dariTopologi, dariTekstur, dariKompresi } = await import('./turunan.mjs');
  const { tempelSertifikat } = await import('./glb.mjs');

  const jalurSpek = path.resolve(opsi.spek ?? path.join(AKAR, 'spek/aset-generatif.json'));
  if (!existsSync(jalurSpek)) {
    console.error(merah(`spek tidak ada: ${jalurSpek}`));
    return 2;
  }
  let spek;
  try {
    spek = muatSpek(jalurSpek, (j) => readFileSync(j, 'utf8'),
      (j, n) => path.join(path.dirname(j), n));
  } catch (e) {
    console.error(merah(`spek tidak bisa dimuat: ${e.message}`));
    return 2;
  }
  const cacat = periksaSpek(spek);
  if (cacat.length) {
    console.error(merah('spek cacat:'));
    for (const g of cacat) console.error(`  ${g}`);
    return 2;
  }
  if (opsi.sumbu !== 'Y' && opsi.sumbu !== 'Z') {
    console.error(merah(`--sumbu harus Y atau Z, dapat ${opsi.sumbu}`));
    return 2;
  }

  const alat = {
    ukurGLB, topologiGLB, teksturGLB, dariTopologi, dariTekstur,
    dariKompresi, terbitkanSertifikat, tempelSertifikat,
  };
  const sumbu = spek.sumbu_atas ?? opsi.sumbu;
  const semua = [];
  let gagal = 0;
  let takTerperiksa = 0;

  for (const f of opsi.berkas) {
    const jalur = path.resolve(f);
    try {
      const hasil = await periksaBerkas(jalur, { ...opsi, sumbu }, spek, alat);
      semua.push(hasil.sertifikat);
      if (!hasil.sertifikat.lulus) gagal++;
      if (!opsi.diam && !opsi.json) cetakLaporan(jalur, hasil);
    } catch (e) {
      /* Berkas yang tidak bisa diperiksa BUKAN berkas yang gagal spek, dan
         membedakannya penting: yang pertama menuntut alatnya diperbaiki, yang
         kedua menuntut asetnya diperbaiki. Kode keluarnya pun berbeda. */
      takTerperiksa++;
      semua.push({ aset: path.basename(f), error: e.message });
      if (!opsi.diam && !opsi.json) {
        console.log(`\n${merah('TAK TERPERIKSA')}  ${tebal(path.basename(f))}`);
        console.log(`       ${e.message}`);
      }
    }
  }

  if (opsi.json) console.log(JSON.stringify(semua.length === 1 ? semua[0] : semua, null, 2));
  else if (!opsi.diam && opsi.berkas.length > 1) {
    const lulus = opsi.berkas.length - gagal - takTerperiksa;
    console.log(`\n${redup('─'.repeat(52))}`);
    console.log(`${hijau(`${lulus} lulus`)} · ${gagal ? merah(`${gagal} gagal`) : `${gagal} gagal`}`
      + (takTerperiksa ? ` · ${merah(`${takTerperiksa} tak terperiksa`)}` : ''));
  }

  if (takTerperiksa) return 2;
  return gagal ? 1 : 0;
}

jalan().then((kode) => process.exit(kode)).catch((e) => {
  console.error(merah(e.message));
  process.exit(2);
});
