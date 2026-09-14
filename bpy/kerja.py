# Rupa3D — sisi Blender. Dijalankan headless oleh server.mjs:
#
#   blender.exe --background --factory-startup --python kerja.py -- <tugas.json>
#
# Satu berkas, satu pintu masuk, dispatch berdasarkan `op`. Hasilnya DITULIS
# sebagai JSON ke berkas, tidak dicetak ke stdout — Blender mencetak banyak hal
# ke stdout dan mengurai keluarannya adalah sumber kegagalan yang tidak pernah
# selesai.
#
# Adegan disimpan di satu `adegan.blend` supaya operasi bisa disusun: bangun,
# ukur, lihat, perbaiki, ukur lagi. Tanpa itu tiap panggilan mulai dari nol dan
# tidak ada yang namanya iterasi.
import bpy, bmesh, json, math, os, sys, traceback

import mathutils

# Blender menjalankan berkas ini lewat --python, jadi direktorinya TIDAK
# ada di sys.path; tanpa baris ini `import aset` gagal dengan pesan yang
# tidak menyebut sebabnya.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aset  # noqa: E402
import terrain  # noqa: E402
import tekstur  # noqa: E402
import sumber  # noqa: E402


def argumen():
    if "--" not in sys.argv:
        raise SystemExit("kerja.py: tidak ada '--' di argv")
    return sys.argv[sys.argv.index("--") + 1]


TUGAS = json.load(open(argumen(), encoding="utf-8"))
RUANG = TUGAS["ruang"]
BLEND = os.path.join(RUANG, "adegan.blend")
HASIL = TUGAS["hasil"]


# ── Mode BERANTAI ────────────────────────────────────────────────────────
#
# Tiap op memanggil `muat_adegan()` di awal dan `simpan()` di akhir. Untuk
# satu op itu benar. Untuk delapan op berturut-turut itu delapan kali muat
# dan delapan kali simpan berkas .blend yang SAMA, di dalam proses yang sama.
#
# Terukur: satu panggilan Blender makan 3–4,6 detik, padahal menyalakan
# prosesnya saja cuma 449 ms. Sisanya muat + simpan.
#
# Dalam mode berantai, `muat_adegan` jadi idempoten (muat sekali per proses)
# dan `simpan` cuma menandai kotor; penyimpanan sungguhannya terjadi sekali
# di akhir. `op_baru` tetap mengatur ulang adegannya — ia memang harus.
_MUAT = {"sudah": False}
_KOTOR = {"ya": False, "tunda": False}


def simpan():
    if _KOTOR["tunda"]:
        _KOTOR["ya"] = True
        return
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)


def simpan_paksa():
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    _KOTOR["ya"] = False


def muat_adegan(harus_ada=True):
    if _MUAT["sudah"]:
        # Sudah ada di memori proses ini; memuat ulang akan MEMBUANG hasil op
        # sebelumnya yang belum sempat disimpan.
        return True
    if os.path.exists(BLEND):
        bpy.ops.wm.open_mainfile(filepath=BLEND)
        _MUAT["sudah"] = True
        return True
    if harus_ada:
        raise RuntimeError("belum ada adegan — panggil rupa_baru dulu")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MUAT["sudah"] = True
    return False


def objek_mesh():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def segitiga(o):
    me = o.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


# ── op: baru ─────────────────────────────────────────────────────────────
def op_baru(t):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MUAT["sudah"] = True
    sc = bpy.context.scene
    sc.unit_settings.system = t.get("satuan", "METRIC")
    sc.render.engine = "CYCLES"
    os.makedirs(RUANG, exist_ok=True)
    simpan()
    return {"ok": True, "adegan": BLEND, "objek": 0}


# ── op: muat (impor berkas 3D atau SVG) ──────────────────────────────────
IMPOR = {
    ".glb": lambda p: bpy.ops.import_scene.gltf(filepath=p),
    ".gltf": lambda p: bpy.ops.import_scene.gltf(filepath=p),
    ".obj": lambda p: bpy.ops.wm.obj_import(filepath=p),
    ".fbx": lambda p: bpy.ops.import_scene.fbx(filepath=p),
    ".stl": lambda p: bpy.ops.wm.stl_import(filepath=p),
    ".ply": lambda p: bpy.ops.wm.ply_import(filepath=p),
    ".svg": lambda p: bpy.ops.import_curve.svg(filepath=p),
}


