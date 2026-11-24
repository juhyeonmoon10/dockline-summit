"""Bake Frostoise's CC BY 4.0 FAMAS into the game's burst slot.

python bake-community-famas.py <source.glb> <gltfpack> <stage> --output <dist/assets>
"""
import argparse
import hashlib
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

from armory_glb import GlbDocument


def load_baker():
    path = Path(__file__).with_name('bake-photo-armory.py')
    spec = importlib.util.spec_from_file_location('armory_baker', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SHA256 = '2e33d643608d7afb28f7ccdb3eb8efb80ea3483a07fb722092a0935d7a611e0f'
CREDIT = {
    'title': 'FAMAS',
    'author': 'Frostoise',
    'authorURL': 'https://sketchfab.com/Frostoise',
    'url': 'https://sketchfab.com/3d-models/famas-7d35e14ad8874d148ce9cc46e5765a6b',
    'license': 'CC BY 4.0',
    'licenseURL': 'https://creativecommons.org/licenses/by/4.0/',
    'changes': 'Game-space registration, animated magazine, material atlases and two distance meshes.',
}


def attached_faces(positions, faces, seed):
    """Return a complete authored island, including faces across UV and normal seams."""
    _, unique_ids = np.unique(np.round(positions, 5), axis=0, return_inverse=True)
    corners = unique_ids.reshape(-1)[faces]
    incident = [[] for _ in range(corners.max()+1)]
    for face_index, tri in enumerate(corners):
        for corner in tri:
            incident[corner].append(face_index)
    pending = [unique_ids.reshape(-1)[seed]]
    visited = set(pending)
    selected = np.zeros(len(faces), dtype=bool)
    while pending:
        for face_index in incident[pending.pop()]:
            if selected[face_index]:
                continue
            selected[face_index] = True
            for corner in corners[face_index]:
                if corner not in visited:
                    pending.append(corner)
                    visited.add(corner)
    return selected


def read_source(path):
    with path.open('rb') as handle:
        digest = hashlib.file_digest(handle, 'sha256').hexdigest()
    if digest != SHA256:
        raise ValueError('Expected the credited, unmodified FAMAS download')
    raw = GlbDocument(path)
    source_credit = raw.doc['asset']['extras']
    if source_credit['source'] != CREDIT['url'] or CREDIT['author'] not in source_credit['author']:
        raise ValueError('Source attribution mismatch')

    base = Image.new('RGB', (2048, 2048))
    finish = Image.new('RGB', base.size, (255, 255, 0))
    positions, normals, uv, faces = [], [], [], []
    body, magazine = [], []
    first_vertex = 0

    def visit(node_id, parent):
        nonlocal first_vertex
        node = raw.doc['nodes'][node_id]
        transform = parent @ np.array(node.get('matrix', np.eye(4))).reshape(4, 4).T
        for child in node.get('children', []):
            visit(child, transform)
        if 'mesh' not in node:
            return
        for primitive in raw.doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            points = raw.read(attrs['POSITION']) @ transform[:3, :3].T + transform[:3, 3]
            normal = raw.read(attrs['NORMAL']) @ np.linalg.inv(transform[:3, :3])
            index = raw.read(primitive['indices']).reshape(-1, 3).astype(np.int32)
            material_id = primitive['material']
            pbr = raw.doc['materials'][material_id]['pbrMetallicRoughness']
            cell = np.array([material_id % 2, material_id // 2])
            xy = tuple(cell * 1024)
            base.paste(raw.image(pbr['baseColorTexture']), xy)
            orm = np.array(raw.image(pbr['metallicRoughnessTexture']))
            orm[:, :, 1] = np.rint(orm[:, :, 1] * pbr.get('roughnessFactor', 1))
            orm[:, :, 2] = np.rint(orm[:, :, 2] * pbr.get('metallicFactor', 1))
            finish.paste(Image.fromarray(orm), xy)

            if material_id == 0:
                # The removable magazine is the lowest connected shell of the body.
                moving = attached_faces(points, index, points[:, 1].argmin())
                if moving.sum() != 1860:
                    raise ValueError('The magazine island could not be isolated intact')
                magazine.append(index[moving] + first_vertex)
                body.append(index[~moving] + first_vertex)
            else:
                body.append(index + first_vertex)
            positions.append(points)
            normals.append(normal)
            uv.append((raw.read(attrs['TEXCOORD_0']) + cell) * .5)
            faces.append(index + first_vertex)
            first_vertex += len(points)

    # Half-turn around Y puts the source's front on the game's negative Z axis.
    for root in raw.doc['scenes'][raw.doc['scene']]['nodes']:
        visit(root, np.diag([-1., 1., -1., 1.]))
    p, n, uv, faces = [np.concatenate(items) for items in [positions, normals, uv, faces]]
    lo, hi = p.min(0), p.max(0)
    side = np.column_stack(((p[:, 2]-lo[2])/(hi[2]-lo[2]), (hi[1]-p[:, 1])/(hi[1]-lo[1])))
    data = raw, p, n, uv, faces, side, lo, hi, base, digest
    return data, {'body': np.concatenate(body), 'magazine': np.concatenate(magazine)}, finish


def software_paint(data, finish, sample):
    """Integrate the authored PBR surface over faces for the two untextured LODs."""
    _, points, _, uv, faces, _, _, _, base, _ = data
    color_map, finish_map = np.asarray(base), np.asarray(finish)
    area = np.linalg.norm(np.cross(points[faces[:, 1]]-points[faces[:, 0]],
                                   points[faces[:, 2]]-points[faces[:, 0]]), axis=1)
    texcoords = uv[faces]
    linear = np.zeros((len(points), 3))
    weight = np.zeros(len(points))
    for corner in range(3):
        # The artist painted bright wear directly on many UV island edges.
        # Sample the triangle interior so tiny edge marks stay narrow in the LOD.
        bary = np.full(3, .2)
        bary[corner] = .6
        color = np.zeros((len(faces), 3))
        for t in [0., .5, 1.]:
            coords = np.einsum('ijk,j->ik', texcoords, bary*t+(1-t)/3)
            rgb = sample(color_map, coords)/255
            albedo = np.where(rgb<=.04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)
            orm = sample(finish_map, coords)/255
            rough, metal = orm[:, 1:2], orm[:, 2:3]
            # The Lite shaders supply directional light and highlights but have
            # no environment-map or metallic channel. Retain a soft studio fill
            # on metals; matte surfaces keep their unmodified diffuse color.
            color += albedo*((1-metal) + metal*(.09+.11*rough))
        ids = faces[:, corner]
        np.add.at(linear, ids, color*(area/3)[:, None])
        np.add.at(weight, ids, area)
    linear /= np.maximum(weight[:, None], 1e-12)
    srgb = np.where(linear<=.0031308, 12.92*linear, 1.055*linear**(1/2.4)-.055)
    return np.rint(np.clip(srgb, 0, 1)*255).astype('u1')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['source', 'packer', 'stage']:
        parser.add_argument(name, type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.kind = 'burst'
    args.stage.mkdir(exist_ok=True, parents=True)
    baker = load_baker()
    data, groups, finish = read_source(args.source)
    baker.proof(args, data)
    source, points, normals, uv, faces, side, lo, hi, base, digest = data
    front = side[side[:, 0] < .001, 1]
    record = {'sourceSha256': SHA256, 'sourceCredit': CREDIT, 'maps': ['orm'],
              'nose': [0, (front.min()+front.max())*.5], 'hand': [.563, .75],
              'tip': [0, .048, -.480], 'palm': [0, -.072, .008]}

    def write_maps(output, prefix):
        base.save(output/(prefix+'.webp'), quality=95, method=5)
        finish.save(output/(prefix+'-orm.webp'), lossless=True, method=4)

    baker.bake(args, data, record, authored_groups=groups, write_maps=write_maps,
               lod_colors=software_paint(data, finish, baker.sample))
