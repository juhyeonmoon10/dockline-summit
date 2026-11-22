// Editable Quaternius CC0 sources and conversion tool: art-source/toon-shooter.
import * as T from './assets/three.module.min.js';
import { guns } from './assets/toon-guns.js';
import { blasters } from './assets/blaster-geometry.js';
import { Parts } from './arena-parts.js';

const cache=new Map();
export const gunFit={
 rifle:{muzzle:-.616,muzzleY:.075,support:-.335,grip:-.074,sight:.175,flash:.9},
 shotgun:{muzzle:-.738,muzzleY:.017,support:-.565,grip:-.068,sight:.067,flash:1.34},
 sniper:{muzzle:-.937,muzzleY:.064,support:-.397,grip:-.077,sight:.143,flash:1.17},
 smg:{muzzle:-.394,muzzleY:.034,support:-.205,grip:-.066,sight:.111,flash:.64},
 burst:{muzzle:-.579,muzzleY:.048,support:-.320,grip:-.072,sight:.162,flash:.82},
 marksman:{muzzle:-.896,muzzleY:.020,support:-.409,grip:-.072,sight:.152,flash:1.02},
 lmg:{muzzle:-.621,muzzleY:.048,support:-.387,grip:-.070,sight:.188,flash:1.05},
 pistol:{muzzle:-.327,muzzleY:.057,support:-.045,grip:-.068,sight:.103,flash:.65}
};
const bytes=str=>Uint8Array.from(atob(str),char=>char.charCodeAt(0));
function geometry(packed){
 const raw=bytes(packed[0]),view=new DataView(raw.buffer),count=raw.length/12;
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),color=new T.Color();
 for(let i=0;i<count;i++){
  const k=i*12;
  for(let c=0;c<3;c++){positions[i*3+c]=view.getInt16(k+c*2,true)*.0001;normals[i*3+c]=view.getInt8(k+6+c)/127;}
  color.setRGB(raw[k+9]/255,raw[k+10]/255,raw[k+11]/255,T.SRGBColorSpace).toArray(colors,i*3);
 }
 const indexes=bytes(packed[1]),geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('normal',new T.BufferAttribute(normals,3));geo.setAttribute('color',new T.BufferAttribute(colors,3));geo.setIndex(new T.BufferAttribute(new Uint16Array(indexes.buffer),1));geo.computeBoundingSphere();
 return geo;
}
const arcadeBodies={smg:'pistol',burst:'rifle',marksman:'sniper',lmg:'shotgun'};
const ink='#303839',shell='#495354',silver='#737e7b';
const halfTurn=Math.PI/2;
// Each game prop has its own worn finish and a small identification mark.
const finishes={
 shotgun:{dark:'#383b39',steel:'#586064',coat:'#665346',edge:'#7a6958',mark:'#a4825c'},
 sniper:{dark:'#343b3b',steel:'#566363',coat:'#515e51',edge:'#6b7564',mark:'#928d6d'},
 pistol:{dark:'#363c40',steel:'#60686e',coat:'#484c4e',edge:'#656b69',mark:'#a6aaa0'},
 smg:{dark:'#343c3c',steel:'#5b6666',coat:'#405e59',edge:'#58736b',mark:'#83aa97'},
 burst:{dark:'#3c3b3b',steel:'#5f6261',coat:'#69534c',edge:'#827065',mark:'#b5856a'},
 marksman:{dark:'#3a4245',steel:'#69767b',coat:'#4c606a',edge:'#687c84',mark:'#99aab0'},
 lmg:{dark:'#383f40',steel:'#5b6262',coat:'#675e44',edge:'#85795a',mark:'#af9b66'}
};

