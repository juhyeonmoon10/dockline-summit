import * as T from './assets/three.module.min.js';
import { GLTFLoader } from './assets/GLTFLoader.js';
import { clone } from './assets/SkeletonUtils.js';
import { soldierData } from './assets/soldier-data.js';
import { blasterMesh } from './blaster.js';
import { knifeMesh,knifePose } from './knife.js';

let source=null;
const teamMaterials=new Map();
export const operatorsReady=new Promise((resolve,reject)=>new GLTFLoader().parse(soldierData,'',resolve,reject)).then(gltf=>{
 source=gltf;
 source.scene.updateMatrixWorld(true);
 return gltf;
}).catch(error=>{console.warn('캐릭터 모델을 불러오지 못했습니다.',error);});
export const operatorAvailable=()=>source!==null;
const handPoint=new T.Vector3();
function materialFor(original,team){
 const key=original.uuid+'/'+team;if(teamMaterials.has(key))return teamMaterials.get(key);
 const material=original.clone();material.roughness=.66;material.metalness=.05;
 if(original.name==='Character_Main')material.color.set(team?'#df6d39':'#228fc1');
 if(original.name==='Pants')material.color.set(team?'#66514a':'#3c586d');
 if(original.name==='Grey')material.color.set('#8498a5');
 teamMaterials.set(key,material);return material;
}
export function createOperator(team){
 if(!source)return null;
 const group=new T.Group(),model=clone(source.scene);group.add(model);
 model.traverse(object=>{if(object.isMesh){object.material=materialFor(object.material,team);object.frustumCulled=false;}});
 const mixer=new T.AnimationMixer(model),actions=Object.fromEntries(source.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
 actions.Idle_Shoot.play();mixer.update(0);
 model.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(model),height=bounds.max.y-bounds.min.y;
 model.scale.setScalar(1.80/height);model.position.y=-bounds.min.y*model.scale.y;
 // The source faces +Z; the arena's forward direction is -Z.
 model.rotation.y=Math.PI;
 const loadout=new T.Group(),loadouts={};loadout.scale.setScalar(.86);group.add(loadout);
 for(const key of ['rifle','shotgun','sniper','pistol','knife']){const mesh=key==='knife'?knifeMesh():blasterMesh(key);loadouts[key]=mesh;mesh.visible=false;loadout.add(mesh);}
 let hand;model.traverse(object=>{if(object.isBone&&object.name.replace(/[^a-zA-Z0-9]/g,'')==='Index1R')hand=object;});
 return {group,model,mixer,actions,loadout,loadouts,hand,clip:'Idle_Shoot',active:null};
}
export function updateOperator(rig,player,dt,swing){
 const cutting=player.active==='knife'&&swing&&swing.age<.55;
 const clip=cutting?'Punch':player.slide>0?'Duck':player.y>0.15&&!(player.grounded??true)?'Jump_Idle':(player.speed||0)>.35?'Run_Gun':'Idle_Shoot';
 if(clip!==rig.clip){const before=rig.actions[rig.clip],next=rig.actions[clip];next.reset().play();next.crossFadeFrom(before,cutting?.05:.16,false);rig.clip=clip;}
 rig.actions.Run_Gun.timeScale=Math.max(.6,Math.min(1.55,(player.speed||0)/5.4));
 if(cutting){rig.actions.Punch.timeScale=0;rig.actions.Punch.time=Math.min(.995,swing.age/.55)*rig.actions.Punch.getClip().duration;}
 rig.mixer.update(dt);
 // The actual finger bone supplies grip position; the arena supplies aim direction.
 // This keeps every weapon aligned with shots, independently of source-file axes.
 rig.group.updateMatrixWorld(true);
 if(rig.hand){rig.hand.getWorldPosition(handPoint);rig.group.worldToLocal(handPoint);rig.loadout.position.copy(handPoint);rig.loadout.position.y+=.050;}
 const cut=knifePose(cutting?swing.age:.55,swing?.side||1);
 rig.loadout.rotation.set(Math.max(-.78,Math.min(.78,player.pitch||0))+(player.active==='knife'?cut.rx-.18:0),player.active==='knife'?cut.ry:0,player.active==='knife'?cut.rz+.2:0);
 if(rig.active!==player.active){for(const [key,item] of Object.entries(rig.loadouts))item.visible=key===player.active;rig.active=player.active;}
}
export function disposeOperator(rig){rig.mixer.stopAllAction();rig.model.traverse(object=>{if(object.isSkinnedMesh)object.skeleton.dispose();});}
