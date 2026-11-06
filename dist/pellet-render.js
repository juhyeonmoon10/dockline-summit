import * as T from './assets/three.module.min.js';
import { pelletTrails,pelletSpan,PELLET_LIFE,PELLET_CAPACITY } from './shot-path.js';

// All pellet ribbons and contact glints share one draw call and a fixed buffer.
export class PelletRenderer {
  constructor(scene){
    this.trails=[];
    const vertices=PELLET_CAPACITY*12;
    this.position=new T.BufferAttribute(new Float32Array(vertices*3),3).setUsage(T.DynamicDrawUsage);
    this.shape=new T.BufferAttribute(new Float32Array(vertices*4),4).setUsage(T.DynamicDrawUsage);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',this.position);geometry.setAttribute('shape',this.shape);
    geometry.setDrawRange(0,0);
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
      vertexShader:`attribute vec4 shape;varying vec4 ink;
        void main(){ink=shape;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec4 ink;
        void main(){
          float x=abs(ink.x),y=ink.y,alpha,core;
          if(ink.w>.5){
            float v=abs(y*2.-1.);
            alpha=max(exp(-x*x*48.-v*v*5.),exp(-v*v*48.-x*x*5.));
            core=exp(-(x*x+v*v)*15.);
          }else{
            alpha=pow(max(0.,1.-x),.65)*smoothstep(0.,.23,y)*(1.-smoothstep(.93,1.,y));
            core=(1.-smoothstep(.12,.50,x))*(.60+.40*y);
          }
          alpha*=ink.z;if(alpha<.012)discard;
          vec3 color=mix(vec3(.72,.28,.035),vec3(1.,.96,.78),core);
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`
    });
    this.mesh=new T.Mesh(geometry,material);this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.renderOrder=2;scene.add(this.mesh);
    this.a=new T.Vector3();this.b=new T.Vector3();this.side=new T.Vector3();this.view=new T.Vector3();
    this.right=new T.Vector3();this.up=new T.Vector3();this.cursor=0;
  }
  add(event,own,ads){
    const added=pelletTrails(event,own,ads);this.trails.push(...added);
    if(this.trails.length>PELLET_CAPACITY)this.trails.splice(0,this.trails.length-PELLET_CAPACITY);
    return added;
  }
  step(dt){
    for(const trail of this.trails)trail.age+=dt;
    this.trails=this.trails.filter(trail=>trail.age<PELLET_LIFE);
  }
  clear(){this.trails.length=0;this.mesh.visible=false;this.mesh.geometry.setDrawRange(0,0);}
  quad(a,b,side,width,alpha,contact=false){
    for(const [end,edge] of [[0,-1],[0,1],[1,1],[0,-1],[1,1],[1,-1]]){
      const point=end?b:a,taper=contact?1:end?1:.48;
      const i=this.cursor++;
      this.position.setXYZ(i,point.x+side.x*width*edge*taper,point.y+side.y*width*edge*taper,point.z+side.z*width*edge*taper);
      this.shape.setXYZW(i,edge,end,alpha,contact?1:0);
    }
  }
  draw(camera,height,muzzle){
    this.cursor=0;
    const scale=2*Math.tan(camera.fov*Math.PI/360)/height;
    this.right.setFromMatrixColumn(camera.matrixWorld,0);this.up.setFromMatrixColumn(camera.matrixWorld,1);
    for(const trail of this.trails){
      if(trail.own&&!trail.placed&&muzzle){
        this.a.set(trail.ex,trail.ey,trail.ez);
        if(camera.position.distanceTo(this.a)>camera.position.distanceTo(muzzle)+.08){
          trail.x=muzzle.x;trail.y=muzzle.y;trail.z=muzzle.z;
          trail.dx=trail.ex-trail.x;trail.dy=trail.ey-trail.y;trail.dz=trail.ez-trail.z;
          trail.length=Math.hypot(trail.dx,trail.dy,trail.dz);
        }
        trail.placed=true;
      }
      if(trail.length<.04)continue;
      const {tail,head,alpha,contactAlpha}=pelletSpan(trail);
      this.a.set(trail.x+trail.dx*tail,trail.y+trail.dy*tail,trail.z+trail.dz*tail);
      this.b.set(trail.x+trail.dx*head,trail.y+trail.dy*head,trail.z+trail.dz*head);
      this.view.copy(camera.position).sub(this.a);
      this.side.copy(this.b).sub(this.a).cross(this.view);
      if(this.side.lengthSq()<1e-8)this.side.copy(this.right);else this.side.normalize();
      const width=Math.min(.045,Math.max(.004,this.view.length()*scale*1.20));
      this.quad(this.a,this.b,this.side,width,alpha*(trail.own?.84:.60));
      // Contact follows the moving streak and never covers the target with a cloud.
      if(contactAlpha>0&&trail.contact){
        this.a.set(trail.ex,trail.ey,trail.ez);
        const distance=this.a.distanceTo(camera.position),size=Math.min(.095,Math.max(.028,distance*scale*2.2));
        this.view.copy(camera.position).sub(this.a).normalize();
        this.a.addScaledVector(this.view,.018);
        this.b.copy(this.a).addScaledVector(this.up,size);
        this.a.addScaledVector(this.up,-size);
        this.quad(this.a,this.b,this.right,size,contactAlpha*.85,true);
      }
    }
    this.position.needsUpdate=true;this.shape.needsUpdate=true;
    this.mesh.geometry.setDrawRange(0,this.cursor);this.mesh.visible=this.cursor>0;
  }
}
