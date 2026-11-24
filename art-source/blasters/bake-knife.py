"""Rebuild the visual game mesh, material maps and two software LODs from a Tripo export.

Usage: python bake-knife.py karambit source.glb path/to/gltfpack dist/assets
Requires Node, NumPy, Pillow and gltfpack 1.3.
"""
import argparse,base64,io,json,runpy,struct,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

tools=Path(__file__).resolve().parent
repo=tools.parent.parent
Surface=runpy.run_path(str(tools/'bake-bulkhead.py'))['Surface']
registration={'karambit': {'matrix': [[-0.0573877917592758, -0.43654825513921436, -0.17781349538792116], [0.44429824259518225, -0.08373690652919798, 0.13619322914891874], [-0.11391429192845297, -0.10667335807264165, 0.6207714151789914]], 'offset': [-0.21518483423271711, -0.0006676846748034579, -0.05492985791595888]}, 'balisong': {'matrix': [[0.1528404295112177, -0.5527962985986807, -0.10594545166667248], [0.5184067668025852, 0.1459227479078462, 0.11394622128740113], [-0.07100807674191424, -0.12452504235985076, 0.6038431935753262]], 'offset': [-0.12054532022506714, 0.022816784197526124, -0.019449686494529574]}}

def reference_labels(reference):
    parts=[]
    for i,p in enumerate(reference):
        tri=np.array(p['positions']).reshape(-1,3,3)+p['pivot']
        parts.append(tri)
    extent=np.concatenate(parts).reshape(-1,3)
    lo=extent.min(0)[:2]-.08;hi=extent.max(0)[:2]+.08
    unit=max(hi-lo)/720;size=np.ceil((hi-lo)/unit).astype(int)
    labels=[]
    for i,tri in enumerate(parts):
        pic=Image.new('L',tuple(size));draw=ImageDraw.Draw(pic)
        for f in (tri[:,:,:2]-lo)/unit:
            draw.polygon([tuple(v) for v in f],fill=255)
        labels.append(np.asarray(pic)>0)
    result=np.full(labels[0].shape,255,dtype='u1')
    for i,mask in enumerate(labels):result[mask]=i
    rings=[]
    for i,mask in enumerate(labels):
        prop=Image.fromarray(np.uint8(mask)*255)
        D=np.full(result.shape,255,dtype='u1')
        for d in range(0,132,2):
            m=np.asarray(prop)>0;D[m&(D==255)]=d
            if d<130:prop=prop.filter(ImageFilter.MaxFilter(5))
        rings.append(D)
    best=np.argmin(rings,axis=0);missing=result==255;result[missing]=best[missing]
    return lambda coords:result[tuple(np.clip(((coords[:,:2]-lo)/unit).astype(int),[0,0],size-1).T[::-1])]

def balisong_labels(p):
    # The gap between the two curved Tripo handles follows an arc in the
    # broadside pose. Follow that actual opening while cutting the three pieces.
    pixel_y=720-p[:,1]*1900
    gap=np.interp(pixel_y,[546,600,630,680,720,760,816,850,904,978,1050,1100,1150,1230],
                  [229,227,218,200,186,174,164,162,164,180,201,221,240,255])
    return np.where(p[:,1]>.086,1,np.where(p[:,0]<(gap-220)/1900,2,0))

def satin_normals(pos,normals):
    # Keep the scanned silhouette and near-edge normals. Integrate the highlight
    # across the broad face; the generator bakes many little dents into that face.
    normal=normals.copy()
    lo=pos.min(0)[:2];unit=max(np.ptp(pos,axis=0)[:2])/145
    cells=np.maximum(np.floor((pos[:,:2]-lo)/unit).astype(int),0)
    w,h=cells.max(0)+1
    for side in [-1,1]:
        weight=np.clip((normals[:,2]*side-.15)*1.5,0,1)
        accum=np.zeros((h,w,4),'f4');x,y=cells.T
        np.add.at(accum,(y,x),np.column_stack((normals, np.ones(len(normals))))*weight[:,None])
        for axis in (0,1):
            accum=sum(np.roll(accum,k,axis=axis)*np.exp(-(k/3.8)**2) for k in range(-8,9))
        smooth=accum[y,x,:3]/np.maximum(accum[y,x,3:],1e-10)
        influence=np.clip((normals[:,2]*side-.15)*1.8,0,.95)[:,None]
        normal=normal*(1-influence)+smooth*influence
    return normal/np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-10)