def op_muat(t):
    muat_adegan(harus_ada=False)
    jalur = t["berkas"]
    ext = os.path.splitext(jalur)[1].lower()
    if ext not in IMPOR:
        raise RuntimeError("format tidak didukung: %s (ada: %s)" % (ext, ", ".join(sorted(IMPOR))))
    sebelum = {o.name for o in bpy.data.objects}
    IMPOR[ext](jalur)
    baru = [o.name for o in bpy.data.objects if o.name not in sebelum]

    # SVG masuk sebagai kurva datar. Ditebalkan di sini kalau diminta — itulah
    # jalur 2D→3D yang paling presisi yang ada: vektor asli, bukan tebakan.
    #
    # DUA jenis path, dan memperlakukannya sama menghasilkan sampah:
    #
    #   spline TERTUTUP  = bidang ber-fill  -> EXTRUDE jadi lempeng padat
    #   spline TERBUKA   = garis ber-stroke -> BEVEL jadi tabung bulat
    #
    # Ikon bergaya garis (`fill="none"`) seluruhnya spline terbuka. Di-extrude
    # ia jadi PITA tegak setipis kertas yang melayang — diukur pada ikon uji:
    # 1.074 tepi tak-manifold, dan hasilnya tidak terbaca sebagai apa pun.
    # Di-bevel, garis yang sama jadi tabung — yang memang bentuk 3D dari
    # sebuah garis. Blender tidak punya "stroke to outline"; bevel inilah
    # padanannya, dan ia bekerja pada kurva aslinya jadi tetap presisi.
    tebal = float(t.get("ekstrusi") or 0)

    # Tebal NISBI: pecahan dari diagonal kotak batas hasil impor.
    #
    # Angka absolut tidak bisa ditebak pemanggil, dan menebaknya menghasilkan
    # sampah yang tampak masuk akal. Contoh nyata: SVG 64x64 masuk sebagai
    # objek selebar 0,0169 satuan Blender (1 px SVG = 1/96 inci). Tebal 0,004
    # yang terdengar kecil ternyata 24% dari seluruh ikon — hasilnya gumpalan,
    # bukan ikon. Dengan nisbah, pemanggil menyebut "2% dari ukurannya" dan
    # angkanya DIHITUNG dari yang benar-benar terimpor.
    nisbi = float(t.get("tebal_nisbi") or 0)
    if ext == ".svg" and nisbi > 0:
        xs, ys, zs = [], [], []
        for nama in baru:
            o = bpy.data.objects.get(nama)
            if not o:
                continue
            for sudut in o.bound_box:
                p3 = o.matrix_world @ mathutils.Vector(sudut)
                xs.append(p3.x); ys.append(p3.y); zs.append(p3.z)
        if xs:
            diag = math.sqrt((max(xs) - min(xs)) ** 2 + (max(ys) - min(ys)) ** 2
                             + (max(zs) - min(zs)) ** 2)
            tebal = diag * nisbi

    if ext == ".svg" and tebal > 0:
        ringkas = {"lempeng": 0, "tabung": 0}
        for nama in baru:
            o = bpy.data.objects.get(nama)
            if not o or o.type != "CURVE":
                continue
            tertutup = any(sp.use_cyclic_u for sp in o.data.splines)
            if tertutup:
                o.data.dimensions = "2D"
                o.data.extrude = tebal
                ringkas["lempeng"] += 1
            else:
                # 3D wajib: kurva 2D tidak bisa di-bevel jadi tabung.
                o.data.dimensions = "3D"
                o.data.bevel_depth = tebal
                o.data.bevel_resolution = int(t.get("sisi_tabung") or 3)
                o.data.use_fill_caps = True
                ringkas["tabung"] += 1
        log_bentuk = ringkas
    else:
        log_bentuk = None
    simpan()
    return {"ok": True, "objek_baru": baru, "total_objek": len(bpy.data.objects),
            "bentuk_svg": log_bentuk}


# ── op: skrip (primitif pemodelan) ───────────────────────────────────────
def op_skrip(t):
    muat_adegan(harus_ada=False)
    ruang_nama = {"bpy": bpy, "bmesh": bmesh, "math": math, "mathutils": mathutils,
                  "RUANG": RUANG, "keluaran": {}}
    exec(compile(t["kode"], "<rupa_skrip>", "exec"), ruang_nama)
    simpan()
    return {"ok": True, "keluaran": ruang_nama.get("keluaran") or {},
            "objek": [o.name for o in bpy.data.objects]}


