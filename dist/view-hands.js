import * as T from './assets/three.module.min.js';
import {assetUrl} from './asset-url.js';
import {held,preview,seats,tips} from './assets/responder-glove.js';

// Rounded cross-sections follow the hand last and glove pattern. Adjacent
// sections share vertices so stitched panels sit on a continuous silhouette.
const rounded=n=>Math.sign(n)*Math.abs(n)**.70;
const section=Array.from({length:20},(_,i)=>{
  const angle=(i+.75)*Math.PI/10;
  return [rounded(Math.cos(angle)),rounded(Math.sin(angle))];
});
// Woven fabric and pebbled leather keep their texture at close desktop FOV.
// One small shared tile also supplies the fine relief across collar folds.
const tile=96,texels=new Uint8Array(tile*tile*4);
let seed=181;
for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=(seed>>>24)/255,weft=Math.cos((x+2*y)*Math.PI/4),warp=Math.cos((2*x-y)*Math.PI/4);
  const shade=Math.round(219+weft*8+warp*5+noise*21);
  texels.set([shade,shade,shade,255],(y*tile+x)*4);
}
const weave=new T.DataTexture(texels,tile,tile);
weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.colorSpace=T.SRGBColorSpace;
weave.magFilter=T.LinearFilter;weave.minFilter=T.LinearMipmapLinearFilter;weave.generateMipmaps=true;weave.needsUpdate=true;
const cloth=new T.MeshStandardMaterial({vertexColors:true,roughness:.80,metalness:.045,map:weave,bumpMap:weave,bumpScale:.0005});
const fabric='#55605c',leather='#333b37',edge='#73796c',seam='#252b29',rubber='#292e2a';
function batch(){return {pos:[],color:[],indices:[]};}
const shade=new T.Color();
function loft(dst,rows,hues,axis) {
  const start=dst.pos.length/3,n=section.length;
  for(const [x,y,z,w,h] of rows){
    let i=0;
    for(const [u,v] of section){
      if(axis==='x')dst.pos.push(x,y+v*h,z+u*w);
      else if(axis==='z')dst.pos.push(x+u*w,y+v*h,z);
      else dst.pos.push(x+u*w,y,z+v*h);
      shade.set(hues[Math.floor(i*hues.length/n)]);dst.color.push(shade.r,shade.g,shade.b);i++;
    }
  }
  // Compute winding from the actual local section/longitudinal axes.
  const negative=rows.at(-1)[axis==='x'?0:axis==='y'?1:2]<rows[0][axis==='x'?0:axis==='y'?1:2];
  const reverse=(axis!=='z')!==negative;
  const tri=(a,b,c)=>dst.indices.push(a,reverse?c:b,reverse?b:c);
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<n;i++){
    const a=start+j*n+i,b=start+j*n+(i+1)%n;tri(a,b,b+n);tri(a,b+n,a+n);
  }
  for(let i=1;i<n-1;i++){
    tri(start,start+i+1,start+i);
    const end=start+(rows.length-1)*n;tri(end,end+i,end+i+1);
  }
}
function mesh(data,sleeve=false) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(data.pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(data.color,3));
  g.setIndex(data.indices);g.computeVertexNormals();
  const pos=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    uv[i*2]=(Math.abs(n.getX(i))>.6?z:x)*22;
    uv[i*2+1]=(Math.abs(n.getY(i))>.7?z*22:y*(sleeve?8:22));
  }
  g.setAttribute('uv',new T.BufferAttribute(uv,2));return new T.Mesh(g,cloth);
}
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const glovePaint=new T.MeshStandardMaterial({vertexColors:true,roughness:.84,metalness:.015});
export const gloveTextureReady=typeof document==='undefined'?Promise.resolve():new T.TextureLoader()
  .loadAsync(assetUrl('responder-glove.webp')).then(texture=>{
    texture.colorSpace=T.SRGBColorSpace;texture.flipY=false;texture.anisotropy=4;
    glovePaint.vertexColors=false;glovePaint.map=texture;glovePaint.needsUpdate=true;
  }).catch(error=>console.warn('장갑 텍스처를 불러오지 못했습니다.',error));

