# Tahap A — aset siap-game: LOD, tabrakan, baking.
#
# Ketiganya dipisahkan dari `kerja.py` karena ketiganya punya satu sifat yang
# sama dan berbeda dari operasi lain: hasilnya TIDAK BOLEH dipercaya tanpa
# angka kesalahan. Mengecilkan mesh selalu "berhasil"; yang menentukan layak
# atau tidak adalah BERAPA BANYAK yang hilang, dan itu harus diukur, bukan
# dilihat.
#
# Ukuran kesalahan yang dipakai di sini: jarak geometris sesungguhnya dari tiap
# simpul hasil ke permukaan aslinya, lewat BVH. Bukan nisbah volume — dua
# bentuk yang sangat berbeda bisa punya volume sama.
import math
import os

import bmesh
import bpy
import mathutils
from mathutils.bvhtree import BVHTree


# ── Alat ukur bersama ────────────────────────────────────────────────────
def _mesh_dunia(obj, dep):
    """Mesh yang sudah dievaluasi (modifier ikut), di koordinat DUNIA."""
    ev = obj.evaluated_get(dep)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    ev.to_mesh_clear()
    return bm


def _statistik(bm):
    bm.faces.ensure_lookup_table()
    luas = sum(f.calc_area() for f in bm.faces)
    try:
        volume = abs(bm.calc_volume(signed=True))
    except Exception:  # noqa: BLE001 — mesh terbuka tidak punya volume
        volume = 0.0
    tri = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    return {"segitiga": tri, "simpul": len(bm.verts),
            "luas": round(luas, 6), "volume": round(volume, 6)}


def _galat_ke_acuan(bm_uji, bvh_acuan, diagonal):
    """Jarak tiap simpul `bm_uji` ke permukaan acuan.

    Dikembalikan mutlak DAN sebagai persen diagonal kotak batas — persen itu
    yang bisa dibandingkan antar model, karena "0,4 mm" tidak berarti apa-apa
    sebelum diketahui bendanya sebesar apa.
    """
    jarak = []
    for v in bm_uji.verts:
        titik, _, _, d = bvh_acuan.find_nearest(v.co)
        if titik is not None:
            jarak.append(d)
    if not jarak:
        return {"maks": None, "rata": None}
    maks = max(jarak)
    rata = sum(jarak) / len(jarak)
    return {
        "maks": round(maks, 6),
        "rata": round(rata, 6),
        "maks_persen_diagonal": round(maks / diagonal * 100, 4) if diagonal else None,
        "rata_persen_diagonal": round(rata / diagonal * 100, 4) if diagonal else None,
    }


def _diagonal(bm):
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    if not xs:
        return 0.0
    return math.sqrt((max(xs) - min(xs)) ** 2 + (max(ys) - min(ys)) ** 2
                     + (max(zs) - min(zs)) ** 2)