# ── op: ukur ─────────────────────────────────────────────────────────────
#
# `muat=False` untuk pemanggil INTERNAL. Ini bukan optimasi: `open_mainfile`
# membatalkan SETIAP referensi Python ke datablock lama, jadi pemanggil yang
# sudah memegang `bpy.context.scene` akan meledak dengan
# "StructRNA of type Scene has been removed" begitu ukur memuat ulang.
# Dan pada `op_ekspor`, memuat ulang membuang skala yang baru saja diterapkan.
def op_ukur(t, muat=True):
    if muat:
        muat_adegan()
    dep = bpy.context.evaluated_depsgraph_get()
    baris, total_tri = [], 0
    kotak = [1e18, 1e18, 1e18, -1e18, -1e18, -1e18]
    for o in objek_mesh():
        ev = o.evaluated_get(dep)
        me = ev.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()

        tak_manifold = sum(1 for e in bm.edges if not e.is_manifold)
        lepas = sum(1 for v in bm.verts if not v.link_edges)
        ngon = sum(1 for f in bm.faces if len(f.verts) > 4)
        normal_terbalik = sum(1 for f in bm.faces if f.calc_area() > 0 and f.normal.length < 1e-9)
        luas = sum(f.calc_area() for f in bm.faces)
        bm.free()

        me.calc_loop_triangles()
        tri = len(me.loop_triangles)
        total_tri += tri

        for v in me.vertices:
            p = o.matrix_world @ v.co
            for i in range(3):
                kotak[i] = min(kotak[i], p[i])
                kotak[3 + i] = max(kotak[3 + i], p[i])

        s = o.matrix_world.to_scale()
        baris.append({
            "nama": o.name,
            "segitiga": tri,
            "simpul": len(me.vertices),
            "sisi_ngon": ngon,
            "tepi_tak_manifold": tak_manifold,
            "simpul_lepas": lepas,
            "normal_nol": normal_terbalik,
            "luas_permukaan": round(luas, 6),
            "ukuran": [round(x, 6) for x in o.dimensions],
            "letak": [round(x, 6) for x in o.location],
            "skala": [round(x, 6) for x in s],
            "skala_sudah_diterapkan": all(abs(x - 1.0) < 1e-4 for x in s),
            "induk": o.parent.name if o.parent else None,
            # Berapa objek berbagi data mesh ini. > 1 = INSTANS, dan itu fitur:
            # 32 gelembung = 1 mesh + 32 transform, bukan 32 mesh. Objek instans
            # SAH membawa skala di node-nya; menerapkannya justru memecah
            # instansing dan melipatgandakan memorinya.
            "pemakai_data": o.data.users,
            "bahan": [m.name for m in o.data.materials if m],
        })
        ev.to_mesh_clear()

    if not baris:
        kotak = [0, 0, 0, 0, 0, 0]
    ukuran = [round(kotak[3 + i] - kotak[i], 6) for i in range(3)]
    peringatan = []
    for b in baris:
        if b["tepi_tak_manifold"]:
            peringatan.append("%s: %d tepi tak-manifold — ekspor GLB tetap jalan, tapi boolean/tebal akan gagal" % (b["nama"], b["tepi_tak_manifold"]))
        if not b["skala_sudah_diterapkan"]:
            peringatan.append("%s: skala %s belum diterapkan — three.js manual menyebut skala pada node sebagai sumber masalah runtime" % (b["nama"], b["skala"]))
        if b["simpul_lepas"]:
            peringatan.append("%s: %d simpul lepas" % (b["nama"], b["simpul_lepas"]))
    return {"ok": True, "objek": baris, "total_segitiga": total_tri,
            "kotak_batas": {"min": [round(x, 6) for x in kotak[:3]],
                            "maks": [round(x, 6) for x in kotak[3:]],
                            "ukuran": ukuran},
            "peringatan": peringatan}


# ── op: lihat (render) ───────────────────────────────────────────────────
def kamera_orbit(sc, yaw, pitch, jarak, sasaran, fov_deg):
    kam = bpy.data.cameras.new("rupa_kam")
    kam.sensor_fit = "VERTICAL"
    kam.angle_y = math.radians(fov_deg)
    ob = bpy.data.objects.new("rupa_kam", kam)
    bpy.context.collection.objects.link(ob)
    sc.camera = ob
    s = mathutils.Vector(sasaran)
    arah = mathutils.Vector((
        math.cos(pitch) * math.sin(yaw),
        -math.cos(pitch) * math.cos(yaw),
        math.sin(pitch),
    ))
    ob.location = s + arah * jarak
    ob.rotation_euler = (s - ob.location).to_track_quat("-Z", "Y").to_euler()
    return ob