const gloveMeshes=new Map();
const linearChannel=Float32Array.from({length:256},(_,i)=>{
  const c=i/255;
  return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
});
function importedGloveGeometry(source){
  if(gloveMeshes.has(source))return gloveMeshes.get(source);
  const {points,texcoords,colors,digits,triangles}=source;
  const raw=new Int16Array(decode(points).buffer),weights=decode(digits),count=raw.length/3;
  const indexes=new Uint8Array(count*4),mix=new Float32Array(count*4);
  for(let i=0;i<count;i++){
    const finger=weights[i*3],bend=weights[i*3+1]/255,tip=weights[i*3+2]/255;
    indexes.set([0,1+2*finger,2+2*finger,0],4*i);
    mix.set([1-bend,bend*(1-tip),bend*tip,0],4*i);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(Float32Array.from(raw,x=>x*.0001),3));
  const linear=Float32Array.from(decode(colors),value=>linearChannel[value]);
  geo.setAttribute('color',new T.Float32BufferAttribute(linear,3));
  if(texcoords)geo.setAttribute('uv',new T.Uint16BufferAttribute(new Uint16Array(decode(texcoords).buffer),2,true));
  geo.setAttribute('skinIndex',new T.Uint8BufferAttribute(indexes,4));
  geo.setAttribute('skinWeight',new T.Float32BufferAttribute(mix,4));
  geo.setIndex(new T.BufferAttribute(new Uint16Array(decode(triangles).buffer),1));
  geo.computeVertexNormals();gloveMeshes.set(source,geo);return geo;
}
const outward=new T.Vector3(-1,0,0);
let wristLiner;
function linedCuff(){
  if(!wristLiner){
    const p=batch();
    // A sewn-in dark knit tube closes the original cut even as the sleeve changes direction.
    loft(p,[[.039,-.066,.049,.024,.029],[.038,-.067,.061,.027,.035],
      [.037,-.068,.069,.035,.040],[.038,-.068,.083,.036,.040],
      [.038,-.070,.092,.035,.038],[.039,-.073,.108,.029,.033]],
      ['#403e37','#353833','#47463d','#333630'],'z');
    wristLiner=mesh(p);
  }
  return wristLiner.clone();
}
function fingerChain(root,i){
  const seat=new T.Vector3(...seats[i]),tip=new T.Vector3(...tips[i]),axis=tip.sub(seat);
  const a=new T.Bone(),b=new T.Bone();
  a.position.copy(seat);
  a.quaternion.setFromUnitVectors(outward,axis.clone().normalize());
  b.position.x=-axis.length()*.56;root.add(a);a.add(b);
  return {a,b,rest:a.quaternion.clone()};
}
export function articulatedGlove(left=false){
  const group=new T.Group(),skin=new T.Group(),root=new T.Bone();
  const mesh=new T.SkinnedMesh(importedGloveGeometry(held),glovePaint);
  mesh.userData.previewGeometry=importedGloveGeometry(preview);
  mesh.name='Tripo responder glove';mesh.frustumCulled=false;
  skin.add(mesh,linedCuff());mesh.add(root);
  const chains=seats.map((_,i)=>fingerChain(root,i));
  mesh.bind(new T.Skeleton([root,...chains.flatMap(({a,b})=>[a,b])]));
  if(left)skin.scale.x=-1;
  group.add(skin);
  group.userData={fingers:chains.slice(0,4),thumb:chains[4],left,
    wrist:new T.Vector3(),elbow:new T.Vector3(),sleeve:viewSleeve()};
  flexGlove(group,0);
  return group;
}
const digitTurn=new T.Quaternion(),digitEuler=new T.Euler();
function bendDigit(chain,proximal,distal,spread){
  chain.a.quaternion.copy(chain.rest).multiply(digitTurn.setFromEuler(digitEuler.set(0,proximal,spread,'ZYX')));
  chain.b.rotation.set(0,distal,0);
}
export function flexGlove(hand,release,indexFixed=false) {
  const {fingers,thumb,left,wrist}=hand.userData,open=Math.max(0,Math.min(1,release));
  // Seat the original finger on the moving ring socket in the reverse grip.
  const skin=hand.children[0];
  skin.position.set(indexFixed?.055754:0,indexFixed?.000486:0,indexFixed?-.012476:0);
  wrist.set(left?-.038:.038,-.070,.074).add(skin.position);
  fingers.forEach((finger,i)=>{
    if(indexFixed&&i===0){bendDigit(finger,1.48,1.49,-.03);return;}
    const reach=open*(left?1-i*.10:1);
    bendDigit(finger,(i===0?1.11:1.42)-reach*1.12+i*.02,1.18-reach*.97,(i-1.5)*.07*reach);
  });
  const stock=Number(hand.userData.stockGrip||0),free=1-stock;
  bendDigit(thumb,free*((indexFixed?1.61:1.15)-open*.47)-stock*.70,
    free*(.84-open*.48)-stock*.38,free*(-.55+open*.21)-stock*.31);
}

let sleeve;
export function viewSleeve() {
  if(sleeve)return sleeve.clone();
  const data=batch();
  const rows=[[0,0,0,.080,.069],[-.004,.25,.003,.072,.065],[.002,.43,-.002,.063,.058],
    [.004,.55,0,.067,.058],[-.001,.58,.003,.061,.054],[0,.65,0,.064,.052],
    [.002,.73,0,.054,.048],[-.001,.77,.002,.057,.047],[0,.81,0,.048,.043],[0,.95,0,.043,.036]];
  loft(data,rows,['#48504b','#424a45','#39433e','#414943','#39423d','#333c38','#444c46','#4c544d'],'y');
  // The forearm's asymmetric pleats compress into the closed wrist gaiter.
  for(const [y,w,h] of [[.57,.065,.056],[.69,.059,.051],[.775,.054,.047]]){
    const strip=[[-.004,y-.025,.002,w*.94,h*.96],[-.003,y,0,w*1.035,h*1.025],
      [.001,y+.012,.001,w*.96,h*.94]];
    loft(data,strip,['#556057','#49524a','#3f463e','#394039','#343d37','#434c44'],'y');
  }
  loft(data,[[0,.83,0,.048,.044],[0,.85,0,.050,.044],[0,.94,0,.044,.037],[0,.955,0,.041,.036]],
    [rubber,leather,seam,leather],'y');
  loft(data,[[0,.93,0,.044,.038],[0,.936,0,.0448,.039],[0,.948,0,.043,.038]], [edge,fabric,seam,fabric],'y');
  sleeve=mesh(data,true);return sleeve.clone();
}
