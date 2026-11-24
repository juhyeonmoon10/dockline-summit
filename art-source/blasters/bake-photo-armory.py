"""Import an externally referenced Tripo game prop, keeping its actual triangles and UVs.

Run 'prepare' first to render the source side view in normalized image coordinates.
The measured grip, muzzle and moving exterior part polygons go in photo-fits.json.
Then run 'bake' with the same source, staging path and gltfpack executable.
"""
import argparse
import base64
import hashlib
import json
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from armory_glb import Glb

HERE = Path(__file__).resolve().parent
LOD_BUDGET = {'held': 30000, 'preview': 3400, 'carried': 1050}


def integers(values, dtype):
    return base64.b64encode(np.ascontiguousarray(values, dtype=dtype).tobytes()).decode('ascii')


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-10)


def reduce_file(packer, source, dest, ratio, extra):
    subprocess.run([str(packer.resolve()), '-i', str(source.resolve()), '-o', str(dest.resolve()),
                    '-noq', '-si', str(min(1, ratio)), *extra], check=True, stdout=subprocess.DEVNULL)


def prepare(args):
    raw = Glb(args.source)
    generator = str(raw.doc['asset'].get('generator', ''))
    if 'tripo' not in generator.lower():
        raise ValueError('Expected a GLB exported by Tripo, found ' + generator)
    with args.source.open('rb') as source_file:
        digest = hashlib.file_digest(source_file,'sha256').hexdigest()
    args.stage.mkdir(parents=True, exist_ok=True)
    simplified = args.stage / (args.kind + '-held.glb')
    signature = args.stage / (args.kind + '-sha256.txt')
    if not simplified.exists() or not signature.exists() or signature.read_text() != digest:
        reduce_file(args.packer, args.source, simplified, LOD_BUDGET['held'] / raw.triangles(), ['-se', '0.035'])
        signature.write_text(digest)
    held = Glb(simplified)
    positions, normals, uv, faces = held.surface()
    # Orient the long axis horizontally using the export's own cloud. Front ends
    # generally have a much narrower silhouette than the heel of a grip or stock.
    horizontal = positions[:, [0, 2]]
    _, axes = np.linalg.eigh(np.cov(horizontal.T))
    along = axes[:, -1]
    basis_z = np.array([along[0], 0, along[1]])
    z = positions @ basis_z
    def thickness(side):
        return np.quantile(side, .91) - np.quantile(side, .09)
    left = thickness(positions[z < np.quantile(z, .11), 1])
    right = thickness(positions[z > np.quantile(z, .89), 1])
    if (left > right) != bool(args.reverse):
        basis_z *= -1
    up = np.array([0., 1., 0.])
    basis = np.stack([np.cross(up, basis_z), up, basis_z])
    p = positions @ basis.T
    n = normals @ basis.T
    # All artwork registration points refer to this stable side projection.
    lo, hi = p.min(axis=0), p.max(axis=0)
    span = np.maximum(hi-lo, 1e-7)
    side = np.stack([(p[:, 2]-lo[2])/span[2], (hi[1]-p[:, 1])/span[1]], axis=1)
    material = raw.material['pbrMetallicRoughness']
    base = raw.image(material['baseColorTexture'])
    return raw, p, n, uv, faces, side, lo, hi, base, digest


def sample(image, uv):
    if isinstance(image, Image.Image):
        image = np.asarray(image.convert('RGB'))
    size = np.array([image.shape[1], image.shape[0]])
    x, y = np.floor(np.clip(uv, 0, 1) * (size-1)).astype(int).T
    return image[y, x, :3]


