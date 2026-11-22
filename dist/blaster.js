// Editable Quaternius CC0 sources and conversion tool: art-source/toon-shooter.
import * as T from './assets/three.module.min.js';
import { guns } from './assets/toon-guns.js';
import { blasters } from './assets/blaster-geometry.js';
import { Parts } from './arena-parts.js';
export { gunFit } from './gun-fit.js';

const cache=new Map();
// Surface contacts in the sniper's authored local frame, with the bolt at rest.
export const sniperContacts={support:[-.036,-.052,-.400],grip:[.024,-.070,.004],bolt:[.097,.095,-.084]};
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
  // The relief on the imported body was hidden by the new fore-end when seen
  // from the side, but it filled the sight picture when looking along the top.
  if(!isMagazine&&(kind==='burst'||kind==='lmg')&&y>.042){
   const amount=Math.max(0,Math.min(1,(-z-.035)/.095));
   position.setY(i,y-(y-.042)*.60*amount);
  }
  const colored=r>g*1.35||b>g*1.68;
  if(isMagazine)tone.copy(dark).lerp(steel,.16+Math.min(.50,g));
  else if(colored)tone.copy(coat);
  else tone.copy(dark).lerp(steel,Math.min(.95,(g+.03)*2.8));
  tone.multiplyScalar(1+.11*Math.max(0,normal.getY(i))+.035*Math.cos(z*57+y*17));
  color.setXYZ(i,tone.r,tone.g,tone.b);
 }
 if(!isMagazine&&(kind==='burst'||kind==='lmg')){geo.computeVertexNormals();geo.computeBoundingSphere();}
 breakerUV(geo);
}

// Profiled, hollow-ended exterior shells. The last two rings form the inset on the end cap.
// Rings share one indexed mesh with the rest of the fixture.
function turnedTrim(parts,x,y,sections,steps=24){
 const tint=new T.Color();
 for(let k=0;k<sections.length-1;k++){
  const [z0,r0,paint]=sections[k],[z1,r1]=sections[k+1];
  const slope=Math.atan2(r0-r1,z1-z0),nxy=Math.cos(slope),nz=Math.sin(slope);
  const start=parts.points.length/3;
  for(const [z,r] of [[z0,r0],[z1,r1]])for(let j=0;j<steps;j++){
   const a=j*Math.PI*2/steps,c=Math.cos(a),s=Math.sin(a);tint.set(paint);
   parts.points.push(x+c*r,y+s*r,z);parts.normals.push(c*nxy,s*nxy,nz);
   parts.colors.push(tint.r,tint.g,tint.b);
  }
  for(let j=0;j<steps;j++){
   const a=start+j,b=start+(j+1)%steps;parts.indices.push(a,b,b+steps,a,b+steps,a+steps);
  }
 }
}

