"""Bake the game's Bulkhead visual model from its original generated GLB.

Usage: python bake-bulkhead.py original.glb gltfpack.exe dist/assets
Dependencies: NumPy, Pillow, gltfpack 1.3.
"""
import argparse
import base64
import io
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


def bake_finish(surface, positions, uv, faces, albedo, output):
    size=1024
    albedo=albedo.resize((size,size),Image.Resampling.LANCZOS)
    colors=np.array(albedo)
    material=surface.doc['materials'][0]
    def image_at(index,res):
        im=surface.doc['images'][surface.doc['textures'][index]['source']]
        return Image.open(io.BytesIO(surface.view(im['bufferView']))).convert('RGB').resize((res,res),Image.Resampling.LANCZOS)
    normal=image_at(material['normalTexture']['index'],size)
    normal.save(output/'dockline-shotgun-normal.webp',quality=94,method=6)
    original_rm=np.asarray(image_at(material['pbrMetallicRoughness']['metallicRoughnessTexture']['index'],size)).astype(float)/255.
    roughness=np.zeros((size,size,3),np.uint8)+np.array([255,174,68],'u1')
    # Interpolate positions into the existing artist UV islands to keep the grain running
    # along the wood on both sides even where the original export split its surface.
    mask=np.zeros((size,size),bool);xyz=np.zeros((size,size,3),'f4')
    puv=uv*size-.5
    for ids in faces:
        a,b,c=puv[ids];ab=b-a;ac=c-a
        determinant=ab[0]*ac[1]-ab[1]*ac[0]
        if abs(determinant)<1e-8:continue
        lo=np.maximum(np.floor(np.min([a,b,c],axis=0)).astype(int),0)
        hi=np.minimum(np.ceil(np.max([a,b,c],axis=0)).astype(int),size-1)
        if np.any(hi<lo):continue
        y,x=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
        qa=x-a[0];qb=y-a[1]
        s=(qa*ac[1]-qb*ac[0])/determinant;t=(ab[0]*qb-ab[1]*qa)/determinant
        take=(s>=-.01)&(t>=-.01)&(s+t<=1.01)
        yy,xx=y[take],x[take]
        xyz[yy,xx]=positions[ids[0]]+s[take,None]*(positions[ids[1]]-positions[ids[0]])+t[take,None]*(positions[ids[2]]-positions[ids[0]])
        mask[yy,xx]=True
    # Dilate position into a small gutter around UV islands for mip filtering.
    for _ in range(5):
        old=mask.copy()
        for axis,direction in ((0,1),(0,-1),(1,1),(1,-1)):
            take=~mask&np.roll(old,direction,axis)
            xyz[take]=np.roll(xyz,direction,axis)[take];mask[take]=True
    x,y,z=np.moveaxis(xyz,-1,0)
    rgb=colors.astype('f4')/255.;r,g,b=np.moveaxis(rgb,-1,0)
    brightness=(r*.24+g*.63+b*.13)
    rng=np.random.default_rng(1442);micro=rng.normal(0,1,(size,size)).astype('f4')
    wood=(z>-.133)&(r-g>.026)&(r-b>.045)&mask
    rubber=(((z>-.692)&(z<-.544)&(y<-.008))|((z>.125)&(brightness<.29)))&mask&~wood
    metal=mask&~wood&~rubber
    vein=np.sqrt((x*.86-.074)**2+(y+.142+.007*np.sin(z*25))**2)
    phase=vein*1930+8.7*np.sin(z*19+y*18)+2.9*np.sin(z*39+x*29)
    grain=np.cos(phase)*.028+np.cos(2.1*phase+.6)*.012+np.cos(phase*.27)*.023
    pore=np.maximum(0,np.cos(phase*2.9+np.sin(z*78)))**9
    polished=1+grain-pore*.046+.009*micro
    walnut=np.array([.394,.289,.208],dtype='f4')+(brightness-.43)[:,:,None]*np.array([.40,.34,.29])
    rgb[wood]=(walnut*polished[:,:,None])[wood]
    rib=np.clip((np.sin((z+.689)*282)+.62)*1.9,0,1)
    texture=(brightness-.36)*.36+.014*micro-.027*(1-rib)
    polymer=np.array([.237,.244,.238])+texture[:,:,None]
    rgb[rubber]=polymer[rubber]
    grain_m=.98+micro*.008+.008*np.sin(z*1400+y*75)
    steel=rgb*np.array([.83,.89,.94])*grain_m[:,:,None]
    rgb[metal]=steel[metal]
    rough=np.clip(.64+.12*(original_rm[:,:,1]-.5)+micro*.013,0,1)
    metal_value=np.clip(.36+.18*(original_rm[:,:,2]-.5)+.045*(brightness-.4),0,1)
    rough[wood]=np.clip(.68+.08*pore[wood]+.018*micro[wood],.51,.84);metal_value[wood]=.012
    rough[rubber]=np.clip(.87+.035*micro[rubber],.71,.98);metal_value[rubber]=.005
    roughness[:,:,1]=np.rint(rough*255).astype('u1');roughness[:,:,2]=np.rint(metal_value*255).astype('u1')
    result=Image.fromarray(np.rint(np.clip(rgb,0,1)*255).astype('u1'))
    result.save(output/'dockline-shotgun.webp',quality=94,method=6)
    Image.fromarray(roughness).resize((512,512),Image.Resampling.LANCZOS).save(output/'dockline-shotgun-finish.webp',quality=91,method=6)
    return result


