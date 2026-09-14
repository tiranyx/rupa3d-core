/* FISIKA — badan kaku Rapier, dan pemeriksanya terhadap mekanika dasar.
 *
 * ── Kenapa fisika masuk ke alat yang mengukur ────────────────────────────
 *
 * Mesin fisika gagal dengan cara yang khas, dan tidak satu pun terlihat di
 * tangkapan layar:
 *
 *   TEMBUS   benda cepat melewati dinding tipis karena antara dua langkah
 *            ia sudah berada di sisi lain
 *   GETAR    benda diam bergetar di tempat karena penyelesai tabrakannya
 *            saling mendorong
 *   HANYUT   benda diam pelan-pelan bergeser meski tidak ada gaya
 *   MASSA    collider tidak cocok dengan benda yang terlihat, jadi bendanya
 *            berperilaku seperti benda lain
 *
 * Keempatnya bisa DIUKUR, dan tiga di antaranya punya acuan tertutup:
 *
 *   jatuh bebas   h = ½gt²        → t = √(2h/g)
 *   pantulan      h' = h·e²        (e = koefisien restitusi)
 *   massa         m = ρ·V          (V eksak dari b-rep OCCT)
 *
 * ── Toleransinya berasal dari TIMESTEP, bukan dari selera ────────────────
 *
 * Jatuh 10 → 5 m pada 60 Hz memberi 1,0167 s terhadap analitik 1,0096 s —
 * meleset 0,696 %. Angka itu terdengar seperti galat integrator, dan bukan:
 * selisihnya 0,0071 s, KURANG DARI SATU LANGKAH (0,0167 s). Simulasi diskret
 * tidak bisa melaporkan kejadian di antara dua langkah.
 *
 * Jadi ambangnya dinyatakan dalam langkah, bukan persen. Memakai persen
 * berarti pemeriksanya akan salah begitu timestep-nya diubah — dan
 * timestep memang diubah orang.
 */
import RAPIER from '@dimforge/rapier3d-compat';

let _siap = null;
export async function siap() {
  if (!_siap) _siap = RAPIER.init().then(() => RAPIER);
  return _siap;
}

export const GRAVITASI_BUMI = [0, -9.81, 0];
export const JENIS_BADAN = ['statis', 'dinamis', 'kinematik'];
/* `trimesh` ada di sini dan TIDAK ada di daftar bernama sama di `adegan.mjs`.
 * Bedanya nyata: trimesh sah untuk badan STATIS (lantai, terrain) dan ditolak
 * untuk badan dinamis — `tambahBadan` memaksakan itu. Node adegan harus bisa
 * dinamis, jadi daftarnya lebih pendek. */
export const BENTUK_TABRAK = ['kotak', 'bola', 'kapsul', 'silinder', 'cembung', 'trimesh'];

/**
 * Dunia fisika.
 *
 * `langkah` sengaja tidak diberi nilai "yang enak": ia menentukan ambang
 * tembus DAN ketepatan tiap pemeriksa di bawah. 1/60 adalah bawaan Rapier
 * dan bawaan hampir semua game web, jadi itu yang dipakai — tetapi ia
 * dilaporkan di tiap hasil supaya angkanya bisa dibaca dengan benar.
 */
export async function dunia({ gravitasi = GRAVITASI_BUMI, langkah = 1 / 60 } = {}) {
  const R = await siap();
  const w = new R.World({ x: gravitasi[0], y: gravitasi[1], z: gravitasi[2] });
  w.timestep = langkah;
  return { R, w, gravitasi, langkah };
}

function deskripsiCollider(R, bentuk, ukuran) {
  const [x = 1, y = 1, z = 1] = ukuran ?? [];
  if (bentuk === 'kotak') return R.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
  if (bentuk === 'bola') return R.ColliderDesc.ball(x / 2);
  if (bentuk === 'kapsul') return R.ColliderDesc.capsule(Math.max(y / 2 - x / 2, 1e-6), x / 2);
  if (bentuk === 'silinder') return R.ColliderDesc.cylinder(y / 2, x / 2);
  throw new Error(`bentuk tabrakan ${bentuk} butuh titik mesh — pakai tambahBadanMesh()`);
}

/**
 * Satu badan kaku berikut collidernya.
 *
 * `kerapatan` DAN `massa` sengaja tidak boleh diberikan bersamaan. Rapier
 * menerima keduanya dan diam-diam mengabaikan salah satunya; benda lalu
 * berperilaku seperti benda lain dan tidak ada yang tahu sebabnya.
 */