def lampu_tiga_titik(sc, pusat, jangkauan):
    d = max(jangkauan, 1e-3) * 3.0
    for nama, arah, kuat, ukur in (
        ("kunci", (-0.7, -0.6, 0.75), 1.0, 0.9),
        ("isi", (0.85, -0.35, 0.15), 0.22, 1.2),
        ("punggung", (0.25, 0.9, 0.5), 0.5, 1.0),
    ):
        data = bpy.data.lights.new(nama, "AREA")
        data.size = max(jangkauan, 1e-3) * ukur * 2.2
        data.energy = kuat * (d ** 2) * 55
        o = bpy.data.objects.new(nama, data)
        v = mathutils.Vector(arah).normalized() * d
        o.location = mathutils.Vector(pusat) + v
        o.rotation_euler = (mathutils.Vector(pusat) - o.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(o)
    dunia = bpy.data.worlds.new("rupa_dunia")
    sc.world = dunia
    dunia.use_nodes = True
    dunia.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.9, 0.95, 1)
    dunia.node_tree.nodes["Background"].inputs[1].default_value = 0.85


SUDUT = {
    "depan": (0.0, 0.0), "belakang": (math.pi, 0.0),
    "kanan": (math.pi / 2, 0.0), "kiri": (-math.pi / 2, 0.0),
    "atas": (0.0, math.radians(75)), "bawah": (0.0, math.radians(-60)),
    "hero": (math.radians(28), math.radians(16)),
    "serong": (math.radians(65), math.radians(22)),
}


def op_lihat(t):
    muat_adegan()
    ukuran = int(t.get("ukuran") or 640)
    fov = float(t.get("fov") or 38)
    mesin = (t.get("mesin") or "CYCLES").upper()
    contoh = int(t.get("contoh") or 48)

    # Bingkai DIHITUNG dari kotak batas, tidak pernah ditebak. Diukur TANPA
    # memuat ulang — lihat catatan di op_ukur.
    kotak = op_ukur({}, muat=False)["kotak_batas"]
    sc = bpy.context.scene
    pusat = [(kotak["min"][i] + kotak["maks"][i]) / 2 for i in range(3)]
    jangkauan = max(max(kotak["ukuran"]) / 2, 1e-3)
    jarak = (jangkauan / math.sin(math.radians(fov) / 2)) * float(t.get("longgar") or 1.15)

    lampu_tiga_titik(sc, pusat, jangkauan)
    sc.render.engine = "CYCLES" if mesin.startswith("CY") else "BLENDER_EEVEE"
    if sc.render.engine == "CYCLES":
        sc.cycles.samples = contoh
        sc.cycles.use_denoising = True
        sc.cycles.transmission_bounces = 8
    sc.render.resolution_x = sc.render.resolution_y = ukuran
    sc.render.film_transparent = bool(t.get("latar_tembus"))
    sc.render.image_settings.file_format = "PNG"

    keluar = os.path.join(RUANG, "render")
    os.makedirs(keluar, exist_ok=True)
    berkas = []
    for nama in t.get("sudut") or ["hero"]:
        if nama in SUDUT:
            yaw, pitch = SUDUT[nama]
        else:
            bagian = [float(x) for x in str(nama).split(",")]
            yaw, pitch = math.radians(bagian[0]), math.radians(bagian[1])
            nama = "yaw%g_pitch%g" % (bagian[0], bagian[1])
        kam = kamera_orbit(sc, yaw, pitch, jarak, pusat, fov)
        sc.render.filepath = os.path.join(keluar, "%s.png" % nama)
        bpy.ops.render.render(write_still=True)
        berkas.append(sc.render.filepath)
        bpy.data.objects.remove(kam, do_unlink=True)
    return {"ok": True, "berkas": berkas, "pusat": [round(x, 4) for x in pusat],
            "jarak_kamera": round(jarak, 4), "mesin": sc.render.engine}


def _fcurves(act):
    """F-curve sebuah action, di Blender 4.4+ maupun sebelumnya.

    Blender 4.4 memindahkan F-curve ke `action.layers[].strips[].channelbags[]`
    dan MENGHAPUS `action.fcurves`. Kode yang memakai jalur lama gagal dengan
    AttributeError yang tidak menyebut bahwa strukturnya berubah."""
    fc = getattr(act, "fcurves", None)
    if fc is not None:
        return list(fc)
    keluar = []
    for lap in getattr(act, "layers", []):
        for strip in getattr(lap, "strips", []):
            for cb in getattr(strip, "channelbags", []):
                keluar.extend(cb.fcurves)
    return keluar


