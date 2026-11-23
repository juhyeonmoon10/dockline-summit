import * as T from './assets/three.module.min.js';
import { blasterMesh, gunFit, sniperContacts } from './blaster.js';
import {ironTips} from './gun-fit.js';
import { reflexEngaged } from './optic-fit.js';
import { makeReflexDot,projectReflexDot,seatReflex } from './red-dot.js';
import { PRIMARY_WEAPONS,SECONDARY_WEAPONS,isSecondaryWeapon } from './balance.js';
import {revolverAction,revolverLoader,poseRevolver} from './revolver.js';
import {REVOLVER_RELOAD_CONTACT} from './revolver-timing.js';
import { eyeHeight, WEAPONS } from './sim.js';
import { approachAim, cameraAim, gunPresentation, canAim, weaponFov, reloadPose, shotKickResponse, shoulderedKick, shotCycle, shotFlashDuration, LOCAL_IGNITION_LIFE, scopeAfterShot, sniperScopeVisible, emptySniperBolt, emptySniperGrasp, RELOAD_CONTACT } from './weapon-view.js';
import { makeYard, sky, Parts, glowMaterial } from './yard-art.js';
import { dummyBody, dummyStand } from './range-dummy.js';
import { PelletRenderer } from './pellet-render.js';
import { clipBarrelOrigin,visibleTraceEnd,exitsForward,muzzleDeparture,flightSlices,singleShotSpan,pelletSpan,SHOT_TRAIL_LIFE } from './shot-path.js';
import { WorldImpacts } from './world-impacts.js';
import { knifeMesh,knifeFit,knifePose,animateKnife,animateCarriedKnife } from './knife.js';
import { normalizeKnifeSkin,KNIFE_TIMING,KARAMBIT_RING } from './knife-types.js';
import { knifeDrawPose,knifeAttackDuration,knifeWristPose } from './knife-motion.js';
import { inspectionPose,applyInspection,ringFlourish } from './view-inspect.js';
import { studioReflection } from './weapon-light.js';
import { EjectedCases } from './ejected-cases.js';
import { articulatedGlove,flexGlove } from './view-hands.js';
import { loadOperators,operatorAvailable,createOperator,updateOperator,disposeOperator,heldMuzzleWorld } from './operator.js';

const PI=Math.PI;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const damp=(from,to,rate,dt)=>from+(to-from)*(1-Math.exp(-rate*dt));
const weaponNames=[...PRIMARY_WEAPONS,...SECONDARY_WEAPONS,'knife'];
const pose=new T.Vector3(),direction=new T.Vector3(),endpoint=new T.Vector3();
const forwardAxis=new T.Vector3(0,0,-1),beamStart=new T.Vector3(),beamEnd=new T.Vector3();
const knifeShoulder=new T.Vector3(.405,-.354,-.135);
const reverseRightFrame=new T.Quaternion().setFromEuler(new T.Euler(1.90,1.02,2.06));
const vertical=new T.Vector3(0,1,0);
const teamColors=['#168bc9','#ed7040'];
const teamLights=[0x66dcff,0xff975e];
const tracerColors={pistol:0xffdbab,revolver:0xffddb5,smg:0xffcc8e,rifle:0xffe2a9,burst:0xffe4b5,lmg:0xffca85,marksman:0xffeecf,sniper:0xfff5e3};

// Grip points lie on the near face of the actual detachable mesh in its bind pose.
// Apex and feed are fractions of the reload; release and seating are the shared Foley contacts.
const palmPad=new T.Vector3(-.008,-.070,.010);
const ironPoint=new T.Vector3();
export function shoulderIron(rig,key,aim){
  const tip=ironTips[key];
  if(!tip||aim<=0)return;
  // Most of the movement stays in the wrists and receiver. Keep a small
  // visual lift at the front sight and a sliver of daylight over the blade.
  const weight=.90*aim**3;
  ironPoint.fromArray(tip).multiply(rig.scale).applyQuaternion(rig.quaternion).add(rig.position);
  rig.position.x-=weight*ironPoint.x;
  rig.position.y-=weight*(ironPoint.y+.00055);
}
const magazineHandling={
  rifle:   {grip:[-.0226,-.1740,-.2483],  apex:.405,feed:.51,drop:.190,side:-.072,back:.055,pitch:-.22,turn:.28,wrist:.39,roll:.39,center:.042},
  smg:     {grip:[-.0335,-.1241,-.15647], apex:.354,feed:.49,drop:.142,side:-.058,back:.031,pitch:.12,turn:.20,wrist:.32,roll:.27,center:.013},
  burst:   {grip:[-.0252,-.1713,-.21214], apex:.389,feed:.50,drop:.170,side:-.066,back:.049,pitch:-.11,turn:.33,wrist:.45,roll:.35,center:.026},
  marksman:{grip:[-.0246,-.1771,-.25707], apex:.430,feed:.53,drop:.154,side:-.082,back:.041,pitch:.25,turn:.38,wrist:.50,roll:.47,center:-.008},
  lmg:     {grip:[-.1245,-.14219,-.17672],apex:.454,feed:.55,drop:.116,side:-.123,back:.092,pitch:.30,turn:.54,wrist:.70,roll:.55,center:-.025},
  pistol:  {grip:[-.0203,-.11646,.00752],  apex:.352,feed:.52,drop:.156,side:-.026,back:.023,pitch:-.07,turn:.13,wrist:.53,roll:.51,center:-.068},
  sniper:  {drop:.15, side:-.083, turn:.20, roll:.39, center:.042},
};

// Sleeves, articulated gloves and suits use a handful of baked vertex-colour meshes.
const orb=new T.SphereGeometry(.5,12,8);

function pod(parts,x,y,z,w,h,d,color,rx=0,ry=0,rz=0) {
  parts.piece(orb,x,y,z,w,h,d,color,rx,ry,rz);
}
function limb(parts,a,b,from,to,hue) {
  const start=new T.Vector3(...a), finish=new T.Vector3(...b),axis=finish.clone().sub(start);
  const geo=new T.CylinderGeometry(to,from,axis.length(),10);
  const matrix=new T.Matrix4().compose(start.lerp(finish,.5),
    new T.Quaternion().setFromUnitVectors(vertical,axis.normalize()),new T.Vector3(1,1,1));
  parts.append(geo,matrix,hue);geo.dispose();
}
function glove(support,fit) {
  const group=new T.Group(),hand=articulatedGlove(support);
  const side=support?-1:1,center=support?fit.support:0,grip=support?-.066:fit.grip;
  hand.position.set(0,grip+.067,center);
  if(support)hand.rotation.set(.14,.08,.12);
  flexGlove(hand,support?.13:0);group.add(hand);
  hand.updateMatrix();
  const wrist=hand.userData.wrist.clone().applyMatrix4(hand.matrix);
  const restElbow=new T.Vector3(side*(support?.188:.235),-.258,center+(support?.50:.36));
  group.userData={restElbow,wrist,hand,elbow:new T.Vector3(),sleeve:hand.userData.sleeve};
  return group;
}
// The origin of each glove is a point on the surface it holds. Wrist and
// sleeve are separate so reaching for the magazine never translates an elbow.
function sniperGlove(front) {
  const parts=new Parts(),hand=new T.Group(),side=front ? -1 : 1;
  const cloth='#383d39',pads='#4a5048',seam='#282e2c';
  pod(parts,side*.016,.001,.009,.049,.066,.098,cloth,-.17,0,side*.17);
  pod(parts,side*.034,.005,.017,.018,.049,.064,pads,-.20,0,side*.14);
  if(front){
    // Four fingers curl under the fore-end. The thumb rests on the near face.
    for(let i=0;i<4;i++){
      const z=-.031+i*.021,short=i===3 ? .008 : 0;
      pod(parts,-.010,-.015,z,.032,.035,.021,cloth,0,0,.42);
      pod(parts,.014,-.017,z,.053-short,.021,.022,pads,0,0,.08);
      pod(parts,.047-short,-.011,z,.026,.019,.020,cloth,0,0,.4);
    }
    pod(parts,-.013,.024,.010,.031,.039,.060,pads,-.50,-.12,.12);
    pod(parts,-.004,.035,-.015,.021,.030,.048,cloth,-.28,-.15,.14);
  }else{
    // The rear glove wraps the upright grip, with a raised thumb and a
    // separated top finger so its silhouette remains readable at the bolt.
    for(let i=0;i<4;i++){
      const y=.022-i*.016,z=-.026+i*.006;
      pod(parts,.006,y,z,.045,.019,.031,cloth,-.15,-.30,0);
      pod(parts,-.017,y-.004,z-.006,.026,.017,.023,pads,-.12,.30,0);
    }
    pod(parts,.007,.030,.026,.032,.034,.055,pads,-.51,.16,0);
    pod(parts,-.004,.035,.014,.028,.023,.037,cloth,-.30,.33,0);
  }
  const wrist=new T.Vector3(side*.019,-.029,.056);
  pod(parts,wrist.x,wrist.y,wrist.z,.070,.066,.077,seam,-.45,0,side*.13);
  hand.add(parts.mesh());
  const fabric=new Parts();
  limb(fabric,[0,0,0],[0,.65,0],.068,.052,'#38433e');
  limb(fabric,[0,.62,0],[0,.89,0],.054,.045,'#404a43');
  limb(fabric,[0,.87,0],[0,1,0],.047,.035,'#313a34');
  limb(fabric,[0,.79,0],[0,.82,0],.049,.048,'#51594d');
  const sleeve=fabric.mesh();
  hand.userData={wrist,sleeve,elbow:new T.Vector3()};
  return hand;
}

