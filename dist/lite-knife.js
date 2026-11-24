import {karambitGripRotation,knifeAttackDuration,knifeDrawPose,knifePose,knifeWristPose} from './knife-motion.js';
import {inspectionPose,ringFlourish} from './view-inspect.js';
import {karambitBladeSections,karambitGripSections,karambitRingRadii,knifeAngles} from './knife-art.js';
import {KARAMBIT_RING} from './knife-types.js';

// A flat, hinged silhouette for the first equip while the articulated meshes load.
function rotation(rx,ry,rz){
  const a=Math.cos(rx),b=Math.sin(rx),c=Math.cos(ry),d=Math.sin(ry),e=Math.cos(rz),f=Math.sin(rz);
  return (x,y,z)=>[c*e*x-c*f*y+d*z,(a*f+b*d*e)*x+(a*e-b*d*f)*y-b*c*z,
    (b*f-a*d*e)*x+(b*e+a*d*f)*y+a*c*z];
}

// Keep the software silhouette tied to the same spine, edge and scallops as the armory mesh.
// Every face is convex so the remote operator can feed it straight to its depth buffer.
function karambitFaces(detailed){
  const faces=[],add=(points,color)=>faces.push({points,color,css:'#'+color.toString(16).padStart(6,'0')});
  const point=(s,t)=>[s[0]+(s[2]-s[0])*t,s[1]+(s[3]-s[1])*t];
  const steel=[0xb4b3b0,0xd1cfcb,0xf3f2ed,0xc7c6c2];
  const bevels=s=>[0,s[5],s[6],.84,1];
  const blade=detailed?karambitBladeSections:karambitBladeSections.filter((s,i,rows)=>i%2===0||i===rows.length-1);
  for(let i=1;i<blade.length;i++){
    const a=blade[i-1],b=blade[i];
    const start=bevels(a),end=bevels(b);
    for(let j=0;j<steel.length;j++){
      add([point(a,start[j]),point(b,end[j]),point(b,end[j+1]),point(a,start[j+1])],steel[j]);
    }
  }
  const [cx,cy]=KARAMBIT_RING;
  const segments=detailed?32:16;
  const rings=Array.from({length:segments},(_,i)=>{
    const angle=i*2*Math.PI/segments,[outer,inner]=karambitRingRadii(angle);
    const radial=r=>[cx+r*Math.cos(angle),cy+r*Math.sin(angle)];
    return [radial(outer),radial(inner+(outer-inner)*.23),radial(inner)];
  });
  for(let i=0;i<rings.length;i++){
    const a=rings[i],b=rings[(i+1)%rings.length];
    const lit=i<segments/3||i>segments*.82;
    add([a[0],b[0],b[1],a[1]],lit?0xe6e4de:0xc5c3be);
    add([a[1],b[1],b[2],a[2]],lit?0x898885:0xf3f2ec);
  }
  // Keep the three finger-groove peaks on distant operators. Shallow ridges
  // are smaller than a screen pixel at that scale.
  const grip=detailed?karambitGripSections:karambitGripSections.filter(([y,l],i,rows)=>
    i%4===0||i===rows.length-1||(i>0&&l<rows[i-1][1]&&l<=rows[i+1][1]));
  for(let i=1;i<grip.length;i++){
    const [y,l,r]=grip[i-1],[Y,L,R]=grip[i];
    if(detailed){
      const shoulder=l+(r-l)*.39,nextShoulder=L+(R-L)*.39;
      add([[l,y],[shoulder,y],[nextShoulder,Y],[L,Y]],0x363430);
      add([[shoulder,y],[r,y],[R,Y],[nextShoulder,Y]],0x211f1c);
    }else add([[l,y],[r,y],[R,Y],[L,Y]],0x211f1c);
  }
  return faces;
}
const flatKarambit=karambitFaces(true);
const carriedRotation=rotation(.24,-.24,-1.92);
const carriedFaces=karambitFaces(false).map(({points,color})=>({
  points:points.map(([x,y])=>carriedRotation(x-KARAMBIT_RING[0],y-KARAMBIT_RING[1],0)),color
}));

