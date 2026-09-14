/* SPEK dan SERTIFIKAT — inti Rupa3D, dan satu-satunya bagian yang tidak
 * dimiliki alat 3D mana pun.
 *
 * ── Kenapa ini ada ───────────────────────────────────────────────────────
 *
 * Semua alat 3D mengirim aset yang rusak tanpa suara. Hari ini, di repo ini,
 * enam cacat lolos sebagai "berhasil" — LOD yang merusak siluet, proksi
 * tabrakan yang bocor, peta AO hitam total, mesh yang melenceng 0,88% dari
 * geometri CAD-nya, ikon SVG yang jadi pita setipis kertas, lipatan yang
 * lebih sempit daripada satu sel grid. Yang membongkar keenamnya angka.
 *
 * Berkas ini yang mengubah angka jadi PUTUSAN:
 *
 *     SPEK  (janji)   ×   UKURAN  (kenyataan)   →   SERTIFIKAT  (bukti)
 *
 * Sertifikatnya menempel pada berkas kirimnya. Itulah "aset membawa
 * buktinya": siapa pun yang menerima GLB-nya bisa membaca apa yang
 * dijanjikan, apa yang diukur, dan siapa yang mengukurnya — tanpa perlu
 * mempercayai siapa pun.
 *
 * ── Satu aturan yang mengikat berkas ini ─────────────────────────────────
 *
 * Pemeriksa yang tidak pernah MERAH bukan pemeriksa; ia hiasan. `test-spek.mjs`
 * membuktikan tiap pembanding gagal lebih dulu sebelum ia dipercaya lulus.
 */

/** Pembanding yang tersedia. Sengaja sedikit: tiap satu harus punya arti yang
 *  tidak bisa disalahartikan saat dibaca orang yang tidak menulisnya. */
export const PEMBANDING = {
  '=': (nilai, harap, tol = 0) => Math.abs(nilai - harap) <= tol,
  '<=': (nilai, harap) => nilai <= harap,
  '>=': (nilai, harap) => nilai >= harap,
  '<': (nilai, harap) => nilai < harap,
  '>': (nilai, harap) => nilai > harap,
  antara: (nilai, [min, maks]) => nilai >= min && nilai <= maks,
  /** Kumpulan terukur harus MEMUAT semua yang diminta. */
  memuat: (nilai, harap) => {
    const ada = new Set((nilai ?? []).map(String));
    return (harap ?? []).every((h) => ada.has(String(h)));
  },
  /** Kumpulan terukur harus berada DI DALAM daftar yang diizinkan. */
  subset: (nilai, harap) => {
    const boleh = new Set((harap ?? []).map(String));
    return (nilai ?? []).every((v) => boleh.has(String(v)));
  },
  benar: (nilai) => nilai === true,
};

/** Selisih yang bisa dibaca manusia — ini yang membuat kegagalan berguna,
 *  bukan sekadar "gagal". */
function selisih(aturan, nilai) {
  const { pembanding, nilai: harap, toleransi = 0 } = aturan;
  if (nilai == null) return 'tidak terukur';
  switch (pembanding) {
    case '=': {
      const d = nilai - harap;
      return `${bulat(nilai)} vs ${bulat(harap)} (meleset ${d > 0 ? '+' : ''}${bulat(d)}, toleransi ±${toleransi})`;
    }
    case 'antara': {
      const [min, maks] = harap;
      const arah = nilai < min ? `kurang ${bulat(min - nilai)}` : `lebih ${bulat(nilai - maks)}`;
      return `${bulat(nilai)} di luar [${min}, ${maks}] — ${arah}`;
    }
    case 'memuat': {
      const ada = new Set((nilai ?? []).map(String));
      const kurang = (harap ?? []).filter((h) => !ada.has(String(h)));
      return `kurang: ${kurang.join(', ')}`;
    }
    case 'subset': {
      const boleh = new Set((harap ?? []).map(String));
      const asing = (nilai ?? []).filter((v) => !boleh.has(String(v)));
      return `tidak diizinkan: ${asing.join(', ')}`;
    }
    case 'benar':
      return `${nilai} (harus true)`;
    default:
      return `${bulat(nilai)} vs ${pembanding} ${bulat(harap)}`;
  }
}

const bulat = (n) => (typeof n === 'number' ? Number(n.toFixed(4)) : n);

/**
 * Nilai satu aturan terhadap kumpulan ukuran.
 * @returns {{kode, lulus, berat, nilai, harap, pesan}}
 */
