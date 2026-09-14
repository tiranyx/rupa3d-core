/* Kosakata SPEK untuk TURUNAN — LOD, proksi tabrakan, peta bake, tesselasi.
 *
 * ── Lubang yang ditutup berkas ini ───────────────────────────────────────
 *
 * Sampai sekarang spek hanya bisa menilai BENTUK AKHIR: berapa segitiga,
 * berapa tinggi, pivotnya di mana. Ia belum bisa menilai PIPELINE-nya —
 * padahal justru di situ aset rusak tanpa suara:
 *
 *   · LOD3 yang merusak siluet         (galat 0,84% vs ambang 2%)
 *   · proksi tabrakan yang bocor       (tembus 12,73% pada kotak)
 *   · peta bake yang kosong            (variasi 0,00000)
 *   · mesh yang melenceng dari b-rep   (−0,88% volume)
 *
 * Keempatnya SUDAH diukur alat ini sejak kemarin. Yang belum: mereka tidak
 * punya NAMA yang bisa ditulis di spek. Berkas ini memberi mereka nama.
 *
 * ── Kenapa dipisah dari `spek.mjs` ───────────────────────────────────────
 *
 * `turunkanUkuran` menerjemahkan satu pengukuran adegan. Ini menerjemahkan
 * SEKUMPULAN hasil pipeline yang bentuknya berbeda-beda. Mencampurnya akan
 * membuat fungsi yang tahu terlalu banyak, dan menambah satu jenis turunan
 * berarti menyentuh penilai spek.
 */

const bulat = (n, d = 6) => (typeof n === 'number' ? Number(n.toFixed(d)) : n);

/**
 * Ratakan hasil `rupa_lod` jadi kode yang bisa dinilai spek.
 *
 * Kode yang dihasilkan, untuk tiap tingkat i:
 *   segitiga_lod{i}        jumlah segitiga
 *   nisbah_lod{i}          pecahan terhadap LOD0
 *   galat_lod{i}_persen    simpangan MAKS, persen diagonal
 *   galat_rata_lod{i}_persen
 *
 * Plus ringkasan lintas-tingkat:
 *   galat_lod_terburuk_persen   yang terburuk di antara semua tingkat
 *   jumlah_lod                  banyak tingkat (di luar LOD0)
 *
 * `galat_lod_terburuk_persen` ada supaya spek bisa menulis SATU aturan yang
 * berlaku untuk seluruh rantai — menulis aturan per tingkat memaksa spek tahu
 * berapa tingkat yang dibuat, dan itu keputusan pipeline, bukan keputusan aset.
 */
export function dariLod(hasilLod) {
  const u = {};
  const laporan = hasilLod?.lod ?? [];
  if (!laporan.length) return u;

  /* SELURUH objek, bukan yang pertama.
   *
   * Versi pertama fungsi ini hanya membaca `laporan[0]` — dan pada aset
   * berobjek banyak, objek pertama kebetulan sebuah gelembung berdiameter
   * 0,09 satuan. Aturan `galat_lod_terburuk_persen <= 2` lulus dengan angka
   * 0,0000: benar untuk gelembung itu, dan tidak mengatakan apa pun tentang
   * tempurungnya.
   *
   * Aturan yang menilai angka tak bermakna lebih buruk daripada tidak ada
   * aturan — ia memberi rasa aman tanpa menjaga apa pun. Sekarang galatnya
   * diambil TERBURUK di seluruh objek, dan objek penyumbangnya ikut disebut
   * supaya bisa langsung ditelusuri.
   *
   * Persen diagonal bisa dibandingkan lintas objek justru karena ia NISBI
   * terhadap ukuran masing-masing; milimeter tidak bisa. */
  let terburuk = -1;
  let terburukDi = null;
  let terburukTingkat = null;
  let jumlahLod = 0;
  let segitigaLod0 = 0;
  const perTingkat = new Map();

  for (const L of laporan) {
    jumlahLod = Math.max(jumlahLod, (L.tingkat?.length ?? 1) - 1);
    for (const t of L.tingkat ?? []) {
      if (t.tingkat === 0) { segitigaLod0 += t.segitiga; continue; }
      const p = perTingkat.get(t.tingkat) ?? { segitiga: 0, maks: 0 };
      p.segitiga += t.segitiga;
      const m = t.galat?.maks_persen_diagonal ?? 0;
      p.maks = Math.max(p.maks, m);
      perTingkat.set(t.tingkat, p);
      if (m > terburuk) { terburuk = m; terburukDi = L.asal; terburukTingkat = t.tingkat; }
    }
  }

  u.lod_objek = laporan.length;
  u.jumlah_lod = jumlahLod;
  u.segitiga_lod0 = segitigaLod0;
  for (const [i, p] of perTingkat) {
    u[`segitiga_lod${i}`] = p.segitiga;
    u[`galat_lod${i}_persen`] = bulat(p.maks, 4);
    u[`nisbah_lod${i}`] = segitigaLod0 ? bulat(p.segitiga / segitigaLod0, 4) : null;
  }
  u.galat_lod_terburuk_persen = terburuk < 0 ? null : bulat(terburuk, 4);
  u.galat_lod_terburuk_objek = terburukDi;
  u.galat_lod_terburuk_tingkat = terburukTingkat;
  return u;
}

