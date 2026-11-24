import * as T from './assets/three.module.min.js';

// Depth-tested software rendering of the same geometry used on the GPU.
// It reads the same vertices, colors and moving parts as the WebGL preview.
const gamma=new Uint8Array(1025);
for(let i=0;i<=1024;i++){
  const x=i/1024;
  gamma[i]=Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055));
}
const channel=x=>gamma[Math.min(1024,Math.max(0,Math.round(x*1024)))];
const toLinear=Float32Array.from({length:256},(_,i)=>{
  const x=i/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
});
const studioMaps=new WeakMap();
function studioAtlas(texture){
  const image=texture?.image;
  if(!image?.width||!image.height)return null;
  if(studioMaps.has(image))return studioMaps.get(image);
  const scale=Math.min(1,1024/Math.max(image.width,image.height));
  const tile=document.createElement('canvas');
  tile.width=Math.max(1,Math.round(image.width*scale));tile.height=Math.max(1,Math.round(image.height*scale));
  const ctx=tile.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,tile.width,tile.height);
  const atlas=ctx.getImageData(0,0,tile.width,tile.height);
  studioMaps.set(image,atlas);return atlas;
}

// Straight-alpha RGBA is required here: the same canvas also composites the
// player's held model over the Lite arena and the catalogue's workbench.
function over(foreground,background){
  const fa=foreground>>>24,ba=background>>>24;
  if(!ba)return foreground;
  const keep=ba*(1-fa/255),opacity=fa+keep;
  const r=Math.round(((foreground&255)*fa+(background&255)*keep)/opacity);
  const g=Math.round((((foreground>>>8)&255)*fa+((background>>>8)&255)*keep)/opacity);
  const b=Math.round((((foreground>>>16)&255)*fa+((background>>>16)&255)*keep)/opacity);
  return (Math.round(opacity)<<24)|(b<<16)|(g<<8)|r;
}

function topLeft(dx,dy,winding){
  return dy*winding<0||(dy===0&&dx*winding>0);
}

// Each visible hand gets its own posed vertices. Its source geometry is
// shared by both hands and across weapons, even while their fingers move independently.
const posedMeshes=new WeakMap();
function skinForPreview(mesh,geo){
  const {position,normal,skinIndex,skinWeight}=geo.attributes;
  let pose=posedMeshes.get(mesh);
  if(!pose||pose.source!==geo){
    const vectors=()=>new T.BufferAttribute(new Float32Array(position.count*3),3);
    pose={source:geo,position:vectors(),normal:vectors(),bones:mesh.skeleton.bones.map(()=>new T.Matrix4())};
    posedMeshes.set(mesh,pose);
  }
  mesh.skeleton.bones.forEach((bone,i)=>{
    pose.bones[i].multiplyMatrices(mesh.bindMatrixInverse,bone.matrixWorld)
      .multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix);
  });
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const nx=normal.getX(i),ny=normal.getY(i),nz=normal.getZ(i);
    let px=0,py=0,pz=0,sx=0,sy=0,sz=0;
    for(let j=0;j<4;j++){
      const weight=skinWeight.getComponent(i,j);
      if(!weight)continue;
      const m=pose.bones[skinIndex.getComponent(i,j)].elements;
      px+=weight*(m[0]*x+m[4]*y+m[8]*z+m[12]);
      py+=weight*(m[1]*x+m[5]*y+m[9]*z+m[13]);
      pz+=weight*(m[2]*x+m[6]*y+m[10]*z+m[14]);
      sx+=weight*(m[0]*nx+m[4]*ny+m[8]*nz);
      sy+=weight*(m[1]*nx+m[5]*ny+m[9]*nz);
      sz+=weight*(m[2]*nx+m[6]*ny+m[10]*nz);
    }
    pose.position.setXYZ(i,px,py,pz);
    pose.normal.setXYZ(i,sx,sy,sz);
  }
  return pose;
}

