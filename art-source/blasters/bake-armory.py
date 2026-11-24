"""Bake a generated visual model into the game's held, preview and carried meshes.

Usage: python bake-armory.py rifle original.glb gltfpack.exe dist/assets
Requires Python, NumPy, Pillow and gltfpack 1.3. The neighboring armory-fits.json
stores the alignment and attachment masks of the model in the game's own coordinates.
"""
from pathlib import Path
import argparse, base64, io, json, mmap, struct, subprocess, tempfile
import numpy as np
from PIL import Image
from armory_surfaces import Panels

EPS=1e-8

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

class ActionMask:
    def __init__(self,kind,record):
        self.kind=kind
        for key in ['z','y','scale','length','opt','mag','bolt','drum','hammer']:
            setattr(self,key,record[key])
        for key in ['mask','solid']:
            png=io.BytesIO(base64.b64decode(record[key]))
            setattr(self,key,np.asarray(Image.open(png),dtype=bool))
    def exclude(self,p):
        idx=np.clip(((p[:,2]-self.z)*self.scale).astype(int),0,self.mask.shape[1]-1)
        rid=np.clip(((self.y-p[:,1])*self.scale).astype(int),0,self.mask.shape[0]-1)
        mask=self.mask[rid,idx].copy();x,y,z=p.T
        if self.mag:
            lo,hi=self.mag
            margin=(.04 if self.kind=='pistol' else .065)*self.length
            mag_zone=(y<hi[1])&(z>lo[2]-margin)&(z<hi[2]+margin)
            mask|=mag_zone&~self.solid[rid,idx]
            if self.kind=='lmg':
                # Clear the fused side covers all the way around the carried
                # game's round magazine, including its two painted outer faces.
                circle=((z+.179)/.143)**2+((y+.114)/.136)**2<1
                mask|=circle&((abs(x)>.086)|(y<-.060))
        if self.opt:
            lo,hi=self.opt
            padding=(.10 if self.kind=='sniper' else .07)*self.length
            mask|=(y>lo[1]-.001)&(z>lo[2]-padding)&(z<hi[2]+padding)
        if self.drum:
            lo,hi=self.drum
            mask|=(z>lo[2]-.003)&(z<hi[2]-.0005)&(y>-.033)&(y<hi[1]-.004)
            # Clear generated duplicates above the two native iron sight tips and
            # the scraps adjoining the animated drum and its original lower frame.
            mask|=(y>.069)&(((z>-.039)&(z<.045))|((z<-.311)&(z>-.381)))
            mask|=(z>-.171)&(z<-.125)&(y<-.023)&(y>-.058)
        if self.hammer:
            lo,hi=self.hammer
            mask|=(z>lo[2]-.002)&(z<hi[2]+.002)&(y>lo[1]+.006)
        if self.bolt:
            lo,hi=self.bolt
            mask|=(x>lo[0]+.003)&(z>lo[2]-.008)&(z<hi[2]+.008)&(y>lo[1]-.003)&(y<hi[1]+.010)
        return mask

def pack(a):return base64.b64encode(a.tobytes()).decode()

