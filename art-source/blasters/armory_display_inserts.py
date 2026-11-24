"""Construct flush cosmetic trim directly on existing Tripo-fitted display surfaces."""
import numpy as np

def crossed(profile,y):
    cuts=[]
    for a,b in zip(profile,np.roll(profile,-1,axis=0)):
        if min(a[0],b[0])<=y<max(a[0],b[0]):
            cuts.append(a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]))
    cuts.sort()
    return max(zip(cuts[::2],cuts[1::2]),key=lambda r:r[1]-r[0],default=(0,0))

def molded_surfaces(cm,palette,source,tree,samples,emit):
    for sign in [-1,1]:
        candidates=[]
        for face in cm.faces:
            if sign*face.normal.x<.91:continue
            points=np.array([v.co[:] for v in face.verts])
            if sign*np.median(points[:,0])<.012:continue
            sy,sz=np.ptp(points[:,1:],axis=0)
            if min(sy,sz)<.032 or max(sy,sz)<.077 or face.calc_area()<.0028:continue
            candidates.append((face.calc_area(),face,points))
        if not candidates:continue
        _,face,pts=max(candidates,key=lambda r:r[0])
        yz=pts[:,1:];lo=yz.min(0);hi=yz.max(0);sy,sz=hi-lo
        center=pts.mean(0);normal=np.array(face.normal[:]);nbase=palette[min(face.material_index,len(palette)-1)].astype(float)
        polymer=sy>sz*.77 or (nbase[0]>nbase[1]*1.21 and nbase[1]>nbase[2]*1.09)
        # Sample the source at each end. Only transfer its low-frequency relief:
        # the surface stays an intentional flat panel from every viewing angle.
        scan=[]
        for t in (.18,.5,.82):
            zone=center.copy();zone[2]=lo[1]+sz*t
            ids=[i for _,i,d in tree.find_n(zone,15)]
            scan.append(float(np.median(samples[ids,0])*sign))
        cy=lo[0]+(.46 if polymer else .56)*sy
        height=sy*(.55 if polymer else .42)
        ends=[]
        for y in [cy-height*.5,cy+height*.5]:
            l,r=crossed(yz,y)
            if r-l<sz*.28:break
            left=np.clip(.12+(scan[0]-scan[1])*.9,.065,.19)
            right=np.clip(.10+(scan[2]-scan[1])*.9,.065,.18)
            ends.append((l+(r-l)*left,r-(r-l)*right))
        if len(ends)!=2:continue
        y0,y1=cy-height*.5,cy+height*.5
        (l0,r0),(l1,r1)=ends
        width=min(r0-l0,r1-l1)
        if width<.038:continue
        chamfer=min(.006,width*.072,height*.19)
        outline=np.array([[y0,l0+chamfer],[y0,r0-chamfer],[y0+chamfer,r0],[y1-chamfer,r1],
                          [y1,r1-chamfer],[y1,l1+chamfer],[y1-chamfer,l1],[y0+chamfer,l0]])
        mid=outline.mean(0)
        def transform(loop,lift):
            yy,zz=loop.T
            xx=center[0]-(normal[1]*(yy-center[1])+normal[2]*(zz-center[2]))/normal[0]
            return np.column_stack([xx,yy,zz])+normal*lift
        def face_area(points):
            return np.cross(points[1]-points[0],points[2]-points[0])
        def poly(points,color,fn=None):
            if fn is None:fn=normal
            if np.dot(face_area(points),fn)<0:points=points[::-1]
            emit(points,fn,np.clip(color,12,221),source)
        def shell(loop,base,border,facec,level=.0024):
            inner=(loop-loop.mean(0))*[.91,.981]+loop.mean(0)
            out=transform(loop,base);inside=transform(inner,base+level)
            for k in range(len(loop)):
                j=(k+1)%len(loop);strip=np.array([out[k],out[j],inside[j],inside[k]])
                outward=face_area(strip)
                if np.dot(outward,normal)<0:outward*=-1
                outward/=max(1e-9,np.linalg.norm(outward))
                poly(strip,border,outward)
            poly(inside,facec)
        if polymer:
            body=nbase*.65+np.array([7,7,5]);trim=nbase*.93+13
            shell(outline,.0007,trim,body,.0020)
            for frac in [.28,.50,.72]:
                y=y0+height*frac
                le=(1-frac)*l0+frac*l1;ri=(1-frac)*r0+frac*r1
                a=le+(ri-le)*.19;b=ri-(ri-le)*.19
                slope=min(height*.07,(b-a)*.07);thick=min(.0019,height*.037)
                rib=np.array([[y-slope-thick,a],[y+slope-thick,b],[y+slope+thick,b],[y-slope+thick,a]])
                poly(transform(rib,.0030),body+14)
        else:
            body=nbase*.83+np.array([1,5,6]);trim=nbase*1.08+20
            shell(outline,.0008,trim,body)
            if width>.097:
                # Recess and bright lower lip are distinct even in the software renderer.
                stripe=np.array([[cy-height*.10,l0+width*.25],[cy-height*.10,l0+width*.64],
                    [cy-height*.015,l0+width*.67],[cy-height*.015,l0+width*.25]])
                poly(transform(stripe,.00332),body*.60+3)
            rad=min(.0049,height*.18,width*.062)
            for frac in ([.12,.88] if width>.10 else [.5]):
                yy=cy;zz=(l0+l1)*.5+width*frac
                angle=np.linspace(0,2*np.pi,12,endpoint=False)
                loop=np.column_stack([yy+rad*np.sin(angle),zz+rad*np.cos(angle)])
                shell(loop,.00335,trim+14,body*.63+2,.0006)
                slot=np.array([[yy-rad*.22,zz-rad*.54],[yy-rad*.22,zz+rad*.46],
                               [yy+rad*.15,zz+rad*.54],[yy+rad*.15,zz-rad*.46]])
                poly(transform(slot,.00401),body+10)
