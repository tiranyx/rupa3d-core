# Tekstur prosedural → peta yang dipanggang → GLB bertekstur.
#
# ── Kenapa dipanggang, bukan dipakai langsung ────────────────────────────
#
# Material prosedural Blender (noise, voronoi, musgrave) TIDAK BISA diekspor
# ke glTF. Eksportirnya cuma mengerti nilai tetap dan peta gambar. Sebuah
# material prosedural yang indah di Blender terbit ke web sebagai warna abu-
# abu rata, dan tidak ada satu pun peringatan.
#
# Jadi urutannya: bangun graf prosedural → UV → PANGGANG jadi gambar →
# ganti materialnya dengan yang berbasis gambar → ekspor.
#
# ── Yang menentukan hasilnya, dan tidak jelas dari kodenya ───────────────
#
# 1. Bake NORMAL menuntut mesh punya UV DAN gambar target yang terpilih di
#    node aktif. Tanpa node gambar yang AKTIF, Blender memanggang ke tempat
#    yang tidak ditentukan dan diam saja.
#
# 2. Bake DIFFUSE bawaannya menyertakan pencahayaan. Untuk albedo itu salah:
#    bayangan lampu ikut terpanggang ke dalam warna dasarnya. `use_pass_direct`
#    dan `use_pass_indirect` harus DIMATIKAN.
#
# 3. Ruang warna gambar harus disetel SEBELUM disimpan. Albedo sRGB; normal,
#    kekasaran, dan oklusi Non-Color. Salah ruang warna tidak menghasilkan
#    galat — ia menghasilkan bayangan yang salah, dan itu baru ketahuan saat
#    ada yang membandingkannya dengan acuan.
import os

import bpy


def _bersihkan_node(mat):
    mat.use_nodes = True
    for n in list(mat.node_tree.nodes):
        mat.node_tree.nodes.remove(n)
    return mat.node_tree


