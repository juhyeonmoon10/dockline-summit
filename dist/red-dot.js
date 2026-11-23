import * as T from './assets/three.module.min.js';
import {Parts} from './arena-parts.js';
import {gunFit} from './gun-fit.js';
import {opticFit,REFLEX_APERTURE,insideReflexWindow} from './optic-fit.js';

const frameMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.61,metalness:.43,side:T.DoubleSide});
const glassMat=new T.MeshBasicMaterial({color:0x77c8be,transparent:true,opacity:.105,depthWrite:false,side:T.DoubleSide});
let hardware,glass;
function makeHousing(){
  const parts=new Parts(),color=new T.Color(),a=new T.Vector3(),n=new T.Vector3(),v=new T.Vector3();
  const ring=(width,height,z)=>REFLEX_APERTURE.map(([x,y])=>
    [x*width,y*height,z-y*.15]);
  function quad(p,q,r,s,hue){
    const start=parts.points.length/3;
    n.fromArray(q).sub(a.fromArray(p)).cross(v.fromArray(r).sub(a)).normalize();
    color.set(hue);
    for(const pt of [p,q,r,s]){
      parts.points.push(...pt);parts.normals.push(n.x,n.y,n.z);parts.colors.push(color.r,color.g,color.b);
    }
    parts.indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  const contours=[ring(1,1,.006),ring(1.045,1.065,.009),ring(1.13,1.14,.009),
    ring(1.18,1.21,.005),ring(1.18,1.21,-.020),ring(1.13,1.15,-.024),ring(1,1,-.024)];
  const finishes=['#697172','#373f40','#747d7a','#474e50','#394144','#596264','#303b3c'];
  for(let layer=0;layer<contours.length;layer++){
    const near=contours[layer],far=contours[(layer+1)%contours.length];
    for(let i=0;i<near.length;i++){
      const j=(i+1)%near.length;
      quad(near[i],far[i],far[j],near[j],finishes[layer]);
    }
  }
  // The housing overhangs a narrower rail shoe. The exposed heel and
  // clamping hardware stay visible when inspecting the gun from behind.
  parts.cube(0,-.045,.008,.055,.010,.087,'#333b3d');
  parts.cube(0,-.039,.003,.064,.010,.093,'#505858');
  parts.cube(0,-.033,.008,.074,.012,.079,'#3b4545');
  for(const side of [-1,1]){
    parts.beam([side*.035,-.030,.039],[side*.041,-.013,.003],.006,.010,'#4b5354');
    parts.cube(side*.028,-.045,.014,.004,.010,.063,'#727978');
    parts.six(side*.033,-.039,.020,.013,.004,.013,'#89918b',0,0,Math.PI/2);
    parts.cube(side*.0352,-.039,.020,.001,.0022,.0075,'#343d3f',.43);
  }
  parts.cube(.040,-.019,-.007,.012,.024,.027,'#444d4e');
  parts.tube(.047,-.018,-.008,.021,.005,.021,'#626b6b',0,0,Math.PI/2);
  parts.cube(.050,-.018,-.008,.001,.003,.012,'#30383b',-.31);
  parts.cube(0,-.0289,.030,.018,.0028,.010,'#626c68');
  parts.cube(0,-.027,.030,.008,.0018,.004,'#a56e60');
  return parts.mesh(frameMat).geometry;
}

export function redDotMount(id){
  const fit=opticFit(id);
  if(!fit)return null;
  if(!hardware){
    hardware=makeHousing();
    const outline=REFLEX_APERTURE.map(([x,y])=>new T.Vector2(x,y));
    glass=new T.ShapeGeometry(new T.Shape(outline));
  }
  const group=new T.Group(),frame=new T.Mesh(hardware,frameMat),window=new T.Mesh(glass,glassMat);
  group.name='reflex-sight';frame.name='reflex-housing';window.name='reflex-window';
  group.position.set(fit.x,fit.y,fit.z);group.scale.setScalar(fit.scale);
  window.renderOrder=1;group.add(frame,window);return group;
}

const pivot=new T.Vector3(),turnedPivot=new T.Vector3();
const aimedRise={shotgun:.33,marksman:.55,pistol:.60};
// Applied to the existing sway, recoil and equip pose. At full ADS the actual
// aperture is at eyeZ; recoil turns the gun mostly about that contact.
export function seatReflex(rig,id,aim){
  const fit=opticFit(id);
  if(!aim||!fit)return;
  // These fore-ends otherwise climb through the target at the crest of the
  // recoil animation. Keep their kick back into the shoulder and their roll.
  if(aimedRise[id]&&rig.rotation.x>0)rig.rotation.x*=1-(1-aimedRise[id])*aim;
  pivot.set(fit.x,fit.y,fit.z).multiply(rig.scale);
  turnedPivot.copy(pivot).applyQuaternion(rig.quaternion);
  const oldHeight=gunFit[id].sight*.91+.009,oldZ=(id==='pistol'?-.35:-.422)+.029;
  rig.position.x+=aim*(-pivot.x+.84*(pivot.x-turnedPivot.x));
  rig.position.y+=aim*(oldHeight-pivot.y+.84*(pivot.y-turnedPivot.y));
  rig.position.z+=aim*(fit.eyeZ-pivot.z-oldZ);
}

// The dot is a small patch of emitted light on the glass. Its size is held
// in CSS pixels across camera FOVs/drawing-buffer scales, with a soft outer
// edge and a brighter core that remains visible against a red or bright wall.
export function makeReflexDot(){
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 vUv;
      void main(){
        float r=length(vUv-.5)*2.0;
        float halo=1.0-smoothstep(.54,1.0,r);
        float edge=1.0-smoothstep(.46,.72,r);
        float bead=1.0-smoothstep(.34,.53,r);
        float core=1.0-smoothstep(.05,.29,r);
        vec3 red=mix(vec3(1.,.007,.012),vec3(1.,.035,.037),core);
        gl_FragColor=vec4(mix(vec3(.13,.001,.003),red,bead),.12*halo+.40*edge+.48*bead);
        #include <colorspace_fragment>
      }`});
  const dot=new T.Mesh(new T.PlaneGeometry(1,1),material);
  dot.name='reflex-reticle';dot.renderOrder=2;dot.visible=false;return dot;
}
const localEye=new T.Vector3(),localRay=new T.Vector3(),hit=new T.Vector3(),scale=new T.Vector3();
export function projectReflexDot(dot,window,engaged,camera,height){
  dot.visible=false;
  if(!engaged||!window)return false;
  if(dot.parent!==window)window.add(dot);
  camera.updateWorldMatrix(true,false);
  camera.getWorldPosition(localEye);camera.getWorldDirection(localRay);
  localRay.add(localEye);window.worldToLocal(localEye);window.worldToLocal(localRay).sub(localEye).normalize();
  if(localRay.z>=-.1)return false;
  const t=-localEye.z/localRay.z;
  if(t<=0)return false;
  hit.copy(localEye).addScaledVector(localRay,t);
  const depth=window.localToWorld(scale.copy(hit)).applyMatrix4(camera.matrixWorldInverse).z;
  const size=-depth*2*Math.tan(camera.fov*Math.PI/360)*7.0/Math.max(1,height)/window.getWorldScale(scale).x;
  if(!insideReflexWindow(hit.x,hit.y,size*.48))return false;
  dot.position.set(hit.x,hit.y,.00015);dot.scale.setScalar(size);dot.visible=true;return true;
}
