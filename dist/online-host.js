import { createGame, stepGame } from './sim.js';
import { gameSnapshot } from './game-snapshot.js';

const primary = new Set(['rifle', 'shotgun', 'sniper']);
const fail = message => { throw new Error(message); };
const cleanName = name => String(name || '').replace(/[<>\u0000-\u001F\u007F]/g, '').trim().slice(0, 16) || '플레이어';
function sanitizedInput(input) {
  const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0;
  return {
    forward:number(input.forward,-1,1), strafe:number(input.strafe,-1,1),
    yaw:number(input.yaw,-1e6,1e6), pitch:number(input.pitch,-Math.PI/2,Math.PI/2),
    fire:input.fire===true, reload:input.reload===true, jump:input.jump===true,
    slide:input.slide===true, ads:input.ads===true, slot:input.slot===3?3:input.slot===2?2:1,
    ...(primary.has(input.weapon)?{weapon:input.weapon}:{})
  };
}

// Transport assigns player IDs. Only inputs and lobby requests cross the connection;
// this host owns all movement, ammunition, hits and match transitions.
export class OnlineHost {
  constructor({code,size,hostId,name,weapon,onRoom,onGame,now=()=>performance.now()}) {
    if(![2,3].includes(size))fail('팀 인원은 2명 또는 3명입니다.');
    if(typeof hostId!=='string'||!hostId)fail('방장 연결을 확인해 주세요.');
    this.state={code,size,hostId,phase:'lobby',players:[],needed:size*2};
    this.members=new Map();this.game=null;this.closed=false;this.broadcastTime=0;
    this.onRoom=onRoom;this.onGame=onGame;this.now=now;
    this.join(hostId,{name,weapon});
  }
  get room(){return structuredClone(this.state);}
  roomUpdate(){this.onRoom?.(this.room);}
  gameUpdate(){if(this.game)this.onGame?.(structuredClone(gameSnapshot(this.game)));}
  join(id,fields={}) {
    if(this.closed)fail('방이 닫혔습니다.');
    if(this.state.phase!=='lobby')fail('경기 중인 방입니다. 다음 경기를 기다려 주세요.');
    if(typeof id!=='string'||!id||this.members.has(id))fail('이미 참가한 연결입니다.');
    if(!fields||typeof fields!=='object'||Array.isArray(fields))fail('잘못된 요청입니다.');
    if(this.state.players.length>=this.state.needed)fail('방이 가득 찼습니다.');
    const counts=[0,0];this.state.players.forEach(p=>counts[p.team]++);
    const player={id,name:cleanName(fields.name),weapon:primary.has(fields.weapon)?fields.weapon:'rifle',
      team:counts[0]<=counts[1]?0:1,bot:false,ready:id===this.state.hostId};
    this.state.players.push(player);
    this.members.set(id,{player,lastInput:{},lastInputAt:-Infinity,seq:-1});
    this.roomUpdate();return this.room;
  }
  remove(id) {
    if(!this.members.has(id))return;
    if(id===this.state.hostId){this.destroy();return;}
    const member=this.members.get(id);this.members.delete(id);
    if(this.state.phase==='lobby')this.state.players=this.state.players.filter(p=>p.id!==id);
    else {
      member.player.bot=true;
      const avatar=this.game?.players.find(p=>p.id===id);if(avatar)avatar.bot=true;
    }
    this.roomUpdate();
  }
  action(id,action,body={}) {
    if(this.closed)fail('방이 닫혔습니다.');
    const member=this.members.get(id);if(!member)fail('방 연결이 만료됐습니다.');
    if(!body||typeof body!=='object'||Array.isArray(body))fail('잘못된 요청입니다.');
    const {player}=member,room=this.state,host=id===room.hostId;
    if(action==='input') {
      if(room.phase==='playing'&&Number.isSafeInteger(body.seq)&&body.seq>member.seq&&
          body.input&&typeof body.input==='object'&&!Array.isArray(body.input)) {
        member.seq=body.seq;member.lastInput=sanitizedInput(body.input);member.lastInputAt=this.now();
      }
      return null;
    }
    if(action==='leave'){this.remove(id);return null;}
    if(action==='start') {
      if(!host)fail('방장만 경기를 시작할 수 있습니다.');
      if(room.phase!=='lobby')fail('이미 경기가 시작됐습니다.');
      if(room.players.some(p=>!p.ready))fail('다른 참가자가 준비를 누르면 시작할 수 있습니다.');
      if(room.players.length!==room.needed&&body.fillBots!==true)fail('자리가 남았습니다. 참가자를 기다리거나 봇을 선택해 주세요.');
      for(let team=0;team<2;team++) {
        const count=room.players.filter(p=>p.team===team).length;
        for(let seat=count;seat<room.size;seat++)room.players.push({id:'bot-'+team+'-'+seat,
          name:['봇 리프','봇 루크','봇 코브'][seat],team,bot:true,ready:true,weapon:['rifle','shotgun','sniper'][seat]});
      }
      this.game=createGame({size:room.size,players:room.players.map(p=>({...p}))});room.phase='playing';
      this.broadcastTime=0;
      for(const m of this.members.values()){m.lastInput={};m.lastInputAt=-Infinity;}
      this.roomUpdate();this.gameUpdate();return this.room;
    }
    if(action==='lobby') {
      if(!host)fail('방장만 다시 시작할 수 있습니다.');
      if(room.phase!=='end')fail('경기 종료 후 이용할 수 있습니다.');
      room.phase='lobby';this.game=null;room.players=room.players.filter(p=>!p.bot);
      for(const m of this.members.values())m.player.ready=m.player.id===room.hostId;
    } else if(['ready','weapon','team'].includes(action)) {
      if(room.phase!=='lobby')fail('대기실에서만 변경할 수 있습니다.');
      if(action==='ready')player.ready=body.ready===true||host;
      if(action==='weapon') {
        if(!primary.has(body.weapon))fail('무기를 다시 선택해 주세요.');
        player.weapon=body.weapon;
      }
      if(action==='team'&&body.team!==player.team) {
        if(![0,1].includes(body.team))fail('팀을 다시 선택해 주세요.');
        if(room.players.filter(p=>p.team===body.team).length>=room.size)fail('팀에 빈자리가 없습니다.');
        player.team=body.team;player.ready=host;
      }
    } else fail('요청한 기능을 찾을 수 없습니다.');
    this.roomUpdate();return this.room;
  }
  tick(dt,wall=this.now()) {
    if(this.closed||this.state.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(.1,dt);
    const inputs=Object.create(null);
    for(const [id,member] of this.members) {
      if(wall-member.lastInputAt<350)inputs[id]=member.lastInput;
      else if(typeof member.lastInput.yaw==='number') {
        const {yaw,pitch,slot}=member.lastInput;inputs[id]={yaw,pitch,slot};
      }
    }
    stepGame(this.game,inputs,dt);this.broadcastTime+=dt;
    const finished=this.game.phase==='end';
    if(this.broadcastTime>=.05-1e-8||finished){this.broadcastTime=0;this.gameUpdate();}
    if(finished){this.state.phase='end';this.roomUpdate();}
  }
  destroy(){this.closed=true;this.members.clear();this.game=null;this.onRoom=this.onGame=null;}
}
