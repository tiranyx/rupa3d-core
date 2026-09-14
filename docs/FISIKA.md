# Fisika — Rapier, dan tiga kali pemeriksanya yang salah duluan

10 September 2026. D3.

Mesin fisika gagal dengan cara yang **tidak satu pun terlihat di tangkapan
layar**:

| **tembus** | benda cepat melewati dinding karena antara dua langkah ia sudah di sisi lain |
|---|---|
| **getar** | benda diam bergetar karena penyelesai tabrakannya saling mendorong |
| **hanyut** | benda diam pelan-pelan bergeser tanpa gaya apa pun |
| **massa** | collider tidak cocok dengan benda yang terlihat, jadi bendanya berperilaku seperti benda lain |

Tiga di antaranya punya **acuan tertutup**, jadi bisa dibuktikan tanpa
menjalankan apa pun:

```
jatuh bebas   h = ½gt²   →  t = √(2h/g)
restitusi     e = |v'| / |v|   di titik tumbukan
massa         m = ρ · V
```

---

## Toleransinya berasal dari TIMESTEP, bukan dari selera

Jatuh 10 → 5 m pada 60 Hz memberi 1,0167 s terhadap analitik 1,0096 s —
meleset **0,696 %**. Angka itu terdengar seperti galat integrator. Ia bukan:
selisihnya **0,0071 s, kurang dari satu langkah** (0,0167 s). Simulasi
diskret tidak bisa melaporkan kejadian di antara dua langkah.

Dan itu bisa dibuktikan, bukan cuma diklaim — galatnya **berskala dengan
timestep**:

| | selisih | galat |
|---|---|---|
| 30 Hz | 0,0237 s | 2,347 % |
| 60 Hz | 0,0070 s | 0,696 % |
| 240 Hz | 0,0029 s | 0,284 % |

Kalau ia tetap atau membesar saat timestep dipersempit, yang terjadi hanyut
integrator — masalah yang sama sekali berbeda. Satu uji menjaga justru
**arah** itu, bukan angkanya.

> Ambang yang ditulis dalam persen akan salah begitu timestep-nya diubah.
> Dan timestep memang diubah orang.

---

## Temuan 1 — Rapier MEREDAM laju di 400 m/s, tanpa memberi tahu

```
diminta      50 m/s  →  linvel  50,0  ·  pindah 0,833 m/langkah
diminta     400 m/s  →  linvel 400,0  ·  pindah 6,667 m/langkah
diminta   5.000 m/s  →  linvel 400,0  ·  DIREDAM
diminta 200.000 m/s  →  linvel 400,0  ·  DIREDAM
```

Peluru yang disetel 900 m/s berjalan pada 400 m/s. **Tidak ada satu pun
tanda.** Yang terlihat cuma "senjatanya terasa lambat".

Ini juga membatalkan sapuan tembus saya yang pertama, yang melaporkan
"tidak ada tembus sampai 200.000 m/s" — setiap kasus di atas 400 sebenarnya
berjalan pada 400. **Pemeriksa yang lulus karena kondisinya tidak pernah
tercapai bukan pemeriksa.**

### Dan model naif tembus TIDAK berlaku untuk Rapier

Model naifnya: benda yang bergerak lebih jauh daripada tebal dinding dalam
satu langkah bisa berada di sisi lain sebelum tabrakan terdeteksi.

```
v_naif = tebal / langkah = 0,02 / (1/60) = 1,2 m/s
```

Terukur: bola r=5 cm terhadap dinding 2 cm pada 60 Hz **berhenti tepat di
permukaan dinding** di setiap laju sampai batas 400 m/s — 6,7 meter
perpindahan per langkah, **333× di atas v_naif**. Rapier memakai kontak
spekulatif yang tidak disebut model itu.

Yang dilaporkan karena itu bukan "aman", melainkan **apa yang benar-benar
diuji**:

> *TIDAK tembus sampai 400 m/s — batas peredaman Rapier, bukan batas ujinya.
> Klaim ini berlaku untuk bola r0.05 vs dinding datar besar; benda berputar,
> trimesh, dan kinematik cepat **BELUM diuji**.*

Klaim aman tanpa menyebut apa yang tidak diuji adalah klaim kosong.

---

## Temuan 2 — pemeriksa saya salah, mesinnya benar (ketiga kalinya hari ini)

`periksaPantulan` versi pertama melaporkan restitusi Rapier **hancur**:

```
e = 0,3  →  pantul 0,00015 m   (teori 0,4275)
e = 0,9  →  e terukur 0,72     (teori 0,90)
```

Diukur langsung di titik tumbukan, e terukur = e diminta **sampai empat
desimal**, di 60 Hz maupun 240 Hz, dalam **satu** langkah kontak:

```
diminta 0,20   |v| 7,3575 → 1,4715   e 0,2000
diminta 0,95   |v| 7,3575 → 6,9896   e 0,9500
```

| | |
|---|---|
| **indikator** | pemeriksa melaporkan kegagalan total pada mesin yang matang |
| **parameter** | jendela deteksi berbasis POSISI, selebar 1 mm |
| **faktor-X** | bola bergerak **120 mm per langkah** pada 60 Hz — peluang tertangkap ~1 % |

Sekarang tumbukan dideteksi dari **pembalikan tanda kecepatan**, yang tidak
bisa terlewat berapa pun timestep-nya. Tinggi apeks tetap dilaporkan sebagai
angka kedua — itu yang dirasakan pemain — tetapi yang **dinilai** nisbah
kecepatan, karena itulah definisi restitusi.

