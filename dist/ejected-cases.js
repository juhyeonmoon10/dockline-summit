import * as T from './assets/three.module.min.js';
import { SHOT_MECHANIC } from './weapon-view.js';

// Camera-space sockets authored for the fictional first-person models.
const sockets={
  rifle:[.055,.050,-.22],smg:[.050,.030,-.18],burst:[.052,.045,-.21],
  marksman:[.047,.040,-.27],lmg:[.084,.054,-.20],pistol:[.035,.041,-.084],
  shotgun:[.041,.031,-.32],sniper:[.046,.045,-.30]
};
const fullLife=.58;
export class EjectedCases {
  constructor(scene){
    const casing=new T.CylinderGeometry(.008,.009,.034,10);
    const shell=new T.CylinderGeometry(.012,.013,.049,12);
    const brass=new T.MeshStandardMaterial({color:0xdfb362,roughness:.29,metalness:.55});
    const lacquer=new T.MeshStandardMaterial({color:0xb9523f,roughness:.48,metalness:.13});
    this.pool=Array.from({length:18},()=>{
      const mesh=new T.Mesh(casing,brass);mesh.visible=false;scene.add(mesh);
      return {mesh,velocity:new T.Vector3(),life:0,spin:0};
    });
    this.forms={casing,shell,brass,lacquer};this.next=0;this.pending=[];
  }
  clear(){
    this.pending.length=0;
    for(const part of this.pool){part.life=0;part.mesh.visible=false;}
  }
  queue(event,now){
    const id=event.weapon;
    if(sockets[id])this.pending.push({id,seq:event.seq,at:now+(SHOT_MECHANIC[id]?.open??0)});
  }
  frame(weapon,model,camera,lens,now,dt){
    for(const p of this.pool){
      if(p.life<=0)continue;
      p.life-=dt;p.mesh.visible=p.life>0;
      p.mesh.position.addScaledVector(p.velocity,dt);p.velocity.y-=6.1*dt;
      p.mesh.rotation.z+=p.spin*dt;p.mesh.rotation.x+=11*dt;
    }
    for(let i=this.pending.length-1;i>=0;i--){
      const event=this.pending[i];
      if(event.id!==weapon||now-event.at>.16){this.pending.splice(i,1);continue;}
      if(now<event.at)continue;
      this.pending.splice(i,1);
      const p=this.pool[this.next++%this.pool.length],m=p.mesh;
      const shell=weapon==='shotgun',short=weapon==='pistol'||weapon==='smg';
      m.geometry=shell?this.forms.shell:this.forms.casing;m.material=shell?this.forms.lacquer:this.forms.brass;
      m.scale.set(1,short?.63:1,1);
      model.localToWorld(m.position.fromArray(sockets[weapon]));
      m.position.x*=lens;m.position.y*=lens;m.position.applyMatrix4(camera.matrixWorld);
      const variation=Math.sin(event.seq*1.74);
      p.velocity.set(1.35+.28*variation,1.02-.21*variation,.26).applyQuaternion(camera.quaternion);
      m.rotation.set(.42,.72,variation);p.spin=13+5*variation;
      p.life=fullLife;m.visible=true;
    }
  }
}
