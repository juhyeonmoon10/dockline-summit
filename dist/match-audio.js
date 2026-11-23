import { RELOAD_CONTACT, SHOT_MECHANIC, SNIPER_RELOAD_CONTACT } from './weapon-view.js';
import { foleyUrl, unpackFoley, reloadClips } from './weapon-foley.js';
import { prepareShot, prepareAction, makeHandlingFoley } from './weapon-sound.js';
import { inspectDuration } from './view-inspect.js';

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

export class ArenaSound {
  constructor(){
    this._enabled=true;this.ctx=null;this.ready=null;this.loaded=false;
    this.buffers=new Map();this.stepsFor=new Map();this.voices=new Set();this.pending=[];
    this.downloads=new Map();this.takes=new Map();this.retryAt=0;
    this.held=null;this.inspectClock=null;this.nextPositionUpdate=0;
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
        const Ctx=window.AudioContext||window.webkitAudioContext;this.ctx=new Ctx({latencyHint:'interactive'});
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
        for(const [kind,sound] of makeHandlingFoley(ctx))this.buffers.set(kind,sound);
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
          const actions=unpackFoley(ctx,decoded);
          for(const [cue,buffer] of actions)this.buffers.set(cue,buffer);
          for(const weapon of Object.keys(shotVolumes)){
            const cues=weapon==='shotgun'?['shell','shellAlt','pumpOpen','pumpClose']:Object.values(reloadClips(weapon));
            if(weapon==='sniper')cues.push('boltOpen','boltClose');
            for(const cue of cues)this.buffers.set(cue+'@'+weapon,prepareAction(ctx,actions.get(cue),weapon,cue));
          }
        }else if(footfalls.includes(id))this.buffers.set(id,footstepBuffer(ctx,decoded));
        else{
          const report=prepareShot(ctx,decoded,id.replace(/-2$/,''));
          this.buffers.set(id,report.mono);this.buffers.set(id+'@near',report.near);
        }
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
  clear(){this.pending.length=0;this.stepsFor.clear();this.takes.clear();this.held=null;this.inspectClock=null;this.nextPositionUpdate=0;for(const voice of this.voices)this.stop(voice);}
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
    let stereo;
    if(ctx.createStereoPanner){
      stereo=ctx.createStereoPanner();stereo.pan.value=clamp(pan,-.96,.96);
      tail.connect(stereo);tail=stereo;nodes.push(stereo);
    }
    tail.connect(this.bus);
    const at=ctx.currentTime+delay;
    const voice={source,gain,priority,actor:options.actor,weapon:options.weapon,reload:options.reload,mechanic:options.mechanic,
      reloadEnd:options.reloadEnd,handling:options.handling,viewId:options.viewId,baseGain:volume/(options.attenuation||1),stereo,at};
    this.voices.add(voice);
    source.onended=()=>{this.voices.delete(voice);for(const node of nodes)node.disconnect();};
    source.start(at);return gain;
  }
  sample(id,volume=.5,pan=0,speed=1,delay=0,options={}){
    const ctx=this.ctx,key=options.nearReport?id+'@near':options.weapon?id+'@'+options.weapon:id;
    const buffer=this.buffers.get(key)||this.buffers.get(id);
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
  cancelHandling(){
    for(const voice of this.voices)if(voice.handling)this.stop(voice);
    this.inspectClock=null;
  }
  handling(actor,inspectAge,t){
    if(!actor?.alive||!this.enabled||this.ctx?.state!=='running'){
      if(this.held){this.cancelHandling();this.held=null;}return;
    }
    const weapon=actor.active,item=weapon==='knife'?(actor.knifeSkin==='balisong'?'balisong':'karambit'):weapon;
    const changed=!this.held||this.held.actor!==actor.id||this.held.item!==item;
    const inspect=Number.isFinite(inspectAge)&&!actor.reload&&!actor.slide&&!actor.ads;
    const started=inspect?t-inspectAge:null;
    const events=(kind,cues,age=0)=>{
      for(const [delay,id,gain,pitch=1,pan=0] of cues){
        if(delay<age-.045)continue;
        this.sample(id,gain,pan,pitch,Math.max(0,delay-age),{actor:actor.id,weapon,priority:2,handling:kind});
      }
    };
    if(changed){
      this.cancelHandling();this.held={actor:actor.id,item};
      if(!inspect&&!actor.reload){
        if(item==='balisong')events('draw',[[0,'gloveShift',.17],[.115,'hingeFlick',.19,1.06,.07],[.49,'hingeCatch',.32,1.02,.06]]);
        else if(item==='karambit')events('draw',[[.015,'ringSlip',.19,1.03,.06],[.17,'gripSet',.23,.96,.08]]);
        else events('draw',[[0,'gloveShift',.17],[weapon==='pistol'?.12:.26,'gripSet',weapon==='lmg'?.24:.17,weapon==='pistol'?1.16:.94,.08]]);
      }
    }
    if(!inspect){
      if(this.inspectClock!==null)this.cancelHandling();
      return;
    }
    if(this.inspectClock!==null&&Math.abs(started-this.inspectClock)<.018)return;
    this.cancelHandling();this.inspectClock=started;
    if(item==='balisong'){
      events('inspect',[[.10,'gloveShift',.12],[.55,'hingeFlick',.15,1.09,.06],[1.50,'hingeCatch',.29,.95,-.08],
        [1.94,'hingeFlick',.18,.98,-.04],[2.68,'hingeCatch',.32,1.06,.08],[2.87,'gripSet',.14,.98,.08]],inspectAge);
    }else if(item==='karambit'){
      events('inspect',[[.09,'gloveShift',.14],[.42,'ringSlip',.21,1.06,-.04],[.66,'hookSwing',.10,1.17,-.07],
        [1.04,'gripSet',.22,1.08,.08],[2.62,'gloveShift',.13,.96,.06]],inspectAge);
    }else{
      const duration=inspectDuration(item);
      events('inspect',[[duration*.07,'gloveShift',.14,1.05,.06],[duration*.48,'gloveShift',.17,.86,-.06],
        [duration*.92,'gripSet',item==='lmg'?.19:.13,item==='pistol'?1.16:.98,.08]],inspectAge);
    }
  }
  event(event,game,view){
    if(!view||!this.enabled)return;const actor=game.players.find(p=>p.id===event.actor);if(!actor)return;
    if(actor.id===this.held?.actor&&['shot','reload','melee'].includes(event.type))this.cancelHandling();
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
    const origin=event.type==='meleeImpact'&&Number.isFinite(event.ex)&&Number.isFinite(event.ez)?{x:event.ex,z:event.ez}:
      ['shot','melee','meleeImpact'].includes(event.type)&&Number.isFinite(event.x)&&Number.isFinite(event.z)?event:actor;
    const {dist,pan}=this.relative(origin,view),attenuation=own?1:.65/(1+(dist/9)**1.35),position=own?0:pan;
    const options={priority:own?3:2,lowpass:own?0:Math.max(1800,16000/(1+dist*.12))};
    const propagation=own?0:Math.min(.12,dist/343),variant=(event.seq||0)%3;
    if(event.type==='melee')this.sample(actor.knifeSkin==='balisong'?'flipSwing':'hookSwing',.35*attenuation,position,.96+variant*.04,propagation,options);
    if(event.type==='meleeImpact')this.sample(event.target?'bladeHit':'bladeWall',.49*attenuation,own?pan*.28:pan,.98+variant*.025,propagation,options);
    if(event.type==='shot'&&Object.hasOwn(shotVolumes,event.weapon)){
      const weapon=event.weapon,delay=own?0:Math.min(.12,dist/343);
      let take=weapon;
      if(alternateShots.has(weapon)){
        const key=actor.id+'|'+weapon,second=this.takes.get(key)&&this.buffers.has(weapon+'-2');
        if(second)take=weapon+'-2';
        this.takes.set(key,!second);
      }
      this.sample(take,shotVolumes[weapon]*attenuation,position,1,delay,{...options,nearReport:own});
      // Do not leave a queued reload or previous cycle behind a new shot.
      for(const voice of this.voices)if(voice.actor===actor.id&&(voice.reload||voice.mechanic))this.stop(voice);
      const cycle=SHOT_MECHANIC[event.weapon];
      if(cycle&&actor.alive&&actor.active===event.weapon){
        const mechanicOptions={...options,priority:own?2:1,mechanic:true,actor:actor.id,weapon:event.weapon,viewId:own?undefined:view.id,attenuation};
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
      const reloadOptions={...options,priority:own?2:1,reload:true,actor:actor.id,weapon:event.weapon,reloadEnd:this.ctx.currentTime+actor.reload,viewId:own?undefined:view.id,attenuation};
      const duration=actor.reloadDuration||actor.reload;
      const cue=(sample,phase,level)=>{
        const when=actor.reload-duration*(1-phase);
        if(when>=-.035)this.sample(sample,level*attenuation,position,1,Math.max(0,when)+propagation,reloadOptions);
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
    const now=this.ctx?.currentTime||0,updatePositions=now>=this.nextPositionUpdate;
    if(updatePositions)this.nextPositionUpdate=now+.075;
    for(const voice of this.voices)if(voice.reload||voice.mechanic){
      const actor=game.players.find(p=>p.id===voice.actor);
      // Natural completion may leave a few milliseconds of contact decay.
      // Early cancellation, death or an equip change must silence it instead.
      const canceled=voice.reload&&actor?.reload<=0&&this.ctx.currentTime<voice.reloadEnd-.08;
      if(!actor?.alive||actor.active!==voice.weapon||canceled){this.stop(voice);continue;}
      if(updatePositions&&voice.viewId){
        const listener=game.players.find(p=>p.id===voice.viewId);
        if(!listener)continue;
        const {dist,pan}=this.relative(actor,listener);
        voice.stereo?.pan.setTargetAtTime(pan,now,.025);
        voice.gain.gain.setTargetAtTime(voice.baseGain*.65/(1+(dist/9)**1.35),now,.025);
      }
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
