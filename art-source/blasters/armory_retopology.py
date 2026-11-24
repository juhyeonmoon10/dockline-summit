"""Rebuild clean, bevelled game-display shells and repaint them from the Tripo export.

The native cage preserves contacts, animated parts and optics. Each connected shell
is measured against the Tripo surface before beveling. Its broad faces receive a
new finish, sampled from the original base colour, deliberately excluding baked
directional highlights. All three LODs share the new silhouette and paint.
"""
import base64, json, shutil, subprocess, os, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from armory_carried import simplify_preview

HERE=Path(__file__).resolve().parent
ATLAS=1024
PAIRS=[(2,1),(2,0),(0,1)]

def prepare_samples(kind,reduced,calibration,raw,stage,apply_fit):
    pos,nor,uv,f=reduced.surface()
    p=apply_fit(pos,calibration)
    base=np.asarray(raw.image(raw.material['pbrMetallicRoughness']['baseColorTexture']))
    def color(uvs):
        u,v=(uvs*np.array([base.shape[1],base.shape[0]])).astype(int).T
        return base[np.mod(v,base.shape[0]),np.mod(u,base.shape[1])]
    samples=np.vstack([p,p[f].mean(1)])
    colors=np.vstack([color(uv),color(uv[f].mean(1))])
    np.savez_compressed(stage/(kind+'-samples.npz'),p=samples,rgb=colors)
    return samples,colors

class SourceProjection:
    def __init__(self,points,colors):
        self.lo=points.min(0);self.hi=points.max(0)
        self.fields={}
        for axis,axes in enumerate(PAIRS):
            d=(points[:,axes]-self.lo[list(axes)])/(self.hi[list(axes)]-self.lo[list(axes)])
            w,h=320,192
            x,y=np.rint(d*[w-1,h-1]).astype(int).T
            key=y*w+x
            for sign in [-1,1]:
                depth=sign*points[:,axis];maximum=np.full(w*h,-100.)
                np.maximum.at(maximum,key,depth)
                use=depth>maximum[key]-.009
                count=np.bincount(key[use],minlength=w*h).reshape(h,w).astype('f4')
                grid=np.stack([np.bincount(key[use],weights=colors[use,i],minlength=w*h).reshape(h,w) for i in range(3)],axis=-1)
                # Pull neighbouring colour across empty grid cells, without reusing
                # the generated triangular brightness or normal patterns.
                image=np.asarray(Image.fromarray(np.uint8(np.clip(grid/np.maximum(count[:,:,None],1),0,255))).filter(ImageFilter.GaussianBlur(2.2))).astype('f4')
                density=np.asarray(Image.fromarray(np.uint8((count>0)*255)).filter(ImageFilter.GaussianBlur(2.2))).astype('f4')/255.
                self.fields[axis,sign]=image/np.maximum(density[:,:,None],.03)
    def get(self,axis,sign,a,b):
        i,j=PAIRS[axis];img=self.fields[axis,sign]
        x=np.clip(np.rint((a-self.lo[i])/(self.hi[i]-self.lo[i])*(img.shape[1]-1)).astype(int),0,img.shape[1]-1)
        y=np.clip(np.rint((b-self.lo[j])/(self.hi[j]-self.lo[j])*(img.shape[0]-1)).astype(int),0,img.shape[0]-1)
        return img[y,x]

def coating(guide,scan,field):
    guide=np.asarray(guide,dtype='f4');scan=np.asarray(scan,dtype='f4')
    # Use source chroma and medium value for the coating. Retain the local cage
    # material separation of grip inserts, brushed trims, recesses and pins.
    source_lum=scan.mean(axis=-1,keepdims=True);g=guide.mean(axis=-1,keepdims=True)
    chroma=np.clip(scan-source_lum,-43,43)
    lum=np.clip(.70*g+.30*source_lum,21,184)
    field_lum=field.mean(axis=-1,keepdims=True)
    local=np.where(field_lum>15,np.clip((field_lum-source_lum)*.13,-5,5),0)
    local_hue=np.where(field_lum>15,np.clip((field-field_lum-chroma)*.22,-7,7),0)
    return np.clip(lum+(guide-g)*.84+chroma*.60+local+local_hue,13,212)

