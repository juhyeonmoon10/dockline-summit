// Canvas software renderer for managed devices where Chrome cannot create a WebGL context.
// Reciprocal-depth tests keep players, short cover and the aim point correctly aligned.
import { eyeHeight, WEAPONS } from './sim.js';
import { dummyBody, dummyStand } from './range-dummy.js';
import { pelletTrails, pelletSpan, PELLET_LIFE, PELLET_CAPACITY } from './shot-path.js';

// 640×360 snapshots of the exact Kenney Blaster Kit rigs used by the WebGL view.
// Each pair of muzzle positions is the projected world-space flash on the hip/ADS rig.
const blasterFrames = {
  rifle:[0,.569,.624,.602], shotgun:[1,.572,.597,.596],
  sniper:[2,.542,.587,0], pistol:[3,.623,.728,.647]
};
function blasterPose(p,t,view,w,h,kick,kind=p.active){
  const ads=!!(view.ads??p.ads),frame=blasterFrames[kind]||blasterFrames.rifle;
  const gunWidth=Math.max(w,h*16/9),left=(w-gunWidth)*.5,movement=Math.min(1,(p.speed||0)*.16)*(ads?.17:1);
  const reloadPose=p.reload>0?Math.sin(Math.PI*Math.max(0,Math.min(1,1-p.reload/(p.reloadDuration||WEAPONS[kind]?.reload||1)))):0;
  const mx=left+gunWidth*(ads?.5:frame[1]),my=h*(ads?frame[3]:frame[2]);
  const dx=Math.sin(t*10)*h*.005*movement,dy=Math.abs(Math.cos(t*10))*h*.006*movement+h*(kick*.018+reloadPose*.20);
  return {frame,gunWidth,left,mx,my,dx,dy,reloadPose,kick};
}

const rgb = (r,g,b) => ((255<<24)|(b<<16)|(g<<8)|r)>>>0;
function tint(hex,light=1) {
  return rgb(Math.round((hex>>16)*light),Math.round((hex>>8&255)*light),Math.round((hex&255)*light));
}
function surface(size,paint) {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}); paint(ctx,size);
  const pixels=new Uint32Array(ctx.getImageData(0,0,size,size).data.buffer);
  const shades=[.65,.83,1].map(level=>Uint32Array.from(pixels,v=>rgb(Math.round((v&255)*level),Math.round((v>>8&255)*level),Math.round((v>>16&255)*level))));
  return { size, shades };
}
function panelMaterial(color, crossColor) {
  const mat = surface(64, (c, s) => {
    c.fillStyle=color; c.fillRect(0,0,s,s);
    c.fillStyle='rgba(27,53,69,.20)'; c.fillRect(0,0,s,1.7); c.fillRect(0,0,1.7,s);
    c.fillStyle='rgba(255,255,255,.40)'; c.fillRect(2,2,s-2,.8); c.fillRect(2,2,.8,s-2);
    c.fillStyle=crossColor;
    for (const u of [0,s]) for (const v of [0,s]) {
      c.fillRect(u-4,v-.8,8,1.6); c.fillRect(u-.8,v-4,1.6,8);
    }
  });
  mat.repeat=1.2;
  return mat;
}
function groundMaterial(map) {
  return surface(512,(c,s)=>{
    const scaleX=s/map.width,scaleZ=s/map.depth;
    const x=wx=>(wx+map.width*.5)*scaleX, z=wz=>(wz+map.depth*.5)*scaleZ;
    c.fillStyle='#cbd6d8';c.fillRect(0,0,s,s);
    const grad=c.createLinearGradient(0,s,s,0);grad.addColorStop(0,'rgba(178,202,214,.3)');grad.addColorStop(.62,'rgba(244,250,240,.11)');grad.addColorStop(1,'rgba(252,226,192,.4)');c.fillStyle=grad;c.fillRect(0,0,s,s);
    const line=(x1,z1,x2,z2,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x(x1),z(z1));c.lineTo(x(x2),z(z2));c.stroke();};
    for(let q=0;q<map.width*.5;q+=1.2)for(const side of [-1,1])line(q*side,-map.depth/2,q*side,map.depth/2,'rgba(67,95,109,.30)',.8);
    for(let q=0;q<map.depth*.5;q+=1.2)for(const side of [-1,1])line(-map.width/2,q*side,map.width/2,q*side,'rgba(67,95,109,.30)',.8);
    for(const side of [-1,1]){
      const color=side===1?'#659ecc':'#da987a';
      line(-map.width*.45,side*(map.depth*.47), map.width*.45,side*(map.depth*.47),color,3);
      for(const sx of [-1,1])line(sx*(map.width*.455),side*.55,sx*(map.width*.455),side*(map.depth*.47),color,2);
      const spawnX=3.2*side;
      for(let i=0;i<3;i++){
        const at=side*(map.depth*.38-i*.6);
        line(spawnX-.42,at+.24*side,spawnX,at-.16*side,'#f1f2dd',2.5);
        line(spawnX+.42,at+.24*side,spawnX,at-.16*side,'#f1f2dd',2.5);
      }
    }
    // Directional contact shadows baked into the floor once, including the shade below the bridge.
    for(const b of [...map.boxes,...map.ramps]){
      const shift=Math.min(1.8,b.h*.38),xx=x(b.x-b.w/2),zz=z(b.z-b.d/2);
      c.fillStyle=b.base?'rgba(64,80,92,.32)':'rgba(64,80,92,.18)';c.shadowColor='rgba(40,68,82,.22)';c.shadowBlur=3;
      c.fillRect(xx+shift*scaleX,zz-shift*scaleZ,b.w*scaleX,b.d*scaleZ);c.shadowBlur=0;
    }
  });
}
function createMaterials(map) {
  const target=surface(64,(c,s)=>{c.fillStyle='#314753';c.fillRect(0,0,s,s);for(const [r,color] of [[30,'#f3f6df'],[23,'#d0835f'],[17,'#eeeeda'],[11,'#c36340'],[4,'#ffe25d']]){c.fillStyle=color;c.beginPath();c.arc(32,32,r,0,Math.PI*2);c.fill();}});
  const baseSign=(n,color)=>surface(128,(c,s)=>{c.fillStyle=color;c.fillRect(0,0,s,s);c.fillStyle='#f8f7ef';c.font='italic bold 73px Arial';c.textAlign='center';c.fillText(n,62,86);c.fillRect(37,96,51,4);});
  return {
    white:panelMaterial('#e2e8e6','#8fa2a9'),ice:panelMaterial('#cbd7db','#879ba7'),steel:panelMaterial('#a8b9c0','#788c98'),
    blueside:panelMaterial('#a9c6dc','#799bb3'),redside:panelMaterial('#e7c4b3','#b79585'),
    ground:groundMaterial(map),target,bluebase:baseSign('01','#427da5'),redbase:baseSign('02','#c67450')
  };
}