def proof(args, data):
    _, p, n, uv, faces, side, lo, hi, base, digest = data
    w, h = 1150, max(280, min(760, round(1150*(hi[1]-lo[1])/(hi[2]-lo[2]))))
    pad = 29
    image = Image.new('RGB', (w+pad*2, h+pad*2), '#c3cace')
    draw = ImageDraw.Draw(image)
    screen = np.rint(side*[w,h]+pad).astype(int)
    colors = sample(base, uv[faces].mean(1)).astype(float)
    colors *= (.69+.35*np.clip(n[faces].mean(1) @ np.array([.85,.45,-.18]), 0,1))[:,None]
    for i in np.argsort(p[faces,0].mean(1)):
        draw.polygon([tuple(x) for x in screen[faces[i]]], fill=tuple(colors[i].astype('u1')))
    for tick in range(0, 101, 5):
        x, y = round(pad+w*tick/100), round(pad+h*tick/100)
        ink = '#657f8c' if tick%10==0 else '#97aab0'
        draw.line([(x,pad),(x,pad+h)], fill=ink)
        draw.line([(pad,y),(pad+w,y)], fill=ink)
        draw.text((x-5, 6), str(tick), fill='black')
        draw.text((1, y-5), str(tick), fill='black')
    image.save(args.stage/(args.kind+'-side.jpg'), quality=94)
    print(args.kind, digest, len(faces), 'triangles', flush=True)


def in_polygon(samples, points):
    x,y = samples.T
    inside = np.zeros(len(samples), dtype=bool)
    a = np.array(points[-1], dtype=float)
    for b in np.asarray(points, dtype=float):
        if abs(b[1]-a[1])>1e-7:
            inside ^= ((a[1]>y)!=(b[1]>y)) & (x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
        a=b
    return inside


def surface_fit(p, n, lo, hi, record):
    span = hi-lo
    def source_location(uv):
        return np.array([hi[1]-span[1]*uv[1], lo[2]+span[2]*uv[0]])
    src0, src1 = (source_location(record[name]) for name in ['nose','hand'])
    dest0 = np.array(record['tip'])
    dest1 = np.array(record['palm'])
    source_vec = src1-src0
    target_vec = dest1[1:]-dest0[1:]
    rotation = np.arctan2(target_vec[0],target_vec[1])-np.arctan2(source_vec[0],source_vec[1])
    cs, sn = np.cos(rotation), np.sin(rotation)
    yz_rotation = np.array([[cs,-sn],[sn,cs]])
    scale = np.linalg.norm(target_vec)/np.linalg.norm(source_vec)
    q = p.copy()
    q[:,1:] = (p[:,1:]-src0)@yz_rotation*scale+dest0[1:]
    normals = n.copy()
    normals[:,1:] = n[:,1:]@yz_rotation
    def center_at(yz,dz,dy):
        patch=p[(np.abs(p[:,2]-yz[1])<span[2]*dz)&(np.abs(p[:,1]-yz[0])<span[1]*dy),0]
        return np.mean(np.quantile(patch,[.07,.93])) if len(patch)>3 else .5*(lo[0]+hi[0])
    cx=center_at(src0,.013,.075);grip_x=center_at(src1,.035,.085)
    yaw=np.arctan2((grip_x-cx)*scale-(dest1[0]-dest0[0]),dest1[2]-dest0[2])
    cs,sn=np.cos(yaw),np.sin(yaw)
    x=(p[:,0]-cx)*scale;z=q[:,2]-dest0[2]
    q[:,0]=dest0[0]+cs*x-sn*z
    q[:,2]=dest0[2]+sn*x+cs*z
    nx,nz=normals[:,0].copy(),normals[:,2].copy()
    normals[:,0]=cs*nx-sn*nz;normals[:,2]=sn*nx+cs*nz
    return q, normals


def contact(points,faces,position):
    """Project an animation contact onto the actual imported exterior."""
    anchor=np.asarray(position)
    centers=points[faces].mean(1)
    tri=points[faces[np.argsort(np.sum((centers-anchor)**2,axis=1))[:128]]]
    a,b,c=np.moveaxis(tri,1,0);ab=b-a;ac=c-a;aq=anchor-a
    bb=(ab*ab).sum(1);cc=(ac*ac).sum(1);bc=(ab*ac).sum(1)
    den=np.maximum(bb*cc-bc*bc,1e-20)
    v=(cc*(aq*ab).sum(1)-bc*(aq*ac).sum(1))/den
    w=(bb*(aq*ac).sum(1)-bc*(aq*ab).sum(1))/den
    inside=(v>=0)&(w>=0)&(v+w<=1)
    candidates=[(a+ab*v[:,None]+ac*w[:,None])[inside]]
    for start,end in [(a,b),(a,c),(b,c)]:
        edge=end-start
        t=np.clip(((anchor-start)*edge).sum(1)/np.maximum((edge*edge).sum(1),1e-20),0,1)
        candidates.append(start+edge*t[:,None])
    options=np.concatenate(candidates)
    return np.round(options[np.argmin(((options-anchor)**2).sum(1))],5).tolist()


def split_parts(p, faces, side, record):
    points = side[faces].mean(1)
    unclaimed = np.ones(len(faces), dtype=bool)
    groups = {}
    for name, polygon in record.get('parts', {}).items():
        mask = in_polygon(points, polygon) & unclaimed
        if mask.sum() < 3:
            raise ValueError('Missing source surface for ' + name)
        groups[name] = faces[mask]
        unclaimed &= ~mask
    return {'body':faces[unclaimed], **groups}


def pack_part(p,n,c,faces,uv=None):
    ids, flat = np.unique(faces, return_inverse=True)
    if len(ids)>65535:
        raise ValueError('Part exceeds 16-bit index limit')
    out = {'positions':integers(np.rint(p[ids]*10000), '<i2'),
           'normals':integers(np.rint(np.clip(n[ids],-1,1)*127), 'i1'),
           'colors':integers(c[ids], 'u1'), 'faces':integers(flat,'<u2')}
    if uv is not None:
        out['uv'] = integers(np.rint(np.clip(uv[ids],0,1)*65535), '<u2')
    return out


def soften_normals(n,faces):
    # Denoise small variations on continuous surfaces, retaining each authored
    # crease, UV seam and the geometry's actual silhouette across every LOD.
    edges=np.concatenate((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]))
    a,b=edges.T
    weights=np.clip((np.einsum('ij,ij->i',n[a],n[b])-.78)/.22,0,1)
    for _ in range(2):
        totals=np.zeros_like(n)
        np.add.at(totals,a,weights[:,None]*n[b])
        np.add.at(totals,b,weights[:,None]*n[a])
        n=unit(.60*n+.40*unit(totals))
    return n


