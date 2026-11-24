"""Prepare a compact Tripo GLB for rigging. Preserve native PBR maps up to 2K.

Before running this, simplify the source with gltfpack (-noq -sp -sv; target
about 38,000 triangles for a full operator). Requires Pillow and NumPy.
"""
from io import BytesIO
import json
from pathlib import Path
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

source,target,team=sys.argv[1:]
data=Path(source).read_bytes()
header=struct.unpack_from('<I',data,12)[0]
g=json.loads(data[20:20+header])
binary=memoryview(data)[28+header:]
base={g['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source'] for m in g['materials']}
images={img['bufferView']:(idx,img) for idx,img in enumerate(g['images'])}

def accessor(index):
    a=g['accessors'][index]
    view=g['bufferViews'][a['bufferView']]
    dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
    width={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
    return np.ndarray((a['count'],width),dtype,buffer=binary,
        offset=view.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(view.get('byteStride',width*dtype.itemsize),dtype.itemsize))

def fabric_mask(size, image_id):
    mask=Image.new('L',size)
    draw=ImageDraw.Draw(mask)
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            base_tex=g['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
            if g['textures'][base_tex]['source']!=image_id: continue
            pos=accessor(p['attributes']['POSITION'])
            uv=accessor(p['attributes']['TEXCOORD_0'])*size
            faces=accessor(p['indices']).reshape(-1,3)
            centres=pos[faces].mean(axis=1)
            h=(centres[:,1]-pos[:,1].min())/np.ptp(pos[:,1])
            x=np.abs(centres[:,0]-(pos[:,0].min()+pos[:,0].max())*.5)/np.ptp(pos[:,0])
            for f in faces[(h>.075)&(h<.805)&(x<.42)]:
                draw.polygon([tuple(pt) for pt in uv[f]],fill=255)
    return np.asarray(mask.filter(ImageFilter.MaxFilter(3)),dtype=float)/255

result=bytearray()
for idx,view in enumerate(g['bufferViews']):
    start=view.get('byteOffset',0)
    chunk=binary[start:start+view['byteLength']]
    if idx in images:
        image_id,image=images[idx]
        im=Image.open(BytesIO(chunk))
        grade=image_id in base and team=='guard'
        resize=max(im.size)>2048
        if resize:
            im.thumbnail((2048,2048),Image.Resampling.LANCZOS)
        if grade:
            im=im.convert('RGB')
            hsv=np.asarray(im.convert('HSV'),dtype=float)
            hue,sat,val=hsv[...,0],hsv[...,1],hsv[...,2]
            # Shift olive cloth into slate, preserving warm skin, dark trim and highlights.
            mix=np.clip((hue-18)/9,0,1)*np.clip((63-hue)/11,0,1)*np.clip((sat-9)/20,0,1)*np.clip((val-18)/30,0,1)
            mix=(mix*fabric_mask(im.size,image_id))[...,None]
            hsv[...,0]=146
            hsv[...,1]=52
            hsv[...,2]*=.96
            slate=np.asarray(Image.fromarray(hsv.clip(0,255).astype('uint8'),'HSV').convert('RGB'),dtype=float)
            im=Image.fromarray(((1-mix)*np.asarray(im)+mix*slate).clip(0,255).astype('uint8'))
        # An extra JPEG generation blurs the independent channels of normal
        # and roughness maps. Reuse the original embedded bytes where possible.
        if grade or resize:
            out=BytesIO()
            if image['mimeType']=='image/jpeg':
                im.save(out,'JPEG',quality=94,subsampling=0,optimize=True)
            else:
                im.save(out,'PNG',optimize=True)
                image['mimeType']='image/png'
            chunk=out.getvalue()
    result.extend(b'\0'*(-len(result)%4))
    view['byteOffset']=len(result)
    view['byteLength']=len(chunk)
    result.extend(chunk)
result.extend(b'\0'*(-len(result)%4))
g['buffers'][0]['byteLength']=len(result)
desc=json.dumps(g,separators=(',',':')).encode()
desc+=b' '*(-len(desc)%4)
with Path(target).open('wb') as f:
    f.write(struct.pack('<4sII',b'glTF',2,28+len(desc)+len(result)))
    f.write(struct.pack('<I4s',len(desc),b'JSON')+desc)
    f.write(struct.pack('<I4s',len(result),b'BIN\0')+result)