def mount_cap(kind,points,normals,uv,faces,atlas):
    # The imported sight and body can be fused. Close that cropped opening
    # directly under the game's original moving glass and its separate frame.
    mounts={'rifle':(.178,-.112,1.),'smg':(.134,-.055,.84),'burst':(.152,-.062,1.),
        'marksman':(.108,-.149,1.08),'lmg':(.182,-.011,1.07),'pistol':(.127,-.067,.72)}
    if kind=='revolver':
        height,z,s=-.031,-.084,.7
        bands=[[-.158,-.024,-.039,.020],[-.140,-.032,-.043,.020],[-.055,-.033,-.047,.021],
               [-.012,-.025,-.041,.021],[.004,-.012,-.036,.020]]
        rings=[np.array([[-w,top,zv],[w,top,zv],[w,bottom,zv],[-w,bottom,zv]]) for zv,top,bottom,w in bands]
        cap=[]
        for a,b in zip(rings,rings[1:]):
            for i in range(4):
                j=(i+1)%4
                cap.extend([[a[i],b[j],a[j]],[a[i],b[i],b[j]]])
        cap.extend([rings[0][[0,1,2]],rings[0][[0,2,3]],rings[-1][[0,2,1]],rings[-1][[0,3,2]]])
    elif kind in mounts:
        height,z,s=mounts[kind];height-=.0508*s;z+=.010*s
        w=.034*s;d=.054*s;b=.004*s;depth=.034*s
        coords=[(-w+b,-d),(w-b,-d),(w,-d+b),(w,d-b),(w-b,d),(-w+b,d),(-w,d-b),(-w,-d+b)]
        ring=np.array([[x,height,z+dz] for x,dz in coords],dtype='f4')
        base=ring.copy();base[:,1]-=depth;base[:,0]*=1.12
        cap=[ring[[0,i,i+1]][::-1] for i in range(1,len(ring)-1)]
        for i in range(len(ring)):
            j=(i+1)%len(ring)
            cap.extend([np.array([ring[i],ring[j],base[i]]),np.array([ring[j],base[j],base[i]])])
    else:return points,normals,uv,faces
    cap=np.asarray(cap)
    face_n=np.cross(cap[:,1]-cap[:,0],cap[:,2]-cap[:,0])
    face_n/=np.maximum(EPS,np.linalg.norm(face_n,axis=1,keepdims=True))
    # Choose a midtone from the actual receiver so the fill picks up the same finish.
    metric=(points[:,2]-z)**2+(points[:,1]-height+.022*s)**2
    nearby=np.argsort(metric)[:min(220,len(metric))]
    ij=(np.clip(uv[nearby],0,.99999)*atlas.shape[0]).astype(int);pixels=atlas[ij[:,1],ij[:,0]].astype('f4')
    target=np.median(pixels,axis=0);target*=min(1,115/max(1.,target.mean()))
    swatch=uv[nearby[np.argmin(((pixels-target)**2).sum(1))]]
    v=cap.reshape(-1,3)
    return (np.concatenate([points,v]),np.concatenate([normals,np.repeat(face_n,3,axis=0)]),
        np.concatenate([uv,np.tile(swatch,(len(v),1))]),np.concatenate([faces,
        np.arange(len(points),len(points)+len(v)).reshape(-1,3)]))

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
    mask=ActionMask(id,record)
    names=['held','preview','carried']
    src=Glb(path);count=src.triangles()
    reduced={}
    for key,budget in zip(names,[16500,2100,450]):
        dest=staging/(id+'-'+key+'.glb')
        if not dest.exists() or dest.stat().st_mtime<path.stat().st_mtime:
            cmd=[str(packer.resolve()),'-i',str(path.resolve()),'-o',str(dest.resolve()),'-noq','-si',str(round(min(1.,budget/count),8))]
            if key!='held':cmd.append('-sa')
            subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL)
        reduced[key]=Glb(dest)
    base=src.image(src.material['pbrMetallicRoughness']['baseColorTexture']).resize((1024,1024),Image.Resampling.LANCZOS)
    output.mkdir(parents=True,exist_ok=True)
    optional=[];images={'base':base}
    for k,entry in [('normal',src.material.get('normalTexture')),('orm',src.material.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture'))]:
        if not entry:continue
        texture=src.image(entry);side=1024 if k=='normal' else 512
        images[k]=texture.resize((side,side),Image.Resampling.LANCZOS)
        optional.append(k)
    panels=Panels(id,record['panels']) if 'panels' in record else None
    if panels:
        pos,_,tex,indices=reduced['held'].surface()
        images=panels.repaint(fitted(pos,calibration),tex,indices,images)
    base=images['base']
    base.save(output/('armory-'+id+'.webp'),quality=92,method=5)
    for k in optional:images[k].save(output/('armory-'+id+'-'+k+'.webp'),quality=91,method=5)
    data={'maps':optional};atlas=np.asarray(base)
    for key in names:
        pos,nor,uv,faces=reduced[key].surface()
        if key=='held' and np.quantile(np.ptp(uv[faces],axis=1).max(axis=1),.99)>.16:raise ValueError('UV islands need inspection')
        q=fitted(pos,calibration)
        norm=(nor@calibration[0].T)/calibration[1]
        norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),EPS)
        if panels:norm=panels.flatten(q,norm)
        centroids=q[faces].mean(1)
        if id=='sniper' and key!='carried':
            for anchor in [[-.036,-.052,-.400],[.024,-.070,.004]]:seat_glove(q,faces,anchor)
            centroids=q[faces].mean(1)
        if key=='carried' and id!='revolver':keep=np.ones(len(faces),dtype=bool)
        else:keep=~mask.exclude(centroids)
        used,reindex=np.unique(faces[keep].ravel(),return_inverse=True)
        if len(used)>65535:raise ValueError('16-bit index exceeded')
        norm=norm[used]
        points=q[used];tex=uv[used]
        if key!='carried':points,norm,tex,reindex=mount_cap(id,points,norm,tex,reindex.reshape(-1,3),atlas)
        t=np.clip((tex*1024).astype(int),0,1023);c=atlas[t[:,1],t[:,0]]
        data[key]={'body':{'positions':pack(np.rint(points*10000).astype('<i2')),
            'normals':pack(np.rint(norm*127).astype('i1')),'colors':pack(c.astype('u1')),
            'faces':pack(reindex.astype('<u2'))}}
        if key=='held':data[key]['body']['uv']=pack(np.rint(np.clip(tex,0,1)*65535).astype('<u2'))
        print(id,key,len(used),keep.sum(),'tris',flush=True)
    (output/('armory-'+id+'-data.js')).write_text('export const assetData='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('id',choices=['rifle','sniper','smg','burst','marksman','lmg','pistol','revolver'])
    parser.add_argument('source',type=Path)
    parser.add_argument('packer',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        bake(args.id,args.source,args.packer,args.output,Path(tmp))