// The Breaker keeps its original silhouette and separately animated magazine.
// Small differences in roughness and grain make the three finishes read under moving light.
let breakerMaterials;
function breakerPaint(){
 if(breakerMaterials)return breakerMaterials;
 const size=96,pixels=new Uint8Array(size*size*4);
 let seed=107;
 for(let i=0;i<size*size;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const grain=217+(seed>>>27);
  pixels.set([grain,grain,grain,255],4*i);
 }
 const map=new T.DataTexture(pixels,size,size);map.wrapS=map.wrapT=T.RepeatWrapping;
 map.colorSpace=T.SRGBColorSpace;map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;
 map.generateMipmaps=true;map.needsUpdate=true;
 breakerMaterials=[[.80,.16],[.57,.39],[.91,.035]].map(([roughness,metalness])=>
  new T.MeshStandardMaterial({vertexColors:true,roughness,metalness,map}));
 return breakerMaterials;
}

function breakerUV(geo){
 const {position,normal}=geo.attributes,uv=new Float32Array(position.count*2);
 for(let i=0;i<position.count;i++){
  const side=Math.abs(normal.getX(i))>.65,cap=Math.abs(normal.getZ(i))>.70;
  uv[2*i]=(cap?position.getX(i):position.getZ(i))*14;
  uv[2*i+1]=(side||cap?position.getY(i):position.getX(i))*14;
 }
 geo.setAttribute('uv',new T.BufferAttribute(uv,2));
}

function breakerSurface(geo,isMagazine){
 const {color,position,normal}=geo.attributes,faceGroup=[],tone=new T.Color();
 const groups=[[],[],[]],palette=['#3d4444','#535f63','#525742'];
 for(let i=0;i<color.count;i++){
  const r=color.getX(i),g=color.getY(i),b=color.getZ(i);
  const group=r>g*1.4?2:b>r*1.4?1:0;
  faceGroup.push(group);
  const y=position.getY(i),z=position.getZ(i);
  // Edges facing upward catch a softer polished grey, including on the loose magazine.
  const wear=Math.max(0,normal.getY(i))*.13+.04*Math.cos(z*43+y*30);
  tone.set(isMagazine?(group===1?'#465050':'#323938'):palette[group]);
  tone.multiplyScalar((group===0&&z<-.39?.76:1)+wear);
  color.setXYZ(i,tone.r,tone.g,tone.b);
 }
 const ids=geo.index.array;
 for(let i=0;i<ids.length;i+=3)groups[faceGroup[ids[i]]].push(ids[i],ids[i+1],ids[i+2]);
 let start=0;
 for(let i=0;i<groups.length;i++){
  if(groups[i].length)geo.addGroup(start,groups[i].length,i);
  start+=groups[i].length;
 }
 geo.setIndex(groups.flat());breakerUV(geo);
}

// Molded overlays follow the long faces visible nearest the camera. Each station
// has a beveled section, giving the top plane and sidewall separate reflections.
function breakerShell(parts,stations,face,edge){
 const section=([z,w,bottom,top])=>[
  [-w*.64,top,z],[w*.64,top,z],[w,top-.007,z],[w,bottom+.005,z],
  [w*.68,bottom,z],[-w*.68,bottom,z],[-w,bottom+.005,z],[-w,top-.007,z]
 ];
 const sections=stations.map(section),a=new T.Vector3(),b=new T.Vector3(),n=new T.Vector3();
 const color=new T.Color();
 function triangle(p,q,r,tint){
  a.fromArray(q).sub(b.fromArray(p));n.copy(a).cross(b.fromArray(r).sub(new T.Vector3(...p))).normalize();
  color.set(tint);const index=parts.points.length/3;
  for(const v of [p,q,r]){parts.points.push(...v);parts.normals.push(n.x,n.y,n.z);parts.colors.push(color.r,color.g,color.b);}
  parts.indices.push(index,index+1,index+2);
 }
 for(let row=0;row+1<sections.length;row++)for(let i=0;i<8;i++){
  const j=(i+1)%8,p=sections[row][i],q=sections[row][j],r=sections[row+1][j],s=sections[row+1][i];
  const tint=i===1||i===7?edge:face;
  triangle(p,s,r,tint);triangle(p,r,q,tint);
 }
 for(let j=1;j<7;j++){
  triangle(sections[0][0],sections[0][j],sections[0][j+1],face);
  const rear=sections.at(-1);triangle(rear[0],rear[j+1],rear[j],face);
 }
}

