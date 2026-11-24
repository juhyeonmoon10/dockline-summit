"""Bake the game's Bulkhead visual model from its original generated GLB.

Usage: python bake-bulkhead.py original.glb gltfpack.exe dist/assets
Dependencies: NumPy, Pillow, gltfpack 1.3.
"""
import argparse
import base64
import io
import runpy
import json
from pathlib import Path
import struct
import subprocess
import tempfile

import numpy as np
from PIL import Image


class Surface:
    """Single textured primitive in the private Tripo source and the unquantized gltfpack output."""
    def __init__(self, path):
        raw = path.read_bytes()
        size, = struct.unpack_from('<I', raw, 12)
        self.doc = json.loads(raw[20:20+size]); self.bin = memoryview(raw)[28+size:]
        mesh = self.doc['meshes'][0]; item, = mesh['primitives']
        assert len(self.doc['meshes']) == 1 and len(self.doc['nodes']) == 1 and item.get('mode',4) == 4
        node = self.doc['nodes'][0]
        if any(key in node for key in ('matrix','rotation','scale')):
            raise ValueError('Recalibrate before importing a differently oriented asset')
        pos = self.access(item['attributes']['POSITION']) + np.array(node.get('translation',[0,0,0]), dtype='f4')
        uv = self.access(item['attributes']['TEXCOORD_0']); faces=self.access(item['indices']).reshape(-1,3)
        pbr=self.doc['materials'][item['material']]['pbrMetallicRoughness']
        tid=pbr['baseColorTexture']['index']; image=self.doc['images'][self.doc['textures'][tid]['source']]
        self.textures={tid:Image.open(io.BytesIO(self.view(image['bufferView']))).convert('RGB')}
        self.primitives=[(mesh.get('name','model'),pos,faces,uv,tid,[1,1,1])]

    def view(self, i):
        record=self.doc['bufferViews'][i]; start=record.get('byteOffset',0)
        return self.bin[start:start+record['byteLength']]

    def access(self,i):
        item=self.doc['accessors'][i];view=self.doc['bufferViews'][item['bufferView']]
        dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[item['componentType']])
        size={'SCALAR':1,'VEC2':2,'VEC3':3}[item['type']]
        return np.ndarray((item['count'],size),dtype,self.view(item['bufferView']),item.get('byteOffset',0),
            strides=(view.get('byteStride',size*dtype.itemsize),dtype.itemsize))


surfaces=runpy.run_path(str(Path(__file__).with_name('bulkhead_surfaces.py')))


def encode(a):
    return base64.b64encode(a.tobytes()).decode()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path);parser.add_argument('packer',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args()
    config={'axes':['-z','y','x'], 'anchor':[-.0037,.1934,-.4913], 'target':[.0003,.0169,-.7374],
            'scale':.9318}
    basis=np.zeros((3,3),dtype='f4')
    for i,axis in enumerate(config['axes']):
        basis[i,'xyz'.index(axis[-1])]=-1 if axis.startswith('-') else 1
    if abs(np.linalg.det(basis))<.99: raise ValueError('Axes must form a basis')
    original=Surface(args.source)
    tri_total=sum(len(p[2]) for p in original.primitives)
    dataset={}
    args.output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for key,budget in [('held',20000),('preview',2500)]:
            reduced=Path(tmp)/(key+'.glb')
            # Attribute seams must survive on the textured mesh. A collapse across
            # atlas islands interpolates unrelated pieces of wood across the receiver.
            command=[args.packer.resolve(),'-i',args.source.resolve(),'-o',reduced,'-noq',
                     '-si',str(round(min(1.,budget/tri_total),6))]
            if key=='preview':command.append('-sa')  # per-vertex color only
            subprocess.run(command,check=True)
            mesh=Surface(reduced)
            if len(mesh.primitives)!=1:
                raise ValueError('Multi-material or separate meshes: inspect named components before packing')
            _,positions,faces,uv,tid,base=mesh.primitives[0]
            if key=='held' and np.quantile(np.ptp(uv[faces],axis=1).max(axis=1),.99)>.09:
                raise ValueError('UV triangles cross unrelated parts of the source atlas')
            positions=(positions@basis.T-config['anchor'])*config['scale']+config['target']
            positions=positions.astype('f4')
            if np.linalg.det(basis)<0: faces=faces[:,[0,2,1]]
            stream=mesh.doc['meshes'][0]['primitives'][0]['attributes']
            normals=mesh.access(stream['NORMAL']).astype('f4')@basis.T
            normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-10)
            centroids=positions[faces].mean(1)
            x,y,z=centroids.T
            sight=(z<-.703)&(z>-.735)&(y>.0617)
            # These curved details retain their source shape. The broad planar and
            # wooden surfaces surrounding them are rebuilt to match the source profile.
            trigger=(z>-.192)&(z<-.159)&(y<-.074)&(y>-.130)&(abs(x)<.009)
            lever=(x>.046)&(z>-.212)&(z<-.175)&(y>-.022)&(y<.038)
            keep=sight|trigger|lever
            ids,index=np.unique(faces[keep],return_inverse=True)
            if key=='held':
                albedo=surfaces['atlas'](mesh.textures[tid],original,args.output)
            raw_uv=uv[ids].copy()
            raw_uv[:,1]*=.25
            parts=[(positions[ids],normals[ids],index.reshape(-1,3),raw_uv)]
            parts.extend(surfaces['surface'](name,key) for name in ('receiver','stock','pad','sight'))
            parts.append(surfaces['guard'](key))
            channels={}
            for name,components in [('body',parts),('pump',[surfaces['surface']('pump',key)])]:
                vertex_total=0
                polygons=[]
                for vertices,_,tri,_ in components:
                    polygons.append(tri+vertex_total)
                    vertex_total+=len(vertices)
                if vertex_total>65535:raise ValueError('Part too large for packed indices')
                vertices=np.concatenate([part[0] for part in components])
                normal=np.concatenate([part[1] for part in components])
                part_uv=np.concatenate([part[3] for part in components])
                px=np.clip((part_uv*albedo.shape[0]).astype(int),0,albedo.shape[0]-1)
                attrs={'positions':np.rint(vertices*10000).astype('<i2'),
                       'normals':np.rint(normal*127).astype('i1'),
                       'colors':albedo[px[:,1],px[:,0]],
                       'faces':np.concatenate(polygons).astype('<u2')}
                if key=='held':attrs['uv']=np.rint(np.clip(part_uv,0,1)*65535).astype('<u2')
                channels[name]={k:encode(a) for k,a in attrs.items()}
                print(key,name,len(vertices),'vertices',len(attrs['faces']),'triangles')
            dataset[key]=channels
    (args.output/'dockline-shotgun-data.js').write_text('// Quantized render geometry for the Dockline game prop.\nexport const shotgunData='+
        json.dumps(dataset,separators=(',',':'))+';\n',encoding='utf-8')


if __name__ == '__main__':
    main()
