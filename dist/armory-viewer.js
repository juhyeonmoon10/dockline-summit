import * as T from './assets/three.module.min.js';
import {PRIMARY_WEAPONS,SECONDARY_WEAPONS,isSecondaryWeapon,WEAPONS} from './balance.js';
import {blasterMesh,loadGunAppearance} from './blaster.js';
import {scatterTextureReady} from './scatter-model.js';
import {knifeMesh,animateKnife} from './knife.js';
import {KARAMBIT_RING,KNIFE_LABELS,KNIFE_TIMING} from './knife-types.js';
import {ringFlourish} from './view-inspect.js';
import {createCanvasPreview} from './armory-canvas.js';
import {weaponImageUrl} from './weapon-image-url.js';
import {studioReflection} from './weapon-light.js';

const knives=Object.keys(KNIFE_LABELS);
const catalog=[...PRIMARY_WEAPONS,...SECONDARY_WEAPONS,...knives];
const isKnife=id=>knives.includes(id);
const nameOf=id=>KNIFE_LABELS[id]||WEAPONS[id].callsign||WEAPONS[id].label;
const typeOf=id=>isKnife(id)?'근접 무기':WEAPONS[id].label;
const bound=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const paths={
  close:'M6 6l12 12M18 6L6 18',reset:'M4 9a8 8 0 1 1 .6 7M4 4v5h5',
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',spin:'M4 13c-2-3 1-6 6-7l1 3 4-5-6-2 1 2M20 11c2 3-1 6-6 7l-1-3-4 5 6 2-1-2',
};
const icon=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[id]+'"/></svg>';

function stageLights(scene){
  scene.add(new T.HemisphereLight(0xe1edf9,0xa19071,1.38));
  for(const [color,intensity,x,y,z] of [[0xffe3c1,3.45,-3.6,5.2,4],[0xbbdaff,3.35,2.7,2.2,-3],[0xd4e5fa,.85,2,-.6,3]]){
    const light=new T.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
  }
}

let benchGrain;
function workbenchTile(){
  if(benchGrain)return benchGrain;
  const tile=document.createElement('canvas');tile.width=tile.height=256;
  const ctx=tile.getContext('2d'),ink=ctx.createImageData(256,256);
  let state=41307;
  function random(){state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;}
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=4*(y*256+x),value=random(),warp=Math.cos((x*.75+y)*Math.PI/2);
    const tone=112+65*(value-.5)+8*warp;
    ink.data[i]=ink.data[i+1]=ink.data[i+2]=tone;ink.data[i+3]=255;
  }
  ctx.putImageData(ink,0,0);
  for(let i=0;i<115;i++){
    const x=random()*256,y=random()*256,dx=2+random()*6;
    ctx.strokeStyle=i%3?'rgba(32,31,27,.15)':'rgba(234,229,201,.23)';
    ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dx*(random()-.62));ctx.stroke();
  }
  benchGrain=tile;return tile;
}

function drawWorkbench(canvas){
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,1.5);
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(!pw||!ph||(canvas.width===pw&&canvas.height===ph))return;
  canvas.width=pw;canvas.height=ph;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.scale(dpr,dpr);
  const casing=ctx.createLinearGradient(0,0,w,h);
  casing.addColorStop(0,'#303536');casing.addColorStop(.57,'#596060');casing.addColorStop(1,'#30383b');
  ctx.fillStyle=casing;ctx.fillRect(0,0,w,h);
  const inset=Math.max(10,Math.min(w*.026,27)),right=w-inset,bottom=h-inset*.55;
  // Rubber bench mat with a cut corner and two pressed perimeter grooves.
  function mat(gap){
    const x=right-gap,y=bottom-gap,r=Math.min(w*.067,49);
    ctx.beginPath();ctx.moveTo(-30,-30);ctx.lineTo(x,-30);ctx.lineTo(x,y-r);
    ctx.lineTo(x-r,y);ctx.lineTo(-30,y);ctx.closePath();
  }
  ctx.save();mat(0);
  ctx.shadowColor='#0a0d0fd9';ctx.shadowOffsetY=3;ctx.shadowBlur=8;
  ctx.fillStyle='#48504c';ctx.fill();ctx.restore();
  ctx.save();mat(0);ctx.clip();
  const lamp=ctx.createRadialGradient(w*.40,h*.38,4,w*.42,h*.39,Math.max(w*.78,h*.91));
  lamp.addColorStop(0,'#8f9186');lamp.addColorStop(.36,'#757c74');lamp.addColorStop(.68,'#505b58');lamp.addColorStop(1,'#303c3c');
  ctx.fillStyle=lamp;ctx.fillRect(0,0,w,h);
  const falloff=ctx.createLinearGradient(0,0,w*.16,h*.85);
  falloff.addColorStop(0,'rgba(19,27,31,.70)');falloff.addColorStop(.34,'rgba(27,32,30,.04)');
  falloff.addColorStop(.70,'rgba(20,25,25,0)');falloff.addColorStop(1,'rgba(16,24,27,.44)');
  ctx.fillStyle=falloff;ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.64;
  ctx.fillStyle=ctx.createPattern(workbenchTile(),'repeat');ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  for(const [gap,colour] of [[.8,'rgba(170,177,165,.4)'],[6,'rgba(20,28,26,.51)'],[7.3,'rgba(159,168,151,.23)']]){
    mat(gap);ctx.strokeStyle=colour;ctx.lineWidth=1.1;ctx.stroke();
  }
  // Shallow molded ribs are confined to the corner, outside the working surface.
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const n=i*6;ctx.moveTo(right-20,bottom-55-n);ctx.lineTo(right-54-n,bottom-21);
  }
  ctx.lineWidth=2;ctx.strokeStyle='rgba(15,23,22,.27)';ctx.stroke();ctx.restore();
}