function breakerDetails(model){
 const polymer=new Parts(),metal=new Parts();
 breakerShell(polymer,[[.066,.019,.051,.092],[.084,.024,.042,.100],[.171,.027,.052,.104],[.215,.023,.063,.104],[.229,.019,.068,.099]],'#505642','#5b6050');
 breakerShell(polymer,[[.217,.022,-.027,.097],[.223,.024,-.036,.101],[.234,.024,-.035,.102],[.240,.019,-.030,.098]],'#303633','#424841');
 for(const side of [-1,1]){
  // Interrupted mold line, small worn edge and pressed grooves on either cheek.
  polymer.beam([side*.025,.071,.087],[side*.0273,.082,.166],.0023,.0033,'#383e33');
  polymer.beam([side*.0273,.082,.166],[side*.024,.085,.205],.0023,.0033,'#404536');
  for(let i=0;i<4;i++)polymer.beam([side*.025,.061+i*.002,.123+i*.011],[side*.0273,.073+i*.002,.111+i*.011],.0036,.0032,'#646755');
  metal.beam([side*.0378,.072,-.222],[side*.0378,.072,-.020],.0025,.0039,'#354044');
  metal.beam([side*.0378,.075,-.161],[side*.0378,.075,-.069],.0026,.0016,'#6c7473');
  for(const z of [-.202,-.045,.044])metal.six(side*.0377,.045,z,.009,.003,.009,'#687071',0,0,halfTurn);
 }
 breakerShell(metal,[[-.344,.030,.122,.132],[-.338,.035,.123,.137],[-.200,.035,.123,.137],[-.189,.029,.123,.133]],'#41494a','#596061');
 // An asymmetric inset keeps the broad upper face legible during reload rolls.
 for(const z of [-.312,-.280,-.248])metal.cube(0,.1376,z,.046,.0015,.004,'#2d3536');
 metal.cube(-.021,.1379,-.218,.005,.0018,.011,'#a28d63');
 for(const [parts,slot] of [[metal,1],[polymer,2]]){
  const mesh=parts.mesh(breakerPaint()[slot]);breakerUV(mesh.geometry);model.add(mesh);
 }
}

function propMesh(parts,name,slot=0){
 const mesh=parts.mesh(breakerPaint()[slot]);
 mesh.name=name;breakerUV(mesh.geometry);return mesh;
}

// Keep the original pump's faces on the animated mesh only. Both parts keep the
// authored local coordinates so cloning, hand placement and the resting pose agree.
function takeFaces(geo,select){
 const kept=[],taken=[],idx=geo.index.array;
 for(let i=0;i<idx.length;i+=3){
  const target=select(idx[i])?taken:kept;target.push(idx[i],idx[i+1],idx[i+2]);
 }
 const part=new T.BufferGeometry();
 const remap=new Map(),vertices=[];
 for(const old of taken)if(!remap.has(old)){remap.set(old,vertices.length);vertices.push(old);}
 for(const [name,attribute] of Object.entries(geo.attributes)){
  const array=new attribute.array.constructor(vertices.length*attribute.itemSize);
  for(const [next,old] of vertices.entries()){
   const start=old*attribute.itemSize;
   array.set(attribute.array.subarray(start,start+attribute.itemSize),next*attribute.itemSize);
  }
  part.setAttribute(name,new T.BufferAttribute(array,attribute.itemSize));
 }
 part.setIndex(taken.map(i=>remap.get(i)));geo.setIndex(kept);return part;
}

