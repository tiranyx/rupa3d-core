# Terrain — permukaan dari peta ketinggian, berikut galatnya.
#
# ── Jebakan pengukuran yang harus dihindari sejak baris pertama ──────────
#
# Cara paling wajar mengukur "apakah meshnya benar" adalah membandingkan
# tinggi mesh dengan tinggi acuan DI TIAP SIMPUL. Angkanya akan keluar
# 0,000000 — sempurna, meyakinkan, dan **tidak berarti apa-apa**: simpulnya
# memang DILETAKKAN di ketinggian itu. Yang diukur cuma bahwa penugasan
# variabel bekerja.
#
# Pertanyaan sebenarnya ada DI ANTARA simpul: seberapa jauh segitiga datar
# melenceng dari permukaan lengkung yang diwakilinya. Karena itu contoh uji
# di sini diambil pada titik ACAK, bukan pada simpul — dan keduanya
# dilaporkan berdampingan supaya bedanya terlihat:
#
#     galat_di_simpul     ~0        <- sahih, dan tidak berguna
#     galat_antar_simpul  yang nyata
#
# ── Jebakan kedua: rata-rata menyembunyikan puncak ───────────────────────
#
# Menurunkan resolusi terrain SELALU menurunkan puncak dan menaikkan lembah,
# karena hasilnya semacam perataan. Galat rata-rata bisa mendekati nol
# sementara puncak tertinggi terpangkas 30% — dan siluet bukit itu yang
# dilihat pemain, bukan rata-ratanya. Jadi puncak dan lembah dilaporkan
# TERPISAH, bukan dilebur ke satu angka.
#
# ── Jebakan ketiga: Nyquist tidak bisa ditawar ───────────────────────────
#
# Petak sebesar S hanya bisa mewakili gelombang sepanjang >= 2S. Di bawah
# itu, detailnya tidak "agak hilang" — ia hilang, dan menaikkan jumlah
# segitiga dengan cara lain tidak mengembalikannya. Nisbahnya dihitung dan
# dikatakan, bukan dibiarkan jadi kejutan.
import math
import os

import bmesh
import bpy
from mathutils.bvhtree import BVHTree


# ── Sumber ketinggian ────────────────────────────────────────────────────
#
# Sumber prosedural ada BUKAN untuk menghasilkan terrain yang indah,
# melainkan supaya ada acuan yang bisa dievaluasi di titik MANA PUN dengan
# ketepatan mesin. Peta gambar hanya punya nilai di piksel; di antara piksel
# ia sendiri sudah hampiran, jadi ia tidak bisa dipakai membuktikan galat
# meshnya sendiri.