function quad(mesh,vertices,material,shade=2) {
  const uv=[[0,1],[1,1],[1,0],[0,0]];
  if(material?.repeat) {
    const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    const ru=length(vertices[0],vertices[1])/material.repeat,rv=length(vertices[1],vertices[2])/material.repeat;
    for(const v of uv){v[0]*=ru;v[1]*=rv;}
  }
  mesh.push({vertices:vertices.map((v,i)=>[...v,...uv[i]]),material,shade});
}
function block(mesh,x,y,z,w,h,d,mat,yaw=0,base=false) {
  const sy=Math.sin(yaw),cy=Math.cos(yaw);
  const v=(sx,sy1,sz)=>[x+sx*w*.5*cy-sz*d*.5*sy,y+sy1*h,z+sx*w*.5*sy+sz*d*.5*cy];
  const p=[v(-1,0,-1),v(1,0,-1),v(1,0,1),v(-1,0,1),v(-1,1,-1),v(1,1,-1),v(1,1,1),v(-1,1,1)];
  for(const [ids,k] of [[[0,1,5,4],1],[[2,3,7,6],1],[[3,0,4,7],0],[[1,2,6,5],0],[[4,5,6,7],2]])quad(mesh,ids.map(i=>p[i]),mat,k);
  if(base)quad(mesh,[p[0],p[1],p[2],p[3]],0x7e929d,0);
}
function rampFace(geo,r,materials) {
  const mat=r.kind==='summit'?materials.white:materials.ice;
  const along=r.axis==='x'?r.w:r.d,across=r.axis==='x'?r.d:r.w;
  function p(offset,travel,height){
    return r.axis==='x'?[r.x+travel*r.sign,height,r.z+offset]:[r.x+offset,height,r.z+travel*r.sign];
  }
  const lo=-along*.5,hi=along*.5,left=-across*.5,right=across*.5;
  quad(geo,[p(left,lo,0),p(right,lo,0),p(right,hi,r.h),p(left,hi,r.h)],mat);
  quad(geo,[p(left,hi,0),p(right,hi,0),p(right,hi,r.h),p(left,hi,r.h)],materials.steel,0);
  for(const edge of [left,right]){
    quad(geo,[p(edge,lo,0),p(edge,hi,0),p(edge,hi,r.h),p(edge,lo,0)],materials.steel,1);
    const stripe=edge===left?edge+.13:edge-.13, inner=edge===left?stripe+.085:stripe-.085;
    quad(geo,[p(stripe,lo,.018),p(inner,lo,.018),p(inner,hi,r.h+.018),p(stripe,hi,r.h+.018)],r.kind==='summit'?0xeab959:0x577886);
  }
}
function makeScene(map,m) {
  const geo=[],w=map.width/2,d=map.depth/2;
  quad(geo,[[-w,0,d],[w,0,d],[w,0,-d],[-w,0,-d]],m.ground);
  for(const b of map.boxes){
    const base=b.base||0,height=b.h-base, top=b.kind==='summit',sideMat=b.kind==='block'?(b.z>0?m.blueside:m.redside):b.kind==='pier'?m.steel:m.white;
    block(geo,b.x,base,b.z,b.w,height,b.d,sideMat,0,base>0);
    if(top||b.kind==='pod'||b.kind==='terrace'){
      block(geo,b.x,b.h-(top?.19:.13),b.z,b.w+.024,top?.12:.065,b.d+.024,top?0x5b7788:0x70909c);
      block(geo,b.x,b.h-.064,b.z,b.w+.03,.038,b.d+.03,top?0xf4ca55:0xe9efed);
    }
  }
  for(const r of map.ramps)rampFace(geo,r,m);
  const {x:cx,z:cz,y:cy,r:rad}=map.zone;
  for(let i=0;i<36;i++){
    const a=i*Math.PI/18,b=(i+1)*Math.PI/18;
    const pt=(r,theta)=>[cx+r*Math.cos(theta),cy+.014,cz+r*Math.sin(theta)];
    quad(geo,[pt(rad-.07,a),pt(rad,a),pt(rad,b),pt(rad-.07,b)],0xe4b54c);
  }
  const ground=0x8da4a6;
  for(const side of [-1,1]){
    const ink=side>0?0x337bb5:0xef8151, portal=side>0?m.bluebase:m.redbase;
    block(geo,side*(w+.12),-.1,0,.22,4.1,2*d+.25,m.ice);
    block(geo,0,-.1,side*(d+.14),2*w+.25,4.1,.24,m.ice);
    block(geo,side*(w+.12),3.78,0,.26,.21,2*d+.30,0xa5b9bd);
    block(geo,0,3.78,side*(d+.14),2*w+.30,.21,.26,0xa5b9bd);
    block(geo,0,0,side*(d+.055),6.0,3.25,.10,0x4b6876);block(geo,0,3.2,side*(d-.015),6.23,.26,.20,ink);
    for(const px of [-2.98,2.98])block(geo,px,0,side*(d-.015),.23,3.22,.20,ink);
    const zz=side*(d-.02);
    quad(geo,[[.85*side,.92,zz],[-.85*side,.92,zz],[-.85*side,2.62,zz],[.85*side,2.62,zz]],portal);
    for(const q of [-1,1]){
      // The spectator gallery is off the playing surface and cannot mask a playable ledge.
      const x=side*(w+3.8), z=q*d*.48;
      for(let i=0;i<3;i++)block(geo,x+side*i*.62,3+i*.42,z,2.75,.45,14.2,i===2?0x607e8b:ground);
      block(geo,x,6.2,z,5.1,.30,14.6,0xd9e4e0,0,true);
      for(const j of [-5.7,5.7])block(geo,x+side*1.55,3.8,z+j,.17,2.45,.20,0x647f86);
    }
  }
  // Distant facets stay desaturated so the pale court and colored players read first.
  for(const [radius,base,amp,col] of [[74,10.2,8.3,0xa8c5c7],[57,6.3,4.3,0x92adae]]){
    const ridge=a=>base+amp*(.46*Math.sin(a*3+.8)+.33*Math.sin(a*7)+.21*Math.sin(a*13-.6));
    for(let i=0;i<72;i++){
      const a=i*Math.PI/36,b=(i+1)*Math.PI/36, pos=(angle,level)=>[Math.cos(angle)*radius,level,Math.sin(angle)*radius];
      quad(geo,[pos(a,-1),pos(b,-1),pos(b,ridge(b)),pos(a,ridge(a))],col);
    }
  }
  return geo;
}