function propSurface(geo,kind,isMagazine){
 const {color,normal,position}=geo.attributes,style=finishes[kind],tone=new T.Color();
 const steel=new T.Color(style.steel),dark=new T.Color(style.dark),coat=new T.Color(style.coat);
 for(let i=0;i<color.count;i++){
  const r=color.getX(i),g=color.getY(i),b=color.getZ(i),y=position.getY(i),z=position.getZ(i);
  const colored=r>g*1.35||b>g*1.68;
  if(isMagazine)tone.copy(dark).lerp(steel,.16+Math.min(.50,g));
  else if(colored||(kind==='sniper'&&z>.010&&y<.11))tone.copy(coat);
  else tone.copy(dark).lerp(steel,Math.min(.95,(g+.03)*2.8));
  tone.multiplyScalar(1+.11*Math.max(0,normal.getY(i))+.035*Math.cos(z*57+y*17));
  color.setXYZ(i,tone.r,tone.g,tone.b);
 }
 breakerUV(geo);
}

function serviceDetails(model,kind){
 const p=finishes[kind],parts=new Parts();
 if(kind==='shotgun'){
  const slide=new Parts();
  for(const side of [-1,1]){
   slide.beam([side*.029,-.042,-.678],[side*.029,-.042,-.546],.007,.009,p.coat);
   for(let i=0;i<5;i++)slide.beam([side*.031,-.054,-.653+i*.021],[side*.031,-.042,-.660+i*.021],.004,.004,p.edge);
   parts.beam([side*.036,-.021,-.369],[side*.036,-.021,-.130],.0023,.004,ink);
   parts.beam([side*.036,-.017,-.337],[side*.036,-.017,-.249],.0025,.0017,p.edge);
   for(const z of [-.345,-.141])parts.six(side*.0365,-.041,z,.010,.0035,.010,p.steel,0,0,halfTurn);
  }
  const pump=model.getObjectByName('pump');
  pump.add(propMesh(slide,'molded-grips',2));
  breakerShell(parts,[[.013,.020,-.058,-.035],[.058,.028,-.045,-.005],[.111,.031,-.041,.025],[.148,.029,-.040,.025]],p.coat,p.edge);
  for(const side of [-1,1]){
   for(let i=0;i<4;i++)parts.beam([side*.030,-.033,.092+i*.011],[side*.030,-.017,.100+i*.011],.0028,.0038,p.edge);
  }
  for(let i=0;i<3;i++)parts.cube(0,.044,-.321+i*.027,.036,.002,.004,ink);
  parts.cube(-.018,.044,-.198,.007,.002,.012,p.mark);
 }else if(kind==='sniper'){
  breakerShell(parts,[[.043,.020,.043,.088],[.062,.025,.037,.099],[.168,.027,.042,.113],[.230,.023,.051,.110],[.258,.020,.052,.102]],p.coat,p.edge);
  for(const side of [-1,1]){
   parts.beam([side*.024,.070,.068],[side*.027,.083,.162],.003,.003,p.dark);
   for(let i=0;i<4;i++)parts.cube(side*.027,.071,.112+i*.018,.002,.011,.004,p.edge,-.35);
  }
  for(const z of [-.335,-.317,-.101,-.082])parts.tube(.006,.148,z,.084,.006,.084,p.dark,halfTurn);
  parts.six(.006,.145,-.007,.061,.006,.061,p.dark,halfTurn);
  parts.six(.006,.145,-.003,.048,.002,.048,'#3a5156',halfTurn);
  // This is an original external thumb pad. It travels on its own short inset.
  parts.cube(.036,.067,-.101,.008,.012,.124,p.dark);
  const tab=new Parts();
  tab.cube(.045,.072,-.120,.023,.020,.056,p.steel,.10);
  tab.six(.060,.072,-.110,.028,.013,.029,p.coat,0,0,halfTurn);
  tab.cube(.067,.074,-.110,.003,.006,.013,p.mark);
  model.add(propMesh(tab,'bolt',1));
 }else{
  // A short, stepped crown and checkered side inserts make the sidearm read in close-up.
  breakerShell(parts,[[-.257,.020,.073,.087],[-.235,.026,.070,.095],[-.094,.026,.072,.094],[-.078,.020,.075,.089]],p.steel,'#778083');
  for(const side of [-1,1]){
   for(let i=0;i<5;i++)parts.cube(side*.0283,.058,-.082+i*.012,.0028,.028,.0033,p.dark,-.28);
   for(let i=0;i<4;i++)parts.beam([side*.025,-.080+i*.012,.009],[side*.025,-.071+i*.012,-.021],.0025,.003,p.edge);
  }
  for(const side of [-1,1])parts.cube(side*.012,.093,-.023,.007,.006,.011,p.mark);
  const shoe=new Parts();
  breakerShell(shoe,[[-.040,.019,-.132,-.123],[-.033,.022,-.134,-.119],[.043,.022,-.134,-.120],[.053,.018,-.131,-.120]],'#3b4142','#646a67');
  // The authored pistol clip only included the visible base. The rest is revealed on reload.
  breakerShell(shoe,[[-.027,.012,-.124,-.047],[-.021,.014,-.124,-.040],[.032,.014,-.124,-.040],[.039,.011,-.124,-.048]],'#525a5a','#656e6b');
  model.getObjectByName('magazine').add(propMesh(shoe,'carrier',1));
 }
 model.add(propMesh(parts,'exterior',1));
}