def _acak2(ix, iy, benih):
    """Hash bilangan bulat -> [0,1). Deterministik lintas mesin: semua
    operasinya bilangan bulat, tidak ada float yang bisa berbeda pembulatan."""
    n = (ix * 374761393 + iy * 668265263 + benih * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = n ^ (n >> 16)
    return (n & 0x7FFFFFFF) / float(0x7FFFFFFF)


def _halus(t):
    """Smoothstep — turunan pertamanya nol di kedua ujung, jadi petaknya
    tidak meninggalkan garis tegas di batas sel."""
    return t * t * (3.0 - 2.0 * t)


def _derau2(x, y, benih):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    a = _acak2(ix, iy, benih)
    b = _acak2(ix + 1, iy, benih)
    c = _acak2(ix, iy + 1, benih)
    d = _acak2(ix + 1, iy + 1, benih)
    u, v = _halus(fx), _halus(fy)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


class SumberProsedural:
    """h(u,v) -> [0,1], dengan u,v di [0,1]. Bisa dievaluasi di mana saja."""

    def __init__(self, benih=1, oktaf=4, frekuensi=4.0, persistensi=0.5):
        self.benih = int(benih)
        self.oktaf = max(1, int(oktaf))
        self.frekuensi = float(frekuensi)
        self.persistensi = float(persistensi)

    def __call__(self, u, v):
        n, amp, f, norm = 0.0, 1.0, self.frekuensi, 0.0
        for i in range(self.oktaf):
            n += amp * _derau2(u * f, v * f, self.benih + i * 101)
            norm += amp
            amp *= self.persistensi
            f *= 2.0
        return n / norm

    @property
    def gelombang_terpendek(self):
        """Panjang gelombang terpendek, dalam PECAHAN lebar wilayah.

        Oktaf terakhir berfrekuensi frekuensi * 2^(oktaf-1) siklus per lebar,
        jadi satu gelombangnya selebar 1/itu. Angka inilah yang menentukan
        berapa petak minimum yang masuk akal — bukan selera."""
        return 1.0 / (self.frekuensi * (2.0 ** (self.oktaf - 1)))


class SumberPeta:
    """h(u,v) dari gambar. Bilinear di antara piksel — sama seperti yang
    dilakukan mesh-nya, jadi galat yang terukur nanti adalah galat MESH,
    bukan galat penafsiran petanya."""

    def __init__(self, berkas, saluran="luminansi"):
        if not os.path.exists(berkas):
            raise RuntimeError("peta ketinggian tidak ada: %s" % berkas)
        img = bpy.data.images.load(berkas, check_existing=False)
        self.lebar, self.tinggi = img.size
        if self.lebar < 2 or self.tinggi < 2:
            raise RuntimeError("peta terlalu kecil: %dx%d" % (self.lebar, self.tinggi))
        px = list(img.pixels)          # RGBA datar, float 0..1, baris bawah dulu
        n = self.lebar * self.tinggi
        self.nilai = [0.0] * n
        for i in range(n):
            r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
            self.nilai[i] = r if saluran == "merah" else (0.2126 * r + 0.7152 * g + 0.0722 * b)
        bpy.data.images.remove(img)
        self.berkas = berkas

    def _piksel(self, ix, iy):
        ix = min(max(ix, 0), self.lebar - 1)
        iy = min(max(iy, 0), self.tinggi - 1)
        return self.nilai[iy * self.lebar + ix]

    def __call__(self, u, v):
        x = min(max(u, 0.0), 1.0) * (self.lebar - 1)
        y = min(max(v, 0.0), 1.0) * (self.tinggi - 1)
        ix, iy = int(math.floor(x)), int(math.floor(y))
        fx, fy = x - ix, y - iy
        a = self._piksel(ix, iy)
        b = self._piksel(ix + 1, iy)
        c = self._piksel(ix, iy + 1)
        d = self._piksel(ix + 1, iy + 1)
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

    @property
    def gelombang_terpendek(self):
        """Dua piksel — batas Nyquist petanya sendiri. Mesh yang lebih rapat
        daripada ini tidak menambah informasi apa pun, ia cuma menambah
        segitiga."""
        return 2.0 / max(self.lebar, self.tinggi)


# ── Bangun ───────────────────────────────────────────────────────────────
def _bangun_grid(nama, sumber, petak, ukuran, tinggi):
    """Grid petak×petak, tiap simpul diangkat ke h(u,v)."""
    lx, ly = float(ukuran[0]), float(ukuran[1])
    n = int(petak) + 1
    bm = bmesh.new()
    baris = []
    for j in range(n):
        v = j / (n - 1.0)
        satu = []
        for i in range(n):
            u = i / (n - 1.0)
            satu.append(bm.verts.new((
                (u - 0.5) * lx, (v - 0.5) * ly, sumber(u, v) * tinggi)))
        baris.append(satu)
    bm.verts.ensure_lookup_table()
    for j in range(n - 1):
        for i in range(n - 1):
            bm.faces.new((baris[j][i], baris[j][i + 1],
                          baris[j + 1][i + 1], baris[j + 1][i]))
    me = bpy.data.meshes.new(nama)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(nama, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ── Ukur ─────────────────────────────────────────────────────────────────
def _tinggi_mesh(bvh, x, y, atas):
    """Tinggi permukaan mesh di (x, y), lewat sinar dari atas ke bawah."""
    lokasi, _, _, _ = bvh.ray_cast((x, y, atas), (0.0, 0.0, -1.0))
    return None if lokasi is None else lokasi.z


def _contoh_acak(jumlah, benih):
    """Titik uji deterministik di [0,1)^2 — deret Van der Corput basis 2 & 3
    (Halton). Dipilih bukan karena rapi: acak murni meninggalkan rumpun dan
    lubang, sehingga galat maks bisa terlewat hanya karena kebetulan tidak
    ada contoh yang jatuh di puncak yang paling salah."""
    def vdc(i, basis):
        f, hasil = 1.0, 0.0
        while i > 0:
            f /= basis
            hasil += f * (i % basis)
            i //= basis
        return hasil
    return [(vdc(i + benih, 2), vdc(i + benih, 3)) for i in range(1, jumlah + 1)]


def op_terrain(t, simpan):
    nama = t.get("nama", "Terrain")
    petak = int(t.get("petak", 128))
    if petak < 1 or petak > 2048:
        raise RuntimeError("petak harus 1..2048, dapat %d" % petak)
    ukuran = t.get("ukuran", [100.0, 100.0])
    tinggi = float(t.get("tinggi", 20.0))
    n_uji = int(t.get("contoh_uji", 4096))

    if t.get("sumber") == "peta":
        sumber = SumberPeta(t["berkas"], t.get("saluran", "luminansi"))
        info_sumber = {"jenis": "peta", "berkas": sumber.berkas,
                       "piksel": [sumber.lebar, sumber.tinggi]}
    else:
        sumber = SumberProsedural(
            benih=t.get("benih", 1), oktaf=t.get("oktaf", 4),
            frekuensi=t.get("frekuensi", 4.0),
            persistensi=t.get("persistensi", 0.5))
        info_sumber = {"jenis": "prosedural", "benih": sumber.benih,
                       "oktaf": sumber.oktaf, "frekuensi": sumber.frekuensi,
                       "persistensi": sumber.persistensi}

    lama = bpy.data.objects.get(nama)
    if lama is not None:
        bpy.data.objects.remove(lama, do_unlink=True)
    obj = _bangun_grid(nama, sumber, petak, ukuran, tinggi)

    dep = bpy.context.evaluated_depsgraph_get()
    dep.update()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bvh = BVHTree.FromBMesh(bm)
    atas = tinggi * 4.0 + 10.0
    lx, ly = float(ukuran[0]), float(ukuran[1])

    # ── Galat ANTAR simpul: pertanyaan yang sebenarnya ──
    galat = []
    terlewat = 0
    for (u, v) in _contoh_acak(n_uji, 7):
        x, y = (u - 0.5) * lx, (v - 0.5) * ly
        zm = _tinggi_mesh(bvh, x, y, atas)
        if zm is None:
            terlewat += 1
            continue
        galat.append(abs(zm - sumber(u, v) * tinggi))

    # ── Galat DI simpul: sahih, dan sengaja ditunjukkan tidak berguna ──
    nn = petak + 1
    langkah = max(1, nn // 32)
    galat_simpul = []
    for j in range(0, nn, langkah):
        for i in range(0, nn, langkah):
            u, v = i / (nn - 1.0), j / (nn - 1.0)
            zm = _tinggi_mesh(bvh, (u - 0.5) * lx, (v - 0.5) * ly, atas)
            if zm is not None:
                galat_simpul.append(abs(zm - sumber(u, v) * tinggi))

    # ── Puncak & lembah: diperiksa TERPISAH ──
    #
    # Kerapatan acuan HARUS jauh melebihi kerapatan mesh, kalau tidak
    # angkanya jadi omong kosong. Versi pertama memakai 512x512 tetap: pada
    # mesh 512 petak, sebuah simpul mesh bisa jatuh lebih dekat ke puncak
    # sebenarnya daripada titik acuan mana pun, dan "puncak hilang" keluar
    # NEGATIF (-0,11%) — mesh yang lebih tinggi daripada acuannya sendiri.
    # Itu bukan temuan tentang mesh; itu alat ukur yang kalah rapat.
    halus = max(1024, (petak + 1) * 4)
    z_asli = [sumber(i / (halus - 1.0), j / (halus - 1.0)) * tinggi
              for j in range(halus) for i in range(halus)]
    puncak_asli, lembah_asli = max(z_asli), min(z_asli)
    z_mesh = [v.co.z for v in bm.verts]
    puncak_mesh, lembah_mesh = max(z_mesh), min(z_mesh)
    jangkauan = max(puncak_asli - lembah_asli, 1e-9)

    tri = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    n_verts = len(bm.verts)
    luas = sum(f.calc_area() for f in bm.faces)
    bm.free()

    # ── Nyquist: dikatakan, bukan dibiarkan jadi kejutan ──
    petak_pecahan = 1.0 / petak
    gelombang = sumber.gelombang_terpendek
    nisbah = gelombang / (2.0 * petak_pecahan)

    def r(x, d=6):
        return round(float(x), d)

    hasil = {
        "ok": True, "nama": nama, "sumber": info_sumber,
        "petak": petak, "simpul": n_verts, "segitiga": tri,
        "ukuran_dunia": [lx, ly], "tinggi_skala": tinggi,
        "luas_permukaan": r(luas),
        "luas_datar": r(lx * ly),
        "nisbah_luas": r(luas / (lx * ly)),
        "tinggi_min": r(lembah_mesh), "tinggi_maks": r(puncak_mesh),
        "jangkauan": r(jangkauan),

        "galat_antar_simpul": {
            "contoh": len(galat), "terlewat": terlewat,
            "maks": r(max(galat) if galat else 0.0),
            "rata": r(sum(galat) / len(galat) if galat else 0.0),
            "rms": r(math.sqrt(sum(g * g for g in galat) / len(galat)) if galat else 0.0),
            "maks_persen_jangkauan": r(100.0 * max(galat) / jangkauan if galat else 0.0, 4),
            "rata_persen_jangkauan": r(100.0 * (sum(galat) / len(galat)) / jangkauan if galat else 0.0, 4),
        },
        # Sengaja dilaporkan: angkanya ~0 dan itu TIDAK membuktikan apa pun.
        # Simpulnya memang diletakkan di ketinggian itu.
        "galat_di_simpul": {
            "contoh": len(galat_simpul),
            "maks": r(max(galat_simpul) if galat_simpul else 0.0),
            "catatan": "~0 menurut konstruksi — bukan bukti kualitas",
        },
        "acuan_petak": halus,
        "puncak": {
            "asli": r(puncak_asli), "mesh": r(puncak_mesh),
            "hilang": r(puncak_asli - puncak_mesh),
            "hilang_persen": r(100.0 * (puncak_asli - puncak_mesh) / jangkauan, 4),
        },
        "lembah": {
            "asli": r(lembah_asli), "mesh": r(lembah_mesh),
            "terisi": r(lembah_mesh - lembah_asli),
            "terisi_persen": r(100.0 * (lembah_mesh - lembah_asli) / jangkauan, 4),
        },
        "nyquist": {
            "gelombang_terpendek_pecahan": r(gelombang),
            "gelombang_terpendek_dunia": r(gelombang * max(lx, ly)),
            "petak_dunia": r(max(lx, ly) / petak),
            "nisbah": r(nisbah, 4),
            "cukup": bool(nisbah >= 1.0),
            "petak_minimum": int(math.ceil(2.0 / gelombang)),
            "catatan": ("petak cukup rapat untuk gelombang terpendek sumbernya"
                        if nisbah >= 1.0 else
                        "PETAK TERLALU RENGGANG — detail di bawah 2 petak HILANG, "
                        "dan menambah segitiga dengan cara lain tidak mengembalikannya"),
        },
    }
    simpan()
    return hasil