def projected_chart_mesh(d):
    p,n,f=d['p'],d['n'],d['f']
    tr=p[f];fn=np.cross(tr[:,1]-tr[:,0],tr[:,2]-tr[:,0]);area=np.linalg.norm(fn,axis=1)
    keep=area>1e-12; f=f[keep];fn=fn[keep];area=area[keep]
    axis=np.argmax(abs(fn),axis=1)
    sign=np.where(fn[np.arange(len(f)),axis]<0,-1,1)
    k=np.column_stack([d['group'][f[:,0]],d['guide'][f[:,0]],axis,sign])
    keys,owners=np.unique(k,axis=0,return_inverse=True)
    owners=owners.reshape(-1);charts=[]
    for j,(group,r,g,b,a,side) in enumerate(keys):
        idx=np.flatnonzero(owners==j);points=p[f[idx]][:,:,PAIRS[a]]
        low=points.min((0,1));high=points.max((0,1))
        largest=idx[np.argmax(area[idx])]
        center=p[f[largest]].mean(0)[list(PAIRS[a])]
        charts.append(dict(axis=a,side=side,idx=idx,lo=low,hi=high,ref=f[idx[0],0],center=center,area=area[idx].sum()))
    return f,charts

def pack_charts(charts):
    # Independent face groups keep the receiver, grip and edge trims apart at
    # every mip level. Chart gutters are filled by extending the same finish.
    best=None;lo,hi=25,5000
    for _ in range(14):
        density=(lo+hi)/2;rects=[]
        for j,c in enumerate(charts):
            w,h=np.maximum(2,np.ceil((c['hi']-c['lo'])*density).astype(int))+6
            rects.append((int(w),int(h),j))
        rects.sort(key=lambda r:(-r[1],-r[0],r[2]))
        x=y=row=0;packed={}
        for w,h,j in rects:
            if w>ATLAS:break
            if x+w>ATLAS:x=0;y+=row;row=0
            if y+h>ATLAS:break
            packed[j]=(x,y,w,h);x+=w;row=max(row,h)
        if len(packed)==len(charts):best=packed;lo=density
        else:hi=density
    if best is None:raise ValueError('Atlas too small for number of chart islands')
    return best

def finish(guide,scan):
    r,g,b=np.asarray(guide,float)
    if r>g*1.18 and g>b*1.12:return (.64,.12)
    if max(guide)-min(guide)>20:return (.61,.24)
    if np.mean(guide)<57:return (.69,.16)
    if np.mean(guide)>113:return (.37,.68)
    return (.48,.49)

def mark_chart(base,rough,normal,pos,guide,kind):
    """Low-contrast asset marks and inset heads are tiny relative to the casting."""
    image=Image.fromarray(base);draw=ImageDraw.Draw(image)
    orm=Image.fromarray(rough);od=ImageDraw.Draw(orm)
    relief=Image.fromarray(normal);nd=ImageDraw.Draw(relief)
    x,y,t=pos
    ink=tuple(np.clip(np.asarray(guide)*.68+87,0,205).astype(int))
    shade=tuple(np.clip(np.asarray(guide)*.57,7,180).astype(int))
    edge=tuple(np.clip(np.asarray(guide)+15,0,205).astype(int))
    radius=max(2,round(t*.36))
    for cx in [x-round(t*1.15),x+round(t*2.9)]:
        cy=y+round(t*.15); bounds=(cx-radius,cy-radius,cx+radius,cy+radius)
        draw.ellipse(bounds,fill=shade,outline=edge,width=1)
        draw.line((cx-radius*.51,cy+radius*.22,cx+radius*.51,cy-radius*.22),fill=tuple(np.maximum(7,np.array(shade)-15)))
        nd.arc(bounds,30,190,fill=(144,137,250),width=1)
        od.ellipse(bounds,fill=(255,124,113))
    # A short factory-style asset number has readable letter spacing at inspect
    # distance. Drawing in the individual's planar chart keeps grips and tubes clean.
    try:font=ImageFont.truetype('DejaVuSans.ttf',max(6,round(t*.8)))
    except OSError:font=ImageFont.load_default(size=max(6,round(t*.8)))
    stamp={'rifle':'R 41','sniper':'L 07','burst':'T 03','smg':'V 19','lmg':'B 06','pistol':'P 12','revolver':'M 36','marksman':'D 24'}[kind]
    draw.text((x,y),stamp,font=font,fill=ink,anchor='lm')
    return np.asarray(image),np.asarray(orm),np.asarray(relief)

