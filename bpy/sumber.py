# Rupa3D — TOPOLOGI SUMBER. Yang tidak bisa dibaca dari GLB, dibaca di sini.
#
# ── Kenapa berkas ini harus ada, dan kenapa ia terpisah ──────────────────
#
# glTF SELALU tersegitiga. Quad, n-gon, edge loop, dan valensi verteks pada
# mesh quad sumbernya sudah hilang sebelum berkasnya ditulis. `topologi.mjs`
# menyebut keempatnya "tidak bisa diukur dari GLB" di tiap keluarannya, dan
# itu benar — alat mana pun yang mengklaim menilai quad-dominance DARI SEBUAH
# GLB sedang mengarang.
#
# Jadi keempatnya harus diukur di SUMBERNYA, dan sumbernya cuma ada di dalam
# Blender. Itu yang dikerjakan berkas ini.
#
# ── Kenapa ini yang paling menentukan ───────────────────────────────────
#
# Laporan produksi 2026 menyebut retopology sebagai hambatan utama aset
# generatif — dua sampai empat jam kerja manual per aset. Sebabnya bukan
# jumlah segitiga; sebabnya mesh yang dihasilkan tidak punya STRUKTUR: tidak
# ada edge loop yang mengikuti lipatan, valensinya kacau, dan quad-nya tidak
# ada. Mesh seperti itu tidak bisa dideformasi, di-subdivide, atau di-UV
# tanpa dibangun ulang.
#
# Yang diukur di sini persis itu, dan tiap satu punya acuan tertutup yang
# bisa dihitung tanpa alat apa pun (lihat test-sumber.mjs).
import math

import bpy
import bmesh


def _valensi(bm):
    """Valensi verteks DALAM, dan berapa yang di batas.

    Verteks BATAS sengaja dikeluarkan dari analisis kutub. Pada tepi terbuka,
    valensi != 4 itu WAJAR dan bukan cacat — sebuah bidang datar 4x4 punya
    seluruh tepinya bervalensi 2 atau 3, dan menyebutnya "kutub" akan membuat
    tiap mesh terbuka terlihat rusak. Yang berarti cuma kutub di bagian DALAM.
    """
    dalam, batas = {}, 0
    for v in bm.verts:
        if any(len(e.link_faces) < 2 for e in v.link_edges):
            batas += 1
            continue
        dalam[v.index] = len(v.link_edges)
    return dalam, batas


def _tepi_lanjut(e, v):
    """Tepi penerus sebuah edge loop di verteks v, atau None kalau putus.

    Aturannya: di verteks bervalensi 4 yang dikelilingi quad, tepi `e` punya
    dua muka. Dari tiga tepi lain di v, DUA berbagi muka dengan `e` dan SATU
    tidak — yang satu itu penerusnya.

    Kalau valensinya bukan 4, atau penerusnya tidak tunggal, loop-nya BERHENTI
    di situ. Titik berhenti itulah yang berarti: loop yang putus di tengah
    daerah deformasi adalah persis cacat yang membuat siku dan lutut melipat
    salah.
    """
    if len(v.link_edges) != 4:
        return None
    muka_e = set(f.index for f in e.link_faces)
    calon = [x for x in v.link_edges
             if x is not e and not (set(f.index for f in x.link_faces) & muka_e)]
    return calon[0] if len(calon) == 1 else None


def _gelang(bm):
    """Telusuri seluruh edge loop. Tiap tepi masuk tepat satu gelang."""
    dikunjungi = set()
    gelang = []
    for awal in bm.edges:
        if awal.index in dikunjungi:
            continue
        rantai = 1
        dikunjungi.add(awal.index)
        tertutup = False
        # Dua arah dari tepi awal. Loop yang MENUTUP akan kembali ke tepi
        # awal dari arah pertama, dan arah kedua tidak perlu ditelusuri.
        for ujung in (awal.verts[0], awal.verts[1]):
            e, v = awal, ujung
            while True:
                lanjut = _tepi_lanjut(e, v)
                if lanjut is None:
                    break
                if lanjut.index == awal.index:
                    tertutup = True
                    break
                if lanjut.index in dikunjungi:
                    break
                dikunjungi.add(lanjut.index)
                rantai += 1
                v = lanjut.other_vert(v)
                e = lanjut
            if tertutup:
                break
        gelang.append({"panjang": rantai, "tertutup": tertutup})
    return gelang


