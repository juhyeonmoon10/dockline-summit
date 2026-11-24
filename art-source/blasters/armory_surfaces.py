"""Restore the broad painted panels on three image-derived game cosmetics."""
import base64
import io
import numpy as np
from PIL import Image

# Panels use the same gun-local coordinates as the engine's held models.
# Each entry is left, right, bottom, top in longitudinal / vertical coordinates.
PANELS={
    'rifle':[(-.376,.068,-.014,.124),(.069,.233,-.026,.094)],
    'sniper':[(-.568,-.122,-.051,.103),(-.160,.016,-.023,.099)],
    'burst':[(-.455,-.277,.002,.079)],
}

def raster(points,width,height):
    a,b,c=points
    u=b-a;v=c-a
    det=u[0]*v[1]-v[0]*u[1]
    if abs(det)<1e-7:return None
    lo=np.maximum(np.floor(points.min(0)).astype(int),0)
    hi=np.minimum(np.ceil(points.max(0)).astype(int),[width-1,height-1])
    if np.any(hi<lo):return None
    y,x=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
    dx=x-a[0];dy=y-a[1]
    s=(v[1]*dx-v[0]*dy)/det;t=(u[0]*dy-u[1]*dx)/det
    inside=(s>=-.002)&(t>=-.002)&(s+t<=1.002)
    return y[inside],x[inside],s[inside],t[inside]

class Panels:
    def __init__(self,kind,record):
        self.kind=kind;self.regions=PANELS[kind];self.origin=[record['z'],record['y']];self.step=record['step']
        with np.load(io.BytesIO(base64.b64decode(record['samples']))) as data:
            self.depth=data['depth'].astype('f4')*.0001
            self.rgb=data['rgb']
        self.dy,self.dz=np.gradient(self.depth,self.step,axis=(1,2))
        if kind=='burst':
            # Three dark painted vents in the source became spikes in the
            # reconstruction. Recover the intact side panel around their edges.
            yy,zz=np.indices(self.depth.shape[1:]);zz=zz*self.step+self.origin[0];yy=yy*self.step+self.origin[1]
            around=(zz>-.440)&(zz<-.29)&(yy>.016)&(yy<.068)
            self.gauge=[float(np.median(side[around&(side>.032)])) for side in self.depth]
            self.ventpaint=[np.median(side[around&(side[:,:,0]>side[:,:,1]+4)],axis=0) for side in self.rgb]

    def sample(self,p):
        loc=np.rint((p[:,[2,1]]-self.origin)/self.step).astype(int)
        iz=np.clip(loc[:,0],0,self.depth.shape[2]-1);iy=np.clip(loc[:,1],0,self.depth.shape[1]-1)
        side=(p[:,0]>0).astype(int);sign=2*side-1
        depth=self.depth[side,iy,iz]
        ry=self.dy[side,iy,iz];rz=self.dz[side,iy,iz]
        def smooth(t):
            t=np.clip(t,0,1);return t*t*(3-2*t)
        blend=np.zeros(len(p),'f4')
        for left,right,bottom,top in self.regions:
            edge=np.minimum.reduce([p[:,2]-left,right-p[:,2],p[:,1]-bottom,top-p[:,1]])
            blend=np.maximum(blend,smooth(edge/.011))
        if self.kind=='burst':
            target=np.asarray(self.gauge)[side]
            blend*=smooth((depth-.012)/.012)*smooth((abs(p[:,0])-.024)/.018)
            n=np.column_stack((sign,np.zeros(len(p)),np.zeros(len(p))))
            paint=np.asarray(self.ventpaint)[side].astype('f4')
            # Lay the three original graphic dashes back into the albedo. Their
            # broad plate now stays flush as the player turns it under the light.
            for center in [-.416,-.367,-.318]:
                dash=(abs(p[:,2]-center-.40*(p[:,1]-.041))<.0055)&(abs(p[:,1]-.041)<.013)
                paint[dash]*=.55
            return blend,sign*target,n,np.rint(paint).astype('u1')
        blend*=smooth((depth-.013)/.009)*smooth((abs(p[:,0])/np.maximum(.001,depth)-.42)/.39)
        blend*=smooth((1.45-np.maximum(abs(ry),abs(rz)))/.76)
        blend*=smooth((.058-abs(abs(p[:,0])-depth))/.018)
        n=np.column_stack((sign,-ry,-rz))
        n/=np.maximum(1e-8,np.linalg.norm(n,axis=1,keepdims=True))
        return blend,sign*depth,n,self.rgb[side,iy,iz]

    def flatten(self,p,n):
        w,target,new_normal,_=self.sample(p)
        p[:,0]+=(target-p[:,0])*w*.98
        normal=n*(1-.98*w[:,None])+new_normal*(.98*w[:,None])
        normal/=np.maximum(1e-8,np.linalg.norm(normal,axis=1,keepdims=True))
        return normal

    def repaint(self,pos,uv,faces,images):
        result=images.copy();w,_,_,color=self.sample(pos)
        size=images['base'].width
        layer=np.zeros((size,size),'f4');paint=np.zeros((size,size,3),'u1')
        xy=uv*size-.5
        for f in faces[np.max(w[faces],axis=1)>.004]:
            area=raster(xy[f],size,size)
            if area is None:continue
            y,x,s,t=area;a,b,c=f
            blend=w[a]+s*(w[b]-w[a])+t*(w[c]-w[a])
            incoming=blend>layer[y,x]
            if not incoming.any():continue
            y,x,s,t,blend=(arr[incoming] for arr in (y,x,s,t,blend))
            layer[y,x]=blend
            colors=color[f].astype('f4')
            paint[y,x]=np.rint(np.clip(colors[0]+s[:,None]*(colors[1]-colors[0])+t[:,None]*(colors[2]-colors[0]),0,255))
        # Extend the blend two texels into atlas padding for distant mip levels.
        for _ in range(2):
            old=layer.copy()
            for axis,d in [(0,1),(0,-1),(1,1),(1,-1)]:
                rolled=np.roll(old,d,axis);take=(layer<.001)&(rolled>.08)
                layer[take]=rolled[take];paint[take]=np.roll(paint,d,axis)[take]
        alpha=np.clip(layer,0,1)[:,:,None]
        image=np.asarray(images['base']).astype('f4')
        noise=np.random.default_rng(737).normal(0,.8,(size,size,1))
        target=np.clip(paint.astype('f4')*.90+image*.075+noise,0,255)
        result['base']=Image.fromarray(np.rint(image*(1-alpha*.97)+target*(alpha*.97)).astype('u1'))
        if 'normal' in images:
            source=np.asarray(images['normal']).astype('f4')
            result['normal']=Image.fromarray(np.rint(source*(1-alpha*.985)+np.array([128,128,255])*(alpha*.985)).astype('u1'))
        if 'orm' in images:
            raw=np.asarray(images['orm']).astype('f4')
            a=np.asarray(Image.fromarray(np.rint(layer*255).astype('u1')).resize(images['orm'].size,Image.Resampling.BILINEAR))/255
            raw[:,:,1]=raw[:,:,1]*(1-a*.85)+185*a*.85
            raw[:,:,2]=raw[:,:,2]*(1-a*.75)+77*a*.75
            result['orm']=Image.fromarray(np.rint(raw).astype('u1'))
        return result