/**
 * Ratakan hasil `rupa_tabrakan`.
 *
 * DUA arah galat, dan keduanya punya arti yang berbeda bagi pemain:
 *   tembus  = permukaan asli DI LUAR proksi  -> benda menembus dinding
 *   longgar = proksi jauh di luar permukaan  -> tabrakan di udara kosong
 *
 * Keduanya diberi nama sendiri justru supaya spek bisa memberi ambang yang
 * BERBEDA. Untuk lantai, tembus 0 itu wajib dan longgar 5% tidak apa-apa;
 * untuk benda yang dipungut pemain, kebalikannya.
 */
export function dariTabrakan(hasilTabrakan) {
  const u = {};
  const h = hasilTabrakan?.tabrakan?.[0];
  if (!h) return u;
  const persen = (x) => (x?.maks_persen_diagonal == null ? null : bulat(x.maks_persen_diagonal, 4));
  u.tabrakan_objek = hasilTabrakan.objek_terpilih ?? h.asal;
  u.tabrakan_bentuk = h.bentuk;
  u.tabrakan_segitiga = h.segitiga_proksi;
  u.tabrakan_volume_nisbi = h.volume_nisbi;
  u.tabrakan_tembus_persen = persen(h.penyimpangan_permukaan_asli_dari_proksi);
  u.tabrakan_longgar_persen = persen(h.penyimpangan_proksi_dari_permukaan_asli);
  u.tabrakan_dinamis = h.cocok_untuk_dinamis === true;
  return u;
}

/**
 * Ratakan hasil `rupa_bake`, satu atau banyak jenis peta.
 *
 * `bake_variasi_min` adalah yang paling berguna: peta yang RATA berarti bake
 * tidak menghasilkan apa pun, dan itu kegagalan yang paling sering lolos —
 * berkasnya ada, ukurannya wajar, isinya kosong. Terukur pernah 0,00000.
 */
export function dariBake(daftarBake) {
  const u = {};
  const daftar = (Array.isArray(daftarBake) ? daftarBake : [daftarBake]).filter(Boolean);
  if (!daftar.length) return u;

  let variasiMin = Infinity;
  let cakupanMin = Infinity;
  for (const b of daftar) {
    const j = b.jenis ?? 'peta';
    u[`bake_${j}_cakupan_uv`] = bulat(b.cakupan_uv_persen ?? 0, 2);
    u[`bake_${j}_variasi`] = bulat(b.variasi_piksel ?? 0, 5);
    u[`bake_${j}_ukuran`] = b.ukuran ?? null;
    variasiMin = Math.min(variasiMin, b.variasi_piksel ?? 0);
    cakupanMin = Math.min(cakupanMin, b.cakupan_uv_persen ?? 0);
  }
  u.bake_jumlah = daftar.length;
  u.bake_variasi_min = bulat(variasiMin, 5);
  u.bake_cakupan_uv_min = bulat(cakupanMin, 2);
  return u;
}

/**
 * Ratakan hasil pengukuran b-rep (`cad.mjs` → `ukur`).
 *
 * Inilah satu-satunya tempat di mana kata "eksak" boleh dipakai. Semua
 * ukuran lain di sistem ini adalah hampiran; yang ini bukan.
 */
export function dariBrep(hasilBrep) {
  if (!hasilBrep) return {};
  const m = hasilBrep.mesh ?? {};
  return {
    volume_eksak: bulat(hasilBrep.volume_eksak),
    luas_eksak: bulat(hasilBrep.luas_eksak),
    tesselasi_toleransi: m.toleransi ?? null,
    tesselasi_segitiga: m.segitiga ?? null,
    // Nilai MUTLAK: spek ingin "meleset tidak lebih dari 0,05%", dan arah
    // melesetnya (mesh selalu lebih kecil) bukan urusan spek.
    galat_tesselasi_persen: m.galat_persen == null ? null : bulat(Math.abs(m.galat_persen), 4),
  };
}

/** Gabungkan semuanya jadi satu kamus ukuran yang bisa dinilai spek. */
export function gabungTurunan({ lod, tabrakan, bake, brep } = {}) {
  return {
    ...dariLod(lod),
    ...dariTabrakan(tabrakan),
    ...dariBake(bake),
    ...dariBrep(brep),
  };
}

