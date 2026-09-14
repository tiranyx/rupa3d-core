/* PROKSI TABRAKAN — hull cembung yang diukur dengan bentuk yang BERJALAN.
 *
 * ── Kenapa proksi, dan kenapa harus diukur ───────────────────────────────
 *
 * Collider yang mengikuti mesh persis adalah trimesh, dan trimesh tidak bisa
 * dinamis di mesin fisika mana pun yang dipakai di web. Jadi setiap benda
 * bergerak memakai PROKSI — bentuk sederhana yang mewakili bentuk aslinya.
 *
 * Dan proksi yang dipilih diam-diam adalah proksi yang tidak pernah
 * diperiksa. Dua arahnya punya arti yang berbeda bagi pemain:
 *
 *   TEMBUS   permukaan asli berada DI LUAR proksi  →  benda menembus dinding
 *   LONGGAR  proksi jauh di luar permukaan asli    →  tabrakan di udara kosong
 *
 * ── Yang membuat pengukuran di sini berbeda ──────────────────────────────
 *
 * Versi Blender (A2) mengukurnya lewat BVH — hampiran jarak titik ke
 * permukaan. Di sini jaraknya EKSAK, dan diukur terhadap collider Rapier
 * yang **persis akan berjalan di runtime**: `collider.projectPoint()`
 * mengembalikan titik terdekat pada bentuk yang sesungguhnya.
 *
 * Terbukti pada kubus satuan: titik (3,3,3) memberi jarak 3,4641 = 2√3,
 * tepat sampai empat desimal.
 *
 * Mengukur proksi dengan alat yang berbeda dari yang menjalankannya berarti
 * mengukur benda yang berbeda.
 */
import { dunia } from './fisika.mjs';
import { titikGLB } from './glb.mjs';

/* ── Batas keras yang HARUS dihormati, dan tidak disebut dokumentasi ─────
 *
 * `ColliderDesc.convexHull()` Rapier RUSAK DIAM-DIAM di atas sekitar 8.000
 * titik. Ia tidak mengembalikan null, tidak melempar, tidak memperingatkan —
 * ia mengembalikan collider yang bervolume NOL, dan benda dengan collider
 * bervolume nol tidak menabrak apa pun. Bendanya jatuh menembus dunia.
 *
 * Terukur pada titik-titik TEPAT di permukaan bola r=1 (analitik 4,18879):
 *
 *      2.048  ->  4,176754   -0,287 %   ok
 *      4.096  ->  4,182556   -0,149 %   ok
 *      8.192  ->  4,173562   -0,364 %   ok
 *     12.288  ->  4,048255   -3,355 %   memburuk
 *     16.384  ->  0,287704  -93,132 %   RUSAK
 *     20.480  ->  0,000000 -100,000 %   RUSAK
 *
 * Mesh sungguhan jauh melewati batas itu: Takora 36.403 verteks, flange
 * 24.976. Percobaan pertama saya memakai "semua verteks" sebagai ACUAN yang
 * dianggap benar — dan acuan itu berada di zona rusak, sehingga ia
 * melaporkan hull dari 96 titik lebih besar daripada hull dari 24.976 titik.
 * Hull dari subset tidak mungkin lebih besar; yang mustahil itu yang
 * membongkarnya.
 */
const TITIK_AMAN = 4096;

/**
 * Hull yang sah, atau lemparan.
 *
 * Dua pemeriksa, keduanya eksak dan murah:
 *   1. volume > 0        — menangkap kegagalan diam Rapier
 *   2. volume <= kotak batang titiknya — hull tidak mungkin melebihi kotak
 *      batas awan titiknya sendiri; kalau ia melebihi, yang dikembalikan
 *      bukan hull dari titik-titik itu
 */
function hullSah(d, titik, label = 'hull') {
  const n = titik.length / 3;
  if (n < 4) throw new Error(`${label}: butuh setidaknya 4 titik, dapat ${n}`);
  if (n > TITIK_AMAN) {
    throw new Error(`${label}: ${n} titik melewati batas aman ${TITIK_AMAN} — `
      + 'convexHull Rapier rusak diam-diam di atas ~8.000 titik dan '
      + 'mengembalikan collider bervolume NOL. Reduksi dulu lewat titikPenopang().');
  }
  const cd = d.R.ColliderDesc.convexHull(titik);
  if (!cd) throw new Error(`${label}: convexHull mengembalikan null — titiknya mungkin sebidang`);
  const c = d.w.createCollider(cd, d.w.createRigidBody(d.R.RigidBodyDesc.fixed()));
  const V = c.volume();

  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], titik[i * 3 + k]);
      mx[k] = Math.max(mx[k], titik[i * 3 + k]);
    }
  }
  const vKotak = (mx[0] - mn[0]) * (mx[1] - mn[1]) * (mx[2] - mn[2]);

  if (!(V > 0)) {
    throw new Error(`${label}: hull bervolume ${V} dari ${n} titik — collider `
      + 'bervolume nol tidak menabrak apa pun, dan bendanya akan jatuh menembus dunia');
  }
  if (V > vKotak * 1.001 + 1e-9) {
    throw new Error(`${label}: hull bervolume ${V.toFixed(6)} melebihi kotak batas `
      + `titiknya ${vKotak.toFixed(6)} — yang dikembalikan bukan hull dari titik ini`);
  }
  return { collider: c, volume: V, volume_kotak: vKotak, titik: n };
}

