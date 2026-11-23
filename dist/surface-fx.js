// Colors are sRGB. Size is particle diameter in world metres, life is seconds.
export const SURFACE_FX=Object.freeze({
  concrete:{color:0xb8ada0,highlight:0xd9d0bc,mark:0x4c4a44,count:5,life:.38,size:.072,streak:false,speed:1.15,spread:.80,gravity:1.9,drag:3.4,opacity:.68},
  metal:   {color:0xffae48,highlight:0xffebbe,mark:0x605e53,count:7,life:.22,size:.025,streak:true, speed:3.45,spread:1.20,gravity:7.4,drag:2.2,opacity:1},
  wood:    {color:0x977148,highlight:0xd6b17e,mark:0x55402c,count:6,life:.34,size:.044,streak:false,speed:1.80,spread:.95,gravity:8.4,drag:1.4,opacity:.96},
  glass:   {color:0xb6caca,highlight:0xe4eeea,mark:0x718381,count:4,life:.22,size:.030,streak:false,speed:1.48,spread:.94,gravity:7.8,drag:1.6,opacity:.82},
  fabric:  {color:0xa29e8f,highlight:0xd1c9b4,mark:0x595850,count:3,life:.28,size:.060,streak:false,speed:.67,spread:.67,gravity:.9,drag:4.1,opacity:.54},
  target:  {color:0xa9b8ac,highlight:0xe9e8ce,mark:0x626c64,count:3,life:.14,size:.042,streak:false,speed:1.19,spread:.63,gravity:2.6,drag:3.4,opacity:.76}
});

function perimeterMaterial(map,axis,across,y){
  if(y<0)return null;
  if(map.id!=='switchyard'){
    if(y>1.28)return null;
    return y>.75&&y<.95?'metal':'concrete';
  }
  if(axis==='x'){
    if(y>6.65)return null;
    if(y<3.10)return 'concrete';
    if(y>3.82&&y<5.79)return 'glass';
    return 'metal';
  }
  const edge=Math.abs(across);
  if(y>6.65+(1-edge/(map.width*.5))*2.58)return null;
  // The opening beneath each raised roll-up door is not a solid back wall.
  if(edge<5.37&&y<3.91)return null;
  return y>=4.86||edge<5.75?'metal':'concrete';
}

function boxMaterial(b,axis,sign,x,y,z){
  const height=y/(b.h||1);
  switch(b.kind){
    case 'crate':case 'pallet':return 'wood';
    case 'sack':return height<.145&&axis!=='y'?'wood':'fabric';
    case 'partition':return axis==='y'?'metal':'concrete';
    case 'officeDoor':{
      if(axis==='y')return 'metal';
      const u=axis==='z'?.5+(x-b.x)*sign/b.w:.5-(z-b.z)*sign/b.d;
      if(u<.05||u>.435||height<.03||height>.88)return 'concrete';
      return u>.11&&u<.375&&height>.47&&height<.78?'glass':'metal';
    }
    case 'inspection':case 'officeWindow':{
      if(axis==='y')return 'metal';
      if(axis!=='x')return 'concrete';
      const width=b.d*.958,along=(z-b.z)/width+.5;
      if(along<0||along>1||height<.36||height>.845)return 'concrete';
      const bays=b.kind==='inspection'?7:6,post=along*bays;
      return height<.381||height>.824||Math.abs(post-Math.round(post))*width/bays<.025?'metal':'glass';
    }
    case 'trailer':{
      if(y>=.87||axis==='y')return 'metal';
      if(axis==='x'){
        const dz=(z-b.z)*Math.sign(b.z),rad=Math.min(Math.hypot(y-.52,dz+2.78),Math.hypot(y-.52,dz+1.60));
        if(rad<.27)return 'metal';
      }
      return null; // Chassis is inset below the full-width trailer body.
    }
    case 'cab':
      if(y<.47&&axis!=='y')return null;
      if((axis==='x'||axis==='z'&&sign===Math.sign(b.z))&&y>1.69&&y<b.h-.17)return 'glass';
      return 'metal';
    case 'hood':return y<.39&&axis!=='y'?null:'metal';
    case 'summit':case 'terrace':return axis==='y'&&sign>0?'concrete':'metal';
    case 'pier':case 'pod':case 'block':case 'dock':case 'display':return 'metal';
    default:return 'concrete';
  }
}

