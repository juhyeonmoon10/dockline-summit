import * as T from './assets/three.module.min.js';
import { blasterMesh, gunFit } from './blaster.js';
import { WEAPONS } from './sim.js';
import { makeYard, sky, Parts, glowMaterial } from './yard-art.js';
import { dummyBody, dummyStand } from './range-dummy.js';
import { PelletRenderer } from './pellet-render.js';
import { knifeMesh,knifeFit,knifePose } from './knife.js';
import { operatorAvailable,createOperator,updateOperator,disposeOperator } from './operator.js';

const PI=Math.PI;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const damp=(from,to,rate,dt)=>from+(to-from)*(1-Math.exp(-rate*dt));
const weaponNames=['rifle','shotgun','sniper','pistol','knife'];
const pose=new T.Vector3(),direction=new T.Vector3(),endpoint=new T.Vector3();
const knifeWrist=new T.Vector3(),knifeShoulder=new T.Vector3(.50,-.55,.18);
const vertical=new T.Vector3(0,1,0);
const teamColors=['#168bc9','#ed7040'];
const teamLights=[0x66dcff,0xff975e];

// Only place decals on the rendered area of a plane. The map's enclosing hit boundary
// extends vertically above the physical arena wall; shots reaching that air leave no mark.
function surfaceNormal(map,e,dir,out) {
  const x=e.ex,y=e.ey,z=e.ez,margin=.105,tol=.035;
  let best=0;
  const face=(distance,nx,ny,nz)=>{
    if(distance>tol)return;
    const facing=-(dir.x*nx+dir.y*ny+dir.z*nz);
    if(facing>.035 && facing>best){best=facing;out.set(nx,ny,nz);}
  };
  face(Math.abs(y),0,1,0);
  if(y>margin && y<1.20){
    if(Math.abs(z)<map.depth/2-margin)face(Math.abs(Math.abs(x)-map.width/2),-Math.sign(x),0,0);
    if(Math.abs(x)<map.width/2-margin)face(Math.abs(Math.abs(z)-map.depth/2),0,0,-Math.sign(z));
  }
  for(const b of map.boxes){
    const dx=x-b.x,dz=z-b.z,base=b.base||0;
    const inX=Math.abs(dx)<b.w/2-margin,inZ=Math.abs(dz)<b.d/2-margin;
    if(inX&&inZ){
      face(Math.abs(y-b.h),0,1,0);
      if(base>0)face(Math.abs(y-base),0,-1,0);
    }
    if(y>base+margin&&y<b.h-margin){
      if(inZ)face(Math.abs(Math.abs(dx)-b.w/2),Math.sign(dx),0,0);
      if(inX)face(Math.abs(Math.abs(dz)-b.d/2),0,0,Math.sign(dz));
    }
  }
  for(const r of map.ramps||[]){
    const dx=x-r.x,dz=z-r.z,alongX=r.axis==='x',along=alongX?dx:dz,across=alongX?dz:dx;
    const length=alongX?r.w:r.d,width=alongX?r.d:r.w;
    const slope=r.h*r.sign/length,top=r.h*.5+along*slope;
    if(Math.abs(along)<length/2-margin&&Math.abs(across)<width/2-margin){
      const inv=1/Math.hypot(slope,1);
      face(Math.abs(y-top)*inv,alongX?-slope*inv:0,inv,alongX?0:-slope*inv);
    }
    if(y>margin&&y<top-margin){
      if(Math.abs(along)<length/2-margin)face(Math.abs(Math.abs(across)-width/2),alongX?0:Math.sign(dx),0,alongX?Math.sign(dz):0);
      if(Math.abs(across)<width/2-margin)face(Math.abs(along-r.sign*length/2),alongX?r.sign:0,0,alongX?0:r.sign);
    }
  }
  return best>0;
}