export function drawCarriedKarambit(swing,addFace){
  const wrist=rotation(0,swing.ry,swing.rz+.2);
  for(const {points,color} of carriedFaces){
    addFace(points.map(([x,y,z])=>wrist(x-.018,y-.055,z)),color);
  }
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
  const release=loose?.grip??draw.grip;
  const hookFrame=turn=>{
    const {rx,ry,rz}=karambitGripRotation(turn,release);
    return rotation(rx,ry,rz);
  };
  const bladeRotation=flip?rotation(-.025,.035+hinge*.05,.060*hinge):hookFrame(loose?.turn??draw.turn);
  const handRotation=rotation(wrist.rx,wrist.ry,wrist.rz),grip=flip?[-.015,-.075]:KARAMBIT_RING;
  // Ring centre on the index at the two endpoints of the articulated glove's regrip.
  const palm=flip?[.014,-.072,.004]:[-.02665-.00980*release,-.00210+.01507*release,.07163-.00569*release];
  const modelScale=flip?.76:.66;
  const {width,height}=ctx.canvas,focal=height*.5/Math.tan(63*Math.PI/360);
  function point(x,y,orientation=bladeRotation){
    const v=orientation((x-grip[0])*modelScale,(y-grip[1])*modelScale,0);
    const [dx,dy,dz]=handRotation((palm[0]+v[0])*.91,(palm[1]+v[1])*.91,(palm[2]+v[2])*.91);
    const scale=focal/Math.max(.04,-wrist.z-dz);
    return [width*.5+(wrist.x+dx)*scale,height*.5-(wrist.y+dy)*scale];
  }
  const unit=.045,d=height*.028/(-wrist.z);
  const anchor=flip?point(...grip):point(.025,-.123,hookFrame(0));
  ctx.save();
  // The right cuff stays attached to the shoulder while the knife turns at the wrist.
  const dx=width*.5+height-anchor[0],dy=1.48*height-anchor[1],armAngle=Math.atan2(dy,dx),armLength=Math.hypot(dx,dy);
  ctx.save();ctx.translate(...anchor);ctx.rotate(armAngle);
  ctx.fillStyle='#424c46';ctx.beginPath();ctx.moveTo(d,-.64*d);ctx.lineTo(armLength,-armLength*.23);
  ctx.lineTo(armLength,armLength*.20);ctx.lineTo(d,.67*d);ctx.closePath();ctx.fill();
  ctx.fillStyle='#59625a';ctx.beginPath();ctx.moveTo(d*1.35,-.59*d);ctx.lineTo(armLength,-armLength*.21);
  ctx.lineTo(armLength,-armLength*.13);ctx.closePath();ctx.fill();
  ctx.fillStyle='#29342e';ctx.fillRect(d*.80,-.70*d,d*.74,d*1.40);ctx.restore();
  if(flip){
    const base=point(0,0),px=point(unit,0),py=point(0,unit);
    ctx.save();ctx.transform((px[0]-base[0])/unit,(px[1]-base[1])/unit,(py[0]-base[0])/unit,(py[1]-base[1])/unit,...base);
    ctx.lineWidth=.009;ctx.lineJoin='round';ctx.strokeStyle='#455563';
    ctx.translate(.022,.062);ctx.fillStyle='#545c5d';ctx.fillRect(-.017,-.29,.034,.30);
    ctx.save();ctx.rotate(angles.blade);ctx.fillStyle='#c5d2d5';ctx.beginPath();
    ctx.moveTo(-.041,0);ctx.quadraticCurveTo(-.018,.14,-.032,.294);ctx.quadraticCurveTo(.065,.20,.011,0);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.translate(-.045,0);ctx.rotate(angles.handle-angles.blade);
    ctx.fillStyle='#536167';ctx.fillRect(-.015,-.29,.030,.30);ctx.fillStyle='#d69454';ctx.fillRect(-.014,-.17,.028,.023);ctx.restore();ctx.restore();
  }else{
    // Project each corner, including the tip at full extension. The affine canvas
    // transform used for the butterfly hinges only approximates the wrist plane.
    ctx.lineJoin='round';ctx.lineWidth=.55;
    for(const {points,css} of flatKarambit){
      ctx.fillStyle=css;ctx.strokeStyle=css;ctx.beginPath();ctx.moveTo(...point(...points[0]));
      for(let i=1;i<points.length;i++)ctx.lineTo(...point(...points[i]));
      ctx.closePath();ctx.fill();ctx.stroke();
    }
    // The glove holds the middle of the handle; only the blade spins about the index.
    const ring=point(grip[0],grip[1]),gx=anchor[0]-ring[0],gy=anchor[1]-ring[1];
    const span=Math.max(.85*d,Math.hypot(gx,gy));
    ctx.translate(...anchor);ctx.rotate(Math.atan2(gy,gx));
    ctx.fillStyle='#303b35';ctx.beginPath();ctx.ellipse(0,.12*d,span*.85,.75*d,0,0,2*Math.PI);ctx.fill();
    for(let i=0;i<4;i++){
      ctx.fillStyle=i===0?'#586357':'#48554b';ctx.beginPath();
      ctx.ellipse(span*(-.70+i*.42),-.24*d,span*.23,d*(.50-i*.03),-.21,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();return;
  }
  ctx.translate(...anchor);ctx.rotate(armAngle);
  ctx.fillStyle='#37413a';ctx.beginPath();ctx.ellipse(.40*d,0,d,.71*d,0,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#4d584e';
  for(let i=0;i<3;i++){
    ctx.beginPath();ctx.ellipse((-.20+i*.29)*d,-.31*d,.20*d,.32*d,-.38,0,2*Math.PI);ctx.fill();
  }
  ctx.restore();
}
