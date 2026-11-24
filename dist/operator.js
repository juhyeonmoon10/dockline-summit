import * as T from './assets/three.module.min.js';
import { clone } from './assets/SkeletonUtils.js';
import { blasterMesh, gunFit } from './blaster.js';
import { PRIMARY_WEAPONS,SECONDARY_WEAPONS } from './balance.js';
import {poseRevolver,revolverAction} from './revolver.js';
import { knifeMesh,knifePose,animateCarriedKnife } from './knife.js';
import { knifeAttackDuration,knifeClipPhase } from './knife-motion.js';
import { normalizeKnifeSkin } from './knife-types.js';
import { assetUrl } from './asset-url.js';
import {supportArm,restoreSupport,poseSupport} from './operator-support.js';

const sources=[null,null];
let loading;
export function loadOperators(){
 if(!loading){
   loading=import('./assets/GLTFLoader.js')
     .then(({GLTFLoader})=>Promise.all(['guard','responder'].map(async (outfit,team)=>{
       const gltf=await new GLTFLoader().loadAsync(assetUrl('customs-'+outfit+'.glb'));
       gltf.scene.updateMatrixWorld(true);
       sources[team]=gltf;
     })))
     .catch(error=>{console.warn('캐릭터 모델을 불러오지 못했습니다.',error);});
 }
 return loading;
}
export const operatorAvailable=(team)=>sources[team]!==null;
const handPoint=new T.Vector3();
const gripOffset=new T.Vector3(),aimAxis=new T.Vector3(1,0,0);
const groupRotation=new T.Quaternion(),parentRotation=new T.Quaternion(),aimRotation=new T.Quaternion(),localAim=new T.Quaternion();
const barrelForward=new T.Vector3(0,0,-1),barrelDirection=new T.Vector3();

