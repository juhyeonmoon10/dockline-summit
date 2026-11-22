// Editable Quaternius CC0 sources and conversion tool: art-source/toon-shooter.
import * as T from './assets/three.module.min.js';
import { guns } from './assets/toon-guns.js';
import { blasters } from './assets/blaster-geometry.js';
import { Parts } from './arena-parts.js';
import { WEAPONS } from './balance.js';

const cache=new Map();
const paint=new T.MeshStandardMaterial({vertexColors:true,roughness:.46,metalness:.27});
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
const ink='#203340',shell='#365164',silver='#c6d9dc';
const halfTurn=Math.PI/2;

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

function arcadeDetails(kind,model,accent){
 const parts=new Parts();
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
  sidePanel(parts,[[-.245,.074],[-.179,.101],[-.048,.084],[-.084,.022],[-.206,.008]],.050,.066,accent);
  parts.cube(0,.091,-.125,.024,.032,.064,ink);
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
  const cartridge=spool.mesh(paint);cartridge.name='magazine';model.add(cartridge);
 }
 model.add(parts.mesh(paint));
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
   if(base){
    const colors=geo.attributes.color,tone=new T.Color(),accent=new T.Color(WEAPONS[kind].accent),shadow=new T.Color(ink),pale=new T.Color(silver);
    for(let i=0;i<colors.count;i++){
     const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i);
     if(r>g*1.38||b>g*1.7)tone.copy(accent).multiplyScalar(.52+.48*Math.max(r,b));
     else tone.copy(shadow).lerp(pale,Math.min(1,g*.90));
     colors.setXYZ(i,tone.r,tone.g,tone.b);
    }
   }
   const part=new T.Mesh(geo,paint);part.name=name;model.add(part);
  }
  if(base)arcadeDetails(kind,model,WEAPONS[kind].accent);
  cache.set(kind,model);
 }
 return cache.get(kind).clone();
}
