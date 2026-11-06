// Cosmetic travel only; damage uses the simulation's original hitscan result.
export const PELLET_LIFE=.14;
export const PELLET_CAPACITY=96;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function pelletTrails(event,own,ads=false){
  const pellets=event.pellets?.length?event.pellets:[event];
  const cx=event.ex-event.x,cz=event.ez-event.z,flat=Math.hypot(cx,cz)||1;
  const offset=own?(ads?.025:.16):.10;
  // One shared muzzle origin, with every endpoint taken from the actual shot.
  const x=event.x-cz/flat*offset,y=event.y-(own?(ads?.055:.14):.12),z=event.z+cx/flat*offset;
  return pellets.slice(0,10).filter(p=>[p.ex,p.ey,p.ez].every(Number.isFinite)).map(p=>{
    const dx=p.ex-x,dy=p.ey-y,dz=p.ez-z,length=Math.hypot(dx,dy,dz);
    return {x,y,z,dx,dy,dz,length,ex:p.ex,ey:p.ey,ez:p.ez,target:p.target||null,own,age:0};
  });
}
export function pelletSpan(trail){
  const flight=clamp(trail.length/400,.035,.075);
  const head=Math.min(1,.25+.75*trail.age/flight);
  const finish=clamp((trail.age-flight)/(PELLET_LIFE-flight),0,1);
  const span=Math.min(.62,3.6/(trail.length||1))*(1-finish*.85);
  return {head,tail:Math.max(0,head-span),alpha:Math.pow(Math.max(0,1-trail.age/PELLET_LIFE),.8),contactAlpha:head>=1?Math.max(0,1-(trail.age-flight)/.065):0};
}