> Jendela deteksi harus lebih lebar daripada perpindahan per langkah, atau
> peristiwanya dilewati sama sekali. Ini keluarga yang sama dengan pemeriksa
> yang bisu saat objeknya sedikit ([ADEGAN.md](ADEGAN.md)) dan pemeriksa yang
> mengukur objek pertama ([PERAKIT.md](PERAKIT.md)).

---

## Temuan 3 — dua kegagalan diam yang dijaga di depan

**`massa` DAN `kerapatan` bersamaan.** Rapier menerima keduanya dan diam-diam
mengabaikan salah satunya. Bendanya lalu berperilaku seperti benda lain, dan
tidak ada yang tahu sebabnya. Sekarang ditolak.

**Trimesh dinamis.** Rapier tidak mendukungnya — itu batas mesin fisikanya,
bukan pilihan. Sekarang ditolak dengan menyebut jalan keluarnya (`cembung`,
atau jadikan badannya statis).

**Node dinamis tanpa satu pun node statis.** Semuanya jatuh selamanya, dan
di layar itu terlihat seperti "adegannya kosong" beberapa detik sesudah
dibuka — bendanya memang ada, cuma sudah di bawah kamera. `periksaAdegan`
menolaknya sekarang.

---

## Temuan 4 — runtime yang digerakkan rAF BERHENTI saat tab tidak dilukis

Selama pemeriksaan, adegan tampak beku: 13 badan terpasang, gravitasi
−9,81, `jalan: true`, dan tidak ada yang bergerak. Enam hipotesis diuji
sebelum yang benar muncul, lewat satu pengukuran:

```
rAF_bingkai_dalam_1s: 0
```

`requestAnimationFrame` menyala **nol kali** karena panel browsernya tidak
dilukis. Fisikanya tidak rusak sama sekali; lingkungan ujinya yang tidak
melukis. Begitu tab difokuskan, ketiga bola jatuh ke lantai dan silinder
meluncur habis dari bidang miring.

Konsekuensi rancangan yang nyata, bukan cuma pelajaran uji: **halaman terbit
yang disembunyikan berhenti mensimulasikan.** Untuk viewer itu benar dan
hemat baterai. Untuk simulasi yang harus terus berjalan, rAF adalah pilihan
yang salah.

Dari sini lahir `window.__rupa` — pegangan pemeriksaan permanen. Modul ES
tidak mengekspos lingkupnya, jadi tanpa itu satu-satunya cara mengetahui
keadaan runtime adalah menebak dari layar, dan **layar tidak membedakan
"fisika mati" dari "fisika jalan tetapi tidak tersinkron"**.

---

## Kosakata adegan

```json
"fisika": {
  "jenis": "statis | dinamis | kinematik",
  "bentuk": "kotak | bola | kapsul | silinder",
  "kerapatan": 700,     // ATAU massa, tidak boleh keduanya
  "gesekan": 0.7,
  "pantul": 0.05
}
```

Bentuk collider **dinyatakan**, tidak diturunkan dari bentuk visualnya. Itu
disengaja: collider yang mengikuti mesh persis adalah trimesh, dan trimesh
tidak bisa dinamis. Yang dipakai proksi — dan **proksi yang dipilih diam-diam
adalah proksi yang tidak pernah diperiksa.** `rupa_tabrakan` sudah mengukur
dua arah galatnya sejak A2; angka itu yang seharusnya memandu pilihan ini.

Satu node boleh **dianimasikan** atau **dikendalikan fisika**, tidak
keduanya: keduanya menulis transform yang sama tiap bingkai, dan yang menang
adalah yang kebetulan berjalan belakangan.

---

## Rapier di halaman terbit

```
https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs
```

Dua hal yang membuat jalur itu persis begitu, dan keduanya sempat salah:

**Jalurnya `dist/rapier.mjs`, dan versinya dipatok.** Percobaan pertama
memakai `rapier.es.js` — benar untuk 0.14.x, **404 di 0.20.0**, yang
memindahkan berkasnya ke `dist/`. Saya memverifikasi URL untuk versi yang
**berbeda** dari yang saya pasang, dan halamannya macet di "memuat adegan…"
tanpa satu pun tanda.

**Varian `-compat`, bukan yang biasa.** Ia menanam WASM-nya sebagai base64
(magic `AGFzbQ` ada di dalam berkasnya). Varian biasa mengambil `.wasm` lewat
fetch terpisah, dan fetch apa pun diblokir di halaman terbit.

Dimuat **malas** — hanya kalau ada node berfisika. 2,9 MB tidak boleh
dibayar halaman yang adegannya diam.

---

## Cara memakainya

```bash
node contoh/fisika-tumpukan.mjs
```

Skrip itu memeriksa mesinnya **sebelum** memakainya, dan berhenti dengan kode
1 kalau jatuh bebasnya tidak lulus. Adegan yang dihasilkan bukan demo — ia
panggung uji: tiap perilaku yang ditampilkan sudah dibuktikan di Node
sebelum satu piksel dirender.

---

## Yang belum

- **Collider dari proksi tabrakan A2** — `rupa_tabrakan` sudah membuat hull
  cembung terukur, tetapi runtime belum memakainya; ia masih memakai kotak
  batas.
- **Kendali pemain** (karakter kapsul, raycast tanah, lompat) — itu game
  controller yang sebenarnya.
- **Sendi dan kendala** (engsel, pegas, motor).
- **Trimesh statis** untuk terrain — `bpy/terrain.py` menghasilkan meshnya,
  belum tersambung ke collider.
- **Benda berputar cepat dan kinematik cepat** belum diuji terhadap tembus.