// Laminate a beveled faceplate along the hand-authored side profile (Z/Y).
function sidePanel(parts,profile,inner,outer,color){
 const cy=profile.reduce((sum,p)=>sum+p[1],0)/profile.length;
 const cz=profile.reduce((sum,p)=>sum+p[0],0)/profile.length;
 const faceTint=new T.Color(color);
 for(const side of [-1,1]){
  const face=profile.map(([z,y])=>[side*outer,cy+(y-cy)*.83,cz+(z-cz)*.94]);
  const rim=profile.map(([z,y])=>[side*inner,y,z]);
  const triangle=(a,b,c,base)=>{
   const normal=new T.Vector3().subVectors(new T.Vector3(...b),new T.Vector3(...a)).cross(new T.Vector3().subVectors(new T.Vector3(...c),new T.Vector3(...a))).normalize();
   if(normal.x*side<0){[b,c]=[c,b];normal.negate();}
   const start=parts.points.length/3;
   for(const v of [a,b,c]){parts.points.push(...v);parts.normals.push(...normal.toArray());parts.colors.push(faceTint.r*base,faceTint.g*base,faceTint.b*base);}
   parts.indices.push(start,start+1,start+2);
  };
  for(let i=0;i<face.length;i++){
   const next=(i+1)%face.length;
   triangle([side*outer,cy,cz],face[i],face[next],1);
   triangle(rim[i],rim[next],face[next],.70);triangle(rim[i],face[next],face[i],.70);
  }
 }
}