def winding(coord, polygon):
    inside = np.zeros(len(coord), dtype=bool)
    before = polygon[-1]
    for after in polygon:
        x0,y0=before
        x1,y1=after
        if y0 != y1:
            y=coord[:,1]
            inside ^= ((y0>y)!=(y1>y)) & (coord[:,0]<(x1-x0)*(y-y0)/(y1-y0)+x0)
        before=after
    return inside


def encode(a):
    return base64.b64encode(a.tobytes()).decode()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path);parser.add_argument('packer',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args()
    config={'axes':['-z','y','x'], 'anchor':[-.0037,.1934,-.4913], 'target':[.0003,.0169,-.7374],
            'scale':.9318, 'slider':[[-.6915,-.091],[-.5454,-.091],[-.5454,-.0082],[-.6915,-.0082]]}
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
            # The reconstruction has tiny needle-like projections on the textured ribs.
            # Keep their comb pattern and round their outer profile to match the glove.
            gripband=(positions[:,2]>-.7)&(positions[:,2]<-.54)&(positions[:,1]<-.007)
            lateral=positions[:,0]
            lateral[gripband]=np.sign(lateral[gripband])*(np.minimum(abs(lateral[gripband]),.039)+np.maximum(0,abs(lateral[gripband])-.039)*.22)
            stream=mesh.doc['meshes'][0]['primitives'][0]['attributes']
            norm=mesh.access(stream['NORMAL']).astype('f4')@basis.T
            norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-10)
            centroids=positions[faces].mean(1)
            pump=winding(centroids[:,[2,1]],config['slider'])
            # The image-derived shell folded its round end onto its side. Replace the
            # exposed straight run while retaining the actual sight, pump and housing.
            front=(centroids[:,2]<-.409)&~pump
            sight=front&(centroids[:,2]<-.703)&(centroids[:,2]>-.735)&(centroids[:,1]>.038)
            keep=~front|sight
            if not pump.any() or pump.all(): raise ValueError('Check isolated pump sliver')
            channels={}
            if tid is not None:
                if key=='held':
                    im=bake_finish(original,positions,uv,faces,mesh.textures[tid],args.output)
                ip=np.minimum((np.clip(uv,0,1)*im.size).astype(int),np.array(im.size)-1)
                cols=np.asarray(im)[ip[:,1],ip[:,0]]
            else: cols=np.round(np.tile(base,(len(positions),1))*255).astype('u1')
            for name,mask in [('body',~pump&keep),('pump',pump)]:
                ids,indices=np.unique(faces[mask],return_inverse=True)
                if len(ids)>65535: raise ValueError('Part too large for packed indices')
                attrs={
                    'positions':np.rint(positions[ids]*10000).astype('<i2'),
                    'normals':np.rint(norm[ids]*127).astype('i1'),
                    'colors':cols[ids],
                    'faces':indices.astype('<u2'),
                }
                if key=='held' and uv is not None: attrs['uv']=np.rint(np.clip(uv[ids],0,1)*65535).astype('<u2')
                channels[name]={k:encode(a) for k,a in attrs.items()}
                print(key,name,len(ids),'vertices',len(faces[mask]),'triangles')
            dataset[key]=channels
    (args.output/'dockline-shotgun-data.js').write_text('// Quantized render geometry for the Dockline game prop.\nexport const shotgunData='+
        json.dumps(dataset,separators=(',',':'))+';\n',encoding='utf-8')


if __name__ == '__main__':
    main()