/**
 * Titik penopang: verteks paling ekstrem pada sejumlah arah.
 *
 * Hull dari 36.000 verteks Takora akan menyimpan 36.000 angka di adegan
 * untuk bentuk yang mungkin cuma butuh 60. Reduksi ini menjamin tiap titik
 * yang dipilih BENAR-BENAR ada di hull (titik ekstrem pada suatu arah selalu
 * titik hull), jadi ia hampiran yang tidak pernah melebihi bentuk aslinya —
 * dan ongkosnya diukur, bukan diasumsikan.
 *
 * Arahnya disebar dengan spiral Fibonacci, bukan acak: acak meninggalkan
 * rumpun dan lubang, dan lubang pada bola arah berarti sisi benda yang
 * tidak diwakili satu titik pun.
 */
export function titikPenopang(titik, jumlahArah = 96) {
  const n = titik.length / 3;
  const emas = Math.PI * (3 - Math.sqrt(5));
  const dipilih = new Set();

  for (let a = 0; a < jumlahArah; a++) {
    const y = 1 - (a / (jumlahArah - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = emas * a;
    const [dx, dy, dz] = [Math.cos(th) * r, y, Math.sin(th) * r];

    let terbaik = -Infinity;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const d = titik[i * 3] * dx + titik[i * 3 + 1] * dy + titik[i * 3 + 2] * dz;
      if (d > terbaik) { terbaik = d; idx = i; }
    }
    dipilih.add(idx);
  }

  const keluar = new Float32Array(dipilih.size * 3);
  let k = 0;
  for (const i of dipilih) {
    keluar[k++] = titik[i * 3];
    keluar[k++] = titik[i * 3 + 1];
    keluar[k++] = titik[i * 3 + 2];
  }
  return keluar;
}

/**
 * Seberapa jauh permukaan asli menyembul keluar proksi — EKSAK.
 *
 * Diukur terhadap collider Rapier yang sesungguhnya, bukan terhadap model
 * hull terpisah. Kalau collidernya berbeda dari yang saya kira, angka ini
 * yang akan mengatakannya.
 */
export async function ukurProksi(titikAsli, titikProksi, { diagonal = null } = {}) {
  const d = await dunia({ gravitasi: [0, 0, 0] });
  const { collider: c, volume: vHull } = hullSah(d, titikProksi, 'proksi');
  d.w.step();

  const n = titikAsli.length / 3;
  let tembusMaks = 0;
  let jumlahLuar = 0;
  let jumlahTembus = 0;
  for (let i = 0; i < n; i++) {
    const p = { x: titikAsli[i * 3], y: titikAsli[i * 3 + 1], z: titikAsli[i * 3 + 2] };
    const pr = c.projectPoint(p, true);
    if (!pr || pr.isInside) continue;
    jumlahLuar++;
    const jarak = Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z);
    if (jarak > 1e-6) jumlahTembus++;
    if (jarak > tembusMaks) tembusMaks = jarak;
  }

  /* Diagonal jadi pembagi karena persen-diagonal bisa dibandingkan lintas
     objek; milimeter tidak. Itu ukuran yang sama dengan yang dipakai LOD. */
  let dg = diagonal;
  if (dg == null) {
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], titikAsli[i * 3 + k]);
        mx[k] = Math.max(mx[k], titikAsli[i * 3 + k]);
      }
    }
    dg = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  }

  return {
    titik_asli: n,
    titik_proksi: titikProksi.length / 3,
    volume_proksi: Number(vHull.toFixed(6)),
    diagonal: Number(dg.toFixed(6)),
    tembus_maks: Number(tembusMaks.toFixed(8)),
    tembus_persen_diagonal: Number(((tembusMaks / dg) * 100).toFixed(5)),
    titik_di_luar: jumlahLuar,
    titik_menembus: jumlahTembus,
    nisbah_menembus: Number(((jumlahTembus / n) * 100).toFixed(4)),
  };
}

/**
 * Proksi cembung dari sebuah GLB, berikut ongkos reduksinya.
 *
 * Dua hull dibangun, dan itu disengaja: yang PENUH (semua verteks) jadi
 * acuan, yang REDUKSI jadi yang dikirim. Selisih keduanya adalah harga yang
 * dibayar untuk menyimpan 96 titik alih-alih 36.000 — dan harga yang tidak
 * diukur adalah harga yang diasumsikan nol.
 */
export async function proksiCembung(jalurGLB, { arah = 96 } = {}) {
  const asli = titikGLB(jalurGLB);
  if (asli.length < 12) throw new Error(`GLB tidak punya cukup verteks: ${jalurGLB}`);

  const reduksi = titikPenopang(asli, arah);
  const uReduksi = await ukurProksi(asli, reduksi);

  /* ACUAN, bukan "semua verteks".
   *
   * Percobaan pertama memakai seluruh awan titik sebagai acuan yang dianggap
   * benar. Untuk Takora itu 36.403 titik — jauh di dalam zona rusak Rapier,
   * dan acuannya sendiri yang salah. Acuan sekarang dibangun dari sebanyak
   * mungkin arah penopang yang masih di bawah batas aman. */
  const nAcuan = Math.min(TITIK_AMAN, Math.max(arah * 8, 1024));
  const acuan = asli.length / 3 <= TITIK_AMAN ? asli : titikPenopang(asli, nAcuan);
  const uAcuan = await ukurProksi(asli, acuan);

  return {
    berkas: jalurGLB,
    titik: Array.from(reduksi),
    arah,
    reduksi: uReduksi,
    acuan: { ...uAcuan, titik_acuan: acuan.length / 3 },
    /* Ongkos reduksi: berapa banyak ketepatan yang ditukar dengan berapa
       banyak titik. Kalau angka ini besar, naikkan `arah`. */
    ongkos_reduksi_persen_diagonal: Number(
      (uReduksi.tembus_persen_diagonal - uAcuan.tembus_persen_diagonal).toFixed(5)),
    nisbah_volume: Number((uReduksi.volume_proksi / Math.max(uAcuan.volume_proksi, 1e-12)).toFixed(6)),
  };
}