function arcadeDetails(kind,model){
 const parts=new Parts(),{coat:accent,edge,mark}=finishes[kind];
 if(kind==='smg'){
  // A mint twin-pontoon nose and a loop-shaped tail give the Skipper its squat silhouette.
  for(const side of [-1,1]){
   const x=side*.049;
   parts.six(x,.033,-.276,.074,.202,.068,ink,halfTurn);
   parts.six(x,.033,-.318,.081,.112,.075,accent,halfTurn);
   parts.six(x,.033,-.383,.052,.022,.049,silver,halfTurn);
   parts.beam([x,.058,.045],[x,.071,.197],.020,.024,shell);
   parts.beam([x,-.043,.074],[x,.015,.204],.024,.027,shell);
  }
  parts.cube(0,.043,.198,.120,.073,.032,accent,-.13);
  breakerShell(parts,[[.162,.043,.045,.071],[.176,.054,.022,.079],[.201,.055,.017,.075],[.212,.051,.022,.069]],'#424e4b',edge);
  sidePanel(parts,[[-.245,.074],[-.179,.101],[-.048,.084],[-.084,.022],[-.206,.008]],.050,.066,accent);
  parts.cube(0,.091,-.125,.024,.032,.064,ink);
  for(const side of [-1,1]){
   parts.beam([side*.066,.046,-.213],[side*.066,.069,-.144],.002,.005,edge);
   for(let i=0;i<3;i++)parts.cube(side*.066,.044,-.115+i*.013,.0025,.018,.004,ink,-.29);
   parts.cube(side*.067,.060,-.111,.002,.007,.018,mark);
  }
  // The compact, offset pack stays visible behind the support hand.
  const pack=new Parts();
  breakerShell(pack,[[-.209,.026,-.176,-.016],[-.197,.032,-.188,-.012],[-.128,.032,-.173,-.012],[-.116,.026,-.157,-.018]],'#48504c','#626a60');
  breakerShell(pack,[[-.210,.028,-.180,-.165],[-.197,.035,-.191,-.166],[-.129,.035,-.177,-.152],[-.116,.028,-.160,-.145]],ink,edge);
  for(const side of [-1,1])for(let i=0;i<2;i++)pack.cube(side*.032,-.132,-.174+i*.021,.003,.060,.005,ink,-.12);
  model.add(propMesh(pack,'magazine',2));
 }else if(kind==='burst'){
  // Three coral ribs repeat the three-beat firing rhythm on both surfaces.
  sidePanel(parts,[[-.525,.068],[-.436,.110],[-.170,.096],[-.086,.058],[-.161,-.006],[-.451,.003]],.048,.082,accent);
  for(const side of [-1,1]){
   for(let i=0;i<3;i++)parts.cube(side*.083,.054,-.417+i*.052,.009,.046,.021,ink,-.36);
   parts.beam([side*.046,.092,-.05],[side*.046,.145,-.115],.017,.022,silver);
   parts.beam([side*.046,.145,-.115],[side*.046,.103,-.181],.017,.022,silver);
  }
  parts.cube(0,.147,-.119,.106,.019,.068,ink);
  parts.six(0,.048,-.533,.117,.092,.111,shell,halfTurn);
  parts.six(0,.048,-.553,.120,.023,.114,accent,halfTurn);
  parts.six(0,.048,-.580,.070,.004,.070,ink,halfTurn);
  breakerShell(parts,[[-.075,.035,.051,.077],[.004,.040,.051,.092],[.149,.037,.053,.089],[.180,.029,.056,.082]],'#55544e','#67685d');
  for(const side of [-1,1]){
   parts.beam([side*.082,.081,-.406],[side*.082,.071,-.187],.0025,.004,edge);
   for(let i=0;i<3;i++)parts.cube(side*.083,.039,-.237+i*.018,.003,.009,.005,mark,-.28);
   parts.six(side*.080,.054,-.140,.011,.006,.011,silver,0,0,halfTurn);
  }
 }else if(kind==='marksman'){
  sidePanel(parts,[[-.608,.023],[-.436,.062],[-.145,.052],[-.226,-.016],[-.553,-.028]],.047,.065,accent);
  for(const side of [-1,1]){
   parts.beam([side*.063,.016,-.455],[side*.040,.019,-.875],.018,.020,silver);
   parts.beam([side*.058,.048,-.130],[side*.040,.146,-.149],.015,.049,shell);
   parts.beam([side*.040,.146,-.149],[side*.037,.131,-.231],.015,.017,accent);
   parts.cube(side*.065,.010,-.266,.009,.013,.084,ink);
  }
  parts.cube(0,.151,-.150,.092,.014,.061,accent);
  parts.six(0,.020,-.857,.093,.078,.088,shell,halfTurn);
  parts.six(0,.020,-.878,.097,.016,.093,accent,halfTurn);
  breakerShell(parts,[[.030,.024,.035,.053],[.070,.035,.038,.069],[.173,.035,.038,.075],[.213,.026,.039,.066]],'#48565a',edge);
  for(const side of [-1,1]){
   parts.beam([side*.0655,.032,-.485],[side*.0655,.030,-.292],.0024,.004,edge);
   for(let i=0;i<3;i++)parts.cube(side*.066,.013,-.443+i*.019,.0025,.014,.004,ink,-.31);
   parts.cube(side*.043,.137,-.157,.0025,.006,.025,mark);
  }
 }else{
  sidePanel(parts,[[-.551,.069],[-.492,.120],[-.185,.143],[-.106,.109],[-.178,.012],[-.456,-.008]],.062,.100,accent);
  for(const side of [-1,1]){
   for(let i=0;i<4;i++)parts.cube(side*.101,.065,-.438+i*.051,.012,.044,.020,ink,-.34);
   parts.beam([side*.045,.115,-.010],[side*.045,.183,-.053],.017,.030,shell);
   parts.beam([side*.045,.183,-.053],[side*.045,.121,-.204],.017,.024,shell);
  }
  parts.cube(0,.186,-.068,.108,.019,.087,shell);
  parts.six(0,.048,-.563,.155,.116,.142,ink,halfTurn);
  parts.six(0,.048,-.595,.161,.025,.148,accent,halfTurn);
  const spool=new Parts();
  spool.tube(0,-.114,-.179,.222,.203,.222,shell,0,0,halfTurn);
  for(const side of [-1,1]){
   spool.tube(side*.103,-.114,-.179,.228,.020,.228,ink,0,0,halfTurn);
   spool.six(side*.114,-.114,-.179,.158,.008,.158,accent,0,0,halfTurn);
   spool.tube(side*.120,-.114,-.179,.080,.009,.080,shell,0,0,halfTurn);
  }
  for(const side of [-1,1]){
   for(let i=0;i<6;i++){
    const angle=i*Math.PI/3;
    spool.cube(side*.115,-.114+Math.sin(angle)*.088,-.179+Math.cos(angle)*.088,.007,.011,.022,edge,-angle);
   }
   parts.beam([side*.100,.100,-.402],[side*.100,.108,-.234],.003,.003,edge);
   parts.cube(side*.102,.053,-.200,.004,.009,.027,mark);
  }
  breakerShell(parts,[[-.016,.048,.072,.112],[.012,.055,.068,.125],[.077,.055,.060,.120],[.104,.045,.059,.108]],'#4c514a','#63685b');
  model.add(propMesh(spool,'magazine',1));
 }
 model.add(propMesh(parts,'exterior',2));
}

