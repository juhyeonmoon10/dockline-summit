import * as T from './assets/three.module.min.js';
import { Parts, glowMaterial } from './arena-parts.js';

const PI=Math.PI, TAU=PI*2;
const white='#ecedef', pale='#d6dce1', mid='#9caab5', dark='#455767', iron='#364756';
const blue='#337bb5', blueDark='#2f5e87', orange='#ef8151', orangeDark='#a95c44';
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
  const [c,g]=canvas(256),rand=random(34785);
  g.fillStyle='#fcfcfa';g.fillRect(0,0,256,256);
  for(let i=0;i<1800;i++){
    g.fillStyle=rand()>.5?'rgba(85,103,124,.043)':'rgba(255,255,255,.16)';
    g.fillRect(rand()*256,rand()*256,1,1);
  }
  g.lineWidth=1;g.strokeStyle='rgba(70,92,115,.21)';
  for(const k of [0,64,128,192,256]){
    g.beginPath();g.moveTo(k+.5,0);g.lineTo(k+.5,256);g.stroke();
    g.beginPath();g.moveTo(0,k+.5);g.lineTo(256,k+.5);g.stroke();
  }
  g.strokeStyle='rgba(44,63,80,.58)';g.lineWidth=1.4;
  for(let a=0;a<=4;a++)for(let b=0;b<=4;b++){
    const x=a*64+.5,y=b*64+.5;
    g.beginPath();g.moveTo(x-4,y);g.lineTo(x+4,y);g.moveTo(x,y-4);g.lineTo(x,y+4);g.stroke();
  }
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

function groundTexture(map) {
  const W=map.width,D=map.depth;
  const [c,g]=canvas(1344,1536);
  const X=x=>(x/W+.5)*c.width,Z=z=>(z/D+.5)*c.height,sx=c.width/W,sz=c.height/D;
  function rect(x,z,w,d,fill){g.fillStyle=fill;g.fillRect(X(x-w/2),Z(z-d/2),sx*w,sz*d);}
  function path(points,color,width=2,fill=false) {
    g.beginPath();for(let j=0;j<points.length;j++) {const [x,z]=points[j];if(j)g.lineTo(X(x),Z(z));else g.moveTo(X(x),Z(z));}
    if(fill){g.fillStyle=color;g.fill();}else{g.lineWidth=width;g.strokeStyle=color;g.stroke();}
  }
  g.fillStyle='#d9dfe2';g.fillRect(0,0,c.width,c.height);
  // Painted lanes use the architecture's callouts: ochre flanks and graphite court.
  for(const side of [-1,1]){
    path([[-W/2,side*(D/2)],[W/2,side*(D/2)],[W/2,side*16.1],[8.5,side*16.1],[6.4,side*14.8],[-3,side*14.8],[-5.7,side*16.4],[-W/2,side*16.4]],side>0?'#a9c6dc':'#e7c4b3',0,true);
    rect(side*14.6,0,5.75,D-9.6,'#c5cdd2');
    rect(side*7.1,0,.08,25,'#f8f9f8');
    path([[side*16.9,-16.8],[side*16.9,-6.8],[side*15.9,-5.8],[side*15.9,5.8],[side*16.9,6.8],[side*16.9,16.8]],'#f4f6f5',3);
    rect(0,side*19.25,15,.07,side>0?'#426f95':'#b46b55');
    rect(side*14.35,0,.08,8.5,'#7f939e');
  }
  path([[-4.6,-4.6],[-2.9,-5.8],[2.9,-5.8],[4.6,-4.6],[4.6,4.6],[2.9,5.8],[-2.9,5.8],[-4.6,4.6]],'#94a4af',0,true);
  // Survey crosses remain static under the camera and are understated at range.
  g.lineWidth=1.3;g.strokeStyle='rgba(81,103,121,.19)';
  for(let x=-18;x<=18;x+=1.2){g.beginPath();g.moveTo(X(x),0);g.lineTo(X(x),c.height);g.stroke();}
  for(let z=-21.6;z<=21.7;z+=1.2){g.beginPath();g.moveTo(0,Z(z));g.lineTo(c.width,Z(z));g.stroke();}
  g.strokeStyle='rgba(63,85,101,.49)';g.lineWidth=1.6;
  for(let x=-18;x<=18;x+=1.2)for(let z=-21.6;z<=21.7;z+=1.2){
    g.beginPath();g.moveTo(X(x)-3.4,Z(z));g.lineTo(X(x)+3.4,Z(z));g.moveTo(X(x),Z(z)-3.4);g.lineTo(X(x),Z(z)+3.4);g.stroke();
  }
  const R=random(23565);for(let i=0;i<13000;i++){g.fillStyle=R()>.4?'rgba(255,255,255,.15)':'rgba(88,106,118,.06)';g.fillRect(R()*c.width,R()*c.height,1.2,1.2);}
  for(const b of map.boxes){
    if(b.base)continue;
    const x=X(b.x-b.w/2),z=Z(b.z-b.d/2),w=b.w*sx,d=b.d*sz;
    g.save();g.shadowColor='rgba(33,49,70,.5)';g.shadowBlur=9;g.fillStyle='rgba(43,58,72,.13)';g.fillRect(x,z,w,d);g.restore();
  }
  for(const side of [-1,1]){
    const col=side>0?'#547e9f':'#ba7963';
    for(let k=0;k<4;k++)path([[-3.75+k*.45,side*16.7],[-3.52+k*.45,side*16.27],[-3.31+k*.45,side*16.27],[-3.54+k*.45,side*16.7]],col,0,true);
    // Small court-side hash marks stand out from the fine metre scale.
    for(let i=-13;i<14;i+=2)rect(side*(W/2-.48),i,.30,.065,'#8d9ea7');
    g.save();g.translate(X(side*-10.0),Z(side*18.0));g.rotate(side<0?PI:0);g.fillStyle=col;
    g.font='900 78px Arial, sans-serif';g.fillText(side>0?'01':'02',-45,22);g.restore();
    path([[side*5.6,-2.3],[side*7.0,-2.3],[side*7.0,-1.72]],'#feffff',4);
  }
  return texture(c);
}