def stock_sides(p,n,side):
    # Refit the two broad polymer panels across their thickness only. The scan's
    # top, heel, neck and butt silhouette are the original measured positions.
    for direction in [-1,1]:
        level=direction*n[:,0]
        panel=(side[:,0]>.74)&(side[:,0]<.974)&(level>.82)
        if panel.sum()<16:continue
        y,z=p[:,1],p[:,2]
        basis=np.column_stack((np.ones(len(y)),y,z,y*z,y*y,z*z))
        keep=panel.copy()
        for _ in range(3):
            coeff=np.linalg.lstsq(basis[keep],p[keep,0],rcond=None)[0]
            err=np.abs(p[:,0]-basis@coeff)
            keep=panel&(err<max(.0018,np.quantile(err[panel],.77)))
        w=np.clip((level-.53)/.29,0,1)*np.clip((side[:,0]-.686)/.083,0,1)*np.clip((.982-side[:,0])/.016,0,1)
        p[:,0]+=.76*w*((basis@coeff)-p[:,0])
        dy=coeff[1]+coeff[3]*z+2*coeff[4]*y
        dz=coeff[2]+coeff[3]*y+2*coeff[5]*z
        normal=direction*unit(np.column_stack((np.ones(len(y)),-dy,-dz)))
        n[:]=unit(n*(1-w[:,None]*.91)+normal*w[:,None]*.91)


def polymer_map(uv,faces,side):
    mask=Image.new('L',(1024,1024))
    draw=ImageDraw.Draw(mask)
    pixels=np.rint(uv*1023).astype(int)
    weights=np.clip((side[faces,0].mean(1)-.678)/.085,0,1)
    for tri,weight in zip(faces,weights):
        if weight>.005:draw.polygon([tuple(p) for p in pixels[tri]], fill=round(255*weight))
    return mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))