const gripTarget=new T.Vector3(),wristAxis=new T.Vector3();
const leftShoulder=new T.Vector3(-.25,-.43,.015),rightShoulder=new T.Vector3(.33,-.42,.015);
const inspectLeftShoulder=new T.Vector3(-.25,-.43,-.14),inspectRightShoulder=new T.Vector3(.33,-.42,-.14);
function placeSleeve(gun,hand,shoulder) {
  const {sleeve,elbow,wrist}=hand.userData;
  gun.worldToLocal(elbow.copy(shoulder));
  gun.worldToLocal(hand.localToWorld(wristAxis.copy(wrist)));
  wristAxis.sub(elbow);
  sleeve.position.copy(elbow);
  sleeve.scale.y=wristAxis.length();
  sleeve.quaternion.setFromUnitVectors(vertical,wristAxis.normalize());
}

function placeSniperHands(data,reach,grasp) {
  const {support,strong,magazine,bolt,magGrip}=data;
  // Both moving props are authored in the gun's local space. Transform their
  // contact points after posing them, including their rotation on removal.
  magazine.updateMatrix();bolt.updateMatrix();
  gripTarget.copy(magGrip).applyMatrix4(magazine.matrix);
  support.position.fromArray(sniperContacts.support).lerp(gripTarget,reach);
  support.rotation.set(-.17*reach,-.12*reach,(.48+magazine.rotation.z)*reach);
  gripTarget.fromArray(sniperContacts.bolt).applyMatrix4(bolt.matrix);
  strong.position.fromArray(sniperContacts.grip).lerp(gripTarget,grasp);
  // Move around the outside of the receiver while the right hand is in transit.
  strong.position.x+=.042*4*grasp*(1-grasp);
  strong.rotation.set(-.37*grasp,.20*grasp,-.46*grasp);
}

export function gunModel(type,skin='karambit') {
  if(type==='knife'){
    const group=new T.Group(),body=knifeMesh(skin),hand=articulatedGlove();
    hand.scale.setScalar(1.17);
    body.scale.setScalar(skin==='karambit'?.66:.76);
    group.add(body,hand,hand.userData.sleeve);
    group.userData={fit:knifeFit,body,hand,skin};return group;
  }
  const group=new T.Group(),body=blasterMesh(type),fit=gunFit[type];
  const sniper=type==='sniper';
  const strong=sniper ? sniperGlove(false) : glove(false,fit);
  const support=sniper ? sniperGlove(true) : glove(true,fit);
  const magazine=body.getObjectByName('magazine');
  const magBounds=magazine ? new T.Box3().setFromObject(magazine) : null;
  const contact=magBounds ? magBounds.getCenter(new T.Vector3()) : new T.Vector3(-.03,-.11,fit.support+.11);
  let shell;
  if(type==='shotgun'){
    const prop=new Parts();
    prop.tube(0,0,0,.027,.073,.027,'#a74432',PI/2);
    prop.tube(0,0,.034,.030,.010,.030,'#bf9961',PI/2);
    shell=prop.mesh();shell.visible=false;group.add(shell);
  }
  const supportMount=new T.Group();
  supportMount.add(support);group.add(body,strong,supportMount);
  group.userData={fit,body,strong,support,supportMount,magazine,contact,shell,handling:magazineHandling[type],
    window:body.getObjectByName('reflex-window'),
    pump:body.getObjectByName('pump'),bolt:body.getObjectByName('bolt')};
  group.add(support.userData.sleeve,strong.userData.sleeve);
  if(type==='revolver'){
    group.userData.action=revolverAction(body);
    const loader=revolverLoader();loader.visible=false;group.add(loader);group.userData.loader=loader;
  }
  if(sniper){
    group.userData.magGrip=contact.clone();
    group.userData.magGrip.x=magBounds.min.x+.002;
    placeSniperHands(group.userData,0,0);
    placeSleeve(group,support,leftShoulder);placeSleeve(group,strong,rightShoulder);
  }
  return group;
}

const loweredHand=new T.Vector3(-.29,-.46,-.37);
export function poseHeldSleeves(weapon,key,weight=0,freeHand=0) {
  if(key==='knife'){
    placeSleeve(weapon,weapon.userData.hand,knifeShoulder);return;
  }
  const {strong,support,supportMount}=weapon.userData;
  if(freeHand){
    weapon.worldToLocal(gripTarget.copy(loweredHand));
    wristAxis.copy(support.userData.wrist).applyQuaternion(support.quaternion).add(support.position);
    supportMount.position.copy(gripTarget).sub(wristAxis).multiplyScalar(freeHand);
  }else supportMount.position.set(0,0,0);
  if(key==='sniper'){
    placeSleeve(weapon,support,gripTarget.copy(leftShoulder).lerp(inspectLeftShoulder,weight));
    placeSleeve(weapon,strong,gripTarget.copy(rightShoulder).lerp(inspectRightShoulder,weight));return;
  }
  for(const [glove,shoulder] of [[support,inspectLeftShoulder],[strong,inspectRightShoulder]]){
    const {restElbow,hand}=glove.userData;
    // At rest the sleeve follows the authored arm and reload cycle; while raised,
    // its upper end returns to the player's shoulder, leaving the hand on the prop.
    glove.localToWorld(gripTarget.copy(restElbow)).lerp(shoulder,weight);
    placeSleeve(weapon,glove,gripTarget);
    if(glove===support)flexGlove(hand,.13+freeHand*.69);
  }
}

export function poseHeldKnife(rig,weapon,skin,drawAge,inspectAge,cut,side,step=0,walk=0,swayX=0) {
  const butterfly=skin==='balisong',striking=cut>=0&&cut<knifeAttackDuration(skin);
  if(striking)inspectAge=Infinity;
  if(striking||Number.isFinite(inspectAge))drawAge=Infinity;
  const slash=knifePose(cut,side,skin),draw=knifeDrawPose(skin,drawAge);
  const wrist=knifeWristPose(skin,draw,slash,step,walk,swayX);
  rig.position.set(wrist.x,wrist.y,wrist.z);
  rig.rotation.set(wrist.rx,wrist.ry,wrist.rz);
  const {body,hand}=weapon.userData;
  animateKnife(body,skin,drawAge,inspectAge);
  const flourish=butterfly?null:ringFlourish(inspectAge);
  if(butterfly){
    // Only the free handle fans out. The rail held in the palm follows the
    // same contact in every draw, hinge catch and attack.
    const hinge=clamp(Math.abs(body.getObjectByName('handle').rotation.z)/2.5,0,1);
    hand.rotation.set(-.09,.37+hinge*.14,.12+hinge*.20);
    flexGlove(hand,.10+Math.max(draw.grip,hinge*.72));
    weapon.worldToLocal(hand.localToWorld(gripTarget.set(.004,-.063,.002)));
    body.rotation.set(-.025,.035+hinge*.05,.060*hinge);
    wristAxis.set(-.015,-.075,0).multiply(body.scale).applyQuaternion(body.quaternion);
    body.position.copy(gripTarget).sub(wristAxis);
  }else{
    const loose=flourish?.grip??draw.grip;
    hand.quaternion.copy(reverseRightFrame);hand.rotateY(loose*.28);
    flexGlove(hand,loose*.94,true);
    const index=hand.userData.fingers[0].b;
    // Keep the centre of the actual metal ring on the index segment, including
    // during draw, wrist roll, and the loosen/regrip around the single spin.
    weapon.worldToLocal(index.localToWorld(gripTarget.set(-.020,0,0)));
    const reveal=Number.isFinite(inspectAge)?clamp(Math.min(inspectAge/.15,(KNIFE_TIMING.karambit.inspect-inspectAge)/.20),0,1):0;
    body.rotation.set(.86-reveal*.79,.19,-2.10+(flourish?.turn??draw.turn));
    wristAxis.fromArray(KARAMBIT_RING).multiply(body.scale).applyQuaternion(body.quaternion);
    body.position.copy(gripTarget).sub(wristAxis);
  }
}