def _pilih_saja(objek, aktif=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objek:
        o.select_set(True)
    bpy.context.view_layer.objects.active = aktif or (objek[0] if objek else None)


# ── op: lod ──────────────────────────────────────────────────────────────
def op_lod(t, simpan):
    """Rantai LOD dengan galat geometris tiap tingkat.

    `nisbah` = pecahan segitiga yang DIPERTAHANKAN, bukan yang dibuang —
    urutan yang sama dengan Decimate modifier Blender, supaya angkanya bisa
    dicocokkan dengan yang dilihat orang di layar.
    """
    nama = t.get("objek")
    nisbah = t.get("nisbah") or [0.5, 0.25, 0.1]
    dep = bpy.context.evaluated_depsgraph_get()

    sumber = [o for o in bpy.data.objects
              if o.type == "MESH" and (nama is None or o.name == nama)]
    if not sumber:
        raise RuntimeError("tidak ada mesh untuk di-LOD" + (" bernama " + nama if nama else ""))

    laporan = []
    for asal in sumber:
        bm0 = _mesh_dunia(asal, dep)
        st0 = _statistik(bm0)
        diag = _diagonal(bm0)
        bvh = BVHTree.FromBMesh(bm0)
        tingkat = [{"nama": asal.name, "tingkat": 0, "nisbah": 1.0, **st0,
                    "galat": {"maks": 0.0, "rata": 0.0,
                              "maks_persen_diagonal": 0.0, "rata_persen_diagonal": 0.0}}]

        for i, r in enumerate(nisbah, start=1):
            salinan = asal.copy()
            salinan.data = asal.data.copy()
            salinan.name = "%s_LOD%d" % (asal.name, i)
            bpy.context.collection.objects.link(salinan)

            m = salinan.modifiers.new("rupa_lod", "DECIMATE")
            m.decimate_type = "COLLAPSE"
            m.ratio = float(r)
            _pilih_saja([salinan], salinan)
            bpy.ops.object.modifier_apply(modifier=m.name)

            dep = bpy.context.evaluated_depsgraph_get()
            bmk = _mesh_dunia(salinan, dep)
            st = _statistik(bmk)
            galat = _galat_ke_acuan(bmk, bvh, diag)
            bmk.free()
            tingkat.append({"nama": salinan.name, "tingkat": i, "nisbah": float(r),
                            **st, "galat": galat,
                            "segitiga_nisbi": round(st["segitiga"] / max(1, st0["segitiga"]), 4)})
        bm0.free()
        laporan.append({"asal": asal.name, "diagonal": round(diag, 6), "tingkat": tingkat})

    simpan()
    catatan = []
    for L in laporan:
        for tk in L["tingkat"][1:]:
            p = tk["galat"].get("maks_persen_diagonal")
            if p is not None and p > 2.0:
                catatan.append(
                    "%s: galat maks %.2f%% diagonal — di atas 2%% siluetnya mulai terbaca berubah"
                    % (tk["nama"], p))
    return {"ok": True, "lod": laporan, "peringatan": catatan}


# ── op: tabrakan ─────────────────────────────────────────────────────────
BENTUK = ("kotak", "bola", "kapsul", "cembung", "mesh_sederhana")


def op_tabrakan(t, simpan):
    """Proksi tabrakan + berapa banyak ia salah menutupi bentuk aslinya.

    Untuk mesin fisika web (Rapier), CEMBUNG adalah kuda bebannya: ia cepat,
    stabil, dan mendukung tumbukan dinamis. `mesh_sederhana` (trimesh) hanya
    untuk benda STATIS — trimesh dinamis tidak didukung sebagian besar mesin.
    """
    nama = t.get("objek")
    bentuk = (t.get("bentuk") or "cembung").lower()
    if bentuk not in BENTUK:
        raise RuntimeError("bentuk tidak dikenal: %s (ada: %s)" % (bentuk, ", ".join(BENTUK)))

    dep = bpy.context.evaluated_depsgraph_get()
    sumber = [o for o in bpy.data.objects
              if o.type == "MESH" and not o.name.startswith("TABRAK_")
              and (nama is None or o.name == nama)]
    if not sumber:
        raise RuntimeError("tidak ada mesh untuk dibuatkan tabrakan")

    hasil = []
    for asal in sumber:
        bm0 = _mesh_dunia(asal, dep)
        st0 = _statistik(bm0)
        diag = _diagonal(bm0)
        xs = [v.co.x for v in bm0.verts]
        ys = [v.co.y for v in bm0.verts]
        zs = [v.co.z for v in bm0.verts]
        pusat = mathutils.Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2,
                                  (max(zs) + min(zs)) / 2))
        ukuran = mathutils.Vector((max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))

        bm = bmesh.new()
        if bentuk == "kotak":
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=ukuran, verts=bm.verts)
        elif bentuk == "bola":
            r = max(ukuran) / 2
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r)
        elif bentuk == "kapsul":
            # Sumbu terpanjang jadi sumbu kapsul; jari-jari dari dua sumbu lain.
            sumbu = max(range(3), key=lambda i: ukuran[i])
            lain = [ukuran[i] for i in range(3) if i != sumbu]
            r = max(lain) / 2
            tinggi = max(1e-6, ukuran[sumbu] - 2 * r)
            bmesh.ops.create_cone(bm, cap_ends=True, segments=16,
                                  radius1=r, radius2=r, depth=tinggi)
            for tanda in (1, -1):
                tutup = bmesh.new()
                bmesh.ops.create_uvsphere(tutup, u_segments=16, v_segments=8, radius=r)
                bmesh.ops.translate(tutup, vec=(0, 0, tanda * tinggi / 2), verts=tutup.verts)
                me_t = bpy.data.meshes.new("tmp")
                tutup.to_mesh(me_t)
                tutup.free()
                bm.from_mesh(me_t)
                bpy.data.meshes.remove(me_t)
            if sumbu != 2:
                sudut = math.pi / 2
                poros = (0, 1, 0) if sumbu == 0 else (1, 0, 0)
                bmesh.ops.rotate(bm, verts=bm.verts,
                                 matrix=mathutils.Matrix.Rotation(sudut, 3, poros))
        elif bentuk == "cembung":
            for v in bm0.verts:
                bm.verts.new(v.co - pusat)
            bm.verts.ensure_lookup_table()
            bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        else:  # mesh_sederhana
            for v in bm0.verts:
                bm.verts.new(v.co - pusat)
            bm.verts.ensure_lookup_table()
            me_s = bpy.data.meshes.new("tmp2")
            bm0.to_mesh(me_s)
            bm.free()
            bm = bmesh.new()
            bm.from_mesh(me_s)
            bpy.data.meshes.remove(me_s)
            bmesh.ops.translate(bm, vec=-pusat, verts=bm.verts)

        me = bpy.data.meshes.new("TABRAK_%s_%s" % (asal.name, bentuk))
        bm.to_mesh(me)
        obj = bpy.data.objects.new(me.name, me)
        obj.location = pusat
        obj.display_type = "WIRE"
        bpy.context.collection.objects.link(obj)

        # Hull mentah bisa ratusan sampai ribuan segitiga; mesin fisika ingin
        # puluhan. Disederhanakan di sini, dan galatnya tetap diukur sesudahnya
        # jadi ongkosnya terlihat.
        nisbah = t.get("nisbah")
        if nisbah is None:
            nisbah = 0.25 if bentuk == "mesh_sederhana" else (0.15 if bentuk == "cembung" else None)
        if nisbah is not None and bentuk in ("mesh_sederhana", "cembung"):
            m = obj.modifiers.new("rupa_tabrak", "DECIMATE")
            m.ratio = float(nisbah)
            _pilih_saja([obj], obj)
            bpy.ops.object.modifier_apply(modifier=m.name)
            if bentuk == "cembung":
                # Menyederhanakan hull bisa membuatnya sedikit cekung; dicembungkan
                # ulang supaya tetap sah sebagai bentuk tumbukan dinamis.
                bmh = bmesh.new()
                bmh.from_mesh(obj.data)
                bmesh.ops.convex_hull(bmh, input=bmh.verts, use_existing_faces=False)
                bmesh.ops.delete(bmh, geom=[v for v in bmh.verts if not v.link_faces],
                                 context="VERTS")
                bmh.to_mesh(obj.data)
                bmh.free()

        dep = bpy.context.evaluated_depsgraph_get()
        bmp = _mesh_dunia(obj, dep)
        stp = _statistik(bmp)

        # Dua arah kesalahan, dan keduanya penting:
        #   tembus  = permukaan asli yang berada DI LUAR proksi -> benda
        #             menembus dinding, cacat yang dirasakan pemain
        #   longgar = proksi yang jauh di luar permukaan asli -> tabrakan
        #             terasa di udara kosong
        bvh_proksi = BVHTree.FromBMesh(bmp)
        bvh_asli = BVHTree.FromBMesh(bm0)
        tembus = _galat_ke_acuan(bm0, bvh_proksi, diag)
        longgar = _galat_ke_acuan(bmp, bvh_asli, diag)
        vol_nisbi = round(stp["volume"] / st0["volume"], 4) if st0["volume"] else None
        bmp.free()
        bm0.free()
        bm.free()

        hasil.append({
            "asal": asal.name, "proksi": obj.name, "bentuk": bentuk,
            "segitiga_asal": st0["segitiga"], "segitiga_proksi": stp["segitiga"],
            "volume_nisbi": vol_nisbi,
            "penyimpangan_permukaan_asli_dari_proksi": tembus,
            "penyimpangan_proksi_dari_permukaan_asli": longgar,
            "cocok_untuk_dinamis": bentuk != "mesh_sederhana",
        })

    simpan()
    return {"ok": True, "tabrakan": hasil}


