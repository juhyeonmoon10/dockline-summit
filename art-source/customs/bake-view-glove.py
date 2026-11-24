"""Extract the responder's right glove from its original Tripo HD export.

Usage: python bake-view-glove.py responder-hd.glb gltfpack.exe dist/assets
Requires NumPy and Pillow. Outputs a packed mesh and its cropped colour atlas.
"""
import base64
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageEnhance


def read_glb(path):
    raw = path.read_bytes()
    length, = struct.unpack_from("<I", raw, 12)
    return json.loads(raw[20:20 + length]), memoryview(raw)[28 + length:]


def view(model, binary, i):
    item = model["bufferViews"][i]
    start = item.get("byteOffset", 0)
    return binary[start:start + item["byteLength"]]


def attribute(model, binary, i):
    item = model["accessors"][i]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[item["type"]]
    component = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[item["componentType"]]
    buf = model["bufferViews"][item["bufferView"]]
    return np.ndarray((item["count"], width), component, view(model, binary, item["bufferView"]),
                      item.get("byteOffset", 0), strides=(buf.get("byteStride", width * np.dtype(component).itemsize), np.dtype(component).itemsize))


def read_mesh(model, binary):
    p = model["meshes"][0]["primitives"][0]
    return (attribute(model, binary, p["attributes"]["POSITION"]),
            attribute(model, binary, p["attributes"]["TEXCOORD_0"]),
            attribute(model, binary, p["indices"]).reshape(-1, 3))


def hand_coordinates(pos):
    # Long axis through the wrist and middle finger. The back of the hand faces +Y.
    x, y, z = -pos[:, 0] - .365, pos[:, 1], pos[:, 2] + .014
    return np.column_stack((x * .94 + z * .342, z * .94 - x * .342, y))


