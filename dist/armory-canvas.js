import * as T from './assets/three.module.min.js';

// Depth-tested software rendering of the same geometry used on the GPU.
// It reads the same vertices, colors and moving parts as the WebGL preview.
const gamma=new Uint8Array(1025);
for(let i=0;i<=1024;i++){
  const x=i/1024;
  gamma[i]=Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055));
}
const channel=x=>gamma[Math.min(1024,Math.max(0,Math.round(x*1024)))];

export function createCanvasPreview(canvas){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas 2D unavailable');
  const projected=new WeakMap();
  const normal=new T.Matrix3();
  let pixels,depth,packed;

  function triangle(a,b,c,xyz,ink,w,h){
    const ax=xyz[a],ay=xyz[a+1],az=xyz[a+2],bx=xyz[b],by=xyz[b+1],cx=xyz[c],cy=xyz[c+1];
    if(!Number.isFinite(ax+bx+cx))return;
    const ux=bx-ax,uy=by-ay,vx=cx-ax,vy=cy-ay,area=ux*vy-uy*vx;
    if(Math.abs(area)<.012)return;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
    const sx=vy/area,sy=-vx/area,tx=-uy/area,ty=ux/area;
    const dz1=xyz[b+2]-az,dz2=xyz[c+2]-az;
    for(let y=y0;y<=y1;y++){
      let u=(x0+.5-ax)*sx+(y+.5-ay)*sy,v=(x0+.5-ax)*tx+(y+.5-ay)*ty;
      for(let x=x0,index=y*w+x0;x<=x1;x++,index++,u+=sx,v+=tx){
        if(u<0||v<0||u+v>1)continue;
        const z=az+u*dz1+v*dz2;
        if(z<=depth[index])continue;
        depth[index]=z;packed[index]=ink;
      }
    }
  }
  function render(root,units,perspectiveFov){
    const w=canvas.width,h=canvas.height;
    if(!pixels||pixels.width!==w||pixels.height!==h){
      pixels=ctx.createImageData(w,h);packed=new Uint32Array(pixels.data.buffer);depth=new Float32Array(w*h);
    }
    packed.fill(0);depth.fill(-Infinity);
    const scale=w/units,focal=perspectiveFov?h*.5/Math.tan(perspectiveFov*Math.PI/360):0;
    root.updateMatrixWorld(true);
    root.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      const geo=mesh.geometry,pos=geo.attributes.position,col=geo.attributes.color,nor=geo.attributes.normal;
      let points=projected.get(mesh);
      if(!points){points=new Float32Array(pos.count*3);projected.set(mesh,points);}
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
        const base=material.color;
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
          const ink=0xff000000|(channel(blue*light+shine)<<16)|(channel(g*light+shine)<<8)|channel(r*light+shine);
          triangle(a*3,b*3,c*3,points,ink,w,h);
        }
      }
    });
    ctx.putImageData(pixels,0,0);
  }
  return {render};
}
