import * as T from './assets/three.module.min.js';
import {PRIMARY_WEAPONS,WEAPONS} from './balance.js';
import {blasterMesh} from './blaster.js';
import {knifeMesh,animateKnife} from './knife.js';
import {KNIFE_LABELS} from './knife-types.js';
import {createCanvasPreview} from './armory-canvas.js';
import {studioReflection} from './weapon-light.js';

const knives=Object.keys(KNIFE_LABELS);
const catalog=[...PRIMARY_WEAPONS,'pistol',...knives];
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
  scene.add(new T.HemisphereLight(0xebf4ff,0x978574,1.65));
  for(const [color,intensity,x,y,z] of [[0xffefd9,3.25,-3,4,4],[0xc9ecff,2.65,2,2,-3],[0xe1efff,1.4,2,-.9,3]]){
    const light=new T.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
  }
}

function makeStage(host,preferLite,onZoom){
  let canvas,gl,soft,frame=0,lastTime=0,disposed=false,rotating=false,inspectTime=null;
  let id,model,zoom=1,yaw=0,pitch=0,panX=0,panY=0,units=1,initialWidth=1,initialHeight=.5;
  const scene=new T.Scene(),orbit=new T.Group(),mount=new T.Group(),normalised=new T.Group();
  const camera=new T.OrthographicCamera(-1,1,1,-1,.01,20);camera.position.z=4;
  scene.add(orbit);orbit.add(mount);mount.add(normalised);stageLights(scene);
  const bounds=new T.Box3(),center=new T.Vector3(),size=new T.Vector3(),point=new T.Vector3();
  // A sparse convex envelope follows crooked blades as well as long barrels.
  // A rotated bounding box leaves too much empty space around a curved blade.
  const directions=[],surface=[];
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){
    if(x||y||z){directions.push(new T.Vector3(x,y,z));surface.push(new T.Vector3());}
  }
  const abort=new AbortController(),contacts=new Map();
  let drag=null;
  function addCanvas(){
    canvas=document.createElement('canvas');canvas.className='armory-canvas';canvas.tabIndex=0;
    canvas.setAttribute('aria-label','무기 3D 모델. 방향키로 회전, 더하기와 빼기 키로 확대 또는 축소');
    host.replaceChildren(canvas);
  }
  function software(){
    addCanvas();soft=createCanvasPreview(canvas);host.dataset.renderer='canvas';
  }
  addCanvas();
  if(!preferLite){
    try{
      gl=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      gl.setClearColor(0,0);scene.environment=studioReflection();host.dataset.renderer='webgl';
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
    const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
    if(rotating&&!drag)yaw+=dt*.60;
    let inspectRoll=0,inspectTilt=0;
    if(inspectTime!==null){
      const age=(time-inspectTime)/1000;
      animateKnife(model,id,Infinity,age);
      if(id==='karambit'){
        const t=bound(age/2.35,0,1),smooth=t*t*(3-2*t);
        inspectRoll=2*Math.PI*smooth;inspectTilt=.23*Math.sin(t*Math.PI*2);
      }
      if(age>=3.25){animateKnife(model,id);inspectTime=null;}
    }
    orbit.rotation.set(pitch+inspectTilt,yaw+inspectRoll,0,'XYZ');
    orbit.position.set(0,0,0);
    const folded=id==='balisong'&&inspectTime!==null;
    units=fit(folded)/zoom;
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),aspect=w/h;
    // Pan is stored in viewport fractions so resizing retains the point of interest.
    if(folded)bounds.getCenter(point);else point.set(0,0,0);
    orbit.position.set(panX*units-point.x,panY*units/aspect-point.y,0);
    if(gl){
      const dpr=Math.min(window.devicePixelRatio||1,1.6);
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
    if(model&&isKnife(id))animateKnife(model,id);
    onZoom(zoom,rotating);request();
  }
  function setZoom(value,px=0,py=0){
    const newZoom=bound(value,.65,2.8),ratio=newZoom/zoom;
    panX=bound(px+(panX-px)*ratio,-.9,.9);panY=bound(py+(panY-py)*ratio,-.9,.9);
    zoom=newZoom;onZoom(zoom,rotating);request();
  }
  function select(value){
    if(model)normalised.remove(model);
    id=value;model=isKnife(id)?knifeMesh(id):blasterMesh(id);
    // Measure in the fresh instance's original frame, before it joins the hierarchy.
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
    model.position.sub(center);normalised.add(model);normalised.scale.setScalar(1/extent);
    mount.position.set(0,0,0);
    mount.rotation.set(isKnife(id)?.11:.24,isKnife(id)?-.23:Math.PI/2+.32,isKnife(id)?1.23:-.075,'ZXY');
    orbit.position.set(0,0,0);orbit.rotation.set(0,0,0);orbit.updateMatrixWorld(true);
    bounds.makeEmpty();
    for(const c of surface)bounds.expandByPoint(point.copy(c).applyMatrix4(mount.matrixWorld));
    bounds.getSize(size);initialWidth=size.x;initialHeight=size.y;
    bounds.getCenter(center);mount.position.set(-center.x,-center.y,0);
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
  const observer=new ResizeObserver(request);observer.observe(host);
  return {
    select,reset,zoom:multiplier=>setZoom(zoom*multiplier),
    spin(){rotating=!rotating;onZoom(zoom,rotating);request();},
    animate(){if(isKnife(id)){inspectTime=performance.now();request();}},
    dispose(){disposed=true;abort.abort();observer.disconnect();cancelAnimationFrame(frame);if(gl){scene.environment?.dispose();gl.dispose();gl.forceContextLoss();}model=null;},
  };
}

let openViewer=null;

export function openArmoryViewer({weapon='rifle',equippedPrimary='rifle',equippedKnife='karambit',lite=false,onEquip,onClose}={}){
  if(openViewer){openViewer.select(weapon);return openViewer;}
  const dialog=document.createElement('dialog');
  dialog.className='armory-dialog';dialog.setAttribute('aria-labelledby','armory-dialog-heading');
  const choices=catalog.map(id=>`<button type="button" class="armory-item" data-id="${id}" aria-pressed="false"><img src="./assets/loadout-${id}.png" alt=""><span>${nameOf(id)}</span></button>`).join('');
  const options=catalog.map(id=>`<option value="${id}">${nameOf(id)}${isKnife(id)||id==='pistol'?'':' · '+typeOf(id)}</option>`).join('');
  dialog.innerHTML=`<header class="armory-header"><h2 id="armory-dialog-heading">무기 자세히 보기</h2><button type="button" class="armory-close" aria-label="닫기" title="닫기 (Esc)">${icon('close')}</button></header>
    <div class="armory-body">
      <aside class="armory-rail" aria-label="무기 선택">${choices}</aside>
      <section class="armory-display" aria-label="선택한 무기">
        <div class="armory-identity"><div><p class="armory-kind"></p><h3 class="armory-name"></h3></div><select class="armory-picker" aria-label="다른 무기 보기">${options}</select></div>
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
    const equipped=selected==='pistol'||selected===equippedPrimary||selected===equippedKnife;
    equip.hidden=!onEquip;equip.disabled=equipped;equip.textContent=equipped?'장착 중':'장착하기';
  }
  function select(id){
    if(!catalog.includes(id))id='rifle';
    selected=id;picker.value=id;
    for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.id===id));
    const chosen=buttons.find(b=>b.dataset.id===id);
    if(chosen&&chosen.offsetParent)chosen.scrollIntoView({block:'nearest',inline:'nearest'});
    $('.armory-kind').textContent=(isKnife(id)?'근접 슬롯':id==='pistol'?'보조 슬롯':'주무기 슬롯')+' / '+typeOf(id);
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
      if(isKnife(selected))equippedKnife=selected;else if(selected!=='pistol')equippedPrimary=selected;
      updateEquip();
    };
    select(weapon);
    return openViewer;
  }catch(error){dialog.close();cleanup();throw error;}
}