function boxArt(s,p,b){
  const {x,z,w,d,h}=b,base=b.base||0;
  if(b.kind==='summit'){
    s.rounded(x,z,w,d,base,h-.105,dark,'#657986',.07);
    s.rounded(x,z,w,d,h-.105,h,pale,white,.04);
    for(const sign of [-1,1]){
      p.cube(x+sign*(w*.5+.004),h-.2,z,.013,.063,d-.52,'#e9ae49');
      for(const o of [-1.8,-1.5,1.5,1.8])p.cube(x+sign*(w*.5+.015),h-.2,z+o,.024,.09,.09,'#34485a');
    }return;
  }
  if(b.kind==='pier'){
    s.rounded(x,z,w,d,0,.16,iron,mid,.055);s.rounded(x,z,w-.07,d-.07,.13,h-.14,'#a0afbb',pale,.065);
    s.rounded(x,z,w,d,h-.17,h,'#5f7280','#b9c5cb',.035);return;
  }
  const tall=b.kind==='block',gallery=b.kind==='terrace',accent=team(z);
  const skirt=Math.min(.16,h*.12),belt=gallery?.15:tall?.14:.115;
  s.rounded(x,z,w,d,0,skirt,'#738592',mid,.065);
  s.rounded(x,z,w-.018,d-.018,skirt*.81,h-belt-.045,tall?'#dfe3e6':gallery?'#bbc7cf':'#c6d0d7',pale,tall?.1:.065);
  s.rounded(x,z,w,d,h-belt-.058,h-belt+.015,gallery?dark:tall?teamDeep(z):'#738a9a',dark,.02);
  s.rounded(x,z,w,d,h-belt+.008,h,white,'#f0f1ef',.05);
  const length=Math.max(w,d),alongX=w>d;
  for(const side of [-1,1]){
    const local=(a,height,zOffset=0)=>[x+(alongX?a:side*(w/2+zOffset)),height,z+(alongX?side*(d/2+zOffset):a)];
    const node=(a,y,wide,high,depth,c)=>p.cube(...local(a,y,.012),alongX?wide:depth,high,alongX?depth:wide,c);
    if(tall){node(-length*.28,h*.48,length*.26,.135,.035,accent);node(-length*.28,h*.48-.15,length*.26,.04,.035,teamDeep(z));}
    if(gallery){node(0,.45,length-.7,.105,.035,teamDeep(z));}
    if(!gallery&&!tall){node(-length*.29,h*.55,.65,.08,.032,accent);}
    for(const a of [-length*.37,length*.37]){node(a,skirt*.51,.22,.035,.032,'#263e4a');}
  }
}

