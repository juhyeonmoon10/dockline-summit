import * as T from './assets/three.module.min.js';
import { Parts } from './arena-parts.js';

let template;
const restPose={x:0,y:0,z:0,rx:0,ry:0,rz:0};
export const knifeFit={muzzle:-.10,muzzleY:.35,support:0,grip:-.075,sight:0,flash:0};

// Original low-poly asset: a beveled drop-point blade, wrapped grip, and brass guard.
// The handle is centred at the origin; +Y points toward the blade tip.
export function knifeMesh(){
  if(!template){
    template=new T.Group();template.name='knife';
    const outline=[[-.055,.055],[.052,.055],[.052,.270],[.010,.418],[-.043,.310]];
    const inset=[[-.031,.070],[.030,.070],[.029,.255],[.008,.375],[-.022,.299]];
    const positions=[],colors=[],tint=new T.Color();
    const triangle=(a,b,c,color)=>{tint.set(color);for(const point of [a,b,c]){positions.push(...point);colors.push(tint.r,tint.g,tint.b);}};
    for(const side of [-1,1]){
      const center=[-.004,.204,side*.032];
      for(let i=0;i<outline.length;i++){
        const j=(i+1)%outline.length,a=[...outline[i],0],b=[...outline[j],0],c=[...inset[j],side*.022],d=[...inset[i],side*.022];
        const face=(a,b,c,color)=>side<0?triangle(a,c,b,color):triangle(a,b,c,color);
        face(a,b,c,i===4?'#8babb6':'#eaf1e9');face(a,c,d,i===4?'#8babb6':'#eaf1e9');
        face(d,c,center,i<2?'#9eb5c0':'#c9d8dc');
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const blade=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.24,side:T.DoubleSide}));blade.name='blade';template.add(blade);
    const grip=new Parts();
    grip.six(0,-.070,0,.060,.194,.048,'#263747',0,Math.PI/6);
    for(let i=0;i<5;i++)grip.cube(0,-.133+i*.031,-.002,.064,.014,.052,i%2?'#405363':'#344958',0,0,-.10);
    grip.cube(0,.030,0,.145,.025,.061,'#e3a630',0,0,-.055);
    grip.cube(0,.047,0,.092,.013,.047,'#526674');
    grip.six(0,-.175,0,.073,.029,.055,'#b8852e',0,Math.PI/6);
    grip.cube(0,-.176,-.030,.027,.012,.004,'#dfe9e4');
    // The dark fuller and small steel pin stay on the real blade/handle surfaces.
    grip.cube(-.012,.176,-.032,.009,.140,.002,'#516d7c');
    grip.tube(0,-.105,-.029,.013,.004,.013,'#b7c8ce',Math.PI/2);
    template.add(grip.mesh());
  }
  return template.clone();
}

// Wind-up, a quick crossing cut at 100 ms, then a longer readable recovery.
export function knifePose(age,side=1){
  if(age<0||age>=.55)return restPose;
  const frames=[
    [0,0,0,0,0,0,0],
    [.045,.035,.025,.035,-.10,-.25*side,-.25*side],
    [.105,-.35,-.025*side,-.15,.40,.52*side,1.34*side],
    [.190,-.26,-.09*side,-.08,.30,.26*side,.92*side],
    [.55,0,0,0,0,0,0]
  ];
  let i=1;while(i<frames.length-1&&age>frames[i][0])i++;
  const a=frames[i-1],b=frames[i],f=(age-a[0])/(b[0]-a[0]),t=f*f*(3-2*f);
  const out={};for(const [index,key] of ['x','y','z','rx','ry','rz'].entries())out[key]=a[index+1]+(b[index+1]-a[index+1])*t;
  return out;
}
