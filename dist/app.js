import { MAP, WEAPONS, createGame, stepGame, spawnYaw } from './sim.js';
import { ArenaRenderer } from './render.js';
import { LiteRenderer } from './lite.js';
import { RoomClient, supportsLAN } from './net.js';
import { ArenaSound } from './match-audio.js';

const $ = id => document.getElementById(id);
const panel = $('panel'), body = $('panelBody'), audio = new ArenaSound();
const icons = {
 play:'<path d="m7 4 12 8-12 8z" fill="currentColor" stroke="none"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/>',
 keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h.1m3 0h.1m3 0h.1m3 0h.1m3 0h.1M6 12h.1m3 0h.1m3 0h.1m3 0h.1M7 15h9"/>',
 settings:'<path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h9m4 0h3"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
 sound:'<path d="M3 9h4l5-4v14l-5-4H3zM15 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',
 mute:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6"/>',
 close:'<path d="m6 6 12 12m0-12L6 18"/>',pause:'<path d="M8 5v14m8-14v14" stroke-width="3"/>'
};
function svg(name){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';}
for(const node of document.querySelectorAll('[data-icon]'))node.innerHTML=svg(node.dataset.icon);
$('settingsBtn').innerHTML=svg('settings');$('closePanel').innerHTML=svg('close');$('pauseBtn').innerHTML=svg('pause');
function read(key,defaultValue){try{return JSON.parse(localStorage.getItem('dockline.'+key))??defaultValue;}catch{return defaultValue;}}
function save(key,value){try{localStorage.setItem('dockline.'+key,JSON.stringify(value));}catch{}}
const esc=v=>String(v??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const teamName=t=>t===0?'블루':'오렌지';
const primary=['rifle','shotgun','sniper'];
const loadoutInfo={rifle:'24발 · 중거리 연사',shotgun:'5발 · 근거리 산탄',sniper:'5발 · 장거리 정밀 사격'};
let size=read('size',2)===3?3:2, selected=primary.includes(read('weapon','rifle'))?read('weapon','rifle'):'rifle';
let sensitivity=clamp(Number(read('sensitivity',1))||1,.35,2.4),quality=read('quality','auto'),nickname=String(read('name','')).slice(0,16);
audio.enabled=read('sound',true);
let canvas=$('arena'),renderer,game=null,client=null,selfId='local',room=null,screen='home',modal='',lan=false;
let yaw=0,pitch=0,slot=1,firstFrame=true,lastEvent=0,pointerMode=false,dragX=null,dragY=null;
let roundKey='',eventFeed=[],hitTime=0,damageTime=0,pendingFire=false,heldFire=false,ads=false,paused=false;
let lastResult='',spectatorIndex=0,frameTime=performance.now(),hudStamp=0,roundFlash=0,clockStamp=0;
let prevNet=null,netAt=0,lastNotice='',noticeTimer;
let damageUntil=0,fragUntil=0;
const keys=new Set(), pressed=new Set();
function notify(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function drawSound(){const el=$('soundBtn');el.innerHTML=svg(audio.enabled?'sound':'mute');el.title=el.ariaLabel=audio.enabled?'소리 끄기':'소리 켜기';}
function setSound(){audio.enabled=!audio.enabled;save('sound',audio.enabled);drawSound();if(audio.enabled)audio.unlock();}
$('soundBtn').onclick=setSound;drawSound();
function sizeUI(){document.querySelectorAll('[data-size]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.size)===size)));}
document.querySelectorAll('[data-size]').forEach(el=>el.onclick=()=>{size=Number(el.dataset.size);save('size',size);sizeUI();});sizeUI();
function setLoadout(type){
  if(!primary.includes(type))return;
  selected=type;save('weapon',type);
  document.querySelectorAll('[data-weapon]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weapon===type)));
  $('gunDesc').textContent=loadoutInfo[type];
}
document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>setLoadout(b.dataset.weapon));
setLoadout(selected);
const canLAN=supportsLAN().then(v=>(lan=v));
function showPanel(kind,title,html){
  modal=kind;$('panelTitle').textContent=title;body.innerHTML=html;
  if(!panel.open)panel.showModal();panel.scrollTop=0;
}
function closePanel(){modal='';if(panel.open)panel.close();}
function clearInput(){keys.clear();pressed.clear();heldFire=ads=pendingFire=false;dragX=dragY=null;}
function release(){if(document.pointerLockElement)document.exitPointerLock();clearInput();}
function attemptLock(){
  if(screen!=='game'||modal)return;
  canvas.focus({preventScroll:true});
  try{const promise=canvas.requestPointerLock?.();if(promise?.catch)promise.catch(()=>{if(screen==='game'&&!modal)hintLock();});}catch{hintLock();}
}
function hintLock(){if(lastNotice!=='lock'){notify('화면을 클릭해 마우스 시점을 활성화하세요. 제한된 창에서는 누른 채 끌어도 됩니다.');lastNotice='lock';}}
function returnFromPanel(){
  if(modal==='credits')return settings();
  if(modal==='result')return goHome();
  if(modal==='room')return leaveConfirm();
  if(modal==='leave')return room?.phase==='lobby'?showRoom(room):showPause();
  if(modal==='settings'||modal==='help'){if(screen==='game')return showPause();}
  closePanel();if(screen==='game'){paused=false;attemptLock();}
}
$('closePanel').onclick=returnFromPanel;
panel.addEventListener('cancel',e=>{e.preventDefault();returnFromPanel();});
$('helpBtn').onclick=help;$('settingsBtn').onclick=settings;$('pauseBtn').onclick=showPause;
function help(){
  showPanel('help','조작 안내','<div class="keyrow"><span>이동</span><kbd>W A S D</kbd></div><div class="keyrow"><span>시점 · 발사 · 조준</span><b>마우스 이동 · 좌클릭 · 우클릭</b></div><div class="keyrow"><span>점프 · 이동 중 슬라이딩</span><kbd>Space / Shift</kbd></div><div class="keyrow"><span>재장전 · 주무기 / 권총</span><kbd>R · 1 / 2</kbd></div><div class="keyrow"><span>준비 시간에 주무기 변경</span><kbd>Q</kbd></div><div class="keyrow"><span>관전 대상 변경 · 메뉴</span><kbd>Tab / Esc</kbd></div><p>상대를 모두 잡으면 라운드 승리. 40초가 지나면 중앙의 노란 거점을 상대 없이 3초간 지키세요. 먼저 3승을 거둔 팀이 이깁니다.</p><button class="primary" id="helpDone">확인</button>');
  $('helpDone').onclick=returnFromPanel;
}
function settings(){
  showPanel('settings','게임 설정','<label class="setting">마우스 감도 <input id="sense" type="range" min="0.35" max="2.4" step="0.05"><output id="senseVal"></output></label><label class="setting">그래픽 <select id="graphics"><option value="auto">기본</option><option value="low">저사양</option></select></label><div class="setting"><span>효과음</span><button id="soundToggle" class="minor"></button></div><div class="row"><button id="settingsDone" class="primary">완료</button></div>');
  $('sense').value=sensitivity;$('senseVal').textContent=sensitivity.toFixed(2);$('sense').oninput=e=>{sensitivity=Number(e.target.value);save('sensitivity',sensitivity);$('senseVal').textContent=sensitivity.toFixed(2);};
  $('graphics').value=quality;$('graphics').onchange=e=>{quality=e.target.value;save('quality',quality);};
  const sound=$('soundToggle');sound.textContent=audio.enabled?'켜짐':'꺼짐';sound.onclick=()=>{setSound();sound.textContent=audio.enabled?'켜짐':'꺼짐';};$('settingsDone').onclick=returnFromPanel;
  const credits=document.createElement('button');credits.className='credits-link';credits.textContent='제작 자료 · 라이선스';body.append(credits);
  credits.onclick=()=>showPanel('credits','제작 자료',
    '<p>무기 모델은 <a href="https://kenney.nl/assets/blaster-kit" target="_blank" rel="noopener">Kenney · Blaster Kit</a>(CC0)를 수정했습니다.</p>'+
    '<p>봇의 표적 선택과 측면 회피는 <a href="https://github.com/Mugen87/dive/tree/7176136cf6c29eddfd620df2bf0d09a532680763" target="_blank" rel="noopener">Michael Herzog · Dive</a>(MIT)의 코드를 수정했습니다.</p>'+
    '<p>효과음은 <a href="https://github.com/DeathByDenim/openspades-free-pak/blob/1e6b28721a2e5e51f84a572d101079bf186c66d5/License/Credits-pak001-Free.md" target="_blank" rel="noopener">OpenSpades Free Pak</a>의 녹음을 사용했습니다. 산탄총은 Mike Koenig (CC BY 3.0), 달리기는 Disagree (CC BY 4.0), 나머지 녹음은 CC0입니다. 재생 시 음량·피치·좌우 위치를 조절합니다.</p>'+
    '<p class="note">파일별 저자와 원본 링크는 소스 묶음의 dist/assets에 있습니다. 무기 원본은 art-source/blasters에서 편집할 수 있습니다.</p>');
}
function enterGame(state,id){
  closePanel();screen='game';document.body.dataset.scene='game';$('hud').hidden=false;
  game=state;selfId=id;paused=false;lastEvent=0;lastResult=roundKey='';eventFeed=[];hitTime=damageTime=0;slot=1;lastNotice='';spectatorIndex=0;clearInput();
  const me=state.players.find(p=>p.id===id);yaw=me?.yaw||0;pitch=me?.pitch||0;
  audio.unlock();firstFrame=true;roundFlash=0;frameTime=performance.now();hudStamp=0;canvas.focus();
}
function practice(warmup=15){
  const state=createGame({size,players:[{id:'local',name:nickname||'나',team:0,bot:false,weapon:selected}],warmup:typeof warmup==='number'?warmup:15});
  enterGame(state,'local');attemptLock();
}
$('practiceBtn').onclick=()=>practice(15);
$('quickMatch').onclick=()=>practice(0);
function showPause(){if(screen!=='game'||game?.phase==='end')return;paused=true;clearInput();
  showPanel('pause',client?'경기 메뉴':'연습 일시정지',(client?'<p class="note">다른 참가자와 경기는 계속 진행 중입니다.</p>':'')+
    '<div class="row"><button class="primary" id="resume">계속 플레이</button></div><div class="row"><button class="secondary" id="gameControls">조작 안내</button><button class="secondary" id="gameSettings">설정</button></div><div class="row"><button class="minor" id="quit">로비로 나가기</button></div>');release();
  $('resume').onclick=()=>{closePanel();paused=false;attemptLock();};$('gameControls').onclick=help;$('gameSettings').onclick=settings;$('quit').onclick=client?leaveConfirm:goHome;
}
function leaveConfirm(){showPanel('leave','방을 나갈까요?','<p>친구들과 다시 플레이하려면 방 코드로 참가하세요.</p><div class="row"><button id="stay" class="secondary">돌아가기</button><button id="quitNow" class="primary">방 나가기</button></div>');$('stay').onclick=returnFromPanel;$('quitNow').onclick=goHome;}
function goHome(){
  const old=client;client=null;old?.leave().catch(()=>{});room=null;game=null;prevNet=null;screen='home';paused=false;closePanel();release();
  $('hud').hidden=true;document.body.dataset.scene='lobby';lastResult='';$('practiceBtn').focus({preventScroll:true});
}
function roomError(error){const node=$('netError');if(node)node.textContent=error.message||error;else notify(error.message||error);}
function spin(btn,job){const old=btn.disabled;btn.disabled=true;Promise.resolve().then(job).catch(roomError).finally(()=>{if(btn.isConnected)btn.disabled=old;});}
function newClient(){
  const c=new RoomClient({onRoom(r){if(c!==client)return;room=r;if(r.phase==='lobby'){game=null;screen='home';release();$('hud').hidden=true;document.body.dataset.scene='lobby';if(modal!=='leave')showRoom(r);}},
    onGame(next){if(c!==client)return;if(screen!=='game'||!game){prevNet=null;enterGame(next,c.id);}else{prevNet=game;game=next;}netAt=performance.now();},
    onError:m=>roomError(m),onClose:m=>{if(c!==client)return;goHome();notify(m);}});
  return c;
}
$('teamBtn').onclick=async()=>{
  await canLAN;
  if(!lan){
    showPanel('network','친구와 대전','<p>진행자 PC에서 대전 서버를 켠 뒤, 크롬북 4대 또는 6대로 같은 Wi-Fi의 경기 주소에 접속하세요.</p><ol class="note"><li>진행자 PC에서 서버 묶음을 내려받고 압축을 풉니다.</li><li>진행자 PC에 Node.js 18 이상을 설치하고 Windows에서는 <b>start-windows.cmd</b>를 실행합니다.</li><li>창에 나온 LAN 주소를 크롬북의 Chrome에서 엽니다.</li></ol><p><a class="bundle" id="serverBundle" href="./dockline-lan.zip" download>대전 서버 묶음 다운로드</a></p><div class="row"><button id="offlinePlay" class="primary">혼자 봇 연습하기</button></div>');$('offlinePlay').onclick=practice;
    if(location.protocol==='file:')$('serverBundle').replaceWith('함께 제공된 dockline-lan.zip에 팀전 서버가 들어 있습니다.');
    return;
  }
  showPanel('network','친구와 대전','<form id="roomForm"><label class="field">플레이어 이름<input type="text" maxlength="16" id="nick" placeholder="닉네임" autocomplete="off"></label><div class="row"><button type="button" class="primary" id="createRoom">'+size+'v'+size+' 방 만들기</button></div><label class="field">친구의 방 코드<input type="text" id="joinCode" placeholder="영문·숫자 4자리" maxlength="4" autocomplete="off" spellcheck="false"></label><div class="row"><button class="secondary" id="joinRoom">코드로 참가</button></div><p class="bad" id="netError" role="alert"></p></form>');
  $('nick').value=nickname;$('joinCode').oninput=e=>{e.target.value=e.target.value.toUpperCase();};
  const enter=async create=>{const code=$('joinCode').value.trim();if(!create&&code.length!==4)throw Error('방 코드 4자리를 입력하세요.');
    nickname=$('nick').value.trim()||'플레이어';save('name',nickname);const old=client;client=null;await old?.leave();const c=client=newClient();
    try{if(create)await c.create({name:nickname,size,weapon:selected});else await c.join({name:nickname,code,weapon:selected});}catch(e){if(client===c)client=null;throw e;}};
  $('createRoom').onclick=e=>spin(e.currentTarget,()=>enter(true));$('roomForm').onsubmit=e=>{e.preventDefault();spin($('joinRoom'),()=>enter(false));};
};
function showRoom(r){
  const me=r.players.find(p=>p.id===client?.id),host=r.hostId===me?.id;
  const teams=[0,1].map(t=>{const list=r.players.filter(p=>p.team===t);return '<section><h3>'+teamName(t)+' 팀</h3>'+list.map(p=>'<div class="room-line"><b>'+esc(p.name)+(p.id===me?.id?' (나)':'')+'</b><small>'+(p.id===r.hostId?'방장':p.ready?'준비':'대기')+'</small></div>').join('')+'<div class="room-line empty">빈 자리</div>'.repeat(Math.max(0,r.size-list.length))+'</section>';}).join('');
  const full=r.players.length===r.needed,ready=r.players.every(p=>p.ready),startLabel=full?'경기 시작':'빈자리 봇으로 시작';
  showPanel('room','대전 대기실','<div class="choice-line"><span>방 코드</span><b class="room-code">'+esc(r.code)+'</b></div><div class="room-teams">'+teams+'</div><div class="row">'+(host?'<button class="primary" id="roomStart" '+(!ready?'disabled':'')+'>'+startLabel+'</button>':'<button class="primary" id="ready">'+(me?.ready?'준비 취소':'준비 완료')+'</button>')+'<button class="secondary" id="switchTeam">팀 변경</button></div><p class="note">'+(host?(ready?'같은 경기 주소와 방 코드를 친구에게 알려 주세요.':'모든 참가자가 준비하면 시작할 수 있어요.'):'시작되면 경기 화면을 클릭해 마우스 조작을 켜세요.')+'</p><p id="netError" class="bad" role="alert"></p>');
  if($('roomStart'))$('roomStart').onclick=e=>{audio.unlock();spin(e.currentTarget,()=>client.start(!full));};
  if($('ready'))$('ready').onclick=e=>{audio.unlock();spin(e.currentTarget,()=>client.ready(!me.ready));};
  $('switchTeam').onclick=e=>spin(e.currentTarget,()=>client.team(1-me.team));
}
function watchPlayer(){
  const me=game?.players.find(p=>p.id===selfId);
  if(!me||me.alive)return me;
  const rest=game.players.filter(p=>p.alive&&p.team===me.team);return rest[spectatorIndex%Math.max(1,rest.length)]||me;
}
function results(){
  if(!game||lastResult)return;
  lastResult='shown';const me=game.players.find(p=>p.id===selfId),w=game.winner;
  const title=w==null?'무승부':w===me?.team?'경기 승리':'경기 패배';
  const rows=[...game.players].sort((a,b)=>a.team-b.team||b.kills-a.kills).map(p=>
    '<tr><td>'+esc(p.name)+(p.id===selfId?' (나)':'')+'</td><td>'+teamName(p.team)+'</td><td>'+p.kills+'</td><td>'+p.deaths+'</td></tr>').join('');
  const host=room?.hostId===selfId;
  showPanel('result',title,'<div class="result-score"><b>'+game.score[0]+'</b><span>–</span><b>'+game.score[1]+'</b></div><table class="results"><thead><tr><th>플레이어</th><th>팀</th><th>처치</th><th>탈락</th></tr></thead><tbody>'+rows+'</tbody></table><div class="row">'+(!client?'<button class="primary" id="again">다시 연습</button>':host?'<button id="again" class="primary">같은 방에서 다시 준비</button>':'')+'<button class="secondary" id="finish">나가기</button></div>'+((client&&!host)?'<p class="note">방장이 다시 준비하면 대기실로 이동합니다.</p>':''));
  release();audio.chime(w===me?.team);if($('again'))$('again').onclick=client?e=>spin(e.currentTarget,()=>client.lobby()):practice;$('finish').onclick=goHome;
}
function receiveEvents(now){
  for(const ev of game.events){if(ev.seq<=lastEvent)continue;lastEvent=ev.seq;const me=game.players.find(p=>p.id===selfId);audio.event(ev,game,watchPlayer());
    if(ev.type==='hit'&&ev.actor===selfId){
      hitTime=now+.14;
      if(ev.damage){$('combatDamage').textContent=String(ev.damage);$('combatDamage').classList.toggle('head',!!ev.headshot);damageUntil=now+.4;}
    }
    if(ev.type==='hit'&&ev.target===selfId)damageTime=now+.32;
    if(ev.type==='kill'&&ev.actor===selfId){const victim=game.players.find(p=>p.id===ev.target);$('fragConfirm').textContent=(ev.headshot?'헤드샷 · ':'처치 · ')+(victim?.name||'');fragUntil=now+1.5;}
    if(ev.type==='kill'){const a=game.players.find(p=>p.id===ev.actor),v=game.players.find(p=>p.id===ev.target);eventFeed.unshift({text:(a?.name||'')+'  ›  '+(v?.name||''),at:now});eventFeed=eventFeed.slice(0,3);}
    if(ev.type==='round'&&me){yaw=spawnYaw(me);pitch=0;slot=1;clearInput();roundFlash=now+1.0;}
    if(ev.type==='roundEnd')audio.chime(ev.team===me?.team);
  }
}
function showHUD(now){
  const me=game.players.find(p=>p.id===selfId),p=watchPlayer();if(!me||!p)return;
  $('blueScore').textContent=game.score[0];$('redScore').textContent=game.score[1];
  $('blueLive').textContent='블루 '+game.players.filter(m=>m.team===0&&m.alive).length+'/'+game.size;
  $('orangeLive').textContent='오렌지 '+game.players.filter(m=>m.team===1&&m.alive).length+'/'+game.size;
  if(now>damageUntil)$('combatDamage').textContent='';if(now>fragUntil)$('fragConfirm').textContent='';
  $('hp').textContent=Math.max(0,Math.ceil(p.hp));$('hpLabel').textContent=teamName(p.team)+' · 체력';$('hpBar').style.width=clamp(p.hp,0,100)+'%';
  $('health').style.setProperty('--team-color',p.team===0?'var(--blue)':'var(--red)');
  $('gun').textContent=WEAPONS[p.active]?.label||p.active;$('ammo').textContent=p.ammo;$('rounds').textContent=p.reload>0?'재장전':' / '+WEAPONS[p.active].mag;
  $('clock').textContent='0:'+String(Math.ceil(game.time)).padStart(2,'0');
  $('roundLabel').textContent=game.phase==='warmup'?'준비 시간':game.phase==='overtime'?'연장전':'ROUND '+game.round;
  const spectating=!me.alive&&game.phase!=='between'&&game.phase!=='end';$('spectator').hidden=!spectating;$('spectator').textContent=p.alive?'관전 · '+p.name+'   [Tab]':'다음 라운드 대기 중';
  $('sight').classList.toggle('scope',p.active==='sniper'&&(spectating?p.ads:ads));$('sight').hidden=!p.alive||game.phase==='between';
  let text='',sub='',hint='';
  if(game.phase==='warmup'){text='준비 사격';sub=teamName(me.team)+' 팀 · '+sizeText(game.size);hint='Q  주무기 변경 · '+WEAPONS[selected].label+(client?'':'　 Enter  바로 시작');}
  else if(game.phase==='between'){text=game.roundWinner==null?'라운드 무승부':(game.roundWinner===me.team?'라운드 승리':'라운드 패배');sub=game.reason;hint='Q  다음 라운드 무기 · '+WEAPONS[selected].label;}
  else if(game.phase==='overtime'){text='중앙 거점 점령';sub=game.capture?.team==null?'거점에서 3초 버티기':teamName(game.capture.team)+' 점령 중 '+Math.round(game.capture.progress*100)+'%';}
  else if(roundFlash>now){text='라운드 '+game.round;sub=teamName(me.team)+' 팀';}
  if(!pointerMode&&!modal&&!spectating&&game.phase!=='between')hint='경기 화면 클릭 · 마우스 조작 시작';
  const key=text+'|'+sub;if(key!==roundKey){roundKey=key;$('banner').innerHTML=text?'<strong>'+esc(text)+'</strong><small>'+esc(sub)+'</small>':'';}
  $('contextHint').textContent=hint;$('feed').innerHTML=eventFeed.filter(f=>now-f.at<4).map(f=>'<div>'+esc(f.text)+'</div>').join('');
}
function sizeText(n){return n+' vs '+n;}
function currentInput(){
  const blocked=paused||!!modal;
  return {yaw,pitch,forward:blocked?0:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),strafe:blocked?0:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),
    fire:!blocked&&(heldFire||pendingFire),ads:!blocked&&ads,jump:!blocked&&(pressed.has('Space')||keys.has('Space')),slide:!blocked&&(pressed.has('ShiftLeft')||pressed.has('ShiftRight')||keys.has('ShiftLeft')||keys.has('ShiftRight')),
    reload:!blocked&&(pressed.has('KeyR')||keys.has('KeyR')),slot,weapon:selected};
}
function aim(dx,dy){
  if(!Number.isFinite(dx)||Math.abs(dx)>450||!Number.isFinite(dy)||Math.abs(dy)>450)return;
  const scale=.00225*sensitivity*(ads?(watchPlayer()?.active==='sniper'?.31:.58):1);
  yaw+=dx*scale;pitch=clamp(pitch-dy*scale,-1.40,1.40);
}
function bindCanvas(){
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('mousedown',e=>{
    if(screen!=='game'||modal)return;e.preventDefault();audio.unlock();
    if(!pointerMode){attemptLock();dragX=e.clientX;dragY=e.clientY;}
    if(e.button===0)heldFire=pendingFire=true;if(e.button===2)ads=true;
  });
}
window.addEventListener('mouseup',e=>{if(e.button===0)heldFire=false;if(e.button===2)ads=false;if(!e.buttons)dragX=dragY=null;});
window.addEventListener('mousemove',e=>{
  if(screen!=='game'||modal||paused)return;
  if(pointerMode){aim(e.movementX,e.movementY);return;}
  if(e.buttons&&dragX!==null){aim(e.clientX-dragX,e.clientY-dragY);dragX=e.clientX;dragY=e.clientY;}
});
document.addEventListener('pointerlockchange',()=>{
  const was=pointerMode;pointerMode=document.pointerLockElement===canvas;
  if(was&&!pointerMode&&screen==='game'&&!modal&&game?.phase!=='end')showPause();
});
document.addEventListener('pointerlockerror',()=>{if(!modal&&screen==='game')hintLock();});
document.addEventListener('keydown',e=>{
  if(screen!=='game'||modal||paused)return;
  const used=['KeyW','KeyA','KeyS','KeyD','KeyR','KeyQ','Space','ShiftLeft','ShiftRight','Digit1','Digit2','Tab','Enter','Escape'];
  if(!used.includes(e.code))return;e.preventDefault();keys.add(e.code);if(e.repeat)return;
  pressed.add(e.code);
  if(e.code==='Escape'){showPause();return;}
  if(e.code==='Digit1'||e.code==='Digit2')slot=e.code==='Digit2'?2:1;
  if(e.code==='Tab')spectatorIndex++;
  if(e.code==='Enter'&&game.phase==='warmup'&&!client)game.time=0;
  if(e.code==='KeyQ'&&(game.phase==='warmup'||game.phase==='between')){setLoadout(primary[(primary.indexOf(selected)+1)%3]);slot=1;}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(screen==='game'&&!modal&&game?.phase!=='end')showPause();});
function visualState(now){
  if(!client||!prevNet||!game||prevNet.round!==game.round||prevNet.phase!==game.phase)return game;
  const mix=clamp((now-netAt)/50,0,1);
  return {...game,players:game.players.map(p=>{const prev=prevNet.players.find(v=>v.id===p.id);if(!prev||prev.alive!==p.alive)return p;
    const delta=Math.atan2(Math.sin(p.yaw-prev.yaw),Math.cos(p.yaw-prev.yaw));
    return {...p,x:prev.x+(p.x-prev.x)*mix,y:prev.y+(p.y-prev.y)*mix,z:prev.z+(p.z-prev.z)*mix,yaw:prev.yaw+delta*mix};})};
}
function switchToLite(){
  const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;renderer=new LiteRenderer(canvas,MAP);bindCanvas();
}
function frame(ms){
  const dt=clamp((ms-frameTime)/1000,.001,.1),t=ms/1000;frameTime=ms;
  if(screen==='game'&&game){
    const input=currentInput();
    if(!client){if(!paused)stepGame(game,{[selfId]:input},dt);}else client.input(input);
    pendingFire=false;pressed.clear();receiveEvents(t);const p=watchPlayer();if(!paused)audio.steps(game,p,t);
    const visual=visualState(ms),watch=p?.id!==selfId;
    try{renderer.draw(visual,selfId,{lobby:false,ads:watch?!!p?.ads:ads,quality,yaw:watch?p?.yaw:yaw,pitch:watch?p?.pitch:pitch,spectatorId:watch?p?.id:undefined,t,dt});}
    catch(err){console.error(err);if(!(renderer instanceof LiteRenderer))switchToLite();else throw err;}
    $('hitMark').style.opacity=String(clamp((hitTime-t)/.09,0,1));$('damage').style.opacity=String(clamp((damageTime-t)*2,0,.64));
    if(ms-hudStamp>70||firstFrame){showHUD(t);hudStamp=ms;firstFrame=false;}
    if(game.phase==='end'&&!lastResult)results();
  }else if(!document.hidden&&ms-clockStamp>48){
    renderer.draw(null,null,{lobby:true,quality,t,dt});clockStamp=ms;
  }
  requestAnimationFrame(frame);
}
try{
  if(new URLSearchParams(location.search).has('lite'))throw Error('경량 모드');
  renderer=new ArenaRenderer(canvas,MAP);bindCanvas();
}catch(error){console.info('도크라인 경량 렌더링',error.message);switchToLite();}
$('practiceBtn').disabled=$('teamBtn').disabled=$('quickMatch').disabled=false;$('boot').textContent='';requestAnimationFrame(frame);

