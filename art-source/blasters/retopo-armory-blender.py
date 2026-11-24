"""Fit the clean display cage to calibrated Tripo surface samples; run inside Blender."""
import json, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import kdtree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from armory_display_inserts import molded_surfaces

kind,stage=sys.argv[sys.argv.index('--')+1:]
stage=Path(stage)
sample=np.load(stage/(kind+'-samples.npz'))
sp=sample['p']
tree=kdtree.KDTree(len(sp))
for i,p in enumerate(sp):
    tree.insert(p,i)
tree.balance()
guides=json.loads((stage/(kind+'-guide.json')).read_text())
positions=[];normals=[];colors=[];source_colors=[];groups=[];faces=[]
component=0

def partitions(points,faces):
    """Weld UV/normal seams, leaving touching shapes with separate face materials."""
    coords,index=np.unique(np.rint(points*1e6).astype(int),axis=0,return_inverse=True)
    index=index.reshape(-1)
    parent=list(range(len(coords)))
    def root(a):
        while a!=parent[a]:
            parent[a]=parent[parent[a]]
            a=parent[a]
        return a
    tri=index[faces]
    for a,b,c in tri:
        parent[root(a)]=root(b)
        parent[root(c)]=root(b)
    owners=np.array([root(a) for a in tri[:,0]])
    return [np.flatnonzero(owners==i) for i in np.unique(owners)]

def fitted_piece(p):
    # Position and thickness are measured once per piece. A bent or triangulated
    # highlight on the scan cannot bend a nominally planar casting.
    lo=p.min(0);hi=p.max(0);mid=(lo+hi)*.5;size=hi-lo
    delta=[];raw=[]
    reps=np.unique(np.rint(p*1e4).astype(int),axis=0)*.0001
    for pt in reps:
        near=tree.find_n(pt,7)
        ids=[i for _,i,d in near]
        delta.append(np.median(sp[ids],axis=0)-pt)
        raw.extend(ids)
    delta=np.asarray(delta)
    size=np.maximum(size,1e-4)
    shift=np.clip(np.median(delta,axis=0)*.43,[-.003,-.003,-.004],[.003,.003,.004])
    scale=np.ones(3)
    for j in range(3):
        upper=delta[reps[:,j]>mid[j]+size[j]*.16,j]
        lower=delta[reps[:,j]<mid[j]-size[j]*.16,j]
        if len(upper) and len(lower):
            adjustment=(np.median(upper)-np.median(lower))*.64
            scale[j]+=np.clip(adjustment/size[j],-.16,.19)
    return (p-mid)*scale+mid+shift, np.median(sample['rgb'][raw],axis=0)

def emit(part):
    global component
    if part['action']:return
    pp=np.asarray(part['points']).reshape(-1,3); tri=np.asarray(part['faces']).reshape(-1,3)
    rgb=np.asarray(part['rgb']).reshape(-1,3)
    for elements in partitions(pp,tri):
        ts=tri[elements];used,ind=np.unique(ts,return_inverse=True)
        src=pp[used];pts,surface=fitted_piece(src)
        palette,inverse=np.unique(np.rint(rgb[ts].mean(1)).astype(int),axis=0,return_inverse=True)
        cm=bmesh.new();verts={}; ids=[]
        for pt in pts:
            k=tuple(np.rint(pt*1e6))
            if k not in verts:verts[k]=cm.verts.new(pt)
            ids.append(verts[k])
        for vs,col in zip(ind.reshape(-1,3),inverse.reshape(-1)):
            vs=[ids[x] for x in vs]
            if len(set(vs))<3:continue
            try:f=cm.faces.new(vs)
            except ValueError:continue
            f.material_index=int(col)
        if not cm.faces:
            cm.free();continue
        cm.normal_update()
        bmesh.ops.dissolve_limit(cm,angle_limit=.002,verts=list(cm.verts),edges=list(cm.edges),delimit={'MATERIAL'})
        cm.normal_update()
        def append_trim(vs,n,color,raw):
            first=len(positions)
            for v in vs:
                positions.append(v);normals.append(n);colors.append(color);source_colors.append(raw)
                groups.append(component)
            for j in range(1,len(vs)-1):
                faces.append([first,first+j,first+j+1])
        molded_surfaces(cm,palette,surface,tree,sp,append_trim)
        edges=[e for e in cm.edges if e.is_manifold and e.calc_face_angle(0)>.49]
        side=np.ptp(pts,axis=0); width=min(.0034,max(.00015,min(side)*.061))
        if high and len(edges) and min(side)>.0015:
            bmesh.ops.bevel(cm,geom=edges,offset=width,segments=3,affect='EDGES',clamp_overlap=True)
        cm.normal_update()
        # Weighted corner normals keep long flat panels flat yet roll the light
        # around narrow bevels, grilles and exposed cylinder rims.
        normal_at={}
        face_areas={f:max(1e-14,f.calc_area())**.62 for f in cm.faces}
        for f in cm.faces:
            for v in f.verts:
                candidate=[o for o in v.link_faces if f.normal.dot(o.normal)>.795]
                value=sum((o.normal*face_areas[o] for o in candidate),f.normal*0.)
                value.normalize();normal_at[v,f]=tuple(value)
        cm.verts.index_update();cm.faces.index_update()
        mesh=bpy.data.meshes.new('display-piece');cm.to_mesh(mesh);mesh.calc_loop_triangles()
        vn=list(cm.verts);fn=list(cm.faces)
        output_indices={}
        for t in mesh.loop_triangles:
            f=fn[t.polygon_index];out=[]
            for j in t.vertices:
                v=vn[j];normal=normal_at.get((v,f),tuple(f.normal))
                mat=min(f.material_index,len(palette)-1)
                key=(j,mat,tuple(round(c,4) for c in normal))
                if key not in output_indices:
                    output_indices[key]=len(positions)
                    positions.append(tuple(v.co));normals.append(normal);colors.append(palette[mat])
                    source_colors.append(surface);groups.append(component)
                out.append(output_indices[key])
            faces.append(out)
        bpy.data.meshes.remove(mesh);cm.free();component+=1

for high,lod in [(True,'held'),(False,'preview')]:
    for part in guides:emit(part)
    np.savez_compressed(stage/(kind+'-retopo-'+lod+'.npz'),p=np.asarray(positions,'f4'),n=np.asarray(normals,'f4'),
        guide=np.asarray(colors,'u1'),source=np.asarray(source_colors,'u1'),group=np.asarray(groups),
        f=np.asarray(faces,'i4'))
    print(kind,lod,len(positions),'vertices',len(faces),'triangles',component,'authored shells')
    positions.clear();normals.clear();colors.clear();source_colors.clear();groups.clear();faces.clear();component=0