// The hit is already authoritative; resolve its rendered face without another ray cast.
// Null includes a range-limited shot, open loading doors and air above low parapets.
export function classifyImpact(map,end,dir,out={}){
  const x=end?.ex,y=end?.ey,z=end?.ez,dx=dir?.x,dy=dir?.y,dz=dir?.z;
  if(!Number.isFinite(x+y+z+dx+dy+dz))return null;
  const length=Math.hypot(dx,dy,dz);if(length<1e-7)return null;
  if(end.target!=null&&end.target!==false){
    out.kind='target';out.nx=-dx/length;out.ny=-dy/length;out.nz=-dz/length;out.markable=false;return out;
  }
  if(!map)return null;
  const tol=.035,border=.095,halfW=map.width/2,halfD=map.depth/2;
  if(Math.abs(x)>halfW+tol||Math.abs(z)>halfD+tol||y<-.035)return null;
  let nearest=Infinity,best=0;
  function face(error,nx,ny,nz,kind,edge){
    const facing=-(dx*nx+dy*ny+dz*nz)/length;
    if(!kind||error>tol||facing<.002||error>nearest+.002||Math.abs(error-nearest)<=.002&&facing<=best)return;
    nearest=error;best=facing;out.kind=kind;out.nx=nx;out.ny=ny;out.nz=nz;
    out.markable=edge>=border&&kind!=='glass'&&kind!=='fabric';
  }
  const sideX=halfW-Math.abs(x),sideZ=halfD-Math.abs(z);
  const scaleX=2.76-Math.abs(x),scaleZ=3.02-Math.abs(z);
  const onScale=map.id==='switchyard'&&scaleX>=0&&scaleZ>=0;
  face(Math.abs(y),0,1,0,onScale?'metal':'concrete',onScale?Math.min(scaleX,scaleZ):Math.min(sideX,sideZ));
  if(Math.abs(sideX)<=tol)face(Math.abs(sideX),-Math.sign(x),0,0,perimeterMaterial(map,'x',z,y),Math.min(y,sideZ));
  if(Math.abs(sideZ)<=tol)face(Math.abs(sideZ),0,0,-Math.sign(z),perimeterMaterial(map,'z',x,y),Math.min(y,sideX));
  for(const b of map.boxes||[]){
    const ox=x-b.x,oz=z-b.z,wx=b.w/2-Math.abs(ox),wz=b.d/2-Math.abs(oz),bottom=y-(b.base||0),top=b.h-y;
    if(Math.min(wx,wz,bottom,top)<-tol)continue;
    if(Math.abs(wx)<=tol)face(Math.abs(wx),Math.sign(ox),0,0,boxMaterial(b,'x',Math.sign(ox),x,y,z),Math.min(wz,bottom,top));
    if(Math.abs(wz)<=tol)face(Math.abs(wz),0,0,Math.sign(oz),boxMaterial(b,'z',Math.sign(oz),x,y,z),Math.min(wx,bottom,top));
    const edge=Math.min(wx,wz);
    if(Math.abs(top)<=tol)face(Math.abs(top),0,1,0,boxMaterial(b,'y',1,x,y,z),edge);
    if(b.base&&Math.abs(bottom)<=tol)face(Math.abs(bottom),0,-1,0,boxMaterial(b,'y',-1,x,y,z),edge);
  }
  for(const r of map.ramps||[]){
    const ax=r.axis==='x',along=ax?x-r.x:z-r.z,across=ax?z-r.z:x-r.x;
    const len=ax?r.w:r.d,wid=ax?r.d:r.w,edgeA=len/2-Math.abs(along),edgeB=wid/2-Math.abs(across);
    const slope=r.h*r.sign/len,inv=1/Math.hypot(1,slope),under=r.h*.5+along*slope-y;
    if(Math.min(edgeA,edgeB,under*inv,y)<-tol)continue;
    face(Math.abs(under)*inv,ax?-slope*inv:0,inv,ax?0:-slope*inv,r.kind==='dock'?'metal':'concrete',Math.min(edgeA,edgeB));
    face(Math.abs(edgeB),ax?0:Math.sign(across),0,ax?Math.sign(across):0,'metal',Math.min(edgeA,y,under));
    face(Math.abs(along-r.sign*len/2),ax?r.sign:0,0,ax?0:r.sign,'metal',Math.min(edgeB,y,under));
  }
  return nearest===Infinity?null:out;
}

