"""Build a small third-person model from the fitted preview and its native actions."""
import numpy as np

def simplify_preview(mesh,paint,guide,kind):
    points=[mesh['p']];normals=[mesh['n']];colours=[paint];faces=[mesh['f']];groups=[mesh['group']]
    offset=len(points[0]);group=int(groups[0].max())+1
    for part in guide:
        if not part['action']:continue
        # The software renderer draws its animated revolver cylinder separately.
        if kind=='revolver' and part['name'] not in ('hammer','iron-sights'):continue
        p=np.asarray(part['points']).reshape(-1,3)
        points.append(p);normals.append(np.asarray(part['normals']).reshape(-1,3))
        colours.append(np.asarray(part['rgb']).reshape(-1,3));groups.append(np.full(len(p),group))
        faces.append(np.asarray(part['faces']).reshape(-1,3)+offset)
        offset+=len(p);group+=1
    p=np.vstack(points);n=np.vstack(normals);c=np.vstack(colours);g=np.concatenate(groups);f=np.vstack(faces)
    # Merge points inside a single piece only. Independent narrow sights,
    # magazine gaps and trim pieces survive the small third-person budget.
    def reduce(step):
        cell=np.floor(p/(step*np.array([.72,1.,1.]))+.5).astype(int)
        _,owner=np.unique(np.column_stack([g,cell]),axis=0,return_inverse=True)
        owner=owner.reshape(-1);count=np.bincount(owner)
        def avg(arr):
            return np.column_stack([np.bincount(owner,weights=arr[:,j])/count for j in range(3)])
        pts=avg(p);tri=owner[f]
        keep=(tri[:,0]!=tri[:,1])&(tri[:,0]!=tri[:,2])&(tri[:,1]!=tri[:,2]);tri=tri[keep]
        _,first=np.unique(np.sort(tri,axis=1),axis=0,return_index=True);tri=tri[np.sort(first)]
        used,ind=np.unique(tri,return_inverse=True)
        norm=avg(n)[used];norm/=np.maximum(1e-8,np.linalg.norm(norm,axis=1,keepdims=True))
        return pts[used],norm,avg(c)[used],ind.reshape(-1,3)
    step=.002
    while True:
        out=reduce(step)
        if len(out[-1])<=1080: return out
        step*=1.12
