"""Bind a reduced T-pose GLB to an adult skeleton and retarget the bundled CC0 motions.

Run in Blender's background Python. Arguments: reduced GLB, Soldier.gltf, output GLB,
then optional degrees to turn about the vertical axis before binding.
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
character, donor, output = map(Path, args[:3])
angle = math.radians(float(args[3])) if len(args) > 3 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(character.resolve()))
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
world = Matrix.Rotation(angle, 4, 'Z') @ mesh.matrix_world
mesh.parent = None
mesh.data.transform(world)
mesh.matrix_world = Matrix.Identity(4)
verts = mesh.data.vertices
coords = np.array([tuple(v.co) for v in verts])
lo, hi = coords.min(axis=0), coords.max(axis=0)
origin = (lo + hi) / 2
origin[2] = lo[2]
coords = (coords - origin) * (1.8 / (hi[2] - lo[2]))
for vertex, point in zip(verts, coords):
    vertex.co = point
mesh.name = 'Customs uniform'
mesh.data.update()

# Both axes and centring follow the actual export. Measure wrist height, arm span,
# and leg separation from the silhouette so differently dressed characters can share clips.
half_span = np.quantile(np.abs(coords[:,0]), .998)
wrists = coords[np.abs(coords[:,0]) > half_span * .76]
wrist_z = float(np.median(wrists[:,2]))
arm_y = float(np.median(wrists[:,1]))
assert .98 < wrist_z < 1.64 and half_span > .63, (wrist_z, half_span)
boot = coords[(coords[:,2] < .17) & (coords[:,0] > 0)]
leg_x = float(np.clip(np.median(boot[:,0]), .09, .21))
pelvis_z, shoulder = .895, float(np.clip(half_span*.218,.165,.22))
wrist = half_span - .155
elbow = (shoulder + wrist) * .5
elbow_slice = coords[(np.abs(np.abs(coords[:,0])-elbow)<.045) & (coords[:,2]>1.0)]
elbow_z = float(np.median(elbow_slice[:,2]))
arm_z = float(np.clip(elbow_z+(elbow_z-wrist_z),1.32,1.49))
def arm_height(x):
    return float(np.interp(x,[shoulder,elbow,wrist],[arm_z,elbow_z,wrist_z]))
definitions = {}

def bone(name, head, tail, parent=None, donor_name=None):
    definitions[name] = (Vector(head),Vector(tail),parent,donor_name or name)

bone('Body',(0,0,pelvis_z),(0,0,1.04))
bone('Abdomen',(0,0,1.00),(0,0,1.18),'Body')
bone('Torso',(0,0,1.18),(0,0,arm_z+.015),'Abdomen')
bone('Neck',(0,0,arm_z+.025),(0,0,1.565),'Torso')
bone('Head',(0,0,1.565),(0,0,1.80),'Neck')
for s, side in [(1,'.L'),(-1,'.R')]:
    def pt(x,y,z): return (s*x,y,z)
    ax = lambda x: pt(x,arm_y,arm_height(x))
    bone('Shoulder'+side,(0,0,arm_z-.04),ax(shoulder),'Torso')
    bone('UpperArm'+side,ax(shoulder),ax(elbow),'Shoulder'+side)
    bone('LowerArm'+side,ax(elbow),ax(wrist),'UpperArm'+side)
    bone('Index1'+side,ax(wrist),ax(half_span),'LowerArm'+side)
    bone('UpperLeg'+side,pt(leg_x,0,pelvis_z),pt(leg_x,-.018,.465),'Body')
    bone('LowerLeg'+side,pt(leg_x,-.018,.465),pt(leg_x,.017,.108),'UpperLeg'+side)
    bone('Foot'+side,pt(leg_x,.017,.108),pt(leg_x,-.16,.05),'LowerLeg'+side)

rigdata=bpy.data.armatures.new('Customs skeleton')
rig=bpy.data.objects.new('Customs operator',rigdata)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent,source_name) in definitions.items():
    eb=rigdata.edit_bones.new(name)
    eb.head=head
    eb.tail=tail
    if parent: eb.parent=rigdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

def ease(low,high,x):
    u = np.clip((x-low)/(high-low),0,1)
    return u*u*(3-2*u)

def assign(index, weights):
    for name, value in weights.items():
        if value > .00001: groups[name].add([index],float(value),'REPLACE')

groups={name:mesh.vertex_groups.new(name=name) for name in definitions}
for idx,(x,y,z) in enumerate(coords):
    a=abs(x)
    side='.L' if x>=0 else '.R'
    if z < pelvis_z + .09:
        hip=ease(pelvis_z-.11,pelvis_z+.09,z)
        knee=ease(.402,.528,z)
        ankle=ease(.075,.158,z)
        assign(idx,{'Body':hip,'UpperLeg'+side:(1-hip)*knee,'LowerLeg'+side:(1-hip)*(1-knee)*ankle,'Foot'+side:(1-hip)*(1-knee)*(1-ankle)})
    elif abs(z-arm_height(a)) < .17 and a > shoulder-.07:
        arm=ease(shoulder-.07,shoulder+.08,a)
        shoulder_blend=ease(shoulder-.035,shoulder+.12,a)
        forearm=ease(elbow-.055,elbow+.055,a)
        hand=ease(wrist-.045,wrist+.045,a)
        assign(idx,{'Torso':1-arm,'Shoulder'+side:arm*(1-shoulder_blend),
                    'UpperArm'+side:arm*shoulder_blend*(1-forearm),
                    'LowerArm'+side:arm*shoulder_blend*forearm*(1-hand),'Index1'+side:arm*shoulder_blend*forearm*hand})
    elif z>=arm_z:
        head=ease(1.52,1.59,z)
        neck=ease(arm_z,arm_z+.09,z)
        assign(idx,{'Torso':(1-neck)*(1-head),'Neck':neck*(1-head),'Head':head})
    else:
        mid=ease(.98,1.09,z)
        chest=ease(1.12,1.25,z)
        assign(idx,{'Body':1-mid,'Abdomen':mid*(1-chest),'Torso':mid*chest})
mesh.parent=rig
deform=mesh.modifiers.new('Character skin','ARMATURE')
deform.object=rig

prior=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(donor.resolve()))
src=next(o for o in bpy.context.scene.objects if o not in prior and o.type=='ARMATURE')
src.animation_data.use_nla=False
clips=['Idle_Shoot','Run_Gun','Jump_Idle','Duck','Punch']
scene=bpy.context.scene
dest=rig.animation_data_create()
rest={name:rigdata.bones[name].matrix_local.to_quaternion() for name in definitions}
refrest={name:(src.matrix_world@src.data.bones[info[3]].matrix_local).to_quaternion()
         for name,info in definitions.items()}
bodyrest=src.matrix_world@src.data.bones['Body'].head_local

def point_bone(name, target_direction):
    pb=rig.pose.bones[name]
    current=pb.matrix.to_quaternion()
    delta=(pb.tail-pb.head).normalized().rotation_difference(target_direction.normalized())
    parent=pb.parent
    parent_delta=parent.matrix.to_quaternion()@rest[parent.name].inverted()
    pb.rotation_quaternion=rest[name].inverted()@parent_delta.inverted()@delta@current
    bpy.context.view_layer.update()

def pose_hands():
    chest=rig.pose.bones['Torso'].matrix@rigdata.bones['Torso'].matrix_local.inverted()
    for s,side in [(-1,'.R'),(1,'.L')]:
        strong=s<0
        start=rig.pose.bones['UpperArm'+side].head.copy()
        wrist_target=chest@Vector((-.097 if strong else -.046,arm_y-(.19 if strong else .45),arm_z-(.13 if strong else .12)))
        direction=wrist_target-start
        upper=rigdata.bones['UpperArm'+side].length
        lower=rigdata.bones['LowerArm'+side].length
        distance=min(upper+lower-.0005,max(abs(upper-lower)+.0005,direction.length))
        direction.normalize()
        elbow_guide=chest.to_quaternion()@Vector((s*.34,.13,-.54))
        outward=(elbow_guide-direction*elbow_guide.dot(direction)).normalized()
        along=(upper*upper-lower*lower+distance*distance)/(2*distance)
        elbow_target=start+direction*along+outward*math.sqrt(max(0,upper*upper-along*along))
        point_bone('UpperArm'+side,elbow_target-start)
        point_bone('LowerArm'+side,start+direction*distance-elbow_target)
        fingers=Vector((.055,-.09,-.10) if strong else (-.10,-.075,.035))
        point_bone('Index1'+side,chest.to_quaternion()@fingers)

for clip in clips:
    action=bpy.data.actions.get(clip)
    assert action,clip
    src.animation_data.action=action
    if action.slots: src.animation_data.action_slot=action.slots[0]
    out=bpy.data.actions.new('Customs '+clip)
    dest.action=out
    dest.use_nla=False
    prev={}
    start,end=(round(v) for v in action.frame_range)
    for frame in sorted(set(range(start,end+1,2)) | {end}):
        scene.frame_set(frame)
        deltas={}
        for name,(_,_,parent,source_name) in definitions.items():
            pb=src.pose.bones[source_name]
            delta=(src.matrix_world@pb.matrix).to_quaternion()@refrest[name].inverted()
            deltas[name]=delta
            parent_delta=deltas[parent] if parent else Quaternion()
            rot=rest[name].inverted()@parent_delta.inverted()@delta@rest[name]
            rot.normalize()
            if name in prev: rot.make_compatible(prev[name])
            prev[name]=rot.copy()
            target=rig.pose.bones[name]
            target.rotation_mode='QUATERNION'
            target.rotation_quaternion=rot
            target.keyframe_insert(data_path='rotation_quaternion', frame=frame)
            if not parent:
                shift=(src.matrix_world@pb.head)-bodyrest
                target.location=rest[name].inverted()@(shift*.84)
                target.keyframe_insert(data_path='location', frame=frame)
        if clip!='Punch':
            bpy.context.view_layer.update()
            pose_hands()
            for side in ['.L','.R']:
                for prefix in ['UpperArm','LowerArm','Index1']:
                    target=rig.pose.bones[prefix+side]
                    target.keyframe_insert(data_path='rotation_quaternion',frame=frame)
    dest.action=None
    track=dest.nla_tracks.new()
    track.name=clip
    track.strips.new(clip,start,out)
    track.mute=True

dest.action=None
dest.use_nla=True
for b in rig.pose.bones: b.matrix_basis=Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
    if o not in (mesh,rig): bpy.data.objects.remove(o,do_unlink=True)
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
mesh.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,
    export_tangents=False,export_image_format='AUTO')
print('RIGGED',output.stat().st_size,'span',round(half_span*2,3),'shoulder',round(arm_z,3),flush=True)