def _skala_dianimasikan(o):
    ad = o.animation_data
    if not ad or not ad.action:
        return False
    return any(f.data_path == "scale" for f in _fcurves(ad.action))


# ── op: ekspor GLB ───────────────────────────────────────────────────────
def op_ekspor(t):
    muat_adegan()
    catatan = []
    if t.get("terapkan_transformasi", True):
        # three.js manual: skala pada node adalah sumber masalah runtime.
        # Diterapkan ke verteks di sini, bukan diserahkan ke pemakai GLB-nya.
        #
        # TETAPI objek INSTANS dikecualikan, dan itu keputusan yang disengaja.
        # Blender menolak `transform_apply` pada data multi-user — dan
        # penolakan itu BENAR: 32 gelembung berbagi satu datablock (1 mesh +
        # 32 transform, bukan 32 mesh). Memecah instansing demi "skala
        # diterapkan" melipatgandakan memori DAN draw call di runtime. Itu
        # perbaikan yang merusak aset.
        #
        # Versi pertama tidak membedakannya dan ekspor gagal seluruhnya
        # dengan "Cannot apply to a multi user" — 32 baris galat untuk satu
        # keputusan yang seharusnya diambil di sini.
        # Alasan KEDUA untuk mengecualikan objek dari transform_apply, dan ia
        # merusak lebih diam-diam daripada instansing.
        #
        # `transform_apply(scale=True)` memanggang skala ke verteks lalu
        # menyetel skala node jadi 1. Kalau skala objek itu DIANIMASIKAN,
        # F-curve-nya tetap menggerakkan skala — sekarang di atas geometri
        # yang sudah diperbesar. Kedipan mata Takora yang berupa `scale.z`
        # 1 -> 0,05 akan menciutkan bola mata yang SUDAH diskalakan, dan
        # hasilnya bukan kedipan melainkan mata yang lenyap.
        #
        # Blender tidak menolaknya seperti ia menolak data multi-user. Ia
        # menurut, dan animasinya rusak tanpa satu pun pesan.
        beranimasi = {o.name for o in objek_mesh() if _skala_dianimasikan(o)}
        tunggal = [o for o in objek_mesh()
                   if o.data.users <= 1 and o.name not in beranimasi]
        instans = [o for o in objek_mesh() if o.data.users > 1]
        if beranimasi:
            catatan.append(
                "%d objek SENGAJA dilewati karena skalanya dianimasikan — "
                "menerapkan skalanya akan merusak animasinya tanpa galat"
                % len(beranimasi))
        if tunggal:
            bpy.ops.object.select_all(action="DESELECT")
            for o in tunggal:
                o.select_set(True)
                bpy.context.view_layer.objects.active = o
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            catatan.append("skala diterapkan ke %d objek berdata tunggal" % len(tunggal))
        if instans:
            data = len({o.data.name for o in instans})
            catatan.append(
                "%d objek instans (%d datablock) SENGAJA dilewati — menerapkan "
                "skalanya akan memecah instansing dan melipatgandakan memori"
                % (len(instans), data))
        # Disimpan di LUAR kedua cabang. Saat blok instans ditambahkan,
        # baris ini sempat ikut tersarang ke dalam `if instans:` — akibatnya
        # adegan hanya tersimpan kalau kebetulan ADA objek instans, dan aset
        # tanpa instans diekspor dengan skala yang sebenarnya belum
        # diterapkan. Uji `rupa_ekspor menerapkan skala` yang menangkapnya.
        if tunggal or instans:
            simpan()

    tujuan = t["berkas"]
    os.makedirs(os.path.dirname(tujuan) or ".", exist_ok=True)
    animasi = t.get("animasi", True)
    opsi = dict(filepath=tujuan, export_format="GLB", use_selection=False,
                export_apply=True, export_yup=True,
                # Bawaannya memang True, tetapi ditulis EKSPLISIT karena
                # bawaan eksportir Blender berubah antar-versi dan kegagalan
                # ekspor animasi tidak berbunyi — GLB-nya tetap sah, cuma
                # diam. Terukur: takora-siap.glb terbit dengan 0 animasi
                # sesudah 96 bingkai dianimasikan, dan tidak ada yang tahu
                # sampai halamannya dibuka.
                export_animations=bool(animasi),
                export_frame_range=bool(animasi),
                export_force_sampling=True,
                export_optimize_animation_size=False)
    if t.get("draco"):
        opsi.update(export_draco_mesh_compression_enable=True,
                    export_draco_mesh_compression_level=int(t.get("draco_level") or 6))
    bpy.ops.export_scene.gltf(**opsi)

    # Hitung objek beranimasi di ADEGAN, sebagai pembanding terhadap apa yang
    # benar-benar masuk ke berkasnya. Angka yang tidak cocok berarti ekspor
    # animasinya gagal separuh — dan itu tidak pernah berbunyi sendiri.
    sc = bpy.context.scene
    beranimasi_adegan = [o.name for o in bpy.data.objects
                         if o.animation_data and o.animation_data.action]
    ukur = op_ukur({}, muat=False)
    return {"ok": True, "berkas": tujuan,
            "ukuran_bita": os.path.getsize(tujuan),
            "total_segitiga": ukur["total_segitiga"],
            "kotak_batas": ukur["kotak_batas"],
            "animasi_diminta": bool(animasi),
            "objek_beranimasi_di_adegan": len(beranimasi_adegan),
            "bingkai": [sc.frame_start, sc.frame_end],
            "fps": sc.render.fps,
            "peringatan": ukur["peringatan"], "catatan": catatan}