function operator(dst,p,clock) {
  const h=eyeHeight(p)/1.55,y=p.y,x=p.x,z=p.z,yaw=p.yaw,sy=Math.sin(yaw),cy=Math.cos(yaw);
  const color=p.team===0?0x369fde:0xeb754b,dark=0x263d49;
  const part=(sx,yy,sz,w,hh,d,col)=>block(dst,x+sx*cy-sz*sy,y+yy*h,z+sx*sy+sz*cy,w,hh*h,d,col,yaw);
  const stride=p.speed>1?Math.sin(clock*10+p.seat*2)*.12:0;
  part(-.16,0,stride,.23,.71,.30,dark);part(.16,0,-stride,.23,.71,.30,dark);
  part(0,.69,0,.55,.59,.38,color);part(0,.82,-.14,.42,.24,.16,0x394e59);
  part(-.33,.82,-.08,.16,.42,.20,color);part(.33,.82,-.14,.17,.42,.22,color);
  part(0,1.30,0,.45,.39,.43,color);part(0,1.43,-.206,.42,.115,.035,0x1b2c39);
  part(.1,1.45,-.232,.13,.024,.02,0xbfedef);part(.24,.93,-.39,.13,.13,.54,0x253641);
}

function dummyFaces(target,faces) {
  const sy=Math.sin(target.yaw),cy=Math.cos(target.yaw);
  return faces.map(({points,color,shade})=>({
    material:color,shade,
    vertices:points.map(([x,y,z])=>[target.x+x*cy-z*sy,target.y+y,target.z+x*sy+z*cy,0,0])
  }));
}