export function createCanvasPreview(canvas,{studio=false}={}){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas 2D unavailable');
  const projected=new WeakMap();
  const normal=new T.Matrix3();
  let pixels,depth,packed;

  const translucent=[];
  function triangle(a,b,c,xyz,ink,w,h,writeDepth=true,surface=null){
    const ax=xyz[a],ay=xyz[a+1],az=xyz[a+2],bx=xyz[b],by=xyz[b+1],cx=xyz[c],cy=xyz[c+1];
    if(!Number.isFinite(ax+bx+cx))return;
    const ux=bx-ax,uy=by-ay,vx=cx-ax,vy=cy-ay,area=ux*vy-uy*vx;
    if(Math.abs(area)<.012 || (surface&&area>0))return;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
    const sx=vy/area,sy=-vx/area,tx=-uy/area,ty=ux/area;
    const dz1=xyz[b+2]-az,dz2=xyz[c+2]-az;
    const opaque=(ink>>>24)===255,winding=Math.sign(area);
    const edgeU=opaque||topLeft(ax-cx,ay-cy,winding),edgeV=opaque||topLeft(ux,uy,winding);
    const edgeW=opaque||topLeft(cx-bx,cy-by,winding);
    for(let y=y0;y<=y1;y++){
      let u=(x0+.5-ax)*sx+(y+.5-ay)*sy,v=(x0+.5-ax)*tx+(y+.5-ay)*ty;
      for(let x=x0,index=y*w+x0;x<=x1;x++,index++,u+=sx,v+=tx){
        if(opaque){if(u<0||v<0||u+v>1)continue;}
        else{
          const w=1-u-v,eps=1e-8;
          if(u< -eps||v< -eps||w< -eps||u<=eps&&!edgeU||v<=eps&&!edgeV||w<=eps&&!edgeW)continue;
        }
        const z=az+u*dz1+v*dz2;
        if(z<=depth[index])continue;
        if(writeDepth)depth[index]=z;
        if(surface){
          const s=surface,atlas=s.atlas;
          const xTex=Math.min(atlas.width-1,Math.max(0,Math.floor(s.x+u*s.ux+v*s.vx)));
          const yTex=Math.min(atlas.height-1,Math.max(0,Math.floor(s.y+u*s.uy+v*s.vy)));
          const texel=(yTex*atlas.width+xTex)*4,t=atlas.data;
          const r=channel(toLinear[t[texel]]*s.r+s.addR);
          const g=channel(toLinear[t[texel+1]]*s.g+s.addG);
          const b=channel(toLinear[t[texel+2]]*s.b+s.addB);
          packed[index]=(255<<24)|(b<<16)|(g<<8)|r;
        }else packed[index]=opaque?ink:over(ink,packed[index]);
      }
    }
  }
  function render(root,units,perspectiveFov){
    const w=canvas.width,h=canvas.height;
    if(!pixels||pixels.width!==w||pixels.height!==h){
      pixels=ctx.createImageData(w,h);packed=new Uint32Array(pixels.data.buffer);depth=new Float32Array(w*h);
    }
    packed.fill(0);depth.fill(-Infinity);translucent.length=0;
    const scale=w/units,focal=perspectiveFov?h*.5/Math.tan(perspectiveFov*Math.PI/360):0;
    root.updateMatrixWorld(true);
    root.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      // The lightweight vertex-color mesh has no atlas coordinates. Use the
      // seamed model for textured close-ups in the orthographic armory only.
      const atlas=studio&&!focal&&!mesh.isSkinnedMesh&&mesh.userData.previewGeometry&&
        mesh.geometry.attributes.uv ? studioAtlas(mesh.material.map) : null;
      const geo=atlas?mesh.geometry:mesh.userData.previewGeometry??mesh.geometry;
      const attrs=mesh.isSkinnedMesh?skinForPreview(mesh,geo):geo.attributes;
      const pos=attrs.position,col=geo.attributes.color,nor=attrs.normal;
      let points=projected.get(mesh);
      if(!points||points.length!==pos.count*3){points=new Float32Array(pos.count*3);projected.set(mesh,points);}
      const m=mesh.matrixWorld.elements;
      for(let i=0,j=0;i<pos.count;i++,j+=3){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        const vz=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(focal&&vz>=-.03){points[j]=NaN;continue;}
        const projection=focal?-focal/vz:scale;
        points[j]=w*.5+projection*(m[0]*x+m[4]*y+m[8]*z+m[12]);
        points[j+1]=h*.5-projection*(m[1]*x+m[5]*y+m[9]*z+m[13]);
        points[j+2]=focal?-1/vz:vz;
      }
      const normals=normal.getNormalMatrix(mesh.matrixWorld).elements;
      const ix=geo.index?.array,groups=Array.isArray(mesh.material)?geo.groups:[{start:0,count:ix?.length??pos.count}];
      for(const group of groups){
        const material=Array.isArray(mesh.material)?mesh.material[group.materialIndex]:mesh.material;
        if(!material?.visible)continue;
        const alpha=material.transparent?Math.round(Math.max(0,Math.min(1,material.opacity))*255):255;
        if(!alpha)continue;
        const base=material.color,roughness=material.roughness??.76,metal=material.metalness??0;
        const studioLit=studio&&!material.isMeshBasicMaterial;
        for(let offset=group.start,end=group.start+group.count;offset+2<end;offset+=3){
          const a=ix?ix[offset]:offset,b=ix?ix[offset+1]:offset+1,c=ix?ix[offset+2]:offset+2;
          const lx=nor?nor.getX(a)+nor.getX(b)+nor.getX(c):0;
          const ly=nor?nor.getY(a)+nor.getY(b)+nor.getY(c):0;
          const lz=nor?nor.getZ(a)+nor.getZ(b)+nor.getZ(c):1;
          const nx=normals[0]*lx+normals[3]*ly+normals[6]*lz,ny=normals[1]*lx+normals[4]*ly+normals[7]*lz,nz=normals[2]*lx+normals[5]*ly+normals[8]*lz;
          const length=Math.hypot(nx,ny,nz)||1;
          const key=Math.max(0,(-.46*nx+.68*ny+.57*nz)/length);
          const rim=Math.max(0,(.70*nx+.43*ny-.57*nz)/length);
          const light=material.isMeshBasicMaterial?1:.68+.86*key+.42*rim;
          const shine=material.isMeshBasicMaterial?0:.12*Math.pow(Math.max(0,(-.26*nx+.37*ny+.89*nz)/length),18);
          const r=base.r*(col?col.getX(a):1),g=base.g*(col?col.getY(a):1),blue=base.b*(col?col.getZ(a):1);
          let redLight=light,greenLight=light,blueLight=light,addR=shine,addG=shine,addB=shine;
          if(studioLit){
            // Different panel reflections on rough polymer and bright blade bevels.
            const x=nx/length,y=ny/length,z=nz/length;
            const rx=2*z*x,ry=2*z*y,rz=2*z*z-1;
            const strip=Math.max(0,1-Math.abs(ry-.63-rx*.08)/(.09+roughness*.34))*
              Math.max(0,1-Math.abs(rx+.15)/1.22)*Math.max(.12,rz);
            const reflect=(.025+.38*metal)*(1.05-roughness*.66)*strip;
            const fill=.49+.16*(1+y);
            redLight=fill+1.02*key+.28*rim;greenLight=fill+.89*key+.42*rim;blueLight=fill+.76*key+.64*rim;
            addR=.80*reflect+shine*.53;addG=.93*reflect+shine*.56;addB=reflect+shine*.67;
          }
          if(atlas&&alpha===255){
            const uv=geo.attributes.uv,x=uv.getX(a)*atlas.width;
            const vScale=material.map.flipY?-atlas.height:atlas.height;
            const va=uv.getY(a),y=(material.map.flipY?1-va:va)*atlas.height;
            triangle(a*3,b*3,c*3,points,-1,w,h,true,{atlas,x,y,
              ux:uv.getX(b)*atlas.width-x,vx:uv.getX(c)*atlas.width-x,
              uy:(uv.getY(b)-va)*vScale,vy:(uv.getY(c)-va)*vScale,
              r:redLight*base.r,g:greenLight*base.g,b:blueLight*base.b,addR,addG,addB});
            continue;
          }
          const redOut=r*redLight+addR,greenOut=g*greenLight+addG,blueOut=blue*blueLight+addB;
          const ink=(alpha<<24)|(channel(blueOut)<<16)|(channel(greenOut)<<8)|channel(redOut);
          if(alpha===255)triangle(a*3,b*3,c*3,points,ink,w,h);
          else{
            const z=points[a*3+2]+points[b*3+2]+points[c*3+2];
            translucent.push({a:a*3,b:b*3,c:c*3,points,ink,z,order:mesh.renderOrder,writeDepth:material.depthWrite});
          }
        }
      }
    });
    // Housing and hands have established their depth before the lens is tinted.
    translucent.sort((a,b)=>a.order-b.order||a.z-b.z);
    for(const t of translucent)triangle(t.a,t.b,t.c,t.points,t.ink,w,h,t.writeDepth);
    ctx.putImageData(pixels,0,0);
  }
  return {render};
}
