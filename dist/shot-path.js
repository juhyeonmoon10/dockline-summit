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

// Length is in arena metres, width is relative to a standard screen stroke.
// Each profile is purely visual; the host has already resolved the impact.
const streaks={
  __proto__:null,
  pistol:   {speed:600,length:.85, width:.78,alpha:.58,fade:.016},
  smg:      {speed:760,length:1.10,width:.86,alpha:.62,fade:.016},
  burst:    {speed:790,length:1.45,width:.94,alpha:.72,fade:.020},
  rifle:    {speed:820,length:1.70,width:1,  alpha:.78,fade:.022},
  lmg:      {speed:750,length:1.85,width:1.10,alpha:.79,fade:.024},
  marksman: {speed:920,length:2.50,width:.91,alpha:.84,fade:.026},
  sniper:   {speed:1050,length:3.90,width:.82,alpha:.94,fade:.032},
};

function streakSpan(length,age,arrivalTime,visibleLength,launchLength,fadeTime,alpha,width){
  if(length<=0)return {head:1,tail:1,alpha:0,width,arrivalTime:0,arrived:true};
  const progress=clamp(age/arrivalTime,0,1),arrived=age>=arrivalTime;
  const fade=clamp((age-arrivalTime)/fadeTime,0,1);
  const launch=Math.min(launchLength,visibleLength*.78)/length;
  const head=arrived?1:launch+(1-launch)*progress;
  const tail=Math.max(0,head-visibleLength/length*(1-fade));
  return {head,tail,alpha:alpha*(1-.18*progress)*(1-fade),width,arrivalTime,arrived};
}

export function singleShotSpan(length,age,weapon){
  const style=streaks[weapon]??streaks.rifle;
  const arrivalTime=clamp(length/style.speed,.018,.070);
  const visibleLength=Math.min(style.length,length*.24);
  return streakSpan(length,age,arrivalTime,visibleLength,.55,style.fade,style.alpha,style.width);
}
export function pelletTrails(event,own,ads=false,origin=event){
  const pellets=event.pellets?.length?event.pellets:[event];
  const {x,y,z}=origin;
  const trails=[];
  for(let index=0;index<Math.min(10,pellets.length);index++){
    const p=pellets[index];
    if(!p||![p.ex,p.ey,p.ez].every(Number.isFinite))continue;
    const dx=p.ex-x,dy=p.ey-y,dz=p.ez-z,length=Math.hypot(dx,dy,dz);
    // A shell has two strong strands and eight lighter ones. Rotate their
    // positions by shot sequence so all clients render the same recorded fan.
    const pelletRank=((event.seq??0)+7*index)%10;
    trails.push({x,y,z,dx,dy,dz,length,ex:p.ex,ey:p.ey,ez:p.ez,target:p.target||null,own,age:0,pelletRank});
  }
  return trails;
}
export function pelletSpan(trail){
  const length=trail.departure?.length??trail.length;
  const rank=trail.pelletRank??0,weight=1-rank/9;
  const arrivalTime=clamp(length/560,.025,.069)*(1+.045*(1-weight));
  const visibleLength=Math.min(.54+1.20*weight,length*(.11+.12*weight));
  const alpha=rank<2?.92:.38+.25*weight;
  const span=streakSpan(length,trail.age,arrivalTime,visibleLength,.40+.18*weight,.020,alpha,.68+.40*weight);
  const contactAge=trail.age-span.arrivalTime;
  span.contactAlpha=span.arrived&&length>0?(.48+.45*weight)*clamp(1-contactAge/.045,0,1):0;
  return span;
}