function cameraVertex(cam,v) {
  const dx=v[0]-cam.x,dy=v[1]-cam.y,dz=v[2]-cam.z;
  const forward=dx*cam.sy-dz*cam.cy;
  return [dx*cam.cy+dz*cam.sy,dy*cam.cp-forward*cam.sp,forward*cam.cp+dy*cam.sp,v[3],v[4]];
}
function clipNear(vertices) {
  const result=[];let last=vertices[vertices.length-1];
  for(const v of vertices) {
    if ((last[2]>.12)!==(v[2]>.12)) { const t=(.12-last[2])/(v[2]-last[2]);result.push(last.map((a,i)=>a+(v[i]-a)*t)); }
    if(v[2]>.12)result.push(v);last=v;
  }
  return result;
}

export class LiteRenderer {
  constructor(canvas,map) {
    this.canvas=canvas;this.map=map;this.ctx=canvas.getContext('2d',{alpha:false});
    if (!this.ctx) throw new Error('Canvas 2D를 시작할 수 없습니다.');
    this.materials=createMaterials(map);this.staticMesh=makeScene(map,this.materials);this.lastSeq=0;this.recoil=0;
    this.blasterAtlas=document.getElementById('blaster-atlas') || new Image();
    if (!this.blasterAtlas.src) this.blasterAtlas.src='./assets/blaster-views.webp';
    this.trails=[];this.quality='auto';this.lastFrame=-1;this.lastGame=null;this.scale=1;
    this.pellets=Array.from({length:PELLET_CAPACITY},()=>({age:PELLET_LIFE}));this.pelletIndex=0;this.lastElapsed=-1;this.lastRound=null;
    this.dummyMeshes=new WeakMap();this.dummyHits=new Map();
  }
  setQuality(q){this.quality=q;this.lastFrame=-1;}
  resize() { this.lastFrame=-1; }
  dispose() {this.staticMesh=[];this.trails=[];this.clearPellets();this.lastGame=null;}
  clearPellets(){for(const pellet of this.pellets)pellet.age=PELLET_LIFE;this.pelletIndex=0;}
  anchorPellet(pellet,cam,p,t,view){
    if(!pellet.own)return;
    const depth=.9,end=cameraVertex(cam,[pellet.ex,pellet.ey,pellet.ez,0,0]);
    if(end[2]<=depth+.03)return;
    let screenX,screenY;
    if(this.blasterAtlas.complete&&this.blasterAtlas.naturalWidth){
      const pose=blasterPose(p,t,view,this.width,this.height,this.recoil,'shotgun');
      screenX=pose.mx+pose.dx;screenY=pose.my+pose.dy;
    }else{
      const ads=!!(view.ads??p.ads),bob=p.speed>1?Math.sin(t*10)*.006:0;
      screenX=this.width*(ads?.5:.57)+this.height*bob;
      screenY=this.height*(ads?.56:.64)+this.height*(this.recoil*.045+(p.reload>0?.17:0));
    }
    // Invert the camera projection at the visible barrel, retaining the hitscan endpoint.
    const right=(screenX-this.width*.5)*depth/this.focal,up=(this.height*.5-screenY)*depth/this.focal;
    const forward=depth*cam.cp-up*cam.sp;
    pellet.x=cam.x+right*cam.cy+forward*cam.sy;pellet.y=cam.y+up*cam.cp+depth*cam.sp;pellet.z=cam.z+right*cam.sy-forward*cam.cy;
    pellet.dx=pellet.ex-pellet.x;pellet.dy=pellet.ey-pellet.y;pellet.dz=pellet.ez-pellet.z;
    pellet.length=Math.hypot(pellet.dx,pellet.dy,pellet.dz);
  }
  project(v) {const iz=1/v[2],f=this.focal*iz;return [this.width*.5+v[0]*f,this.height*.5-v[1]*f,iz,v[3]*iz,v[4]*iz];}
  triangle(a,b,c,texture,color) {
    const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(this.width-1,Math.ceil(Math.max(a[0],b[0],c[0])));
    const minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(this.height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    if(maxX<minX || maxY<minY)return;
    const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<.02)return;
    const ax=(b[1]-c[1])/det,ay=(c[0]-b[0])/det,bx=(c[1]-a[1])/det,by=(a[0]-c[0])/det;
    const az=a[2]-c[2],bz=b[2]-c[2],au=a[3]-c[3],bu=b[3]-c[3],av=a[4]-c[4],bv=b[4]-c[4];
    const size=texture?.size??0, tex=texture?.tex, repeats=texture?.repeats, mask=size-1, pix=this.pixels,zbuf=this.depth,width=this.width;
    for(let y=minY;y<=maxY;y++) {
      let wa=(minX+.5-c[0])*ax+(y+.5-c[1])*ay,wb=(minX+.5-c[0])*bx+(y+.5-c[1])*by;
      for(let x=minX,i=y*width+x;x<=maxX;x++,i++,wa+=ax,wb+=bx) {
        if(wa<0||wb<0||wa+wb>1)continue;
        const iz=c[2]+wa*az+wb*bz;if(iz<=zbuf[i])continue;
        zbuf[i]=iz;
        if(tex){const uu=((c[3]+wa*au+wb*bu)/iz*size)|0,vv=((c[4]+wa*av+wb*bv)/iz*size)|0;
          const u=repeats?(uu&mask):Math.max(0,Math.min(mask,uu)),v=repeats?(vv&mask):Math.max(0,Math.min(mask,vv));pix[i]=tex[v*size+u];}
        else pix[i]=color;
      }
    }
  }
  faces(geo,cam) {
    for(const face of geo){
      let v=face.vertices.map(p=>cameraVertex(cam,p));if(v.every(p=>p[2]<=.12))continue;
      if(v.some(p=>p[2]<=.12))v=clipNear(v);if(v.length<3)continue;
      const p=v.map(q=>this.project(q));
      if(p.every(v=>v[0]<0)||p.every(v=>v[0]>this.width)||p.every(v=>v[1]<0)||p.every(v=>v[1]>this.height))continue;
      const mat=face.material,tex=typeof mat==='object'?{size:mat.size,repeats:!!mat.repeat,tex:mat.shades[face.shade]}:null;
      const col=tex?0:tint(mat,[.65,.83,1][face.shade]);
      for(let i=1;i<p.length-1;i++)this.triangle(p[0],p[i],p[i+1],tex,col);
    }
  }
  pelletStroke(cam,pellet,span){
    let a=cameraVertex(cam,[pellet.x+pellet.dx*span.tail,pellet.y+pellet.dy*span.tail,pellet.z+pellet.dz*span.tail,0,0]);
    let b=cameraVertex(cam,[pellet.x+pellet.dx*span.head,pellet.y+pellet.dy*span.head,pellet.z+pellet.dz*span.head,0,0]);
    if(a[2]<.14&&b[2]<.14)return;
    if(a[2]<.14||b[2]<.14){
      const t=(.14-a[2])/(b[2]-a[2]),edge=a.map((v,i)=>v+(b[i]-v)*t);
      if(a[2]<.14)a=edge;else b=edge;
    }
    a=this.project(a);b=this.project(b);
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
    let lo=0,hi=1;
    // Clip to the viewport before spending any depth samples.
    for(const [p,q] of [[-dx,a[0]],[dx,this.width-1-a[0]],[-dy,a[1]],[dy,this.height-1-a[1]]]){
      if(Math.abs(p)<1e-9){if(q<0)return;continue;}
      const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)return;
    }
    const steps=Math.min(96,Math.max(1,Math.ceil(Math.hypot(dx,dy)*(hi-lo))));
    const paths=[new Path2D(),new Path2D(),new Path2D()];let previous=null;
    for(let i=0;i<=steps;i++){
      const t=lo+(hi-lo)*i/steps,x=a[0]+dx*t,y=a[1]+dy*t,iz=a[2]+dz*t;
      const px=Math.min(this.width-1,Math.max(0,Math.round(x))),py=Math.min(this.height-1,Math.max(0,Math.round(y)));
      const visible=iz+Math.max(.00012,iz*.006)>=this.depth[py*this.width+px];
      if(visible&&previous){const path=paths[Math.min(2,Math.floor(t*3))];path.moveTo(previous[0],previous[1]);path.lineTo(x,y);}
      previous=visible?[x,y]:null;
    }
    const c=this.ctx;c.lineCap='round';
    for(let i=0;i<3;i++){
      c.strokeStyle=i===2?'#fff5cf':'#f0bd70';c.globalAlpha=span.alpha*[.35,.65,.95][i];c.lineWidth=[.45,.8,1.05][i];c.stroke(paths[i]);
    }
    c.globalAlpha=1;c.lineCap='butt';
  }
  pelletImpact(cam,pellet,alpha){
    const v=cameraVertex(cam,[pellet.ex,pellet.ey,pellet.ez,0,0]);if(v[2]<.14)return;
    const [x,y,iz]=this.project(v),px=Math.round(x),py=Math.round(y);
    if(px<1||py<1||px>=this.width-1||py>=this.height-1)return;
    const tolerance=Math.max(.00012,iz*.012),surface=this.depth[py*this.width+px];
    // No hit flecks in empty space, behind cover, or on a different surface.
    if(!surface||Math.abs(surface-iz)>tolerance)return;
    const c=this.ctx;c.globalAlpha=alpha*.9;
    for(const [dx,dy] of [[0,0],[-1,-1],[1,1],[2,-1]]){
      const xx=px+dx,yy=py+dy;if(xx<0||yy<0||xx>=this.width||yy>=this.height)continue;
      if(Math.abs(this.depth[yy*this.width+xx]-iz)>tolerance)continue;
      c.fillStyle=dx===0?'#fff4c5':pellet.target?'#ffc976':'#db9950';c.fillRect(xx,yy,1,1);
    }
    c.globalAlpha=1;
  }
  weapon(p,t,view) {
    const c=this.ctx,w=this.width,h=this.height,ads=!!(view.ads??p.ads),reload=p.reload>0;
    const gun=p.active, isPistol=gun==='pistol', isShot=gun==='shotgun',isSniper=gun==='sniper';
    if(ads&&isSniper) {c.save();c.fillStyle='rgba(5,12,18,.87)';c.beginPath();c.rect(0,0,w,h);c.arc(w/2,h/2,h*.42,0,Math.PI*2,true);c.fill('evenodd');c.strokeStyle='rgba(26,30,30,.8)';c.lineWidth=1;c.beginPath();c.moveTo(w/2-h*.42,h/2);c.lineTo(w/2+h*.42,h/2);c.moveTo(w/2,h/2-h*.42);c.lineTo(w/2,h/2+h*.42);c.stroke();c.restore();return;}
    if(this.blasterAtlas.complete&&this.blasterAtlas.naturalWidth){
      const {frame,gunWidth,left,mx,my,dx,dy,reloadPose,kick}=blasterPose(p,t,view,w,h,this.recoil);
      this.shotPoint=[mx+dx,my+dy];
      c.save();c.translate(mx+dx,my+dy);c.rotate(reloadPose*.28+kick*.014);c.scale(1+kick*.035,1+kick*.035);
      if(kick>.53){
        const radius=h*(isPistol?.029:.041)*kick;
        c.fillStyle='#ffad34';c.beginPath();
        for(let i=0;i<10;i++){const a=i*Math.PI/5-.9*t,r=i%2?radius*.28:radius*(i%3?.85:1.2);const x=Math.cos(a)*r,y=Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}
        c.closePath();c.fill();c.fillStyle='#fff4be';c.beginPath();c.arc(0,0,radius*.32,0,Math.PI*2);c.fill();
      }
      c.drawImage(this.blasterAtlas,ads?640:0,frame[0]*360,640,360,left-mx,-my,gunWidth,h);c.restore();return;
    }
    c.save();const bob=p.speed>1?Math.sin(t*10)*.006:0;
    c.translate(w*(ads?.5:.57)+h*bob,h*(ads?.56:.64)+h*(this.recoil*.045+(reload?.17:0)));c.scale(h*.0019,h*.0019);if(reload)c.rotate(.20);
    const poly=(color,pts)=>{c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
    const gunColor=isShot?'#ba784f':isSniper?'#6b9491':'#899598';
    if(this.recoil>.4){poly('#ffd25b',[[-10,-3],[-29,-20],[-5,-13],[2,-38],[7,-11],[24,-23],[14,-1]]);poly('#fff2c4',[[-7,0],[2,-19],[10,0]]);}
    poly('#26313b',[[-6,0],[6,-2],[29,14],[24,25],[1,9]]);poly('#a4aaa1',[[-6,0],[5,-4],[29,12],[20,16]]);
    const front=isPistol?10:19, back=isPistol?81:128;
    poly('#273a43',[[front,10],[front+14,7],[back+26,49],[back+10,91],[front+1,39]]);
    poly(gunColor,[[front-4,14],[front+13,7],[back+23,48],[back-6,57]]);
    poly(isShot?'#754731':'#4b5e64',[[front-4,14],[back-6,57],[back+10,91],[front-4,38]]);
    for(let i=0;i<(isPistol?2:5);i++) {let x=front+8+i*10;poly('#33464e',[[x,23+i*3],[x+4,25+i*3],[x+4,32+i*3],[x,30+i*3]]);}
    poly('#253642',[[back-12,53],[back+16,49],[back+64,76],[back+53,115],[back+12,102]]);
    poly('#566773',[[back-12,53],[back+17,47],[back+62,68],[back+37,80]]);
    poly('#c4a180',[[45,53],[56,44],[72,46],[86,62],[77,75],[55,73]]);
    poly('#343f45',[[53,66],[75,62],[96,73],[114,115],[77,108],[58,87]]);
    poly('#25343d',[[109,86],[138,74],[197,105],[242,200],[133,205]]);
    if(isSniper){poly('#202e38',[[38,16],[49,4],[81,16],[83,29],[68,33]]);}
    else{c.strokeStyle='#232e35';c.lineWidth=3;c.strokeRect(21,4,6,8);}c.restore();
  }
  draw(game,selfId,view={}) {
    const began=performance.now(), now=began/1000,playing=Boolean(game)&&!view.lobby;
    this.quality=view.quality||this.quality;
    const sizeX=this.canvas.clientWidth||innerWidth,sizeY=this.canvas.clientHeight||innerHeight;
    const cap=(this.quality==='low'?425:playing?535:690)*this.scale;
    const factor=Math.min(1,cap/Math.max(sizeX,sizeY));const w=Math.max(2,Math.round(sizeX*factor)),h=Math.max(2,Math.round(sizeY*factor));
    if(w!==this.width||h!==this.height){this.width=this.canvas.width=w;this.height=this.canvas.height=h;this.image=this.ctx.createImageData(w,h);this.pixels=new Uint32Array(this.image.data.buffer);this.depth=new Float32Array(w*h);this.lastFrame=-1;}
    if(now<this.lastFrame){this.lastFrame=-1;this.clearPellets();}
    if(this.lastFrame>=0 && now-this.lastFrame<(playing?1/45:1/18))return;
    const dt=this.lastFrame<0?.03:Math.min(.1,now-this.lastFrame);this.lastFrame=now;
    const p=playing?(game.players.find(v=>v.id===(view.spectatorId||selfId))||game.players[0]):null;
    const mode=Boolean(p), yaw=mode?(view.yaw??p.yaw):-.58+Math.sin(now*.045)*.012;
    const pitch=mode?(view.pitch??p.pitch):-.22;
    const cam={x:mode?p.x:13,y:mode?p.y+eyeHeight(p):7.1,z:mode?p.z:20,sy:Math.sin(yaw),cy:Math.cos(yaw),sp:Math.sin(pitch),cp:Math.cos(pitch)};
    const fov=mode?((view.ads??p.ads)?(p.active==='sniper'?26:58):75):58;
    this.focal=(h/2)/Math.tan(fov*Math.PI/360);this.depth.fill(0);
    for(let y=0;y<h;y++){const sky=Math.max(0,Math.min(1,.45-(y-h*.5)/(h*.8)+pitch*1.1));const c=rgb(219-sky*103,234-sky*57,240-sky*18);this.pixels.fill(c,y*w,(y+1)*w);}
    this.faces(this.staticMesh,cam);
    if(playing){
      const dynamic=[];
      for(const actor of game.players)if(actor.alive&&actor.id!==p?.id)operator(dynamic,actor,now);
      for(const target of game.targets||[]){
        if(target.kind==='dummy'){
          let model=this.dummyMeshes.get(target);
          if(!model){
            const body=dummyFaces(target,dummyBody);
            const flash=body.map(face=>({...face,material:0xffe59d}));
            model={stand:dummyFaces(target,dummyStand),body,flash};
            this.dummyMeshes.set(target,model);
          }
          this.faces(model.stand,cam);
          if(target.alive)this.faces(this.dummyHits.get(target.id)>now?model.flash:model.body,cam);
        }else{
          const {x,y,z,r}=target;
          quad(dynamic,[[x-r,y-r,z],[x+r,y-r,z],[x+r,y+r,z],[x-r,y+r,z]],this.materials.target);
        }
      }
      if(game.phase==='overtime'){
        const {x,y,z,r}=this.map.zone;
        const color=game.capture?.team===0?0x71c5f5:game.capture?.team===1?0xff9476:0xf7d45c;
        for(let i=0;i<24;i++){
          const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
          const pt=(rad,angle)=>[x+rad*Math.cos(angle),(y||0)+.035,z+rad*Math.sin(angle)];
          quad(dynamic,[pt(r-.15,a),pt(r,a),pt(r,b),pt(r-.15,b)],color);
        }
      }
      this.faces(dynamic,cam);
    }
    this.ctx.putImageData(this.image,0,0);
    if(performance.now()-began>40 && this.scale>.69 && this.quality==='auto')this.scale=Math.max(.69,this.scale-.08);
    if(!mode){this.lastSeq=0;this.trails=[];this.clearPellets();this.lastElapsed=-1;this.lastRound=null;this.dummyHits.clear();return;}
    if(game.seq<this.lastSeq||game.elapsed<this.lastElapsed){
      this.lastSeq=game.elapsed<this.lastElapsed?game.seq:0;this.trails=[];this.clearPellets();
    }
    if(this.lastRound!==game.round)this.clearPellets();this.lastRound=game.round;this.lastElapsed=game.elapsed;
    for(const pellet of this.pellets)if(pellet.age<PELLET_LIFE)pellet.age+=dt;
    for(const e of game.events??[]){
      if(e.seq<=this.lastSeq)continue;this.lastSeq=e.seq;
      if(e.type==='round')this.clearPellets();
      if(e.type==='shot'){
        if(e.actor===p.id)this.recoil=1;
        if(e.weapon==='shotgun')for(const pellet of pelletTrails(e,e.actor===p.id,!!(view.ads??p.ads))){
          this.anchorPellet(pellet,cam,p,now,view);Object.assign(this.pellets[this.pelletIndex++%PELLET_CAPACITY],pellet);
        }
        else this.trails.push({e,until:now+.07});
      }
      if(game.phase==='range'&&e.type==='hit')this.dummyHits.set(e.target,now+.14);
    }
    this.trails=this.trails.filter(tr=>tr.until>now);
    for(const {e} of this.trails){const a=cameraVertex(cam,[e.x,e.y,e.z,0,0]),b=cameraVertex(cam,[e.ex,e.ey,e.ez,0,0]);if(b[2]<.14)continue;const end=this.project(b);const start=e.actor===p.id?(this.shotPoint||[w*.57,h*.64]):a[2]>.13?this.project(a):null;if(!start)continue;this.ctx.strokeStyle='rgba(255,218,135,.65)';this.ctx.lineWidth=1;this.ctx.beginPath();this.ctx.moveTo(start[0],start[1]);this.ctx.lineTo(end[0],end[1]);this.ctx.stroke();}
    for(const pellet of this.pellets)if(pellet.age<PELLET_LIFE){
      const span=pelletSpan(pellet);this.pelletStroke(cam,pellet,span);
      if(span.contactAlpha>0)this.pelletImpact(cam,pellet,span.contactAlpha);
    }
    this.weapon(p,now,view);this.recoil=Math.max(0,this.recoil-dt*9);
  }
}
