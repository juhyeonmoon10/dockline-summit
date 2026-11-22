import { worldHit } from './arena-world.js';

// An eye sees over or around cover before a held gun can clear it.
export function clipBarrelOrigin(eye,muzzle,map){
  const dx=muzzle.x-eye.x,dy=muzzle.y-eye.y,dz=muzzle.z-eye.z;
  const length=Math.hypot(dx,dy,dz);
  if(length<1e-7)return {x:eye.x,y:eye.y,z:eye.z,blocked:false};
  const hit=worldHit(eye.x,eye.y,eye.z,dx/length,dy/length,dz/length,length,map);
  if(hit>=length-1e-6)return {x:muzzle.x,y:muzzle.y,z:muzzle.z,blocked:false};
  const fraction=Math.max(0,hit-.004)/length,at=Math.max(0,hit)/length;
  return {x:eye.x+dx*fraction,y:eye.y+dy*fraction,z:eye.z+dz*fraction,blocked:true,
    impact:{x:eye.x+dx*at,y:eye.y+dy*at,z:eye.z+dz*at}};
}

export function visibleTraceEnd(start,end,map){
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,length=Math.hypot(dx,dy,dz);
  if(length<.008)return end;
  const distance=worldHit(start.x,start.y,start.z,dx/length,dy/length,dz/length,length,map);
  if(distance>=length-.008)return end;
  const t=Math.max(0,distance)/length;
  return {x:start.x+dx*t,y:start.y+dy*t,z:start.z+dz*t};
}

export const PELLET_LIFE=.14;
export const SHOT_TRAIL_LIFE=.105;
export const PELLET_CAPACITY=96;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function exitsForward(start,end,forward){
  return !forward||((end.x-start.x)*forward.x+(end.y-start.y)*forward.y+(end.z-start.z)*forward.z)>.0001;
}

// Match the visible barrel axis on exit, then join the confirmed impact.
// Use the direct path if either visual segment would cross cover.
export function muzzleDeparture(start,end,forward,map){
  if(!forward)return null;
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
  const direct=Math.hypot(dx,dy,dz),norm=Math.hypot(forward.x,forward.y,forward.z);
  if(direct<.20||norm<1e-6)return null;
  const alignment=(dx*forward.x+dy*forward.y+dz*forward.z)/(direct*norm);
  if(alignment<=0||alignment>.999999)return null;
  const exit=Math.min(.78,direct*.28),scale=exit/norm;
  const point={x:start.x+scale*forward.x,y:start.y+scale*forward.y,z:start.z+scale*forward.z};
  if(visibleTraceEnd(start,point,map)!==point||visibleTraceEnd(point,end,map)!==end)return null;
  const rest=Math.hypot(end.x-point.x,end.y-point.y,end.z-point.z);
  return {...point,exit,rest,length:exit+rest};
}

// Emit only the visible part of each leg. Fractions are local to that leg.
export function flightSlices(directLength,departure,tail,head,emit){
  if(directLength<=0||head<=tail)return;
  if(!departure){emit(false,tail,head);return;}
  const {exit,rest,length}=departure,a=tail*length,b=head*length;
  if(a<exit)emit(true,a/exit,Math.min(1,b/exit));
  if(b>exit)emit(false,Math.max(0,(a-exit)/rest),Math.min(1,(b-exit)/rest));
}

export function singleShotSpan(length,age,weapon){
  const speed=weapon==='sniper' ? 980 : 740;
  const visible=weapon==='sniper' ? 6 : 3.8;
  const flight=clamp(length/speed,.030,.075);
  const head=Math.min(1,.62/Math.max(length,.62)+age/flight);
  const fade=clamp((age-flight)/(SHOT_TRAIL_LIFE-flight),0,1);
  const tail=Math.max(0,head-visible/Math.max(length,.01)*(1-fade));
  return {head,tail,alpha:(1-fade)*(.92-.30*Math.min(1,age/flight))};
}
export function pelletTrails(event,own,ads=false,origin=event){
  const pellets=event.pellets?.length?event.pellets:[event];
  const {x,y,z}=origin;
  return pellets.slice(0,10).filter(p=>[p.ex,p.ey,p.ez].every(Number.isFinite)).map(p=>{
    const dx=p.ex-x,dy=p.ey-y,dz=p.ez-z,length=Math.hypot(dx,dy,dz);
    return {x,y,z,dx,dy,dz,length,ex:p.ex,ey:p.ey,ez:p.ez,target:p.target||null,own,age:0};
  });
}
export function pelletSpan(trail){
  const length=trail.departure?.length??trail.length;
  const flight=clamp(length/400,.035,.075);
  const head=Math.min(1,Math.min(.20,.7/(length||1))+trail.age/flight);
  const finish=clamp((trail.age-flight)/(PELLET_LIFE-flight),0,1);
  const span=Math.min(.62,3.6/(length||1))*(1-finish*.85);
  return {head,tail:Math.max(0,head-span),alpha:Math.pow(Math.max(0,1-trail.age/PELLET_LIFE),.8),contactAlpha:head>=1?Math.max(0,1-(trail.age-flight)/.065):0};
}