def material_prosedural(nama, gaya, benih=0, t_kuat_bump=2.0):
    """Graf prosedural yang punya VARIASI di ketiga saluran.

    Variasi itu syarat, bukan hiasan: peta yang rata tidak membawa informasi
    apa pun dan memakan VRAM penuh untuk sebuah angka. `tekstur.mjs`
    menandainya, jadi generator ini harus menghasilkan sesuatu yang lolos
    pemeriksanya sendiri."""
    mat = bpy.data.materials.new(nama)
    nt = _bersihkan_node(mat)
    n = nt.nodes
    L = nt.links

    keluar = n.new("ShaderNodeOutputMaterial")
    keluar.location = (600, 0)
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    L.new(bsdf.outputs["BSDF"], keluar.inputs["Surface"])

    koord = n.new("ShaderNodeTexCoord")
    koord.location = (-900, 0)
    mapping = n.new("ShaderNodeMapping")
    mapping.location = (-700, 0)
    mapping.inputs["Scale"].default_value = (4.0, 4.0, 4.0)
    L.new(koord.outputs["Object"], mapping.inputs["Vector"])

    if gaya == "batu":
        dasar = n.new("ShaderNodeTexVoronoi")
        dasar.location = (-500, 100)
        dasar.feature = "F1"
        dasar.inputs["Scale"].default_value = 6.0
        L.new(mapping.outputs["Vector"], dasar.inputs["Vector"])
        jalur = dasar.outputs["Distance"]
        warna_a, warna_b = (0.28, 0.26, 0.24, 1), (0.62, 0.60, 0.56, 1)
        kasar_a, kasar_b = 0.55, 0.95
    elif gaya == "logam":
        dasar = n.new("ShaderNodeTexNoise")
        dasar.location = (-500, 100)
        dasar.inputs["Scale"].default_value = 22.0
        dasar.inputs["Detail"].default_value = 6.0
        L.new(mapping.outputs["Vector"], dasar.inputs["Vector"])
        jalur = dasar.outputs["Fac"]
        warna_a, warna_b = (0.32, 0.33, 0.35, 1), (0.72, 0.73, 0.76, 1)
        kasar_a, kasar_b = 0.12, 0.45
    else:   # kayu
        dasar = n.new("ShaderNodeTexWave")
        dasar.location = (-500, 100)
        dasar.wave_type = "RINGS"
        dasar.inputs["Scale"].default_value = 3.0
        dasar.inputs["Distortion"].default_value = 6.0
        L.new(mapping.outputs["Vector"], dasar.inputs["Vector"])
        jalur = dasar.outputs["Fac"]
        warna_a, warna_b = (0.24, 0.13, 0.06, 1), (0.62, 0.40, 0.21, 1)
        kasar_a, kasar_b = 0.35, 0.72

    ramp = n.new("ShaderNodeValToRGB")
    ramp.location = (-260, 180)
    ramp.color_ramp.elements[0].color = warna_a
    ramp.color_ramp.elements[1].color = warna_b
    L.new(jalur, ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    kasar = n.new("ShaderNodeMapRange")
    kasar.location = (-260, -60)
    kasar.inputs["To Min"].default_value = kasar_a
    kasar.inputs["To Max"].default_value = kasar_b
    L.new(jalur, kasar.inputs["Value"])
    L.new(kasar.outputs["Result"], bsdf.inputs["Roughness"])

    if gaya == "logam":
        bsdf.inputs["Metallic"].default_value = 1.0

    # Bump memberi relief yang bisa dipanggang jadi normal map. Tanpa ini,
    # bake NORMAL menghasilkan peta rata (128,128,255) — sah, dan tidak
    # membawa informasi apa pun.
    bump = n.new("ShaderNodeBump")
    bump.location = (-40, -260)
    # Kekuatan 0,6 pada Voronoi Distance menghasilkan normal map yang
    # jangkauannya cuma 125-130 dari 0-255 — praktis rata, dan pengukur di
    # `tekstur.mjs` menandainya sebagai kemungkinan upscale. Peta yang tidak
    # membawa informasi tetap memakan VRAM penuh.
    bump.inputs["Strength"].default_value = float(t_kuat_bump)
    bump.inputs["Distance"].default_value = 0.08
    L.new(jalur, bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


_BAKE = {
    "albedo": ("DIFFUSE", "sRGB"),
    "kekasaran": ("ROUGHNESS", "Non-Color"),
    "normal": ("NORMAL", "Non-Color"),
    "oklusi": ("AO", "Non-Color"),
}


def op_tekstur(t, simpan):
    nama_objek = t.get("objek")
    objek = bpy.data.objects.get(nama_objek) if nama_objek else None
    if objek is None:
        mesh = [o for o in bpy.data.objects if o.type == "MESH"]
        if not mesh:
            raise RuntimeError("tidak ada objek mesh di adegan")
        objek = max(mesh, key=lambda o: sum(o.dimensions))
    if objek.type != "MESH":
        raise RuntimeError("%s bukan mesh" % objek.name)

    ukuran = int(t.get("ukuran", 512))
    gaya = t.get("gaya", "batu")
    jenis = t.get("jenis", ["albedo", "kekasaran", "normal"])
    keluar_dir = t["keluar"]
    os.makedirs(keluar_dir, exist_ok=True)
    catatan = []

    # ── UV: dibuat kalau belum ada, dan itu DISEBUT ──
    bpy.ops.object.select_all(action="DESELECT")
    objek.select_set(True)
    bpy.context.view_layer.objects.active = objek
    if not objek.data.uv_layers:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        catatan.append("UV belum ada — dibuat dengan smart_project")

    mat = material_prosedural("rupa_%s" % gaya, gaya,
                              t_kuat_bump=float(t.get("kuat_bump", 2.0)))
    objek.data.materials.clear()
    objek.data.materials.append(mat)

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = int(t.get("contoh", 32))
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.margin = int(t.get("margin", 8))

    nt = mat.node_tree
    hasil = []
    for j in jenis:
        if j not in _BAKE:
            raise RuntimeError("jenis tekstur tidak dikenal: %s. Yang ada: %s"
                               % (j, ", ".join(_BAKE)))
        bake_type, ruang = _BAKE[j]

        img = bpy.data.images.new("%s_%s" % (objek.name, j), ukuran, ukuran,
                                  alpha=False, float_buffer=False)
        img.colorspace_settings.name = ruang

        node_img = nt.nodes.new("ShaderNodeTexImage")
        node_img.image = img
        node_img.location = (-1200, -400)
        # Node gambar harus AKTIF; tanpa ini Blender memanggang ke tempat yang
        # tidak ditentukan dan tidak mengeluarkan satu pun peringatan.
        nt.nodes.active = node_img

        if bake_type == "DIFFUSE":
            # Bawaannya menyertakan pencahayaan; untuk albedo itu salah —
            # bayangan lampu ikut terpanggang ke warna dasarnya.
            sc.render.bake.use_pass_direct = False
            sc.render.bake.use_pass_indirect = False
            sc.render.bake.use_pass_color = True

        bpy.ops.object.bake(type=bake_type)

        jalur = os.path.join(keluar_dir, "%s_%s.png" % (objek.name, j))
        img.filepath_raw = jalur
        img.file_format = "PNG"
        img.save()

        px = list(img.pixels[:4096])
        variasi = (max(px) - min(px)) if px else 0.0
        hasil.append({
            "jenis": j, "berkas": jalur, "ukuran": ukuran,
            "ruang_warna": ruang, "bake_type": bake_type,
            "variasi_cuplik": round(variasi, 6),
        })
        nt.nodes.remove(node_img)

    # ── Ganti graf prosedural dengan graf BERBASIS GAMBAR ──
    # Ini langkah yang paling mudah terlupa: tanpa penggantian ini GLB-nya
    # terbit dengan warna abu-abu rata, karena eksportir glTF tidak mengerti
    # satu pun node prosedural di atas.
    nt2 = _bersihkan_node(mat)
    keluar = nt2.nodes.new("ShaderNodeOutputMaterial")
    keluar.location = (600, 0)
    bsdf = nt2.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    nt2.links.new(bsdf.outputs["BSDF"], keluar.inputs["Surface"])
    if gaya == "logam":
        bsdf.inputs["Metallic"].default_value = 1.0

    y = 300
    for h in hasil:
        img = bpy.data.images.load(h["berkas"], check_existing=True)
        img.colorspace_settings.name = h["ruang_warna"]
        node = nt2.nodes.new("ShaderNodeTexImage")
        node.image = img
        node.location = (-500, y)
        y -= 300
        if h["jenis"] == "albedo":
            nt2.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        elif h["jenis"] == "kekasaran":
            nt2.links.new(node.outputs["Color"], bsdf.inputs["Roughness"])
        elif h["jenis"] == "normal":
            nm = nt2.nodes.new("ShaderNodeNormalMap")
            nm.location = (-220, y + 300)
            nt2.links.new(node.outputs["Color"], nm.inputs["Color"])
            nt2.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    simpan()
    return {
        "ok": True, "objek": objek.name, "gaya": gaya, "ukuran": ukuran,
        "uv_layer": objek.data.uv_layers.active.name if objek.data.uv_layers else None,
        "peta": hasil, "catatan": catatan,
    }