def write_model(name,source_file,reference,temp,output):
    source=Surface(source_file)
    mat=np.asarray(registration[name]['matrix'])
    offset=np.asarray(registration[name]['offset'])
    classify=balisong_labels if name=='balisong' else reference_labels(reference)
    prefix='armory-'+name
    material=source.doc['materials'][0];pbr=material['pbrMetallicRoughness'];imgs=source.doc['images']
    maps=[]
    def bake_map(field,suffix):
        img=imgs[source.doc['textures'][field['index']]['source']]
        tex=Image.open(io.BytesIO(source.view(img['bufferView']))).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
        if suffix=='-orm':
            a=np.array(tex)
            a[:,:,1]=np.clip(50+.81*a[:,:,1],0,255)
            a[:,:,2]=np.clip(.88*a[:,:,2],0,255)
            tex=Image.fromarray(a)
        tex.save(output/(prefix+suffix+'.webp'),quality=94,method=5)
        return np.asarray(tex)
    color=bake_map(pbr['baseColorTexture'],'')
    if 'normalTexture' in material:bake_map(material['normalTexture'],'-normal');maps.append('normal')
    if 'metallicRoughnessTexture' in pbr:bake_map(pbr['metallicRoughnessTexture'],'-orm');maps.append('orm')
    data={'maps':maps}
    encode=lambda a:base64.b64encode(a.tobytes()).decode('ascii')
    for level in ['held','preview','carried']:
        mesh=Surface(temp/(level+'.glb'))
        _,pos,faces,uv,*_=mesh.primitives[0]
        pos=pos@mat+offset
        normal=mesh.access(mesh.doc['meshes'][0]['primitives'][0]['attributes']['NORMAL'])@np.linalg.inv(mat).T
        normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-10)
        coords=np.clip((uv*1024).astype(int),0,1023)
        rgb=color[coords[:,1],coords[:,0]]
        facepart=classify(pos[faces].mean(1))
        if name=='balisong':pos[:,:2]-=[.0051,.0025]
        else:pos[:,:2]+=[.0037,.0012]
        primitives={}
        for i,p in enumerate(reference):
            owned=faces[facepart==i]
            if not len(owned):raise ValueError('empty part '+p['name'])
            idx,ix=np.unique(owned,return_inverse=True)
            n=satin_normals(pos[idx],normal[idx]) if p['name']=='blade' else normal[idx]
            attrs={'positions':np.rint((pos[idx]-p['pivot'])*10000).astype('<i2'),
                'normals':np.rint(n*127).astype('i1'),'faces':ix.astype('<u2'),'colors':rgb[idx]}
            if level=='held':attrs['uv']=np.rint(np.clip(uv[idx],0,1)*65535).astype('<u2')
            assert len(idx)<65536
            primitives[p['name']]={k:encode(v) for k,v in attrs.items()}
            print(name,level,p['name'],len(owned),flush=True)
        data[level]=primitives
    (output/(prefix+'-data.js')).write_text('export const assetData='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('skin',choices=registration)
    parser.add_argument('source',type=Path)
    parser.add_argument('packer',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    export='''import {knifeParts} from './dist/knife-art.js';
const parts=knifeParts(process.argv[1]);
console.log(JSON.stringify(parts.map(p=>({name:p.name,pivot:p.pivot,positions:Array.from(p.positions)}))));
'''
    reference=json.loads(subprocess.check_output(['node','--input-type=module','-e',export,args.skin],cwd=repo))
    with args.source.open('rb') as stream:
        header=stream.read(20)
        obj=json.loads(stream.read(struct.unpack_from('<I',header,12)[0]))
    triangles=sum(obj['accessors'][p['indices']]['count']//3 for m in obj['meshes'] for p in m['primitives'])
    args.output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as folder:
        temp=Path(folder)
        for key,budget in [('preview',1900),('held',14000),('carried',360)]:
            cmd=[args.packer.resolve(),'-i',args.source.resolve(),'-o',temp/(key+'.glb'),'-noq','-si',str(budget/triangles)]
            if key!='held':cmd.append('-sa')
            subprocess.run(cmd,check=True)
        write_model(args.skin,args.source,reference,temp,args.output)

if __name__=='__main__':
    main()
