import { createRange, stepGame, spawnYaw, clearBufferedFire, TEAM_SIZES } from './sim.js';
import { ARENAS, getArena } from './arena-map.js';
import { MAX_HP, WEAPONS, PRIMARY_WEAPONS as primary, isSecondaryWeapon, secondaryWeapon } from './balance.js';
import { LiteRenderer } from './lite.js';
import { RoomClient, supportsLAN } from './net.js';
import { ArenaSound } from './match-audio.js';
import { CombatFeedback } from './combat-feedback.js';
import { canAim } from './weapon-view.js';
import { KNIFE_LABELS, normalizeKnifeSkin } from './knife-types.js';
import { knifeAttackDuration } from './knife-motion.js';
import { inspectDuration } from './view-inspect.js';

const $ = id => document.getElementById(id);
const panel = $('panel'), body = $('panelBody'), audio = new ArenaSound();
const feedback = new CombatFeedback($('hud'));
const icons = {
 inspect:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5M7 10h6m-3-3v6"/>',
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
let chosenArena=getArena(read('mapId',ARENAS[0].id));
const savedSize=read('size',2);
let size=TEAM_SIZES.includes(savedSize)?savedSize:2, selected=primary.includes(read('weapon','rifle'))?read('weapon','rifle'):'rifle';
let sensitivity=clamp(Number(read('sensitivity',1))||1,.1,3),quality=read('quality','high'),nickname=String(read('name','')).slice(0,16);
let selectedSidearm=secondaryWeapon(read('sidearm','pistol'));
let selectedKnife=normalizeKnifeSkin(read('knifeSkin')), inspectChoice=selected;
audio.enabled=read('sound',true);
let canvas=$('arena'),renderer,game=null,client=null,selfId='local',room=null,screen='home',modal='',lan=false;
let yaw=0,pitch=0,slot=1,firstFrame=true,lastEvent=0,pointerMode=false,dragX=null,dragY=null;
let roundKey='',eventFeed=[],pendingFire=false,heldFire=false,ads=false,paused=false;
let lastResult='',spectatorIndex=0,frameTime=performance.now(),hudStamp=0,roundFlash=0,clockStamp=0;
let prevNet=null,netAt=0,lastNotice='',noticeTimer;
let joining=false,joinAttempt=0;
let inspectStart=null, inspectRequestedAt=null, inspectedItem=null, knifeSwingEnd=0, controlsUnderstood=false;
const keys=new Set(), pressed=new Set();
function notify(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function drawSound(){const el=$('soundBtn');el.innerHTML=svg(audio.enabled?'sound':'mute');el.title=el.ariaLabel=audio.enabled?'소리 끄기':'소리 켜기';}
function setSound(){audio.enabled=!audio.enabled;save('sound',audio.enabled);drawSound();if(audio.enabled)audio.unlock();}
$('soundBtn').onclick=setSound;drawSound();
function setLoadout(type){
  if(!primary.includes(type))return;
  inspectChoice=selected=type;save('weapon',type);
  document.querySelectorAll('[data-weapon]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weapon===type)));
  const gun=WEAPONS[type], pellets=gun.pellets?'×'+gun.pellets:'';
  $('gunDesc').textContent=gun.callsign+' · '+gun.role+' · 탄창 '+gun.mag+'발 · 몸통 '+gun.damage+pellets+' / 머리 '+gun.head+pellets;
}
document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>setLoadout(b.dataset.weapon));
function setSidearm(type){
  inspectChoice=selectedSidearm=secondaryWeapon(type);save('sidearm',selectedSidearm);
  document.querySelectorAll('[data-sidearm]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sidearm===selectedSidearm)));
}
document.querySelectorAll('[data-sidearm]').forEach(b=>b.onclick=()=>setSidearm(b.dataset.sidearm));
function setKnife(type){
  inspectChoice=selectedKnife=normalizeKnifeSkin(type);save('knifeSkin',selectedKnife);
  document.querySelectorAll('[data-knife]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.knife===selectedKnife)));
}
document.querySelectorAll('[data-knife]').forEach(b=>b.onclick=()=>setKnife(b.dataset.knife));
setKnife(selectedKnife);setSidearm(selectedSidearm);setLoadout(selected);
$('inspectBtn').onclick=async()=>{
  if(modal||screen!=='home')return;
  modal='armory';
  const close=()=>{modal='';lobbyFrameKey='';$('inspectBtn').focus({preventScroll:true});};
  try{
    const {openArmoryViewer}=await import('./armory-viewer.js');
    await openArmoryViewer({weapon:inspectChoice,lite:quality==='low'||renderer instanceof LiteRenderer||new URLSearchParams(location.search).has('lite'),
      equippedPrimary:selected,equippedSidearm:selectedSidearm,equippedKnife:selectedKnife,
      onEquip:id=>{if(primary.includes(id))setLoadout(id);else if(isSecondaryWeapon(id))setSidearm(id);else if(Object.hasOwn(KNIFE_LABELS,id))setKnife(id);},
      onClose:close});
  }catch(error){console.error(error);close();notify('무기 자세히 보기를 열 수 없습니다. 다시 시도해 주세요.');}
};
const canLAN=supportsLAN().then(v=>(lan=v));
function showPanel(kind,title,html){
  modal=kind;$('panelTitle').textContent=title;body.innerHTML=html;
  if(!panel.open)panel.showModal();panel.scrollTop=0;
}
function closePanel(){modal='';if(panel.open)panel.close();}
function cancelInspection(){
  audio.cancelKnifeHandling();
  inspectedItem=null;inspectStart=null;inspectRequestedAt=null;
  $('weaponHud').removeAttribute('data-inspecting');
}
function clearInput(){
  keys.clear();pressed.clear();heldFire=ads=pendingFire=false;dragX=dragY=null;
  cancelInspection();
  if(game&&!client)clearBufferedFire(game.players.find(p=>p.id===selfId));
  audio.cancelHandling();
}
function release(){if(document.pointerLockElement)document.exitPointerLock();clearInput();}
function attemptLock(){
  if(screen!=='game'||modal)return;
  canvas.focus({preventScroll:true});
  try{const promise=canvas.requestPointerLock?.();if(promise?.catch)promise.catch(()=>{if(screen==='game'&&!modal)hintLock();});}catch{hintLock();}
}
function hintLock(){if(lastNotice!=='lock'){notify('화면을 클릭해 마우스 시점을 활성화하세요. 제한된 창에서는 누른 채 끌어도 됩니다.');lastNotice='lock';}}
function returnFromPanel(){
  if(modal==='network'&&joining){joinAttempt++;joining=false;const old=client;client=null;old?.leave().catch(()=>{});}
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
  const teamRules='<div class="keyrow"><span>팀전 관전 대상 변경</span><kbd>Tab</kbd></div><p>팀전은 3선승입니다. 상대 팀을 전멸시키거나 연장전에 중앙 거점을 3초간 지키세요.</p>';
  const rangeRules='<p>사격장에서는 더미가 쓰러진 자리에 다시 나타납니다. Q로 주무기를 바꿔 가며 연습하세요.</p>';
  const rules=game?.phase==='range'?rangeRules:client?teamRules:rangeRules+teamRules;
  showPanel('help','조작 안내','<div class="keyrow"><span>이동</span><kbd>W A S D</kbd></div><div class="keyrow"><span>시점 · 공격 · 조준</span><b>마우스 이동 · 좌클릭 · 우클릭</b></div><div class="keyrow"><span>점프 · 이동 중 슬라이딩</span><kbd>Space / C</kbd></div><div class="keyrow"><span>주무기 · 보조무기 · 칼</span><kbd>1 / 2 / 3</kbd></div><div class="keyrow"><span>손에 든 무기 자세히 보기</span><kbd>F</kbd></div><div class="keyrow"><span>총기 재장전</span><kbd>R</kbd></div><div class="keyrow"><span>주무기 변경 (사격장 · 팀전 준비 시간)</span><kbd>Q</kbd></div><div class="keyrow"><span>메뉴 · 마우스 감도</span><kbd>Esc</kbd></div><p>3번으로 칼을 꺼낸 뒤 좌클릭으로 가까운 대상을 공격하세요.</p>'+rules+'<button class="primary" id="helpDone">확인</button>');
  $('helpDone').onclick=returnFromPanel;
}
function sensitivityControls(){
  return '<div class="sense-control"><div class="sense-heading"><label for="sense">마우스 감도</label><button id="senseReset" class="minor" type="button">기본값</button></div><div class="sense-inputs"><input id="sense" type="range" min="0.10" max="3.00" step="0.01"><input id="senseNumber" type="number" min="0.10" max="3.00" step="0.01" inputmode="decimal" aria-label="마우스 감도 배율"><span aria-hidden="true">×</span></div></div>';
}
function bindSensitivity(){
  const draw=()=>{$('sense').value=sensitivity;$('senseNumber').value=sensitivity.toFixed(2);};
  const change=value=>{
    if(Number.isFinite(value)){
      sensitivity=Math.round(clamp(value,.1,3)*100)/100;
      save('sensitivity',sensitivity);
    }
    draw();
  };
  $('sense').oninput=e=>change(e.target.valueAsNumber);
  $('senseNumber').onchange=e=>change(e.target.valueAsNumber);
  $('senseReset').onclick=()=>change(1);
  draw();
}
function settings(){
  showPanel('settings','게임 설정',sensitivityControls()+'<label class="setting">그래픽 <select id="graphics"><option value="high">최고 화질</option><option value="auto">자동</option><option value="low">저사양</option></select></label><div class="setting"><span>효과음</span><button id="soundToggle" class="minor"></button></div><div class="row"><button id="settingsDone" class="primary">완료</button></div>');
  bindSensitivity();
  $('graphics').value=quality;$('graphics').onchange=e=>{quality=e.target.value;save('quality',quality);};
  const sound=$('soundToggle');sound.textContent=audio.enabled?'켜짐':'꺼짐';sound.onclick=()=>{setSound();sound.textContent=audio.enabled?'켜짐':'꺼짐';};$('settingsDone').onclick=returnFromPanel;
  const credits=document.createElement('button');credits.className='credits-link';credits.textContent='제작 자료 · 라이선스';body.append(credits);
  credits.onclick=()=>showPanel('credits','제작 자료',
    '<p>기본 총기와 선수 모델은 <a href="https://quaternius.com/packs/toonshootergamekit.html" target="_blank" rel="noopener">Quaternius · Toon Shooter Game Kit</a>(CC0)를 수정했습니다. 스키퍼·트라이던트·글라스핀·캐프스턴은 Kenney Blaster Kit(CC0)를 바탕으로 제작했습니다. 칼과 전자 표적 더미는 도크라인 전용 모델입니다.</p>'+
    '<p>맵의 컨테이너·금속 화물 케이스·공장·급수탑·설비는 Kenney의 <a href="https://kenney.nl/assets/city-kit-industrial" target="_blank" rel="noopener">City Kit Industrial</a>, <a href="https://kenney.nl/assets/factory-kit" target="_blank" rel="noopener">Factory Kit</a>, <a href="https://kenney.nl/assets/blaster-kit" target="_blank" rel="noopener">Blaster Kit</a>(모두 CC0)를 수정했습니다.</p>'+
    '<p>세관 창고의 콘크리트·목재·금속 표면에는 Poly Haven의 CC0 재질을 사용했습니다. <a href="./assets/warehouse-CREDITS.txt" target="_blank" rel="noopener">재질별 원본과 제작자</a></p>'+
    '<p>봇의 표적 선택과 측면 회피는 <a href="https://github.com/Mugen87/dive/tree/7176136cf6c29eddfd620df2bf0d09a532680763" target="_blank" rel="noopener">Michael Herzog · Dive</a>(MIT)의 코드를 수정했습니다.</p>'+
    '<p>온라인 연결은 <a href="https://peerjs.com/" target="_blank" rel="noopener">PeerJS</a> 1.5.5(MIT)를 사용합니다. 방장의 브라우저에서 경기를 진행하며, 공용 연결 서비스와 네트워크 상태에 영향을 받습니다.</p>'+
    '<p>효과음은 <a href="https://github.com/DeathByDenim/openspades-free-pak/blob/1e6b28721a2e5e51f84a572d101079bf186c66d5/License/Credits-pak001-Free.md" target="_blank" rel="noopener">OpenSpades Free Pak</a>과 <a href="https://github.com/buddingmonkey/FreeFirearmsSFXLibrary/tree/beb2f4041f3d6740fa0aeaf0e71159bd65a78c1b" target="_blank" rel="noopener">The Free Firearm Sound Library</a>의 녹음을 편집했습니다. 산탄총은 Mike Koenig (CC BY 3.0), 달리기는 Disagree (CC BY 4.0), 나머지 녹음은 CC0입니다. 재생 시 음량·피치·필터·잔향·좌우 위치를 조절합니다.</p>'+
    '<p class="note">자료별 저자와 라이선스는 소스 묶음에 있습니다. 현재 모델은 art-source/toon-shooter에서 편집할 수 있고, 이전 Kenney 모델도 art-source/blasters에 보관했습니다.</p>');
}
function enterGame(state,id){
  displayArena(getArena(state.mapId));
  audio.clear();
  closePanel();screen='game';document.body.dataset.scene='game';$('hud').hidden=false;
  const inRange=state.phase==='range';
  $('rangeStats').hidden=!inRange;
  for(const id of ['scoreboard','living','health','feed'])$(id).hidden=inRange;
  feedback.reset();
  game=state;selfId=id;paused=false;lastEvent=0;lastResult=roundKey='';eventFeed=[];slot=1;knifeSwingEnd=0;lastNotice='';spectatorIndex=0;controlsUnderstood=false;clearInput();
  const me=state.players.find(p=>p.id===id);yaw=me?.yaw||0;pitch=me?.pitch||0;
  audio.unlock();firstFrame=true;roundFlash=0;frameTime=performance.now();hudStamp=0;canvas.focus();
}
function openRange(){
  enterGame(createRange({name:nickname||'나',weapon:selected,sidearm:selectedSidearm,knifeSkin:selectedKnife,mapId:chosenArena.id}),'local');
  attemptLock();
}
$('rangeBtn').onclick=openRange;
function showPause(){if(screen!=='game'||game?.phase==='end')return;paused=true;clearInput();
  audio.clear(true);
  showPanel('pause',client?'경기 메뉴':'사격장 일시정지',(client?'<p class="note">다른 참가자와 경기는 계속 진행 중입니다.</p>':'')+
    sensitivityControls()+'<div class="row"><button class="primary" id="resume">계속 플레이</button></div><div class="row"><button class="secondary" id="gameControls">조작 안내</button><button class="secondary" id="gameSettings">설정</button></div><div class="row"><button class="minor" id="quit">로비로 나가기</button></div>');release();bindSensitivity();
  $('resume').onclick=()=>{closePanel();paused=false;attemptLock();};$('gameControls').onclick=help;$('gameSettings').onclick=settings;$('quit').onclick=client?leaveConfirm:goHome;
}
function leaveConfirm(){const hosting=client?.online&&room?.hostId===client.id;showPanel('leave','방을 나갈까요?','<p>'+(hosting?'방장이 나가면 이 방의 경기가 종료됩니다.':'친구들과 다시 플레이하려면 방 코드로 참가하세요.')+'</p><div class="row"><button id="stay" class="secondary">돌아가기</button><button id="quitNow" class="primary">방 나가기</button></div>');$('stay').onclick=returnFromPanel;$('quitNow').onclick=goHome;}
function goHome(){
  displayArena(chosenArena);
  audio.clear();
  const old=client;client=null;old?.leave().catch(()=>{});room=null;game=null;prevNet=null;screen='home';paused=false;closePanel();release();
  $('hud').hidden=true;document.body.dataset.scene='lobby';lastResult='';$('rangeBtn').focus({preventScroll:true});
}
function roomError(error){const node=$('netError');if(node)node.textContent=error.message||error;else notify(error.message||error);}
function spin(btn,job){const old=btn.disabled;btn.disabled=true;Promise.resolve().then(job).catch(roomError).finally(()=>{if(btn.isConnected)btn.disabled=old;});}
function newClient(Client=RoomClient){
  const c=new Client({onRoom(r){if(c!==client)return;room=r;if(r.phase==='lobby'){displayArena(getArena(r.mapId));game=null;screen='home';release();$('hud').hidden=true;document.body.dataset.scene='lobby';if(modal!=='leave')showRoom(r);}},
    onGame(next){if(c!==client)return;if(screen!=='game'||!game){prevNet=null;enterGame(next,c.id);}else{prevNet=game;game=next;}netAt=performance.now();},
    onError:m=>roomError(m),onClose:m=>{if(c!==client)return;goHome();notify(m);}});
  return c;
}
async function openNetwork(invite=''){
  if(location.protocol==='file:'){
    showPanel('network','친구와 대전','<p>온라인 대전은 게임 사이트에서 방 코드를 입력하면 참가할 수 있어요.</p><div class="row"><a class="primary" href="https://juhyeonmoon10.github.io/dockline-summit/" target="_blank" rel="noopener">온라인 게임 열기</a></div>');return;
  }
  renderer?.preloadOperators?.();
  const button=$('teamBtn');button.disabled=true;await canLAN;button.disabled=false;
  const digits=lan?4:6;
  showPanel('network', '친구와 대전', `
    <form id="roomForm">
      <label class="field" for="nick">내 이름</label>
      <input type="text" maxlength="16" id="nick" placeholder="플레이어" autocomplete="nickname">
      <label class="field code-field" for="joinCode">방 코드</label>
      <input type="text" id="joinCode" placeholder="${lan ? 'ABCD' : 'ABC234'}" maxlength="${digits}"
        autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="codeHint">
      <p id="codeHint" class="note">친구에게 받은 ${digits}자리 코드를 입력하세요.</p>
      <button class="primary join-action" id="joinRoom">코드로 참가</button>
      <p class="bad" id="netError" role="alert"></p>
      <p id="netStatus" class="note" role="status"></p>
      <div class="room-create">
        <label for="roomSize">새 방 인원</label>
        <div class="create-actions">
          <select id="roomSize">
            ${TEAM_SIZES.map(n=>`<option value="${n}">${sizeText(n)}</option>`).join('')}
          </select>
          <button type="button" class="secondary" id="createRoom">방 만들기</button>
        </div>
      </div>
    </form>
    ${lan ? '<p class="note">행사장 서버에 연결되어 있어요.</p>' :
      '<p class="note room-host-note">방장은 경기 중 게임 탭을 열어 두세요.</p><details class="network-help"><summary>연결이 안 되나요?</summary><p>방장이 접속 중인지 확인하세요. 학교·게스트 Wi-Fi는 기기 간 연결을 막을 수 있어요.</p><p>행사장 전용 서버는 <a href="./dockline-lan.zip" download>서버 묶음</a>의 PLAY-KO.txt를 따라 연결할 수 있어요.</p></details>'}`);
  const roomSize = $('roomSize');
  roomSize.value = String(size);
  roomSize.onchange = () => {
    size = Number(roomSize.value);
    save('size', size);
  };
  $('nick').value=nickname;$('joinCode').value=invite.slice(0,digits);
  $('joinCode').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');$('netError').textContent='';};
  const enter=async create=>{
    if(joining)return;
    const code=$('joinCode').value.trim();
    if(!create&&code.length!==digits){roomError('방 코드 '+digits+'자리를 입력하세요.');$('joinCode').focus();return;}
    nickname=$('nick').value.trim()||'플레이어';save('name',nickname);
    const attempt=++joinAttempt;joining=true;
    const form=$('roomForm'),status=$('netStatus');
    for(const el of form.querySelectorAll('button,input,select'))el.disabled=true;
    $('netError').textContent='';status.textContent=create?'방을 만드는 중…':'방에 연결하는 중…';
    let c;
    try{
      const Client=lan?RoomClient:(await import('./online-net.js')).OnlineRoomClient;
      if(attempt!==joinAttempt)return;
      const old=client;client=null;await old?.leave();c=client=newClient(Client);c.online=!lan;
      if(create)await c.create({name:nickname,size,weapon:selected,sidearm:selectedSidearm,knifeSkin:selectedKnife,mapId:chosenArena.id});else await c.join({name:nickname,code,weapon:selected,sidearm:selectedSidearm,knifeSkin:selectedKnife});
    }catch(e){
      await c?.leave().catch(()=>{});if(client===c)client=null;
      if(attempt===joinAttempt&&modal==='network')roomError(e);
    }finally{
      if(attempt===joinAttempt){joining=false;if(form.isConnected){for(const el of form.querySelectorAll('button,input,select'))el.disabled=false;status.textContent='';}}
    }
  };
  $('createRoom').onclick=()=>enter(true);$('roomForm').onsubmit=e=>{e.preventDefault();enter(false);};
  if(invite)$('joinRoom').focus();else $('joinCode').focus();
}
$('teamBtn').onclick=()=>openNetwork();
async function copyInvite(value,label){
  try{await navigator.clipboard.writeText(value);notify(label+' 복사했어요.');}
  catch{const field=$('inviteFallback');field.hidden=false;field.value=value;field.focus();field.select();notify('선택된 내용을 Ctrl+C로 복사하세요.');}
}
function showRoom(r){
  const me=r.players.find(p=>p.id===client?.id),host=r.hostId===me?.id;
  const teams=[0,1].map(t=>{const list=r.players.filter(p=>p.team===t);return '<section><h3>'+teamName(t)+' 팀</h3>'+list.map(p=>'<div class="room-line"><b>'+esc(p.name)+(p.id===me?.id?' (나)':'')+'</b><small>'+(p.id===r.hostId?'방장':p.ready?'준비':'대기')+'</small></div>').join('')+'<div class="room-line empty">빈 자리</div>'.repeat(Math.max(0,r.size-list.length))+'</section>';}).join('');
  const full=r.players.length===r.needed,ready=r.players.every(p=>p.ready),startLabel=full?'경기 시작':'빈자리 봇으로 시작';
  showPanel('room','대전 대기실','<div class="choice-line"><span>방 코드</span><b class="room-code">'+esc(r.code)+'</b></div><div class="row invite-actions"><button id="copyCode" class="secondary">코드 복사</button><button id="copyLink" class="secondary">초대 링크 복사</button></div><input id="inviteFallback" type="text" aria-label="복사할 초대 내용" readonly hidden><p class="room-count" role="status">'+r.size+'v'+r.size+' · '+r.players.length+' / '+r.needed+'명 참가</p><div class="room-teams">'+teams+'</div><div class="row">'+(host?'<button class="primary" id="roomStart" '+(!ready?'disabled':'')+'>'+startLabel+'</button>':'<button class="primary" id="ready">'+(me?.ready?'준비 취소':'준비 완료')+'</button>')+'<button class="secondary" id="switchTeam">팀 변경</button></div><p class="note">'+(host?(ready?'코드나 초대 링크를 친구에게 보내세요.':'모든 참가자가 준비하면 시작할 수 있어요.'):'시작되면 경기 화면을 클릭해 마우스 조작을 켜세요.')+(host&&client.online?' 방장 탭을 닫으면 방이 종료돼요.':'')+'</p><p id="netError" class="bad" role="alert"></p>');
  $('copyCode').onclick=()=>copyInvite(r.code,'코드를');
  const roomCount=body.querySelector('.room-count');
  roomCount.prepend(getArena(r.mapId).label+' · ');
  $('copyLink').onclick=()=>{if(lan&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)){notify('친구에게 서버 창의 LAN 주소와 방 코드를 보내세요.');return;}const url=new URL(location.href);url.search='';url.hash='room='+r.code;copyInvite(url.href,'초대 링크를');};
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
  showPanel('result',title,'<div class="result-score"><b>'+game.score[0]+'</b><span>–</span><b>'+game.score[1]+'</b></div><table class="results"><thead><tr><th>플레이어</th><th>팀</th><th>처치</th><th>탈락</th></tr></thead><tbody>'+rows+'</tbody></table><div class="row">'+(host?'<button id="again" class="primary">같은 방에서 다시 준비</button>':'')+'<button class="secondary" id="finish">나가기</button></div>'+(!host?'<p class="note">방장이 다시 준비하면 대기실로 이동합니다.</p>':''));
  release();audio.chime(w===me?.team);if(host)$('again').onclick=e=>spin(e.currentTarget,()=>client.lobby());$('finish').onclick=goHome;
}
function receiveEvents(now){
  const me=game.players.find(p=>p.id===selfId), watch=watchPlayer();
  for(const ev of game.events){if(ev.seq<=lastEvent)continue;lastEvent=ev.seq;audio.event(ev,game,watch);
    if(ev.actor===selfId&&['shot','melee','reload'].includes(ev.type)){
      if(ev.type==='melee'){
        const started=Number.isFinite(ev.at)?now-Math.max(0,game.elapsed-ev.at):now;
        knifeSwingEnd=started+knifeAttackDuration(ev.knifeSkin??me?.knifeSkin);
        if(inspectRequestedAt===null||started>=inspectRequestedAt-.015)cancelInspection();
      }else cancelInspection();
    }
    if(ev.type==='shot'&&ev.actor===watch?.id)feedback.shot(ev.weapon,now);
    if(ev.type==='hit'&&ev.actor===selfId)feedback.hit(ev,now);
    if(ev.type==='hit'&&ev.target===selfId)feedback.hurt(me,game.players.find(p=>p.id===ev.actor),now);
    if(ev.type==='kill'){
      const inRange=game.phase==='range';
      const victim=(inRange?game.targets:game.players).find(p=>p.id===ev.target);
      if(ev.actor===selfId)feedback.kill(ev,victim?.name,now);
      if(!inRange){
        const shooter=game.players.find(p=>p.id===ev.actor);
        eventFeed.unshift({text:(shooter?.name||'')+'  ›  '+(victim?.name||''),at:now});eventFeed=eventFeed.slice(0,3);
      }
    }
    if(ev.type==='round'&&me){yaw=spawnYaw(me,game.mapId);pitch=0;slot=1;clearInput();feedback.reset();roundFlash=now+1.0;}
    if(ev.type==='roundEnd')audio.chime(ev.team===me?.team);
  }
}
function showHUD(now){
  const me=game.players.find(p=>p.id===selfId),p=watchPlayer();if(!me||!p)return;
  if(game.phase==='range'){
    const {hits,kills,shots}=game.range;
    $('rangeHits').textContent=hits;$('rangeKills').textContent=kills;
    $('rangeAccuracy').textContent=shots?Math.round(100*hits/shots)+'%':'–';
  }else{
    $('blueScore').textContent=game.score[0];$('redScore').textContent=game.score[1];
    $('blueLive').textContent='블루 '+game.players.filter(m=>m.team===0&&m.alive).length+'/'+game.size;
    $('orangeLive').textContent='오렌지 '+game.players.filter(m=>m.team===1&&m.alive).length+'/'+game.size;
    $('clock').textContent='0:'+String(Math.ceil(game.time)).padStart(2,'0');
    $('roundLabel').textContent=game.phase==='warmup'?'준비 시간':game.phase==='overtime'?'연장전':'ROUND '+game.round;
    const maxHp=p.maxHp??MAX_HP;
    $('hp').textContent=Math.max(0,Math.ceil(p.hp));$('hpLabel').textContent=teamName(p.team)+' · 체력';
    $('hpBar').style.width=clamp(100*p.hp/maxHp,0,100)+'%';
    $('health').style.setProperty('--team-color',p.team===0?'var(--blue)':'var(--red)');
  }
  const gun=WEAPONS[p.active];
  const equippedSlot=gun.melee?3:isSecondaryWeapon(p.active)?2:1;
  $('gun').textContent=equippedSlot+' · '+(gun.melee?KNIFE_LABELS[normalizeKnifeSkin(p.knifeSkin)]:gun.label);
  $('weaponHud').classList.toggle('melee',!!gun.melee);
  $('ammo').textContent=gun.melee?'근접':p.ammo;
  $('rounds').textContent=gun.melee?'좌클릭 공격':'/ '+(game.phase==='range'?'∞':p.reserve??gun.reserve);
  const spectating=!me.alive&&game.phase!=='between'&&game.phase!=='end';$('spectator').hidden=!spectating;$('spectator').textContent=p.alive?'관전 · '+p.name+'   [Tab]':'다음 라운드 대기 중';
  feedback.updateWeapon(p,spectating);
  let text='',sub='',hint='';
  if(game.phase==='range'){hint=gun.melee?'좌클릭  칼 공격 · 1  주무기 · 2  보조무기':'3  칼 · C  슬라이딩 · Q  주무기 변경 · R  재장전';}
  else if(game.phase==='warmup'){text='준비 사격';sub=teamName(me.team)+' 팀 · '+sizeText(game.size);hint='Q  주무기 변경 · '+WEAPONS[selected].label;}
  else if(game.phase==='between'){text=game.roundWinner==null?'라운드 무승부':(game.roundWinner===me.team?'라운드 승리':'라운드 패배');sub=game.reason;hint='Q  다음 라운드 무기 · '+WEAPONS[selected].label;}
  else if(game.phase==='overtime'){text='중앙 거점 점령';sub=game.capture?.team==null?'거점에서 3초 버티기':teamName(game.capture.team)+' 점령 중 '+Math.round(game.capture.progress*100)+'%';}
  else if(roundFlash>now){text='라운드 '+game.round;sub=teamName(me.team)+' 팀';}
  if(!pointerMode&&!modal&&!spectating&&game.phase!=='between')hint='경기 화면 클릭 · 마우스 조작 시작';
  if(me.alive&&!controlsUnderstood&&['range','warmup','round','overtime'].includes(game.phase))hint+=(hint?' · ':'')+'F  자세히 보기';
  if(controlsUnderstood&&['range','round','overtime'].includes(game.phase))hint='';
  const key=text+'|'+sub;if(key!==roundKey){roundKey=key;$('banner').innerHTML=text?'<strong>'+esc(text)+'</strong><small>'+esc(sub)+'</small>':'';}
  $('contextHint').textContent=hint;$('feed').innerHTML=eventFeed.filter(f=>now-f.at<4).map(f=>'<div>'+esc(f.text)+'</div>').join('');
}
function sizeText(n){return n+' vs '+n;}
function aiming(){return canAim(watchPlayer(),ads&&slot!==3);}
function heldItem(p){return p.active==='knife'?normalizeKnifeSkin(p.knifeSkin):p.active;}
function inspectionAllowed(p){
  return p?.id===selfId&&p.alive&&!paused&&!modal&&!p.reload&&!p.slide&&!p.ads&&!ads&&!heldFire&&!pendingFire&&
    ['range','warmup','round','overtime'].includes(game.phase);
}
function inspectWeapon(){
  const p=watchPlayer();
  if(!inspectionAllowed(p))return;
  cancelInspection();
  const primaryId=game.phase==='range'||game.phase==='warmup'?selected:p.weapon;
  inspectedItem=slot===3?normalizeKnifeSkin(p.knifeSkin):slot===2?secondaryWeapon(p.sidearm):primaryId;
  // A switch and F can arrive between frames, especially before an online snapshot.
  inspectStart=null;inspectRequestedAt=performance.now()/1000;
}
function inspectionAge(p,now){
  if(inspectedItem){
    if(inspectionAllowed(p)){
      if(inspectedItem===heldItem(p)){
        // Start a queued flourish from its opening pose once the slash has finished.
        if(p.active==='knife'&&inspectStart===null&&now<knifeSwingEnd)return Infinity;
        inspectStart??=now;
        const age=Math.max(0,now-inspectStart);
        if(age<inspectDuration(inspectedItem))return age;
      }else if(inspectStart===null&&now-inspectRequestedAt<.65)return Infinity;
    }
    cancelInspection();
  }
  return Infinity;
}
function currentInput(){
  const blocked=paused||!!modal;
  return {yaw,pitch,forward:blocked?0:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),strafe:blocked?0:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),
    fire:!blocked&&(heldFire||pendingFire),ads:!blocked&&ads&&slot!==3,jump:!blocked&&(pressed.has('Space')||keys.has('Space')),slide:!blocked&&(pressed.has('KeyC')||keys.has('KeyC')),
    reload:!blocked&&(pressed.has('KeyR')||keys.has('KeyR')),slot,weapon:selected};
}
function aim(dx,dy){
  if(!Number.isFinite(dx)||Math.abs(dx)>450||!Number.isFinite(dy)||Math.abs(dy)>450)return;
  const sniper=watchPlayer()?.active==='sniper';
  const zoomScale=sniper ? 1-.69*(renderer?.lensAim??0) : aiming() ? .58 : 1;
  const scale=.00225*sensitivity*zoomScale;
  yaw+=dx*scale;pitch=clamp(pitch-dy*scale,-1.40,1.40);
}
function bindCanvas(){
  canvas.addEventListener('webglcontextlost',e=>{
    if(e.currentTarget!==canvas||renderer instanceof LiteRenderer)return;
    e.preventDefault();
    switchToLite();
    notify('그래픽 연결이 끊겨 경량 화면으로 경기를 계속합니다.');
  },{once:true});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('mousedown',e=>{
    if(screen!=='game'||modal)return;e.preventDefault();audio.unlock();
    if(!pointerMode){attemptLock();dragX=e.clientX;dragY=e.clientY;}
    if(e.button===0||e.button===2){cancelInspection();controlsUnderstood=true;}
    if(e.button===0)heldFire=pendingFire=true;if(e.button===2&&slot!==3&&!WEAPONS[watchPlayer()?.active]?.melee)ads=true;
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
  const used=['KeyW','KeyA','KeyS','KeyD','KeyR','KeyQ','KeyC','KeyF','Space','Digit1','Digit2','Digit3','Tab','Escape'];
  if(!used.includes(e.code))return;e.preventDefault();keys.add(e.code);if(e.repeat)return;
  pressed.add(e.code);
  if(['KeyW','KeyA','KeyS','KeyD','KeyF'].includes(e.code))controlsUnderstood=true;
  if(e.code==='KeyF'){inspectWeapon();return;}
  if(['KeyC','KeyR','KeyQ','Digit1','Digit2','Digit3'].includes(e.code))cancelInspection();
  if(e.code==='Escape'){showPause();return;}
  if(['Digit1','Digit2','Digit3'].includes(e.code)){slot=Number(e.code.slice(-1));if(slot===3)ads=false;else knifeSwingEnd=0;}
  if(e.code==='Tab')spectatorIndex++;
  if(e.code==='KeyQ'&&['range','warmup','between'].includes(game.phase)){setLoadout(primary[(primary.indexOf(selected)+1)%primary.length]);slot=1;}
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
function switchToLite(map=renderer?.map||chosenArena){
  const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;renderer=new LiteRenderer(canvas,map);bindCanvas();
}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
let lobbyFrameKey='';
function displayArena(map){
  if(renderer&&renderer.map!==map){
    try{renderer.setMap(map);}
    catch(error){if(renderer instanceof LiteRenderer)throw error;switchToLite(map);}
  }
  $('arenaTitle').textContent=map.title;
  $('arenaBlurb').textContent=map.description;
  $('arenaPick').value=map.id;
  canvas.setAttribute('aria-label','도크라인 '+map.label);
  lobbyFrameKey='';
}
for(const map of ARENAS)$('arenaPick').add(new Option(map.label,map.id));
$('arenaPick').onchange=e=>{
  chosenArena=getArena(e.target.value);save('mapId',chosenArena.id);displayArena(chosenArena);
};
function drawLobby(ms,dt){
  if(document.hidden||modal==='armory')return;
  const key=[canvas.clientWidth,canvas.clientHeight,devicePixelRatio,quality,reduceMotion.matches].join('/');
  const still=Boolean(modal)||reduceMotion.matches;
  if(key===lobbyFrameKey&&(still||ms-clockStamp<(quality==='low'?160:66)))return;
  try{
    renderer.draw(null,null,{lobby:true,quality,t:reduceMotion.matches?0:ms/1000,dt});
  }catch(error){
    if(renderer instanceof LiteRenderer)throw error;
    switchToLite();
    renderer.draw(null,null,{lobby:true,quality,t:0,dt});
  }
  lobbyFrameKey=key;clockStamp=ms;
}
function frame(ms){
  const dt=clamp((ms-frameTime)/1000,.001,.1),t=ms/1000;frameTime=ms;
  if(screen==='game'&&game){
    lobbyFrameKey='';
    const input=currentInput();
    if(!client){if(!paused)stepGame(game,{[selfId]:input},dt);}else client.input(input);
    pendingFire=false;pressed.clear();receiveEvents(t);audio.reconcile(game);const p=watchPlayer();if(!paused)audio.steps(game,p,t);
    const visual=visualState(ms),watch=p?.id!==selfId;
    const inspectAge=inspectionAge(p,t);
    if(!paused&&!modal)audio.handling(p,inspectAge,t);
    $('weaponHud').toggleAttribute('data-inspecting',Number.isFinite(inspectAge));
    try{renderer.draw(visual,selfId,{lobby:false,ads:watch?!!p?.ads:aiming(),quality,yaw:watch?p?.yaw:yaw,pitch:watch?p?.pitch:pitch,spectatorId:watch?p?.id:undefined,inspectAge,t,dt});}
    catch(err){console.error(err);if(!(renderer instanceof LiteRenderer))switchToLite();else throw err;}
    const adsHeld=canAim(p,watch?p?.ads:ads&&slot!==3);
    const ironAligned=adsHeld&&renderer.aim>.96&&(p.active==='shotgun'||p.active==='revolver');
    feedback.sight.hidden=!p?.alive||game.phase==='between'||Boolean(renderer.reflexActive)||ironAligned;
    if(p)feedback.updateSight(p,p.active==='sniper'?renderer.scopeActive:adsHeld,renderer.viewFov);
    feedback.frame(t,watch?p?.yaw:yaw);
    if(ms-hudStamp>70||firstFrame){showHUD(t);hudStamp=ms;firstFrame=false;}
    if(game.phase==='end'&&!lastResult)results();
  }else drawLobby(ms,dt);
  requestAnimationFrame(frame);
}
async function startArena(){
  const forceLite=new URLSearchParams(location.search).has('lite');
  try{
    if(!forceLite){
      const attributes={antialias:true,alpha:false,powerPreference:'high-performance',stencil:false};
      const context=canvas.getContext('webgl2',attributes)||canvas.getContext('webgl',attributes);
      if(context){
        const {ArenaRenderer}=await import('./render.js');
        renderer=new ArenaRenderer(canvas,chosenArena,context);
        bindCanvas();
      }
    }
  }catch(error){console.info('3D 경기장을 경량 모드로 전환합니다.',error);}
  if(!renderer)switchToLite();
  displayArena(chosenArena);
  $('arenaPick').disabled=$('rangeBtn').disabled=$('teamBtn').disabled=false;$('boot').textContent='';
  audio.preload();
  requestAnimationFrame(frame);
  const invite=new URLSearchParams(location.hash.slice(1)).get('room');
  if(invite&&/^[A-Z0-9]{4,6}$/i.test(invite))openNetwork(invite.toUpperCase());
}
startArena().catch(error=>{
  $('boot').textContent='경기장을 열지 못했어요. 페이지를 새로고침해 주세요.';
  console.error(error);
});

