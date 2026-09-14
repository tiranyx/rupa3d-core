/* Uji proksi tabrakan.
 *
 * Yang dijaga di sini terutama satu hal: **collider bervolume nol.**
 *
 * `ColliderDesc.convexHull()` Rapier rusak diam-diam di atas ~8.000 titik —
 * tidak null, tidak melempar, tidak memperingatkan; ia mengembalikan collider
 * bervolume NOL. Benda dengan collider bervolume nol tidak menabrak apa pun
 * dan jatuh menembus dunia. Mesh sungguhan jauh melewati batas itu: Takora
 * 36.403 verteks, flange 24.976.
 *
 * Percobaan pertama saya memakai "semua verteks" sebagai acuan yang dianggap
 * benar — dan acuan itu sendiri berada di zona rusak.
 */
import test from 'node:test';
import { asetUji, lewatiTanpa } from './aset-uji.mjs';
import assert from 'node:assert/strict';
import { dunia } from './fisika.mjs';
import { titikPenopang, ukurProksi, proksiCembung } from './tabrak.mjs';
import { titikGLB } from './glb.mjs';

const FLANGE = asetUji('flange').jalur;

/** Titik-titik TEPAT di permukaan bola r — hull-nya punya batas analitik. */
function bola(n, r = 1) {
  const t = new Float32Array(n * 3);
  const emas = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = emas * i;
    t[i * 3] = Math.cos(th) * rr * r;
    t[i * 3 + 1] = y * r;
    t[i * 3 + 2] = Math.sin(th) * rr * r;
  }
  return t;
}

/* ── Penjaga: kegagalan diam Rapier ─────────────────────────────────── */

test('hull di atas batas aman DITOLAK, bukan diterima bervolume nol', async () => {
  const banyak = bola(20000);
  await assert.rejects(() => ukurProksi(banyak, banyak), /batas aman/,
    'tanpa penjaga ini, collidernya bervolume 0 dan bendanya jatuh menembus dunia');
});

test('Rapier MEMANG rusak di atas batas itu — penjaganya bukan paranoia', async () => {
  /* Dibuktikan langsung pada kernelnya, bukan diasumsikan. Kalau Rapier
     memperbaikinya suatu hari, uji ini yang akan memberi tahu. */
  const d = await dunia();
  const vol = (t) => {
    const cd = d.R.ColliderDesc.convexHull(t);
    if (!cd) return null;
    return d.w.createCollider(cd, d.w.createRigidBody(d.R.RigidBodyDesc.fixed())).volume();
  };
  const analitik = (4 / 3) * Math.PI;
  const aman = vol(bola(4096));
  assert.ok(Math.abs(aman - analitik) / analitik < 0.01, `4096 titik: ${aman}`);

  const rusak = vol(bola(24576));
  assert.ok(rusak < analitik * 0.5,
    `24576 titik memberi ${rusak} — kalau ini sudah benar, batas amannya bisa dinaikkan`);
});

test('hull dari titik sebidang atau kurang dari 4 ditolak', async () => {
  const segitiga = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  await assert.rejects(() => ukurProksi(segitiga, segitiga), /4 titik|sebidang|null/);
});

/* ── Ketepatan ──────────────────────────────────────────────────────── */

test('hull bola mendekati 4/3 pi r³, dan makin rapat makin dekat', async () => {
  const analitik = (4 / 3) * Math.PI;
  const galat = [];
  for (const n of [128, 512, 2048]) {
    const t = bola(n);
    const u = await ukurProksi(t, t);
    galat.push(Math.abs(u.volume_proksi - analitik) / analitik);
  }
  assert.ok(galat[0] > galat[1] && galat[1] > galat[2],
    `harus konvergen: ${galat.map((g) => (g * 100).toFixed(3)).join(' > ')}`);
  assert.ok(galat[2] < 0.005, `2048 titik masih meleset ${(galat[2] * 100).toFixed(3)}%`);
});

