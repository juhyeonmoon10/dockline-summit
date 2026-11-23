import * as T from './assets/three.module.min.js';
import { classifyImpact,ImpactParticlePool,SURFACE_FX } from './surface-fx.js';

const materialId={concrete:0,metal:1,wood:2,target:3,glass:4,fabric:5};
const tint=new T.Color(),axis=new T.Vector3(0,0,1),normal=new T.Vector3();
const dynamic=(count,size)=>new T.InstancedBufferAttribute(new Float32Array(count*size),size).setUsage(T.DynamicDrawUsage);

// A decal's local XY plane follows the actual contact face. All materials use
// one instanced draw: compact pits in masonry, bright divots in metal, torn wood.
class ImpactMarks {
  constructor(scene,capacity=128){
    this.time=new Float32Array(capacity);this.cursor=0;this.stamp=new T.Object3D();
    const geo=new T.PlaneGeometry(.172,.172);
    this.ink=dynamic(capacity,4);this.fade=dynamic(capacity,1);
    geo.setAttribute('scarInk',this.ink);geo.setAttribute('scarFade',this.fade);
    const material=new T.ShaderMaterial({
      transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      vertexShader:`attribute vec4 scarInk; attribute float scarFade;
        varying vec4 ink; varying vec2 p; varying float fade;
        void main(){ink=scarInk;p=uv*2.-1.;fade=scarFade;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec4 ink; varying vec2 p; varying float fade;
        void main(){
          float a=atan(p.y,p.x),r=length(p);
          float grain=sin(a*5.+.65)*.056+cos(a*8.-.19)*.045+sin(a*13.+.4)*.020;
          float rim=ink.a<.5?.70:ink.a<1.5?.55:.53;
          float edge=r+grain+(ink.a>1.5?.095*sin(p.y*13.+p.x*3.):0.);
          float alpha=(1.-smoothstep(rim-.075,rim+.08,edge))*fade;
          if(alpha<.012)discard;
          float lip=smoothstep(rim*.49,rim*.71,edge)*(1.-smoothstep(rim*.79,rim,edge));
          float light=.60+.40*(p.y-p.x);
          vec3 color=ink.rgb*(.57+.34*smoothstep(.08,rim,edge));
          color+=lip*light*(ink.a>.5&&ink.a<1.5?vec3(.27,.28,.27):vec3(.11,.087,.061));
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`
    });
    this.mesh=new T.InstancedMesh(geo,material,capacity);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.renderOrder=1;scene.add(this.mesh);
  }
  add(contact,late) {
    if(!contact.hit.markable)return;
    const {ex,ey,ez,weapon,seed,hit}=contact;
    const life=(weapon==='shotgun'?3.5:8)-late;if(life<=0)return;
    const i=this.cursor++%this.time.length,o=this.stamp;
    normal.set(hit.nx,hit.ny,hit.nz);
    o.position.set(ex,ey,ez).addScaledVector(normal,.004);
    o.quaternion.setFromUnitVectors(axis,normal);o.rotateZ(seed*2.39996);
    const size=weapon==='shotgun'?.44:weapon==='sniper'?1.23:weapon==='pistol'?.78:1;
    o.scale.set(size*(hit.kind==='wood'?.57:.96),size,1);o.updateMatrix();
    this.mesh.setMatrixAt(i,o.matrix);this.mesh.instanceMatrix.needsUpdate=true;
    tint.setHex(SURFACE_FX[hit.kind].mark);
    this.ink.setXYZW(i,tint.r,tint.g,tint.b,materialId[hit.kind]);this.ink.needsUpdate=true;
    this.time[i]=life;this.fade.setX(i,Math.min(.90,life*1.4));this.fade.needsUpdate=true;this.mesh.visible=true;
  }
  step(dt){
    if(!this.mesh.visible)return;
    let live=false,changed=false;
    for(let i=0;i<this.time.length;i++)if(this.time[i]>0){
      const t=this.time[i]=Math.max(0,this.time[i]-dt),alpha=Math.min(.90,t*1.4);
      live||=t>0;
      if(Math.abs(this.fade.array[i]-alpha)>.001||!t){this.fade.setX(i,alpha);changed=true;}
    }
    if(changed)this.fade.needsUpdate=true;this.mesh.visible=live;
  }
  clear(){this.time.fill(0);this.fade.array.fill(0);this.fade.needsUpdate=true;this.mesh.visible=false;}
}