function makeStage(host,preferLite,onZoom){
  let canvas,gl,soft,frame=0,lastTime=0,disposed=false,rotating=false,inspectTime=null;
  let id,model,zoom=1,yaw=0,pitch=0,panX=0,panY=0,units=1,initialWidth=1,initialHeight=.5;
  const scene=new T.Scene(),orbit=new T.Group(),mount=new T.Group(),normalised=new T.Group();
  const camera=new T.OrthographicCamera(-1,1,1,-1,.01,20);camera.position.z=4;
  scene.add(orbit);orbit.add(mount);mount.add(normalised);stageLights(scene);
  const silverFill=new T.DirectionalLight(0xf7fbff,1.45);
  silverFill.position.set(.9,-.6,4);scene.add(silverFill);
  const bounds=new T.Box3(),center=new T.Vector3(),size=new T.Vector3(),point=new T.Vector3();
  const restPosition=new T.Vector3(),ringCenter=new T.Vector3(...KARAMBIT_RING);
  // A sparse convex envelope follows crooked blades as well as long barrels.
  // A rotated bounding box leaves too much empty space around a curved blade.
  const directions=[],surface=[];
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){
    if(x||y||z){directions.push(new T.Vector3(x,y,z));surface.push(new T.Vector3());}
  }
  const abort=new AbortController(),contacts=new Map(),bench=host.closest('.armory-display').querySelector('.armory-bench');
  let drag=null;
  function addCanvas(){
    canvas=document.createElement('canvas');canvas.className='armory-canvas';canvas.tabIndex=0;
    canvas.setAttribute('aria-label','무기 3D 모델. 방향키로 회전, 더하기와 빼기 키로 확대 또는 축소');
    host.replaceChildren(canvas);
  }
  function software(){
    addCanvas();soft=createCanvasPreview(canvas,{studio:true});host.dataset.renderer='canvas';
  }
  addCanvas();
  if(!preferLite){
    try{
      gl=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      gl.setClearColor(0,0);scene.environment=studioReflection({bench:true});host.dataset.renderer='webgl';
      canvas.addEventListener('webglcontextlost',e=>{
        e.preventDefault();if(disposed)return;
        scene.environment?.dispose();scene.environment=null;
        gl.dispose();gl=null;contacts.clear();drag=null;software();request();
      },{signal:abort.signal});
    }catch{software();}
  }else software();

  function fit(animated){
    // Keep the original framing until the silhouette would cross an edge.
    const aspect=host.clientWidth/Math.max(1,host.clientHeight);
    orbit.updateMatrixWorld(true);
    if(animated)bounds.setFromObject(orbit,true);
    else{
      bounds.makeEmpty();
      for(const c of surface)bounds.expandByPoint(point.copy(c).applyMatrix4(mount.matrixWorld));
    }
    bounds.getSize(size);
    return Math.max(initialWidth/.85,initialHeight*aspect/.74,size.x/.91,size.y*aspect/.87);
  }
  function paint(time){
    frame=0;if(disposed||!model)return;
    drawWorkbench(bench);
    const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
    if(rotating&&!drag)yaw+=dt*.60;
    if(inspectTime!==null){
      const age=(time-inspectTime)/1000;
      animateKnife(model,id,Infinity,age);
      if(id==='karambit'){
        model.rotation.z=ringFlourish(age)?.turn||0;
        point.copy(ringCenter).applyQuaternion(model.quaternion);
        model.position.copy(restPosition).add(ringCenter).sub(point);
      }
      if(age>=KNIFE_TIMING[id].inspect){animateKnife(model,id);inspectTime=null;}
    }
    orbit.rotation.set(pitch,yaw,0,'XYZ');
    orbit.position.set(0,0,0);
    const animated=inspectTime!==null;
    units=fit(animated)/zoom;
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),aspect=w/h;
    // Pan is stored in viewport fractions so resizing retains the point of interest.
    if(animated)bounds.getCenter(point);else point.set(0,0,0);
    orbit.position.set(panX*units-point.x,panY*units/aspect-point.y,0);
    if(gl){
      const dpr=Math.min(window.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr))gl.setSize(Math.round(w*dpr),Math.round(h*dpr),false);
      camera.left=-units/2;camera.right=units/2;camera.top=units/aspect/2;camera.bottom=-camera.top;
      camera.updateProjectionMatrix();gl.render(scene,camera);
    }else{
      const res=Math.min(1,720/w,440/h);
      const sw=Math.max(1,Math.round(w*res)),sh=Math.max(1,Math.round(h*res));
      if(canvas.width!==sw||canvas.height!==sh){canvas.width=sw;canvas.height=sh;}
      soft.render(orbit,units);
    }
    if(rotating||inspectTime!==null)request();
  }
  function request(){if(!disposed&&!frame)frame=requestAnimationFrame(paint);}
  function reset(){yaw=0;pitch=0;panX=panY=0;zoom=1;rotating=false;inspectTime=null;
    if(model&&isKnife(id)){animateKnife(model,id);model.position.copy(restPosition);model.rotation.z=0;}
    onZoom(zoom,rotating);request();
  }
  function setZoom(value,px=0,py=0){
    const newZoom=bound(value,.65,2.8),ratio=newZoom/zoom;
    panX=bound(px+(panX-px)*ratio,-.9,.9);panY=bound(py+(panY-py)*ratio,-.9,.9);
    zoom=newZoom;onZoom(zoom,rotating);request();
  }
  function frameModel(){
    normalised.remove(model);model.position.set(0,0,0);model.rotation.set(0,0,0);
    if(isKnife(id))animateKnife(model,id);
    model.updateMatrixWorld(true);
    bounds.setFromObject(model,true);bounds.getCenter(center);bounds.getSize(size);
    const extent=Math.max(size.x,size.y,size.z,.01);
    const furthest=directions.map(()=>-Infinity);
    model.traverseVisible(part=>{
      if(!part.isMesh)return;
      const attr=part.geometry.attributes.position;
      for(let i=0;i<attr.count;i++){
        point.fromBufferAttribute(attr,i).applyMatrix4(part.matrixWorld).sub(center).multiplyScalar(1/extent);
        for(let j=0;j<directions.length;j++){
          const dot=point.dot(directions[j]);
          if(dot>furthest[j]){furthest[j]=dot;surface[j].copy(point);}
        }
      }
    });
    model.position.sub(center);restPosition.copy(model.position);normalised.add(model);normalised.scale.setScalar(1/extent);
    mount.position.set(0,0,0);
    if(id==='karambit')mount.rotation.set(.025,-.055,Math.PI/2,'ZXY');
    else if(isKnife(id))mount.rotation.set(.11,-.23,1.23,'ZXY');
    else mount.rotation.set(.24,Math.PI/2+.32,-.075,'ZXY');
    orbit.position.set(0,0,0);orbit.rotation.set(0,0,0);orbit.updateMatrixWorld(true);
    bounds.makeEmpty();
    for(const c of surface)bounds.expandByPoint(point.copy(c).applyMatrix4(mount.matrixWorld));
    bounds.getSize(size);initialWidth=size.x;initialHeight=size.y;
    bounds.getCenter(center);mount.position.set(-center.x,-center.y,0);
  }
  function select(value){
    if(model)normalised.remove(model);
    id=value;model=isKnife(id)?knifeMesh(id):blasterMesh(id);
    silverFill.visible=id==='karambit';
    const current=model;
    const ready=id==='shotgun'?scatterTextureReady:isKnife(id)?model.userData.armoryReady:loadGunAppearance(model);
    const pendingFit=id!=='shotgun'&&!model.userData.armoryImported;
    ready?.then(()=>{
      if(disposed||current!==model)return;
      if(pendingFit&&current.userData.armoryImported)frameModel();
      request();
    });
    frameModel();
    reset();
  }
  function pan(dx,dy){panX=bound(panX+dx/host.clientWidth,-.9,.9);panY=bound(panY-dy/host.clientHeight,-.9,.9);}
  function startGesture(){
    const a=[...contacts.values()];drag=a.length?{x:a[0].x,y:a[0].y}:null;
    if(a.length>1){drag.x=(a[0].x+a[1].x)/2;drag.y=(a[0].y+a[1].y)/2;drag.distance=Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y));}
  }
  const options={signal:abort.signal};
  host.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==2)return;
    canvas.focus({preventScroll:true});host.setPointerCapture(e.pointerId);
    contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});startGesture();host.classList.add('dragging');
  },options);
  host.addEventListener('pointermove',e=>{
    if(!contacts.has(e.pointerId)||!drag)return;
    const prior=drag;contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});startGesture();
    const dx=drag.x-prior.x,dy=drag.y-prior.y;
    if(drag.distance&&prior.distance){pan(dx,dy);setZoom(zoom*drag.distance/prior.distance);}
    else if(e.shiftKey||(e.buttons&2))pan(dx,dy);
    else{yaw+=dx*.012;pitch=bound(pitch+dy*.012,-Math.PI/2,Math.PI/2);}
    request();
  },options);
  const release=e=>{contacts.delete(e.pointerId);startGesture();if(!drag)host.classList.remove('dragging');};
  for(const kind of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(kind,release,options);
  host.addEventListener('contextmenu',e=>e.preventDefault(),options);
  host.addEventListener('wheel',e=>{
    e.preventDefault();const box=host.getBoundingClientRect(),d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?box.height:1);
    setZoom(zoom*Math.exp(-bound(d,-180,180)*.0022),(e.clientX-box.left)/box.width-.5,.5-(e.clientY-box.top)/box.height);
  },{...options,passive:false});
  host.addEventListener('keydown',e=>{
    if(e.key==='Home')reset();
    else if(e.key==='+'||e.key==='=')setZoom(zoom*1.2);
    else if(e.key==='-'||e.key==='_')setZoom(zoom/1.2);
    else if(e.key.startsWith('Arrow')){
      const dx=Number(e.key==='ArrowRight')-Number(e.key==='ArrowLeft'),dy=Number(e.key==='ArrowDown')-Number(e.key==='ArrowUp');
      if(e.shiftKey)pan(dx*24,dy*24);
      else{yaw+=dx*.18;pitch=bound(pitch+dy*.18,-Math.PI/2,Math.PI/2);}
    }else return;
    e.preventDefault();request();
  },options);
  const observer=new ResizeObserver(request);observer.observe(host);observer.observe(bench);
  return {
    select,reset,zoom:multiplier=>setZoom(zoom*multiplier),
    spin(){rotating=!rotating;onZoom(zoom,rotating);request();},
    animate(){if(isKnife(id)){inspectTime=performance.now();request();}},
    dispose(){disposed=true;abort.abort();observer.disconnect();cancelAnimationFrame(frame);if(gl){scene.environment?.dispose();gl.dispose();gl.forceContextLoss();}model=null;},
  };
}