def simplify(pos, uv, faces, packer, scratch, ratio):
    data = bytearray()
    views, accessors = [], []
    for arr, shape, kind in [(pos, "VEC3", 5126), (uv, "VEC2", 5126), (faces.ravel(), "SCALAR", 5125)]:
        blob = arr.astype("<u4" if kind == 5125 else "<f4").tobytes()
        views.append({"buffer": 0, "byteOffset": len(data), "byteLength": len(blob)})
        acc = {"bufferView": len(views) - 1, "componentType": kind, "count": len(arr), "type": shape}
        if shape == "VEC3":
            acc.update(min=arr.min(0).tolist(), max=arr.max(0).tolist())
        accessors.append(acc)
        data.extend(blob)
    (scratch / "input.bin").write_bytes(data)
    Image.new("RGB", (2, 2), "white").save(scratch / "white.png")
    source = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
              "buffers": [{"uri": "input.bin", "byteLength": len(data)}], "bufferViews": views, "accessors": accessors,
              "meshes": [{"primitives": [{"indices": 2, "attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "material": 0}]}],
              "images": [{"uri": "white.png"}], "textures": [{"source": 0}],
              "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}]}
    (scratch / "input.gltf").write_text(json.dumps(source))
    subprocess.run([packer, "-i", scratch / "input.gltf", "-o", scratch / "hand.glb", "-noq", "-si", ratio], check=True)
    return read_mesh(*read_glb(scratch / "hand.glb"))


def atlas(uv, faces, texture, output):
    # Keep original texels. Each disconnected UV island gets its own padded rectangle.
    parent = list(range(len(uv)))
    def root(v):
        while parent[v] != v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        return v
    for a, b, c in faces:
        a = root(a)
        parent[root(b)] = a
        parent[root(c)] = a
    labels = np.array([root(i) for i in range(len(uv))])
    px = uv * texture.size
    islands = []
    for label in np.unique(labels):
        ids = np.flatnonzero(labels == label)
        lo = np.maximum(np.floor(px[ids].min(0)).astype(int) - 3, 0)
        hi = np.minimum(np.ceil(px[ids].max(0)).astype(int) + 3, texture.size)
        islands.append((ids, lo, hi))
    islands.sort(key=lambda i: -int(i[2][1] - i[1][1]))
    width = max(256, 2 ** int(np.ceil(np.log2(max(max(hi[0] - lo[0] for _, lo, hi in islands),
                    np.sqrt(sum(np.prod(hi-lo) for _, lo, hi in islands)))))))
    positions, x, y, row = [], 0, 0, 0
    for _, lo, hi in islands:
        w, h = hi - lo
        if x + w > width:
            x, y, row = 0, y + row, 0
        positions.append((x, y))
        x += w
        row = max(row, h)
    im = Image.new("RGB", (width, y + row))
    for (ids, lo, hi), xy in zip(islands, positions):
        im.paste(texture.crop((*lo, *hi)), xy)
        px[ids] += np.array(xy) - lo
    im.save(output / "responder-glove.webp", quality=94, method=6)
    return px / im.size


seats = np.array([[.074, .020, .779], [.077, .003, .781], [.073, -.014, .775],
                  [.065, -.026, .771], [.033, .025, .766]])
tips = np.array([[.127, .020, .763], [.134, .003, .758], [.124, -.016, .756],
                 [.109, -.026, .757], [.092, .041, .748]])


def to_game(coords):
    t, v, h = coords.T
    xyz = np.column_stack(((h - .758) * 1.48 + .007, -.063 + v * 1.62, .061 - t * 1.44))
    # Seat the cuff over the sleeve without moving any finger.
    xyz[:, 2] += .012 * np.maximum(0, 1 - (t + .004) / .021)
    return xyz


def skin_weights(coords):
    delta = tips - seats
    rel = coords[:, None, :] - seats
    fraction = np.sum(rel * delta, axis=2) / np.sum(delta**2, axis=1)
    near = rel - np.clip(fraction, 0, 1)[:, :, None] * delta
    digit = np.argmin(np.sum(near**2, axis=2), axis=1)
    frac = fraction[np.arange(len(coords)), digit]
    def smooth(a, b):
        q = np.clip((frac - a) / (b - a), 0, 1)
        return q*q*(3-2*q)
    return np.column_stack((digit, np.rint(smooth(-.15,.15)*255), np.rint(smooth(.44,.68)*255))).astype("u1")


def palm_shift(xyz, faces):
    # Seat the leather surface, not the middle of the hand, against the existing magazine contact.
    probe = np.array([-.070, .010])
    hit = []
    for a, b, c in xyz[faces]:
        ab, ac = b[1:] - a[1:], c[1:] - a[1:]
        det = ab[0] * ac[1] - ab[1] * ac[0]
        if abs(det) < 1e-12:
            continue
        q = probe - a[1:]
        s, r = (q[0]*ac[1]-q[1]*ac[0])/det, (ab[0]*q[1]-ab[1]*q[0])/det
        if min(s, r) >= 0 and s+r <= 1:
            hit.append(a[0] + s*(b[0]-a[0]) + r*(c[0]-a[0]))
    return .008 - min(hit)


source, packer, output = map(Path, sys.argv[1:])
model, raw = read_glb(source)
pos, uv, faces = read_mesh(model, raw)
image_id = model["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
image = model["images"][model["textures"][image_id]["source"]]
texture = Image.open(io.BytesIO(view(model, raw, image["bufferView"]))).convert("RGB")
# The studio export bakes warm light into the leather. Use a muted field tan so the
# game lights supply warmth only once and raised seams keep their tonal contrast.
texture = ImageEnhance.Brightness(ImageEnhance.Color(texture).enhance(.52)).enhance(.82)
local = hand_coordinates(pos)
in_glove = (local[:, 0] > -.004) & (pos[:, 0] < -.34)
faces = faces[in_glove[faces].all(axis=1)]
ids, remap = np.unique(faces, return_inverse=True)
parts = (pos[ids], uv[ids], remap.reshape(-1, 3))
out = ["// Generated from the original Dockline Tripo responder by art-source/customs/bake-view-glove.py."]
for level, ratio in [("held", "0.17"), ("preview", "0.015")]:
    with tempfile.TemporaryDirectory() as tmp:
        pos, uv, faces = simplify(*parts, packer.resolve(), Path(tmp), ratio)
    if len(pos) > 65535:
        raise ValueError("The glove must fit in a 16-bit index buffer")
    coords = hand_coordinates(pos)
    xyz = to_game(coords)
    if level == "held":
        shift = palm_shift(xyz, faces)
    xyz[:, 0] += shift
    pixel = np.minimum(np.maximum((uv*texture.size).astype(int), 0), np.array(texture.size)-1)
    attrs = {"points": np.rint(xyz*10000).astype("<i2"), "colors": np.asarray(texture)[pixel[:,1],pixel[:,0]],
             "digits": skin_weights(coords), "triangles": faces.astype("<u2")}
    if level == "held":
        attrs["texcoords"] = np.rint(atlas(uv, faces, texture, output)*65535).astype("<u2")
    encoded = {k:base64.b64encode(a.tobytes()).decode() for k,a in attrs.items()}
    out.append("export const " + level + "=" + json.dumps(encoded, separators=(",", ":")) + ";")
    print(f"{level}: {len(pos)} vertices, {len(faces)} triangles")
for key, arr in [("seats", seats), ("tips", tips)]:
    values = to_game(arr)
    values[:,0] += shift
    out.append("export const " + key + "=" + json.dumps(values.round(6).tolist()) + ";")
(output / "responder-glove.js").write_text("\n".join(out)+"\n", encoding="utf-8")
