// Canvas software renderer for managed devices where Chrome cannot create a WebGL context.
// Reciprocal-depth tests keep players, short cover and the aim point correctly aligned.
import { eyeHeight, WEAPONS } from './sim.js';
import { loadLiteOperators, liteOperator, posedOperator, operatorGrip } from './lite-operator.js';
import { approachAim, canAim, weaponFov, reloadPose, shotResponse, shotFlashDuration, scopeAfterShot } from './weapon-view.js';
import { fieldViews } from './assets/field-frames.js';
import { dummyBody, dummyStand } from './range-dummy.js';
import { pelletTrails, pelletSpan, PELLET_LIFE, PELLET_CAPACITY } from './shot-path.js';
import { buildSwitchyard, paintSwitchyardGround, paintSwitchyardPanel, switchyardPaints } from './switchyard-art.js';

// 640×360 snapshots of the same two-handed rigs used by the WebGL view.
// Each pair of muzzle positions is the projected world-space flash on the hip/ADS rig.
const blasterFrames = {
  rifle:[0,.562,.562,.583], shotgun:[1,.551,.590,.541],
  sniper:[2,.539,.546,0], pistol:[3,.609,.628,.564]
};
const arcadeFrames={
  smg:[0,.587,.625,.582],burst:[1,.565,.586,.597],
  marksman:[2,.541,.574,.585],lmg:[3,.561,.581,.612]
};
function closestFrame(times,time){
  let i=0;while(i+1<times.length&&time>(times[i]+times[i+1])*.5)i++;
  return i;
}
function fieldPose(p,t,aim,w,h,age,kick,atlas,motion){
  const entry=fieldViews[p.active];
  if(!entry||(!atlas?.naturalWidth&&!(entry.sheet&&motion?.naturalWidth)))return null;
  const loading=p.reload>0,cycle=!loading&&age>=0&&age<=entry.shotTimes?.at(-1),aimed=aim>=.5;
  const animated=!!(motion?.naturalWidth&&(loading||cycle||!atlas?.naturalWidth));
  let sheet=atlas,sw=640,sh=360,sx=aimed?640:0,sy=entry.row*360,ox=0,oy=0;
  let muzzle=entry.muzzles[Number(aimed)];
  if(animated){
    const progress=loading?1-p.reload/(p.reloadDuration||WEAPONS[p.active].reload):age;
    const times=loading?entry.reloadTimes:entry.shotTimes,index=closestFrame(times,progress);
    const sequence=loading?entry.poses.reload:aimed&&entry.poses.fireADS?entry.poses.fireADS:entry.poses.fire;
    let frame=sequence[index];
    if(loading&&p.active==='shotgun'){
      if(p.shellLoop&&index<entry.poses.loopStart.length)frame=entry.poses.loopStart[index];
      const endIndex=index-(times.length-entry.poses.loopEnd.length);
      if(endIndex>=0&&p.ammo+1<WEAPONS.shotgun.mag&&p.reserve!==1)frame=entry.poses.loopEnd[endIndex];
    }
    if(loading&&p.active==='sniper'&&p.reloadDuration>WEAPONS.sniper.reload+.01){
      const emptyIndex=index-times.indexOf(entry.emptyStart??.76);
      frame=entry.poses.empty[emptyIndex]??frame;
    }
    [ox,oy,sw,sh]=entry.crop;
    sheet=motion;sx=frame[0]%entry.columns*(sw+4)+2;sy=Math.floor(frame[0]/entry.columns)*(sh+4)+2;
    muzzle=frame.slice(1);
  }
  const viewWidth=h*16/9,left=(w-viewWidth)*.5;
  const base=entry.muzzles;
  const mx=animated?muzzle[0]:base[0][0]+(base[1][0]-base[0][0])*aim;
  const my=animated?muzzle[1]:base[0][1]+(base[1][1]-base[0][1])*aim;
  const travel=Math.min(1,(p.speed||0)*.16)*(1-.83*aim);
  const load=animated?0:reloadPose(p,p.active).tilt;
  const recoil=animated?0:kick;
  const x=left+viewWidth*mx+h*(Math.sin(t*10)*.005*travel+load*.026);
  const gunWidth=Math.max(viewWidth,(w-x)/(1-muzzle[0]));
  return {sheet,sw,sh,sx,sy,gunWidth,drawWidth:animated?gunWidth*sw/512:gunWidth,drawHeight:animated?h*sh/288:h,
    imageX:gunWidth*(ox/512-muzzle[0]),imageY:h*(oy/288-muzzle[1]),x,
    y:h*(my+Math.abs(Math.cos(t*10))*.006*travel-recoil*.026+load*.082),reloadPose:load,kick:recoil};
}
function blasterPose(p,t,aim,w,h,kick,kind,frame,atlas){
  const aimFrame=aim>=.5;
  const gunWidth=Math.max(w,h*16/9),left=(w-gunWidth)*.5,movement=Math.min(1,(p.speed||0)*.16)*(1-.83*aim);
  const loading=reloadPose(p,kind);
  const mx=left+gunWidth*(frame[1]+(.5-frame[1])*aim),my=h*(frame[2]+(frame[3]-frame[2])*aim);
  const dx=Math.sin(t*10)*h*.005*movement+h*loading.tilt*.026;
  const dy=Math.abs(Math.cos(t*10))*h*.006*movement+h*(-kick*.026+loading.tilt*.082-loading.bump*.012);
  // Pivot each atlas image on its own muzzle as the gun moves into the sights.
  const imageX=-gunWidth*(aimFrame?.5:frame[1]),imageY=-h*(aimFrame?frame[3]:frame[2]);
  return {frame,atlas,aimFrame,gunWidth,imageX,imageY,x:mx+dx,y:my+dy,reloadPose:loading.tilt,kick};
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
function panelMaterial(color, seamColor) {
  const mat = surface(64, (c, s) => {
    c.fillStyle=color; c.fillRect(0,0,s,s);
    c.fillStyle=seamColor;c.fillRect(0,0,s,1);c.fillRect(0,0,1,s);
    c.fillStyle='rgba(255,255,255,.34)';c.fillRect(1,1,s-1,1);
  });
  mat.repeat=2;
  return mat;
}
function cargoMaterial(color,corrugated=false){
  const mat=surface(64,(c,s)=>{
    c.fillStyle=color;c.fillRect(0,0,s,s);
    if(corrugated){
      for(let x=5;x<s;x+=8){c.fillStyle='rgba(14,41,55,.23)';c.fillRect(x,0,2,s);c.fillStyle='rgba(255,255,255,.20)';c.fillRect(x+2,0,1,s);}
    }else{
      c.fillStyle='#b6c6c8';c.fillRect(6,8,s-12,s-16);
      c.strokeStyle='#788f94';c.lineWidth=3;c.strokeRect(9,11,s-18,s-22);
      c.fillStyle='#e0e6df';c.fillRect(11,13,s-22,3);
    }
    c.fillStyle='#294553';c.fillRect(0,0,s,4);c.fillRect(0,s-4,s,4);c.fillRect(0,0,3,s);c.fillRect(s-3,0,3,s);
    c.fillStyle='#c9d6d3';for(const x of [4,s-7])for(const y of [5,s-8])c.fillRect(x,y,3,3);
  });
  // The whole door stays aligned to each collider face, without thin-rib geometry.
  return mat;
}
function groundMaterial(map) {
  return surface(512,(c,s)=>{
    const scaleX=s/map.width,scaleZ=s/map.depth;
    const x=wx=>(wx+map.width*.5)*scaleX, z=wz=>(wz+map.depth*.5)*scaleZ;
    const rect=(wx,wz,w,d,color)=>{c.fillStyle=color;c.fillRect(x(wx-w/2),z(wz-d/2),w*scaleX,d*scaleZ);};
    c.fillStyle='#e2e7e1';c.fillRect(0,0,s,s);
    for(const side of [-1,1]){
      rect(side*(map.width/2-2.8),0,5.5,map.depth,'#526975');
      rect(0,side*(map.depth/2-2.4),map.width,4.8,side>0?'#77bcd2':'#eeb582');
    }
    const line=(x1,z1,x2,z2,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x(x1),z(z1));c.lineTo(x(x2),z(z2));c.stroke();};
    for(let q=-map.width/2;q<map.width/2;q+=2)line(q,-map.depth/2,q,map.depth/2,'rgba(45,68,76,.18)',.65);
    for(let q=-map.depth/2;q<map.depth/2;q+=2)line(-map.width/2,q,map.width/2,q,'rgba(45,68,76,.18)',.65);
    for(const side of [-1,1]){
      const color=side===1?'#168fc7':'#f58c42';
      line(-map.width*.45,side*(map.depth*.47), map.width*.45,side*(map.depth*.47),color,3);
      for(const sx of [-1,1])line(sx*(map.width/2-5.6),side*.55,sx*(map.width/2-5.6),side*(map.depth*.39),'#f4f0d8',1.5);
      const spawnX=3.2*side;
      for(let i=0;i<3;i++){
        const at=side*(map.depth*.38-i*.6);
        line(spawnX-.42,at+.24*side,spawnX,at-.16*side,'#fffce9',2.5);
        line(spawnX+.42,at+.24*side,spawnX,at-.16*side,'#fffce9',2.5);
      }
      for(let i=-14;i<15;i+=2)rect(side*(map.width/2-.55),i,.32,.08,'#f7c44a');
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
  if(map.id==='switchyard'){
    const materials={target,ground:surface(512,(c,s)=>paintSwitchyardGround(c,s,s,map))};
    for(const key of switchyardPaints){
      materials[key]=surface(key==='customs'||key==='display'?256:128,(c,s)=>paintSwitchyardPanel(c,s,s,key));
    }
    return materials;
  }
  const baseSign=(n,color)=>surface(128,(c,s)=>{c.fillStyle=color;c.fillRect(0,0,s,s);c.fillStyle='#f8f7ef';c.font='italic bold 73px Arial';c.textAlign='center';c.fillText(n,62,86);c.fillRect(37,96,51,4);});
  return {
    white:panelMaterial('#e8ece7','#a5b1b1'),ice:panelMaterial('#d1dbd7','#a2b1b5'),steel:panelMaterial('#708a95','#536c78'),
    blueside:cargoMaterial('#168fc7',true),redside:cargoMaterial('#f58c42',true),cargo:cargoMaterial('#c2d0ce'),
    ground:groundMaterial(map),target,bluebase:baseSign('01','#168fc7'),redbase:baseSign('02','#e87c31')
  };
}

function quad(mesh,vertices,material,shade=2,uv=[[0,1],[1,1],[1,0],[0,0]]) {
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
    quad(geo,[p(stripe,lo,.018),p(inner,lo,.018),p(inner,hi,r.h+.018),p(stripe,hi,r.h+.018)],r.kind==='summit'?0xf6bf32:r.z>0?0x168fc7:0xf58c42);
  }
}
function makeScene(map,m) {
  const geo=[],w=map.width/2,d=map.depth/2;
  quad(geo,[[-w,0,d],[w,0,d],[w,0,-d],[-w,0,-d]],m.ground);
  if(map.id==='switchyard'){
    buildSwitchyard(map,(points,paint,shade,uv)=>quad(geo,points,typeof paint==='string'?m[paint]:paint,shade,uv),{lite:true});
    addZoneRing(geo,map.zone);
    return geo;
  }
  for(const b of map.boxes){
    const base=b.base||0,height=b.h-base,top=b.kind==='summit',accent=b.z>0?0x168fc7:0xf58c42;
    const sideMat=b.kind==='block'?(b.z>0?m.blueside:m.redside):b.kind==='pod'?m.cargo:b.kind==='pier'?0x536a77:top?0x243b4b:m.ice;
    block(geo,b.x,base,b.z,b.w,height,b.d,sideMat,0,base>0);
    // Readable deck caps and cargo trim stay within the exact collision hull.
    const lx=b.x-b.w/2,rx=b.x+b.w/2,nz=b.z-b.d/2,fz=b.z+b.d/2;
    quad(geo,[[lx,b.h+.003,fz],[rx,b.h+.003,fz],[rx,b.h+.003,nz],[lx,b.h+.003,nz]],m.white);
    if(top||b.kind==='terrace'||b.kind==='pod'){
      const band=top?0xf6bf32:accent,y=b.h-(top?.16:.13),high=top?.08:.07;
      for(const z of [nz-.003,fz+.003])quad(geo,[[lx,y,z],[rx,y,z],[rx,y+high,z],[lx,y+high,z]],band);
      if(top)for(const x of [lx-.003,rx+.003])quad(geo,[[x,y,nz],[x,y,fz],[x,y+high,fz],[x,y+high,nz]],band);
    }
  }
  for(const r of map.ramps)rampFace(geo,r,m);
  addZoneRing(geo,map.zone);
  // All facade geometry is outside the playing boundary; no decorative false cover.
  block(geo,0,-1.3,0,map.width+1.3,1.25,map.depth+1.3,0x708992);
  for(const side of [-1,1]){
    const ink=side>0?0x168fc7:0xf58c42,portal=side>0?m.bluebase:m.redbase;
    block(geo,side*(w+.22),0,0,.43,1.28,2*d+.78,m.ice);
    block(geo,0,0,side*(d+.22),2*w+.78,1.28,.43,m.ice);
    block(geo,side*(w+.22),1.23,0,.48,.13,2*d+.80,0x243b4b);
    block(geo,0,1.23,side*(d+.22),2*w+.80,.13,.48,ink);
    const gateZ=side*(d+1.1);
    block(geo,0,0,gateZ,9.5,4.65,1.25,0x334f60);
    block(geo,0,4.25,gateZ,10.2,.65,1.50,ink);
    for(const px of [-4.4,4.4])block(geo,px,0,gateZ,.7,4.9,1.55,m.white);
    const zz=gateZ-side*.64;
    quad(geo,[[1.05*side,1.55,zz],[-1.05*side,1.55,zz],[-1.05*side,3.65,zz],[1.05*side,3.65,zz]],portal);
    // Big, quiet industrial silhouettes replace the spectator galleries.
    for(const [z,height] of [[-12,10],[13,7]]){
      const x=side*(w+11.5);
      block(geo,x,-3,z,11,height,13,0x9dafb5);
      block(geo,x,height-3,z,11.5,.32,13.5,0xd8e2df);
      block(geo,x,height-2.7,z-2,3.6,1.7,4.2,0x526e7d);
      const faceX=x-side*5.51;
      quad(geo,[[faceX,height-5.3,z-5],[faceX,height-5.3,z+5],[faceX,height-4,z+5],[faceX,height-4,z-5]],0x456b80);
    }
    for(const x of [-13,12]){
      const z=side*(d+17),height=x<0?9:13;
      block(geo,x,-4,z,12,height,10,0x9cb2ba);
      block(geo,x,height-4,z,12.7,.35,10.7,0xe1e8e2);
      block(geo,x+2,height-3.65,z,3,2.2,3.4,0x607c8b);
    }
  }
  // Landmark crane follows the WebGL map's mast and jib, beyond the north wall.
  const craneZ=-26,gold=0xeeb62f,steel=0x526c7a;
  for(const x of [-27.65,-26.35])block(geo,x,0,craneZ,.25,17,.32,gold);
  const beam=(x1,y1,x2,y2,width,color=gold)=>{
    const length=Math.hypot(x2-x1,y2-y1),ox=(y2-y1)*width/length/2,oy=(x1-x2)*width/length/2;
    quad(geo,[[x1+ox,y1+oy,craneZ+.18],[x2+ox,y2+oy,craneZ+.18],[x2-ox,y2-oy,craneZ+.18],[x1-ox,y1-oy,craneZ+.18]],color);
  };
  for(let y=0;y<16;y+=2){beam(-27.65,y,-26.35,y+2,.12);beam(-26.35,y,-27.65,y+2,.12);}
  block(geo,-19,16.65,craneZ,30,.28,.55,gold);block(geo,-19,18.1,craneZ,30,.24,.55,gold);
  for(let x=-34;x<-4;x+=2.5){beam(x,16.8,x+2.5,18.12,.11);beam(x,18.12,x+2.5,16.8,.11);}
  block(geo,-27.2,15.2,craneZ,2.5,1.7,2.2,0xf8c447);
  block(geo,-27.2,15.8,craneZ+.98,2.0,.7,.16,0x375b72);
  block(geo,-10,8.6,craneZ,.065,8.1,.065,steel);
  block(geo,-10,6.5,craneZ,3.4,2.1,2.3,m.redside);
  return geo;
}

function addZoneRing(geo,{x,y,z,r}) {
  const point=(radius,angle)=>[x+radius*Math.cos(angle),y+.014,z+radius*Math.sin(angle)];
  for(let i=0;i<36;i++){
    const a=i*Math.PI/18,b=(i+1)*Math.PI/18;
    quad(geo,[point(r-.07,a),point(r,a),point(r,b),point(r-.07,b)],0xe4b54c);
  }
}

function knifeMotion(age){
  if(age<0||age>=.55)return {cut:0,wind:0};
  if(age<.06)return {cut:0,wind:Math.sin(age/.06*Math.PI*.5)};
  if(age<.18)return {cut:Math.sin((age-.06)/.12*Math.PI*.5),wind:1-(age-.06)/.12};
  return {cut:Math.cos((age-.18)/.37*Math.PI*.5)**2,wind:0};
}
function fallbackOperator(dst,p,clock,swing) {
  const h=eyeHeight(p)/1.55,y=p.y,x=p.x,z=p.z,yaw=p.yaw,sy=Math.sin(yaw),cy=Math.cos(yaw);
  const color=p.team===0?0x369fde:0xeb754b,dark=0x263d49;
  const part=(sx,yy,sz,w,hh,d,col)=>block(dst,x+sx*cy-sz*sy,y+yy*h,z+sx*sy+sz*cy,w,hh*h,d,col,yaw);
  const stride=p.speed>1?Math.sin(clock*10+p.seat*2)*.12:0;
  part(-.16,0,stride,.23,.71,.30,dark);part(.16,0,-stride,.23,.71,.30,dark);
  part(0,.69,0,.55,.59,.38,color);part(0,.82,-.14,.42,.24,.16,0x394e59);
  part(-.33,.82,-.08,.16,.42,.20,color);part(.33,.82,-.14,.17,.42,.22,color);
  part(0,1.30,0,.45,.39,.43,color);part(0,1.43,-.206,.42,.115,.035,0x1b2c39);
  part(.1,1.45,-.232,.13,.024,.02,0xbfedef);
  if(p.active==='knife'){
    const {cut}=knifeMotion(clock-(swing?.at??-10)),handX=.27-cut*.20,handY=1.02+cut*.04,handZ=-.35-cut*.16;
    part(handX,handY-.10,handZ,.105,.17,.11,0x263641);
    part(handX,handY+.045,handZ,.17,.035,.07,0xe9b44a);
    const point=(xx,yy,zz)=>{const sx=handX+xx-cut*yy*.8,sz=handZ+zz;return [x+sx*cy-sz*sy,y+(handY+yy)*h,z+sx*sy+sz*cy];};
    const face=(points,col)=>quad(dst,points.map(v=>point(...v)),col);
    face([[-.038,.08,.018],[.038,.08,.018],[.026,.32,.018],[0,.43,.018]],0xbccbd0);
    face([[.038,.08,.018],[.026,.32,.018],[0,.43,.018],[.012,.12,.025]],0xf0f4e8);
    face([[-.038,.08,-.018],[0,.43,-.018],[.026,.32,-.018],[.038,.08,-.018]],0x788f9a);
    face([[.038,.08,-.018],[.026,.32,-.018],[.026,.32,.018],[.038,.08,.018]],0xdce8e4);
  }else if(arcadeFrames[p.active]){
    const ink=0x253641,paint=Number.parseInt(WEAPONS[p.active].accent.slice(1),16);
    const length={smg:.38,burst:.56,marksman:.82,lmg:.60}[p.active],width=p.active==='lmg'?.19:.13;
    part(.24,.93,-.26-length*.5,width,.10,length,ink);
    part(.24,.963,-.28-length*.44,width+.012,.064,length*.63,paint);
    if(p.active==='lmg')part(.24,.83,-.45,.22,.14,.20,ink);
    if(p.active==='marksman')part(.24,1.033,-.42,.072,.069,.105,paint);
  }else part(.24,.93,-.39,.13,.13,.54,0x253641);
}

const carriedGuns={
  rifle:[.43,.20,.10],smg:[.30,.14,.085],shotgun:[.54,.21,.115],
  sniper:[.69,.24,.09],burst:[.48,.20,.095],marksman:[.60,.22,.095],
  lmg:[.52,.24,.15],pistol:[.19,.035,.075],
};

function heldEquipment(dst,p,world,age){
  const [x,y,z]=operatorGrip(world,p);
  const sy=Math.sin(p.yaw),cy=Math.cos(p.yaw);
  const knife=p.active==='knife',cut=knife?knifeMotion(age).cut:0;
  const angle=Math.max(-.78,Math.min(.78,p.pitch||0));
  const tilt=angle+(knife?-.2-cut*.82:0),co=Math.cos(tilt),si=Math.sin(tilt);
  const transform=(lx,ly,lz)=>{
    const yy=ly*co-lz*si,zz=ly*si+lz*co;
    return [x+lx*cy-zz*sy,y+yy,z+lx*sy+zz*cy];
  };
  const body=(cx,ly,cz,w,h,d,col)=>{
    const v=[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]
      .map(([sx,hh,sz])=>transform(cx+sx*w/2,ly+hh*h,cz+sz*d/2));
    for(const [a,b,c,e,shade] of [[0,1,5,4,1],[2,3,7,6,1],[3,0,4,7,0],[1,2,6,5,0],[4,5,6,7,2]])
      quad(dst,[v[a],v[b],v[c],v[e]],col,shade);
  };
  if(knife){
    body(0,-.075,0,.047,.12,.052,0x38413c);
    body(0,.043,0,.112,.021,.056,0x9c997d);
    const bottom=transform(0,.064,.022),edge=transform(-.039,.091,-.003),back=transform(.026,.071,-.005);
    const tip=transform(-.018,.31,-.106);
    quad(dst,[bottom,edge,tip,back],0xb1c0be);
    quad(dst,[back,tip,edge,bottom],0x819697,1);
    return;
  }
  const [front,stock,width]=carriedGuns[p.active]||carriedGuns.rifle;
  const compact=p.active==='pistol';
  body(0,-.036,stock*.40,width,.092,stock+.11,0x3d4747);
  body(0,.006,-front*.36,width,.075,front*.73,0x414949);
  body(0,.031,-front*.80,width*.53,.052,front*.43,0x273233);
  body(0,-.105,-.016,width*.68,.104,.072,0x39403d);
  if(!compact){
    const magazine=p.active==='lmg'?.15:.073;
    body(0,-.128,-.090,magazine,.13,.085,0x3a423d);
    if(p.active==='sniper'||p.active==='marksman')body(0,.087,-.12,.056,.056,.164,0x303c3d);
    if(p.active==='shotgun')body(0,-.020,-front*.60,.083,.063,.18,0x6a6051);
  }
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
    this.operatorStates=new Map();this.operatorsReady=loadLiteOperators();
    this.materials=createMaterials(map);this.staticMesh=makeScene(map,this.materials);this.lastSeq=0;this.recoil=0;
    this.blasterAtlas=document.getElementById('blaster-atlas') || new Image();
    if (!this.blasterAtlas.src) this.blasterAtlas.src='./assets/blaster-views.webp';
    this.rifleReloadAtlas=new Image();this.rifleReloadAtlas.src='./assets/breaker-reload.webp';
    this.arcadeAtlas=document.getElementById('arcade-atlas') || new Image();
    this.fieldAtlas=new Image();
    this.fieldAtlas.onerror=()=>{if(!this.arcadeAtlas.src)this.arcadeAtlas.src='./assets/arcade-views.png';};
    this.fieldAtlas.src='./assets/field-views.webp';
    this.stillAtlases={};this.motionAtlas={};this.shotAge=Infinity;this.shotWeapon=null;this.scopeActive=false;
    this.trails=[];this.quality='auto';this.lastFrame=-1;this.lastGame=null;this.scale=1;
    this.pellets=Array.from({length:PELLET_CAPACITY},()=>({age:PELLET_LIFE}));this.pelletIndex=0;this.lastElapsed=-1;this.lastRound=null;
    this.dummyMeshes=new WeakMap();this.dummyHits=new Map();
    this.meleeSwings=new Map();this.meleeImpacts=[];this.lastMeleeSeq=0;this.knifeEquippedAt=0;this.knifeFocus=null;this.lastWeapon=null;
  }
  setMap(map){
    if(map===this.map)return;
    const materials=createMaterials(map);
    this.staticMesh=makeScene(map,materials);this.materials=materials;this.map=map;
    this.lastFrame=-1;this.lastElapsed=-1;this.lastGame=null;this.lastSeq=0;
    this.clearPellets();this.clearMelee();
  }
  setQuality(q){this.quality=q;this.lastFrame=-1;}
  resize() { this.lastFrame=-1; }
  dispose() {this.staticMesh=[];this.trails=[];this.clearPellets();this.clearMelee();this.operatorStates.clear();this.lastGame=null;}
  clearPellets(){for(const pellet of this.pellets)pellet.age=PELLET_LIFE;this.pelletIndex=0;}
  clearMelee(){this.meleeSwings.clear();this.meleeImpacts=[];this.lastMeleeSeq=0;this.knifeFocus=null;this.lastWeapon=null;}
  meleeEvents(game,p,now){
    const rewind=game.elapsed<this.lastElapsed&&game.seq>=this.lastMeleeSeq;
    if(game.seq<this.lastMeleeSeq||game.elapsed<this.lastElapsed||game.round!==this.lastRound)this.clearMelee();
    if(rewind)this.lastMeleeSeq=game.seq;
    for(const event of game.events||[]){
      if(event.seq<=this.lastMeleeSeq)continue;this.lastMeleeSeq=event.seq;
      if(event.type==='round'){this.meleeSwings.clear();this.meleeImpacts=[];}
      if(event.type==='melee')this.meleeSwings.set(event.actor,{at:now});
      if(event.type==='meleeImpact'&&[event.ex,event.ey,event.ez].every(Number.isFinite)){
        this.meleeImpacts.push({event,until:now+.10});
        if(this.meleeImpacts.length>16)this.meleeImpacts.shift();
      }
    }
    for(const [id,swing] of this.meleeSwings){
      const actor=game.players.find(v=>v.id===id);
      if(!actor?.alive||actor.active!=='knife'||now-swing.at>=.55)this.meleeSwings.delete(id);
    }
    this.meleeImpacts=this.meleeImpacts.filter(impact=>impact.until>now);
    if(this.knifeFocus!==p.id||this.lastWeapon!==p.active){
      this.knifeEquippedAt=now;this.knifeFocus=p.id;this.lastWeapon=p.active;
    }
  }
  gunPose(p,t,kind=p.active){
    const aim=kind==='sniper'&&!this.scopeActive?0:this.aim,w=this.width,h=this.height;
    const entry=fieldViews[kind];
    if(entry){
      const motion=this.motionAtlas[entry.shotTimes?kind:'magazines'],still=entry.sheet?this.stillAtlases[kind]:this.fieldAtlas;
      const pose=fieldPose(p,t,aim,w,h,this.shotWeapon===kind?this.shotAge:Infinity,this.recoil,still,motion);
      if(pose)return pose;
      if(entry.sheet&&(!still?.complete||!motion?.complete))return null;
    }
    const atlas=arcadeFrames[kind]?this.arcadeAtlas:this.blasterAtlas;
    if(!entry?.sheet&&atlas.complete&&atlas.naturalWidth)return blasterPose(p,t,aim,w,h,this.recoil,kind,arcadeFrames[kind]||blasterFrames[kind]||blasterFrames.rifle,atlas);
    const bob=p.speed>1?Math.sin(t*10)*.006*(1-.83*aim):0;
    return {x:w*(.57-.07*aim)+h*bob,y:h*(.64-.08*aim+this.recoil*.045+(p.reload>0?.17:0))};
  }
  anchorPellet(pellet,cam,muzzle){
    if(!muzzle)return;
    const depth=.9,end=cameraVertex(cam,[pellet.ex,pellet.ey,pellet.ez,0,0]);
    if(end[2]<=depth+.03)return;
    // Invert the camera projection at the visible barrel, retaining the hitscan endpoint.
    const right=(muzzle.x-this.width*.5)*depth/this.focal,up=(this.height*.5-muzzle.y)*depth/this.focal;
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
  remoteOperator(gear,player,cam,clock){
    const team=liteOperator(player.team),swing=this.meleeSwings.get(player.id);
    if(!team.model){if(team.failed)fallbackOperator(gear,player,clock,swing);return;}
    const dx=player.x-cam.x,dz=player.z-cam.z,forward=dx*cam.sy-dz*cam.cy;
    if(forward*cam.cp+(player.y+.9-cam.y)*cam.sp < -1.65)return;
    const model=team.model;let state=this.operatorStates.get(player.id);
    if(!state){state={};this.operatorStates.set(player.id,state);}
    const world=posedOperator(model,player,clock,swing,state);
    heldEquipment(gear,player,world,clock-(swing?.at??-10));
    if(!state.camera||state.camera.length!==model.count){
      state.camera=Array.from({length:model.count},()=>[0,0,0,0,0]);
      state.screen=Array.from({length:model.count},()=>[0,0,0,0,0]);
    }
    for(let i=0;i<model.count;i++){
      const at=i*3,dx=world[at]-cam.x,dy=world[at+1]-cam.y,dz=world[at+2]-cam.z;
      const f=dx*cam.sy-dz*cam.cy,c=state.camera[i];
      c[0]=dx*cam.cy+dz*cam.sy;c[1]=dy*cam.cp-f*cam.sp;c[2]=f*cam.cp+dy*cam.sp;
      if(c[2]>.12){
        const p=state.screen[i];p[2]=1/c[2];p[0]=this.width*.5+c[0]*this.focal*p[2];p[1]=this.height*.5-c[1]*this.focal*p[2];
      }
    }
    for(let face=0;face<model.indices.length;face+=3){
      const a=model.indices[face],b=model.indices[face+1],c=model.indices[face+2];
      const A=state.camera[a],B=state.camera[b],C=state.camera[c];
      if(A[2]<=.12&&B[2]<=.12&&C[2]<=.12)continue;
      const ia=a*3,ib=b*3,ic=c*3;
      const ux=world[ib]-world[ia],uy=world[ib+1]-world[ia+1],uz=world[ib+2]-world[ia+2];
      const vx=world[ic]-world[ia],vy=world[ic+1]-world[ia+1],vz=world[ic+2]-world[ia+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      if(nx*(cam.x-world[ia])+ny*(cam.y-world[ia+1])+nz*(cam.z-world[ia+2])<=0)continue;
      const light=(-.42*nx+.81*ny+.39*nz)/(Math.hypot(nx,ny,nz)||1);
      const tone=light<-.28?0:light<.15?1:light<.62?2:3,color=model.colors[(face/3)*4+tone];
      if(A[2]>.12&&B[2]>.12&&C[2]>.12)this.triangle(state.screen[a],state.screen[b],state.screen[c],null,color);
      else{
        const poly=clipNear([A,B,C]).map(p=>this.project(p));
        for(let i=1;i<poly.length-1;i++)this.triangle(poly[0],poly[i],poly[i+1],null,color);
      }
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
  knifeWeapon(p,t){
    const c=this.ctx,w=this.width,h=this.height;
    const swing=this.meleeSwings.get(p.id),{cut,wind}=knifeMotion(t-(swing?.at??-10));
    const equip=Math.max(0,1-(t-this.knifeEquippedAt)/.20)**2;
    const walk=Math.min(1,(p.speed||0)/5.4),bob=Math.sin(t*9)*walk;
    const handX=w*(.74-.29*cut+.025*wind)+h*.006*bob,handY=h*(.83-.13*cut+.025*wind+.34*equip)+h*.003*Math.abs(bob);
    const angle=-.24-1.05*cut+.20*wind+.26*equip,scale=h/520,cs=Math.cos(angle),sn=Math.sin(angle);
    const handPoint=(x,y)=>[handX+(x*cs-y*sn)*scale,handY+(x*sn+y*cs)*scale];
    const poly=(color,points)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
    c.save();
    // The wrist follows the slash, while the forearm stays attached beyond the viewport.
    const wristLow=handPoint(-5,72),wristHigh=handPoint(63,28),farHigh=[w*1.10,h*.98],farLow=[w*.90,h*1.22];
    poly('#263e50',[wristLow,wristHigh,farHigh,farLow]);
    poly('#486273',[handPoint(42,44),wristHigh,farHigh,[w*1.02,h*1.08]]);
    c.translate(handX,handY);c.rotate(angle);c.scale(scale,scale);
    // The cuff overlaps the screen-anchored sleeve so no capped stump appears mid-swing.
    poly('#b7c6c8',[[13,55],[58,42],[72,65],[21,80]]);
    poly('#f3b947',[[20,75],[69,61],[73,70],[24,85]]);
    poly('#202f3a',[[-20,-5],[13,-17],[40,-5],[52,29],[38,57],[4,67],[-24,38]]);
    poly('#405461',[[13,-17],[40,-5],[43,17],[22,30],[-8,20],[-20,-5]]);
    poly('#84969c',[[9,-11],[30,-7],[37,7],[20,17],[1,10]]);
    // Charcoal wrapped grip, beveled pommel, and a narrow amber guard.
    poly('#182a34',[[-13,-44],[12,-43],[15,48],[-11,51]]);
    poly('#3c505b',[[3,-42],[12,-43],[15,48],[5,47]]);
    for(let i=0;i<6;i++)poly(i%2?'#52636a':'#263943',[[-13,-35+i*12],[12,-39+i*12],[13,-34+i*12],[-13,-30+i*12]]);
    poly('#b07d2e',[[-17,45],[17,44],[21,56],[-14,60]]);
    poly('#f1bc57',[[-15,45],[15,44],[16,49],[-16,53]]);
    // Faceted drop-point steel: dark spine, broad satin face, polished cutting bevel.
    poly('#617c89',[[-14,-48],[-18,-147],[-9,-193],[5,-176],[19,-70],[16,-49]]);
    poly('#afc3cb',[[-11,-49],[-14,-146],[-9,-193],[5,-176],[12,-69],[10,-49]]);
    poly('#e6eee6',[[10,-49],[12,-69],[5,-176],[-9,-193],[13,-167],[24,-76],[19,-49]]);
    poly('#f7f6df',[[19,-49],[24,-76],[13,-167],[-9,-193],[16,-165],[28,-75],[23,-49]]);
    poly('#718e9b',[[-7,-72],[-9,-140],[-6,-161],[-2,-148],[2,-72]]);
    poly('#d0dfe0',[[-6,-72],[-8,-141],[-6,-161],[-3,-140],[-1,-72]]);
    poly('#9f742c',[[-28,-48],[29,-49],[33,-38],[-26,-35]]);
    poly('#f0bb51',[[-28,-48],[29,-49],[29,-43],[-28,-40]]);
    // Fingers wrap around the near side of the handle, not over the blade.
    for(let i=0;i<3;i++){
      const y=-12+i*15;
      poly('#334752',[[-22,y],[6,y-5],[20,y+1],[18,y+10],[-13,y+14],[-24,y+8]]);
      poly('#60747e',[[-19,y],[5,y-4],[13,y],[8,y+4],[-17,y+8]]);
    }
    poly('#536873',[[17,-14],[31,-12],[39,2],[33,15],[22,10],[12,-2]]);
    c.restore();
  }
  weapon(p,t,pose) {
    if(p.active==='knife'){this.knifeWeapon(p,t);return;}
    if(!pose)return; // The shared HUD draws the magnified scope.
    const c=this.ctx,h=this.height,reload=p.reload>0;
    const gun=p.active, isPistol=gun==='pistol', isShot=gun==='shotgun',isSniper=gun==='sniper';
    if(gun==='rifle'&&reload&&this.rifleReloadAtlas.naturalWidth){
      const progress=1-p.reload/(p.reloadDuration||WEAPONS.rifle.reload);
      const index=Math.max(0,Math.min(15,Math.round(progress*15)));
      const w=Math.max(this.width,h*16/9);
      c.drawImage(this.rifleReloadAtlas,index%4*320,Math.floor(index/4)*180,320,180,(this.width-w)*.5,0,w,h);
      return;
    }
    if(pose.frame||pose.sheet){
      const {frame,aimFrame,gunWidth,imageX,imageY,reloadPose,kick}=pose;
      c.save();c.translate(pose.x,pose.y);c.rotate(reloadPose*.28+kick*.014);c.scale(1+kick*.035,1+kick*.035);
      if(this.shotWeapon===gun&&this.shotAge<shotFlashDuration(gun)){
        const radius=h*(isPistol?.029:.041)*Math.max(.5,this.recoil);
        c.fillStyle='#ffad34';c.beginPath();
        for(let i=0;i<10;i++){const a=i*Math.PI/5-.9*t,r=i%2?radius*.28:radius*(i%3?.85:1.2);const x=Math.cos(a)*r,y=Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}
        c.closePath();c.fill();c.fillStyle='#fff4be';c.beginPath();c.arc(0,0,radius*.32,0,Math.PI*2);c.fill();
      }
      if(pose.sheet)c.drawImage(pose.sheet,pose.sx,pose.sy,pose.sw,pose.sh,imageX,imageY,pose.drawWidth,pose.drawHeight);
      else c.drawImage(pose.atlas,aimFrame?640:0,frame[0]*360,640,360,imageX,imageY,gunWidth,h);
      c.restore();return;
    }
    c.save();c.translate(pose.x,pose.y);c.scale(h*.0019,h*.0019);if(reload)c.rotate(.20);
    const poly=(color,pts)=>{c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
    const gunColor=arcadeFrames[gun]?WEAPONS[gun].accent:isShot?'#ba784f':isSniper?'#6b9491':'#899598';
    if(this.shotWeapon===gun&&this.shotAge<shotFlashDuration(gun)){poly('#ffd25b',[[-10,-3],[-29,-20],[-5,-13],[2,-38],[7,-11],[24,-23],[14,-1]]);poly('#fff2c4',[[-7,0],[2,-19],[10,0]]);}
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
    if(now<this.lastFrame){this.lastFrame=-1;this.clearPellets();this.clearMelee();}
    if(this.lastFrame>=0 && now-this.lastFrame<(playing?1/45:1/18))return;
    const frameTime=this.lastFrame<0?.03:now-this.lastFrame,dt=Math.min(.1,frameTime);this.lastFrame=now;
    const p=playing?(game.players.find(v=>v.id===(view.spectatorId||selfId))||game.players[0]):null;
    const mode=Boolean(p),preview=this.map.preview;
    const previewYaw=preview?Math.atan2(preview.targetX-preview.x,preview.z-preview.targetZ):-.58;
    const previewPitch=preview?Math.atan2(preview.targetY-preview.y,Math.hypot(preview.targetX-preview.x,preview.targetZ-preview.z)):-.22;
    const yaw=mode?(view.yaw??p.yaw):previewYaw+Math.sin(now*.045)*.012;
    const pitch=mode?(view.pitch??p.pitch):previewPitch;
    const cam={x:mode?p.x:(preview?.x??13),y:mode?p.y+eyeHeight(p):(preview?.y??7.1),z:mode?p.z:(preview?.z??20),sy:Math.sin(yaw),cy:Math.cos(yaw),sp:Math.sin(pitch),cp:Math.cos(pitch)};
    const interrupted=!mode||!p.alive||this.aimFocus!==p.id||this.activeGun!==p.active||game.round!==this.lastRound||game.elapsed<this.lastElapsed;
    if(interrupted){this.shotAge=Infinity;this.shotWeapon=null;this.recoil=0;}
    else this.shotAge+=frameTime;
    if(mode){
      if(fieldViews[p.active]&&p.active!==this.activeGun){
        const entry=fieldViews[p.active],special=Boolean(entry.shotTimes),key=special?p.active:'magazines';
        if(entry.sheet&&!this.stillAtlases[p.active]){
          const image=new Image();image.src='./assets/'+entry.sheet;this.stillAtlases[p.active]=image;
        }
        if(!this.motionAtlas[key]){
          const image=new Image();image.src='./assets/'+(special?p.active+'-motion':'field-reloads')+'.webp';this.motionAtlas[key]=image;
        }
      }
      const previous=interrupted?game.seq:this.lastSeq;
      for(const e of game.events||[]){
        if(e.seq>previous&&e.type==='shot'&&e.actor===p.id&&e.weapon===p.active){
          this.shotAge=0;this.shotWeapon=e.weapon;
        }
      }
      if(p.reload>0){this.shotWeapon=null;this.shotAge=Infinity;}
    }
    this.activeGun=p?.active;this.recoil=Number.isFinite(this.shotAge)?shotResponse(this.shotAge,p.active):0;
    const held=mode&&canAim(p,p.id===selfId?view.ads??p.ads:p.ads);
    const ads=mode&&scopeAfterShot(p.active,held,this.shotWeapon===p.active?this.shotAge:Infinity);
    this.scopeActive=!!(ads&&p.active==='sniper');
    this.aim=mode&&this.aimFocus===p.id?approachAim(this.aim,ads,dt):Number(ads);
    this.aimFocus=p?.id;
    this.viewFov=mode?weaponFov(p.active,this.aim,p.slide>0):58;
    this.focal=(h/2)/Math.tan(this.viewFov*Math.PI/360);this.depth.fill(0);
    if(mode)this.meleeEvents(game,p,now);
    for(let y=0;y<h;y++){const sky=Math.max(0,Math.min(1,.45-(y-h*.5)/(h*.8)+pitch*1.1));const c=rgb(219-sky*103,234-sky*57,240-sky*18);this.pixels.fill(c,y*w,(y+1)*w);}
    this.faces(this.staticMesh,cam);
    if(playing){
      const dynamic=[];
      for(const actor of game.players)if(actor.alive&&actor.id!==p?.id)this.remoteOperator(dynamic,actor,cam,now);
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
    if(!mode){this.lastSeq=0;this.trails=[];this.clearPellets();this.clearMelee();this.lastElapsed=-1;this.lastRound=null;this.dummyHits.clear();this.operatorStates.clear();return;}
    if(game.seq<this.lastSeq||game.elapsed<this.lastElapsed){
      this.lastSeq=game.elapsed<this.lastElapsed?game.seq:0;this.trails=[];this.clearPellets();
    }
    if(this.lastRound!==game.round)this.clearPellets();this.lastRound=game.round;this.lastElapsed=game.elapsed;
    for(const pellet of this.pellets)if(pellet.age<PELLET_LIFE)pellet.age+=dt;
    for(const e of game.events??[]){
      if(e.seq<=this.lastSeq)continue;this.lastSeq=e.seq;
      if(e.type==='round')this.clearPellets();
      if(e.type==='shot'){
        if(e.weapon==='shotgun'){
          const own=e.actor===p.id,muzzle=own&&p.active==='shotgun'?this.gunPose(p,now):null;
          for(const pellet of pelletTrails(e,own,ads)){
            this.anchorPellet(pellet,cam,muzzle);Object.assign(this.pellets[this.pelletIndex++%PELLET_CAPACITY],pellet);
          }
        }else this.trails.push({e,until:now+.07});
      }
      if(game.phase==='range'&&e.type==='hit')this.dummyHits.set(e.target,now+.14);
    }
    this.trails=this.trails.filter(tr=>tr.until>now);
    const pose=p.active==='knife'||this.scopeActive?null:this.gunPose(p,now);
    for(const {e} of this.trails){
      const b=cameraVertex(cam,[e.ex,e.ey,e.ez,0,0]);if(b[2]<.14)continue;
      const end=this.project(b);let start;
      if(e.actor===p.id){
        if(e.weapon!==p.active)continue;
        start=pose?[pose.x,pose.y]:[w*.5,h*.5];
      }else{
        const a=cameraVertex(cam,[e.x,e.y,e.z,0,0]);if(a[2]<=.13)continue;
        start=this.project(a);
      }
      this.ctx.strokeStyle='rgba(255,218,135,.65)';this.ctx.lineWidth=1;this.ctx.beginPath();this.ctx.moveTo(start[0],start[1]);this.ctx.lineTo(end[0],end[1]);this.ctx.stroke();
    }
    for(const pellet of this.pellets)if(pellet.age<PELLET_LIFE){
      const span=pelletSpan(pellet);this.pelletStroke(cam,pellet,span);
      if(span.contactAlpha>0)this.pelletImpact(cam,pellet,span.contactAlpha);
    }
    for(const impact of this.meleeImpacts)this.pelletImpact(cam,impact.event,Math.max(0,(impact.until-now)/.10));
    this.weapon(p,now,pose);
  }
}