class ImpactMarks {
  constructor(scene) {
    this.capacity=128;this.cursor=0;this.time=new Float32Array(this.capacity);
    const geo=new T.PlaneGeometry(.18,.18);
    this.opacity=new T.InstancedBufferAttribute(new Float32Array(this.capacity),1).setUsage(T.DynamicDrawUsage);
    geo.setAttribute('markOpacity',this.opacity);
    const material=new T.ShaderMaterial({
      transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      vertexShader:'attribute float markOpacity;varying vec2 point;varying float opacity;void main(){point=uv*2.-1.;opacity=markOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 point;varying float opacity;
        void main(){float angle=atan(point.y,point.x);float r=length(point)*(1.+.095*sin(5.*angle)+.045*cos(9.*angle));
          float alpha=(1.-smoothstep(.46,.9,r))*opacity;if(alpha<.02)discard;
          vec3 color=mix(vec3(.030,.049,.066),vec3(.275,.292,.294),smoothstep(.33,.55,r));
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`
    });
    this.mesh=new T.InstancedMesh(geo,material,this.capacity);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.renderOrder=1;
    this.normal=new T.Vector3();this.forward=new T.Vector3(0,0,1);this.stamp=new T.Object3D();scene.add(this.mesh);
  }
  add(map,e,dir) {
    if(!surfaceNormal(map,e,dir,this.normal))return false;
    const i=this.cursor++%this.capacity,o=this.stamp;
    o.position.set(e.ex,e.ey,e.ez).addScaledVector(this.normal,.006);
    o.quaternion.setFromUnitVectors(this.forward,this.normal);o.rotateZ(e.seq*2.4);
    const size=e.weapon==='shotgun'?.40:e.weapon==='sniper'?1.21:e.weapon==='pistol'?.82:1;
    o.scale.set(size,size*.9,1);o.updateMatrix();this.mesh.setMatrixAt(i,o.matrix);
    this.mesh.instanceMatrix.needsUpdate=true;this.time[i]=e.weapon==='shotgun'?3:7;this.mesh.visible=true;return true;
  }
  step(dt) {
    if(!this.mesh.visible)return;
    let active=false,changed=false;
    for(let i=0;i<this.capacity;i++)if(this.time[i]>0){
      this.time[i]=Math.max(0,this.time[i]-dt);active||=this.time[i]>0;
      const alpha=Math.min(.80,this.time[i]*.72);
      if(Math.abs(this.opacity.array[i]-alpha)>.001||!this.time[i]){this.opacity.setX(i,alpha);changed=true;}
    }
    if(changed)this.opacity.needsUpdate=true;this.mesh.visible=active;
  }
  clear(){this.time.fill(0);this.opacity.array.fill(0);this.opacity.needsUpdate=true;this.mesh.visible=false;}
}

// Sleeves, articulated gloves and suits use a handful of baked vertex-colour meshes.
const orb=new T.SphereGeometry(.5,12,8);

function pod(parts,x,y,z,w,h,d,color,rx=0,ry=0,rz=0) {
  parts.piece(orb,x,y,z,w,h,d,color,rx,ry,rz);
}
function limb(parts,a,b,from,to,hue) {
  const start=new T.Vector3(...a), finish=new T.Vector3(...b),axis=finish.clone().sub(start);
  const geo=new T.CylinderGeometry(to,from,axis.length(),10);
  const matrix=new T.Matrix4().compose(start.lerp(finish,.5),
    new T.Quaternion().setFromUnitVectors(vertical,axis.normalize()),new T.Vector3(1,1,1));
  parts.append(geo,matrix,hue);geo.dispose();
}
function glove(support,fit,handOnly=false) {
  const parts=new Parts(),group=new T.Group();
  const side=support?-1:1, center=support?fit.support:0, grip=support?-.066:fit.grip;
  const elbow=[side*(support?.188:.235),support?-.258:-.258,center+(support?.50:.36)];
  const cuff=[side*(support?.065:.069),grip-.048,center+.03];
  const joint=f=>elbow.map((n,i)=>n+(cuff[i]-n)*f);
  if(!handOnly){
    limb(parts,elbow,joint(.73),.065,.051,'#30475a');
    limb(parts,joint(.53),joint(.66),.059,.056,'#5f7784');
    limb(parts,joint(.68),joint(.82),.054,.045,'#d5dde0');
    limb(parts,joint(.78),cuff,.049,.040,'#2c3947');
    limb(parts,joint(.80),joint(.84),.051,.051,'#ffbf43');
  }
  pod(parts,side*.058,grip,center+.005,.077,.093,.124,'#3c4d59',-.23,0,side*.10);
  // The backhand's raised flexible plate remains visible when aiming down sights.
  pod(parts,side*.084,grip+.007,center+.006,.035,.061,.078,'#8199a7',-.20);
  for(let i=0;i<3;i++){
    const y=grip+.023-i*.025;
    pod(parts,side*.032,y,center-.043,.089,.027,.038,i===0?'#586b79':'#465763',0,-side*.15);
    pod(parts,side*.079,y,center-.029,.026,.023,.027,'#a8b6bb');
  }
  pod(parts,side*.043,grip+.04,center+.030,.035,.048,.076,'#5a6c76',-.40,side*.35);
  group.add(parts.mesh());return group;
}

function gunModel(type) {
  if(type==='knife'){
    const group=new T.Group(),body=knifeMesh(),strong=glove(false,knifeFit,true),support=new T.Group();
    group.add(body,strong,support);group.userData={fit:knifeFit,body,support};return group;
  }
  const group=new T.Group(),body=blasterMesh(type),fit=gunFit[type];
  const strong=glove(false,fit),support=glove(true,fit);
  group.add(body,strong,support);group.userData={fit,body,support,magazine:body.getObjectByName('magazine')};
  return group;
}

function operatorTemplate(team) {
  const group=new T.Group(), torso=new T.Group(),body=new Parts(),lights=new Parts();
  const color=teamColors[team], armor=team?'#a54030':'#18618b', visor='#173348', rubber='#243642', silver='#d6e4e8', suit='#435767';
  // Wide shoulder pads, a narrow belt and bright helmet paint read at combat distance.
  body.six(0,1.14,0,.47,.48,.32,suit,0,PI/6);
  body.six(0,1.245,-.01,.55,.28,.37,color,0,PI/6);
  body.cube(0,1.23,-.158,.384,.185,.088,color,-.10);
  body.cube(0,1.115,-.149,.304,.063,.082,armor);
  body.cube(0,1.027,-.146,.272,.068,.065,armor);
  for(const sign of [-1,1]){
    body.cube(sign*.159,1.26,-.203,.039,.104,.016,silver,0,0,sign*.39);
    body.six(sign*.256,1.31,-.008,.232,.22,.24,color,0,PI/6);
    pod(body,sign*.29,1.315,-.009,.218,.201,.21,color);
    limb(body,[sign*.27,1.27,0],[sign*.287,1.075,-.095],.085,.068,suit);
    limb(body,[sign*.278,1.203,-.034],[sign*.282,1.175,-.054],.088,.084,silver);
  }
  body.six(0,.918,.003,.442,.104,.326,rubber,0,PI/6);
  body.cube(0,.917,-.175,.107,.065,.032,'#eac263');
  body.six(0,1.19,.15,.361,.39,.164,armor,0,PI/6);
  body.cube(0,1.24,.229,.222,.211,.027,color);
  for(const x of [-.075,.075])lights.cube(x,1.25,.249,.042,.096,.014,'#f3e3b6');
  body.six(0,1.466,0,.274,.162,.265,rubber,0,PI/6);
  pod(body,0,1.632,-.001,.379,.343,.356,color);
  body.six(0,1.57,-.01,.372,.116,.361,armor,0,PI/6);
  pod(body,0,1.624,-.137,.314,.158,.147,visor);
  pod(body,0,1.599,-.201,.253,.055,.032,'#223f51');
  lights.cube(0,1.656,-.206,.207,.017,.014,'#c0eff6');
  for(const x of [-.17,.17]){
    body.six(x,1.603,.003,.072,.152,.132,rubber,0,PI/6);
    body.six(x*1.105,1.601,.002,.045,.097,.089,color,0,PI/6);
  }
  body.cube(0,1.768,.01,.080,.05,.179,silver);
  for(const sign of [-1,1]){
    const end=sign===1?[.132,1.11,-.261]:[.095,1.119,-.431];
    limb(body,[sign*.287,1.077,-.094],end,.071,.058,suit);
    pod(body,...end,.121,.105,.126,rubber);
  }
  torso.name='torso';torso.add(body.mesh(),lights.mesh(glowMaterial));
  const loadout=new T.Group();loadout.name='loadout';loadout.position.set(.127,1.166,-.277);loadout.scale.setScalar(.80);
  torso.add(loadout);group.add(torso);
  for(const sign of [-1,1]) {
    const leg=new Parts();
    limb(leg,[0,-.004,0],[0,-.31,-.007],.121,.099,suit);
    pod(leg,0,-.328,-.036,.176,.182,.203,armor);
    leg.six(0,-.337,-.108,.108,.09,.058,color,0,PI/6);
    limb(leg,[0,-.386,0],[0,-.615,.032],.096,.073,suit);
    limb(leg,[0,-.466,.01],[0,-.502,.017],.098,.091,silver);
    pod(leg,0,-.655,-.034,.172,.137,.268,rubber);
    leg.cube(0,-.712,-.032,.166,.047,.265,armor);
    const item=leg.mesh();item.position.set(sign*.129,.75,.003);group.add(item);
  }
  return {group};
}

function shadowStamp() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const c=canvas.getContext('2d'),g=c.createRadialGradient(16,16,2,16,16,16);
  g.addColorStop(0,'rgba(9,19,26,.69)');g.addColorStop(.4,'rgba(12,20,25,.48)');g.addColorStop(1,'rgba(15,24,22,0)');
  c.fillStyle=g;c.fillRect(0,0,32,32);
  return new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false});
}

function practicePlate(team) {
  const group=new T.Group(), body=new Parts(), color=teamColors[team===1?1:0];
  body.cube(0,-.85,0,.075,1.53,.075,'#6c797d');
  body.cube(0,-1.59,0,.48,.095,.36,'#646d68');
  body.tube(0,0,.0,.90,.075,.90,'#354953',PI/2);
  body.tube(0,0,.046,.83,.020,.83,'#e2d9b9',PI/2);
  body.tube(0,0,.062,.64,.013,.64,color,PI/2);
  body.tube(0,0,.073,.455,.012,.455,'#e1dbc4',PI/2);
  body.tube(0,0,.085,.275,.012,.275,color,PI/2);
  body.tube(0,0,.094,.114,.010,.114,'#f6dd99',PI/2);
  group.add(body.mesh());return group;
}

function dummyMesh(faces) {
  const positions=[],colors=[],indices=[],tint=new T.Color();
  for(const {points,color} of faces){
    const first=positions.length/3;
    tint.setHex(color);
    for(const point of points){positions.push(...point);colors.push(tint.r,tint.g,tint.b);}
    for(let i=2;i<points.length;i++)indices.push(first,first+i-1,first+i);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true}));
}

function lightScene(scene,world=false) {
  scene.add(new T.HemisphereLight(0xe0f0ff,world?0xa0b4bd:0xa0b2c6,world?1.38:1.54));
  const key=new T.DirectionalLight(0xffedca,world?2.05:2.65);key.position.set(-23,31,18);scene.add(key);
  if(world){
    key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    Object.assign(key.shadow.camera,{left:-30,right:30,top:32,bottom:-30,near:.5,far:98});
    key.shadow.camera.updateProjectionMatrix();key.shadow.bias=-.00035;key.shadow.normalBias=.018;
  }
  const fill=new T.DirectionalLight(0xc8e4ff,world?.40:.83);fill.position.set(18,12,-19);scene.add(fill);
}

export class ArenaRenderer {
  constructor(canvas,map) {
    this.canvas=canvas;this.map=map;
    this.gl=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power',stencil:false});
    this.gl.outputColorSpace=T.SRGBColorSpace;
    this.gl.shadowMap.enabled=true;this.gl.shadowMap.type=T.PCFSoftShadowMap;
    this.gl.shadowMap.autoUpdate=false;this.gl.shadowMap.needsUpdate=true;
    this.gl.autoClear=false;
    this.scene=new T.Scene();this.scene.background=new T.Color('#c7e7f2');
    this.scene.fog=new T.Fog('#c7e7f2',63,146);
    this.worldCamera=new T.PerspectiveCamera(72,1,.055,205);
    this.gunScene=new T.Scene();this.gunCamera=new T.PerspectiveCamera(63,1,.012,4);
    this.worldCamera.rotation.order='YXZ';
    lightScene(this.scene,true);lightScene(this.gunScene);sky(this.scene);
    this.ring=makeYard(this.scene,map);
    this.guns=Object.fromEntries(weaponNames.map(type=>[type,gunModel(type)]));
    this.gunRig=new T.Group();this.gunRig.scale.setScalar(.91);
    Object.values(this.guns).forEach(g=>this.gunRig.add(g));
    this.gunScene.add(this.gunRig);
    const sleeve=new Parts(),sleeveShape=new T.CylinderGeometry(.095,.052,1,10);
    sleeve.piece(sleeveShape,0,0,0,1,1,1,'#30475a');sleeveShape.dispose();
    sleeve.tube(0,-.40,0,.129,.10,.129,'#5f7784');
    sleeve.tube(0,-.455,0,.120,.035,.120,'#d5dde0');
    sleeve.tube(0,-.477,0,.113,.018,.113,'#ffbf43');
    this.knifeArm=sleeve.mesh();this.knifeArm.visible=false;this.gunScene.add(this.knifeArm);
    this.flash=new T.Group();
    const flare=new Parts();
    flare.six(0,0,0,.037,.155,.037,'#fff2b9',PI/2);
    flare.six(0,0,.007,.065,.085,.029,'#ffb25d',PI/2,0,.78);
    this.flash.add(flare.mesh(glowMaterial));this.gunRig.add(this.flash);
    this.flash.visible=false;
    this.templates=[operatorTemplate(0),operatorTemplate(1)];
    this.shadowMat=shadowStamp();this.shadowGeo=new T.PlaneGeometry(1.12,1.05);
    this.models=new Map();this.lastSeq=0;this.lastElapsed=-1;this.recoil=0;this.flashTime=0;
    this.meleeAge=.55;this.meleeSide=1;this.meleeSwings=new Map();
    this.plates=new Map();
    this.aim=0;this.bob=0;this.eye=1.55;this.roll=0;this.lastFocus=null;
    this.lookSwayX=0;this.lookSwayY=0;this.lastYaw=null;this.lastPitch=null;this.equip=0;this.active=null;
    this.tracers=[];this.spark=[];this.marks=new ImpactMarks(this.scene);this.res={w:0,h:0};this.performanceScale=1;
    this.shotTrails=new PelletRenderer(this.scene);
    const beamGeo=new T.CylinderGeometry(1,1,1,5,1,true);
    for(let i=0;i<16;i++){
      const mesh=new T.Mesh(beamGeo,new T.MeshBasicMaterial({color:0xffdd91,transparent:true,depthWrite:false}));
      mesh.visible=false;this.scene.add(mesh);this.tracers.push({mesh,ttl:0});
    }
    const sparkGeo=new T.OctahedronGeometry(1);
    for(let i=0;i<14;i++){
      const mesh=new T.Mesh(sparkGeo,new T.MeshBasicMaterial({color:0xffe5af}));
      mesh.visible=false;this.scene.add(mesh);this.spark.push({mesh,ttl:0,velocity:new T.Vector3(),life:0,size:0});
    }
    this.traceIndex=0;this.sparkIndex=0;
    this.sampleSeconds=0;this.sampleFrames=0;
  }
  resize(view) {
    const canvas=this.canvas;
    const w=Math.max(1,canvas.clientWidth||window.innerWidth), h=Math.max(1,canvas.clientHeight||window.innerHeight);
    const scale=view.quality==='low'?.62:this.performanceScale;
    const ratio=Math.min(window.devicePixelRatio||1,1.25,1440/w,900/h)*scale;
    const rw=Math.max(1,Math.floor(w*ratio)), rh=Math.max(1,Math.floor(h*ratio));
    if(rw===this.res.w && rh===this.res.h)return;
    this.res={w:rw,h:rh};this.gl.setSize(rw,rh,false);
    this.worldCamera.aspect=this.gunCamera.aspect=w/h;
    this.worldCamera.updateProjectionMatrix();this.gunCamera.updateProjectionMatrix();
  }
  avatar(player) {
    let a=this.models.get(player.id);
    const useRig=operatorAvailable();
    if(a && a.team===player.team && !!a.rig===useRig)return a;
    if(a){this.scene.remove(a.group,a.shadow);if(a.rig)disposeOperator(a.rig);}
    const rig=useRig?createOperator(player.team===1?1:0):null;
    const template=this.templates[player.team===1?1:0], group=rig?.group||template.group.clone(true);
    const shadow=new T.Mesh(this.shadowGeo,this.shadowMat);shadow.rotation.x=-PI/2;shadow.renderOrder=1;
    const legs=rig?[]:group.children.slice(-2);
    a={team:player.team,group,shadow,rig,legs,torso:group.getObjectByName('torso'),loadout:group.getObjectByName('loadout'),x:player.x,y:player.y,z:player.z,gait:0,wasAlive:false};
    this.models.set(player.id,a);this.scene.add(group,shadow);
    return a;
  }
  targetModel(target) {
    let model=this.plates.get(target.id);
    if(model)return model;
    if(target.kind==='dummy'){
      if(!this.dummyTemplate)this.dummyTemplate=[dummyMesh(dummyStand),dummyMesh(dummyBody)];
      const [stand,body]=this.dummyTemplate;
      const face=body.clone();
      face.material=body.material.clone();
      model=new T.Group();model.add(stand.clone(),face);model.userData.face=face;
    }else model=practicePlate(target.team);
    this.plates.set(target.id,model);this.scene.add(model);
    return model;
  }
  burst(x,y,z,color,life,size,vx=0,vy=0,vz=0) {
    const p=this.spark[this.sparkIndex++%this.spark.length];
    p.mesh.position.set(x,y,z);p.mesh.material.color.setHex(color);p.mesh.rotation.set(0,this.sparkIndex*.85,.42);
    p.velocity.set(vx,vy,vz);p.ttl=p.life=life;p.size=size;p.mesh.visible=true;
  }
  effects(game,focus,dt) {
    this.meleeAge=Math.min(.55,this.meleeAge+dt);
    if(!focus?.alive||focus.active!=='knife')this.meleeAge=.55;
    for(const [id,swing] of this.meleeSwings){
      const actor=game.players.find(player=>player.id===id);swing.age+=dt;
      if(!actor?.alive||actor.active!=='knife'||swing.age>=.55)this.meleeSwings.delete(id);
    }
    this.shotTrails.step(dt);
    this.recoil=damp(this.recoil,0,18,dt);this.flashTime=Math.max(0,this.flashTime-dt);
    if(game.seq<this.lastSeq || game.elapsed<this.lastElapsed){this.lastSeq=0;this.marks.clear();this.shotTrails.clear();this.meleeAge=.55;this.meleeSwings.clear();}
    this.lastElapsed=game.elapsed;
    const events=game.events||[];
    for(let i=0;i<events.length;i++){
      const e=events[i];
      if(e.seq<=this.lastSeq)continue;
      this.lastSeq=e.seq;
      if(e.type==='round'){this.marks.clear();this.shotTrails.clear();this.meleeAge=.55;this.meleeSwings.clear();}
      if(e.type==='melee'){
        const actor=game.players.find(player=>player.id===e.actor);
        if(actor?.alive&&actor.active==='knife'){
          const side=e.seq%2?1:-1;this.meleeSwings.set(e.actor,{age:0,side});
          if(e.actor===focus?.id){this.meleeAge=0;this.meleeSide=side;this.flashTime=0;}
        }
      }
      if(e.type==='meleeImpact'&&Number.isFinite(e.ex)){
        for(let k=0;k<3;k++)this.burst(e.ex,e.ey,e.ez,e.target?0xf4dfb5:0xffc56a,.10+k*.022,.035+k*.009,(k-1)*.65,.3+k*.2,.10*(k-1));
      }
      if(e.type==='hit'&&this.plates.has(e.target))this.plates.get(e.target).userData.hit=.18;
      if(e.type==='kill'&&e.target!==focus?.id){
        const fallen=game.players.find(p=>p.id===e.target) || game.targets?.find(v=>v.kind==='dummy'&&v.id===e.target);
        if(fallen)for(let k=0;k<7;k++){
          const angle=(k/7)*PI*2+e.seq*.25,dx=Math.cos(angle),dz=Math.sin(angle);
          this.burst(fallen.x+dx*.13,fallen.y+(fallen.slide>0?.73:1.08),fallen.z+dz*.13,teamLights[fallen.team]??0xffbb47,.25+(k%3)*.052,.085+(k%2)*.022,dx*1.8,.65+(k%4)*.50,dz*1.8);
        }
      }
      if(e.type!=='shot'||!Number.isFinite(e.ex))continue;
      const mine=e.actor===focus?.id;
      if(mine){this.recoil=(gunFit[e.weapon]?.flash||1);this.flashTime=.057;}
      if(e.weapon==='shotgun'){
        const trails=this.shotTrails.add(e,mine,focus?.ads);
        trails.forEach((trail,index)=>{
          direction.set(trail.dx,trail.dy,trail.dz).normalize();
          trail.contact=!!trail.target||this.marks.add(this.map,{...trail,weapon:'shotgun',seq:e.seq*10+index},direction);
        });
        this.traceIndex++;continue;
      }
      const trace=this.tracers[this.traceIndex++%this.tracers.length], line=trace.mesh;
      pose.set(e.x,e.y,e.z);endpoint.set(e.ex,e.ey,e.ez);
      direction.copy(endpoint).sub(pose);
      const len=direction.length();
      const hit=events[i+1]?.type==='hit'&&events[i+1].actor===e.actor?events[i+1]:null;
      const target=hit&&game.players.find(p=>p.id===hit.target);
      const landed=!hit&&len>.02&&this.marks.add(this.map,e,direction.clone().normalize());
      if(len>.38){
        direction.multiplyScalar(1/len);
        pose.addScaledVector(direction,Math.min(mine?1.3:.57,len*.35));
        if(mine)pose.y-=.105;
        line.position.copy(pose).lerp(endpoint,.5);
        direction.copy(endpoint).sub(pose);const length=direction.length();
        line.quaternion.setFromUnitVectors(vertical,direction.normalize());
        const radius=e.weapon==='sniper'?.021:.013;line.scale.set(radius,length,radius);
        line.material.color.setHex(mine?0xffeba4:0xffa77a);
        trace.ttl=.085;line.visible=true;
      }
      if(landed||hit)this.burst(e.ex,e.ey,e.ez,target?teamLights[target.team]:0xffe5af,hit?.14:.092,hit?.16:.085);
    }
    this.marks.step(dt);
    for(const tracer of this.tracers)if(tracer.ttl>0) {
      tracer.ttl=Math.max(0,tracer.ttl-dt*.85);tracer.mesh.visible=tracer.ttl>0;tracer.mesh.material.opacity=tracer.ttl/.085*.8;
    }
    for(const particle of this.spark)if(particle.ttl>0) {
      particle.ttl=Math.max(0,particle.ttl-dt);particle.mesh.visible=particle.ttl>0;
      particle.mesh.position.addScaledVector(particle.velocity,dt);
      if(particle.velocity.lengthSq()>.00001)particle.velocity.y-=4.2*dt;
      particle.mesh.scale.setScalar(particle.size*(particle.ttl/particle.life));
    }
  }
  updateModels(players,focusId,dt) {
    const ids=new Set();
    for(const p of players){
      ids.add(p.id);
      const a=this.avatar(p),show=p.alive&&p.id!==focusId;
      a.group.visible=show;a.shadow.visible=show;
      if(show){
        const snap=!a.wasAlive || Math.hypot(p.x-a.x,p.z-a.z)>3.5;
        a.x=snap?p.x:damp(a.x,p.x,30,dt);a.z=snap?p.z:damp(a.z,p.z,30,dt);
        a.y=snap?p.y:damp(a.y,p.y,28,dt);a.group.position.set(a.x,a.y,a.z);
        a.group.rotation.y=-p.yaw;a.group.scale.y=damp(a.group.scale.y,!a.rig&&p.slide>0?.67:1,18,dt);
        if(a.rig)updateOperator(a.rig,p,dt,this.meleeSwings.get(p.id));
        else {
        if(a.active!==p.active){
          const held=p.active==='knife'?knifeMesh():blasterMesh(p.active);
          if(p.active==='knife')held.position.y=.075;
          a.loadout.clear();a.loadout.add(held);a.active=p.active;
        }
        a.loadout.rotation.x=clamp(p.pitch,-.78,.78);
        const slash=p.active==='knife'?this.meleeSwings.get(p.id):null,cut=knifePose(slash?.age??.55,slash?.side||1);
        a.loadout.position.set(.127,p.active==='knife'?1.11:1.166,-.277);
        a.loadout.rotation.y=p.active==='knife'?-.3+cut.ry:0;
        a.loadout.rotation.z=p.active==='knife'?.4+cut.rz:0;
        if(p.active==='knife')a.loadout.rotation.x+=cut.rx-.18;
        const speed=p.speed||0; a.gait+=dt*Math.min(speed,9)*2.9;
        const step=p.slide>0?0:Math.sin(a.gait)*Math.min(speed*.113,.55);
        a.legs[0].rotation.x=step;a.legs[1].rotation.x=-step;
        a.torso.position.y=.016*Math.abs(step);
        a.torso.rotation.z=step*.043+cut.rz*.07;
        }
        let floor=0;
        for(const b of this.map.boxes)if(b.h<=a.y+.09 && Math.abs(a.x-b.x)<=b.w*.5 && Math.abs(a.z-b.z)<=b.d*.5)floor=Math.max(floor,b.h);
        for(const r of this.map.ramps||[])if(Math.abs(a.x-r.x)<=r.w*.5 && Math.abs(a.z-r.z)<=r.d*.5){
          const fraction=r.axis==='x'?(a.x-r.x)/r.w:(a.z-r.z)/r.d;
          const h=r.h*(.5+fraction*r.sign);if(h<=a.y+.09)floor=Math.max(floor,h);
        }
        a.shadow.position.set(a.x,floor+.035,a.z);a.shadow.scale.setScalar(clamp(1-(a.y-floor)*.20,.55,1));
      }
      a.wasAlive=show;
    }
    for(const [id,a] of this.models)if(!ids.has(id)){
      this.scene.remove(a.group,a.shadow);if(a.rig)disposeOperator(a.rig);this.models.delete(id);
    }
  }
  lobby(t) {
    this.meleeAge=.55;this.meleeSwings.clear();
    this.shotTrails.clear();
    if(this.marks.mesh.visible)this.marks.clear();
    for(const plate of this.plates.values())plate.visible=false;
    for(const a of this.models.values()){a.group.visible=false;a.shadow.visible=false;a.wasAlive=false;}
    for(const e of [...this.tracers,...this.spark]){e.ttl=0;e.mesh.visible=false;}
    this.lastSeq=0;this.lastElapsed=-1;this.lastFocus=null;
    const c=this.worldCamera;
    // The right hand side frames the open lane and skyline under the game menu.
    c.position.set(13+Math.sin(t*.036)*.72,7.1+Math.sin(t*.025)*.14,20+Math.cos(t*.036)*.44);
    c.lookAt(-1.3,1.64,-1.7);c.fov=58;c.updateProjectionMatrix();
    this.ring.material.opacity=.35;this.ring.material.color.setHex(0xffca74);
    this.gl.clear();this.gl.render(this.scene,c);
  }
  draw(game,selfId,view={}) {
    const dt=clamp(view.dt||1/60,.002,.13), t=Number.isFinite(view.t)?view.t:performance.now()/1000;
    if(!view.lobby&&game&&view.quality!=='low'){
      this.sampleSeconds+=dt;this.sampleFrames++;
      if(this.sampleSeconds>=1.8){
        const average=this.sampleSeconds/this.sampleFrames;
        if(average>1/36)this.performanceScale=Math.max(.60,Math.round((this.performanceScale-.10)*10)/10);
        else if(average<1/57)this.performanceScale=Math.min(1,Math.round((this.performanceScale+.10)*10)/10);
        this.sampleSeconds=0;this.sampleFrames=0;
      }
    }
    this.resize(view);
    if(view.lobby||!game){this.lobby(t);return;}
    let focus=game.players.find(p=>p.id===(view.spectatorId||selfId));
    if(!focus)focus=game.players[0];
    if(!focus){this.lobby(t);return;}
    const first=this.lastFocus!==focus.id;
    for(const plate of this.plates.values())plate.visible=false;
    for(const target of game.targets||[]) {
      const plate=this.targetModel(target);
      plate.visible=true;plate.position.set(target.x,target.y,target.z);
      plate.userData.hit=Math.max(0,(plate.userData.hit||0)-dt);
      if(target.kind==='dummy'){
        const face=plate.userData.face;
        face.visible=target.alive;
        plate.rotation.y=-target.yaw;
        face.rotation.x=plate.userData.hit*.45;
        face.material.emissive.setRGB(plate.userData.hit*1.9,plate.userData.hit*.91,plate.userData.hit*.21);
      }else plate.rotation.set(plate.userData.hit*.56,target.z<0?PI:0,0);
    }
    const playerView=focus.id===selfId;
    const yaw=playerView && Number.isFinite(view.yaw)?view.yaw:focus.yaw;
    const pitch=playerView && Number.isFinite(view.pitch)?view.pitch:focus.pitch;
    this.effects(game,focus,dt);this.updateModels(game.players,focus.id,dt);
    if(first){const swing=this.meleeSwings.get(focus.id);this.meleeAge=swing?.age??.55;this.meleeSide=swing?.side||1;}
    this.lastFocus=focus.id;
    const ads=focus.active!=='knife'&&(playerView&&view.ads!==undefined?view.ads:focus.ads);
    this.aim=damp(this.aim,ads && !(focus.reload>0)?1:0,14,dt);
    this.eye=first?(focus.slide>0?1:1.55):damp(this.eye,focus.slide>0?1:1.55,19,dt);
    const move=Math.min((focus.speed||0)/5.4,1),slide=focus.slide>0;
    this.bob+=dt*(slide?0:move*12);
    const cam=this.worldCamera;
    if(first||Math.hypot(focus.x-cam.position.x,focus.z-cam.position.z)>3.5)cam.position.set(focus.x,focus.y+this.eye,focus.z);
    else {
      cam.position.x=damp(cam.position.x,focus.x,37,dt);cam.position.z=damp(cam.position.z,focus.z,37,dt);
      cam.position.y=damp(cam.position.y,focus.y+this.eye,28,dt);
    }
    this.roll=damp(this.roll,slide?-.017:0,16,dt);
    cam.rotation.set(clamp(pitch+this.recoil*.012,-1.5,1.5),-yaw,this.roll,'YXZ');
    const fov=(slide?78:72)+(focus.active==='sniper'?-38:-13)*this.aim;
    if(Math.abs(cam.fov-fov)>.03){cam.fov=fov;cam.updateProjectionMatrix();}
    const key=weaponNames.includes(focus.active)?focus.active:'rifle';
    if(key!==this.active){this.equip=this.active ? .85 : 0;this.active=key;if(key!=='knife'||!this.meleeSwings.has(focus.id))this.meleeAge=.55;}
    this.equip=damp(this.equip,0,14,dt);
    for(const [id,gun] of Object.entries(this.guns))gun.visible=id===key;
    const weapon=this.guns[key],sniper=key==='sniper';
    const progress=focus.reload>0?clamp(1-focus.reload/(focus.reloadDuration||WEAPONS[key].reload),0,1):0;
    const reloadWeight=Math.pow(Math.sin(PI*progress),.72);
    // Pull the real, separately authored magazine out of the receiver and reseat it.
    const pull=progress>.13&&progress<.83?Math.sin((progress-.13)/.70*PI):0;
    if(weapon.userData.magazine){
      weapon.userData.magazine.position.set(-pull*.038,-pull*.140,pull*.030);
      weapon.userData.magazine.rotation.z=pull*.19;
    }
    weapon.userData.support.position.set(.015*pull,-.064*pull,pull*.172);
    weapon.userData.support.rotation.x=-.13*pull;
    if(first){this.lastYaw=yaw;this.lastPitch=pitch;}
    const turn=Math.atan2(Math.sin(yaw-this.lastYaw),Math.cos(yaw-this.lastYaw));
    this.lookSwayX=damp(this.lookSwayX,clamp(turn*.22,-.046,.046),15,dt);
    this.lookSwayY=damp(this.lookSwayY,clamp((pitch-this.lastPitch)*.19,-.031,.031),15,dt);
    this.lastYaw=yaw;this.lastPitch=pitch;
    const sway=(1-this.aim)*(slide?.2:move);
    const fit=weapon.userData.fit, hip=1-this.aim;
    const gunX=(.188+Math.sin(this.bob)*.009*sway-this.lookSwayX)*hip;
    const gunY=(-.174-Math.abs(Math.cos(this.bob))*.009*sway-this.lookSwayY)*hip-(fit.sight*.91+.009)*this.aim;
    const gunZ=(key==='pistol'?-.35:-.422)+.029*this.aim;
    this.gunRig.position.set(gunX+reloadWeight*.010,gunY-reloadWeight*.038-this.equip*.12,gunZ+this.recoil*.045);
    this.gunRig.rotation.set(this.recoil*.094+hip*.049-reloadWeight*.19-this.equip*.18,
      .090*hip+reloadWeight*.13+this.lookSwayX*.55,-.032*hip+reloadWeight*.46+this.recoil*.017);
    if(key==='knife'){
      const cut=knifePose(this.meleeAge,this.meleeSide);
      this.gunRig.position.set(.245+cut.x+Math.sin(this.bob)*.008*sway-this.lookSwayX,-.235+cut.y-Math.abs(Math.cos(this.bob))*.007*sway-this.equip*.22,-.52+cut.z);
      this.gunRig.rotation.set(-.16+cut.rx-this.equip*.35,-.25+cut.ry,.38+cut.rz);
      // Keep the sleeve rooted below/behind the camera while the hand cuts across it.
      this.gunRig.updateMatrixWorld(true);knifeWrist.set(.057,-.135,.060).applyMatrix4(this.gunRig.matrixWorld);
      direction.copy(knifeShoulder).sub(knifeWrist);const armLength=direction.length();
      this.knifeArm.position.copy(knifeWrist).lerp(knifeShoulder,.5);
      this.knifeArm.quaternion.setFromUnitVectors(vertical,direction.normalize());this.knifeArm.scale.set(1,armLength,1);
    }
    this.knifeArm.visible=key==='knife';
    this.flash.position.set(0,fit.muzzleY,fit.muzzle-.036);this.flash.scale.setScalar(fit.flash);this.flash.visible=key!=='knife'&&this.flashTime>0;
    this.flash.rotation.z=this.traceIndex*1.9;
    this.ring.material.opacity=game.phase==='overtime'?.70+.19*Math.sin(t*5):.32;
    this.ring.material.color.setHex(game.phase==='overtime'&&game.capture?.team!==null?teamLights[game.capture?.team]||0xffdf78:0xffd77b);
    cam.updateMatrixWorld();this.flash.getWorldPosition(pose);
    // Match the viewmodel's lens so the fan leaves the visible barrel, even in ADS.
    const lens=Math.tan(cam.fov*PI/360)/Math.tan(this.gunCamera.fov*PI/360);
    pose.x*=lens;pose.y*=lens;pose.applyQuaternion(cam.quaternion).add(cam.position);
    this.shotTrails.draw(cam,this.res.h,pose);
    this.gl.clear();this.gl.render(this.scene,cam);
    this.gl.clearDepth();
    // High magnification is a clear center view; the DOM crosshair remains visible.
    if(!(sniper&&this.aim>.85))this.gl.render(this.gunScene,this.gunCamera);
  }
}