/**
 * Ratakan hasil `topologiGLB` jadi kode yang bisa dinilai spek.
 *
 * Ini kosakata yang paling lama hilang dari alat ini. Sampai sekarang spek
 * bisa menilai BENTUK dan PIPELINE tetapi tidak bisa menilai bagaimana
 * meshnya DIBANGUN — padahal itu yang disebut laporan produksi 2026 sebagai
 * hambatan utama aset generatif.
 *
 * `tak_manifold` di sini BERBEDA dari `tak_manifold` yang dilaporkan
 * `rupa_ukur`, dan bedanya besar. Yang dari Blender menghitung indeks
 * MENTAH: glTF memecah verteks di tiap jahitan UV, jadi tiap jahitan
 * terhitung sebagai lubang. Terukur pada Takora: 30.790 mentah vs 360
 * setelah dilas — menggelembung 85x. Yang di sini yang benar.
 */
export function dariTopologi(t) {
  if (!t) return {};
  const u = {
    topo_segitiga: t.segitiga,
    topo_verteks_mentah: t.verteks_mentah,
    topo_verteks_terlas: t.verteks_terlas,
    topo_nisbah_pecah: t.nisbah_pecah,
    topo_tak_manifold: t.tepi_tak_manifold,
    topo_tepi_batas: t.tepi_batas,
    topo_putaran_salah: t.tepi_putaran_salah,
    topo_degenerasi: t.segitiga_degenerasi,
    topo_lipat: t.segitiga_lipat,
    topo_sliver: t.segitiga_sliver,
    topo_sudut_min: t.sudut_min_terkecil,
    topo_primitif: t.primitif,
    topo_tertutup_semua: t.primitif_tertutup === t.primitif,
  };
  /* `null` kalau tidak ada satu pun primitif ber-UV — bukan 0. Nol akan
     meloloskan aturan `texel_sebaran <= 3` pada mesh yang sama sekali tidak
     punya UV, yaitu kasus yang justru paling perlu ditolak. */
  u.topo_texel_sebaran = t.texel_sebaran_terburuk;
  /* Tumpang-tindih UV: `null` kalau tidak diukur atau tidak ada UV sama
     sekali. Nol akan meloloskan aturan pada mesh yang justru tidak punya UV
     untuk ditindih. */
  u.topo_uv_tumpang_persen = t.uv_tumpang_persen_terburuk;
  u.topo_uv_tumpang_lapis = t.uv_tumpang_lapis_maks;
  u.topo_uv_di_luar = t.uv_primitif ? t.uv_segitiga_di_luar : null;
  u.topo_primitif_ber_uv = t.uv_primitif;
  u.topo_primitif_tanpa_uv = t.uv_tanpa;
  return u;
}

/**
 * Ratakan hasil `teksturGLB` jadi kode yang bisa dinilai spek.
 *
 * `tex_piksel_per_meter_min` adalah yang paling berguna: ia menjawab
 * "apakah teksturnya cukup untuk benda ini", yang tidak bisa dijawab
 * resolusi sendirian. Tekstur 2048 pada peti 0,5 m dan tekstur 512 pada
 * dinding 20 m sama-sama salah, dan keduanya terlihat wajar di daftar aset.
 */
