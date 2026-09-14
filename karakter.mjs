/* KARAKTER — kendali pemain kinematik, dan pengujiannya di luar browser.
 *
 * ── Kenapa kinematik, bukan badan dinamis ────────────────────────────────
 *
 * Karakter yang digerakkan gaya akan terpeleset di tanjakan, terpental di
 * tangga, dan terguling saat menabrak. Karakter kinematik naik anak tangga,
 * menempel di lereng, dan tidak pernah jatuh terguling — itu yang dirasakan
 * pemain sebagai "kontrolnya enak", dan itu keputusan rancangan, bukan
 * kemalasan.
 *
 * Yang TIDAK dipakai dari `KinematicCharacterController` Rapier: gravitasi.
 * Rapier tidak menghitung jatuh untuk karakter kinematik. Kecepatan vertikal
 * diurus di sini, dan `computedGrounded()` yang memberi tahu kapan menyentuh
 * tanah.
 *
 * ── Kenapa logikanya di modul sendiri, bukan di runtime ──────────────────
 *
 * Karena runtime digerakkan `requestAnimationFrame`, dan rAF **menyala nol
 * kali per detik saat tabnya tidak dilukis**. Selama membangun ini, browser
 * otomatis melaporkan pemain tidak bergerak — dan itu bukan bug kendalinya,
 * melainkan tab yang tidak dilukis. Alat uji yang tidak bisa menggerakkan
 * jamnya sendiri tidak bisa menguji apa pun yang bergantung pada waktu.
 *
 * Di sini langkahnya dipanggil sendiri, jadi "berjalan 1 detik" berarti
 * benar-benar 60 langkah, di Node, deterministik.
 */

export const KECEPATAN = 4.5;      // m/s
export const LOMPAT = 5.2;         // m/s awal
export const GRAVITASI = 18;       // m/s², lebih tajam daripada 9,81 — terasa lebih enak

/**
 * Buat karakter kinematik berikut pengendalinya.
 *
 * @param {object} d  dunia dari fisika.mjs
 */
export function buatKarakter(d, {
  posisi = [0, 1, 0], tinggi = 1.7, jari = 0.3,
  naikTangga = 0.35, lerengMaks = 50, lerengGeser = 35, tempelTanah = 0.35,
} = {}) {
  const { R, w } = d;
  const kendali = w.createCharacterController(0.02);
  kendali.enableAutostep(naikTangga, 0.2, true);
  kendali.enableSnapToGround(tempelTanah);
  kendali.setMaxSlopeClimbAngle((lerengMaks * Math.PI) / 180);
  kendali.setMinSlopeSlideAngle((lerengGeser * Math.PI) / 180);

  const badan = w.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(...posisi));
  const setengah = Math.max(tinggi / 2 - jari, 1e-6);
  const collider = w.createCollider(R.ColliderDesc.capsule(setengah, jari), badan);

  return {
    d, kendali, badan, collider, tinggi, jari,
    vY: 0,
    naikTangga, lerengMaks,
  };
}

/**
 * Satu langkah kendali. `arah` di ruang dunia, ternormalisasi di dalam.
 *
 * `dt` DIBATASI: satu bingkai yang tersendat (tab kembali dari latar, GC,
 * pemuatan tekstur) bisa memberi dt 2 detik, dan pemain akan berpindah 9
 * meter dalam satu langkah — menembus dinding yang seharusnya menahannya.
 * Batas 1/20 s berarti gerakan melambat saat tersendat, bukan menembus.
 */
export function langkahKarakter(k, {
  dt, arah = [0, 0], lompat = false, gravitasi = GRAVITASI, kecepatan = KECEPATAN,
} = {}) {
  const d = Math.min(Math.max(dt, 0), 1 / 20);
  let [mx, mz] = arah;
  const p = Math.hypot(mx, mz);
  if (p > 1e-9) { mx /= p; mz /= p; } else { mx = 0; mz = 0; }

  const menapak = k.kendali.computedGrounded();
  if (menapak && k.vY < 0) k.vY = 0;
  if (menapak && lompat) k.vY = LOMPAT;
  k.vY -= gravitasi * d;

  k.kendali.computeColliderMovement(k.collider, {
    x: mx * kecepatan * d, y: k.vY * d, z: mz * kecepatan * d,
  });
  const g = k.kendali.computedMovement();
  const t = k.badan.translation();
  k.badan.setNextKinematicTranslation({ x: t.x + g.x, y: t.y + g.y, z: t.z + g.z });

  /* Menabrak langit-langit: tanpa ini pemain menempel di bawahnya sampai
     kecepatan naiknya habis, dan itu terasa seperti tersangkut. */
  if (k.vY > 0 && g.y < k.vY * d * 0.5) k.vY = 0;

  k.d.w.step();
  return {
    menapak, gerak: [g.x, g.y, g.z], vY: k.vY,
    posisi: (() => { const q = k.badan.translation(); return [q.x, q.y, q.z]; })(),
  };
}

/** Jalankan `detik` detik dengan masukan tetap. Deterministik. */
export function jalanKarakter(k, { detik, arah = [0, 0], lompat = false, lompatSekali = false } = {}) {
  const n = Math.round(detik / k.d.langkah);
  let hasil = null;
  let pernahMenapak = false;
  let yMaks = -Infinity;
  let yMin = Infinity;
  for (let i = 0; i < n; i++) {
    hasil = langkahKarakter(k, {
      dt: k.d.langkah, arah,
      lompat: lompatSekali ? i === 0 : lompat,
    });
    pernahMenapak = pernahMenapak || hasil.menapak;
    yMaks = Math.max(yMaks, hasil.posisi[1]);
    yMin = Math.min(yMin, hasil.posisi[1]);
  }
  return { ...hasil, langkah: n, pernah_menapak: pernahMenapak, y_maks: yMaks, y_min: yMin };
}