export class ImpactParticlePool{
  constructor(capacity=96){
    this.particles=Array.from({length:Math.max(0,Math.floor(capacity))},()=>({
      active:false,kind:'concrete',x:0,y:0,z:0,px:0,py:0,pz:0,vx:0,vy:0,vz:0,
      size:0,color:0,age:0,life:0,alpha:0,angle:0,spin:0,initialSize:0
    }));
    this.cursor=0;this.state=1;
  }
  random(){this.state=(Math.imul(this.state,1664525)+1013904223)>>>0;return this.state/4294967296;}
  emit(end,hit,seed=0,countLimit=Infinity){
    const profile=hit&&SURFACE_FX[hit.kind];if(!profile||!this.particles.length)return 0;
    const count=Math.max(0,Math.min(profile.count,this.particles.length,Math.floor(countLimit)));
    this.state=(seed|0)^Math.imul(Math.round(end.ex*64),73856093)^Math.imul(Math.round(end.ey*64),19349663)^Math.imul(Math.round(end.ez*64),83492791);
    const {nx,ny,nz}=hit;
    // Pick a stable tangent even when the face is the floor or the underside of a deck.
    const vertical=Math.abs(ny)>.9;
    const tx=vertical?0:nz,ty=vertical?nz:0,tz=vertical?-ny:-nx;
    const inv=1/(Math.hypot(tx,ty,tz)||1);
    const ax=tx*inv,ay=ty*inv,az=tz*inv,bx=ny*az-nz*ay,by=nz*ax-nx*az,bz=nx*ay-ny*ax;
    for(let i=0;i<count;i++){
      const p=this.particles[this.cursor];this.cursor=(this.cursor+1)%this.particles.length;
      const theta=this.random()*Math.PI*2,rad=Math.sqrt(this.random()),a=Math.cos(theta)*rad,b=Math.sin(theta)*rad;
      const outward=.35+.65*this.random(),speed=profile.speed*(.35+.90*this.random());
      const spread=profile.spread;
      p.vx=(nx*outward+spread*(ax*a+bx*b))*speed;
      p.vy=(ny*outward+spread*(ay*a+by*b))*speed;
      p.vz=(nz*outward+spread*(az*a+bz*b))*speed;
      p.x=p.px=end.ex+.012*nx;p.y=p.py=end.ey+.012*ny;p.z=p.pz=end.ez+.012*nz;
      p.active=true;p.kind=hit.kind;p.age=0;p.life=profile.life*(.68+.57*this.random());
      p.initialSize=p.size=profile.size*(.66+.61*this.random());p.alpha=profile.opacity;
      p.color=this.random()<.37?profile.highlight:profile.color;
      p.angle=theta;p.spin=(this.random()-.5)*16;
    }
    return count;
  }
  step(dt){
    if(!(dt>0))return;
    for(const p of this.particles){
      if(!p.active)continue;
      p.age+=dt;
      if(p.age>=p.life){p.active=false;p.alpha=0;continue;}
      const profile=SURFACE_FX[p.kind],life=p.age/p.life,drag=Math.exp(-profile.drag*dt),distance=(1-drag)/profile.drag;
      const fall=profile.gravity/profile.drag;
      p.px=p.x;p.py=p.y;p.pz=p.z;
      p.x+=p.vx*distance;p.y+=(p.vy+fall)*distance-fall*dt;p.z+=p.vz*distance;
      p.vx*=drag;p.vy=(p.vy+fall)*drag-fall;p.vz*=drag;p.angle+=p.spin*dt;
      const dust=p.kind==='concrete'||p.kind==='fabric';
      p.size=p.initialSize*(dust?1+life*1.1:1-life*.20);
      p.alpha=profile.opacity*Math.min(1,(1-life)*(dust?1.35:2.2));
    }
  }
  clear(){for(const p of this.particles){p.active=false;p.alpha=0;}this.cursor=0;}
}