def packed(p,n,c,f,uv=None):
    buf=lambda a:base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    result={'positions':buf(np.rint(p*10000).astype('<i2')),'normals':buf(np.rint(np.clip(n,-1,1)*127).astype('i1')),
        'colors':buf(np.rint(c).astype('u1')),'faces':buf(f.astype('<u2'))}
    if uv is not None:result['uv']=buf(np.rint(np.clip(uv,0,1)*65535).astype('<u2'))
    return result

def write_finish(kind,stage,output,field,seat):
    d=np.load(stage/(kind+'-retopo-held.npz'));p=d['p'];n=d['n'];f,charts=projected_chart_mesh(d)
    layout=pack_charts(charts)
    atlas=np.full((ATLAS,ATLAS,3),68,np.uint8);orm=np.empty_like(atlas);orm[:]=[255,152,67]
    normal=np.empty_like(atlas);normal[:]=[128,128,255]
    pv=[];nv=[];cv=[];tv=[];ff=[];offset=0
    rng=np.random.default_rng(571)
    # Choose a substantial, visible side for the maker's mark on both flank views.
    marked=set()
    for sign in [-1,1]:
        eligible=[(j,c) for j,c in enumerate(charts) if c['axis']==0 and c['side']==sign and (c['hi']-c['lo'])[0]>.1 and (c['hi']-c['lo'])[1]>.035]
        if eligible:
            marked.add(max(eligible,key=lambda e:e[1]['area'])[0])
    for j,c in enumerate(charts):
        x,y,w,h=layout[j];width=max(1,w-7);height=max(1,h-7)
        lo,hi=c['lo'],c['hi'];range_=np.maximum(hi-lo,1e-7)
        aa,bb=np.meshgrid(lo[0]+(np.arange(w)-3)*range_[0]/width,lo[1]+(np.arange(h)-3)*range_[1]/height)
        guide,scan=d['guide'][c['ref']],d['source'][c['ref']]
        sampled=field.get(c['axis'],c['side'],aa,bb)
        coat=coating(guide,scan,sampled)
        grain=rng.normal(0,.72,(h,w,1))
        coat=np.uint8(np.clip(coat+grain,0,255))
        roughness,metal=finish(guide,scan)
        finishmap=np.empty_like(coat);finishmap[:,:,0]=255
        finishmap[:,:,1]=np.uint8(np.clip(255*roughness+grain[:,:,0]*2.2,0,255));finishmap[:,:,2]=round(255*metal)
        bump=np.zeros_like(coat);bump[:]=[128,128,255]
        if j in marked and w>55 and h>15:
            coord=np.clip((c['center']-lo)/range_,0,1)*[width,height]+3
            scale=min(13,max(5,min(w*.052,h*.18)))
            cx=np.clip(coord[0],2*scale,w-4.2*scale);cy=np.clip(coord[1],scale,h-scale)
            # Correct the text orientation in the source chart (+vertical points down in glTF UV).
            lab,internal,detail=mark_chart(coat[::-1].copy(),finishmap[::-1].copy(),bump[::-1].copy(),(cx,h-1-cy,scale),coat[h//2,w//2],kind)
            coat=lab[::-1];finishmap=internal[::-1];bump=detail[::-1]
        atlas[y:y+h,x:x+w]=coat;orm[y:y+h,x:x+w]=finishmap;normal[y:y+h,x:x+w]=bump
        ids,idx=np.unique(f[c['idx']],return_inverse=True)
        points=p[ids];xy=points[:,PAIRS[c['axis']]]
        local=(xy-lo)/range_*[width,height]+[3,3]
        u,v=np.clip(np.rint(local).astype(int),[0,0],[w-1,h-1]).T
        pv.append(points);nv.append(n[ids]);cv.append(coat[v,u]);tv.append((local+[x+.5,y+.5])/ATLAS)
        ff.append(idx.reshape(-1,3)+offset);offset+=len(ids)
    p=np.vstack(pv);n=np.vstack(nv);c=np.vstack(cv);uv=np.vstack(tv);f=np.vstack(ff)
    def contact(p,f):
        if kind=='sniper':
            for anchor in [[-.036,-.052,-.400],[.024,-.070,.004]]:seat(p,f,anchor)
    contact(p,f)
    assets=output/('armory-'+kind+'-data.js')
    data={'maps':['normal','orm']}
    if len(p)>=65536:raise ValueError('Mesh exceeds 16-bit vertex budget')
    data['held']={'body':packed(p,n,c,f,uv)}
    d=np.load(stage/(kind+'-retopo-preview.npz'));p=d['p'];n=d['n'];f=d['f'];scan=d['source']
    c=coating(d['guide'],scan,scan);contact(p,f)
    data['preview']={'body':packed(p,n,c,f)}
    guide=json.loads((stage/(kind+'-guide.json')).read_text())
    data['carried']={'body':packed(*simplify_preview(d,c,guide,kind))}
    for plane,fn,kw in [(atlas,'',{'quality':93}),(orm,'-orm',{'lossless':True}),(normal,'-normal',{'lossless':True})]:
        Image.fromarray(plane).save(output/('armory-'+kind+fn+'.webp'),method=4,**kw)
    assets.write_text('export const assetData='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')

def publish_finish(kind,stage,output,field,seat):
    output.mkdir(parents=True,exist_ok=True)
    # Build the complete set before publishing. Roll back existing assets on
    # replacement errors; the previous release remains usable after a failed run.
    with tempfile.TemporaryDirectory(dir=output) as local:
        ready=Path(local);write_finish(kind,stage,ready,field,seat)
        changes=sorted(ready.glob('armory-*'));published=[]
        try:
            for src in changes:
                dst=output/src.name;backup=None
                if dst.exists():
                    backup=ready/(src.name+'.previous');shutil.copyfile(dst,backup)
                src.replace(dst);published.append((dst,backup))
        except BaseException:
            for dst,backup in reversed(published):
                if backup:backup.replace(dst)
                else:dst.unlink(missing_ok=True)
            raise

def rebuild(kind,stage,output,reduced,cal,source,fit,seat):
    stage=Path(stage).resolve()
    p,c=prepare_samples(kind,reduced,cal,source,stage,fit)
    subprocess.run(['node',str(HERE/'export-armory-guides.mjs'),kind,str(stage/(kind+'-guide.json'))],check=True)
    blender=os.environ.get('BLENDER_BIN') or shutil.which('blender')
    if not blender:
        paths=sorted(Path('C:/Program Files/Blender Foundation').glob('Blender */blender.exe'))
        if not paths:raise RuntimeError('Set BLENDER_BIN to a Blender executable')
        blender=str(paths[-1])
    subprocess.run([blender,'-b','--factory-startup','-t','2','--python-exit-code','1','-P',str(HERE/'retopo-armory-blender.py'),'--',kind,str(stage)],check=True)
    publish_finish(kind,stage,output,SourceProjection(p,c),seat)