export function tambahBadan(d, {
  jenis = 'dinamis', bentuk = 'kotak', ukuran = [1, 1, 1],
  posisi = [0, 0, 0], putar = null,
  massa = null, kerapatan = null, gesekan = 0.5, pantul = 0,
  nama = null,
} = {}) {
  const { R, w } = d;
  if (!JENIS_BADAN.includes(jenis)) {
    throw new Error(`jenis badan tidak dikenal: ${jenis}. Yang ada: ${JENIS_BADAN.join(', ')}`);
  }
  if (massa != null && kerapatan != null) {
    throw new Error('sebutkan `massa` ATAU `kerapatan`, bukan keduanya — '
      + 'Rapier menerima keduanya dan diam-diam mengabaikan salah satunya');
  }
  if (jenis === 'dinamis' && bentuk === 'trimesh') {
    throw new Error('trimesh TIDAK bisa dinamis di Rapier — pakai `cembung`, '
      + 'atau jadikan badannya statis. Ini batas mesin fisikanya, bukan pilihan.');
  }

  const desc = jenis === 'statis' ? R.RigidBodyDesc.fixed()
    : jenis === 'kinematik' ? R.RigidBodyDesc.kinematicPositionBased()
      : R.RigidBodyDesc.dynamic();
  desc.setTranslation(posisi[0], posisi[1], posisi[2]);
  if (putar) {
    const [rx, ry, rz] = putar.map((g) => (g * Math.PI) / 180);
    const q = eulerKeQuat(rx, ry, rz);
    desc.setRotation(q);
  }
  const badan = w.createRigidBody(desc);

  const cd = deskripsiCollider(R, bentuk, ukuran);
  cd.setFriction(gesekan).setRestitution(pantul);
  if (massa != null) cd.setMass(massa);
  else if (kerapatan != null) cd.setDensity(kerapatan);
  const collider = w.createCollider(cd, badan);

  return {
    badan, collider, nama, jenis, bentuk,
    massa: badan.mass(),
    volume: collider.volume?.() ?? null,
  };
}