export function nilaiAturan(aturan, ukuran) {
  const fn = PEMBANDING[aturan.pembanding];
  if (!fn) throw new Error(`pembanding tidak dikenal: ${aturan.pembanding}`);

  /* `kode` adalah IDENTITAS aturan; `ukuran` adalah ukuran yang DIBACANYA.
   *
   * Versi pertama cuma membaca `ukuran[aturan.kode]` dan mengabaikan bidang
   * `ukuran` sepenuhnya — bidang hantu yang tampak berarti dan tidak
   * melakukan apa-apa. Selama kode dan ukurannya kebetulan sama namanya, itu
   * tidak terlihat. Begitu berbeda, aturannya mencari ukuran yang tidak ada
   * dan GAGAL sebagai wajib, dengan pesan yang menyalahkan pengukurnya.
   *
   * Memisahkan keduanya juga berguna: dua aturan bisa membaca ukuran yang
   * SAMA dengan ambang berbeda, dan masing-masing punya nama sendiri di
   * sertifikatnya. */
  const kunci = aturan.ukuran ?? aturan.kode;
  const nilai = ukuran[kunci];

  /* ── Ukuran yang TIDAK BISA DINILAI adalah kegagalan ────────────────
   *
   * Aturan yang diam-diam tidak dijalankan adalah cara paling halus sebuah
   * pemeriksa berbohong. Ada DUA cara sebuah ukuran tidak bisa dinilai, dan
   * sebabnya berbeda, jadi pesannya berbeda:
   *
   *   undefined  pengukurnya tidak pernah menghasilkan bidang ini — salah
   *              nama, atau pengukurnya memang belum ada.
   *   null       pengukurnya JALAN dan menyatakan "tidak terukur pada aset
   *              ini" — mesh tanpa UV, aset tanpa tekstur.
   *
   * `null` HARUS ditangkap di sini, sebelum pembandingnya dipanggil.
   * `topologi.mjs` dan `tekstur.mjs` sama-sama sengaja melaporkan `null`
   * alih-alih `0`, dan keduanya menulis komentar bahwa itu supaya aturannya
   * MENOLAK. Ternyata tidak: `null <= 3` di JavaScript adalah `true`, karena
   * operator relasional memaksa `null` jadi `0`. Jadi persis nilai yang
   * ditulis untuk menolak, diam-diam meloloskan — dan `<`, `<=`, serta `=`
   * (lewat `Math.abs(null - 0) <= 0`) ketiganya kena.
   *
   * Terukur sebelum ditambal: 16 verdik "ok" palsu pada 5 dari 6 aset repo
   * ini, termasuk `tex_vram_berlaku <= 16 MB` yang LULUS pada berkas tanpa
   * satu tekstur pun, dan `topo_texel_sebaran <= 3` — aturan yang
   * dokumennya sendiri mengklaim terlindung oleh konvensi `null` itu.
   *
   * Dua berkas menulis niat yang sama, satu berkas ketiga membatalkannya,
   * dan tidak satu pun dari ketiganya tahu. */
  if (nilai === undefined || nilai === null) {
    const sebab = nilai === undefined
      ? `ukuran "${kunci}" tidak ada`
      : `ukuran "${kunci}" tidak terukur pada aset ini`;
    return {
      kode: aturan.kode, lulus: false, berat: aturan.berat ?? 'wajib',
      nilai: null, harap: aturan.nilai,
      pesan: `${sebab} — aturan tidak bisa dinilai`
        + (kunci !== aturan.kode ? ` (aturan "${aturan.kode}")` : ''),
    };
  }

  const lulus = fn(nilai, aturan.nilai, aturan.toleransi);
  return {
    kode: aturan.kode,
    lulus,
    berat: aturan.berat ?? 'wajib',
    nilai: Array.isArray(nilai) ? nilai : bulat(nilai),
    harap: aturan.nilai,
    satuan: aturan.satuan,
    pesan: lulus ? null : selisih(aturan, nilai),
  };
}

/**
 * SPEK × UKURAN → SERTIFIKAT.
 *
 * `lulus` hanya melihat aturan berbobot `wajib`. Aturan `peringatan` tetap
 * dilaporkan lengkap dengan angkanya — ia informasi, bukan gerbang.
 */
export function terbitkanSertifikat({ spek, ukuran, aset, revisi = null, kernel = [] }) {
  const hasil = spek.aturan.map((a) => nilaiAturan(a, ukuran));
  const wajib = hasil.filter((h) => h.berat === 'wajib');
  const gagal = wajib.filter((h) => !h.lulus);
  const peringatan = hasil.filter((h) => h.berat === 'peringatan' && !h.lulus);

  return {
    skema: 'rupa3d/sertifikat@1',
    aset,
    revisi,
    spek: `${spek.nama}@${spek.versi}`,
    lulus: gagal.length === 0,
    diperiksa: hasil.length,
    gagal: gagal.length,
    peringatan: peringatan.length,
    aturan: hasil,
    ukuran,
    kernel,
    pada: new Date().toISOString(),
  };
}