# ── op: bake ─────────────────────────────────────────────────────────────
JENIS_BAKE = {"normal": "NORMAL", "ao": "AO", "diffuse": "DIFFUSE",
              "combined": "COMBINED", "roughness": "ROUGHNESS", "emit": "EMIT"}


def op_bake(t, simpan):
    """Panggang detail dari mesh RAPAT ke mesh RENGGANG, lalu ukur cakupannya.

    Yang paling sering gagal diam-diam di sini bukan bake-nya, melainkan syarat
    sebelumnya — dan yang diperiksa di sini disebut apa adanya:
      1. mesh rendah harus punya UV. ADA-nya diperiksa, dan dibuatkan kalau
         belum ada. TUMPANG-TINDIHNYA TIDAK diperiksa di sini — lihat catatan
         di bawah.
      2. jarak cage harus cukup untuk menjangkau mesh tinggi, dan itu
         DIHITUNG dari selisih kedua permukaan, bukan ditebak;
      3. hasilnya harus dilihat cakupannya — piksel kosong berarti ada bagian
         UV yang tidak kena sinar sama sekali.

    KOREKSI 10 Sep 2026. Baris pertama dulu berbunyi "mesh rendah harus punya
    UV yang tidak tumpang tindih", dan kalimat sesudahnya mengklaim ketiganya
    diperiksa. Kodenya tidak pernah memeriksa tumpang-tindih; ia cuma memeriksa
    KEBERADAAN UV. Docstring yang menjanjikan lebih daripada yang dikerjakan
    kodenya adalah kelas kesalahan yang sama dengan komentar `null` di
    `spek.mjs`: niat yang ditulis, tidak diberlakukan, dan tidak ada yang tahu.

    Akibatnya sudah terukur pada aset sungguhan. UV Takora **100 % bertindih**,
    dengan 144 segitiga menumpuk di satu texel — dan bake AO-nya cuma mencakup
    28,63 % UV. Bake seperti itu SAH menurut Blender dan tidak mengeluarkan
    peringatan apa pun; yang salah bukan bake-nya, melainkan UV yang tidak
    pernah layak dipanggangi.

    Pengukurnya sekarang ADA, di `tumpangUV()` (`topologi.mjs`), tetapi di sisi
    Node — jadi ia menangkapnya SESUDAH ekspor, bukan sebelum bake. Memindahnya
    ke sini menuntut implementasi bmesh kedua, dan dua implementasi ukuran yang
    sama di dua bahasa harus diikat uji silang supaya tidak diam-diam berbeda.
    Itu pekerjaan tersendiri, dan disebut di BACKLOG, bukan dikerjakan
    setengah di sini.
    """
    rendah_nama = t["rendah"]
    tinggi_nama = t["tinggi"]
    jenis = (t.get("jenis") or "normal").lower()
    if jenis not in JENIS_BAKE:
        raise RuntimeError("jenis bake tidak dikenal: %s (ada: %s)"
                           % (jenis, ", ".join(sorted(JENIS_BAKE))))
    ukuran = int(t.get("ukuran") or 1024)
    keluar = t["berkas"]

    rendah = bpy.data.objects.get(rendah_nama)
    tinggi = bpy.data.objects.get(tinggi_nama)
    if rendah is None or tinggi is None:
        raise RuntimeError("objek tidak ketemu: %s / %s" % (rendah_nama, tinggi_nama))

    catatan = []

    # Arah terbalik TIDAK bisa dideteksi dari gambarnya. Diuji: menukar rendah
    # dan tinggi tetap menghasilkan peta bervariasi (0,238 lawan 0,237) — sebab
    # membalik arah tetap menghasilkan bake yang SAH, cuma bukan yang dimaksud.
    # Justru itu yang membuatnya berbahaya: tidak ada gejala di hasilnya.
    # Yang bisa diperiksa adalah kerapatannya, sebelum bake dijalankan.
    n_rendah = len(rendah.data.polygons)
    n_tinggi = len(tinggi.data.polygons)
    if n_rendah > n_tinggi:
        catatan.append(
            "ARAH KEMUNGKINAN TERBALIK: '%s' (rendah) punya %d poligon, lebih "
            "banyak daripada '%s' (tinggi) yang %d. Detail dipanggang DARI yang "
            "rapat KE yang renggang, bukan sebaliknya."
            % (rendah_nama, n_rendah, tinggi_nama, n_tinggi))

    # (1) UV — dibuat kalau belum ada, dan itu dicatat, bukan didiamkan.
    if not rendah.data.uv_layers:
        _pilih_saja([rendah], rendah)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        catatan.append("mesh rendah belum punya UV — dibuat dengan smart_project")

    # (2) Jarak cage DIHITUNG: seberapa jauh permukaan tinggi dari yang rendah.
    dep = bpy.context.evaluated_depsgraph_get()
    bm_r = _mesh_dunia(rendah, dep)
    bm_t = _mesh_dunia(tinggi, dep)
    diag = _diagonal(bm_t)
    bvh_t = BVHTree.FromBMesh(bm_t)
    jarak = _galat_ke_acuan(bm_r, bvh_t, diag)
    bm_r.free()
    bm_t.free()
    cage = t.get("cage")
    if cage is None:
        # 2,5x jarak terjauh: cukup untuk menjangkau, tidak begitu jauh sampai
        # sinarnya menangkap sisi seberang benda.
        cage = round((jarak["maks"] or diag * 0.02) * 2.5, 6)
        catatan.append("cage dihitung dari selisih permukaan: %.5f (maks %.5f)"
                       % (cage, jarak["maks"] or 0))

    # (3) Bahan + simpul gambar tujuan.
    bahan = rendah.data.materials[0] if rendah.data.materials else None
    if bahan is None:
        bahan = bpy.data.materials.new("rupa_bake")
        bahan.use_nodes = True
        rendah.data.materials.append(bahan)
    if not bahan.use_nodes:
        bahan.use_nodes = True
    # Alfa WAJIB: cakupan diukur dari kanal alfa, bukan dari kecerahan.
    # Versi pertama menghitung piksel gelap sebagai "belum tertulis" dan
    # melaporkan 100% pada peta normal — yang latarnya justru ungu terang
    # (0,5 0,5 1,0), dan yang bidang datarnya memang berwarna sama persis
    # dengan latar itu. Alat ukur yang berbohong lebih buruk daripada tidak
    # ada alat ukur.
    gambar = bpy.data.images.new("rupa_%s" % jenis, ukuran, ukuran,
                                 alpha=True, float_buffer=False,
                                 is_data=(jenis in ("normal", "roughness")))
    gambar.alpha_mode = "STRAIGHT"
    simpul = bahan.node_tree.nodes.new("ShaderNodeTexImage")
    simpul.image = gambar
    bahan.node_tree.nodes.active = simpul
    simpul.select = True

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = int(t.get("contoh") or 32)
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = float(cage)
    # AO tanpa batas jarak sinar = putih rata. Pada benda terisolasi, sinar
    # oklusi lolos ke ruang kosong dan tiap piksel jadi "tidak terhalang" —
    # terukur variasi 0,00000 pada uji pertama. AO yang berguna adalah oklusi
    # LOKAL: seberapa dalam sebuah lekuk, bukan apakah ada langit di atasnya.
    # 10% diagonal adalah jarak yang membuat lekukan terbaca tanpa membuat
    # seluruh benda saling menggelapkan.
    jarak_sinar = t.get("jarak_sinar")
    if jarak_sinar is None:
        jarak_sinar = round(diag * 0.10, 6) if jenis == "ao" else 0.0
        if jenis == "ao":
            catatan.append("jarak sinar AO dihitung 10%% diagonal: %.5f" % jarak_sinar)
    sc.render.bake.max_ray_distance = float(jarak_sinar)
    sc.render.bake.margin = int(t.get("margin") or 16)
    sc.render.bake.use_clear = True

    # ── Isolasi adegan untuk bake yang peka OKLUSI ───────────────────────
    #
    # Bake NORMAL hanya peduli pasangan rendah<->tinggi. Bake AO, COMBINED,
    # dan DIFFUSE peduli SELURUH ADEGAN — setiap objek lain ikut menghalangi
    # sinarnya.
    #
    # Ini sebab sesungguhnya dari peta AO yang hitam pekat, dan butuh empat
    # dugaan yang salah sebelum ketemu. Yang membongkarnya bukan menebak lagi,
    # melainkan eksperimen terkontrol: tiga hubungan geometris berbeda (rendah
    # di dalam / di luar / berimpit dengan tinggi) SEMUANYA menghasilkan AO
    # yang sehat — variasi 0,394 pada ketiganya. Jadi bukan bentuknya.
    # Yang berbeda: adegan uji ternyata berisi ELEVEN mesh — tiga salinan LOD
    # dan enam proksi tabrakan dari langkah sebelumnya, semuanya bertumpuk di
    # tempat yang sama. Ruang kerja Rupa3D memang PERSISTEN; itu fiturnya, dan
    # ini ongkosnya.
    #
    # Yang dikerjakan: semua objek SELAIN pasangan bake disembunyikan dari
    # sinar, lalu dikembalikan. Padanan dari "bake collection" yang dipakai
    # artis, tetapi otomatis.
    #
    # Catatan yang sengaja TIDAK dikerjakan: menyembunyikan mesh rendah itu
    # sendiri. Versi sebelumnya melakukannya dengan alasan "ia menghalangi
    # oklusinya sendiri" — eksperimen membantahnya: AO sehat tanpa itu, jadi
    # Blender sudah mengecualikan target bake secara internal.
    ATR_SINAR = ("visible_camera", "visible_diffuse", "visible_glossy",
                 "visible_transmission", "visible_volume_scatter", "visible_shadow")
    simpan_visibilitas = {}
    if jenis in ("ao", "combined", "diffuse"):
        pasangan = {rendah.name, tinggi.name}
        for o in bpy.data.objects:
            if o.name in pasangan or o.type != "MESH":
                continue
            simpan_visibilitas[o.name] = {a_: getattr(o, a_) for a_ in ATR_SINAR
                                          if hasattr(o, a_)}
            for a_ in simpan_visibilitas[o.name]:
                setattr(o, a_, False)
        if simpan_visibilitas:
            catatan.append("%d objek lain disembunyikan dari sinar selama bake %s "
                           "(AO peka seluruh adegan, bake normal tidak)"
                           % (len(simpan_visibilitas), jenis))

    try:
        # Urutan seleksi menentukan arah: yang DIPILIH jadi sumber, yang AKTIF
        # jadi tujuan. Terbalik tetap menghasilkan gambar yang tampak sah —
        # lihat pemeriksaan kerapatan di atas.
        _pilih_saja([tinggi, rendah], rendah)
        bpy.ops.object.bake(type=JENIS_BAKE[jenis])
    finally:
        for nama_o, atribut in simpan_visibilitas.items():
            o = bpy.data.objects.get(nama_o)
            if o:
                for a_, nilai in atribut.items():
                    setattr(o, a_, nilai)

    os.makedirs(os.path.dirname(keluar) or ".", exist_ok=True)
    gambar.filepath_raw = keluar
    gambar.file_format = "PNG"
    gambar.save()

    # Cakupan: berapa persen piksel yang benar-benar tertulis. UV yang bocor
    # atau cage yang kependek muncul di sini sebagai lubang.
    # ── Dua ukuran, masing-masing mengukur apa yang ia klaim ─────────────
    #
    # Riwayat dua kegagalan, ditulis supaya tidak diulang:
    #   (a) "piksel gelap = belum tertulis" -> melaporkan 100% pada peta
    #       normal, yang latarnya justru ungu TERANG (0,5 0,5 1,0).
    #   (b) "alfa = cakupan" -> juga 100%, karena `use_clear` mengisi seluruh
    #       gambar termasuk alfanya. Alfa tidak menandai apa pun.
    # Keduanya terdengar masuk akal dan keduanya berbohong. Yang benar tidak
    # bisa dibaca dari piksel sama sekali.
    #
    # 1. CAKUPAN UV — dihitung dari luas segitiga UV, bukan dari warna. Inilah
    #    "berapa banyak tekstur yang benar-benar dipakai". Di atas 100% berarti
    #    pulau UV saling tindih, dan bake akan menimpa dirinya sendiri.
    me_r = rendah.data
    me_r.calc_loop_triangles()
    uv = me_r.uv_layers.active.data
    luas_uv = 0.0
    for tri in me_r.loop_triangles:
        a_, b_, c_ = (mathutils.Vector(uv[l].uv) for l in tri.loops)
        luas_uv += abs((b_ - a_).cross(c_ - a_)) / 2
    cakupan = round(luas_uv * 100, 2)

    # 2. VARIASI — simpangan baku piksel. Bake yang gagal menghasilkan gambar
    #    RATA; ini yang menangkapnya, dan ia tidak peduli warna latarnya apa.
    piksel = list(gambar.pixels)
    n = ukuran * ukuran
    langkah = max(1, n // 20000)          # cuplik, bukan baca semuanya
    contoh = [piksel[i * 4 + k] for i in range(0, n, langkah) for k in (0, 1, 2)]
    rata = sum(contoh) / len(contoh)
    variasi = round((sum((x - rata) ** 2 for x in contoh) / len(contoh)) ** 0.5, 5)
    # Ambang rendah disengaja: pulau UV memang tidak pernah mengisi kotak
    # penuh, dan 30-60% adalah normal untuk unwrap otomatis. Yang jadi gejala
    # adalah cakupan yang MENDEKATI NOL — itu arah seleksi terbalik, UV hilang,
    # atau cage terlalu pendek.
    if variasi < 1e-3:
        catatan.append("gambar hasil RATA (variasi %.5f) — bake tidak menghasilkan "
                       "apa pun. Periksa UV, cage, dan apakah kedua mesh benar-benar "
                       "bertumpang." % variasi)
    if cakupan > 100:
        catatan.append("cakupan UV %.1f%% — di atas 100%% berarti pulau UV saling "
                       "tindih; bake akan menimpa dirinya sendiri" % cakupan)
    elif cakupan < 15:
        catatan.append("cakupan UV %.1f%% — sebagian besar tekstur terbuang; "
                       "pertimbangkan unwrap ulang atau atlas yang lebih rapat"
                       % cakupan)

    simpan()
    return {"ok": True, "berkas": keluar, "jenis": jenis, "ukuran": ukuran,
            "cage": cage, "selisih_permukaan": jarak,
            "cakupan_uv_persen": cakupan, "variasi_piksel": variasi,
            "catatan": catatan}