def _tak_sebidang(bm, ambang_derajat):
    """Quad yang keempat verteksnya TIDAK sebidang.

    Cacat yang tidak pernah muncul sebagai galat: Blender, mesin game, dan
    eksportir glTF masing-masing memilih diagonal segitiganya sendiri, dan
    ketiganya boleh berbeda. Yang terlihat: bayangan yang berubah bentuk saat
    aset dipindah antar-alat, tanpa satu pun yang salah.

    Diukur sebagai SUDUT antara normal kedua segitiga pembelahnya — bukan
    sebagai jarak, supaya angkanya tidak bergantung pada skala modelnya.
    """
    n = 0
    terburuk = 0.0
    for f in bm.faces:
        if len(f.verts) != 4:
            continue
        a, b, c, d = [v.co for v in f.verts]
        n1 = (b - a).cross(c - a)
        n2 = (c - a).cross(d - a)
        if n1.length < 1e-12 or n2.length < 1e-12:
            continue
        kos = max(-1.0, min(1.0, n1.normalized().dot(n2.normalized())))
        sudut = math.degrees(math.acos(kos))
        terburuk = max(terburuk, sudut)
        if sudut > ambang_derajat:
            n += 1
    return n, round(terburuk, 4)


def _satu_objek(obj, ambang_sebidang):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    muka = {}
    for f in bm.faces:
        muka[len(f.verts)] = muka.get(len(f.verts), 0) + 1
    total = sum(muka.values())
    segitiga = muka.get(3, 0)
    quad = muka.get(4, 0)
    ngon = total - segitiga - quad

    dalam, batas = _valensi(bm)
    hist = {}
    for val in dalam.values():
        hist[val] = hist.get(val, 0) + 1
    kutub_n = sum(c for v, c in hist.items() if v == 3)
    kutub_e = sum(c for v, c in hist.items() if v >= 5)

    gelang = _gelang(bm)
    tertutup = sum(1 for g in gelang if g["tertutup"])
    tak_sebidang, sebidang_terburuk = _tak_sebidang(bm, ambang_sebidang)

    hasil = {
        "nama": obj.name,
        "muka": total,
        "segitiga": segitiga,
        "quad": quad,
        "ngon": ngon,
        # Nol muka melaporkan `null`, bukan 0 — nol akan meloloskan aturan
        # `quad_persen >= 90` pada objek yang tidak punya muka sama sekali.
        # (Dan `null` sekarang benar-benar MENGGAGALKAN aturannya; sampai
        # 10 Sep 2026 ia diam-diam lolos. Lihat docs/SERTIFIKAT.md.)
        "quad_persen": round(quad * 100.0 / total, 4) if total else None,
        "verteks": len(bm.verts),
        "tepi": len(bm.edges),
        "verteks_batas": batas,
        "verteks_dalam": len(dalam),
        "valensi": {str(k): hist[k] for k in sorted(hist)},
        "kutub_n": kutub_n,
        "kutub_e": kutub_e,
        "kutub_persen": (round((kutub_n + kutub_e) * 100.0 / len(dalam), 4)
                         if dalam else None),
        "gelang": len(gelang),
        "gelang_tertutup": tertutup,
        "gelang_terputus": len(gelang) - tertutup,
        "gelang_terpanjang": max((g["panjang"] for g in gelang), default=0),
        "quad_tak_sebidang": tak_sebidang,
        "sebidang_terburuk_derajat": sebidang_terburuk,
    }
    bm.free()
    return hasil


