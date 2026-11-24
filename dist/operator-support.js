import {Vector3,Quaternion} from './assets/three.module.min.js';
import {supportPads,supportPalmTurn} from './operator-pads.js';
const shoulder=new Vector3(),elbow=new Vector3(),finger=new Vector3(),target=new Vector3();
const axis=new Vector3(),pole=new Vector3(),nextElbow=new Vector3(),nextFinger=new Vector3();
const current=new Vector3(),wanted=new Vector3(),parentRotation=new Quaternion(),inverseParent=new Quaternion(),turn=new Quaternion();
const gloveRotation=new Quaternion(),palmTurn=new Quaternion(),gunUp=new Vector3();

export function supportArm(model){
  const bones={};
  model.traverse(bone=>{
    if(bone.isBone)bones[bone.name.replace(/[^a-zA-Z0-9]/g,'')]=bone;
  });
  if(!(bones.UpperArmL&&bones.LowerArmL&&bones.Index1L))return null;
  return {upper:bones.UpperArmL,lower:bones.LowerArmL,finger:bones.Index1L,
    upperRest:new Quaternion(),lowerRest:new Quaternion(),fingerRest:new Quaternion(),posed:false};
}

export function restoreSupport(arm){
  if(!arm?.posed)return;
  arm.upper.quaternion.copy(arm.upperRest);
  arm.lower.quaternion.copy(arm.lowerRest);
  arm.finger.quaternion.copy(arm.fingerRest);
  arm.posed=false;
}

function pointLimb(bone,origin,priorEnd,end){
  current.subVectors(priorEnd,origin).normalize();
  wanted.subVectors(end,origin).normalize();
  bone.parent.getWorldQuaternion(parentRotation);
  turn.setFromUnitVectors(current,wanted);
  inverseParent.copy(parentRotation).invert();
  bone.quaternion.premultiply(turn.premultiply(inverseParent).multiply(parentRotation));
  bone.updateWorldMatrix(false,true);
}

export function poseSupport(arm,loadout,id){
  const pad=supportPads[id];
  if(!arm||!pad)return;
  arm.upperRest.copy(arm.upper.quaternion);
  arm.lowerRest.copy(arm.lower.quaternion);
  arm.fingerRest.copy(arm.finger.quaternion);
  arm.finger.getWorldQuaternion(gloveRotation);
  arm.posed=true;
  arm.upper.getWorldPosition(shoulder);
  arm.lower.getWorldPosition(elbow);
  arm.finger.getWorldPosition(finger);
  target.fromArray(pad);loadout.localToWorld(target);
  axis.subVectors(target,shoulder);
  const upper=shoulder.distanceTo(elbow),lower=elbow.distanceTo(finger);
  const distance=Math.max(Math.abs(upper-lower)+.0001,Math.min(axis.length(),upper+lower-.0001));
  axis.normalize();
  // Bend toward the outside of the uniform. Solve along the two existing
  // bone lengths so the glove stays attached during running and aim changes.
  pole.set(-.38,-.31,-.03);loadout.localToWorld(pole);
  pole.sub(shoulder);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  nextElbow.copy(shoulder).addScaledVector(axis,along)
    .addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along)));
  nextFinger.copy(shoulder).addScaledVector(axis,distance);
  pointLimb(arm.upper,shoulder,elbow,nextElbow);
  arm.lower.getWorldPosition(elbow);
  arm.finger.getWorldPosition(finger);
  pointLimb(arm.lower,elbow,finger,nextFinger);
  // The source glove's four fingers share a bone and extend forward in the
  // sampled clip. Turn the palm across the underside of the carried prop.
  loadout.getWorldQuaternion(parentRotation);
  gunUp.set(0,1,0).applyQuaternion(parentRotation);
  palmTurn.setFromAxisAngle(gunUp,supportPalmTurn);
  arm.finger.parent.getWorldQuaternion(parentRotation);
  arm.finger.quaternion.copy(parentRotation.invert()).multiply(palmTurn).multiply(gloveRotation);
}