export function animateHands(gun,player,reload,cycle) {
  const {fit,strong,support,body,magazine,shell,pump,bolt,handling}=gun.userData;
  if(!strong)return;
  const pull=reload.travel,reach=reload.reach;
  if(gun.userData.action){
    const {action,loader}=gun.userData,t=poseRevolver(action,player,cycle),smooth=T.MathUtils.smoothstep;
    const leave=smooth(t,.24,.42)*(1-smooth(t,.44,REVOLVER_RELOAD_CONTACT.seat));
    const retreat=smooth(t,.64,.75)*(1-smooth(t,.76,.94));
    const contact=smooth(t,.065,.22)*(1-smooth(t,.76,.92));
    action.hinge.updateMatrix();action.drum.updateMatrix();
    // The loader follows the open cylinder in gun space. The support wrist
    // comes back to the same point as the keyed parts return home.
    gripTarget.set(0,0,-.020).applyMatrix4(action.drum.matrix).applyMatrix4(action.hinge.matrix);
    loader.position.copy(gripTarget);
    loader.position.x-=.016+.102*(leave+retreat);loader.position.y-=.176*(leave+retreat);
    loader.position.z+=.020+.077*leave+.095*retreat;
    loader.rotation.set(-.59*leave,-.35*leave,.17*leave);loader.visible=t>.405&&t<.762;
    if(loader.visible)loader.position.x+=.016*(1-leave);
    support.rotation.set(-.34*contact,.18*contact,.43*contact);
    const hand=support.userData.hand;hand.updateMatrix();
    wristAxis.copy(palmPad).applyMatrix4(hand.matrix).applyQuaternion(support.quaternion);
    support.position.copy(loader.position).sub(wristAxis);
    support.position.x-=.042;support.position.y-=.024;support.position.z+=.022;
    support.position.multiplyScalar(contact);
    return;
  }
  if(pump){
    // The front hand stays on the sliding grip until it reaches for a loose shell.
    pump.position.z=.132*cycle.stroke;
    const time=player.reloadDuration ? 1-player.reload/player.reloadDuration : 1;
    support.position.set(-.053*reach-.060*pull, -.032*reach-.121*pull,
      (.32*reach+.058*pull)+pump.position.z*(1-reach));
    support.rotation.set(-.12*pull,0,-.14*reach);
    shell.visible=player.reload>0 && time>.19 && time<RELOAD_CONTACT.shell+.028;
    shell.position.set(-.065+support.position.x+.046*reach,-.058+support.position.y,
      fit.support+support.position.z-.033-reload.bump*.040);
    shell.rotation.set(-.24*pull,.20*reach,0);
    return;
  }
  if(bolt){
    magazine.position.set(handling.side*pull,-handling.drop*pull,.056*pull);
    magazine.rotation.z=pull*handling.turn;
    const empty=emptySniperBolt(player);
    const lift=Math.max(cycle.lift,empty),stroke=Math.max(cycle.stroke,empty);
    bolt.position.set(.006*lift,.025*lift,.115*stroke);
    bolt.rotation.z=.14*lift;
    placeSniperHands(gun.userData,reach,Math.max(cycle.grasp,emptySniperGrasp(player)));
    return;
  }
  if(!magazine||!handling)return;
  const t=player.reload>0&&player.reloadDuration>0?1-player.reload/player.reloadDuration:0;
  const smooth=T.MathUtils.smoothstep;
  const travel=smooth(t,RELOAD_CONTACT.release,handling.apex)*(1-smooth(t,handling.feed,RELOAD_CONTACT.seat));
  const clear=smooth(travel,.12,.92);
  magazine.rotation.set(handling.pitch*clear,handling.turn*.21*clear,handling.turn*clear);
  // Pivot the magazine around the gloved hand as it clears the well.
  gripTarget.fromArray(handling.grip);
  magazine.position.copy(gripTarget).sub(wristAxis.copy(gripTarget).applyQuaternion(magazine.quaternion));
  magazine.position.x+=handling.side*clear;magazine.position.y-=handling.drop*travel;
  magazine.position.z+=handling.back*travel;
  magazine.updateMatrix();body.updateMatrix();
  gripTarget.applyMatrix4(magazine.matrix).applyMatrix4(body.matrix);
  // Keep the pad inside the glove on that face throughout extraction, the hold
  // and insertion. The transient side arc keeps the reaching palm clear of the body.
  support.rotation.set(reach*(-.18+handling.pitch*clear),-.17*reach,reach*(handling.wrist+handling.turn*clear));
  const hand=support.userData.hand;hand.updateMatrix();
  wristAxis.copy(palmPad).applyMatrix4(hand.matrix).applyQuaternion(support.quaternion);
  support.position.copy(gripTarget).sub(wristAxis).multiplyScalar(reach);
  support.position.x-=.036*4*reach*(1-reach);
}

function operatorTemplate(team) {
  const group=new T.Group(), torso=new T.Group(),body=new Parts(),lights=new Parts();
  const color=teamColors[team], armor=team?'#a54030':'#18618b', visor='#173348', rubber='#243642', silver='#d6e4e8', suit='#435767';
  // Wide shoulder pads, a narrow belt and bright helmet paint read at combat distance.
  body.six(0,1.14,0,.47,.48,.32,suit,0,PI/6);
  body.six(0,1.245,-.01,.55,.28,.37,color,0,PI/6);
  body.cube(0,1.23,-.158,.384,.185,.088,color,-.10);
  body.cube(0,1.115,-.149,.304,.063,.082,armor);
  body.cube(0,1.027,-.146,.272,.068,.065,armor);
  for(const sign of [-1,1]){
    body.cube(sign*.159,1.26,-.203,.039,.104,.016,silver,0,0,sign*.39);
    body.six(sign*.256,1.31,-.008,.232,.22,.24,color,0,PI/6);
    pod(body,sign*.29,1.315,-.009,.218,.201,.21,color);
    limb(body,[sign*.27,1.27,0],[sign*.287,1.075,-.095],.085,.068,suit);
    limb(body,[sign*.278,1.203,-.034],[sign*.282,1.175,-.054],.088,.084,silver);
  }
  body.six(0,.918,.003,.442,.104,.326,rubber,0,PI/6);
  body.cube(0,.917,-.175,.107,.065,.032,'#eac263');
  body.six(0,1.19,.15,.361,.39,.164,armor,0,PI/6);
  body.cube(0,1.24,.229,.222,.211,.027,color);
  for(const x of [-.075,.075])lights.cube(x,1.25,.249,.042,.096,.014,'#f3e3b6');
  body.six(0,1.466,0,.274,.162,.265,rubber,0,PI/6);
  pod(body,0,1.632,-.001,.379,.343,.356,color);
  body.six(0,1.57,-.01,.372,.116,.361,armor,0,PI/6);
  pod(body,0,1.624,-.137,.314,.158,.147,visor);
  pod(body,0,1.599,-.201,.253,.055,.032,'#223f51');
  lights.cube(0,1.656,-.206,.207,.017,.014,'#c0eff6');
  for(const x of [-.17,.17]){
    body.six(x,1.603,.003,.072,.152,.132,rubber,0,PI/6);
    body.six(x*1.105,1.601,.002,.045,.097,.089,color,0,PI/6);
  }
  body.cube(0,1.768,.01,.080,.05,.179,silver);
  for(const sign of [-1,1]){
    const end=sign===1?[.132,1.11,-.261]:[.095,1.119,-.431];
    limb(body,[sign*.287,1.077,-.094],end,.071,.058,suit);
    pod(body,...end,.121,.105,.126,rubber);
  }
  torso.name='torso';torso.add(body.mesh(),lights.mesh(glowMaterial));
  const loadout=new T.Group();loadout.name='loadout';loadout.position.set(.127,1.166,-.277);loadout.scale.setScalar(.80);
  torso.add(loadout);group.add(torso);
  for(const sign of [-1,1]) {
    const leg=new Parts();
    limb(leg,[0,-.004,0],[0,-.31,-.007],.121,.099,suit);
    pod(leg,0,-.328,-.036,.176,.182,.203,armor);
    leg.six(0,-.337,-.108,.108,.09,.058,color,0,PI/6);
    limb(leg,[0,-.386,0],[0,-.615,.032],.096,.073,suit);
    limb(leg,[0,-.466,.01],[0,-.502,.017],.098,.091,silver);
    pod(leg,0,-.655,-.034,.172,.137,.268,rubber);
    leg.cube(0,-.712,-.032,.166,.047,.265,armor);
    const item=leg.mesh();item.position.set(sign*.129,.75,.003);group.add(item);
  }
  return {group};
}