// One world-space depth-tested batch for the whole arena. Metal glints follow
// their projected velocity; broad dust, angular splinters and target flecks
// have independent silhouettes in the fragment shader.
class ImpactSprites {
  constructor(scene,capacity=160){
    this.pool=new ImpactParticlePool(capacity);
    const g=new T.InstancedBufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));g.setIndex([0,1,2,0,2,3]);
    this.origin=dynamic(capacity,3);this.speed=dynamic(capacity,3);this.ink=dynamic(capacity,4);this.shape=dynamic(capacity,4);
    g.setAttribute('origin',this.origin);g.setAttribute('velocity',this.speed);g.setAttribute('ink',this.ink);g.setAttribute('shape',this.shape);
    const m=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
      vertexShader:`attribute vec3 origin,velocity;attribute vec4 ink,shape;
        varying vec4 color;varying vec2 p;varying float kind;varying float spin;
        void main(){
          vec4 at=modelViewMatrix*vec4(origin,1.);p=position.xy;color=ink;kind=shape.y;spin=shape.w;
          vec2 motion=(mat3(modelViewMatrix)*velocity).xy;
          vec2 major=length(motion)>.0001?normalize(motion):vec2(1.,0.);
          if(kind<.5||kind>4.5)major=vec2(cos(spin),sin(spin));
          else if((kind>1.5&&kind<2.5)||(kind>3.5&&kind<4.5)){
            float c=cos(spin),s=sin(spin);major=mat2(c,s,-s,c)*major;
          }
          vec2 minor=vec2(-major.y,major.x);
          float width=shape.x,along=width;
          if(kind>.5&&kind<1.5){along=width*2.6;width*=.33;}
          else if(kind>1.5&&kind<2.5){along=width*1.35;width*=.48;}
          else if(kind<.5||kind>4.5)width*=.87;
          at.xy+=major*p.x*along+minor*p.y*width;
          gl_Position=projectionMatrix*at;
        }`,
      fragmentShader:`varying vec4 color;varying vec2 p;varying float kind;varying float spin;
        void main(){
          float alpha=color.a;vec3 ink=color.rgb;
          if(kind<.5||kind>4.5){float r=length(p)+.05*sin(p.x*9.+spin)*cos(p.y*6.);alpha*=.73*(1.-smoothstep(.15,1.,r));}
          else if(kind<1.5){alpha*=(1.-smoothstep(.33,.96,abs(p.y)))*(1.-smoothstep(.61,1.,abs(p.x)));ink+=vec3(.18,.13,.04)*(1.-abs(p.y));}
          else if(kind<2.5){alpha*=1.-smoothstep(.66,1.,abs(p.y)+.41*abs(p.x));ink*=.81+.18*step(.03,p.y);}
          else if(kind>3.5){alpha*=1.-smoothstep(.61,1.,abs(p.x)+abs(p.y)*.73);ink*=.78+.30*step(p.y,p.x*.3);}
          else{alpha*=1.-smoothstep(.27,1.,abs(p.x)+abs(p.y));}
          if(alpha<.015)discard;gl_FragColor=vec4(ink,alpha);
          #include <colorspace_fragment>
        }`
    });
    this.mesh=new T.Mesh(g,m);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.mesh.visible=false;scene.add(this.mesh);
  }
  draw(){
    let count=0;
    for(const particle of this.pool.particles){
      if(!particle.active)continue;
      const p=particle,i=count++;
      this.origin.setXYZ(i,p.x,p.y,p.z);this.speed.setXYZ(i,p.vx,p.vy,p.vz);
      tint.setHex(p.color);this.ink.setXYZW(i,tint.r,tint.g,tint.b,p.alpha);
      this.shape.setXYZW(i,p.size*.5,materialId[p.kind],p.age/p.life,p.angle);
    }
    this.mesh.geometry.instanceCount=count;this.mesh.visible=count>0;
    if(count)for(const attr of [this.origin,this.speed,this.ink,this.shape])attr.needsUpdate=true;
  }
}

export class WorldImpacts {
  constructor(scene,onTarget){
    this.onTarget=onTarget;this.clock=0;this.pending=[];
    this.marks=new ImpactMarks(scene);this.sprites=new ImpactSprites(scene);
  }
  schedule(map,start,end,weapon,seed,delay){
    normal.set(end.ex-start.x,end.ey-start.y,end.ez-start.z).normalize();
    const hit=classifyImpact(map,end,normal);
    if(!hit)return;
    this.pending.push({ex:end.ex,ey:end.ey,ez:end.ez,target:end.target,hit,weapon,seed,at:this.clock+delay});
  }
  step(dt){
    this.clock+=dt;this.marks.step(dt);this.sprites.pool.step(dt);
  }
  draw(){
    let keep=0;
    for(const p of this.pending){
      const late=this.clock-p.at;
      if(late<0){this.pending[keep++]=p;continue;}
      this.marks.add(p,late);
      if(late<=SURFACE_FX[p.hit.kind].life){
        this.sprites.pool.emit(p,p.hit,p.seed,p.weapon==='shotgun'?2:Infinity);
        if(p.hit.kind==='target')this.onTarget(p.target);
      }
    }
    this.pending.length=keep;this.sprites.draw();
  }
  clear(){
    this.clock=0;this.pending.length=0;
    if(this.marks.mesh.visible)this.marks.clear();
    if(this.sprites.mesh.visible){this.sprites.pool.clear();this.sprites.mesh.visible=false;}
  }
}