export function dariTekstur(t) {
  if (!t) return {};
  const u = {
    tex_gambar: t.gambar,
    tex_bita: t.bita_total,
    tex_vram_bita: t.vram_bita_total,
    tex_peta_rata: t.peta_rata,
    tex_alfa_sia_sia: t.peta_alfa_sia_sia,
    tex_kemungkinan_upscale: t.peta_kemungkinan_upscale,
    tex_bukan_pot: t.peta_bukan_pot,
    tex_tanpa_slot: t.peta_tanpa_slot,
    tex_slot_bertentangan: t.slot_bertentangan,
  };
  /* `null` kalau tidak ada tekstur sama sekali — bukan 0. Nol akan
     meloloskan aturan `tex_piksel_per_meter_min >= 100` pada aset yang
     justru tidak punya tekstur, yaitu kasus yang paling perlu ditolak. */
  /* VRAM per format, bukan satu angka. Aturan spek yang menulis
     `tex_vram_bita <= 8 MB` pada aset ber-KTX2 akan menolak aset yang
     sebenarnya cuma memakai 1 MB — asumsi yang tidak dinyatakan menjadi
     gerbang yang salah. */
  u.tex_vram_rgba8 = t.vram_total?.rgba8 ?? null;
  u.tex_vram_bc7 = t.vram_total?.bc7_uastc ?? null;
  u.tex_vram_bc1 = t.vram_total?.bc1_etc1s ?? null;
  u.tex_terkompres_gpu = t.gambar ? t.gambar_terkompres_gpu === t.gambar : null;
  /* Yang BERLAKU: kalau semuanya sudah KTX2, yang dibayar BC7; kalau tidak,
     yang dibayar mentah. Inilah angka yang seharusnya jadi gerbang. */
  /* Akses bertitik-tanya, bukan langsung: pengukuran yang TIDAK LENGKAP harus
     keluar sebagai `null` ("tidak terukur"), bukan melempar dan menghentikan
     seluruh penurunan. Sejak `null` benar-benar menggagalkan aturannya, itu
     aman - yang tidak terukur ditolak, bukan diloloskan. */
  u.tex_vram_berlaku = t.gambar
    ? (t.gambar_terkompres_gpu === t.gambar
      ? (t.vram_total?.bc7_uastc ?? null) : (t.vram_total?.rgba8 ?? null))
    : null;

  u.tex_piksel_per_meter_min = t.piksel_per_meter?.piksel_per_meter_min ?? null;
  u.tex_piksel_per_meter_maks = t.piksel_per_meter?.piksel_per_meter_maks ?? null;
  u.tex_piksel_sebaran = t.piksel_per_meter?.sebaran ?? null;

  /* Normal map yang tidak lolos dua syarat (|v| dekat 1 DAN biru tinggi)
     hampir pasti gambar yang salah pasang slot. */
  const normal = (t.per_gambar ?? []).filter((g) => g.normal);
  u.tex_normal_jumlah = normal.length;
  /* KEABSAHAN dan KEBERADAAN adalah dua pertanyaan berbeda, dan aturan yang
     mencampurnya menyebut sebab yang salah.
     "Semua normal map yang ada itu sah" pada aset TANPA normal map bernilai
     benar secara hampa - tidak ada satu pun yang tidak sah. Melaporkan `null`
     di sini membuat aset beralbedo saja (yang sepenuhnya sah di glTF) ditolak
     dengan pesan "normal map tidak sah", padahal ia tidak punya satu pun.
     Yang menuntut KEBERADAANNYA aturan lain: `tex_normal_jumlah >= 1`, dan
     itu angka sungguhan yang tidak pernah null. */
  u.tex_normal_sah = normal.every((g) => g.normal.terlihat_seperti_normal);
  return u;
}

/**
 * Kosakata SPEK untuk TOPOLOGI SUMBER — yang cuma ada di dalam Blender.
 *
 * Terpisah dari `dariTopologi()` dengan sengaja, dan awalannya berbeda
 * (`sum_` bukan `topo_`), karena SUMBER pengukurannya berbeda dan aturan yang
 * mencampurnya akan menyesatkan: `topo_*` bisa diukur dari GLB mana pun tanpa
 * Blender, `sum_*` menuntut mesh sumbernya dan MUSNAH begitu diekspor.
 *
 * Sebuah sertifikat yang membawa `sum_quad_persen` menyatakan sesuatu tentang
 * berkas yang TIDAK ditempelinya. Itu sah — tetapi hanya kalau namanya
 * menyebutkannya.
 */
export function dariTopologiSumber(t) {
  if (!t) return {};
  return {
    sum_muka: t.muka,
    sum_segitiga: t.segitiga,
    sum_quad: t.quad,
    sum_ngon: t.ngon,
    sum_quad_persen: t.quad_persen,
    sum_kutub: t.kutub,
    sum_kutub_persen: t.kutub_persen,
    sum_gelang: t.gelang,
    sum_gelang_terputus: t.gelang_terputus,
    sum_gelang_terpanjang: t.gelang_terpanjang,
    sum_quad_tak_sebidang: t.quad_tak_sebidang,
    /* Peringatan "seluruhnya segitiga" jadi UKURAN, bukan cuma teks. Aturan
       yang menuntut quad harus bisa membedakan mesh bertopologi segitiga dari
       mesh yang quad-nya musnah saat impor — dan karena alatnya TIDAK bisa
       membedakannya, yang jujur adalah menandai bahwa angkanya meragukan. */
    sum_semua_segitiga: (t.peringatan ?? []).length > 0,
  };
}

/** Kosakata SPEK untuk kompresi geometri. Kecil, tetapi ia yang membuat
 *  aturan "aset kirim harus terkompres" atau sebaliknya "aset sumber tidak
 *  boleh terkuantisasi" bisa ditulis sama sekali. */
export function dariKompresi(u) {
  if (!u) return {};
  return {
    geo_draco: u.draco === true,
    geo_draco_primitif: u.draco_primitif ?? 0,
  };
}