def color_glb(path, p,n,c,faces):
    ids, flat=np.unique(faces, return_inverse=True)
    # NumPy 2 can preserve the input (triangle, corner) shape. The glTF index
    # accessor counts individual corners; a count of triangles drops two thirds
    # of the original surface before simplification even starts.
    flat=flat.reshape(-1)
    arrays = [np.ascontiguousarray(p[ids],'<f4'), np.ascontiguousarray(n[ids],'<f4'),
              np.ascontiguousarray(c[ids]/255,'<f4'), np.ascontiguousarray(flat,'<u4')]
    blob=bytearray();views=[];ac=[]
    for i,array in enumerate(arrays):
        views.append({'buffer':0,'byteOffset':len(blob),'byteLength':array.nbytes})
        blob.extend(array.tobytes())
        a={'bufferView':i,'componentType':5125 if i==3 else 5126,'count':len(flat) if i==3 else len(ids),'type':'SCALAR' if i==3 else 'VEC3'}
        if i==0:a.update(min=array.min(0).tolist(),max=array.max(0).tolist())
        ac.append(a)
    d={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
       'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'COLOR_0':2},'indices':3,'material':0}]}],
       'materials':[{}],'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':ac}
    js=json.dumps(d,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    path.write_bytes(struct.pack('<4s4I',b'glTF',2,28+len(js)+len(blob),len(js),0x4e4f534a)+js+
                     struct.pack('<2I',len(blob),0x004e4942)+blob)


def reduced_color(args,name,p,n,c,f,budget):
    if len(f)<=budget:return pack_part(p,n,c,f)
    source=args.stage/(args.kind+'-'+name+'-input.glb')
    color_glb(source,p,n,c,f)
    original=p[np.unique(f)]
    bounds=np.stack([original.min(0),original.max(0)])
    span=bounds[1]-bounds[0]
    tolerance=np.maximum(span*.10,span.max()*.008)+.0015
    # Small articulated pieces sometimes disappear under aggressive reduction.
    # Give just the affected preview piece more faces; keep carried meshes capped.
    while True:
        output=args.stage/(args.kind+'-'+name+'-lod-'+str(budget)+'.glb')
        reduce_file(args.packer,source,output,budget/len(f),['-se','0.12','-sa','-sp'])
        mesh=Glb(output)
        attr=mesh.item['attributes']
        pos=mesh.read(attr['POSITION'])+np.array(mesh.node.get('translation',[0,0,0]))
        faces=mesh.read(mesh.item['indices']).reshape(-1,3)
        used=pos[np.unique(faces)]
        extremes=np.stack([used.min(0),used.max(0)])
        if np.all(np.abs(extremes-bounds)<=tolerance):
            break
        if name=='carried' or budget>=len(f):
            raise ValueError(f'{args.kind}/{name}: reduced triangles lost an exterior extremity')
        budget=min(len(f),budget*2)
        if budget==len(f):
            return pack_part(p,n,c,f)
    value=mesh.read(attr['COLOR_0'])
    if value.dtype.kind=='f':
        value=np.rint(np.clip(value,0,1)*255)
    else:
        value=np.rint(value.astype('f4')*(255/np.iinfo(value.dtype).max))
    return pack_part(pos,mesh.read(attr['NORMAL']),value[:,:3],faces)


def textures(raw,base,out,prefix,shotgun,polymer=None):
    pbr=raw.material['pbrMetallicRoughness']
    base=base.copy()
    base.thumbnail((2048,2048),Image.Resampling.LANCZOS)
    base.save(out/(prefix+'.webp'),quality=95,method=5)
    detail=raw.image(raw.material['normalTexture']) if 'normalTexture' in raw.material else Image.new('RGB',(32,32),(128,128,255))
    detail.thumbnail((1024,1024),Image.Resampling.LANCZOS)
    if polymer is not None:
        detail=Image.composite(Image.new('RGB',detail.size,(128,128,255)),detail,polymer.resize(detail.size))
    detail.save(out/(prefix+'-normal.webp'),quality=94,method=4)
    finish=raw.image(pbr['metallicRoughnessTexture']) if 'metallicRoughnessTexture' in pbr else Image.new('RGB',(32,32),'white')
    finish.thumbnail((1024,1024),Image.Resampling.LANCZOS)
    orm=np.asarray(finish).copy()
    orm[:,:,1]=np.clip(orm[:,:,1]*pbr.get('roughnessFactor',1),103,240)
    orm[:,:,2]=np.clip(orm[:,:,2]*pbr.get('metallicFactor',1),0,160)
    if polymer is not None:
        weight=np.asarray(polymer.resize(finish.size))/255
        orm[:,:,1]=np.clip(orm[:,:,1]*.45+130+weight*29,153,234)
        orm[:,:,2]=np.clip(orm[:,:,2]*(1-weight)*.41+4,4,67)
    Image.fromarray(orm).save(out/(prefix+('-finish' if shotgun else '-orm')+'.webp'),lossless=True,method=3)


def borrowed_magazine(args,record,side,q):
    # A photograph with an empty mount can share the removable prop from another
    # finished photo scan. All three game LODs and the atlas use that same donor.
    donor=record['source']
    js=(args.output/('armory-'+donor+'-data.js')).read_text()
    data=json.loads(js.split('=',1)[1].strip().removesuffix(';'))
    if not data.get('sourceSha256'):
        raise ValueError('A photo-derived donor has to be baked first')
    m=data['held']['magazine']
    def decode(key,dtype,cols):
        return np.frombuffer(base64.b64decode(m[key]),dtype=dtype).reshape(-1,cols)
    p=decode('positions','<i2',3).astype('f4')*.0001
    socket=np.median(q[np.argsort(np.sum((side-record['socket'])**2,axis=1))[:42]],axis=0)
    mouth=p[p[:,1]>np.quantile(p[:,1],.92)].mean(0)
    p=(p-mouth)*record['scale']+socket
    return (p,decode('normals','i1',3).astype('f4')/127,decode('uv','<u2',2).astype('f4')/65535,
            decode('colors','u1',3),decode('faces','<u2',3).astype('i4'),data['sourceSha256'])


def join_atlases(temp,output,prefix,donor):
    for suffix in ['','-orm','-normal']:
        fname=prefix+suffix+'.webp'
        with Image.open(temp/fname) as surface,Image.open(output/('armory-'+donor+suffix+'.webp')) as insert:
            width,height=surface.size;cut=width*3//4
            atlas=Image.new('RGB',surface.size)
            atlas.paste(surface.resize((cut,height),Image.Resampling.LANCZOS))
            atlas.paste(insert.resize((width-cut,height),Image.Resampling.LANCZOS),(cut,0))
        atlas.save(temp/fname,lossless=suffix=='-orm',quality=95,method=4)


def bake(args,data,record,*,authored_groups=None,write_maps=None,lod_colors=None):
    raw,p,n,uv,faces,side,lo,hi,base,digest=data
    if digest!=record['sourceSha256']:
        raise ValueError('Source GLB differs from the approved registration view')
    q,n=surface_fit(p,n,lo,hi,record)
    if authored_groups is None:
        n=soften_normals(n,faces)
    polymer=None
    if args.kind=='shotgun':
        stock_sides(q,n,side)
        polymer=polymer_map(uv,faces,side)
        pixels=np.asarray(base).astype('f4')
        grain=np.asarray(polymer.resize(base.size),dtype='f4')[:,:,None]/255
        dark=np.clip(pixels*(.90-.09*grain),0,255).astype('u1')
        base=Image.fromarray(dark)
    c=sample(base,uv)
    if record.get('replaceOptic'):
        # The game supplies one transparent reflex lens at this mount.
        # Remove just the closed optic represented in the source photograph.
        faces=faces[~in_polygon(side[faces].mean(1),record['replaceOptic'])]
    if record.get('omitStand'):
        faces=faces[~in_polygon(side[faces].mean(1),record['omitStand'])]
    for mask in record.get('extraMasks',[]):
        faces=faces[~in_polygon(side[faces].mean(1),mask)]
    groups=authored_groups if authored_groups is not None else split_parts(p,faces,side,record)
    donor=record.get('photoMagazine')
    if donor:
        dp,dn,du,dc,df,donor_hash=borrowed_magazine(args,donor,side,q)
        df+=len(q);groups['magazine']=df;faces=np.vstack((faces,df))
        q=np.vstack((q,dp));n=np.vstack((n,dn));c=np.vstack((c,dc))
        uv=np.vstack((uv*[.75,1],du*[.25,1]+[.75,0]))
    held={name:pack_part(q,n,c,f,uv) for name,f in groups.items()}
    paint=c if lod_colors is None else lod_colors
    preview={name:reduced_color(args,name,q,n,paint,f,max(36,round(LOD_BUDGET['preview']*len(f)/len(faces)))) for name,f in groups.items()}
    carried={'body':reduced_color(args,'carried',q,n,paint,faces,LOD_BUDGET['carried'])}
    asset={'sourceSha256':digest,'sourceTriangles':raw.triangles(),'completeExterior':True,'maps':record.get('maps',['normal','orm']),
           'held':held,'preview':preview,'carried':carried}
    if 'sourceCredit' in record:
        asset['sourceCredit']=record['sourceCredit']
    if donor:asset['magazineSourceSha256']=donor_hash
    if args.kind=='sniper':
        asset['contacts']={k:contact(q,groups['bolt'] if k=='bolt' else groups['body'],pt)
                           for k,pt in {'support':[-.036,-.052,-.400],'grip':[.024,-.070,.004],'bolt':[.097,.095,-.084]}.items()}
    if 'magazine' in groups:
        mag=q[groups['magazine']].reshape(-1,3)
        left=mag.min(0);center=(left+mag.max(0))*.5
        center[0]=left[0]+.002
        asset.setdefault('contacts',{})['magazine']=contact(q,groups['magazine'],center)
    shotgun=args.kind=='shotgun'
    prefix='dockline-shotgun' if shotgun else 'armory-'+args.kind
    args.output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output) as tmp:
        out=Path(tmp)
        if write_maps is None:textures(raw,base,out,prefix,shotgun,polymer)
        else:write_maps(out,prefix)
        if donor:join_atlases(out,args.output,prefix,donor['source'])
        (out/(prefix+'-data.js')).write_text('export const '+('shotgunData' if shotgun else 'assetData')+'='+json.dumps(asset,separators=(',',':'))+';\n',encoding='utf-8')
        generated=list(out.iterdir());replaced=[]
        try:
            for file in generated:
                target=args.output/file.name
                previous=None
                if target.exists():
                    previous=out/(file.name+'.previous')
                    shutil.copyfile(target,previous)
                os.replace(file,target)
                replaced.append((target,previous))
        except BaseException:
            for target,previous in reversed(replaced):
                if previous:os.replace(previous,target)
                else:target.unlink(missing_ok=True)
            raise
    print('Baked exterior',args.kind,{k:len(v) for k,v in groups.items()},flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['prepare','bake'])
    parser.add_argument('kind')
    parser.add_argument('source',type=Path)
    parser.add_argument('packer',type=Path)
    parser.add_argument('stage',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--fits',type=Path,default=HERE/'photo-fits.json')
    parser.add_argument('--reverse',action='store_true')
    args=parser.parse_args()
    record={}
    if args.operation=='bake':
        if not args.output:parser.error('bake needs --output')
        record=json.loads(args.fits.read_text())[args.kind]
        args.reverse=record.get('reverse',False)
    data=prepare(args)
    if args.operation=='prepare':proof(args,data)
    else:bake(args,data,record)