function shadowStamp() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const c=canvas.getContext('2d'),g=c.createRadialGradient(16,16,2,16,16,16);
  g.addColorStop(0,'rgba(9,19,26,.69)');g.addColorStop(.4,'rgba(12,20,25,.48)');g.addColorStop(1,'rgba(15,24,22,0)');
  c.fillStyle=g;c.fillRect(0,0,32,32);
  return new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false});
}

function practicePlate(team) {
  const group=new T.Group(), body=new Parts(), color=teamColors[team===1?1:0];
  body.cube(0,-.85,0,.075,1.53,.075,'#6c797d');
  body.cube(0,-1.59,0,.48,.095,.36,'#646d68');
  body.tube(0,0,.0,.90,.075,.90,'#354953',PI/2);
  body.tube(0,0,.046,.83,.020,.83,'#e2d9b9',PI/2);
  body.tube(0,0,.062,.64,.013,.64,color,PI/2);
  body.tube(0,0,.073,.455,.012,.455,'#e1dbc4',PI/2);
  body.tube(0,0,.085,.275,.012,.275,color,PI/2);
  body.tube(0,0,.094,.114,.010,.114,'#f6dd99',PI/2);
  group.add(body.mesh());return group;
}

function dummyMesh(faces) {
  const positions=[],colors=[],indices=[],tint=new T.Color();
  for(const {points,color} of faces){
    const first=positions.length/3;
    tint.setHex(color);
    for(const point of points){positions.push(...point);colors.push(tint.r,tint.g,tint.b);}
    for(let i=2;i<points.length;i++)indices.push(first,first+i-1,first+i);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true}));
}

function lightScene(scene,world=false) {
  scene.add(new T.HemisphereLight(0xe0f0ff,world?0x718b9a:0xa0b2c6,world?1.05:1.54));
  const key=new T.DirectionalLight(0xffedca,world?1.72:2.65);key.position.set(-23,31,18);scene.add(key);
  if(world){
    key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    Object.assign(key.shadow.camera,{left:-30,right:30,top:32,bottom:-30,near:.5,far:98});
    key.shadow.camera.updateProjectionMatrix();key.shadow.bias=-.00035;key.shadow.normalBias=.018;
  }
  const fill=new T.DirectionalLight(0xc8e4ff,world?.40:.83);fill.position.set(18,12,-19);scene.add(fill);
}

