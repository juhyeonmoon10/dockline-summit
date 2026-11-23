import { RELOAD_CONTACT, SHOT_MECHANIC, SNIPER_RELOAD_CONTACT } from './weapon-view.js';
import { foleyUrl, unpackFoley, reloadClips } from './weapon-foley.js';

const shotVolumes={
  rifle:.74,pistol:.64,shotgun:.88,sniper:.94,smg:.62,burst:.69,marksman:.80,lmg:.78,
};
const footfalls=['stepA','stepB','land'];
const alternateShots=new Set(['rifle','smg','burst','lmg']);
const recordedClips={foley:foleyUrl};
for(const weapon of Object.keys(shotVolumes))recordedClips[weapon]='./assets/audio/shots/'+weapon+'.wav';
for(const weapon of alternateShots)recordedClips[weapon+'-2']='./assets/audio/shots/'+weapon+'-2.wav';
for(const step of footfalls)recordedClips[step]='./assets/audio/steps/'+step+'.ogg';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function mono(buffer){
  const data=new Float32Array(buffer.length);
  for(let c=0;c<buffer.numberOfChannels;c++){
    const channel=buffer.getChannelData(c);
    for(let i=0;i<data.length;i++)data[i]+=channel[i]/buffer.numberOfChannels;
  }
  return data;
}
function footstepBuffer(ctx,source){
  const data=mono(source),rate=source.sampleRate,count=data.length;
  const buffer=ctx.createBuffer(1,count,rate),out=buffer.getChannelData(0);
  let peak=0;
  for(const value of data)peak=Math.max(peak,Math.abs(value));
  const gain=Math.min(2,.65/(peak||1));
  for(let i=0;i<count;i++)out[i]=data[i]*gain*Math.min(1,i/(rate*.002),(count-1-i)/(rate*.012));
  return buffer;
}

// Knife and impact feedback are generated locally and use no weapon recordings.
function meleeBuffer(ctx,kind){
  const swing=kind==='bladeSwing',wall=kind==='bladeWall',duration=swing?.17:wall?.12:.10;
  const rate=ctx.sampleRate,buffer=ctx.createBuffer(1,Math.ceil(rate*duration),rate),data=buffer.getChannelData(0);
  let seed=83921,low=0,previous=0,high=0,phase=0,peak=0;
  const hp=Math.exp(-2*Math.PI*(swing?480:140)/rate);
  for(let i=0;i<data.length;i++){
    const t=i/rate,u=t/duration;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;
    high=hp*(high+noise-previous);previous=noise;
    const cutoff=swing?2900-1900*u:wall?4200:1100;
    low+=(high-low)*(1-Math.exp(-2*Math.PI*cutoff/rate));
    const envelope=swing?Math.pow(Math.sin(Math.PI*u),1.8):Math.exp(-t/.024)*(1-Math.exp(-t/.001));
    phase+=2*Math.PI*(wall?540:170*Math.exp(-t/.045))/rate;
    const body=swing?0:Math.sin(phase)*.40+(wall?Math.sin(2*Math.PI*2380*t)*Math.exp(-t/.03)*.10:0);
    data[i]=(low+body)*envelope*Math.min(1,(duration-t)/.012);
    peak=Math.max(peak,Math.abs(data[i]));
  }
  if(peak>0)for(let i=0;i<data.length;i++)data[i]*=.65/peak;
  return buffer;
}

