// Editable author models and the offline conversion tool ship under art-source/blasters.
import * as T from './assets/three.module.min.js';
import { blasters } from './assets/blaster-geometry.js';

const cache = new Map();
const paint = new T.MeshStandardMaterial({vertexColors:true, roughness:.52, metalness:.13});
const color = new T.Color();
const ranges={
  rifle:[-.535,.228,-.171,.117],shotgun:[-.514,.151,-.252,.142],
  sniper:[-.87,.271,-.204,.131],pistol:[-.254,.081,-.141,.096],
};
const finishes=new Map();

// Factory markings are baked to a tiny local atlas. They wrap the actual
// receiver, so the same skin stays attached on other players and in the armory.
function receiverPaint(kind){
  if(finishes.has(kind))return finishes.get(kind);
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=384;
  const ctx=canvas.getContext('2d'),code={rifle:'AR / 24',shotgun:'SG / 05',sniper:'SR / 05',pistol:'SC / 12'}[kind];
  const cream='#eef2e5',ink='#223744',gold='#ffb540';
  const stripe=(x,y,w,h,fill)=>{
    ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);
    ctx.lineTo(x+w-17,y+h);ctx.lineTo(x-17,y+h);ctx.closePath();ctx.fill();
  };
  // Side view: inset panel and index printed onto the upper receiver.
  ctx.fillStyle=ink;ctx.fillRect(292,94,99,30);
  ctx.fillStyle=cream;ctx.font='bold 19px Arial,sans-serif';ctx.fillText(code,299,116);
  stripe(250,91,9,36,cream);stripe(266,91,9,36,cream);
  ctx.fillStyle=gold;ctx.fillRect(284,95,5,27);
  ctx.fillStyle=ink;
  for(let i=0;i<5;i++)ctx.fillRect(424+i*9,75,4,i===0?12:7);
  // Top-deck racing chevrons fore and aft of the sight stay legible from the hip.
  for(const x of [153,175])stripe(x,260,13,93,cream);
  for(const x of [469,487])stripe(x,260,9,93,cream);
  ctx.fillStyle=ink;ctx.fillRect(399,325,54,8);
  ctx.fillStyle=gold;ctx.fillRect(400,325,26,8);
  const atlas=new T.CanvasTexture(canvas);atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=4;
  const material=paint.clone();material.map=atlas;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec4 mark = texture2D(map,vMapUv); diffuseColor.rgb = mix(diffuseColor.rgb,mark.rgb,mark.a);');
  };
  finishes.set(kind,material);return material;
}

export const gunFit = {
  rifle:   {muzzle:-.535,muzzleY:.007, support:-.31,grip:-.073, sight:.122, flash:.9},
  shotgun: {muzzle:-.515,muzzleY:.044, support:-.29,grip:-.092, sight:.15, flash:1.34},
  sniper:  {muzzle:-.87, muzzleY:.001, support:-.43,grip:-.084, sight:.095, flash:1.17},
  pistol:  {muzzle:-.254,muzzleY:-.011,support:-.04,grip:-.071, sight:.095, flash:.65},
};

function bytes(str) { return Uint8Array.from(atob(str), char=>char.charCodeAt(0)); }
function skin(kind,r,g,b){
  if(kind==='rifle' && b>r*1.22 && r>g*1.20){
    // The original purple panels become saturated race-blue enamel.
    return color.setRGB(r*.27/255,(g*.96+26)/255,Math.min(255,b*1.08)/255,T.SRGBColorSpace);
  }
  if(r<g && g<b && b-r>13){
    // Distinguish light armor plate from rubber, without losing the baked gradient.
    const edge=Math.max(0,(r-130)*.66);
    return color.setRGB((r*.98+edge)/255,(g*.99+edge)/255,(b*.94+edge)/255,T.SRGBColorSpace);
  }
  return color.setRGB(r/255,g/255,b/255,T.SRGBColorSpace);
}

function geometry(kind,packed) {
  const raw=bytes(packed[0]), view=new DataView(raw.buffer), count=raw.length/12;
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),uvs=new Float32Array(count*2);
  const [front,rear,bottom,top]=ranges[kind];
  for(let i=0;i<count;i++){
    const k=12*i,offset=i*3;
    for(let channel=0;channel<3;channel++){
      positions[offset+channel]=view.getInt16(k+2*channel,true)*.0001;
      normals[offset+channel]=view.getInt8(k+6+channel)/127;
    }
    skin(kind,raw[k+9],raw[k+10],raw[k+11]).toArray(colors,offset);
    const x=positions[offset],y=positions[offset+1],z=positions[offset+2];
    const u=.045+.91*(z-front)/(rear-front);
    let v=.995;
    if(Math.abs(normals[offset])>.78)v=1-(39+179*(top-y)/(top-bottom))/384;
    else if(normals[offset+1]>.81)v=1-(306+x*450)/384;
    uvs[i*2]=u;uvs[i*2+1]=v;
  }
  const indices=bytes(packed[1]), geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.BufferAttribute(positions,3));
  geo.setAttribute('normal',new T.BufferAttribute(normals,3));
  geo.setAttribute('color',new T.BufferAttribute(colors,3));
  geo.setAttribute('uv',new T.BufferAttribute(uvs,2));
  geo.setIndex(new T.BufferAttribute(new Uint16Array(indices.buffer),1));
  geo.computeBoundingSphere();
  return geo;
}

/** Y-up, muzzle along -Z. No upload, texture request, or mesh loader needed. */
export function blasterMesh(kind='rifle') {
  if(!blasters[kind])kind='rifle';
  if(!cache.has(kind)){
    const model=new T.Group();
    for(const [name,source] of Object.entries(blasters[kind])){
      const part=new T.Mesh(geometry(kind,source),name==='body'?receiverPaint(kind):paint);
      part.name=name;model.add(part);
    }
    cache.set(kind,model);
  }
  return cache.get(kind).clone();
}
