"""Blender background bake: blender -b -P bake-lite.py -- customs-guard.glb customs-guard.lite.bin [existing.lite.bin]

The output contains indexed triangles, one sampled sRGB colour per face and five
clips of millimetre coordinates. The last vertex of every pose is the right grip.
An ARM1 extension stores actual arm skin weights and the sampled shoulder pivot,
so software-rendered sniper arms can follow aim without moving the torso/legs.
Blender +Y here becomes local +Z after the arena's half turn; its +X becomes -X.
"""
import math
from pathlib import Path
import struct
import sys

import bpy
import bmesh
import numpy as np
from mathutils.bvhtree import BVHTree

arguments = [Path(p).resolve() for p in sys.argv[sys.argv.index('--')+1:]]
if len(arguments) not in (2,3): raise RuntimeError('Expected source, destination and optional existing atlas')
src,dst=arguments[:2]
basis=arguments[2].read_bytes() if len(arguments)==3 else None
clips = [('Idle_Shoot',4),('Run_Gun',10),('Jump_Idle',5),('Duck',4),('Punch',7)]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = max((o for o in scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
hand = next(b for b in rig.pose.bones if b.name.replace('.','').replace('_','') == 'Index1R')
left_hand=next(b for b in rig.pose.bones if b.name.replace('.','').replace('_','')=='Index1L')
shoulders = [b for b in rig.pose.bones if b.name.replace('.','').replace('_','') in ('ShoulderL','ShoulderR')]
if len(shoulders) != 2: raise RuntimeError('Missing aiming shoulder bones')
arm_bones = {b.name for shoulder in shoulders for b in [shoulder, *shoulder.children_recursive]}
anim = rig.animation_data
actions = {}
for track in anim.nla_tracks:
    for strip in track.strips:
        if strip.action:
            for name,_ in clips:
                if name in (track.name,strip.name,strip.action.name) or strip.action.name.endswith('|'+name):
                    actions[name] = (strip.action, strip.action_slot)
    track.mute = True
for name,_ in clips:
    if name not in actions:
        action = next((a for a in bpy.data.actions if a.name == name or a.name.endswith('|'+name)),None)
        if action: actions[name] = (action,action.slots[0] if action.slots else None)
    if name not in actions: raise RuntimeError('Missing motion '+name)
anim.use_nla = False
anim.action = None

# Keep the full rest mesh as a sampler. Projection back onto the original mesh
# avoids colour bleed across cut UV islands after reduction, especially at eyes.
original = mesh.data.copy()
original.calc_loop_triangles()
hi_tri = list(original.loop_triangles)
hi_coords = [v.co.copy() for v in original.vertices]
tree = BVHTree.FromPolygons(hi_coords,[t.vertices[:] for t in hi_tri],all_triangles=True)
texels = {}
materials = []
for mat in original.materials:
    node = next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.node_tree else None
    base = node.inputs['Base Color'] if node else None
    link = base.links[0].from_node if base and base.is_linked else None
    image = link.image if link and link.type=='TEX_IMAGE' else None
    if image and image.name not in texels:
        w,h = image.size
        data = np.empty(w*h*4,dtype=np.float32)
        image.pixels.foreach_get(data)
        texels[image.name] = data.reshape(h,w,4)[:,:,:3]
    color = list(base.default_value[:3]) if base else [.4,.4,.4]
    materials.append((image.name if image else None,np.array(color)))
uv_layer = original.uv_layers.active

def sample(point):
    hit,_,idx,_ = tree.find_nearest(point)
    tri = hi_tri[idx]
    image_name,constant = materials[tri.material_index] if materials else (None,np.array([.4,.4,.4]))
    if not image_name or not uv_layer: return constant
    a,b,c = [hi_coords[i] for i in tri.vertices]
    edge0,edge1 = b-a,c-a
    d00,d01,d11 = edge0.dot(edge0),edge0.dot(edge1),edge1.dot(edge1)
    den = d00*d11-d01*d01
    if abs(den)<1e-20: return constant
    v = hit-a
    u=(d11*edge0.dot(v)-d01*edge1.dot(v))/den
    w=(d00*edge1.dot(v)-d01*edge0.dot(v))/den
    t0,t1,t2 = [uv_layer.data[i].uv for i in tri.loops]
    uv=t0*(1-u-w)+t1*u+t2*w
    pixels=texels[image_name]
    return pixels[int((uv.y%1)*pixels.shape[0])%pixels.shape[0],int((uv.x%1)*pixels.shape[1])%pixels.shape[1]]

bpy.context.view_layer.objects.active=mesh
mesh.select_set(True)
# Texture seam duplicates would otherwise leave isolated scraps. Weld those
# positions on the working copy while keeping the untouched UV sampler above.
bm=bmesh.new()
bm.from_mesh(mesh.data)
bmesh.ops.remove_doubles(bm,verts=bm.verts[:],dist=.00001)
bm.to_mesh(mesh.data);bm.free();mesh.data.update()
dec=mesh.modifiers.new('Software renderer silhouette','DECIMATE')
# Older atlases were baked with a 480-face decimator target. Use their
# original topology when the caller requests a compatibility extension.
face_target=480 if basis and struct.unpack_from('<H',basis,6)[0]<=480 else 820
dec.ratio=min(1.,face_target/max(1,len(hi_tri)))
dec.use_collapse_triangulate=True
mesh.modifiers.move(len(mesh.modifiers)-1,0)
bpy.ops.object.modifier_apply(modifier=dec.name)
mesh.data.calc_loop_triangles()
def substantial(face):
    a,b,c=[mesh.data.vertices[i].co for i in face.vertices]
    return (b-a).cross(c-a).length>.00012

triangles=[tri for tri in mesh.data.loop_triangles if substantial(tri)]
if not 200 <= len(triangles) <= 820:
    raise RuntimeError(f'Unexpected effective triangle count {len(triangles)}')
source_indices=np.array([t.vertices[:] for t in triangles],dtype=int)
used,packed_indices=np.unique(source_indices,return_inverse=True)
indices=packed_indices.reshape(-1,3).astype('<u2')
vertices=list(mesh.data.vertices)
arm_groups = {group.index for group in mesh.vertex_groups if group.name in arm_bones}
if not arm_groups: raise RuntimeError('Missing arm skin weights')
arm_weights = np.array([min(1.,sum(group.weight for group in vertices[int(i)].groups
                                  if group.group in arm_groups)) for i in used] + [1.])
arm_weights = np.rint(arm_weights*255).astype('u1')
support_influence={'UpperArmL':.13,'LowerArmL':.59,'Index1L':1.}
support_groups={g.index:support_influence.get(g.name.replace('.','').replace('_',''),0.) for g in mesh.vertex_groups}
finger_group=next(g.index for g in mesh.vertex_groups if g.name==left_hand.name)
support_weights=np.array([[min(1.,sum(g.weight*support_groups[g.group] for g in vertices[int(i)].groups)),
                           min(1.,sum(g.weight for g in vertices[int(i)].groups if g.group==finger_group))] for i in used]+[[0,0]])
support_weights=np.rint(support_weights*255).astype('u1')
colours=[]
samples=[(.33,.33,.34),(.65,.19,.16),(.16,.65,.19),(.19,.16,.65)]
for t in triangles:
    a,b,c=[vertices[i].co for i in t.vertices]
    values=np.array([sample(a*i+b*j+c*k) for i,j,k in samples])
    color=np.mean(values,axis=0)
    # Convert Blender scene-linear pixels to the sRGB expected by Canvas.
    srgb=np.where(color<=.0031308,12.92*color,1.055*np.maximum(color,0)**(1/2.4)-.055)
    # Preserve sampled skin and headgear. Restore the dark, cool guard jacket
    # and the bright canvas responder jacket when reducing a texture to flat faces.
    centroid=mesh.matrix_world@((a+b+c)/3)
    if .80 < centroid.z < 1.51 and max(srgb)-min(srgb)<.26:
        srgb*=np.array([.68,.80,.91]) if 'guard' in dst.stem else np.array([1.10,1.04,.94])
    colours.append(np.clip(np.rint(srgb*255),0,255))
colors=np.asarray(colours,dtype='u1')
poses=[]
arm_pivots=[]
left_pivots=[]
descriptors=[]
fps=scene.render.fps/scene.render.fps_base
for name,count in clips:
    action,slot=actions[name]
    anim.action=action
    if slot: anim.action_slot=slot
    first,last=action.frame_range
    duration=max(1/fps,(last-first)/fps)
    descriptors.append((count,round(duration*1000)))
    for i in range(count):
        # Run and idle are periodic. Include the terminal pose for impact and stance.
        t=i/(count if name in ('Run_Gun','Idle_Shoot') else count-1)
        if name=='Duck': t=.29+.39*t  # Stay crouched for the whole gameplay slide.
        frame=first+(last-first)*t
        scene.frame_set(math.floor(frame),subframe=frame%1)
        deps=bpy.context.evaluated_depsgraph_get()
        obj=mesh.evaluated_get(deps)
        points=[obj.matrix_world@obj.data.vertices[int(i)].co for i in used]
        eval_rig=rig.evaluated_get(deps)
        points.append(eval_rig.matrix_world@eval_rig.pose.bones[hand.name].matrix.translation)
        left=eval_rig.matrix_world@eval_rig.pose.bones[left_hand.name].matrix.translation
        left_pivots.append((-left.x,left.z,left.y))
        pivot = sum((eval_rig.matrix_world@eval_rig.pose.bones[bone.name].matrix.translation
                     for bone in shoulders), points[-1]*0)/2
        arm_pivots.append((-pivot.x,pivot.z,pivot.y))
        coords=np.array([(-v.x,v.z,v.y) for v in points],dtype=float)
        poses.append(coords)
all_poses=np.asarray(poses)
idle=all_poses[0,:-1,:]
height=float(idle[:,1].max()-idle[:,1].min())
if not .8 < height < 3: raise RuntimeError(f'Unexpected source height {height}')
ground = idle[:,1].min()
all_poses[:,:,1]-=ground
all_poses*=1.8/height
arm_pivots=np.asarray(arm_pivots)
arm_pivots[:,1]-=ground
arm_pivots*=1.8/height
left_pivots=np.asarray(left_pivots)
left_pivots[:,1]-=ground
left_pivots*=1.8/height
# Physics already owns the player's vertical root, including jump height. The
# donor clips supply limb motion but must not add a second jump or float a foot.
offset=0
for (name,_),(count,_) in zip(clips,descriptors):
    for index,frame in enumerate(all_poses[offset:offset+count],start=offset):
        if name in ('Run_Gun','Jump_Idle','Duck'):
            floor=np.min(frame[:-1,1])
            frame[:,1]-=floor
            arm_pivots[index,1]-=floor
            left_pivots[index,1]-=floor
    offset+=count
if not np.isfinite(all_poses).all() or np.abs(all_poses).max()>8: raise RuntimeError('Invalid pose coordinates')
data=bytearray(struct.pack('<4sHH',b'DLC1',len(used),len(triangles)))
for n,ms in descriptors: data.extend(struct.pack('<HH',n,ms))
data.extend(indices.tobytes());data.extend(colors.tobytes())
if len(data)%2: data.append(0)
packed_poses=np.rint(all_poses*1000).astype('<i2')
data.extend(packed_poses.tobytes())
if basis:
    # Blender may reorder otherwise identical decimated vertices between runs.
    # Keep every existing face/colour/pose byte, and remap only the new weights.
    existing=basis
    positions_at=(28+9*len(triangles)+1)&~1
    positions_end=positions_at+packed_poses.size*2
    if existing[:28]!=data[:28] or len(existing)<positions_end:
        raise RuntimeError('Existing atlas has different topology or clips')
    old_poses=np.frombuffer(existing,dtype='<i2',count=packed_poses.size,offset=positions_at).reshape(packed_poses.shape)
    signatures={np.ascontiguousarray(packed_poses[:,i,:]).tobytes():i for i in range(len(arm_weights))}
    try: order=[signatures[np.ascontiguousarray(old_poses[:,i,:]).tobytes()] for i in range(len(arm_weights))]
    except KeyError: raise RuntimeError('Existing atlas poses differ; refusing to replace the original animation')
    if len(set(order))!=len(arm_weights): raise RuntimeError('Ambiguous vertex mapping')
    arm_weights=arm_weights[order]
    support_weights=support_weights[order]
    data=bytearray(existing[:positions_end])
data.extend(struct.pack('<4sHH',b'ARM1',len(arm_weights),len(arm_pivots)))
data.extend(arm_weights.tobytes())
if len(data)%2: data.append(0)
data.extend(np.rint(arm_pivots*1000).astype('<i2').tobytes())
data.extend(struct.pack('<4sHH',b'LHD1',len(support_weights),len(left_pivots)))
data.extend(support_weights.tobytes())
data.extend(np.rint(left_pivots*1000).astype('<i2').tobytes())
dst.write_bytes(data)
print('LITE',dst.name,'vertices',len(used),'triangles',len(triangles),'bytes',len(data),
      'idle height',round(height,3),'mean sRGB',colors.mean(axis=0).round().astype(int).tolist(),
      'clips',descriptors,flush=True)