function sniperEyepiece(){
 const positions=[],colors=[],indices=[],tint=new T.Color(),steps=32;
 const shade=new T.Color('#24474b'),reflection=new T.Color('#7b9a92');
 function vertex(radius,angle,depth,color){
  positions.push(.006+radius*Math.cos(angle),.145+radius*Math.sin(angle),depth);
  colors.push(color.r,color.g,color.b);return positions.length/3-1;
 }
 // A shallow, opaque dome preserves a visible reflection without another camera or texture.
 const center=vertex(0,0,-.0091,shade);
 let previous=0;
 const rings=[[.012,-.0095],[.024,-.0103],[.0305,-.0117],[.0315,-.0112],[.033,-.0109],[.0342,-.0122]];
 for(const [row,[radius,depth]] of rings.entries()){
  const start=positions.length/3;
  for(let i=0;i<steps;i++){
   const angle=i*2*Math.PI/steps;
   if(row<3){
    const u=Math.cos(angle)*radius/.0305,v=Math.sin(angle)*radius/.0305;
    const sky=Math.max(0,.34+v*.54-u*.17);
    tint.copy(shade).lerp(reflection,sky*(.52+.24*radius/.0305));
   }else tint.set(row===3?'#243e40':row===4?'#667675':'#384545');
   vertex(radius,angle,depth,tint);
  }
  for(let i=0;i<steps;i++){
   const j=(i+1)%steps;
   if(row===0)indices.push(center,start+i,start+j);
   else indices.push(previous+i,start+i,start+j,previous+i,start+j,previous+j);
  }
  previous=start;
 }
 // Only the upper-left portion catches a glint. The tapered ends disappear into the glass.
 const start=positions.length/3;
 for(let i=0;i<=10;i++){
  const u=i/10,angle=1.52+1.19*u,width=.0017*Math.sin(Math.PI*u);
  tint.set('#78948d').lerp(reflection,Math.sin(Math.PI*u));
  vertex(.0241-width,angle,-.0098,tint);vertex(.0241+width,angle,-.0098,tint);
  if(i){const n=start+2*i;indices.push(n-2,n-1,n+1,n-2,n+1,n);}
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 const glass=new T.MeshStandardMaterial({vertexColors:true,roughness:.28,metalness:.12});
 const lens=new T.Mesh(geo,glass);lens.name='ocular-glass';return lens;
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
  // One molded spine runs through both hand contacts and narrows into the raised comb.
  const furniture=new Parts();
  breakerShell(furniture,[[-.565,.018,.015,.055],[-.535,.024,-.008,.062],[-.468,.034,-.046,.064],
   [-.435,.037,-.057,.066],[-.393,.038,-.059,.067],[-.345,.036,-.053,.070],
   [-.306,.035,-.044,.070],[-.268,.033,-.039,.069],[-.193,.030,-.038,.066],[-.125,.029,-.022,.064],
   [-.060,.027,-.003,.065],[.008,.024,.004,.064],[.052,.019,.016,.058],
   [.084,.017,.021,.060],[.132,.020,.025,.075],[.199,.022,.018,.082],[.269,.021,-.010,.080]],'#56614e','#707967');
  sidePanel(furniture,[[-.038,-.013],[.020,-.021],[.061,-.112],[.052,-.128],
   [.014,-.122],[-.018,-.075]],.018,.026,p.coat);
  // The shallow saddle joins the angled palm swell to the spine in every view.
  breakerShell(furniture,[[-.045,.018,-.016,.012],[-.032,.022,-.031,.018],
   [.007,.021,-.039,.023],[.032,.017,-.020,.023]],p.coat,p.edge);
  furniture.beam([-.001,.001,-.013],[-.001,-.103,.037],.035,.048,'#4f594a');
  furniture.beam([0,-.106,.036],[0,-.120,.040],.032,.041,'#455042');
  // A second slender sweep under the cheek creates a small, open negative space.
  breakerShell(furniture,[[.039,.013,-.082,-.061],[.065,.016,-.074,-.049],[.112,.016,-.052,-.029],
   [.180,.017,-.027,-.007],[.233,.018,-.027,.018],[.269,.022,-.046,.042]],'#455043','#65705e');
  breakerShell(furniture,[[.257,.022,-.049,.079],[.267,.026,-.055,.081],[.280,.024,-.056,.079],[.286,.020,-.051,.073]],'#343b37','#566055');
  for(const side of [-1,1]){
   furniture.beam([side*.035,-.024,-.456],[side*.038,-.031,-.395],.0032,.005,p.edge);
   furniture.beam([side*.038,-.031,-.395],[side*.035,-.026,-.347],.0032,.005,p.edge);
   for(let i=0;i<3;i++)furniture.cube(side*.037,-.015,-.429+i*.024,.0028,.013,.005,p.dark,-.32);
   for(let i=0;i<3;i++)furniture.cube(side*.026,-.094+i*.014,.026-i*.008,.0025,.004,.026,p.edge,-.22);
   furniture.beam([side*.035,-.016,-.315],[side*.030,-.020,-.199],.003,.002,'#808574');
   furniture.beam([side*.021,.048,.159],[side*.022,.054,.234],.0025,.0025,'#747c69');
   for(let i=0;i<4;i++)furniture.cube(side*.025,-.040+i*.018,.274,.0022,.005,.014,'#454e45');
  }
  // A raised graphite cheek cushion carries the soft highlight nearest the camera.
  breakerShell(furniture,[[.092,.013,.057,.067],[.111,.019,.062,.080],[.153,.023,.070,.090],
   [.216,.024,.073,.093],[.245,.020,.074,.088],[.251,.016,.072,.082]],'#47524b','#6e796c');
  furniture.beam([.020,.079,.126],[.022,.087,.157],.0020,.0018,'#919989');
  furniture.beam([.022,.087,.157],[.023,.089,.208],.0020,.0018,'#798675');
  model.add(propMesh(furniture,'forearm-and-grip',2));

  // The full-length front taper and recessed end face share the same center as gunFit.
  turnedTrim(parts,.006,.064,[[-1.140,0,'#252c2e'],[-1.142,.012,'#303c3e'],[-1.143,.015,'#78817d'],
   [-1.141,.019,'#555e5d'],[-1.130,.020,'#515b5a'],[-1.097,.020,'#3c4545'],[-1.090,.016,'#596464'],
   [-.770,.0165,'#515e60'],[-.636,.019,'#3c494a'],[-.612,.023,'#596260'],[-.551,.023,'#475351'],
   [-.529,.027,'#596260'],[-.467,.027,'#47504e']],24);
  // A rounded receiver and a shallow rail give the long centerline distinct levels.
  turnedTrim(parts,.006,.065,[[-.510,.023,'#505c5c'],[-.481,.027,'#5f6c6c'],[-.458,.029,'#525e60'],
   [-.292,.029,'#495657'],[-.266,.031,'#596565'],[-.018,.031,'#4d585b'],[.002,.024,'#45504d']],20);
  breakerShell(parts,[[-.357,.020,.080,.091],[-.339,.026,.084,.101],[-.099,.026,.085,.101],[-.081,.019,.082,.093]],'#454e4f','#697572');
  for(const z of [-.309,-.258,-.156,-.104])parts.cube(.005,.101,z,.048,.002,.004,'#303b3b');
  parts.beam([0,-.025,-.142],[0,-.067,-.117],.014,.014,'#3b4543');
  parts.beam([0,-.067,-.117],[0,-.068,-.057],.014,.010,'#48534e');
  parts.beam([0,-.068,-.057],[0,-.049,-.019],.014,.011,'#404945');
  // An independently contoured optic replaces the original squared scope mesh.
  const optics=new Parts();
  turnedTrim(optics,.006,.145,[[-.427,.005,'#3b5557'],[-.428,.042,'#3e5759'],[-.435,.047,'#88918a'],[-.435,.053,'#535e5d'],
   [-.432,.055,'#3a4343'],[-.424,.054,'#5c6766'],[-.389,.053,'#495455'],[-.351,.042,'#505c5b'],
   [-.317,.028,'#606b68'],[-.304,.026,'#424d4d'],[-.123,.026,'#4f5a59'],[-.106,.028,'#68716d'],
   [-.079,.034,'#414c4c'],[-.055,.041,'#424e4d'],[-.029,.042,'#384344'],[-.023,.044,'#535f5c'],
   [-.014,.044,'#667470'],[-.010,.041,'#303c3c'],[-.010,.034,'#455352']],32);
  for(const z of [-.277,-.146]){
   optics.cube(.006,.103,z,.032,.029,.031,'#384342');
   optics.cube(.006,.095,z,.049,.008,.045,'#63706c');
   turnedTrim(optics,.006,.145,[[z-.012,.026,'#586260'],[z-.010,.030,'#394543'],[z+.008,.030,'#69736d'],[z+.012,.026,'#45504d']],24);
   optics.cube(.031,.145,z,.009,.014,.027,'#525b58');
  }
  optics.tube(.006,.170,-.212,.027,.020,.027,'#525c58');
  optics.tube(.006,.181,-.212,.032,.006,.032,'#757e73');
  model.add(propMesh(optics,'scope-housing',1));

  const magazine=new Parts();
  breakerShell(magazine,[[-.258,.015,-.103,-.024],[-.249,.022,-.127,-.022],[-.193,.023,-.131,-.023],[-.170,.018,-.116,-.028]],'#4b5350','#66726b');
  breakerShell(magazine,[[-.255,.016,-.122,-.112],[-.245,.023,-.134,-.122],[-.190,.024,-.138,-.125],[-.172,.019,-.120,-.111]],'#333c3a','#5f6b63');
  for(const side of [-1,1])for(let i=0;i<2;i++)magazine.cube(side*.0228,-.086,-.233+i*.027,.003,.044,.004,'#37413c',-.13);
  model.add(propMesh(magazine,'magazine',0));
  model.add(sniperEyepiece());
  // A fixed dark backing keeps the moving thumb lever legible against the receiver.
  // The backing ends on the metal receiver. Its previous long rear lip overhung
  // the narrow neck of the stock and lifted clear of it when seen from above.
  parts.cube(.032,.072,-.077,.016,.021,.151,p.dark);
  parts.beam([.018,.061,-.031],[.032,.069,-.015],.017,.024,p.steel);
  const tab=new Parts();
  tab.cube(.040,.077,-.117,.021,.023,.046,p.steel,.08);
  tab.beam([.041,.077,-.117],[.076,.080,-.097],.017,.018,'#657271');
  tab.beam([.074,.080,-.097],[.086,.093,-.086],.020,.021,p.dark);
  tab.six(.088,.094,-.084,.038,.024,.042,p.steel,0,0,halfTurn);
  tab.six(.099,.094,-.084,.031,.007,.033,p.dark,0,0,halfTurn);
  tab.cube(.103,.095,-.084,.003,.005,.016,p.mark);
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
  sidePanel(parts,[[-.525,.063],[-.436,.084],[-.170,.085],[-.086,.058],[-.161,-.006],[-.451,.003]],.048,.071,accent);
  for(const side of [-1,1]){
   for(let i=0;i<3;i++)parts.cube(side*.071,.041,-.417+i*.052,.008,.036,.018,ink,-.36);
   parts.beam([side*.046,.092,-.05],[side*.046,.145,-.115],.017,.022,silver);
   parts.beam([side*.046,.145,-.115],[side*.046,.103,-.181],.017,.022,silver);
  }
  parts.cube(0,.153,-.119,.106,.009,.055,ink);
  parts.six(0,.048,-.533,.083,.092,.062,shell,halfTurn);
  parts.six(0,.048,-.553,.085,.023,.066,accent,halfTurn);
  turnedTrim(parts,0,.048,[[-.697,0,ink],[-.700,.013,silver],[-.700,.019,edge],[-.690,.019,shell],[-.678,.017,shell],[-.568,.019,shell]],16);
  breakerShell(parts,[[-.075,.035,.051,.077],[.004,.040,.051,.092],[.149,.037,.053,.089],[.180,.029,.056,.082]],'#55544e','#67685d');
  for(const side of [-1,1]){
   parts.beam([side*.071,.067,-.406],[side*.071,.066,-.187],.0025,.004,edge);
   for(let i=0;i<3;i++)parts.cube(side*.072,.036,-.237+i*.018,.003,.009,.005,mark,-.28);
   parts.six(side*.070,.046,-.140,.011,.006,.011,silver,0,0,halfTurn);
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
  parts.six(0,.020,-.857,.067,.078,.064,shell,halfTurn);
  parts.six(0,.020,-.878,.070,.016,.067,accent,halfTurn);
  turnedTrim(parts,0,.020,[[-1.001,0,ink],[-1.004,.010,silver],[-1.004,.015,edge],[-.997,.016,shell],[-.986,.015,shell],[-.884,.014,shell]],16);
  breakerShell(parts,[[.030,.024,.035,.053],[.070,.035,.038,.069],[.173,.035,.038,.075],[.213,.026,.039,.066]],'#48565a',edge);
  for(const side of [-1,1]){
   parts.beam([side*.0655,.032,-.485],[side*.0655,.030,-.292],.0024,.004,edge);
   for(let i=0;i<3;i++)parts.cube(side*.066,.013,-.443+i*.019,.0025,.014,.004,ink,-.31);
   parts.cube(side*.043,.137,-.157,.0025,.006,.025,mark);
  }
 }else{
  sidePanel(parts,[[-.551,.061],[-.492,.084],[-.185,.116],[-.106,.103],[-.178,.012],[-.456,-.008]],.058,.080,accent);
  for(const side of [-1,1]){
   for(let i=0;i<4;i++)parts.cube(side*.080,.049,-.438+i*.051,.010,.035,.018,ink,-.34);
   parts.beam([side*.045,.115,-.010],[side*.045,.183,-.053],.017,.030,shell);
   parts.beam([side*.045,.183,-.053],[side*.045,.121,-.204],.017,.024,shell);
  }
  parts.cube(0,.186,-.068,.108,.019,.087,shell);
  parts.six(0,.048,-.563,.095,.116,.074,ink,halfTurn);
  parts.six(0,.048,-.595,.099,.025,.077,accent,halfTurn);
  turnedTrim(parts,0,.048,[[-.769,0,ink],[-.773,.015,silver],[-.773,.023,edge],[-.755,.024,shell],[-.740,.020,shell],[-.611,.022,shell]],20);
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
   parts.beam([side*.080,.073,-.402],[side*.080,.090,-.234],.003,.003,edge);
   parts.cube(side*.081,.053,-.200,.004,.009,.027,mark);
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
  // The Lookout is built entirely from its own exterior profiles below.
  const base=arcadeBodies[kind],sourceParts=kind==='sniper'?{}:base?blasters[base]:guns[kind];
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
