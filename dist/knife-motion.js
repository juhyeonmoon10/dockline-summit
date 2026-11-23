import { KNIFE_TIMING } from './knife-types.js';

const rest=Object.freeze({x:0,y:0,z:0,rx:0,ry:0,rz:0,turn:0,grip:0});
const clamp01=x=>Math.min(1,Math.max(0,x));
const ease=x=>{const t=clamp01(x);return t*t*(3-2*t);};
// Camera-space translation and rotation deltas; the last two optional columns
// are the index ring's unwrapped angle and the release of the other fingers.
function sample(keys,age){
  if(!(age>=0&&age<keys.at(-1)[0]))return rest;
  let i=1;while(age>keys[i][0])i++;
  const a=keys[i-1],b=keys[i],f=ease((age-a[0])/(b[0]-a[0]));
  const lerp=k=>(a[k]||0)+((b[k]||0)-(a[k]||0))*f;
  return {x:lerp(1),y:lerp(2),z:lerp(3),rx:lerp(4),ry:lerp(5),rz:lerp(6),turn:lerp(7),grip:lerp(8)};
}

const hookDraw=[
  [0,.089,-.213,.027,-.47,-.37,-.71,-3.71,.75],
  [.068,.060,-.084,-.021,-.32,-.21,-.39,-2.91,.94],
  [.126,.002,.020,-.047,.19,.22,.22,-1.18,.87],
  [KNIFE_TIMING.karambit.drawCatch,-.010,.014,-.016,.11,.12,.12,.082,.08],
  [.234,.004,-.005,.003,-.038,-.025,-.035,-.036,0],
  [KNIFE_TIMING.karambit.draw,0,0,0,0,0,0]
];
const butterflyDraw=[
  [0,.087,-.198,.045,-.46,-.37,-.70,0,.42],
  [.069,.060,-.074,-.037,.06,-.15,-.36,0,.64],
  [KNIFE_TIMING.balisong.drawBeat,-.025,.032,-.068,.25,.22,.24,0,.73],
  [.187,-.019,.012,-.052,.11,.14,.14,0,.65],
  [.242,.014,-.016,-.020,-.13,-.19,-.17,0,.49],
  [KNIFE_TIMING.balisong.drawCatch,.018,-.003,.002,-.045,-.07,-.10,0,.04],
  [.333,-.004,.008,-.005,.044,.02,.041,0,.08],
  [KNIFE_TIMING.balisong.draw,0,0,0,0,0,0]
];
export const knifeDrawPose=(skin,age)=>sample(skin==='balisong'?butterflyDraw:hookDraw,age);

const start=[0,0,0,0,0,0,0];
// Each pair has its own anticipation, crossing line and short recoil. Contact
// is the third key, exactly when the simulation resolves the melee event.
const hooks=[
  [start,[.036,.057,.036,.001,-.16,-.30,-.55],[.100,-.252,.005,-.139,.31,.67,1.44],
    [.145,-.281,-.017,-.088,.23,.43,1.29],[.218,-.079,-.037,-.024,-.07,.13,.43],
    [.286,.012,.008,.006,.03,-.04,-.085],[.34,0,0,0,0,0,0]],
  [start,[.041,-.145,-.057,-.047,-.17,.28,.77],[.100,.037,.080,-.133,.55,-.49,-1.08],
    [.140,.068,.065,-.088,.41,-.60,-1.25],[.215,.042,-.016,-.023,-.02,-.22,-.39],
    [.289,-.009,.009,0,.029,.036,.065],[.34,0,0,0,0,0,0]]
];
const butterflies=[
  [start,[.034,.035,.035,-.028,-.16,-.27,-.19],[.100,-.202,.043,-.175,.52,.37,.91],
    [.151,-.224,.080,-.119,.42,.39,1.20],[.246,-.065,.007,-.037,.05,.12,.49],
    [.316,.012,-.011,.002,-.055,-.04,-.10],[.38,0,0,0,0,0,0]],
  [start,[.037,-.090,.048,-.024,.23,.17,.53],[.100,-.056,-.048,-.197,-.17,-.56,-1.11],
    [.150,.067,.016,-.130,-.16,-.51,-1.23],[.238,.042,.017,-.057,-.08,-.17,-.37],
    [.307,-.009,.004,.002,.044,.035,.073],[.38,0,0,0,0,0,0]]
];
export const knifeAttackDuration=skin=>skin==='balisong'?.38:.34;
// The sampled operator clip reaches full extension at phase .56.
export function knifeClipPhase(age,skin){
  const contact=.10,end=knifeAttackDuration(skin);
  return clamp01(age<contact?.56*age/contact:.56+.44*(age-contact)/(end-contact));
}
export function knifePose(age,side=1,skin='karambit'){
  const pair=skin==='balisong'?butterflies:hooks;
  return sample(pair[side<0?1:0],age);
}
