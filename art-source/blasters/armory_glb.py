"""Read an uncompressed glTF 2.0 exterior mesh and its embedded material maps."""
import io, json, mmap, struct
from pathlib import Path
import numpy as np
from PIL import Image

class Glb:
    def __init__(self,path):
        with Path(path).open('rb') as file:
            raw=mmap.mmap(file.fileno(),0,access=mmap.ACCESS_READ)
        if raw[:4]!=b'glTF' or struct.unpack_from('<II',raw,4)!=(2,len(raw)):
            raise ValueError('Invalid GLB '+str(path))
        size=struct.unpack_from('<I',raw,12)[0]
        self.doc=json.loads(raw[20:20+size]);self.bin=memoryview(raw)[28+size:]
        self.item=self.doc['meshes'][0]['primitives'][0]
        if len(self.doc['meshes'])!=1 or len(self.doc['meshes'][0]['primitives'])!=1:
            raise ValueError('Multiple mesh primitives require separate material handling')
        self.material=self.doc['materials'][self.item.get('material',0)]
        self.node=next(n for n in self.doc['nodes'] if n.get('mesh')==0)
        if any(x in self.node for x in ['matrix','rotation','scale']):
            raise ValueError('GLB carries non-translation node transform')
    def view(self,v):
        bv=self.doc['bufferViews'][v];o=bv.get('byteOffset',0)
        return self.bin[o:o+bv['byteLength']]
    def read(self,i):
        a=self.doc['accessors'][i];bv=self.doc['bufferViews'][a['bufferView']]
        t=np.dtype({5121:'u1',5120:'i1',5123:'<u2',5122:'<i2',5125:'<u4',5126:'<f4'}[a['componentType']])
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.ndarray((a['count'],n),t,self.view(a['bufferView']),a.get('byteOffset',0),
            strides=(bv.get('byteStride',n*t.itemsize),t.itemsize))
    def surface(self):
        a=self.item['attributes']
        p=self.read(a['POSITION'])+np.array(self.node.get('translation',[0,0,0]),dtype='f4')
        return p,self.read(a['NORMAL']),self.read(a['TEXCOORD_0']),self.read(self.item['indices']).reshape(-1,3)
    def image(self,record):
        tex=self.doc['textures'][record['index']]
        return Image.open(io.BytesIO(self.view(self.doc['images'][tex['source']]['bufferView']))).convert('RGB')
    def triangles(self):
        return self.doc['accessors'][self.item['indices']]['count']//3