function rampArt(s,p,r){
  const x=r.x,z=r.z,w=r.w,d=r.d,h=r.h,sz=r.sign;
  const zl=z-sz*d/2,zh=z+sz*d/2,L=x-w/2,R=x+w/2;
  const top=[[L,0,zl],[R,0,zl],[R,h,zh],[L,h,zh]];
  s.face(sz>0?top.slice().reverse():top,r.kind==='summit'?'#d7e0e4':'#e6e9ea','top');
  const face=(points,normalX,normalZ)=>{
    const [aa,bb,cc]=points,ab=new T.Vector3(...bb).sub(new T.Vector3(...aa)),ac=new T.Vector3(...cc).sub(new T.Vector3(...aa));
    const v=ab.cross(ac);s.face(v.x*normalX+v.z*normalZ<0?points.slice().reverse():points,'#99aab5');
  };
  face([[L,0,zl],[L,h,zh],[L,0,zh]],-1,0);face([[R,0,zl],[R,h,zh],[R,0,zh]],1,0);
  face([[L,0,zh],[R,0,zh],[R,h,zh],[L,h,zh]],0,sz);
  for(const side of [-1,1]){
    const xx=x+side*(w/2-.11);
    p.beam([xx,.025,zl],[xx,h+.025,zh],.105,.046,r.kind==='summit'?'#e8b54d':team(r.z));
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
function canopy(parts,signs,map,side){
  const edge=map.width/2;
  for(const band of [-1,1]){
    const z=band*9.35,length=11.5;
    for(let tier=0;tier<4;tier++){
      const x=side*(edge+2.0+tier*.78),h=.92+tier*.43;
      parts.cube(x,h/2,z,.92,h,length,'#c2ced5');parts.cube(x,h+.025,z,.89,.1,length+.1,'#edf0ed');
      for(let j=0;j<10;j++)parts.cube(x+side*.12,h+.19,z-length*.44+j*(length*.1),.45,.22,.69,(tier+j)%7===0?'#718a9e':tier>1?'#7897ad':'#99afbb');
    }
    for(const dz of [-length*.42,length*.42]){
      const x=side*(edge+5.45);parts.beam([x,.48,z+dz],[x-side*.1,5.2,z+dz],.25,.31,iron);
      parts.beam([x-side*.1,4.65,z+dz],[x-side*3.4,5.73,z+dz],.16,.18,mid);parts.beam([x,3.04,z+dz],[x-side*2.15,5.4,z+dz],.11,.12,mid);
    }
    for(let j=0;j<5;j++)parts.cube(side*(edge+3.45),5.49,z-length/2+(j+.5)*length/5,5.0,.125,length/5-.055,white,0,0,-side*.105);
    parts.cube(side*(edge+.97),5.75,z,.13,.18,length+.08,'#a5b4bc');parts.cube(side*(edge+5.9),5.22,z,.14,.17,length+.08,'#8296a3');
  }
  const x=side*(edge+1.12);
  parts.cube(x,1.75,0,.82,3.50,6,'#acb9c4');parts.cube(x,2.43,0,.84,1.37,6.04,'#263f53');parts.cube(x,3.25,0,1,.2,6.3,white);
  signs.panel(x-side*.43,2.44,0,5.77,1.30,-side*PI/2,2);
}
function perimeter(parts,signs,map){
  const W=map.width,D=map.depth;
  for(const side of [-1,1]){
    const x=side*(W*.5+.22),z=side*(D*.5+.22);
    parts.cube(x,.64,0,.43,1.28,D+.78,'#acbac3');parts.cube(0,.64,z,W+.78,1.28,.43,'#aebac1');
    parts.cube(x,1.27,0,.51,.14,D+.8,pale);parts.cube(0,1.27,z,W+.8,.14,.51,pale);
    parts.cube(x-side*.20,.95,0,.056,.12,D+.70,dark);parts.cube(0,.95,z-side*.20,W+.68,.12,.056,team(side));
    for(let i=-18;i<=18;i+=4.5){parts.cube(x-side*.227,.64,i,.015,.94,.039,'#82949e');parts.cube(x,.42,i+.23,.47,.16,.08,'#cfd8dc');}
    for(let i=-15;i<=15;i+=5)parts.cube(i,.6,z-side*.218,.04,.96,.013,mid);
    canopy(parts,signs,map,side);backGate(parts,signs,map,side);
  }
}
function floodlight(parts,lit,x,z,side){
  const y=10.9,gz=z+.25*side;parts.cube(x,.34,z,1.09,.68,1.05,'#93a4aa');parts.cube(x,5.45,z,.25,10.9,.32,'#8196a4');parts.cube(x,y,z,2.92,.21,.34,iron);
  for(const dx of [-1.02,-.34,.34,1.02]){parts.cube(x+dx,y+.28,gz,.64,.61,.5,'#566c7a');lit.cube(x+dx,y+.28,gz+side*.253,.53,.47,.018,'#f4f2cb');}
}

function hills(scene){
  const hill=new Surfaces(),n=120,rand=random(1357);
  for(const [dist,height,light,shadow,footLight,footDark] of [[106,11,'#bfd5df','#a9c1d0','#b3cbd2','#a9c4cf'],[71,6,'#aacac8','#91b9bb','#a7c5b9','#96bbb4']]){
    const ring=[];
    for(let k=0;k<n;k++){
      const a=k*TAU/n, peak=Math.pow(.5+.5*Math.sin(4*a+.65),2.5);
      const h=height+peak*(dist>90?12:5.5)+3*Math.sin(2*a+1.4)+1.7*Math.sin(9*a)+rand()*1.7;
      const r=dist+rand()*5,at=(b,radius,y)=>[radius*Math.cos(b),y,radius*Math.sin(b)];
      ring.push({peak:at(a,r,h),mid:at(a-.018+rand()*.035,r*(.86+.05*rand()),h*(.36+.30*rand())),base:at(a,r*.73,-3)});
    }
    for(let k=0;k<n;k++){
      const a=ring[k],b=ring[(k+1)%n],lit=b.peak[1]>a.peak[1];
      hill.face([a.mid,b.peak,a.peak],lit?light:shadow);hill.face([a.mid,b.mid,b.peak],lit?shadow:light);
      hill.face([a.base,b.mid,a.mid],lit?footLight:footDark);hill.face([a.base,b.base,b.mid],lit?footDark:footLight);
    }
  }
  scene.add(hill.mesh(new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:true})));
}
export function makeYard(scene,map) {
  const geo=new Surfaces(),parts=new Parts(),lit=new Parts(),signs=new Signs();
  const floor=new T.Mesh(new T.PlaneGeometry(map.width+.04,map.depth+.04),new T.MeshLambertMaterial({map:groundTexture(map)}));
  floor.rotation.x=-PI/2;floor.receiveShadow=true;scene.add(floor);
  parts.cube(0,-.40,0,map.width+3.2,.74,map.depth+3.2,'#96a6b1');parts.cube(0,-1.25,0,220,1,220,'#b5c9c5');
  for(const b of map.boxes)boxArt(geo,parts,b);for(const ramp of map.ramps||[])rampArt(geo,parts,ramp);
  perimeter(parts,signs,map);
  for(const sx of [-1,1])for(const sz of [-1,1])floodlight(parts,lit,sx*(map.width/2+4.2),sz*(map.depth/2-2),-sz);
  const surfaces=geo.mesh(new T.MeshLambertMaterial({map:gridTexture(),vertexColors:true}));
  surfaces.castShadow=surfaces.receiveShadow=true;scene.add(surfaces);
  const structure=parts.mesh();structure.castShadow=structure.receiveShadow=true;scene.add(structure,lit.mesh(glowMaterial),signs.mesh());hills(scene);
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
    side:T.BackSide,depthWrite:false,fog:false,uniforms:{zenith:{value:new T.Color('#4e99cc')},horizon:{value:new T.Color('#c5e2eb')},clouds:{value:clouds}},
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