// Read the displayed prop, including its grip, animation, stance, and interpolated
// actor transform. This helper never substitutes the network eye/shot position.
export function heldMuzzleWorld(held,weapon,out,rotation){
 const fit=gunFit[weapon];
 if(!held?.visible||!held.parent||!fit)return false;
 held.updateWorldMatrix(true,false);
 out.set(fit.muzzleX||0,fit.muzzleY,fit.muzzle).applyMatrix4(held.matrixWorld);
 if(!Number.isFinite(out.x+out.y+out.z))return false;
 if(rotation){
   barrelDirection.copy(barrelForward).transformDirection(held.matrixWorld);
   rotation.setFromUnitVectors(barrelForward,barrelDirection);
 }
 return true;
}
export function createOperator(team){
 const source=sources[team];
 if(!source)return null;
 const group=new T.Group(),model=clone(source.scene);group.add(model);
 model.traverse(object=>{if(object.isMesh)object.frustumCulled=false;});
 const mixer=new T.AnimationMixer(model),actions=Object.fromEntries(source.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
 actions.Idle_Shoot.play();mixer.update(0);
 model.updateMatrixWorld(true);
 // Both wardrobe meshes are authored at 1.80 m, facing +Z.
 model.rotation.y=Math.PI;
 const loadout=new T.Group(),loadouts={};loadout.scale.setScalar(.86);group.add(loadout);
 for(const key of [...PRIMARY_WEAPONS,...SECONDARY_WEAPONS,'knife']){const mesh=key==='knife'?knifeMesh():blasterMesh(key);loadouts[key]=mesh;mesh.visible=false;loadout.add(mesh);}
 let hand;const aimArms=[];
 model.traverse(object=>{
   if(!object.isBone)return;
   const name=object.name.replace(/[^a-zA-Z0-9]/g,'');
   if(name==='Index1R')hand=object;
   if(name==='ShoulderL'||name==='ShoulderR')aimArms.push({bone:object,pose:new T.Quaternion()});
 });
 return {group,model,mixer,actions,loadout,loadouts,revolver:revolverAction(loadouts.revolver),hand,aimArms,aimed:false,support:supportArm(model),clip:'Idle_Shoot',active:null};
}
export function updateOperator(rig,player,dt,swing,cylinderCycle){
 // Restore the animation pose before mixing the next frame or changing guns.
 restoreSupport(rig.support);
 if(rig.aimed){for(const arm of rig.aimArms)arm.bone.quaternion.copy(arm.pose);rig.aimed=false;}
 const knifeSkin=normalizeKnifeSkin(player.knifeSkin),cutLength=knifeAttackDuration(knifeSkin);
 const cutting=player.active==='knife'&&swing&&swing.age<cutLength;
 const clip=cutting?'Punch':player.slide>0?'Duck':player.y>0.15&&!(player.grounded??true)?'Jump_Idle':(player.speed||0)>.35?'Run_Gun':'Idle_Shoot';
 if(clip!==rig.clip){const before=rig.actions[rig.clip],next=rig.actions[clip];next.reset().play();next.crossFadeFrom(before,cutting?.05:.16,false);rig.clip=clip;}
 rig.actions.Run_Gun.timeScale=Math.max(.6,Math.min(1.55,(player.speed||0)/5.4));
 if(cutting){
   rig.actions.Punch.timeScale=0;rig.actions.Punch.time=knifeClipPhase(swing.age,knifeSkin)*rig.actions.Punch.getClip().duration;
 }
 rig.mixer.update(dt);
 const pitch=Math.max(-.78,Math.min(.78,player.pitch||0));
 if(player.active==='sniper'){
   // These two shoulder pivots share the chest origin. Rotating both arms by
   // the weapon's aim preserves their authored grip instead of pitching only
   // the rifle away from stationary hands. The torso and head keep their pose.
   rig.group.updateMatrixWorld(true);
   rig.group.getWorldQuaternion(groupRotation);
   aimRotation.setFromAxisAngle(aimAxis,pitch).premultiply(groupRotation);
   aimRotation.multiply(groupRotation.invert());
   for(const arm of rig.aimArms){
     arm.pose.copy(arm.bone.quaternion);
     arm.bone.parent.getWorldQuaternion(parentRotation);
     localAim.copy(parentRotation).invert().multiply(aimRotation).multiply(parentRotation);
     arm.bone.quaternion.premultiply(localAim);
   }
   rig.aimed=true;
 }
 // The actual finger bone supplies grip position; the arena supplies aim direction.
 // This keeps every weapon aligned with shots, independently of source-file axes.
 rig.group.updateMatrixWorld(true);
 if(rig.hand){rig.hand.getWorldPosition(handPoint);rig.group.worldToLocal(handPoint);rig.loadout.position.copy(handPoint);}
 const cut=knifePose(cutting?swing.age:Infinity,swing?.side||1,knifeSkin);
 rig.loadout.rotation.set(pitch+(player.active==='knife'?cut.rx-.18:0),player.active==='knife'?cut.ry:0,player.active==='knife'?cut.rz+.2:0);
 if(rig.hand){
   gripOffset.set(0,.050,0);
   if(player.active==='sniper')gripOffset.applyQuaternion(rig.loadout.quaternion);
   rig.loadout.position.add(gripOffset);
 }
 if(player.active==='knife'){
   const skin=knifeSkin;
   if(skin!==(rig.knifeSkin||'karambit')){
     rig.loadout.remove(rig.loadouts.knife);
     rig.loadouts.knife=knifeMesh(skin);rig.loadout.add(rig.loadouts.knife);
     rig.knifeAge=0;
   }
   if(rig.active!=='knife')rig.knifeAge=0;
   rig.knifeSkin=skin;animateCarriedKnife(rig.loadouts.knife,skin,cutting?Infinity:rig.knifeAge,-.055);rig.knifeAge+=dt;
 }
 if(rig.active!==player.active){for(const [key,item] of Object.entries(rig.loadouts))item.visible=key===player.active;rig.active=player.active;}
 poseSupport(rig.support,rig.loadout,player.active);
 if(player.active==='revolver')poseRevolver(rig.revolver,player,cylinderCycle);
}
export function disposeOperator(rig){rig.mixer.stopAllAction();rig.model.traverse(object=>{if(object.isSkinnedMesh)object.skeleton.dispose();});}
