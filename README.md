# Rupa3D

**3D tooling where every asset carries its own proof.**

Rupa3D builds 3D — exact b-rep CAD (OpenCascade), meshes (headless Blender),
and scenes with physics (three.js + Rapier) — and then **measures what it
built** against closed-form references or independent measurements. The
measurements travel with the asset: a certificate embedded in the GLB at
`asset.extras.rupa3d`, readable with a few lines of code and no Rupa3D
installed.

It is designed to be driven by AI agents over MCP, and by CI over a
command-line gate.

[Bahasa Indonesia](README.id.md)

> **Status** — 1.6.2 · 296 tests · MIT · on npm as
> [`rupa3d`](https://www.npmjs.com/package/rupa3d) · in the official MCP
> Registry as `io.github.tiranyx/rupa3d`.
> Developed and tested on Windows 11 with Node 22. Tool descriptions and
> messages are still in Indonesian.

---

## Use it as an MCP server

```bash
claude mcp add rupa3d -- npx -y rupa3d
```

Or in any MCP client configuration:

```json
{ "mcpServers": { "rupa3d": { "command": "npx", "args": ["-y", "rupa3d"] } } }
```

Requires Node ≥ 22.14. Workspaces live in `~/.rupa3d`; override with
`RUPA3D_RUANG`.

**Blender is optional.** 23 of the 36 tools run without it:

| without Blender | tools |
|---|---|
| Check any GLB against a spec; the certificate is embedded in a *copy* of the file | `rupa_periksa` with `berkas` |
| Triangle topology, texel density (pixels per metre), VRAM per texture format | `rupa_topologi`, `rupa_tekstur` |
| Convex collision hull, with how far it misses the shape | `rupa_proksi` |
| Exact b-rep CAD: primitives, booleans, fillets, 2D sketch → solid, exact volume and area, STEP/IGES/STL/GLB export | `rupa_cad_*` (11 tools) |
| three.js scenes with Rapier physics, published as a single HTML page | `rupa_adegan_*` (8 tools) |

The other 13 drive headless Blender — `bpy` modeling, import (GLB, OBJ, FBX,
STL, PLY, **SVG**), renders, LOD, baking, collision proxies, source-mesh
topology. Blender is found under `C:\Program Files\Blender Foundation\*`, at
`RUPA3D_BLENDER`, or as `blender` on `PATH`.

---

## What "proves" means

Every number below comes from the test suite or the documentation in this
repository.

- **Sketch → solid.** Extrusion volume is checked against area × distance
  (area from the shoelace formula), revolution against Pappus's theorem.
  Recorded errors range from 0 % to 6.03e−14 %; the tests fail above
  1e−10 % for extrusion and 1e−8 % for revolution. A result that misses its
  reference is never saved.
- **Exact vs approximate.** For a Ø140 mm flange the b-rep volume equals the
  analytic value; the best mesh tessellation tried (9,252 triangles) is off by
  −0.0016 %. CAD export reports which of the two you are holding (`eksak`)
  and by how much the approximation misses.
- **The kernel's `ok: true` is not accepted as proof.** A fillet larger than
  half the smallest edge came back `ok` with a broken solid whose volume *grew*
  by 1,971 mm³ on a 6,000 mm³ box. Independent checks reject it.
- **Physics.** Free-fall time matches h = ½gt² within one simulation step at
  30, 60 and 240 Hz, and the error shrinks as the step shrinks — the test
  guards the *direction*, so it cannot pass on a lucky timestep.
- **Compressed files.** A Draco-compressed sphere receives the same
  certificate as its uncompressed twin: 2,208 triangles, 0 failures,
  6 warnings.
- **Hostile files.** GLBs with node cycles, out-of-range indices, forged
  accessor counts or oversized skins are rejected with a message naming the
  defect, instead of hanging or passing. Each case runs in a child process
  with a time limit, so a regression fails the suite instead of freezing it.

---

## Command-line gate

```bash
npx -p rupa3d rupa periksa model.glb
```

Exit code `0` — passes every required rule. `1` — fails a required rule (fix
the asset). `2` — could not be checked (fix the tool or the input).
`--json` for machine output, `--spek` for another spec, `--tempel` to write a
certified copy.

---

## Develop

```bash
npm install
npm test
```

296 tests run against real Blender, OpenCascade and Rapier — not mocks — and
one suite talks to the server over real MCP stdio, including from a foreign
working directory the way an MCP client launches it. Tests that need a local
asset are skipped with the reason and how to obtain it; `node
contoh/flange-cad.mjs` rebuilds the flange fixture in about 40 seconds without
Blender.

---

## Limitations

- Tool descriptions, messages and most documentation are in **Indonesian**.
- Tested on **Windows 11** only. macOS and Linux are untested.
- `rupa_skrip` runs arbitrary `bpy` Python inside Blender. That is the
  modeling capability, not a bug — but do not expose the server to untrusted
  input over a network.
- Hardening against hostile files is **partial**: there are no general input
  size limits and no process isolation yet.
- It is **not** a replacement for Blender or Spline today.

---

## License

MIT. Dependencies keep their own licenses — notably `brepjs-opencascade`
(LGPL-2.1-only). The scripts in `bpy/` run inside Blender.

---

## Documentation (Indonesian)

| | |
|---|---|
| [docs/INTEGRASI.md](docs/INTEGRASI.md) | using Rupa3D from outside: library, MCP server, and reading the certificate without installing anything |
| [docs/SERTIFIKAT.md](docs/SERTIFIKAT.md) | specs and certificates |
| [docs/BERKAS.md](docs/BERKAS.md) | checking other people's GLB files without Blender |
| [docs/CAD-MCP.md](docs/CAD-MCP.md) · [docs/SKETSA.md](docs/SKETSA.md) · [docs/TAHAP-B-BREP.md](docs/TAHAP-B-BREP.md) | b-rep CAD over MCP, and 2D sketch → solid |
| [docs/FISIKA.md](docs/FISIKA.md) · [docs/ADEGAN.md](docs/ADEGAN.md) | physics, scenes and the web runtime |
| [docs/TOPOLOGI.md](docs/TOPOLOGI.md) · [docs/TEKSTUR.md](docs/TEKSTUR.md) · [docs/DRACO.md](docs/DRACO.md) | topology, textures, compressed files |
| [docs/PERAKIT.md](docs/PERAKIT.md) · [docs/OPTIMASI.md](docs/OPTIMASI.md) | the one-call asset pipeline, and performance |
| [CHANGELOG.md](CHANGELOG.md) | every release — including a *Terbongkar* ("exposed") section for what broke, measuring tools included |
