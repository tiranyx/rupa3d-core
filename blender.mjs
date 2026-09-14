/* Jembatan ke Blender headless. Satu tanggung jawab: menjalankan `bpy/kerja.py`
   dengan satu tugas JSON dan mengembalikan hasilnya sebagai objek.

   Tugas dan hasil lewat BERKAS, bukan stdout. Blender mencetak banyak hal ke
   stdout — versi, statistik, peringatan add-on — dan mengurainya adalah
   kegagalan yang tidak pernah selesai. */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const SKRIP = path.join(DI_SINI, 'bpy', 'kerja.py');

/** Kandidat lokasi Blender di Windows, diurutkan dari versi terbaru. */
function cariBlender() {
  if (process.env.RUPA3D_BLENDER) return process.env.RUPA3D_BLENDER;
  const akar = ['C:\\Program Files\\Blender Foundation', 'C:\\Program Files\\Blender'];
  const ada = [];
  for (const a of akar) {
    if (!existsSync(a)) continue;
    for (const d of readdirAman(a)) {
      const exe = path.join(a, d, 'blender.exe');
      if (existsSync(exe)) ada.push(exe);
    }
  }
  ada.sort().reverse();
  return ada[0] ?? 'blender';
}

function readdirAman(p) {
  try { return readdirSync(p); } catch { return []; }
}

export class Blender {
  /** @param {{ blender?: string, ruang: string, batasMs?: number }} opsi */
  constructor(opsi) {
    this.exe = opsi.blender || cariBlender();
    this.ruang = path.resolve(opsi.ruang);
    this.batasMs = opsi.batasMs ?? 15 * 60 * 1000;
    mkdirSync(this.ruang, { recursive: true });
  }

  get adegan() { return path.join(this.ruang, 'adegan.blend'); }

  /** Jalankan satu op. Selalu mengembalikan objek — kegagalan jadi data, bukan lemparan. */
  /**
   * Beberapa op dalam SATU proses Blender.
   *
   * Ini optimasi yang diukur, bukan ditebak. Profil menunjukkan satu
   * panggilan makan 3–4,6 detik sementara menyalakan prosesnya cuma 449 ms;
   * sisanya muat + simpan berkas .blend yang sama, berulang-ulang.
   *
   * Rantainya BERHENTI di kegagalan pertama. Op berikutnya hampir selalu
   * bergantung pada yang sebelumnya, dan menjalankannya di atas adegan
   * setengah jadi menghasilkan angka yang tampak wajar untuk keadaan yang
   * tidak pernah dimaksudkan — persis kelas kesalahan yang alat ini ada
   * untuk mencegahnya.
   *
   * @param {{op: string}[]} daftar
   */
  async jalankanBanyak(daftar) {
    if (!Array.isArray(daftar) || !daftar.length) {
      throw new Error('jalankanBanyak butuh setidaknya satu op');
    }
    const t0 = Date.now();
    const tmp = mkdtempSync(path.join(tmpdir(), 'rupa3d-'));
    const berkasTugas = path.join(tmp, 'tugas.json');
    const berkasHasil = path.join(tmp, 'hasil.json');
    mkdirSync(this.ruang, { recursive: true });
    writeFileSync(berkasTugas, JSON.stringify({
      ops: daftar, ruang: this.ruang, hasil: berkasHasil,
    }), 'utf8');

    let keluar;
    try {
      keluar = await this.#spawn([
        '--background', '--factory-startup', '--python', SKRIP, '--', berkasTugas,
      ]);
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
    let hasil;
    try {
      hasil = JSON.parse(readFileSync(berkasHasil, 'utf8'));
    } catch {
      rmSync(tmp, { recursive: true, force: true });
      return {
        ok: false,
        error: 'Blender tidak menulis hasil — kemungkinan proses berhenti sebelum selesai',
        keluaran: String(keluar).slice(-2000),
      };
    }
    rmSync(tmp, { recursive: true, force: true });
    return { ...hasil, detik: Math.round((Date.now() - t0) / 100) / 10 };
  }

  async jalankan(op, tugas = {}) {
    const kotak = mkdtempSync(path.join(tmpdir(), 'rupa3d-'));
    const berkasTugas = path.join(kotak, 'tugas.json');
    const berkasHasil = path.join(kotak, 'hasil.json');
    writeFileSync(berkasTugas, JSON.stringify({ ...tugas, op, ruang: this.ruang, hasil: berkasHasil }), 'utf8');

    const arg = ['--background', '--factory-startup', '--python-exit-code', '1',
      '--python', SKRIP, '--', berkasTugas];
    const mulai = Date.now();
    let keluar;
    try {
      keluar = await this.#spawn(arg);
    } finally {
      // hasil dibaca SEBELUM kotak dihapus
    }
    let hasil;
    if (existsSync(berkasHasil)) {
      try { hasil = JSON.parse(readFileSync(berkasHasil, 'utf8')); }
      catch (e) { hasil = { ok: false, error: `hasil JSON rusak: ${e.message}` }; }
    } else {
      hasil = { ok: false, error: 'Blender tidak menulis hasil', keluaran_blender: ringkas(keluar.teks) };
    }
    rmSync(kotak, { recursive: true, force: true });
    if (hasil.ok === false && !hasil.keluaran_blender) hasil.keluaran_blender = ringkas(keluar.teks);
    hasil.detik = Math.round((Date.now() - mulai) / 100) / 10;
    return hasil;
  }

  #spawn(arg) {
    return new Promise((selesai) => {
      const p = spawn(this.exe, arg, { windowsHide: true });
      let teks = '';
      const ambil = (b) => { teks += b; if (teks.length > 200000) teks = teks.slice(-200000); };
      p.stdout.on('data', ambil);
      p.stderr.on('data', ambil);
      const jam = setTimeout(() => { p.kill('SIGKILL'); }, this.batasMs);
      p.on('error', (e) => { clearTimeout(jam); selesai({ kode: -1, teks: `${teks}\n${e.message}` }); });
      p.on('close', (kode) => { clearTimeout(jam); selesai({ kode, teks }); });
    });
  }

  async versi() {
    const keluar = await this.#spawn(['--version']);
    const baris = String(keluar.teks).split(/\r?\n/).find((b) => b.startsWith('Blender'));
    return baris?.trim() ?? null;
  }
}

/** Ambil bagian keluaran Blender yang informatif: baris galat, bukan 500 baris statistik. */
function ringkas(teks) {
  const baris = String(teks || '').split(/\r?\n/);
  const menarik = baris.filter((b) => /error|Error|Traceback|RuntimeError|\.py"/.test(b));
  return (menarik.length ? menarik : baris).slice(-25).join('\n');
}
