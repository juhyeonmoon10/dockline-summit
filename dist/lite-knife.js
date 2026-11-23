import {knifeAttackDuration,knifeDrawPose,knifePose,knifeWristPose} from './knife-motion.js';
import {inspectionPose,ringFlourish} from './view-inspect.js';
import {knifeAngles} from './knife-art.js';
import {KARAMBIT_RING,KNIFE_TIMING} from './knife-types.js';

// A flat, hinged silhouette for the first equip while the articulated meshes load.
function rotation(rx,ry,rz){
  const a=Math.cos(rx),b=Math.sin(rx),c=Math.cos(ry),d=Math.sin(ry),e=Math.cos(rz),f=Math.sin(rz);
  return (x,y,z)=>[c*e*x-c*f*y+d*z,(a*f+b*d*e)*x+(a*e-b*d*f)*y-b*c*z,
    (b*f-a*d*e)*x+(b*e+a*d*f)*y+a*c*z];
}
export function drawLiteKnife(ctx,player,now,drawAge,inspectAge,swing){
  const skin=player.knifeSkin,flip=skin==='balisong',age=swing?now-swing.at:Infinity;
  const striking=age>=0&&age<knifeAttackDuration(skin);
  if(striking)inspectAge=Infinity;
  if(striking||Number.isFinite(inspectAge))drawAge=Infinity;
  const draw=knifeDrawPose(skin,drawAge),slash=knifePose(age,swing?.side,skin);
  const wrist=knifeWristPose(skin,draw,slash,now*9,Math.min(1,(player.speed||0)/5.4));
  const inspect=inspectionPose(skin,inspectAge);
  if(inspect)for(const k of ['x','y','z','rx','ry','rz'])wrist[k]+=(inspect[k]-wrist[k])*inspect.weight;
  const angles=knifeAngles(skin,drawAge,inspectAge),loose=ringFlourish(inspectAge),hinge=Math.min(1,Math.abs(angles.handle)/2.5);
  const reveal=Number.isFinite(inspectAge)?Math.min(1,inspectAge/.15,(KNIFE_TIMING.karambit.inspect-inspectAge)/.20):0;
  const bladeRotation=flip?rotation(-.025,.035+hinge*.05,.060*hinge):rotation(.86-Math.max(0,reveal)*.79,.19,-2.10+(loose?.turn??draw.turn));
  const handRotation=rotation(wrist.rx,wrist.ry,wrist.rz),grip=flip?[-.015,-.075]:KARAMBIT_RING;
  const palm=flip?[.014,-.072,.004]:[-.027,-.002,.072],modelScale=flip?.76:.66;
  const {width,height}=ctx.canvas,focal=height*.5/Math.tan(63*Math.PI/360);
  function point(x,y){
    const v=bladeRotation((x-grip[0])*modelScale,(y-grip[1])*modelScale,0);
    const [dx,dy,dz]=handRotation((palm[0]+v[0])*.91,(palm[1]+v[1])*.91,(palm[2]+v[2])*.91);
    const scale=focal/Math.max(.04,-wrist.z-dz);
    return [width*.5+(wrist.x+dx)*scale,height*.5-(wrist.y+dy)*scale];
  }
  const anchor=point(...grip),unit=.045,d=height*.028/(-wrist.z);
  ctx.save();
  // The right cuff stays attached to the shoulder while the knife turns at the wrist.
  const dx=width*.5+height-anchor[0],dy=1.48*height-anchor[1],armAngle=Math.atan2(dy,dx),armLength=Math.hypot(dx,dy);
  ctx.save();ctx.translate(...anchor);ctx.rotate(armAngle);
  ctx.fillStyle='#424c46';ctx.beginPath();ctx.moveTo(d,-.64*d);ctx.lineTo(armLength,-armLength*.23);
  ctx.lineTo(armLength,armLength*.20);ctx.lineTo(d,.67*d);ctx.closePath();ctx.fill();
  ctx.fillStyle='#59625a';ctx.beginPath();ctx.moveTo(d*1.35,-.59*d);ctx.lineTo(armLength,-armLength*.21);
  ctx.lineTo(armLength,-armLength*.13);ctx.closePath();ctx.fill();
  ctx.fillStyle='#29342e';ctx.fillRect(d*.80,-.70*d,d*.74,d*1.40);ctx.restore();
  const base=point(0,0),px=point(unit,0),py=point(0,unit);
  ctx.save();ctx.transform((px[0]-base[0])/unit,(px[1]-base[1])/unit,(py[0]-base[0])/unit,(py[1]-base[1])/unit,...base);
  ctx.lineWidth=.009;ctx.lineJoin='round';ctx.strokeStyle='#455563';ctx.fillStyle='#c5d2d5';
  if(flip){
    ctx.translate(.022,.062);ctx.fillStyle='#545c5d';ctx.fillRect(-.017,-.29,.034,.30);
    ctx.save();ctx.rotate(angles.blade);ctx.fillStyle='#c5d2d5';ctx.beginPath();
    ctx.moveTo(-.041,0);ctx.quadraticCurveTo(-.018,.14,-.032,.294);ctx.quadraticCurveTo(.065,.20,.011,0);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.translate(-.045,0);ctx.rotate(angles.handle-angles.blade);
    ctx.fillStyle='#536167';ctx.fillRect(-.015,-.29,.030,.30);ctx.fillStyle='#d69454';ctx.fillRect(-.014,-.17,.028,.023);ctx.restore();
  }else{
    ctx.fillStyle='#394448';ctx.fillRect(-.033,-.19,.069,.24);ctx.fillStyle='#c5d2d5';ctx.beginPath();
    ctx.moveTo(.04,.036);ctx.bezierCurveTo(.051,.19,-.175,.36,-.283,.106);
    ctx.quadraticCurveTo(-.145,.292,-.04,.032);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.lineWidth=.012;ctx.strokeStyle='#8bb9a8';ctx.beginPath();ctx.arc(grip[0],grip[1],.033,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
  ctx.translate(...anchor);ctx.rotate(armAngle);
  ctx.fillStyle='#37413a';ctx.beginPath();ctx.ellipse(.40*d,0,d,.71*d,0,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#4d584e';
  for(let i=0;i<3;i++){
    ctx.beginPath();ctx.ellipse((-.20+i*.29)*d,-.31*d,.20*d,.32*d,-.38,0,2*Math.PI);ctx.fill();
  }
  ctx.restore();
}