def _dengan_adegan(fn):
    """Op tahap A: muat adegan, kerjakan, simpan. `simpan` diserahkan supaya
    modul aset tidak perlu tahu di mana berkasnya."""
    def bungkus(t):
        muat_adegan()
        return fn(t, simpan)
    return bungkus


OPS = {"baru": op_baru, "muat": op_muat, "skrip": op_skrip,
       "ukur": op_ukur, "lihat": op_lihat, "ekspor": op_ekspor,
       "lod": _dengan_adegan(aset.op_lod),
       "tabrakan": _dengan_adegan(aset.op_tabrakan),
       "bake": _dengan_adegan(aset.op_bake),
       "terrain": _dengan_adegan(terrain.op_terrain),
       "tekstur": _dengan_adegan(tekstur.op_tekstur),
       "topologi_sumber": _dengan_adegan(sumber.op_topologi_sumber)}

def _jalankan_satu(tugas):
    fn = OPS.get(tugas.get("op"))
    if fn is None:
        raise RuntimeError("op tidak dikenal: %s" % tugas.get("op"))
    return fn(tugas)


def _galat(e):
    return {"ok": False, "error": "%s: %s" % (type(e).__name__, e),
            "jejak": traceback.format_exc()[-4000:]}


if "ops" in TUGAS:
    # Berantai: satu proses, satu muat, satu simpan.
    #
    # Rantai BERHENTI di kegagalan pertama, dan itu disengaja: op berikutnya
    # hampir selalu bergantung pada yang sebelumnya, dan menjalankannya di
    # atas adegan yang setengah jadi menghasilkan angka yang tampak wajar
    # untuk keadaan yang tidak pernah dimaksudkan.
    _KOTOR["tunda"] = True
    hasil = []
    for i, tugas in enumerate(TUGAS["ops"]):
        t = dict(tugas)
        t.setdefault("ruang", RUANG)
        try:
            r = _jalankan_satu(t)
        except Exception as e:  # noqa: BLE001
            r = _galat(e)
        r = dict(r) if isinstance(r, dict) else {"ok": True, "nilai": r}
        r["_op"] = t.get("op")
        r["_urut"] = i
        hasil.append(r)
        if r.get("ok") is False:
            hasil.append({"ok": False, "_op": None, "_urut": i + 1,
                          "error": "rantai dihentikan setelah op #%d (%s) gagal — "
                                   "%d op sisanya TIDAK dijalankan"
                                   % (i, t.get("op"), len(TUGAS["ops"]) - i - 1)})
            break
    _KOTOR["tunda"] = False
    if _KOTOR["ya"]:
        try:
            simpan_paksa()
        except Exception as e:  # noqa: BLE001
            hasil.append({"ok": False, "_op": "simpan", "error": "gagal menyimpan: %s" % e})
    keluaran = {"ok": all(h.get("ok") is not False for h in hasil),
                "berantai": True, "jumlah": len(hasil), "hasil": hasil}
else:
    try:
        keluaran = _jalankan_satu(TUGAS)
    except Exception as e:  # noqa: BLE001 — semua kegagalan dilaporkan sebagai data
        keluaran = _galat(e)

with open(HASIL, "w", encoding="utf-8") as f:
    json.dump(keluaran, f, ensure_ascii=False)