function eulerKeQuat(x, y, z) {
  const [cx, sx] = [Math.cos(x / 2), Math.sin(x / 2)];
  const [cy, sy] = [Math.cos(y / 2), Math.sin(y / 2)];
  const [cz, sz] = [Math.cos(z / 2), Math.sin(z / 2)];
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

/** Jalankan simulasi, kembalikan lintasan satu badan yang diamati. */
export function jalankan(d, badan, { detik = 2, tiapLangkah = null } = {}) {
  const n = Math.round(detik / d.langkah);
  const lintasan = [];
  for (let i = 0; i < n; i++) {
    d.w.step();
    const t = badan.translation();
    const v = badan.linvel();
    lintasan.push({
      langkah: i + 1, waktu: (i + 1) * d.langkah,
      y: t.y, posisi: [t.x, t.y, t.z], laju: Math.hypot(v.x, v.y, v.z),
    });
    if (tiapLangkah) tiapLangkah(lintasan[lintasan.length - 1]);
  }
  return lintasan;
}

/* ── Pemeriksa terhadap mekanika dasar ────────────────────────────────── */

/**
 * Jatuh bebas: waktu untuk turun sejauh `turun` meter.
 *
 * Ambangnya SATU LANGKAH, bukan persen. Simulasi diskret tidak bisa
 * melaporkan kejadian di antara dua langkah, jadi ketidaktepatan sebesar
 * satu langkah bukan kesalahan — ia batas resolusi. Menyatakannya dalam
 * persen membuat pemeriksanya salah begitu timestep-nya diubah.
 */
export async function periksaJatuhBebas({ dari = 10, turun = 5, langkah = 1 / 60 } = {}) {
  const d = await dunia({ langkah });
  const b = tambahBadan(d, { bentuk: 'bola', ukuran: [0.2, 0.2, 0.2], posisi: [0, dari, 0] });
  const target = dari - turun;
  let t = 0;
  while (b.badan.translation().y > target && t < 60) { d.w.step(); t += langkah; }

  const g = Math.abs(d.gravitasi[1]);
  const analitik = Math.sqrt((2 * turun) / g);
  const selisih = Math.abs(t - analitik);
  return {
    simulasi: Number(t.toFixed(6)), analitik: Number(analitik.toFixed(6)),
    selisih: Number(selisih.toFixed(6)),
    langkah, dalam_satu_langkah: selisih <= langkah,
    galat_persen: Number(((selisih / analitik) * 100).toFixed(4)),
    catatan: 'ambangnya SATU LANGKAH — simulasi diskret tidak bisa melaporkan '
      + 'kejadian di antara dua langkah',
  };
}

/**
 * Pantulan: koefisien restitusi yang BENAR-BENAR terjadi.
 *
 * ── Pemeriksa pertama saya salah, dan mesinnya benar ─────────────────────
 *
 * Versi pertama mengukur TINGGI PANTUL dan melaporkan e = 0,3 memantul ke
 * 0,00015 m dari teori 0,4275 — seolah restitusi Rapier hancur. Ia tidak.
 * Diukur langsung di titik tumbukan, e terukur = e diminta sampai empat
 * desimal, di 60 Hz maupun 240 Hz, dalam SATU langkah kontak:
 *
 *     diminta 0,20  |v| 7,3575 -> 1,4715   e 0,2000
 *     diminta 0,95  |v| 7,3575 -> 6,9896   e 0,9500
 *
 * Yang rusak deteksi tumbukan saya: ia menunggu bola berada dalam jendela
 * POSISI selebar 1 mm dari lantai, sementara bola bergerak 120 mm per
 * langkah pada 60 Hz. Peluang tertangkap sekitar 1%.
 *
 * indikator - pemeriksa melaporkan kegagalan total pada mesin yang matang
 * parameter - jendela deteksi berbasis POSISI
 * faktor-X  - resolusi pencuplikan simulasi diskret: jendela harus lebih
 *             lebar daripada perpindahan per langkah, atau peristiwanya
 *             dilewati sama sekali
 *
 * Sekarang tumbukan dideteksi dari PEMBALIKAN TANDA KECEPATAN, yang tidak
 * bisa terlewat berapa pun timestep-nya: kalau bolanya memantul, tandanya
 * berubah, titik.
 *
 * Tinggi apeks tetap dilaporkan sebagai angka kedua — ia yang dirasakan
 * pemain — tetapi yang DINILAI adalah nisbah kecepatan, karena itulah
 * definisi restitusi.
 */
export async function periksaPantulan({ dari = 3, e = 0.8, langkah = 1 / 60 } = {}) {
  const d = await dunia({ langkah });
  const jari = 0.25;
  tambahBadan(d, {
    jenis: 'statis', bentuk: 'kotak', ukuran: [40, 0.4, 40], posisi: [0, -0.2, 0],
    pantul: e, gesekan: 0,
  });
  const b = tambahBadan(d, {
    bentuk: 'bola', ukuran: [jari * 2, jari * 2, jari * 2],
    posisi: [0, dari, 0], pantul: e, gesekan: 0,
  });

  let vSebelum = null;
  let vSesudah = null;
  let apeks = 0;
  let sesudahPantul = false;

  for (let i = 0; i < Math.round(6 / langkah); i++) {
    const v0 = b.badan.linvel().y;
    d.w.step();
    const v1 = b.badan.linvel().y;

    /* Pembalikan tanda = tumbukan. Ambang 0,5 m/s memisahkannya dari
       goyangan kontak saat bolanya sudah hampir diam. */
    if (vSebelum == null && v0 < -0.1 && v1 > v0 + 0.5) {
      vSebelum = Math.abs(v0);
      sesudahPantul = true;
    }
    if (sesudahPantul && vSesudah == null && v1 > 0.01) vSesudah = v1;
    if (sesudahPantul && vSesudah != null) {
      if (v1 > 0) apeks = Math.max(apeks, b.badan.translation().y - jari);
      else if (apeks > 0) break;
    }
  }

  const eTerukur = vSebelum && vSesudah ? vSesudah / vSebelum : null;
  const tinggiJatuh = dari - jari;
  return {
    e_diminta: e,
    e_terukur: eTerukur == null ? null : Number(eTerukur.toFixed(4)),
    galat_e_persen: eTerukur == null ? null
      : Number((((eTerukur - e) / e) * 100).toFixed(4)),
    laju_sebelum: vSebelum == null ? null : Number(vSebelum.toFixed(4)),
    laju_sesudah: vSesudah == null ? null : Number(vSesudah.toFixed(4)),
    apeks_m: Number(apeks.toFixed(5)),
    apeks_teori_m: Number((tinggiJatuh * e * e).toFixed(5)),
    langkah,
    catatan: 'yang DINILAI nisbah kecepatan di tumbukan — itu definisi '
      + 'restitusi. Apeks dilaporkan tetapi lebih lemah: ia menyerap galat '
      + 'gravitasi diskret sepanjang lintasan naiknya.',
  };
}

/**
 * Hanyut: benda diam di atas lantai tidak boleh bergerak.
 *
 * Ini pemeriksa yang paling sering dilewatkan dan paling sering rusak.
 * Hanyut sebesar 1 mm per detik tidak terlihat sama sekali dalam demo 5
 * detik, dan menjadi 3,6 meter dalam satu jam permainan.
 */
export async function periksaDiam({ detik = 5, langkah = 1 / 60 } = {}) {
  const d = await dunia({ langkah });
  tambahBadan(d, { jenis: 'statis', bentuk: 'kotak', ukuran: [40, 0.4, 40], posisi: [0, -0.2, 0] });
  const b = tambahBadan(d, { bentuk: 'kotak', ukuran: [1, 1, 1], posisi: [0, 0.5, 0] });

  const awal = b.badan.translation();
  const p0 = [awal.x, awal.y, awal.z];
  let getarMaks = 0;
  let sebelum = p0;
  for (let i = 0; i < Math.round(detik / langkah); i++) {
    d.w.step();
    const t = b.badan.translation();
    const p = [t.x, t.y, t.z];
    getarMaks = Math.max(getarMaks, Math.hypot(p[0] - sebelum[0], p[1] - sebelum[1], p[2] - sebelum[2]));
    sebelum = p;
  }
  const akhir = b.badan.translation();
  const hanyut = Math.hypot(akhir.x - p0[0], akhir.y - p0[1], akhir.z - p0[2]);
  return {
    detik, hanyut_total_m: Number(hanyut.toFixed(8)),
    hanyut_per_jam_m: Number(((hanyut / detik) * 3600).toFixed(4)),
    getar_maks_per_langkah_m: Number(getarMaks.toFixed(8)),
    tidur: b.badan.isSleeping(),
  };
}

/**
 * Batas kecepatan Rapier — dan kenapa ini harus diukur sebelum apa pun
 * tentang tembus bisa dikatakan.
 *
 * Rapier MEREDAM kecepatan linear, dan tidak memberi tahu siapa pun. Minta
 * 5.000 m/s, dapat 400. Minta 200.000, dapat 400.
 *
 *     diminta      50 m/s  ->  linvel  50,0  ·  pindah 0,833 m/langkah
 *     diminta   5.000 m/s  ->  linvel 400,0  ·  pindah 6,667 m/langkah
 *     diminta 200.000 m/s  ->  linvel 400,0  ·  pindah 6,667 m/langkah
 *
 * Ini kegagalan diam yang khas: sebuah peluru yang disetel 900 m/s berjalan
 * pada 400 m/s, dan tidak ada satu pun tanda. Yang terlihat cuma "senjatanya
 * terasa lambat".
 *
 * Sapuan tembus pertama saya melaporkan "tidak ada tembus sampai 200.000
 * m/s" — dan itu tidak berarti apa-apa, karena setiap kasus di atas 400
 * sebenarnya berjalan pada 400. Pemeriksa yang lulus karena kondisinya tidak
 * pernah tercapai bukan pemeriksa.
 */
export async function batasLaju({ langkah = 1 / 60, minta = [50, 400, 500, 5000, 200000] } = {}) {
  const hasil = [];
  for (const v of minta) {
    const d = await dunia({ langkah, gravitasi: [0, 0, 0] });
    const R = d.R;
    const b = d.w.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(0, 0, -20).setLinvel(0, 0, v));
    d.w.createCollider(R.ColliderDesc.ball(0.05), b);
    d.w.step();
    const lv = b.linvel().z;
    hasil.push({
      diminta: v, tercapai: Number(lv.toFixed(3)),
      diredam: lv < v - 1e-6,
      pindah_per_langkah: Number((lv * langkah).toFixed(4)),
    });
  }
  const diredam = hasil.filter((h) => h.diredam);
  return {
    langkah, hasil,
    laju_maks_terukur: Math.max(...hasil.map((h) => h.tercapai)),
    ada_peredaman: diredam.length > 0,
    catatan: diredam.length
      ? `Rapier meredam di ${Math.max(...hasil.map((h) => h.tercapai))} m/s tanpa `
        + `peringatan apa pun — laju di atas itu diam-diam dikurangi`
      : 'tidak ada peredaman pada rentang yang diuji',
  };
}