export function blasterMesh(kind='rifle'){
 if(!guns[kind]&&!arcadeBodies[kind])kind='rifle';
 if(!cache.has(kind)){
  const model=new T.Group();
  model.name=kind;
  const base=arcadeBodies[kind],sourceParts=base?blasters[base]:guns[kind];
  for(const [name,source] of Object.entries(sourceParts)){
   if(base&&(name==='scope'||(name==='magazine'&&kind==='lmg')))continue;
   const geo=geometry(source);
   if(kind==='shotgun'&&name==='body'){
    // The source assigns one grey swatch exclusively to the corrugated front grip.
    const pumpColor=new T.Color('#5f5f5f').r;
    const moving=takeFaces(geo,i=>Math.abs(geo.attributes.color.getX(i)-pumpColor)<.00001);
    propSurface(geo,kind,false);
    const tint=new T.Color(finishes.shotgun.coat),colors=moving.attributes.color;
    for(let i=0;i<colors.count;i++)colors.setXYZ(i,tint.r,tint.g,tint.b);
    moving.setAttribute('color',colors);breakerUV(moving);
    const pump=new T.Mesh(moving,breakerPaint()[2]);pump.name='pump';model.add(pump);
   }else if(kind==='rifle')breakerSurface(geo,name==='magazine');
   else propSurface(geo,kind,name==='magazine');
   const material=kind==='rifle'?breakerPaint():breakerPaint()[name==='magazine'?0:1];
   const part=new T.Mesh(geo,material);part.name=name;model.add(part);
  }
  if(kind==='rifle')breakerDetails(model);
  else if(base)arcadeDetails(kind,model);
  else serviceDetails(model,kind);
  cache.set(kind,model);
 }
 return cache.get(kind).clone();
}
