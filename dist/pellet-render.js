import * as T from './assets/three.module.min.js';
import { pelletTrails,pelletSpan,visibleTraceEnd,exitsForward,muzzleDeparture,flightSlices,PELLET_LIFE,PELLET_CAPACITY } from './shot-path.js';

// All pellet ribbons and contact glints share one draw call and a fixed buffer.
export class PelletRenderer {
  constructor(scene){
    this.trails=[];
    // Two ribbon sections and one impact quad per pellet, still one draw call.
    const vertices=PELLET_CAPACITY*18;
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
            alpha=pow(max(0.,1.-x),.65)*(.65+.35*smoothstep(0.,.23,y))*(1.-smoothstep(.93,1.,y));
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
    this.right=new T.Vector3();this.up=new T.Vector3();this.end=new T.Vector3();this.cursor=0;
  }
  add(event,own,origin,map,forward){
    const added=pelletTrails(event,own,false,origin);
    for(const trail of added){
      const end={x:trail.ex,y:trail.ey,z:trail.ez};
      const clipped=visibleTraceEnd(origin,end,map);
      trail.showFlight=exitsForward(origin,clipped,forward);
      trail.departure=muzzleDeparture(origin,clipped,forward,map);
      if(clipped===end)continue;
      trail.ex=clipped.x;trail.ey=clipped.y;trail.ez=clipped.z;
      trail.dx=clipped.x-origin.x;trail.dy=clipped.y-origin.y;trail.dz=clipped.z-origin.z;
      trail.length=Math.hypot(trail.dx,trail.dy,trail.dz);trail.target=null;
    }
    this.trails.push(...added);
    if(this.trails.length>PELLET_CAPACITY)this.trails.splice(0,this.trails.length-PELLET_CAPACITY);
    return added;
  }
  step(dt){
    for(const trail of this.trails)trail.age+=dt;
    this.trails=this.trails.filter(trail=>trail.age<PELLET_LIFE);
  }
  clear(){this.trails.length=0;this.mesh.visible=false;this.mesh.geometry.setDrawRange(0,0);}
  quad(a,b,side,width,alpha,contact=false,u0=0,u1=1){
    for(const [end,edge] of [[0,-1],[0,1],[1,1],[0,-1],[1,1],[1,-1]]){
      const point=end?b:a,taper=contact?1:end?1:.48;
      const i=this.cursor++;
      this.position.setXYZ(i,point.x+side.x*width*edge*taper,point.y+side.y*width*edge*taper,point.z+side.z*width*edge*taper);
      this.shape.setXYZW(i,edge,end?u1:u0,alpha,contact?1:0);
    }
  }
  draw(camera,height){
    this.cursor=0;
    const scale=2*Math.tan(camera.fov*Math.PI/360)/height;
    this.right.setFromMatrixColumn(camera.matrixWorld,0);this.up.setFromMatrixColumn(camera.matrixWorld,1);
    for(const trail of this.trails){
      if(trail.length<.04)continue;
      const {tail,head,alpha,contactAlpha}=pelletSpan(trail);
      this.end.set(trail.ex,trail.ey,trail.ez);
      const departure=trail.departure,join=departure?departure.exit/departure.length:0;
      if(trail.showFlight)flightSlices(trail.length,departure,tail,head,(exit,a,b)=>{
        const from=exit||!departure?trail:departure,to=exit?departure:this.end;
        this.a.lerpVectors(from,to,a);this.b.lerpVectors(from,to,b);
        this.view.copy(camera.position).sub(this.a);
        this.side.copy(this.b).sub(this.a).cross(this.view);
        if(this.side.lengthSq()<1e-8)this.side.copy(this.right);else this.side.normalize();
        const width=Math.min(.045,Math.max(.004,this.view.length()*scale*1.20));
        const split=Math.min(1,Math.max(0,(join-tail)/(head-tail)));
        this.quad(this.a,this.b,this.side,width,alpha*(trail.own?.84:.60),false,exit?0:split,exit?split:1);
      });
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