export class ArenaRenderer {
  constructor(canvas,map,context) {
    this.canvas=canvas;this.map=map;
    this.gl=new T.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance',stencil:false});
    this.gl.outputColorSpace=T.SRGBColorSpace;
    this.gl.shadowMap.enabled=true;this.gl.shadowMap.type=T.PCFSoftShadowMap;
    this.gl.shadowMap.autoUpdate=false;this.gl.shadowMap.needsUpdate=true;
    this.gl.autoClear=false;
    this.scene=new T.Scene();this.scene.background=new T.Color('#c7e7f2');
    this.scene.fog=new T.Fog('#c7e7f2',63,146);
    this.cases=new EjectedCases(this.scene);
    this.worldCamera=new T.PerspectiveCamera(72,1,.055,205);
    this.gunScene=new T.Scene();this.gunCamera=new T.PerspectiveCamera(63,1,.012,4);
    this.reflexDot=makeReflexDot();this.reflexActive=false;
    this.gunScene.environment=studioReflection();
    this.worldCamera.rotation.order='YXZ';
    lightScene(this.scene,true);lightScene(this.gunScene);sky(this.scene);
    this.yards=new Map();
    this.setMap(map);
    this.guns=Object.fromEntries(weaponNames.map(type=>[type,gunModel(type)]));
    this.knifeViews={karambit:this.guns.knife,balisong:gunModel('knife','balisong')};
    this.gunRig=new T.Group();this.gunRig.scale.setScalar(.91);
    Object.values(this.guns).forEach(g=>this.gunRig.add(g));
    this.gunRig.add(this.knifeViews.balisong);this.knifeViews.balisong.visible=false;
    this.gunScene.add(this.gunRig);
    this.flash=new T.Group();
    const flare=new Parts(),tongue=new T.ConeGeometry(.5,1,6);
    // Local zero stays on the cap. All of the luminous geometry extends forward.
    flare.piece(tongue,0,0,-.085,.047,.17,.047,'#ffd992',-PI/2);
    flare.piece(tongue,-.015,.008,-.053,.036,.107,.025,'#ec9e48',-1.38,-.31);
    flare.piece(tongue,.014,-.007,-.038,.031,.078,.027,'#ffb660',-1.72,.32);
    // Short radial tongues open in front of the cap. Through iron sights the
    // slide can hide the core, while the outer tips remain visible around it.
    const sideFlare=new Parts(),ray=new T.Vector3(),center=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),matrix=new T.Matrix4();
    for(let i=0;i<5;i++){
      const angle=i*2*PI/5+.32,radius=.103+.016*Math.cos(i*2.4);
      const length=.092+.031*Math.sin(i*1.9);
      ray.set(Math.cos(angle)*radius,Math.sin(angle)*radius,-length);
      center.copy(ray).multiplyScalar(.5);center.z-=.035;
      scale.set(.026,ray.length(),.024);
      rotation.setFromUnitVectors(vertical,ray.normalize());
      matrix.compose(center,rotation,scale);sideFlare.append(tongue,matrix,i%2?'#ffc56f':'#ffae58');
    }
    flare.six(0,0,-.024,.041,.047,.041,'#fff7ce',PI/2);tongue.dispose();
    this.barrelTip=new T.Object3D();this.gunRig.add(this.barrelTip);
    this.flash.add(flare.mesh(glowMaterial));this.scene.add(this.flash);
    this.flash.visible=false;
    // Remote flashes share the prop geometry, but have independent visibility,
    // materials and lifetime; they are depth-tested in the world pass.
    this.remoteFlashPoint=new T.Vector3();this.remoteFlashRotation=new T.Quaternion();
    this.remoteFlashIndex=0;this.remoteFlashFocus=null;
    this.remoteFlashes=Array.from({length:12},()=>{
      const mesh=this.flash.clone(true);
      mesh.traverse(part=>{if(part.isMesh){
        const material=part.material.clone();material.depthTest=true;material.depthWrite=false;
        part.material=material;part.castShadow=false;part.receiveShadow=false;
      }});
      mesh.visible=false;this.scene.add(mesh);
      return {mesh,ttl:0,actor:null,weapon:null};
    });
    this.sightFlare=sideFlare.mesh(glowMaterial);
    this.sightFlare.visible=false;this.flash.add(this.sightFlare);
    this.templates=[operatorTemplate(0),operatorTemplate(1)];
    this.shadowMat=shadowStamp();this.shadowGeo=new T.PlaneGeometry(1.12,1.05);
    this.models=new Map();this.lastSeq=0;this.lastElapsed=-1;this.lastShotFrame=null;
    this.resetShot();
    this.meleeAge=.55;this.meleeSide=1;this.meleeSwings=new Map();
    this.plates=new Map();
    this.aim=0;this.bob=0;this.eye=1.55;this.roll=0;this.lastFocus=null;
    this.lookSwayX=0;this.lookSwayY=0;this.lastYaw=null;this.lastPitch=null;this.equip=0;this.active=null;
    this.tracers=[];this.shotsThisFrame=[];this.viewMuzzle=new T.Vector3();this.actorMuzzle=new T.Vector3();
    this.viewForward=new T.Vector3();this.actorForward=new T.Vector3();this.actorRotation=new T.Quaternion();
    this.spark=[];this.impacts=new WorldImpacts(this.scene,id=>this.flashPlate(id));this.res={w:0,h:0};this.performanceScale=1;
    this.shotTrails=new PelletRenderer(this.scene);
    const beamGeo=new T.CylinderGeometry(1,.39,1,6,1,true),tints=[];
    for(let i=0;i<beamGeo.attributes.position.count;i++){
      const head=beamGeo.attributes.position.getY(i)+.5;
      tints.push(.46+.54*head,.34+.66*head,.26+.74*head);
    }
    beamGeo.setAttribute('color',new T.Float32BufferAttribute(tints,3));
    for(let i=0;i<16;i++){
      const mesh=new T.Mesh(beamGeo,new T.MeshBasicMaterial({color:0xffdd91,vertexColors:true,transparent:true,depthWrite:false}));
      const flightMesh=mesh.clone();mesh.visible=flightMesh.visible=false;
      this.scene.add(mesh,flightMesh);
      this.tracers.push({mesh,flightMesh,ttl:0,start:new T.Vector3(),end:new T.Vector3()});
    }
    const sparkGeo=new T.OctahedronGeometry(1);
    for(let i=0;i<14;i++){
      const mesh=new T.Mesh(sparkGeo,new T.MeshBasicMaterial({color:0xffe5af}));
      mesh.visible=false;this.scene.add(mesh);this.spark.push({mesh,ttl:0,velocity:new T.Vector3(),life:0,size:0});
    }
    this.traceIndex=0;this.sparkIndex=0;
    this.sampleSeconds=0;this.sampleFrames=0;
  }
  setMap(map) {
    let yard=this.yards.get(map.id);
    if(!yard){
      const group=new T.Group();
      yard={group,ring:makeYard(group,map)};
      this.yards.set(map.id,yard);this.scene.add(group);
    }
    for(const entry of this.yards.values())entry.group.visible=entry===yard;
    this.map=map;this.ring=yard.ring;
    this.gl.shadowMap.needsUpdate=true;
    if(this.shotsThisFrame)this.clearShotEffects();
    this.lastFocus=null;this.lastSeq=0;this.lastElapsed=-1;
  }
  resize(view) {
    const canvas=this.canvas;
    const w=Math.max(1,canvas.clientWidth||window.innerWidth), h=Math.max(1,canvas.clientHeight||window.innerHeight);
    const scale=view.quality==='low'?.62:this.performanceScale;
    const dpr=window.devicePixelRatio||1;
    const hardwareLimit=this.gl.capabilities.maxTextureSize;
    const ratio=view.quality==='high'
      ? Math.min(Math.max(1,dpr),hardwareLimit/w,hardwareLimit/h)
      : Math.min(dpr,1.25,1440/w,900/h)*scale;
    const rw=Math.max(1,Math.floor(w*ratio)), rh=Math.max(1,Math.floor(h*ratio));
    if(rw===this.res.w && rh===this.res.h)return;
    this.res={w:rw,h:rh};this.gl.setSize(rw,rh,false);
    this.worldCamera.aspect=this.gunCamera.aspect=w/h;
    this.worldCamera.updateProjectionMatrix();this.gunCamera.updateProjectionMatrix();
  }
  avatar(player) {
    const team=player.team===1?1:0;
    if(!operatorAvailable(team))loadOperators();
    let a=this.models.get(player.id);
    const useRig=operatorAvailable(team);
    if(a && a.team===player.team && !!a.rig===useRig)return a;
    if(a){this.scene.remove(a.group,a.shadow);if(a.rig)disposeOperator(a.rig);}
    const rig=useRig?createOperator(player.team===1?1:0):null;
    const template=this.templates[player.team===1?1:0], group=rig?.group||template.group.clone(true);
    const shadow=new T.Mesh(this.shadowGeo,this.shadowMat);shadow.rotation.x=-PI/2;shadow.renderOrder=1;
    const legs=rig?[]:group.children.slice(-2);
    a={team:player.team,group,shadow,rig,legs,torso:group.getObjectByName('torso'),loadout:group.getObjectByName('loadout'),x:player.x,y:player.y,z:player.z,gait:0,wasAlive:false};
    this.models.set(player.id,a);this.scene.add(group,shadow);
    return a;
  }
  remoteMuzzle(actorId,weapon,out,rotation){
    const avatar=this.models.get(actorId);
    if(!avatar?.wasAlive||!avatar.group.visible)return false;
    const active=avatar.rig?avatar.rig.active:avatar.active;
    if(active!==weapon)return false;
    const held=avatar.rig?avatar.rig.loadouts[weapon]:avatar.loadout?.children[0];
    return heldMuzzleWorld(held,weapon,out,rotation);
  }
  flashRemote(actorId,weapon,seq,validatedOrigin){
    if(actorId===this.remoteFlashFocus)return false;
    if(!this.remoteMuzzle(actorId,weapon,this.remoteFlashPoint,this.remoteFlashRotation))return false;
    // The caller may supply the same wall-checked origin used by its shot path.
    // An absent/invalid displayed muzzle never creates a flash at world zero.
    if(validatedOrigin){
      if(![validatedOrigin.x,validatedOrigin.y,validatedOrigin.z].every(Number.isFinite))return false;
      this.remoteFlashPoint.copy(validatedOrigin);
    }
    const flash=this.remoteFlashes.find(item=>item.ttl<=0)||this.remoteFlashes[this.remoteFlashIndex++%this.remoteFlashes.length];
    flash.actor=actorId;flash.weapon=weapon;flash.ttl=shotFlashDuration(weapon);
    flash.mesh.position.copy(this.remoteFlashPoint);flash.mesh.quaternion.copy(this.remoteFlashRotation);
    flash.mesh.rotateZ((Number.isFinite(seq)?seq:0)*1.9);flash.mesh.scale.setScalar((gunFit[weapon]?.flash||1)*.86);
    flash.mesh.visible=true;return true;
  }
  stepRemoteFlashes(dt,focusId){
    this.remoteFlashFocus=focusId;
    for(const flash of this.remoteFlashes){
      if(flash.ttl<=0)continue;
      const avatar=this.models.get(flash.actor),active=avatar?.rig?avatar.rig.active:avatar?.active;
      flash.ttl=Math.max(0,flash.ttl-dt);
      if(flash.actor===focusId||!avatar?.wasAlive||!avatar.group.visible||active!==flash.weapon)flash.ttl=0;
      flash.mesh.visible=flash.ttl>0;
    }
  }
  clearRemoteFlashes(){
    for(const flash of this.remoteFlashes){flash.ttl=0;flash.actor=null;flash.weapon=null;flash.mesh.visible=false;}
  }
  targetModel(target) {
    let model=this.plates.get(target.id);
    if(model)return model;
    if(target.kind==='dummy'){
      if(!this.dummyTemplate)this.dummyTemplate=[dummyMesh(dummyStand),dummyMesh(dummyBody)];
      const [stand,body]=this.dummyTemplate;
      const face=body.clone();
      face.material=body.material.clone();
      model=new T.Group();model.add(stand.clone(),face);model.userData.face=face;
    }else model=practicePlate(target.team);
    this.plates.set(target.id,model);this.scene.add(model);
    return model;
  }
  burst(x,y,z,color,life,size,vx=0,vy=0,vz=0) {
    const p=this.spark[this.sparkIndex++%this.spark.length];
    p.mesh.position.set(x,y,z);p.mesh.material.color.setHex(color);p.mesh.rotation.set(0,this.sparkIndex*.85,.42);
    p.velocity.set(vx,vy,vz);p.ttl=p.life=life;p.size=size;
    p.mesh.scale.setScalar(size);p.mesh.visible=true;
  }
  flashPlate(id){
    const plate=this.plates.get(id);
    if(!plate)return;
    plate.userData.hit=.18;
    const face=plate.userData.face;
    if(face){face.rotation.x=.081;face.material.emissive.setRGB(.342,.164,.038);}
  }
  resetShot() {
    this.shotAge=Infinity;this.shotWeapon=null;this.shotRun=0;this.kickSide=1;
    this.recoil=0;this.flashTime=0;this.scopeActive=false;
  }

  effects(game,focus,dt,shotDt) {
    this.shotsThisFrame.length=0;this.stepRemoteFlashes(shotDt,focus.id);
    this.meleeAge=Math.min(.55,this.meleeAge+shotDt);
    if(!focus?.alive||focus.active!=='knife')this.meleeAge=.55;
    for(const [id,swing] of this.meleeSwings){
      const actor=game.players.find(player=>player.id===id);swing.age+=shotDt;
      if(!actor?.alive||actor.active!=='knife'||swing.age>=.55)this.meleeSwings.delete(id);
    }
    this.shotTrails.step(shotDt);this.impacts.step(shotDt);
    this.shotAge+=shotDt;this.recoil=shotKickResponse(this.shotAge,this.shotWeapon);
    this.flashTime=Math.max(0,this.flashTime-shotDt);
    if(this.flashTime>0 && this.shotWeapon){
      this.flash.scale.setScalar(.91*gunFit[this.shotWeapon].flash*this.flashTime/LOCAL_IGNITION_LIFE);
    }
    if(game.seq<this.lastSeq || game.elapsed<this.lastElapsed){this.lastSeq=0;this.clearShotEffects();this.meleeAge=.55;this.meleeSwings.clear();this.resetShot();}
    this.lastElapsed=game.elapsed;
    const events=game.events||[];
    for(let i=0;i<events.length;i++){
      const e=events[i];
      if(e.seq<=this.lastSeq)continue;
      this.lastSeq=e.seq;
      if(e.type==='round'){this.clearShotEffects();this.meleeAge=.55;this.meleeSwings.clear();this.resetShot();}
      if(e.type==='melee'){
        const actor=game.players.find(player=>player.id===e.actor);
        if(actor?.alive&&actor.active==='knife'){
          const side=e.side??(e.seq%2?1:-1);
          const age=Number.isFinite(e.at)?clamp(game.elapsed-e.at,0,.55):0;
          this.meleeSwings.set(e.actor,{age,side});
          if(e.actor===focus?.id){this.meleeAge=age;this.meleeSide=side;this.flashTime=0;}
        }
      }
      if(e.type==='meleeImpact'&&Number.isFinite(e.ex)){
        for(let k=0;k<3;k++)this.burst(e.ex,e.ey,e.ez,e.target?0xf4dfb5:0xffc56a,.10+k*.022,.035+k*.009,(k-1)*.65,.3+k*.2,.10*(k-1));
      }
      if(e.type==='hit'&&e.weapon==='knife')this.flashPlate(e.target);
      if(e.type==='kill'&&e.weapon==='knife'&&e.target!==focus?.id){
        const fallen=game.players.find(p=>p.id===e.target) || game.targets?.find(v=>v.kind==='dummy'&&v.id===e.target);
        if(fallen)for(let k=0;k<7;k++){
          const angle=(k/7)*PI*2+e.seq*.25,dx=Math.cos(angle),dz=Math.sin(angle);
          this.burst(fallen.x+dx*.13,fallen.y+(fallen.slide>0?.73:1.08),fallen.z+dz*.13,teamLights[fallen.team]??0xffbb47,.25+(k%3)*.052,.085+(k%2)*.022,dx*1.8,.65+(k%4)*.50,dz*1.8);
        }
      }
      if(e.type!=='shot'||!Number.isFinite(e.ex))continue;
      const mine=e.actor===focus?.id;
      if(mine && focus.alive && e.weapon===focus.active){
        const continuous=this.shotWeapon===e.weapon&&this.shotAge<.24;
        this.shotRun=continuous?this.shotRun+1:0;
        this.kickSide=Math.cos(this.shotRun*2.19+.45);
        this.shotAge=0;this.shotWeapon=e.weapon;this.recoil=0;
        this.flashTime=e.blocked?0:LOCAL_IGNITION_LIFE;
      }
      const hit=events[i+1]?.type==='hit'&&events[i+1].actor===e.actor?events[i+1]:null;
      this.shotsThisFrame.push({event:e,mine,hit});
    }
    for(const tracer of this.tracers)if(tracer.ttl>0) {
      tracer.ttl=Math.max(0,tracer.ttl-shotDt);
      if(!tracer.ttl)tracer.mesh.visible=tracer.flightMesh.visible=false;
    }
    for(const particle of this.spark)if(particle.ttl>0) {
      particle.ttl=Math.max(0,particle.ttl-dt);particle.mesh.visible=particle.ttl>0;
      particle.mesh.position.addScaledVector(particle.velocity,dt);
      if(particle.velocity.lengthSq()>.00001)particle.velocity.y-=4.2*dt;
      particle.mesh.scale.setScalar(particle.size*(particle.ttl/particle.life));
    }
  }
  clearShotEffects(){
    this.cases.clear();this.clearRemoteFlashes();this.shotTrails.clear();this.shotsThisFrame.length=0;
    this.impacts.clear();
    this.flash.visible=false;this.flashTime=0;
    for(const t of this.tracers){t.ttl=0;t.mesh.visible=t.flightMesh.visible=false;}
  }

  renderShots(game,focus,cam){
    for(const {event:e,mine,hit} of this.shotsThisFrame){
      const actor=game.players.find(p=>p.id===e.actor);
      const held=mine ? focus.alive&&focus.active===e.weapon : actor&&this.remoteMuzzle(e.actor,e.weapon,this.actorMuzzle,this.actorRotation);
      let origin=e,forward=null;
      endpoint.set(e.ex,e.ey,e.ez);
      if(e.blocked){
        // The simulation shortened the start against a near wall or target.
        // There is contact here even though there is no visible flight or flash.
        this.impacts.schedule(this.map,e,{ex:e.ex,ey:e.ey,ez:e.ez,target:hit?.target||e.pellets?.[0]?.target},e.weapon,e.seq,0);
        continue;
      }
      if(held){
        const eye=mine?cam.position:{x:actor.x,y:actor.y+eyeHeight(actor),z:actor.z};
        const tip=mine?this.viewMuzzle:this.actorMuzzle;
        const clipped=clipBarrelOrigin(eye,tip,this.map);
        origin=tip;
        if(clipped.blocked){
          if(mine){this.flash.visible=false;this.flashTime=0;}
          const {x,y,z}=clipped.impact;
          this.impacts.schedule(this.map,eye,{ex:x,ey:y,ez:z},e.weapon,e.seq,0);
          continue;
        }
        forward=mine?this.viewForward:this.actorForward.copy(forwardAxis).applyQuaternion(this.actorRotation);
        if(mine){
          // Leave the light at the firing pose while the hands recoil or turn.
          this.flash.position.copy(origin);
          this.flash.quaternion.setFromUnitVectors(forwardAxis,forward);
          this.flash.rotateZ(e.seq*1.9);this.flash.scale.setScalar(.91*gunFit[e.weapon].flash);
          this.sightFlare.visible=this.aim>.65&&['pistol','rifle','smg'].includes(e.weapon);
          this.flash.visible=this.flashTime>0;
        }else this.flashRemote(e.actor,e.weapon,e.seq,origin);
      }
      if(e.weapon==='shotgun'){
        const trails=this.shotTrails.add(e,mine,origin,this.map,forward);
        trails.forEach((trail,index)=>{
          this.impacts.schedule(this.map,trail.departure||origin,trail,e.weapon,e.seq*10+index,pelletSpan(trail).arrivalTime);
        });
        continue;
      }
      const end=visibleTraceEnd(origin,endpoint,this.map);
      const t=this.tracers[this.traceIndex++%this.tracers.length];
      t.start.copy(origin);t.end.copy(end);t.length=t.start.distanceTo(t.end);
      t.departure=muzzleDeparture(origin,end,forward,this.map);
      t.weapon=e.weapon;t.ttl=t.length>.012&&exitsForward(origin,end,forward)?SHOT_TRAIL_LIFE:0;
      t.mesh.visible=t.flightMesh.visible=false;t.mesh.material.color.setHex(tracerColors[e.weapon]||0xffdf9e);
      t.own=mine;
      const pathLength=t.departure?.length??t.length;
      this.impacts.schedule(this.map,t.departure||origin,{ex:end.x,ey:end.y,ez:end.z,target:end===endpoint?hit?.target:null},
        e.weapon,e.seq,singleShotSpan(pathLength,0,e.weapon).arrivalTime);
    }
    const pixel=2*Math.tan(cam.fov*PI/360)/this.res.h;
    for(const t of this.tracers){
      if(t.ttl<=0)continue;
      const span=singleShotSpan(t.departure?.length??t.length,SHOT_TRAIL_LIFE-t.ttl,t.weapon);
      t.mesh.visible=t.flightMesh.visible=false;
      if(span.alpha<=.005)continue;
      flightSlices(t.length,t.departure,span.tail,span.head,(exit,a,b)=>{
        const mesh=exit||!t.departure?t.mesh:t.flightMesh;
        const from=exit||!t.departure?t.start:t.departure,to=exit?t.departure:t.end;
        beamStart.lerpVectors(from,to,a);beamEnd.lerpVectors(from,to,b);
        mesh.position.copy(beamStart).lerp(beamEnd,.5);
        const length=direction.subVectors(beamEnd,beamStart).length();
        if(length<.0001)return;
        const radius=span.width*Math.max(.0037,cam.position.distanceTo(mesh.position)*pixel*.64);
        mesh.scale.set(radius,length,radius);mesh.quaternion.setFromUnitVectors(vertical,direction.divideScalar(length));
        mesh.visible=true;
      });
      t.mesh.material.opacity=span.alpha*(t.own?1:.82);
    }
    this.impacts.draw(this.res.h);
  }
  updateModels(players,focusId,dt) {
    const ids=new Set();
    for(const p of players){
      if(p.id===focusId)continue;
      ids.add(p.id);
      const a=this.avatar(p),show=p.alive;
      a.group.visible=show;a.shadow.visible=show;
      if(show){
        const snap=!a.wasAlive || Math.hypot(p.x-a.x,p.z-a.z)>3.5;
        a.x=snap?p.x:damp(a.x,p.x,30,dt);a.z=snap?p.z:damp(a.z,p.z,30,dt);
        a.y=snap?p.y:damp(a.y,p.y,28,dt);a.group.position.set(a.x,a.y,a.z);
        a.group.rotation.y=-p.yaw;a.group.scale.y=damp(a.group.scale.y,!a.rig&&p.slide>0?.67:1,18,dt);
        let cylinderCycle;
        if(p.active==='revolver'){
          const fired=this.shotsThisFrame.some(({event})=>event.actor===p.id&&event.weapon==='revolver');
          a.revolverAge=fired?0:(a.revolverAge??Infinity)+dt;
          cylinderCycle=shotCycle('revolver',a.revolverAge);
        }else a.revolverAge=Infinity;
        if(a.rig)updateOperator(a.rig,p,dt,this.meleeSwings.get(p.id),cylinderCycle);
        else {
        const knifeSkin=normalizeKnifeSkin(p.knifeSkin);
        if(a.active!==p.active||(p.active==='knife'&&a.knifeSkin!==knifeSkin)){
          const held=p.active==='knife'?knifeMesh(knifeSkin):blasterMesh(p.active);
          if(p.active==='knife')held.position.y=.075;
          a.loadout.clear();a.loadout.add(held);a.active=p.active;a.knifeSkin=knifeSkin;a.drawAge=0;
          a.revolver=p.active==='revolver'?revolverAction(held):null;
        }
        a.loadout.rotation.x=clamp(p.pitch,-.78,.78);
        const slash=p.active==='knife'?this.meleeSwings.get(p.id):null,cut=knifePose(slash?.age??.55,slash?.side||1,knifeSkin);
        a.loadout.position.set(.127,p.active==='knife'?1.11:1.166,-.277);
        a.loadout.rotation.y=p.active==='knife'?-.3+cut.ry:0;
        a.loadout.rotation.z=p.active==='knife'?.4+cut.rz:0;
        if(a.revolver)poseRevolver(a.revolver,p,cylinderCycle);
        if(p.active==='knife'){
          a.loadout.rotation.x+=cut.rx-.18;
          animateCarriedKnife(a.loadout.children[0],knifeSkin,slash?Infinity:a.drawAge,0);a.drawAge+=dt;
        }
        const speed=p.speed||0; a.gait+=dt*Math.min(speed,9)*2.9;
        const step=p.slide>0?0:Math.sin(a.gait)*Math.min(speed*.113,.55);
        a.legs[0].rotation.x=step;a.legs[1].rotation.x=-step;
        a.torso.position.y=.016*Math.abs(step);
        a.torso.rotation.z=step*.043+cut.rz*.07;
        }
        let floor=0;
        for(const b of this.map.boxes)if(b.h<=a.y+.09 && Math.abs(a.x-b.x)<=b.w*.5 && Math.abs(a.z-b.z)<=b.d*.5)floor=Math.max(floor,b.h);
        for(const r of this.map.ramps||[])if(Math.abs(a.x-r.x)<=r.w*.5 && Math.abs(a.z-r.z)<=r.d*.5){
          const fraction=r.axis==='x'?(a.x-r.x)/r.w:(a.z-r.z)/r.d;
          const h=r.h*(.5+fraction*r.sign);if(h<=a.y+.09)floor=Math.max(floor,h);
        }
        a.shadow.position.set(a.x,floor+.035,a.z);a.shadow.scale.setScalar(clamp(1-(a.y-floor)*.20,.55,1));
      }
      a.wasAlive=show;
    }
    for(const [id,a] of this.models)if(!ids.has(id)){
      this.scene.remove(a.group,a.shadow);if(a.rig)disposeOperator(a.rig);this.models.delete(id);
    }
  }
  lobby(t) {
    this.reflexActive=false;this.reflexDot.visible=false;
    this.meleeAge=.55;this.meleeSwings.clear();
    this.clearShotEffects();
    for(const plate of this.plates.values())plate.visible=false;
    for(const a of this.models.values()){a.group.visible=false;a.shadow.visible=false;a.wasAlive=false;}
    for(const e of [...this.tracers,...this.spark]){e.ttl=0;e.mesh.visible=false;}
    this.lastSeq=0;this.lastElapsed=-1;this.lastFocus=null;
    const c=this.worldCamera;
    const preview=this.map.preview;
    c.position.set((preview?.x??13)+Math.sin(t*.036)*.72,(preview?.y??7.1)+Math.sin(t*.025)*.14,(preview?.z??20)+Math.cos(t*.036)*.44);
    c.lookAt(preview?.targetX??-1.3,preview?.targetY??1.64,preview?.targetZ??-1.7);c.fov=58;c.updateProjectionMatrix();
    this.ring.material.opacity=.35;this.ring.material.color.setHex(0xffca74);
    this.gl.clear();this.gl.render(this.scene,c);
  }
  draw(game,selfId,view={}) {
    const dt=clamp(view.dt||1/60,.002,.13), t=Number.isFinite(view.t)?view.t:performance.now()/1000;
    if(!view.lobby&&game&&view.quality==='auto'){
      this.sampleSeconds+=dt;this.sampleFrames++;
      if(this.sampleSeconds>=1.8){
        const average=this.sampleSeconds/this.sampleFrames;
        if(average>1/36)this.performanceScale=Math.max(.60,Math.round((this.performanceScale-.10)*10)/10);
        else if(average<1/57)this.performanceScale=Math.min(1,Math.round((this.performanceScale+.10)*10)/10);
        this.sampleSeconds=0;this.sampleFrames=0;
      }
    }
    this.resize(view);
    if(view.lobby||!game){this.lobby(t);return;}
    let focus=game.players.find(p=>p.id===(view.spectatorId||selfId));
    if(!focus)focus=game.players[0];
    if(!focus){this.lobby(t);return;}
    const first=this.lastFocus!==focus.id;
    for(const plate of this.plates.values())plate.visible=false;
    for(const target of game.targets||[]) {
      const plate=this.targetModel(target);
      plate.visible=true;plate.position.set(target.x,target.y,target.z);
      plate.userData.hit=Math.max(0,(plate.userData.hit||0)-dt);
      if(target.kind==='dummy'){
        const face=plate.userData.face;
        face.visible=target.alive;
        plate.rotation.y=-target.yaw;
        face.rotation.x=plate.userData.hit*.45;
        face.material.emissive.setRGB(plate.userData.hit*1.9,plate.userData.hit*.91,plate.userData.hit*.21);
      }else plate.rotation.set(plate.userData.hit*.56,target.z<0?PI:0,0);
    }
    const playerView=focus.id===selfId;
    const yaw=playerView && Number.isFinite(view.yaw)?view.yaw:focus.yaw;
    const pitch=playerView && Number.isFinite(view.pitch)?view.pitch:focus.pitch;
    if(first || !focus.alive || focus.active!==this.active)this.resetShot();
    // Effects scheduled on the audio clock keep time even when a render frame stalls.
    const shotDt=this.lastShotFrame!==null && t>this.lastShotFrame ? t-this.lastShotFrame : dt;
    this.lastShotFrame=t;
    this.effects(game,focus,dt,shotDt);this.updateModels(game.players,focus.id,dt);
    if(focus.reload>0 && this.shotWeapon)this.resetShot();
    if(first){const swing=this.meleeSwings.get(focus.id);this.meleeAge=swing?.age??.55;this.meleeSide=swing?.side||1;}
    this.lastFocus=focus.id;
    const held=canAim(focus,playerView?view.ads??focus.ads:focus.ads);
    const age=this.shotWeapon===focus.active ? this.shotAge : Infinity;
    const ads=scopeAfterShot(focus.active,held,age);
    this.aim=first?Number(ads):approachAim(this.aim,ads,dt,focus.active);
    this.lensAim=cameraAim(focus.active,first?this.aim:this.lensAim,this.aim,held,ads,dt);
    this.scopeActive=sniperScopeVisible(focus.active,this.aim,ads);
    const height=eyeHeight(focus);
    this.eye=first||playerView?height:damp(this.eye,height,19,dt);
    const move=Math.min((focus.speed||0)/5.4,1),slide=focus.slide>0;
    this.bob+=dt*(slide?0:move*12);
    const cam=this.worldCamera;
    if(first||playerView||Math.hypot(focus.x-cam.position.x,focus.z-cam.position.z)>3.5)cam.position.set(focus.x,focus.y+this.eye,focus.z);
    else {
      cam.position.x=damp(cam.position.x,focus.x,37,dt);cam.position.z=damp(cam.position.z,focus.z,37,dt);
      cam.position.y=damp(cam.position.y,focus.y+this.eye,28,dt);
    }
    this.roll=damp(this.roll,slide?-.017:0,16,dt);
    // The simulation fires down this axis. The weapon rig carries the recoil.
    cam.rotation.set(pitch,-yaw,this.roll,'YXZ');
    const fov=weaponFov(focus.active,this.lensAim,slide);
    if(cam.fov!==fov){cam.fov=fov;cam.updateProjectionMatrix();}
    this.viewFov=cam.fov;
    const key=weaponNames.includes(focus.active)?focus.active:'rifle';
    const knifeSkin=normalizeKnifeSkin(focus.knifeSkin);
    if(key==='knife'&&(first||key!==this.active||knifeSkin!==this.lastKnifeSkin)){
      this.knifeEquippedAt=t;this.lastKnifeSkin=knifeSkin;
    }
    if(key!==this.active){this.equip=this.active ? .85 : 0;this.active=key;if(key!=='knife'||!this.meleeSwings.has(focus.id))this.meleeAge=.55;}
    this.equip=damp(this.equip,0,14,dt);
    for(const [id,gun] of Object.entries(this.guns))gun.visible=id===key;
    for(const [skin,model] of Object.entries(this.knifeViews))model.visible=key==='knife'&&knifeSkin===skin;
    const weapon=key==='knife'?this.knifeViews[knifeSkin]:this.guns[key],sniper=key==='sniper';
    const reload=reloadPose(focus,key),reloadWeight=reload.tilt;
    const cycle=shotCycle(key,age);
    animateHands(weapon,focus,reload,cycle);
    if(first){this.lastYaw=yaw;this.lastPitch=pitch;}
    const turn=Math.atan2(Math.sin(yaw-this.lastYaw),Math.cos(yaw-this.lastYaw));
    this.lookSwayX=damp(this.lookSwayX,clamp(turn*.22,-.046,.046),15,dt);
    this.lookSwayY=damp(this.lookSwayY,clamp((pitch-this.lastPitch)*.19,-.031,.031),15,dt);
    this.lastYaw=yaw;this.lastPitch=pitch;
    const sway=(1-this.aim)*(slide?.2:move);
    const fit=weapon.userData.fit, hip=1-this.aim;
    const gunX=(.188+Math.sin(this.bob)*.009*sway-this.lookSwayX)*hip;
    const gunY=(-.174-Math.abs(Math.cos(this.bob))*.009*sway-this.lookSwayY)*hip-(fit.sight*.91+.009)*this.aim;
    const gunZ=(isSecondaryWeapon(key)?-.35:-.422)+.029*this.aim;
    const handling=weapon.userData.handling,profile=gunPresentation(key);
    const kick=shoulderedKick(this.recoil,this.aim),lateral=kick*this.kickSide;
    this.gunRig.position.set(gunX+reloadWeight*(handling?.center??.042),gunY+reloadWeight*.059+reload.bump*.008-this.equip*.12,
      gunZ-reloadWeight*.17+kick*profile.push);
    this.gunRig.rotation.set(kick*profile.pitch+hip*.012+reloadWeight*.088-this.equip*.18,
      .025*hip+reloadWeight*.10+this.lookSwayX*.55+lateral*profile.yaw,
      -.032*hip+reloadWeight*(handling?.roll??.39)+reload.bump*.028+lateral*profile.roll);
    if(key==='shotgun'){
      const shoulderMotion=cycle.stroke*(1-.68*this.aim);
      this.gunRig.position.x-=.098*reloadWeight;
      this.gunRig.position.y-=.038*shoulderMotion;
      this.gunRig.position.z+=.10*reloadWeight;
      this.gunRig.rotation.x-=.085*shoulderMotion;
      this.gunRig.rotation.y-=.24*reloadWeight;
      this.gunRig.rotation.z+=.32*reloadWeight-.09*shoulderMotion;
    }else if(key==='revolver'){
      this.gunRig.position.x-=.093*reloadWeight;
      this.gunRig.position.y+=.045*reloadWeight;
      this.gunRig.rotation.x+=.20*reloadWeight;
      this.gunRig.rotation.y+=.40*reloadWeight;
      this.gunRig.rotation.z-=.99*reloadWeight;
    }else if(sniper){
      // Roll the long receiver toward the viewer during the bolt cycle.
      this.gunRig.position.x+=.035*hip-.074*cycle.grasp-.084*reloadWeight;
      this.gunRig.position.y+=.061*reloadWeight-.025*cycle.grasp;
      this.gunRig.position.z+=.066*cycle.grasp;
      this.gunRig.rotation.x-=.060*cycle.stroke;
      this.gunRig.rotation.y+=-.20*cycle.grasp-.11*reloadWeight+.020*this.recoil;
      this.gunRig.rotation.z-=.33*cycle.grasp+.73*reloadWeight;
    }
    seatReflex(this.gunRig,key,this.aim);
    shoulderIron(this.gunRig,key,this.aim);
    const inspectAge=key==='knife'&&this.meleeAge<knifeAttackDuration(knifeSkin)?Infinity:view.inspectAge;
    if(key==='knife'){
      poseHeldKnife(this.gunRig,weapon,knifeSkin,t-this.knifeEquippedAt,inspectAge,
        this.meleeAge,this.meleeSide,this.bob,sway,this.lookSwayX);
    }
    const inspection=inspectionPose(key==='knife'?knifeSkin:key,inspectAge);
    applyInspection(this.gunRig,inspection);
    poseHeldSleeves(weapon,key,inspection?.weight,inspection?.freeHand);
    this.reflexActive=Boolean(canAim(focus,true)&&!inspection&&reflexEngaged(key,this.aim));
    projectReflexDot(this.reflexDot,weapon.userData.window,this.reflexActive,this.gunCamera,this.canvas.clientHeight||this.res.h);
    this.barrelTip.position.set(fit.muzzleX??0,fit.muzzleY,fit.muzzle);
    if(key==='knife'||this.flashTime<=0)this.flash.visible=false;
    this.ring.material.opacity=game.phase==='overtime'?.70+.19*Math.sin(t*5):.32;
    this.ring.material.color.setHex(game.phase==='overtime'&&game.capture?.team!==null?teamLights[game.capture?.team]||0xffdf78:0xffd77b);
    cam.updateMatrixWorld();this.barrelTip.getWorldPosition(this.viewMuzzle);
    // Transform a position AND its bore tangent through the two camera lenses.
    const lens=Math.tan(cam.fov*PI/360)/Math.tan(this.gunCamera.fov*PI/360);
    this.viewMuzzle.x*=lens;this.viewMuzzle.y*=lens;this.viewMuzzle.applyQuaternion(cam.quaternion).add(cam.position);
    this.viewForward.copy(forwardAxis).transformDirection(this.barrelTip.matrixWorld);
    this.viewForward.x*=lens;this.viewForward.y*=lens;this.viewForward.applyQuaternion(cam.quaternion).normalize();
    if(first||!focus.alive||view.quality==='low')this.cases.clear();
    if(focus.alive&&view.quality!=='low'){
      for(const {event,mine} of this.shotsThisFrame)if(mine&&event.weapon===key)this.cases.queue(event,t);
      this.cases.frame(key,weapon,cam,lens,t,shotDt);
    }
    this.renderShots(game,focus,cam);
    this.shotTrails.draw(cam,this.res.h);
    this.gl.clear();this.gl.render(this.scene,cam);
    this.gl.clearDepth();
    // High magnification is a clear center view; the DOM crosshair remains visible.
    if(!this.scopeActive)this.gl.render(this.gunScene,this.gunCamera);
  }
}