test('titik penopang SELALU titik hull — tembusnya nol terhadap dirinya sendiri', async () => {
  const t = bola(3000);
  const p = titikPenopang(t, 64);
  const u = await ukurProksi(p, p);
  assert.equal(u.tembus_maks, 0,
    'titik ekstrem pada suatu arah selalu ada di hull; kalau ini bukan nol, '
    + 'reduksinya membuang titik yang seharusnya ada');
});

test('reduksi TIDAK PERNAH melebihi bentuk aslinya', async () => {
  const t = bola(3000);
  const penuh = await ukurProksi(t, t);
  const kecil = await ukurProksi(t, titikPenopang(t, 48));
  assert.ok(kecil.volume_proksi <= penuh.volume_proksi * 1.0001,
    `hull dari subset ${kecil.volume_proksi} > hull penuh ${penuh.volume_proksi} — mustahil, `
    + 'dan itu persis yang membongkar kerusakan Rapier');
});

test('makin banyak arah, makin kecil tembusnya', async () => {
  const t = bola(3000);
  const tembus = [];
  for (const a of [16, 48, 160]) {
    tembus.push((await ukurProksi(t, titikPenopang(t, a))).tembus_persen_diagonal);
  }
  assert.ok(tembus[0] > tembus[1] && tembus[1] > tembus[2],
    `harus mengecil: ${tembus.join(' > ')}`);
});

test('tembus diukur EKSAK — kubus satuan, titik di (3,3,3)', async () => {
  const kubus = new Float32Array([
    -1, -1, -1, 1, -1, -1, -1, 1, -1, 1, 1, -1,
    -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1,
  ]);
  const luar = new Float32Array([3, 3, 3]);
  const gabung = new Float32Array([...kubus, ...luar]);
  const u = await ukurProksi(gabung, kubus);
  assert.ok(Math.abs(u.tembus_maks - 2 * Math.sqrt(3)) < 1e-4,
    `jarak (3,3,3) ke kubus satuan harus 2√3 = ${(2 * Math.sqrt(3)).toFixed(4)}, dapat ${u.tembus_maks}`);
});

/* ── Aset sungguhan ─────────────────────────────────────────────────── */

test('proksi flange: acuannya BUKAN semua verteks', { skip: lewatiTanpa('flange') }, async () => {
  const p = await proksiCembung(FLANGE, { arah: 96 });
  assert.ok(p.acuan.titik_asli > 20000, 'flange memang punya banyak verteks');
  assert.ok(p.acuan.titik_acuan <= 4096,
    'acuannya harus di bawah batas aman — versi pertama memakai semua 24.976 dan salah');
  assert.ok(p.nisbah_volume <= 1.0001,
    `reduksi ${p.nisbah_volume}x acuan — di atas 1 berarti acuannya yang rusak`);
});

test('hull cembung flange mendekati silinder Ø140 × 12', { skip: lewatiTanpa('flange') }, async () => {
  /* Flange itu cakram berlubang; hull cembungnya adalah silinder luarnya.
     Acuan tertutup yang tidak butuh kernel apa pun. */
  const p = await proksiCembung(FLANGE, { arah: 512 });
  const analitik = Math.PI * 70 * 70 * 12;
  const galat = Math.abs(p.acuan.volume_proksi - analitik) / analitik;
  assert.ok(galat < 0.02, `hull ${p.acuan.volume_proksi} vs silinder ${analitik} — galat ${(galat * 100).toFixed(3)}%`);
});

test('titik GLB memperhitungkan transform node', { skip: lewatiTanpa('flange') }, () => {
  const t = titikGLB(FLANGE);
  assert.ok(t.length / 3 > 20000);
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < t.length; i += 3) { mn = Math.min(mn, t[i]); mx = Math.max(mx, t[i]); }
  assert.ok(Math.abs((mx - mn) - 140) < 0.01, `lebar ${mx - mn}, harusnya 140 mm`);
});
