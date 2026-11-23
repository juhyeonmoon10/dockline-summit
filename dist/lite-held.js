import { Group } from './assets/three.module.min.js';
import { createCanvasPreview } from './armory-canvas.js';
import { gunModel,poseHeldKnife,poseHeldSleeves } from './render.js';
import { normalizeKnifeSkin,KNIFE_TIMING } from './knife-types.js';
import { knifeAttackDuration } from './knife-motion.js';
import { inspectionPose,applyInspection } from './view-inspect.js';

// Draw the original articulated meshes onto a transparent layer. The cached
// result can be composited over a moving world even when the hand is still.
export class LiteHeldView {
  constructor() {
    this.canvas=document.createElement('canvas');
    this.preview=createCanvasPreview(this.canvas);
    this.rig=new Group();this.rig.scale.setScalar(.91);
    this.models=new Map();
  }
  draw(ctx,player,now,drawAge,inspectAge,swing) {
    const key=player.active,skin=normalizeKnifeSkin(player.knifeSkin),knife=key==='knife';
    const id=knife?skin:key;
    const age=swing?now-swing.at:Infinity;
    const striking=knife&&age>=0&&age<knifeAttackDuration(skin);
    if(striking)inspectAge=Infinity;
    const inspection=inspectionPose(id,inspectAge);
    if(!knife&&!inspection)return false;
    let model=this.models.get(id);
    if(!model){model=gunModel(key,skin);this.models.set(id,model);}
    const walk=Math.min(1,(player.speed||0)/5.4);
    const still=knife&&!inspection&&drawAge>=KNIFE_TIMING[skin].draw&&!striking&&walk===0;
    const ratio=Math.min(1,435/Math.max(ctx.canvas.width,ctx.canvas.height));
    const w=Math.max(1,Math.round(ctx.canvas.width*ratio)),h=Math.max(1,Math.round(ctx.canvas.height*ratio));
    const resize=this.canvas.width!==w||this.canvas.height!==h;
    if(resize){this.canvas.width=w;this.canvas.height=h;}
    const changed=this.id!==id||this.swing!==swing||this.inspect!==!!inspection||this.still!==still;
    // The world already limits knife frames. Capping the hand separately
    // skips alternating wrist poses on high refresh displays.
    if(resize||changed||(!still&&(knife||now-this.lastDraw>=1/36))){
      this.id=id;this.swing=swing;this.inspect=!!inspection;this.still=still;this.lastDraw=now;
      if(model.parent!==this.rig){this.rig.clear();this.rig.add(model);}
      if(knife)poseHeldKnife(this.rig,model,skin,drawAge,inspectAge,age,swing?.side||1,now*9,walk);
      else{
        this.rig.position.set(key==='sniper'?.223:.188,-.174,key==='pistol'||key==='revolver'?-.35:-.422);
        this.rig.rotation.set(.012,.025,-.032);
      }
      applyInspection(this.rig,inspection);
      poseHeldSleeves(model,key,inspection?.weight,inspection?.freeHand);
      this.preview.render(this.rig,1,63);
    }
    ctx.drawImage(this.canvas,0,0,ctx.canvas.width,ctx.canvas.height);return true;
  }
}
