"""Bake a generated visual model into the game's held, preview and carried meshes.

Usage: python bake-armory.py rifle original.glb gltfpack.exe dist/assets
Requires Python, NumPy, Pillow, Node, Blender and gltfpack 1.3. Set BLENDER_BIN
when Blender is not on PATH or installed to its Windows default. The neighboring armory-fits.json
stores each source model's alignment in the game's own coordinates.
"""
from pathlib import Path
import argparse, io, json, mmap, struct, subprocess, tempfile
import numpy as np
from PIL import Image
from armory_retopology import rebuild

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

def fitted(p,cal):
    basis,scale,bias,z,dy,dx=cal;q=(p@basis.T)*scale+bias
    q[:,1]+=np.interp(q[:,2],z,dy);q[:,0]+=np.interp(q[:,2],z,dx)
    return q.astype('f4')

def seat_glove(points,faces,anchor):
    """Give each sniper glove a shallow contact patch on its original grip."""
    anchor=np.asarray(anchor)
    tri=points[faces];centers=tri.mean(1)
    tri=tri[np.argsort(((centers-anchor)**2).sum(1))[:256]]
    a,b,c=np.moveaxis(tri,1,0);ab=b-a;ac=c-a;aq=anchor-a
    ab2=(ab*ab).sum(1);ac2=(ac*ac).sum(1);abab=(ab*ac).sum(1)
    den=np.maximum(ab2*ac2-abab*abab,1e-22)
    v=(ac2*(aq*ab).sum(1)-abab*(aq*ac).sum(1))/den
    w=(ab2*(aq*ac).sum(1)-abab*(aq*ab).sum(1))/den
    inside=(v>=0)&(w>=0)&(v+w<=1)
    cand=[(a+ab*v[:,None]+ac*w[:,None])[inside]]
    for s,e in [(a,b),(a,c),(b,c)]:
        d=e-s;t=np.clip(((anchor-s)*d).sum(1)/np.maximum((d*d).sum(1),1e-16),0,1)
        cand.append(s+d*t[:,None])
    candidates=np.concatenate(cand);closest=candidates[np.argmin(((candidates-anchor)**2).sum(1))]
    delta=anchor-closest;dist=np.linalg.norm(delta)
    if not .0015<dist<.03:return
    radius=np.linalg.norm(points-closest,axis=1)
    weight=np.clip((.040-radius)/.024,0,1)
    points[:]+=np.outer(weight,delta*(1-.0015/dist))

def bake(id,path,packer,output,staging):
    record=json.loads(Path(__file__).with_name('armory-fits.json').read_text())[id]
    calibration=[np.asarray(a) for a in record['fit']]
    src=Glb(path)
    # The scan is reduced once for correspondence sampling. The clean close-up,
    # preview and carried models are generated together from the fitted shells.
    dest=staging/(id+'-held.glb')
    if not dest.exists() or dest.stat().st_mtime<path.stat().st_mtime:
        ratio=round(min(1.,16500/src.triangles()),8)
        subprocess.run([str(packer.resolve()),'-i',str(path.resolve()),'-o',str(dest.resolve()),
                        '-noq','-si',str(ratio)],check=True,stdout=subprocess.DEVNULL)
    rebuild(id,staging,output,Glb(dest),calibration,src,fitted,seat_glove)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('id',choices=['rifle','sniper','smg','burst','marksman','lmg','pistol','revolver'])
    parser.add_argument('source',type=Path)
    parser.add_argument('packer',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        bake(args.id,args.source,args.packer,args.output,Path(tmp))
