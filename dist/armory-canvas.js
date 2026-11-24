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

// Three diffuse and three reflected-light channels in linear color space.
function lightAt(out,i,nx,ny,nz,material,studio,roughness,metalness){
  if(material.isMeshBasicMaterial){
    out[i]=out[i+1]=out[i+2]=1;out[i+3]=out[i+4]=out[i+5]=0;return;
  }
  const inv=1/(Math.sqrt(nx*nx+ny*ny+nz*nz)||1),x=nx*inv,y=ny*inv,z=nz*inv;
  const key=Math.max(0,-.46*x+.68*y+.57*z),rim=Math.max(0,.70*x+.43*y-.57*z);
  const highlight=Math.max(0,-.26*x+.37*y+.89*z),square=highlight*highlight;
  const fourth=square*square,eighth=fourth*fourth,shine=.12*eighth*eighth*square;
  if(!studio){
    out[i]=out[i+1]=out[i+2]=.68+.86*key+.42*rim;
    out[i+3]=out[i+4]=out[i+5]=shine;return;
  }
  const rx=2*z*x,ry=2*z*y,rz=2*z*z-1;
  const strip=Math.max(0,1-Math.abs(ry-.63-rx*.08)/(.09+roughness*.34))*
    Math.max(0,1-Math.abs(rx+.15)/1.22)*Math.max(.12,rz);
  const reflect=(.025+.38*metalness)*(1.05-roughness*.66)*strip,fill=.49+.16*(1+y);
  out[i]=fill+1.02*key+.28*rim;out[i+1]=fill+.89*key+.42*rim;out[i+2]=fill+.76*key+.64*rim;
  out[i+3]=.80*reflect+shine*.53;out[i+4]=.93*reflect+shine*.56;out[i+5]=reflect+shine*.67;
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
  const vertexLight=new WeakMap(),faceLight=new Float32Array(6),surfaceInputs=new WeakMap();
  // These attributes and texture samples are fixed in model space as the player rotates the item.
  function inputsFor(geo,atlas,orm,material){
    let inputs=surfaceInputs.get(geo);
    if(inputs&&inputs.atlas===atlas&&inputs.orm===orm)return inputs;
    const {normal,uv,position}=geo.attributes,count=position.count;
    const normals=new Float32Array(3*count);
    const coords=atlas?new Float32Array(2*count):null,finish=orm?new Float32Array(2*count):null;
    for(let i=0;i<count;i++){
      normals[i*3]=normal?normal.getX(i):0;normals[i*3+1]=normal?normal.getY(i):0;normals[i*3+2]=normal?normal.getZ(i):1;
      if(!atlas)continue;
      const u=uv.getX(i),v=uv.getY(i);
      coords[i*2]=u*atlas.width;coords[i*2+1]=(material.map.flipY?1-v:v)*atlas.height;
      if(orm){
        const x=Math.max(0,Math.min(orm.width-1,Math.floor(u*orm.width)));
        const y=Math.max(0,Math.min(orm.height-1,Math.floor((material.roughnessMap.flipY?1-v:v)*orm.height)));
        const k=4*(y*orm.width+x);
        finish[i*2]=orm.data[k+1]/255;finish[i*2+1]=orm.data[k+2]/255;
      }
    }
    inputs={atlas,orm,normals,coords,finish};surfaceInputs.set(geo,inputs);return inputs;
  }
  const normal=new T.Matrix3();
  let pixels,depth,packed;

  const translucent=[];
  function triangle(a,b,c,xyz,ink,w,h,writeDepth=true,surface=null){
    const ax=xyz[a],ay=xyz[a+1],az=xyz[a+2],bx=xyz[b],by=xyz[b+1],cx=xyz[c],cy=xyz[c+1];
    if(!Number.isFinite(ax+bx+cx))return;
    const ux=bx-ax,uy=by-ay,vx=cx-ax,vy=cy-ay,area=ux*vy-uy*vx;
    if(Math.abs(area)<.012 || (surface&&area*surface.cull>0))return;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
    const sx=vy/area,sy=-vx/area,tx=-uy/area,ty=ux/area;
    const dz1=xyz[b+2]-az,dz2=xyz[c+2]-az;
    const opaque=(ink>>>24)===255,winding=Math.sign(area);
    const edgeU=opaque||topLeft(ax-cx,ay-cy,winding),edgeV=opaque||topLeft(ux,uy,winding);
    const edgeW=opaque||topLeft(cx-bx,cy-by,winding);
    const shading=surface?.light;
    const ia=a*2,ib=b*2,ic=c*2;
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
          const vb=s.perspective?u*xyz[b+2]/z:u,vc=s.perspective?v*xyz[c+2]/z:v,va=1-vb-vc;
          let red=va*shading[ia]+vb*shading[ib]+vc*shading[ic];
          let green=va*shading[ia+1]+vb*shading[ib+1]+vc*shading[ic+1];
          let blue=va*shading[ia+2]+vb*shading[ib+2]+vc*shading[ic+2];
          if(atlas){
            const xTex=Math.min(atlas.width-1,Math.max(0,Math.floor(s.x+vb*s.ux+vc*s.vx)));
            const yTex=Math.min(atlas.height-1,Math.max(0,Math.floor(s.y+vb*s.uy+vc*s.vy)));
            const at=(yTex*atlas.width+xTex)*4,t=atlas.data;
            red=toLinear[t[at]]*red+va*shading[ia+3]+vb*shading[ib+3]+vc*shading[ic+3];
            green=toLinear[t[at+1]]*green+va*shading[ia+4]+vb*shading[ib+4]+vc*shading[ic+4];
            blue=toLinear[t[at+2]]*blue+va*shading[ia+5]+vb*shading[ib+5]+vc*shading[ic+5];
          }
          packed[index]=(255<<24)|(channel(blue)<<16)|(channel(green)<<8)|channel(red);
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
        const smooth=alpha===255 && !mesh.isSkinnedMesh && mesh.userData.previewGeometry && (nor||atlas);
        let surface;
        if(smooth){
          let light=vertexLight.get(mesh);
          if(!light||light.length!==6*pos.count){light=new Float32Array(6*pos.count);vertexLight.set(mesh,light);}
          const orm=atlas&&material.roughnessMap===material.metalnessMap?studioAtlas(material.roughnessMap):null;
          const input=inputsFor(geo,atlas,orm,material);
          for(let i=0;i<pos.count;i++){
            const nx=input.normals[3*i],ny=input.normals[3*i+1],nz=input.normals[3*i+2],j=6*i;
            const rough=input.finish?roughness*input.finish[2*i]:roughness;
            const metallic=input.finish?metal*input.finish[2*i+1]:metal;
            lightAt(light,j,normals[0]*nx+normals[3]*ny+normals[6]*nz,
              normals[1]*nx+normals[4]*ny+normals[7]*nz,normals[2]*nx+normals[5]*ny+normals[8]*nz,material,studio,rough,metallic);
            light[j]*=base.r;light[j+1]*=base.g;light[j+2]*=base.b;
            if(!atlas){
              light[j]=light[j]*(col?col.getX(i):1)+light[j+3];
              light[j+1]=light[j+1]*(col?col.getY(i):1)+light[j+4];
              light[j+2]=light[j+2]*(col?col.getZ(i):1)+light[j+5];
            }
          }
          const winding=Math.sign(mesh.matrixWorld.determinant());
          surface={light,atlas,coords:input.coords,perspective:Boolean(focal),cull:material.side===T.DoubleSide?0:material.side===T.BackSide?-winding:winding};
        }
        for(let offset=group.start,end=group.start+group.count;offset+2<end;offset+=3){
          const a=ix?ix[offset]:offset,b=ix?ix[offset+1]:offset+1,c=ix?ix[offset+2]:offset+2;
          if(surface){
            if(atlas){
              const coords=surface.coords;
              surface.x=coords[2*a];surface.y=coords[2*a+1];
              surface.ux=coords[2*b]-surface.x;surface.vx=coords[2*c]-surface.x;
              surface.uy=coords[2*b+1]-surface.y;surface.vy=coords[2*c+1]-surface.y;
            }
            triangle(a*3,b*3,c*3,points,-1,w,h,true,surface);
            continue;
          }
          const lx=nor?nor.getX(a)+nor.getX(b)+nor.getX(c):0;
          const ly=nor?nor.getY(a)+nor.getY(b)+nor.getY(c):0;
          const lz=nor?nor.getZ(a)+nor.getZ(b)+nor.getZ(c):1;
          const nx=normals[0]*lx+normals[3]*ly+normals[6]*lz,ny=normals[1]*lx+normals[4]*ly+normals[7]*lz,nz=normals[2]*lx+normals[5]*ly+normals[8]*lz;
          lightAt(faceLight,0,nx,ny,nz,material,studio,roughness,metal);
          const r=base.r*(col?col.getX(a):1),g=base.g*(col?col.getY(a):1),blue=base.b*(col?col.getZ(a):1);
          const redOut=r*faceLight[0]+faceLight[3],greenOut=g*faceLight[1]+faceLight[4],blueOut=blue*faceLight[2]+faceLight[5];
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