export class ArenaSound {
  constructor(){
    this._enabled=true;this.ctx=null;this.ready=null;this.loaded=false;
    this.buffers=new Map();this.stepsFor=new Map();this.voices=new Set();this.pending=[];
    this.downloads=new Map();this.takes=new Map();this.retryAt=0;
  }
  get enabled(){return this._enabled;}
  set enabled(value){this.setEnabled(value);}
  setEnabled(value){
    this._enabled=!!value;
    if(this.master)this.master.gain.setTargetAtTime(this._enabled?.78:0,this.ctx.currentTime,.004);
    if(!this._enabled)this.clear();
  }
  // Fetch in the lobby. Decoding and playback use the context unlocked by the player.
  preload(){
    if(!this.enabled)return;
    for(const [id,path] of Object.entries(recordedClips)){
      if(this.hasRecording(id)||this.downloads.has(id))continue;
      const request=fetch(new URL(path,import.meta.url)).then(response=>{
        if(!response.ok)throw Error('HTTP '+response.status);
        return response.arrayBuffer();
      }).catch(error=>{
        this.downloads.delete(id);console.warn('효과음 다운로드 실패',id,error);return null;
      });
      this.downloads.set(id,request);
    }
  }
  hasRecording(id){
    return this.buffers.has(id==='foley'?'shell':id);
  }
  unlock(){
    if(!this.enabled)return Promise.resolve();
    try{
      if(!this.ctx){
        const Ctx=window.AudioContext||window.webkitAudioContext;this.ctx=new Ctx();
        const ctx=this.ctx,bus=ctx.createDynamicsCompressor(),master=ctx.createGain(),ceiling=ctx.createWaveShaper();
        bus.threshold.value=-10;bus.knee.value=6;bus.ratio.value=10;bus.attack.value=.003;bus.release.value=.09;
        // A final soft ceiling catches simultaneous reports before the master volume.
        const curve=new Float32Array(2049);
        for(let i=0;i<curve.length;i++){
          const x=i/(curve.length-1)*2-1,a=Math.abs(x);
          curve[i]=Math.sign(x)*(a<=.75?a:.75+.20*Math.tanh((a-.75)/.20));
        }
        ceiling.curve=curve;master.gain.value=.78;
        bus.connect(ceiling);ceiling.connect(master);master.connect(ctx.destination);
        this.bus=bus;this.master=master;
        for(const kind of ['bladeSwing','bladeHit','bladeWall'])this.buffers.set(kind,meleeBuffer(ctx,kind));
      }
      const resume=this.ctx.state==='suspended'?this.ctx.resume().catch(()=>{}):Promise.resolve();
      if(!this.ready||this.retryAt&&performance.now()>=this.retryAt){
        this.retryAt=0;
        this.ready=this.loadSamples(this.ctx).then(()=>{
          this.loaded=true;
          if(Object.keys(recordedClips).some(id=>!this.hasRecording(id)))this.retryAt=performance.now()+2000;
        });
      }
      return Promise.all([this.ready,resume]).then(()=>this.flushPending());
    }catch{return Promise.resolve();}
  }
  async loadSamples(ctx){
    this.preload();
    await Promise.all(Array.from(this.downloads,async ([id,request])=>{
      try{
        const bytes=await request;
        if(!bytes)return;
        const decoded=await ctx.decodeAudioData(bytes);
        if(id==='foley'){
          for(const [cue,buffer] of unpackFoley(ctx,decoded))this.buffers.set(cue,buffer);
        }else this.buffers.set(id,footfalls.includes(id)?footstepBuffer(ctx,decoded):decoded);
        this.flushPending();
      }catch(error){console.warn('효과음 해석 실패',id,error);}
      finally{this.downloads.delete(id);}
    }));
  }
  canPlay(event){
    if(this.ctx?.state!=='running')return false;
    if(event.type==='shot')return this.buffers.has(event.weapon);
    if(event.type==='reload'){
      if(event.weapon==='shotgun')return this.buffers.has('shell');
      const sounds=reloadClips(event.weapon);
      return this.buffers.has(sounds.out)&&this.buffers.has(sounds.seat);
    }
    return true;
  }
  flushPending(){
    if(!this.enabled||!this.pending.length)return;
    const waiting=[],now=performance.now();
    for(const cue of this.pending){
      const age=(now-cue.at)/1000;
      if(age>.35)continue;
      // Keep a queued hit confirmation behind the shot that produced it.
      if(!this.canPlay(cue.event)||waiting.some(previous=>previous.event.actor===cue.event.actor)){
        waiting.push(cue);continue;
      }
      const actor=cue.event.type==='reload'?{...cue.actor,reload:Math.max(0,cue.actor.reload-age)}:cue.actor;
      this.playEvent(cue.event,actor,cue.view);
    }
    this.pending=waiting;
  }
  stop(voice){
    const now=this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.002);
    try{voice.source.stop(now+.008);}catch{}
    this.voices.delete(voice);
  }
  clear(){this.pending.length=0;this.stepsFor.clear();this.takes.clear();for(const voice of this.voices)this.stop(voice);}
  connected(source,volume,pan,delay=0,options={}){
    const ctx=this.ctx;if(!this.enabled||ctx?.state!=='running')return;
    const priority=options.priority||1;
    if(this.voices.size>=32){
      let oldest;
      for(const voice of this.voices)if(!oldest||voice.priority<oldest.priority)oldest=voice;
      if(oldest.priority>priority)return;
      this.stop(oldest);
    }
    const gain=ctx.createGain(),nodes=[source,gain];gain.gain.value=volume;source.connect(gain);
    let tail=gain;
    if(options.lowpass){
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=options.lowpass;filter.Q.value=.5;
      tail.connect(filter);tail=filter;nodes.push(filter);
    }
    if(ctx.createStereoPanner){
      const stereo=ctx.createStereoPanner();stereo.pan.value=clamp(pan,-.96,.96);
      tail.connect(stereo);tail=stereo;nodes.push(stereo);
    }
    tail.connect(this.bus);
    const at=ctx.currentTime+delay;
    const voice={source,gain,priority,actor:options.actor,weapon:options.weapon,reload:options.reload,mechanic:options.mechanic,reloadEnd:options.reloadEnd,at};
    this.voices.add(voice);
    source.onended=()=>{this.voices.delete(voice);for(const node of nodes)node.disconnect();};
    source.start(at);return gain;
  }
  sample(id,volume=.5,pan=0,speed=1,delay=0,options={}){
    const ctx=this.ctx,buffer=this.buffers.get(id);
    if(!this.enabled||ctx?.state!=='running'||!buffer||!Number.isFinite(volume)||volume<.008)return;
    const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=clamp(speed,.5,2);
    return this.connected(source,volume,pan,delay,options);
  }
  note(f1,f2,dur,volume=.075,delay=0){
    const ctx=this.ctx;if(!this.enabled||ctx?.state!=='running')return;
    const source=ctx.createOscillator(),at=ctx.currentTime+delay;source.type='sine';
    source.frequency.setValueAtTime(f1,at);source.frequency.exponentialRampToValueAtTime(f2,at+dur);
    const gain=this.connected(source,.0001,0,delay,{priority:4});if(!gain)return;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.003);
    gain.gain.exponentialRampToValueAtTime(.0001,at+dur);source.stop(at+dur+.015);
  }
  relative(a,p){
    const dx=a.x-p.x,dz=a.z-p.z,dist=Math.hypot(dx,dz);
    return {dist,pan:clamp((dx*Math.cos(p.yaw)+dz*Math.sin(p.yaw))/(dist||1),-.94,.94)};
  }
  event(event,game,view){
    if(!view||!this.enabled)return;const actor=game.players.find(p=>p.id===event.actor);if(!actor)return;
    if(event.type==='shot'||event.type==='reload'){
      this.pending=this.pending.filter(c=>!(c.event.actor===event.actor&&c.event.type==='reload'));
    }
    if(this.pending.length||!this.canPlay(event)){
      if(this.pending.length>=8)this.pending.shift();
      this.pending.push({event:{...event},actor:{...actor},view:{...view},at:performance.now()});
      this.flushPending();return;
    }
    this.playEvent(event,actor,view);
  }
  playEvent(event,actor,view){
    const own=actor.id===view.id;
    const origin=['shot','melee','meleeImpact'].includes(event.type)&&Number.isFinite(event.x)&&Number.isFinite(event.z)?event:actor;
    const {dist,pan}=this.relative(origin,view),attenuation=own?1:.65/(1+(dist/9)**1.35),position=own?0:pan;
    const options={priority:own?3:2,lowpass:own?0:Math.max(1800,16000/(1+dist*.12))};
    if(event.type==='melee')this.sample('bladeSwing',.34*attenuation,position,.96+(event.seq%3)*.04,0,options);
    if(event.type==='meleeImpact')this.sample(event.target?'bladeHit':'bladeWall',.44*attenuation,position,.98+(event.seq%3)*.025,0,options);
    if(event.type==='shot'&&Object.hasOwn(shotVolumes,event.weapon)){
      const weapon=event.weapon,delay=own?0:Math.min(.12,dist/343);
      let take=weapon;
      if(alternateShots.has(weapon)){
        const key=actor.id+'|'+weapon,second=this.takes.get(key)&&this.buffers.has(weapon+'-2');
        if(second)take=weapon+'-2';
        this.takes.set(key,!second);
      }
      this.sample(take,shotVolumes[weapon]*attenuation,position,1,delay,options);
      // Do not leave a queued reload or previous cycle behind a new shot.
      for(const voice of this.voices)if(voice.actor===actor.id&&(voice.reload||voice.mechanic))this.stop(voice);
      const cycle=SHOT_MECHANIC[event.weapon];
      if(cycle&&actor.alive&&actor.active===event.weapon){
        const mechanicOptions={...options,priority:own?2:1,mechanic:true,actor:actor.id,weapon:event.weapon};
        const pump=event.weapon==='shotgun';
        this.sample(pump?'pumpOpen':'boltOpen',(pump?.44:.40)*attenuation,position,1,delay+cycle.open,mechanicOptions);
        this.sample(pump?'pumpClose':'boltClose',(pump?.49:.45)*attenuation,position,1,delay+cycle.close,mechanicOptions);
      }
    }
    if(event.type==='hit'&&own)this.note(event.headshot?1350:840,event.headshot?1760:1060,.035,.07);
    if(event.type==='kill'&&own){this.note(540,810,.09,.07);this.note(830,1010,.11,.09,.07);}
    if(event.type==='reload'){
      for(const voice of this.voices)if((voice.reload||voice.mechanic)&&voice.actor===actor.id)this.stop(voice);
      if(!actor.alive||actor.active!==event.weapon||!(actor.reload>0))return;
      const reloadOptions={...options,priority:own?2:1,reload:true,actor:actor.id,weapon:event.weapon,reloadEnd:this.ctx.currentTime+actor.reload};
      const duration=actor.reloadDuration||actor.reload;
      const cue=(sample,phase,level)=>{
        const when=actor.reload-duration*(1-phase);
        if(when>=-.035)this.sample(sample,level*attenuation,position,1,Math.max(0,when),reloadOptions);
      };
      if(event.weapon==='shotgun')cue(actor.ammo%2?'shellAlt':'shell',RELOAD_CONTACT.shell,.51);
      else{
        const names=reloadClips(event.weapon),sniper=event.weapon==='sniper';
        const contacts=sniper?SNIPER_RELOAD_CONTACT:RELOAD_CONTACT;
        cue(names.out,contacts.release,.42);
        cue(names.seat,contacts.seat,.53);
        if(names.settle)cue(names.settle,contacts.settle,event.weapon==='lmg'?.36:.28);
        if(sniper&&actor.ammo===0)cue('boltClose',SNIPER_RELOAD_CONTACT.empty,.44);
      }
    }
  }
  reconcile(game){
    if(this.pending.length){
      this.pending=this.pending.filter(cue=>{
        const actor=game.players.find(p=>p.id===cue.event.actor);
        const holding=actor?.alive&&actor.active===cue.event.weapon;
        if(cue.event.type==='shot'&&!holding)cue.actor.alive=false;
        return cue.event.type!=='reload'||(holding&&actor.reload>0);
      });
    }
    for(const voice of this.voices)if(voice.reload||voice.mechanic){
      const actor=game.players.find(p=>p.id===voice.actor);
      // Natural completion may leave a few milliseconds of contact decay.
      // Early cancellation, death or an equip change must silence it instead.
      const canceled=voice.reload&&actor?.reload<=0&&this.ctx.currentTime<voice.reloadEnd-.08;
      if(!actor?.alive||actor.active!==voice.weapon||canceled)this.stop(voice);
    }
  }
  steps(game,view,t){
    if(!view||!this.enabled)return;
    for(const p of game.players){
      let s=this.stepsFor.get(p.id);if(!s){s={at:t+.12,flip:false,air:false};this.stepsFor.set(p.id,s);}
      if(!p.alive)continue;
      const own=p.id===view.id,{dist,pan}=this.relative(p,view),gain=own?.13:.18/(1+.23*dist);
      if(!p.grounded){s.air=true;continue;}
      if(s.air){s.air=false;s.at=t+.18;this.sample('land',gain*.85,own?0:pan);}
      if(t<s.at||p.speed<1.7||dist>17)continue;
      s.at=t+(p.slide>0?.48:Math.max(.23,1.8/p.speed));s.flip=!s.flip;
      this.sample(s.flip?'stepA':'stepB',gain*(p.slide>0?.65:1),own?0:pan,(p.slide>0?.77:1)+Math.random()*.06);
    }
  }
  chime(win=true){this.note(win?410:282,win?580:220,.15,.065);this.note(win?686:218,win?855:170,.22,.065,.14);}
}