/**
 * Ambang TEMBUS: pada laju berapa benda mulai menembus dinding setebal
 * `tebal` — diuji HANYA sampai laju yang benar-benar bisa dicapai.
 *
 * Model naifnya jelas: benda yang bergerak lebih jauh daripada tebal dinding
 * dalam satu langkah bisa berada di sisi lain sebelum tabrakannya terdeteksi.
 *
 *     v_naif = tebal / langkah
 *
 * Model itu TIDAK berlaku untuk Rapier, dan itu terukur: bola 5 cm terhadap
 * dinding 2 cm pada 60 Hz berhenti tepat di permukaan dinding di setiap laju
 * sampai batas peredaman 400 m/s — enam meter perpindahan per langkah, 333×
 * di atas v_naif. Rapier memakai kontak spekulatif yang tidak disebut model
 * naif itu.
 *
 * Yang dilaporkan karena itu bukan "aman", melainkan **apa yang benar-benar
 * diuji**: sampai laju berapa, dengan bentuk apa, dan pada timestep berapa.
 * Klaim "tidak tembus" tanpa menyebut batas ujinya adalah klaim kosong.
 */
export async function cariAmbangTembus({
  tebal = 0.1, langkah = 1 / 60, ccd = false, jariBola = 0.05, langkahLaju = 20,
} = {}) {
  const batas = await batasLaju({ langkah, minta: [200000] });
  const lajuMaks = batas.laju_maks_terukur;
  const naif = tebal / langkah;

  let tembusPertama = null;
  const rincian = [];
  for (let v = langkahLaju; v <= lajuMaks; v += langkahLaju) {
    const d = await dunia({ langkah, gravitasi: [0, 0, 0] });
    const R = d.R;
    d.w.createCollider(R.ColliderDesc.cuboid(10, 10, tebal / 2),
      d.w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0)));
    const desc = R.RigidBodyDesc.dynamic().setTranslation(0, 0, -20).setLinvel(0, 0, v);
    if (ccd) desc.setCcdEnabled(true);
    const b = d.w.createRigidBody(desc);
    d.w.createCollider(R.ColliderDesc.ball(jariBola), b);

    for (let i = 0; i < 400; i++) { d.w.step(); if (b.translation().z > 2) break; }
    const tembus = b.translation().z > 1;
    rincian.push({ laju: v, tembus, z_akhir: Number(b.translation().z.toFixed(3)) });
    if (tembus && tembusPertama == null) { tembusPertama = v; break; }
  }

  return {
    tebal, langkah, ccd, jari_bola: jariBola,
    laju_maks_yang_bisa_diuji: lajuMaks,
    v_naif: Number(naif.toFixed(3)),
    v_tembus_terukur: tembusPertama,
    lipat_di_atas_naif: tembusPertama == null
      ? Number((lajuMaks / naif).toFixed(1))
      : Number((tembusPertama / naif).toFixed(1)),
    catatan: tembusPertama == null
      ? `TIDAK tembus sampai ${lajuMaks} m/s — batas peredaman Rapier, bukan `
        + `batas ujinya. Itu ${(lajuMaks / naif).toFixed(0)}x di atas model naif `
        + `${naif.toFixed(1)} m/s: kontak spekulatif Rapier menjaganya. Klaim ini `
        + `berlaku untuk bola r${jariBola} vs dinding datar besar; benda berputar, `
        + `trimesh, dan kinematik cepat BELUM diuji.`
      : `mulai tembus di ${tembusPertama} m/s (model naif ${naif.toFixed(1)} m/s)`,
    rincian,
  };
}