def op_topologi_sumber(t, simpan):
    """Ukur topologi SUMBER: quad, n-gon, valensi, kutub, dan edge loop.

    Ini yang TIDAK bisa dibaca dari GLB, dan tidak bisa dihampiri dari GLB.
    """
    ambang = float(t.get("ambang_sebidang") or 1.0)
    nama = t.get("objek")
    objek = [o for o in bpy.data.objects if o.type == "MESH"]
    if nama:
        objek = [o for o in objek if o.name == nama]
        if not objek:
            raise RuntimeError("objek mesh tidak ketemu: %s" % nama)
    if not objek:
        raise RuntimeError("tidak ada objek mesh di adegan")

    per_objek = [_satu_objek(o, ambang) for o in objek]
    muka = sum(p["muka"] for p in per_objek)
    segitiga = sum(p["segitiga"] for p in per_objek)

    # ── Batas yang HARUS disebut, karena kalau tidak angkanya menyesatkan ──
    #
    # `quad_persen 0` pada mesh yang seluruhnya segitiga berarti DUA hal yang
    # berbeda, dan alat ini tidak bisa membedakannya:
    #   (a) mesh itu memang bertopologi segitiga — cacat sungguhan, dan
    #   (b) mesh itu DIIMPOR dari format tersegitiga (glTF, STL), yang
    #       quad-nya sudah musnah sebelum berkasnya dibaca.
    #
    # Terukur: `batu-batu.glb` diimpor ulang ke Blender keluar sebagai 2.976
    # segitiga dan NOL quad. Memutar-balikkan GLB lewat Blender TIDAK
    # memulihkan topologi sumbernya, dan tidak akan pernah.
    #
    # Pembaca yang tidak diberi tahu ini akan menyimpulkan asetnya rusak.
    peringatan = []
    if muka and segitiga == muka:
        peringatan.append(
            "SELURUHNYA SEGITIGA. Itu bisa berarti mesh ini memang "
            "bertopologi segitiga, ATAU ia diimpor dari format tersegitiga "
            "(glTF/STL) yang quad-nya musnah sebelum berkasnya dibaca. Alat "
            "ini TIDAK BISA membedakan keduanya — yang tahu asal-usulnya "
            "cuma yang memuatnya. Memutar-balikkan GLB lewat Blender tidak "
            "memulihkan topologi sumbernya.")
    quad = sum(p["quad"] for p in per_objek)
    dalam = sum(p["verteks_dalam"] for p in per_objek)
    kutub = sum(p["kutub_n"] + p["kutub_e"] for p in per_objek)

    return {
        "ok": True,
        "objek": len(per_objek),
        "per_objek": per_objek,
        "muka": muka,
        "segitiga": segitiga,
        "quad": quad,
        "ngon": sum(p["ngon"] for p in per_objek),
        "quad_persen": round(quad * 100.0 / muka, 4) if muka else None,
        "verteks_dalam": dalam,
        "kutub": kutub,
        "kutub_persen": round(kutub * 100.0 / dalam, 4) if dalam else None,
        "gelang": sum(p["gelang"] for p in per_objek),
        "gelang_terputus": sum(p["gelang_terputus"] for p in per_objek),
        "gelang_terpanjang": max((p["gelang_terpanjang"] for p in per_objek),
                                 default=0),
        "quad_tak_sebidang": sum(p["quad_tak_sebidang"] for p in per_objek),
        "ambang_sebidang_derajat": ambang,
        "peringatan": peringatan,
        "catatan": (
            "Diukur dari mesh SUMBER di dalam Blender, bukan dari GLB. "
            "glTF selalu tersegitiga, jadi keempat ukuran ini MUSNAH saat "
            "diekspor — ia tidak bisa dihitung ulang dari berkas kirimnya. "
            "Verteks BATAS dikeluarkan dari analisis kutub: valensi != 4 di "
            "tepi terbuka itu wajar, bukan cacat."),
    }
