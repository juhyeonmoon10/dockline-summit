import * as T from './assets/three.module.min.js';
import {assetUrl} from './asset-url.js';
import {shotgunData} from './assets/dockline-shotgun-data.js';

const finish=new T.MeshStandardMaterial({roughness:.80,metalness:.12,vertexColors:true});
const textures=new T.TextureLoader();
function readMap(file,color=false){
  return textures.loadAsync(assetUrl(file)).then(texture=>{
    texture.flipY=false;texture.anisotropy=4;
    if(color)texture.colorSpace=T.SRGBColorSpace;
    return texture;
  });
}
export const scatterTextureReady=typeof document==='undefined'?Promise.resolve():Promise.allSettled([
  readMap('dockline-shotgun.webp',true),readMap('dockline-shotgun-normal.webp'),readMap('dockline-shotgun-finish.webp')
]).then(([base,normal,pbr])=>{
  if(base.status==='fulfilled'){finish.map=base.value;finish.vertexColors=false;}
  if(normal.status==='fulfilled'){finish.normalMap=normal.value;finish.normalScale.setScalar(.31);}
  if(pbr.status==='fulfilled'){
    finish.roughnessMap=pbr.value;finish.metalnessMap=pbr.value;finish.roughness=1;finish.metalness=1;
  }
  finish.needsUpdate=true;
});

const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const linear=Float32Array.from({length:256},(_,i)=>{
  const c=i/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
});
const geometry=new Map();
function unpack(source){
  if(geometry.has(source))return geometry.get(source);
  const geo=new T.BufferGeometry();
  const positions=new Int16Array(bytes(source.positions).buffer);
  geo.setAttribute('position',new T.Float32BufferAttribute(Float32Array.from(positions,n=>n*.0001),3));
  geo.setAttribute('normal',new T.Int8BufferAttribute(new Int8Array(bytes(source.normals).buffer),3,true));
  geo.setAttribute('color',new T.Float32BufferAttribute(Float32Array.from(bytes(source.colors),n=>linear[n]),3));
  if(source.uv)geo.setAttribute('uv',new T.Uint16BufferAttribute(new Uint16Array(bytes(source.uv).buffer),2,true));
  geo.setIndex(new T.BufferAttribute(new Uint16Array(bytes(source.faces).buffer),1));geo.computeBoundingSphere();
  geometry.set(source,geo);return geo;
}

// The game's straight visual shell replaces the curled lip in the generated surface.
// A recessed dark face and a continuous front ring keep the departure visible in inspection.
function roundProfile(rings,centerY){
  const points=rings.map(([radius,z])=>new T.Vector2(radius,z));
  const surface=new T.LatheGeometry(points,48);
  surface.rotateX(Math.PI/2);surface.translate(.0003,centerY,0);return surface;
}
const upper=roundProfile([[.0001,-.709],[.017,-.709],[.018,-.7374],[.024,-.7374],
  [.026,-.733],[.026,-.713],[.0265,-.485],[.028,-.425],[.028,-.400]],.0169);
const lower=roundProfile([[.0001,-.731],[.022,-.731],[.026,-.728],[.030,-.723],
  [.030,-.705],[.031,-.555],[.032,-.426],[.031,-.400]],-.039);
const metal=new T.MeshStandardMaterial({color:0x40484b,roughness:.55,metalness:.44,side:T.DoubleSide});
const capped=new T.MeshStandardMaterial({color:0x171b1e,roughness:.90,metalness:.04});
const boreFace=new T.CircleGeometry(.017,40);
boreFace.rotateY(Math.PI);boreFace.translate(.0003,.0169,-.7093);

export function scatterModel(){
  const group=new T.Group();group.name='shotgun';
  for(const name of ['body','pump']){
    const mesh=new T.Mesh(unpack(shotgunData.held[name]),finish);mesh.name=name;
    mesh.userData.previewGeometry=unpack(shotgunData.preview[name]);group.add(mesh);
  }
  for(const [part,form,paint] of [['front-shell',upper,metal],['slide-bed',lower,metal],['front-inset',boreFace,capped]]){
    const item=new T.Mesh(form,paint);item.name=part;group.add(item);
  }
  return group;
}