/** Sertifikat sebagai KALIMAT, bukan gumpalan JSON.
 *
 *  Bukti yang tidak bisa dibaca orang yang tidak hadir saat pengukurannya
 *  bukan bukti — ia arsip. */
export function ringkas(s) {
  const baris = [];
  const kepala = s.lulus ? 'LULUS' : 'GAGAL';
  baris.push(`${kepala} — ${s.aset} terhadap ${s.spek}`);
  baris.push(`${s.diperiksa} aturan diperiksa · ${s.gagal} gagal · ${s.peringatan} peringatan`);
  baris.push('');
  for (const a of s.aturan) {
    const tanda = a.lulus ? '  ok  ' : (a.berat === 'wajib' ? ' GAGAL' : ' warn ');
    const nilai = Array.isArray(a.nilai) ? `[${a.nilai.length} nilai]` : a.nilai;
    baris.push(`${tanda} ${a.kode.padEnd(22)} ${String(nilai).padStart(12)}${a.satuan ? ' ' + a.satuan : ''}${a.pesan ? '   ← ' + a.pesan : ''}`);
  }
  if (s.kernel.length) {
    baris.push('');
    baris.push(`kernel: ${s.kernel.join(' · ')}`);
  }
  baris.push(`pada  : ${s.pada}`);
  return baris.join('\n');
}

/**
 * Turunkan ukuran yang bisa dinilai spek dari keluaran mentah `rupa_ukur`.
 *
 * Dipisahkan dari pengukurnya dengan sengaja: `rupa_ukur` melaporkan apa yang
 * ADA, fungsi ini menerjemahkannya ke kosakata yang dipakai SPEK. Kalau
 * keduanya dicampur, mengubah satu aturan berarti menyentuh kode Blender.
 */
export function turunkanUkuran(hasilUkur, opsi = {}) {
  const { objek = [], total_segitiga = 0, kotak_batas } = hasilUkur;
  const [lebar, dalam, tinggi] = kotak_batas?.ukuran ?? [0, 0, 0];
  const min = kotak_batas?.min ?? [0, 0, 0];

  const u = {
    segitiga_total: total_segitiga,
    objek_mesh: objek.length,
    lebar,
    dalam,
    tinggi,
    // Pivot di pusat alas berarti dasar bendanya duduk di z = 0.
    pivot_z: min[2],
    nisbah_lebar_tinggi: tinggi ? lebar / tinggi : 0,
    tak_manifold: objek.reduce((n, o) => n + (o.tepi_tak_manifold ?? 0), 0),
    simpul_lepas: objek.reduce((n, o) => n + (o.simpul_lepas ?? 0), 0),
    ngon: objek.reduce((n, o) => n + (o.sisi_ngon ?? 0), 0),
    /* Objek INSTANS dikecualikan, dan itu keputusan yang disengaja.
       Beberapa objek yang berbagi satu data mesh (32 gelembung = 1 mesh + 32
       transform) SAH membawa skala di node-nya; menerapkannya justru memecah
       instansing dan melipatgandakan memori serta draw call. Aturan
       "skala harus diterapkan" hanya masuk akal untuk objek berdata TUNGGAL.
       Versi pertama aturan ini tidak membedakannya, dan akibatnya ia menuntut
       perbaikan yang MERUSAK aset. */
    skala_diterapkan: objek
      .filter((o) => (o.pemakai_data ?? 1) <= 1)
      .every((o) => o.skala_sudah_diterapkan !== false),
    objek_instans: objek.filter((o) => (o.pemakai_data ?? 1) > 1).length,
    objek_tunggal: objek.filter((o) => (o.pemakai_data ?? 1) <= 1).length,
    nama_objek: objek.map((o) => o.nama),
    bahan: [...new Set(objek.flatMap((o) => o.bahan ?? []))],
  };

  /* `bagian` dipetakan dari nama objek lewat kata kunci, bukan dicocokkan
     persis: pipeline yang berbeda memberi nama yang berbeda untuk benda yang
     sama, dan spek tidak boleh pecah karena "shell" ditulis "tempurung". */
  if (opsi.peta_bagian) {
    const ada = new Set();
    for (const nama of u.nama_objek) {
      const rendah = nama.toLowerCase();
      for (const [bagian, kunci] of Object.entries(opsi.peta_bagian)) {
        if (kunci.some((k) => rendah.includes(k))) ada.add(bagian);
      }
    }
    u.bagian = [...ada];
  }

  return { ...u, ...(opsi.tambahan ?? {}) };
}

