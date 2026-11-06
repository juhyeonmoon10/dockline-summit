import * as T from './assets/three.module.min.js';
import { Parts, glowMaterial } from './arena-parts.js';
import { propMesh } from './arena-props.js';

const PI=Math.PI, TAU=PI*2;
const white='#edf1e8', pale='#ced7d8', mid='#8b9faa', dark='#304858', iron='#233744';
const blue='#168fc7', blueDark='#235978', orange='#f58c42', orangeDark='#a7512c';
const team=z=>z>0?blue:orange;
const teamDeep=z=>z>0?blueDark:orangeDark;

function canvas(w,h=w){
  const element=document.createElement('canvas');element.width=w;element.height=h;
  return [element,element.getContext('2d')];
}
function texture(c){
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
}
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

function gridTexture(){
  const [c,g]=canvas(256);
  g.fillStyle='#ffffff';g.fillRect(0,0,256,256);
  g.strokeStyle='rgba(31,58,72,.18)';g.lineWidth=1;
  for(const k of [0,128,256]){g.beginPath();g.moveTo(k+.5,0);g.lineTo(k+.5,256);g.moveTo(0,k+.5);g.lineTo(256,k+.5);g.stroke();}
  const t=texture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;
}

// World-space UVs give the ground, ledges and ramp faces the same measured grid.
class Surfaces {
  constructor(){this.p=[];this.n=[];this.c=[];this.uv=[];this.index=[];}
  face(verts,color,plane='auto'){
    const start=this.p.length/3;
    const a=new T.Vector3(...verts[0]),u=new T.Vector3(...verts[1]).sub(a),v=new T.Vector3(...verts[2]).sub(a);
    const normal=u.clone().cross(v).normalize(),tint=new T.Color(color);
    if(plane==='auto')plane=Math.abs(normal.y)>.55?'top':Math.abs(normal.x)>.65?'x':'z';
    for(const [x,y,z] of verts){
      this.p.push(x,y,z);this.n.push(normal.x,normal.y,normal.z);this.c.push(tint.r,tint.g,tint.b);
      this.uv.push((plane==='x'?z:x)/4.8,(plane==='top'?-z:y)/4.8);
    }
    for(let i=1;i+1<verts.length;i++)this.index.push(start,start+i,start+i+1);
  }
  rounded(x,z,w,d,base,h,color,topColor=color,bevel=.09) {
    const c=Math.min(bevel,w*.18,d*.18,(h-base)*.22),low=base+c,high=h-c;
    const ring=(width,depth,y,chamfer)=>{
      const l=x-width/2,r=x+width/2,b=z-depth/2,f=z+depth/2,k=chamfer;
      return [[l+k,y,f],[r-k,y,f],[r,y,f-k],[r,y,b+k],[r-k,y,b],[l+k,y,b],[l,y,b+k],[l,y,f-k]];
    };
    const inset=2*c*.54;
    const bottom=ring(w-inset,d-inset,base,c*.55),side0=ring(w,d,low,c),side1=ring(w,d,high,c),cap=ring(w-inset,d-inset,h,c*.55);
    for(let i=0;i<8;i++){const j=(i+1)%8;
      this.face([bottom[i],bottom[j],side0[j],side0[i]],color);
      this.face([side0[i],side0[j],side1[j],side1[i]],color);
      this.face([side1[i],side1[j],cap[j],cap[i]],topColor);
    }
    this.face(cap,topColor);this.face(bottom.slice().reverse(),color);
  }
  mesh(material){
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(this.p,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(this.n,3));geo.setAttribute('color',new T.Float32BufferAttribute(this.c,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(this.uv,2));geo.setIndex(this.index);geo.computeBoundingSphere();
    return new T.Mesh(geo,material);
  }
}

function groundTexture(map){
  const W=map.width,D=map.depth,[c,g]=canvas(1024,1280);
  const X=x=>(x/W+.5)*c.width,Z=z=>(z/D+.5)*c.height,sx=c.width/W,sz=c.height/D;
  const rect=(x,z,w,d,color)=>{g.fillStyle=color;g.fillRect(X(x-w/2),Z(z-d/2),w*sx,d*sz);};
  const line=(points,color,width)=>{g.beginPath();points.forEach(([x,z],i)=>i?g.lineTo(X(x),Z(z)):g.moveTo(X(x),Z(z)));g.strokeStyle=color;g.lineWidth=width;g.stroke();};
  g.fillStyle='#d6dedc';g.fillRect(0,0,c.width,c.height);
  // Large poured-concrete slabs read cleanly at eye level; service lanes frame the fight.
  for(const side of [-1,1]){
    rect(side*14.9,0,4.8,D,'#667b85');
    rect(side*12.43,0,.11,D,'#eef0db');
    rect(0,side*18.55,W-5.0,4.9,side>0?'#7fbbcf':'#e5b48c');
    rect(0,side*15.95,W-5.0,.11,side>0?'#2385aa':'#cf7536');
    rect(side*16.75,0,.14,D-3.4,'#e9bc57');
    for(let z=-18;z<19;z+=3)rect(side*14.2,z,1.15,.08,'#ced9d8');
  }
  for(let x=-18;x<19;x+=2.4)line([[x,-21],[x,21]],'rgba(57,78,87,.14)',1);
  for(let z=-21.6;z<22;z+=2.4)line([[-18,z],[18,z]],'rgba(57,78,87,.14)',1);
  rect(0,0,9.4,8.2,'#b6c5ca');
  // Contact darkening is baked and remains present on Chromebook low settings.
  for(const b of map.boxes){if(b.base)continue;g.save();g.shadowColor='rgba(28,52,65,.45)';g.shadowBlur=12;rect(b.x,b.z,b.w+.09,b.d+.09,'#82959b');g.restore();}
  for(const side of [-1,1]){
    const ink=side>0?'#165e7f':'#9e4c24';
    g.save();g.translate(X(-9.9*side),Z(18.6*side));g.rotate(side<0?Math.PI:0);g.fillStyle=ink;g.font='900 58px Arial';g.fillText(side>0?'BLUE':'ORANGE',-72,20);g.restore();
    for(let j=0;j<3;j++)line([[-1.1,side*(14-j*.7)],[0,side*(13.55-j*.7)],[1.1,side*(14-j*.7)]],'#f4f3df',6);
    // Drain strips stay flush with the ground instead of becoming decorative obstacles.
    rect(side*11.78,0,.22,13.4,'#304754');
    for(let z=-6.6;z<6.7;z+=.28)rect(side*11.78,z,.22,.065,'#a7b7bd');
  }
  return texture(c);
}

function boxArt(s,p,b){
  const {x,z,w,d,h}=b,base=b.base||0;
  if(b.kind==='summit'){
    s.rounded(x,z,w,d,base,h-.15,iron,'#687e8b',.04);
    s.rounded(x,z,w,d,h-.15,h,'#d3dcd7',white,.045);
    for(const side of [-1,1]){
      p.cube(x+side*(w/2+.008),h-.23,z,.025,.12,d-.3,'#efb94e');
      p.cube(x+side*(w/2+.008),h-.33,z,.025,.04,d-.3,iron);
      for(let dz=-2.5;dz<=2.5;dz+=1)p.cube(x+side*(w/2+.025),h-.23,z+dz,.03,.12,.22,'#263e4c');
    }return;
  }
  if(b.kind==='pier'){
    s.rounded(x,z,w,d,0,h,iron,mid,.045);
    p.cube(x,1.14,z+d/2+.005,w-.13,1.9,.018,'#f2bb50');
    p.cube(x,1.14,z-d/2-.005,w-.13,1.9,.018,'#f2bb50');
    for(const y of [.22,h-.18])s.rounded(x,z,w+.025,d+.025,y,y+.1,dark,mid,.02);
    return;
  }
  const gallery=b.kind==='terrace',accent=team(z);
  if(gallery){
    s.rounded(x,z,w,d,0,.16,iron,mid,.04);
    s.rounded(x,z,w,d,.16,h-.20,accent,accent,.06);
    s.rounded(x,z,w,d,h-.20,h,pale,white,.055);
    for(const side of [-1,1]){
      p.cube(x+side*(w/2+.009),.36,z,.024,.13,d-.4,teamDeep(z));
      for(let dz=-d/2+.65;dz<d/2;dz+=1.2)p.cube(x+side*(w/2+.012),h*.51,z+dz,.026,h*.46,.055,teamDeep(z));
    }return;
  }
  // Closed Kenney container/crate meshes occupy these exact collision bounds.
}

function rampArt(s,p,r){
  const x=r.x,z=r.z,w=r.w,d=r.d,h=r.h,sz=r.sign;
  const zl=z-sz*d/2,zh=z+sz*d/2,L=x-w/2,R=x+w/2;
  const top=[[L,0,zl],[R,0,zl],[R,h,zh],[L,h,zh]];
  s.face(sz>0?top.slice().reverse():top,r.kind==='summit'?'#e1e7df':'#c6d8dd','top');
  const face=(points,normalX,normalZ)=>{
    const [aa,bb,cc]=points,ab=new T.Vector3(...bb).sub(new T.Vector3(...aa)),ac=new T.Vector3(...cc).sub(new T.Vector3(...aa));
    const v=ab.cross(ac);s.face(v.x*normalX+v.z*normalZ<0?points.slice().reverse():points,team(r.z));
  };
  face([[L,0,zl],[L,h,zh],[L,0,zh]],-1,0);face([[R,0,zl],[R,h,zh],[R,0,zh]],1,0);
  face([[L,0,zh],[R,0,zh],[R,h,zh],[L,h,zh]],0,sz);
  for(const side of [-1,1]){
    const xx=x+side*(w/2-.11);
    p.beam([xx,.025,zl],[xx,h+.025,zh],.105,.046,r.kind==='summit'?'#ffc64e':team(r.z));
    p.beam([xx-side*.12,.025,zl],[xx-side*.12,h+.025,zh],.039,.025,'#8197a4');
  }
  const theta=-sz*Math.atan2(h,d);
  for(let k=1;k<=6;k++){
    const t=k/8,y=h*t+.014,zz=zl+(zh-zl)*t;
    for(let side of [-1,1])p.cube(x+side*(w/2-.37),y,zz,.31,.015,.07,'#8596a0',theta);
  }
  // Direction arrows live on the ramp plane so the route reads at first-person height.
  for(const t of [.20,.65]){
    const yy=h*t+.016,zz=zl+(zh-zl)*t;
    for(const side of [-1,1])p.beam([x+side*.43,yy,zz],[x,yy+.35*h/d,zz+sz*.35],.083,.04,'#f4f3e8');

  }
}

class Signs {
  constructor(){
    const [c,g]=canvas(1024,1024);
    const rows=[['#1e5482','#d7f1ff','BLUE','01'],['#ad4f31','#ffe6d4','ORANGE','02'],['#243b50','#eaf5fa','SUMMIT',''],['#d9e3e8','#334a63','SUMMIT','']];
    rows.forEach(([base,ink,label,num],i)=>{
      g.save();g.translate(0,i*256);g.fillStyle=base;g.fillRect(0,0,1024,256);g.fillStyle=ink;
      if(num){g.font='italic 900 155px Arial';g.fillText(num,30,179);g.fillRect(260,66,4,124);g.font='900 87px Arial';g.fillText(label,295,145);g.font='bold 29px Arial';g.fillText(i?'HOME  /  NORTH':'HOME  /  SOUTH',302,193);
        for(let j=0;j<3;j++){g.beginPath();g.moveTo(844+j*43,182);g.lineTo(891+j*43,68);g.lineTo(916+j*43,68);g.lineTo(869+j*43,182);g.fill();}
      }else{
        const poly=a=>{g.beginPath();a.forEach(([x,y],k)=>k?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
        poly([[45,188],[140,48],[171,94],[108,188]]);poly([[139,188],[181,124],[225,188]]);
        g.font='italic 900 128px Arial';g.fillText(label,244,150);g.font='bold 36px Arial';g.fillText('A  R  E  N  A',260,211);g.fillRect(641,178,240,3);
      }g.restore();
    });
    this.map=texture(c);this.points=[];this.uv=[];this.indices=[];
  }
  panel(x,y,z,w,h,angle,row){
    const ca=Math.cos(angle),sa=Math.sin(angle),start=this.points.length/3;
    for(const [u,v] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){this.points.push(x+u*w*ca,y+v*h,z-u*w*sa);this.uv.push(u+.5,1-(row+.5-v)/4);}
    this.indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  mesh(){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(this.points,3));geo.setAttribute('uv',new T.Float32BufferAttribute(this.uv,2));geo.setIndex(this.indices);return new T.Mesh(geo,new T.MeshBasicMaterial({map:this.map}));}
}
function backGate(p,signs,map,side){
  const z=side*(map.depth/2+1.25),col=team(side);
  const C=(x,y,o,w,h,d,color)=>p.cube(x,y,z+side*o,w,h,d,color);
  // Faceted home portals put the team and number on the arena itself.
  C(0,.41,0,19,.82,1.8,'#899aa5');
  for(const s of [-1,1]){
    p.beam([s*7.2,.8,z],[s*6.45,4.8,z+side*.75],.56,.92,white);
    p.beam([s*6.45,4.8,z+side*.75],[s*4.8,5.3,z+side*.98],.44,.70,pale);
    p.beam([s*6.7,1.03,z+.09*side],[s*6.09,4.45,z+side*.75],.22,.60,col);
    C(s*7.55,1.17,.38,1.1,1.75,.90,pale);C(s*4.32,2.0,.51,.29,2.65,.35,mid);
    C(s*9.0,1.47,.1,2.35,1.2,1.72,'#d0dade');
    const x=s*8.5;C(x,4.4,1.0,.105,8.8,.105,mid);C(x+s*.47,7.15,1.0,.93,2.26,.075,col);
    C(x+s*.47,6.35,1.0,.94,.16,.09,'#edf1eb');C(x+s*.47,6.66,1.0,.94,.075,.09,'#edf1eb');
  }
  C(0,4.56,.6,13.3,1.18,.95,'#7f909d');C(0,4.61,.35,12.75,1.16,.67,iron);C(0,5.24,.63,13.88,.24,1.17,white);C(0,3.94,.55,13.52,.17,1.10,col);
  C(0,2.10,.75,7.65,2.48,.82,'#778a98');
  for(let i=0;i<9;i++)C(0,.98+i*.26,.27,7.38,.229,.17,i%2?'#a1acb3':'#98a5ae');
  signs.panel(0,4.54,z-side*.01,10.6,1.03,side<0?0:PI,side>0?0:1);
}
function perimeter(parts,signs,map){
  const W=map.width,D=map.depth;
  for(const side of [-1,1]){
    const x=side*(W/2+.22),z=side*(D/2+.22);
    parts.cube(x,.60,0,.44,1.20,D+.88,'#9baeb6');parts.cube(0,.60,z,W+.88,1.2,.44,'#9baeb6');
    parts.cube(x,1.23,0,.51,.1,D+.88,white);parts.cube(0,1.23,z,W+.88,.1,.51,white);
    parts.cube(x-side*.23,.85,0,.025,.20,D+.55,iron);parts.cube(0,.85,z-side*.23,W+.55,.20,.025,team(side));
    for(let dz=-18;dz<=18;dz+=6){
      parts.cube(x,1.72,dz,.09,1.0,.09,iron);
      parts.cube(x,2.19,dz,.065,.07,5.95,iron);
    }
    backGate(parts,signs,map,side);
    const signX=side*(W/2+.29);
    parts.cube(signX,2.7,0,.16,1.70,5.8,iron);
    signs.panel(signX-side*.09,2.7,0,5.45,1.38,-side*PI/2,2);
  }
}

function crane(p){
  const x=-27,z=-26,y=17,yellow='#eebc39',shade='#ad7a27';
  p.cube(x,-3.25,z,3.2,4.5,3.2,iron);
  for(const dx of [-.65,.65])for(const dz of [-.65,.65])p.cube(x+dx,8,z+dz,.20,18,.20,yellow);
  for(let level=0;level<17;level+=2){
    for(const side of [-1,1]){
      p.beam([x-.65,level,z+side*.65],[x+.65,level+2,z+side*.65],.10,.10,shade);
      p.beam([x+side*.65,level,z-.65],[x+side*.65,level+2,z+.65],.10,.10,yellow);
    }
  }
  for(const side of [-1,1]){p.cube(-19,y,z+side*.57,30,.15,.14,yellow);p.cube(-19,y+1.1,z+side*.57,30,.15,.14,yellow);}
  for(let xx=-34;xx<-4;xx+=2){p.beam([xx,y,z-.57],[xx+2,y+1.1,z-.57],.10,.10,yellow);p.beam([xx,y,z+.57],[xx+2,y+1.1,z+.57],.10,.10,yellow);}
  p.cube(x+1.65,y-.7,z,2.1,1.8,1.8,yellow);p.cube(x+1.65,y-.52,z+.91,1.55,.90,.035,'#31586b');
  p.cube(-31,y-.65,z,3.3,1.2,2.05,'#65737c');
  p.beam([-12,y,z],[-12,8.3,z],.055,.055,iron);
  for(const side of [-1,1])p.beam([-12,8.3,z],[-12+side*1.25,6.9,z],.045,.045,iron);
  p.cube(-12,6.2,z,3.2,1.35,1.7,orange);p.cube(-12,5.52,z,3.3,.12,1.8,iron);
}

function floodlight(parts,lit,x,z,side){
  const y=10.9,gz=z+.25*side;parts.cube(x,.34,z,1.09,.68,1.05,'#93a4aa');parts.cube(x,5.45,z,.25,10.9,.32,'#8196a4');parts.cube(x,y,z,2.92,.21,.34,iron);
  for(const dx of [-1.02,-.34,.34,1.02]){parts.cube(x+dx,y+.28,gz,.64,.61,.5,'#566c7a');lit.cube(x+dx,y+.28,gz+side*.253,.53,.47,.018,'#f4f2cb');}
}

function skyline(scene){
  const p=new Parts(),rand=random(517);
  for(let i=0;i<36;i++){
    const angle=i*TAU/36,r=67+rand()*24,w=4+rand()*6,d=4+rand()*6,h=8+rand()*22;
    const x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    p.cube(x,h/2-7,z,w,h,d,i%3===0?'#8aaab9':'#9ebbc6');
    p.cube(x,h-6.9,z,w+.15,.15,d+.15,'#c5d6da');
    if(i%3===0)p.cube(x,h-5,z,w*.35,3,d*.38,'#83a2b3');
    for(let y=2;y<h-9;y+=3.2)p.cube(x,y,z+d/2+.015,w*.8,.16,.025,'#c4d9de');
  }
  scene.add(p.mesh(new T.MeshBasicMaterial({vertexColors:true,fog:true})));
}

function placeProp(scene,kind,x,y,z,w,h,d,angle=0,variant='source'){
  const model=propMesh(kind,variant),root=new T.Group();model.rotation.y=angle;root.add(model);
  root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root),extent=bounds.getSize(new T.Vector3());
  root.scale.set(w/extent.x,h/extent.y,d/extent.z);root.position.set(x,y,z);
  root.name='environment-'+kind;
  root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
  scene.add(root);return root;
}
function environmentProps(scene,map){
  map.boxes.forEach((box,index)=>{
    if(!['block','pod'].includes(box.kind))return;
    const model=placeProp(scene,box.kind==='block'?'container':'crate',box.x,box.base||0,box.z,
      box.w,box.h-(box.base||0),box.d,box.w<box.d?PI/2:0,box.kind==='block'?(box.z>0?'blue':'orange'):'source');
    model.userData.colliderIndex=index;
  });
  // Everything beyond the perimeter is scenery, never usable cover inside the fight.
  for(const side of [-1,1]){
    placeProp(scene,'factory',side*30,-5.5,side*-6,12,10,13,side*PI/2);
    placeProp(scene,'factory',side*29,-5.5,side*31,14,13,11,side<0?PI:0);
    placeProp(scene,'factory',side*10,-5.5,side*40,15,11,11,side<0?0:PI);
    placeProp(scene,'waterTower',side*29,-5.5,side*-29,4.5,11.3,4.4);
    placeProp(scene,'tank',side*20.9,-.02,side*17,3.4,1.67,2.07,PI/2);
    placeProp(scene,'compressor',side*20.8,-.02,side*7,1.5,1.69,2.0,PI/2);
    placeProp(scene,'valve',side*21.1,-.02,side*-3,1.48,1.48,1.50,PI/2);
  }
}
export function makeYard(scene,map) {
  const geo=new Surfaces(),parts=new Parts(),lit=new Parts(),signs=new Signs();
  const floor=new T.Mesh(new T.PlaneGeometry(map.width+.04,map.depth+.04),new T.MeshLambertMaterial({map:groundTexture(map)}));
  floor.rotation.x=-PI/2;floor.receiveShadow=true;scene.add(floor);
  parts.cube(0,-.535,0,map.width+3.2,1.0,map.depth+3.2,'#5e7886');parts.cube(0,-6.0,0,220,1,220,'#90adb7');
  parts.cube(0,-3.1,0,map.width+2.2,4.9,map.depth+2.2,'#455e6d');
  for(const side of [-1,1]){
    const x=side*20.3;
    parts.cube(x,-.20,0,5.2,.36,40,'#667e89');
    for(const z of [-17,-8,1,10,18])parts.cube(x,-2.9,z,.55,5.2,.65,'#455b69');
    parts.tube(side*21.1,.45,0,.26,32,.26,'#7e939b',PI/2);
    for(let z=-15;z<=15;z+=5)parts.cube(side*21.1,.18,z,.54,.36,.16,iron);
  }
  for(const b of map.boxes)boxArt(geo,parts,b);for(const ramp of map.ramps||[])rampArt(geo,parts,ramp);
  perimeter(parts,signs,map);crane(parts);environmentProps(scene,map);
  for(const sx of [-1,1])for(const sz of [-1,1])floodlight(parts,lit,sx*(map.width/2+4.2),sz*(map.depth/2-2),-sz);
  const surfaces=geo.mesh(new T.MeshLambertMaterial({map:gridTexture(),vertexColors:true}));
  surfaces.castShadow=surfaces.receiveShadow=true;scene.add(surfaces);
  const structure=parts.mesh();structure.castShadow=structure.receiveShadow=true;scene.add(structure,lit.mesh(glowMaterial),signs.mesh());skyline(scene);
  const ring=new T.Mesh(new T.RingGeometry(map.zone.r-.125,map.zone.r,64),new T.MeshBasicMaterial({color:0xffcf63,transparent:true,opacity:.53,depthWrite:false}));
  ring.rotation.x=-PI/2;ring.position.set(map.zone.x,(map.zone.y||0)+.014,map.zone.z);scene.add(ring);return ring;
}
export function sky(scene) {
  const [c,ctx]=canvas(256,128),data=ctx.createImageData(256,128),rand=random(150933),noise=new Float32Array(32*32);
  for(let i=0;i<noise.length;i++)noise[i]=rand();
  const smooth=v=>v*v*(3-2*v),sample=(x,y,period)=>{
    const i=Math.floor(x),j=Math.floor(y),a=smooth(x-i),b=smooth(y-j),mask=period-1;
    const k0=noise[(i&mask)+((j&mask)<<5)],k1=noise[((i+1)&mask)+((j&mask)<<5)],k2=noise[(i&mask)+(((j+1)&mask)<<5)],k3=noise[((i+1)&mask)+(((j+1)&mask)<<5)];
    return (k0+(k1-k0)*a)*(1-b)+(k2+(k3-k2)*a)*b;
  };
  for(let y=0;y<128;y++)for(let x=0;x<256;x++){
    const v=255*(.55*sample(x/32,y/16,8)+.29*sample(x/16,y/8,16)+.16*sample(x/8,y/4,32)),i=(x+y*256)*4;
    data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;
  }ctx.putImageData(data,0,0);
  const clouds=new T.CanvasTexture(c);clouds.wrapS=clouds.wrapT=T.RepeatWrapping;
  const d=new T.Mesh(new T.SphereGeometry(155,32,16),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,fog:false,uniforms:{zenith:{value:new T.Color('#429fd3')},horizon:{value:new T.Color('#cae9f2')},clouds:{value:clouds}},
    vertexShader:'varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 dir;uniform vec3 zenith,horizon;uniform sampler2D clouds;
    void main(){vec3 d=normalize(dir);float y=max(0.,d.y);vec3 color=mix(horizon,zenith,smoothstep(.01,.75,y));
    vec2 uv=d.xz*(.13/(max(y,.02)+.12))+vec2(.47,.65);float cloud=smoothstep(.50,.71,texture2D(clouds,uv).r)*smoothstep(.035,.13,y)*(1.-smoothstep(.45,.86,y));color=mix(color,vec3(.93,.96,.96),cloud*.60);
    float sun=pow(max(dot(d,normalize(vec3(-.78,.72,.42))),0.),26.);color+=sun*vec3(.11,.085,.035);
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`
  }));d.renderOrder=-11;scene.add(d);
}