/**
 * Massa dari kerapatan × volume — dan volume EKSAK dari b-rep sebagai acuan.
 *
 * Inilah tautan yang membuat sisi CAD dan sisi fisika saling memeriksa:
 * kalau collider tidak cocok dengan geometrinya, massanya salah, dan benda
 * itu akan berperilaku seperti benda lain sepanjang permainan tanpa satu
 * pun tanda di layar.
 */
export async function periksaMassa({ bentuk = 'kotak', ukuran = [2, 3, 4], kerapatan = 7850 } = {}) {
  const d = await dunia();
  const b = tambahBadan(d, { bentuk, ukuran, kerapatan });
  const V = {
    kotak: ukuran[0] * ukuran[1] * ukuran[2],
    bola: (4 / 3) * Math.PI * (ukuran[0] / 2) ** 3,
    silinder: Math.PI * (ukuran[0] / 2) ** 2 * ukuran[1],
  }[bentuk];
  if (V == null) throw new Error(`volume analitik untuk ${bentuk} belum ditulis`);
  const diharap = V * kerapatan;
  return {
    bentuk, ukuran, kerapatan,
    volume_analitik: Number(V.toFixed(8)),
    massa_rapier: Number(b.massa.toFixed(6)),
    massa_analitik: Number(diharap.toFixed(6)),
    galat_persen: Number((((b.massa - diharap) / diharap) * 100).toFixed(6)),
  };
}
