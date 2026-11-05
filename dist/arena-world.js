import { MAP } from './arena-map.js';

export const BODY_RADIUS = .37;
const EPS = .001;
const nearRect = (x,z,r,b) => Math.abs(x-b.x)<b.w/2+r && Math.abs(z-b.z)<b.d/2+r;
const bound = (a,l,h) => Math.max(l,Math.min(h,a));

export function slopeAt(r,x,z,radius=0) {
  const a=r.axis==='x' ? x-r.x : z-r.z, length=r.axis==='x' ? r.w : r.d;
  return r.h * bound(.5+(a*r.sign+radius)/length,0,1);
}

// Floors below the deck and on top of it coexist at the same horizontal position.
export function surfacesAt(x,z,radius=BODY_RADIUS){
  const levels=[0];
  for(const b of MAP.boxes)if(nearRect(x,z,radius,b))levels.push(b.h);
  for(const r of MAP.ramps)if(nearRect(x,z,radius,r))levels.push(slopeAt(r,x,z,radius));
  return levels;
}

export function support(x,z,ceiling,radius=BODY_RADIUS) {
  let y=0;
  for(const b of MAP.boxes)if(b.h<=ceiling+EPS && b.h>y && nearRect(x,z,radius,b))y=b.h;
  for(const r of MAP.ramps)if(nearRect(x,z,radius,r)){
    const h=slopeAt(r,x,z,radius);
    if(h<=ceiling+EPS && h>y)y=h;
  }
  return y;
}
export function clearPosition(x,z,feet=0,radius=BODY_RADIUS,height=1.8) {
  if(Math.abs(x)+radius>MAP.width/2 || Math.abs(z)+radius>MAP.depth/2)return false;
  for(const b of MAP.boxes){
    if(nearRect(x,z,radius,b)&&feet<b.h-.012&&feet+height>(b.base||0)+.012)return false;
  }
  for(const r of MAP.ramps)if(nearRect(x,z,radius,r)&&feet<slopeAt(r,x,z,radius)-.012)return false;
  return true;
}
export function ceilingAt(x,z,head,radius=BODY_RADIUS) {
  let cap=Infinity;
  for(const b of MAP.boxes)if(b.base && b.base>=head-.03 && nearRect(x,z,radius,b))cap=Math.min(cap,b.base);
  return cap;
}
export function walkHeight(x,z,feet,step,radius=BODY_RADIUS,height=1.8){
  const y=Math.max(feet,support(x,z,feet+step,radius));
  return clearPosition(x,z,y,radius,height)?y:null;
}

// Ray vs a convex volume. A ramp is a box clipped below its inclined top plane.
function bounds(ox,oy,oz,dx,dy,dz,x0,y0,z0,x1,y1,z1){
  let near=0,far=Infinity;
  for(const [o,d,lo,hi] of [[ox,dx,x0,x1],[oy,dy,y0,y1],[oz,dz,z0,z1]]){
    if(Math.abs(d)<1e-8){if(o<lo||o>hi)return null;continue;}
    const a=(lo-o)/d,b=(hi-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(far<near)return null;
  }
  return [near,far];
}
export function intersect(...args){return bounds(...args)?.[0]??Infinity;}
function rampHit(r,x,y,z,dx,dy,dz){
  const range=bounds(x,y,z,dx,dy,dz,r.x-r.w/2,0,r.z-r.d/2,r.x+r.w/2,r.h,r.z+r.d/2);
  if(!range)return Infinity;
  const axis=r.axis==='x',slope=r.h*r.sign/(axis?r.w:r.d);
  const excess=y-r.h/2-slope*(axis?x-r.x:z-r.z),change=dy-slope*(axis?dx:dz);
  if(excess+change*range[0]<=.00001)return range[0];
  if(change>=-1e-8)return Infinity;
  const t=-excess/change;return t<=range[1]+EPS?t:Infinity;
}
export function worldHit(x,y,z,dx,dy,dz,limit=100){
  let d=limit;
  if(dy<-.00001)d=Math.min(d,-y/dy);
  if(Math.abs(dx)>.00001)d=Math.min(d,((dx>0?1:-1)*MAP.width/2-x)/dx);
  if(Math.abs(dz)>.00001)d=Math.min(d,((dz>0?1:-1)*MAP.depth/2-z)/dz);
  for(const b of MAP.boxes)d=Math.min(d,intersect(x,y,z,dx,dy,dz,b.x-b.w/2,b.base||0,b.z-b.d/2,b.x+b.w/2,b.h,b.z+b.d/2));
  for(const r of MAP.ramps)d=Math.min(d,rampHit(r,x,y,z,dx,dy,dz));
  return d;
}