/**
 * Muat spek dari berkas, resolusi `warisi` ikut dijalankan.
 *
 * Aturan BENTUK dan aturan PIPELINE adalah dua kontrak yang berbeda, dan aset
 * yang sama bisa dinilai keduanya:
 *
 *   kora-3d.json        tinggi, lebar, nisbah, pivot, bagian     (bentuknya)
 *   game-siap.json      galat LOD, tembus tabrakan, bake kosong  (pipelinenya)
 *   kora-3d-game.json   warisi keduanya
 *
 * Menyalin aturan bentuk ke dalam spek pipeline akan membuat keduanya
 * menyimpang diam-diam begitu salah satu diubah. Pewarisan menutup itu.
 *
 * Aturan dengan `kode` yang sama TIMPA yang diwarisi — spek anak boleh
 * memperketat atau melonggarkan satu aturan tanpa menyalin seluruhnya.
 */
export function muatSpek(jalur, baca, gabungJalur) {
  const spek = JSON.parse(baca(jalur));
  const induk = [].concat(spek.warisi ?? []);
  if (!induk.length) return spek;

  const aturan = new Map();
  const peta = {};
  for (const nama of induk) {
    const p = muatSpek(gabungJalur(jalur, nama), baca, gabungJalur);
    for (const a of p.aturan ?? []) aturan.set(a.kode, a);
    Object.assign(peta, p.peta_bagian ?? {});
  }
  for (const a of spek.aturan ?? []) aturan.set(a.kode, a);

  return {
    ...spek,
    peta_bagian: { ...peta, ...(spek.peta_bagian ?? {}) },
    aturan: [...aturan.values()],
    diwarisi_dari: induk,
  };
}

/** Periksa bentuk spek sebelum dipakai — spek yang salah ketik akan
 *  meloloskan aset diam-diam, dan itu kegagalan yang paling mahal. */
/* Bidang yang sah pada sebuah aturan. Daftar TERTUTUP, disengaja: bidang
   yang salah ketik tidak pernah terlihat sebagai galat — ia terlihat sebagai
   nilai bawaan, dan itu jauh lebih sulit ditemukan. */
const BIDANG_ATURAN = new Set([
  'kode', 'ukuran', 'pembanding', 'nilai', 'toleransi', 'berat', 'satuan',
  'alasan', 'catatan',
]);

export function periksaSpek(spek) {
  const galat = [];
  if (!spek?.nama) galat.push('spek tanpa `nama`');
  if (!spek?.versi) galat.push('spek tanpa `versi`');
  if (!Array.isArray(spek?.aturan) || spek.aturan.length === 0) {
    galat.push('spek tanpa `aturan`');
  }
  for (const [i, a] of (spek?.aturan ?? []).entries()) {
    if (!a.kode) galat.push(`aturan[${i}] tanpa \`kode\``);
    if (!PEMBANDING[a.pembanding]) {
      galat.push(`aturan[${i}] "${a.kode}": pembanding "${a.pembanding}" tidak dikenal (ada: ${Object.keys(PEMBANDING).join(', ')})`);
    }
    if (a.pembanding === 'antara' && !Array.isArray(a.nilai)) {
      galat.push(`aturan[${i}] "${a.kode}": pembanding "antara" menuntut nilai [min, maks]`);
    }
    if (a.berat && !['wajib', 'peringatan'].includes(a.berat)) {
      galat.push(`aturan[${i}] "${a.kode}": berat "${a.berat}" tidak dikenal`);
    }

    /* ── Bidang yang tidak dikenal DITOLAK ──────────────────────────────
     *
     * Ini menutup satu lubang yang saya buat sendiri dan tidak ketahuan
     * sampai angkanya dihitung: dua berkas spek ditulis dengan `bobot`
     * alih-alih `berat`. Bidang `berat` lalu TIDAK ADA, jadi tiap aturan
     * jatuh ke bawaan `wajib` — dan delapan aturan yang sengaja ditulis
     * sebagai PERINGATAN diam-diam menjadi GERBANG KERAS.
     *
     * Validator versi lama tidak bisa menangkapnya, karena ia memvalidasi
     * `berat` dan `berat` memang tidak ada. Salah ketik nama bidang tidak
     * pernah terlihat sebagai galat; ia terlihat sebagai nilai bawaan.
     *
     * Pesan khusus untuk `bobot` disebut karena itu salah ketik yang paling
     * mungkin — "bobot" dan "berat" sama artinya dalam bahasa Indonesia. */
    for (const k of Object.keys(a)) {
      if (BIDANG_ATURAN.has(k)) continue;
      galat.push(`aturan[${i}] "${a.kode}": bidang "${k}" tidak dikenal`
        + (k === 'bobot' ? ' — maksudnya `berat`? Bidang yang salah ketik '
          + 'membuat aturannya diam-diam jatuh ke bawaan `wajib`.' : '')
        + ` (yang ada: ${[...BIDANG_ATURAN].join(', ')})`);
    }
  }
  return galat;
}
