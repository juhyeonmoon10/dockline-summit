import * as T from './assets/three.module.min.js';
import {Parts} from './arena-parts.js';
import {gunFit} from './gun-fit.js';
import {opticFit,fallbackOpticFit,REFLEX_APERTURE,insideReflexWindow} from './optic-fit.js';

const frameMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.39,side:T.DoubleSide});
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
  const contours=[ring(1,1,.004),ring(1.024,1.04,.0065),ring(1.083,1.09,.0065),
    ring(1.11,1.14,.0035),ring(1.105,1.135,-.012),ring(1.075,1.09,-.015),ring(1,1,-.015)];
  const finishes=['#323636','#242727','#454947','#232627','#292c2d','#373b3b','#141818'];
  for(let layer=0;layer<contours.length;layer++){
    const near=contours[layer],far=contours[(layer+1)%contours.length];
    for(let i=0;i<near.length;i++){
      const j=(i+1)%near.length;
      quad(near[i],far[i],far[j],near[j],finishes[layer]);
    }
  }
  // The housing overhangs a narrower rail shoe. The exposed heel and
  // clamping hardware stay visible when inspecting the gun from behind.
  // Chamfered outlines give the shoe a continuous edge highlight in the inspect pose.
  function footprint(width,front,back,y,cut){
    const w=width/2;
    return [[-w+cut,y,front],[w-cut,y,front],[w,y,front+cut],[w,y,back-cut],
      [w-cut,y,back],[-w+cut,y,back],[-w,y,back-cut],[-w,y,front+cut]];
  }
  const shoe=[footprint(.049,-.030,.042,-.050,.006),footprint(.055,-.033,.044,-.047,.006),
    footprint(.057,-.034,.044,-.042,.005),footprint(.066,-.030,.041,-.039,.006),
    footprint(.066,-.027,.039,-.033,.007),footprint(.060,-.023,.035,-.030,.007)];
  const coating=['#292c2d','#1b2021','#3a3e3c','#24292a','#343838'];
  for(let j=1;j<shoe.length;j++){
    for(let i=0;i<8;i++){
      const k=(i+1)%8;quad(shoe[j-1][k],shoe[j-1][i],shoe[j][i],shoe[j][k],coating[j-1]);
    }
  }
  for(const [layer,hue] of [[shoe[0],'#202426'],[shoe.at(-1),'#262b2c']]){
    const start=parts.points.length/3;color.set(hue);
    const y=layer===shoe[0]?-1:1;
    for(const pt of layer){parts.points.push(...pt);parts.normals.push(0,y,0);parts.colors.push(color.r,color.g,color.b);}
    for(let i=1;i<7;i++)parts.indices.push(start,start+(y>0?i+1:i),start+(y>0?i:i+1));
  }
  for(const side of [-1,1]){
    parts.beam([side*.029,-.032,.031],[side*.039,-.013,.002],.004,.007,'#2c3132');
    parts.six(side*.033,-.038,.015,.009,.003,.009,'#49504d',0,0,Math.PI/2);
    parts.cube(side*.0347,-.038,.015,.0007,.0014,.0058,'#1c2021',.43);
  }
  parts.tube(.039,-.018,-.004,.015,.007,.015,'#343b3b',0,0,Math.PI/2);
  parts.cube(.0427,-.018,-.004,.0007,.0018,.008,'#202526',-.31);
  parts.cube(0,-.029,.027,.012,.002,.007,'#363c3d');
  parts.cube(0,-.0278,.027,.005,.001,.003,'#835c51');
  return parts.mesh(frameMat).geometry;
}

export function placeRedDot(group,fit){
  group.position.set(fit.x,fit.y,fit.z);group.scale.setScalar(fit.scale);
  group.userData.mount=fit;
}
export function redDotMount(id){
  const fit=fallbackOpticFit(id);
  if(!fit)return null;
  if(!hardware){
    hardware=makeHousing();
    const outline=REFLEX_APERTURE.map(([x,y])=>new T.Vector2(x,y));
    glass=new T.ShapeGeometry(new T.Shape(outline));
  }
  const group=new T.Group(),frame=new T.Mesh(hardware,frameMat),window=new T.Mesh(glass,glassMat);
  group.name='reflex-sight';frame.name='reflex-housing';window.name='reflex-window';
  placeRedDot(group,fit);
  window.renderOrder=1;group.add(frame,window);return group;
}

const pivot=new T.Vector3(),turnedPivot=new T.Vector3();
const aimedRise={rifle:.30,burst:.47,marksman:.55,pistol:.32};
// Applied to the existing sway, recoil and equip pose. At full ADS the actual
// aperture is at eyeZ; recoil turns the gun mostly about that contact.
export function seatReflex(rig,id,aim,window){
  const fit=window?.parent?.userData.mount??opticFit(id);
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
