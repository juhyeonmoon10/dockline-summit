// Shape the existing field recordings once after decoding. Keep a point-source
// mix for other players and a stereo pair of early reflections for first person.
// low and edge are linear shelf gains; delay is in seconds.
const profiles={
  rifle:   {low:1.24,edge:1.09,body:1.16,delay:.033,room:.135,weight:.80},
  pistol:  {low:.92, edge:1.23,body:1.07,delay:.021,room:.090,weight:.48},
  revolver:{low:1.33,edge:1.12,body:1.21,delay:.031,room:.125,weight:.74},
  shotgun: {low:1.55,edge:.99, body:1.38,delay:.042,room:.190,weight:.90},
  sniper:  {low:1.12,edge:1.17,body:.83, delay:.061,room:.175,weight:1.0},
  smg:     {low:.88, edge:1.13,body:1.06,delay:.018,room:.075,weight:.59},
  burst:   {low:1.09,edge:1.27,body:1.12,delay:.026,room:.089,weight:.71},
  marksman:{low:1.30,edge:1.13,body:1.29,delay:.048,room:.160,weight:.86},
  lmg:     {low:1.43,edge:1.01,body:1.23,delay:.035,room:.105,weight:1.15}
};
const coeff=(hz,rate)=>1-Math.exp(-2*Math.PI*hz/rate);
const limit=v=>Math.abs(v)<.78?v:Math.sign(v)*(.78+.18*Math.tanh((Math.abs(v)-.78)/.18));

export function prepareShot(ctx,source,weapon){
  const s=profiles[weapon],rate=source.sampleRate,n=source.length;
  const mono=ctx.createBuffer(1,n,rate),near=ctx.createBuffer(2,n,rate);
  const input=source.getChannelData(0),dry=mono.getChannelData(0),left=near.getChannelData(0),right=near.getChannelData(1);
  const reflected=new Float32Array(n),delay=Math.round(rate*s.delay),cross=Math.round(rate*s.delay*1.53);
  const bassK=coeff(185,rate),edgeK=coeff(3150,rate),wallK=coeff(1830,rate),dcK=coeff(35,rate);
  const attackEnd=Math.round(.014*rate),shoulder=Math.round(.045*rate);
  let bass=0,mid=0,wall=0,dc=0;
  for(let i=0;i<n;i++){
    const raw=input[i];dc+=(raw-dc)*dcK;
    const v=raw-dc;bass+=(v-bass)*bassK;mid+=(v-mid)*edgeK;
    const body=1+(s.body-1)*Math.min(1,Math.max(0,(i-attackEnd)/shoulder));
    dry[i]=limit((v+(s.low-1)*bass+(s.edge-1)*(v-mid))*body*.93);
    wall+=(dry[i]-wall)*wallK;reflected[i]=wall;
    const first=i>=delay?reflected[i-delay]*s.room:0;
    const second=i>=cross?reflected[i-cross]*s.room*.68:0;
    const last=i>=delay+cross?reflected[i-delay-cross]*s.room*.28:0;
    left[i]=limit(dry[i]+first+second*.30+last);
    right[i]=limit(dry[i]+second+first*.26+last*.75);
  }
  return {mono,near};
}

// Existing magazine/pump/bolt recordings supply the actual contacts. Adjust
// their weight and presence per prop, including shared magazine recordings.
export function prepareAction(ctx,source,weapon,cue){
  const s=profiles[weapon],rate=source.sampleRate,n=source.length,out=ctx.createBuffer(1,n,rate);
  const input=source.getChannelData(0),data=out.getChannelData(0),lowK=coeff(340,rate),highK=coeff(2800,rate);
  const latch=/seat|close|shell/i.test(cue);
  let bass=0,body=0;
  for(let i=0;i<n;i++){
    const v=input[i];bass+=(v-bass)*lowK;body+=(v-body)*highK;
    data[i]=limit(v*(latch?1.04:.96)+bass*(s.weight-.48)*(latch?.88:.47)+(v-body)*(.28-s.weight*.17));
  }
  return out;
}

// Short original Foley: filtered contact noise, glove friction, and damped
// modes from the prop's grip and metal fittings. No runtime oscillators.
const foley={
  gloveShift:{ms:160,bands:[1700,420],noise:.72,tones:[]},
  gripSet:{ms:93,bands:[1150,250],noise:.39,tones:[[156,.015,.51],[403,.011,.16]]},
  ringSlip:{ms:86,bands:[2950,760],noise:.58,tones:[[1630,.015,.032]]},
  ringCatch:{ms:87,bands:[2600,310],noise:.47,tones:[[238,.014,.37],[1194,.017,.12],[2810,.008,.051]]},
  hingeFlick:{ms:57,bands:[5100,1100],noise:.55,tones:[[2380,.007,.13],[3730,.006,.07]]},
  hingeFold:{ms:72,bands:[3400,550],noise:.48,tones:[[704,.017,.32],[1725,.012,.18],[3295,.009,.07]]},
  hingeOpen:{ms:84,bands:[5700,860],noise:.42,tones:[[1070,.023,.29],[2680,.018,.23],[4130,.011,.12]]},
  hookSwing:{ms:169,bands:[4150,460],noise:1,tones:[]},
  flipSwing:{ms:151,bands:[5450,690],noise:1,tones:[]},
  bladeHit:{ms:123,bands:[2370,215],noise:.71,tones:[[164,.019,.48],[327,.013,.17]]},
  bladeWall:{ms:195,bands:[5500,740],noise:.73,tones:[[594,.033,.24],[1810,.039,.18],[3315,.019,.13]]}
};
export function makeHandlingFoley(ctx){
  const out=new Map(),rate=ctx.sampleRate;
  for(const [name,s] of Object.entries(foley)){
    const time=s.ms/1000,n=Math.ceil(rate*time),buffer=ctx.createBuffer(1,n,rate),data=buffer.getChannelData(0);
    const swing=name.endsWith('Swing'),rub=name==='gloveShift'||name==='ringSlip',highK=coeff(s.bands[1],rate);
    let state=7949+s.ms,wide=0,lower=0,peak=0;
    for(let i=0;i<n;i++){
      const t=i/rate,u=t/time;
      state=(Math.imul(1664525,state)+1013904223)>>>0;const noise=state/2147483648-1;
      const sweep=swing?1.18-.73*u:1;
      wide+=(noise-wide)*coeff(s.bands[0]*sweep,rate);lower+=(wide-lower)*highK;
      // Air cuts crest just before the 100 ms gameplay contact. Glove cloth and
      // positive metal stops have separate, much shorter attack characteristics.
      const envelope=swing?(t<.093?(t/.093)**1.65:Math.exp(-(t-.093)/.020)):
        rub?Math.sin(Math.PI*u)**1.3:Math.exp(-t/.023)*Math.min(1,t/.0013);
      let v=(wide-lower)*s.noise*envelope;
      for(const [freq,decay,level] of s.tones){
        v+=Math.sin(2*Math.PI*freq*t)*Math.exp(-t/decay)*Math.min(1,t/.0015)*level;
      }
      data[i]=v*Math.min(1,(n-i-1)/(.009*rate));peak=Math.max(peak,Math.abs(data[i]));
    }
    const scale=.70/Math.max(peak,.01);for(let i=0;i<n;i++)data[i]*=scale;
    out.set(name,buffer);
  }
  return out;
}