let openViewer=null;

export function openArmoryViewer({weapon='rifle',equippedPrimary='rifle',equippedSidearm='pistol',equippedKnife='karambit',lite=false,onEquip,onClose}={}){
  if(openViewer){openViewer.select(weapon);return openViewer;}
  const dialog=document.createElement('dialog');
  dialog.className='armory-dialog';dialog.setAttribute('aria-labelledby','armory-dialog-heading');
  const choices=catalog.map(id=>`<button type="button" class="armory-item" data-id="${id}" aria-pressed="false"><img src="${weaponImageUrl(`loadout-${id}.png`)}" alt=""><span>${nameOf(id)}</span></button>`).join('');
  const options=catalog.map(id=>`<option value="${id}">${nameOf(id)}${isKnife(id)||!WEAPONS[id].callsign?'':' · '+typeOf(id)}</option>`).join('');
  dialog.innerHTML=`<header class="armory-header"><h2 id="armory-dialog-heading">무기 자세히 보기</h2><button type="button" class="armory-close" aria-label="닫기" title="닫기 (Esc)">${icon('close')}</button></header>
    <div class="armory-body">
      <aside class="armory-rail" aria-label="무기 선택">${choices}</aside>
      <section class="armory-display" aria-label="선택한 무기">
        <canvas class="armory-bench" aria-hidden="true"></canvas>
        <div class="armory-identity"><div><p class="armory-kind"><span class="armory-slot"></span><span class="armory-credit" hidden> · 모델 <a href="./assets/weapon-photo-CREDITS.txt" target="_blank" rel="noopener">Frostoise · CC BY 4.0</a></span></p><h3 class="armory-name"></h3></div><select class="armory-picker" aria-label="다른 무기 보기">${options}</select></div>
        <div class="armory-viewport"><div class="armory-surface"></div></div>
        <div class="armory-tools">
          <button type="button" class="armory-spin" aria-pressed="false" title="자동 회전">${icon('spin')}<span>자동 회전</span></button>
          <button type="button" class="armory-action" hidden>동작 재생</button>
          <div class="armory-zoom"><button type="button" class="armory-out" aria-label="축소"> ${icon('minus')}</button><output aria-label="확대 배율">100%</output><button type="button" class="armory-in" aria-label="확대">${icon('plus')}</button></div>
          <button type="button" class="armory-reset" aria-label="기본 각도와 배율로 복원" title="기본 각도와 배율로 복원">${icon('reset')}</button>
        </div>
        <div class="armory-footer"><dl class="armory-stats"></dl><button type="button" class="armory-equip"></button></div>
        <p class="armory-guide">드래그로 회전 · 휠로 확대 · Shift + 드래그로 이동</p>
      </section>
    </div>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),buttons=[...dialog.querySelectorAll('.armory-item')];
  const spin=$('.armory-spin'),zoomLabel=$('output'),equip=$('.armory-equip'),picker=$('.armory-picker'),action=$('.armory-action');
  let selected,stage,closed=false;
  function updateControls(zoom,spinning){
    zoomLabel.value=Math.round(zoom*100)+'%';spin.setAttribute('aria-pressed',String(spinning));
    $('.armory-in').disabled=zoom>=2.799;$('.armory-out').disabled=zoom<=.651;
  }
  function updateEquip(){
    const equipped=selected===equippedSidearm||selected===equippedPrimary||selected===equippedKnife;
    equip.hidden=!onEquip;equip.disabled=equipped;equip.textContent=equipped?'장착 중':'장착하기';
  }
  function select(id){
    if(!catalog.includes(id))id='rifle';
    selected=id;picker.value=id;
    for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.id===id));
    const chosen=buttons.find(b=>b.dataset.id===id);
    if(chosen&&chosen.offsetParent)chosen.scrollIntoView({block:'nearest',inline:'nearest'});
    $('.armory-slot').textContent=(isKnife(id)?'근접 슬롯':isSecondaryWeapon(id)?'보조 슬롯':'주무기 슬롯')+' / '+typeOf(id);
    $('.armory-credit').hidden=id!=='burst';
    $('.armory-name').textContent=nameOf(id);
    const w=isKnife(id)?WEAPONS.knife:WEAPONS[id];
    const stats=[['기본 피해',w.pellets?w.damage+' × '+w.pellets:w.damage],
      isKnife(id)?['공격 간격',w.interval+'초']:['탄창',w.mag+'발']];
    $('.armory-stats').innerHTML=stats.map(([key,value])=>`<div><dt>${key}</dt><dd>${value}</dd></div>`).join('');
    action.hidden=!isKnife(id);action.textContent=id==='balisong'?'플립 재생':'회전 동작';
    updateEquip();stage.select(id);
  }
  function cleanup(){
    if(closed)return;
    closed=true;stage?.dispose();dialog.remove();openViewer=null;onClose?.();
  }
  dialog.addEventListener('close',cleanup,{once:true});
  $('.armory-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{
    if(e.target===dialog){const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)dialog.close();}
  });
  dialog.showModal();
  try{
    stage=makeStage($('.armory-surface'),lite,updateControls);
    openViewer={select,close:()=>dialog.close()};
    for(const b of buttons)b.onclick=()=>select(b.dataset.id);
    picker.onchange=()=>select(picker.value);spin.onclick=()=>stage.spin();action.onclick=()=>stage.animate();
    $('.armory-out').onclick=()=>stage.zoom(1/1.25);$('.armory-in').onclick=()=>stage.zoom(1.25);
    $('.armory-reset').onclick=()=>stage.reset();
    equip.onclick=()=>{
      onEquip?.(selected);
      if(isKnife(selected))equippedKnife=selected;else if(isSecondaryWeapon(selected))equippedSidearm=selected;else equippedPrimary=selected;
      updateEquip();
    };
    select(weapon);
    return openViewer;
  }catch(error){dialog.close();cleanup();throw error;}
}
