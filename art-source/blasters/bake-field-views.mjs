// Called by a browser build runner. 'dist' must be served at the current origin.
// Each invocation returns one weapon so the upload bridge never transports a
// whole arsenal of uncompressed frames at once. The game supplies all poses.
export async function bakeFieldViews(kind,options={}){
  const moduleAt=path=>import(new URL(path,location.href).href);
  const [{ArenaRenderer},{blasterMesh,gunFit},{createRange},{getArena},T,{gunPresentation},{opticFit,REFLEX_APERTURE}]=await Promise.all([
    moduleAt('/render.js'),moduleAt('/blaster.js'),moduleAt('/sim.js'),moduleAt('/arena-map.js'),moduleAt('/assets/three.module.min.js'),moduleAt('/weapon-view.js'),moduleAt('/optic-fit.js'),
  ]);
  if(!Object.hasOwn(gunFit,kind))throw Error('Unknown field weapon '+kind);
  if(kind==='shotgun')await (await moduleAt('/scatter-model.js')).scatterTextureReady;
  else{
    const {loadArmoryAsset}=await moduleAt('/armory-asset.js');
    if(!await loadArmoryAsset(kind))throw Error('Missing finished armory model for '+kind);
  }
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const viewCanvas=canvas(640,360);viewCanvas.style.cssText='width:640px;height:360px;display:block';
  document.body.replaceChildren(viewCanvas);
  const arena=new ArenaRenderer(viewCanvas,getArena('switchyard'));
  const {gloveTextureReady}=await moduleAt('/view-hands.js');
  await gloveTextureReady;
  const g=createRange(),actor=g.players[0];actor.active=kind;
  arena.gl.render=()=>{};
  const output=options.metadataOnly?null:new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  if(output){output.setClearColor(0,0);output.outputColorSpace=arena.gl.outputColorSpace;output.setSize(640,360,false);}
  const round=v=>Math.round(v*100000)/100000;
  const windowMesh=arena.guns[kind].getObjectByName('reflex-window'),glass=windowMesh?{still:[]}:null;
  if(Boolean(windowMesh)!==Boolean(opticFit(kind)))throw Error('Unexpected reflex geometry on '+kind);
  // Save the convex aperture photographed in a particular tile. Geometry
  // vertices include the cut corners, so the in-game dot clips to the rim.
  const aperture=()=>REFLEX_APERTURE.flatMap(([x,y])=>{
    const p=windowMesh.localToWorld(new T.Vector3(x,y,0)).project(arena.gunCamera);
    return [round((1+p.x)/2),round((1-p.y)/2)];
  });

  const photo=(held,shotAge,load,variant,aim=Number(held))=>{
    const dt=1/60;
    actor.ads=held;actor.speed=0;actor.slide=0;
    actor.ammo=variant==='empty'?0:variant==='loopEnd'?1:options.capacity-1;
    actor.shellLoop=variant==='loopStart';actor.reserve=12;
    actor.reloadDuration=(variant==='empty'?options.emptyDuration:options.reloadDuration)||1;
    actor.reload=load===null?0:Math.max(.000001,(1-load)*actor.reloadDuration);
    const raise=kind==='sniper'?14:gunPresentation(kind).aimSpeed;
    arena.equip=0;arena.active=kind;arena.aim=held?1+(aim-1)*Math.exp(raise*dt):aim;arena.flashTime=0;
    arena.lastFocus=actor.id;arena.lastYaw=0;arena.lastPitch=0;
    arena.lastSeq=g.seq;arena.shotAge=shotAge-dt;arena.shotWeapon=shotAge<8?kind:null;
    arena.draw(g,actor.id,{t:1,dt,yaw:0,pitch:0,ads:held,quality:'high'});
    // Scope masking is a HUD layer. The ADS still is also used in transitions.
    arena.guns[kind].visible=true;
    arena.flash.visible=false;arena.gunCamera.aspect=16/9;arena.gunCamera.updateProjectionMatrix();
    const dot=arena.guns[kind].getObjectByName('reflex-reticle');if(dot)dot.visible=false;
    output?.render(arena.gunScene,arena.gunCamera);
    const fit=gunFit[kind];
    const projectBore=z=>{
      const point=arena.guns[kind].localToWorld(new T.Vector3(fit.muzzleX,fit.muzzleY,z));
      const depth=-arena.gunCamera.worldToLocal(point.clone()).z;
      point.project(arena.gunCamera);
      return [round((point.x+1)/2),round((1-point.y)/2),round(depth)];
    };
    // The second five-decimal UV/depth sample records the bore axis of this
    // exact tile, including receiver pitch, optic alignment and reload roll.
    return [...projectBore(fit.muzzle),...projectBore(fit.muzzle-.22)];
  };
  const stops=options.aimStops||[0,1],base=output?canvas(640*stops.length,360):null,baseCtx=base?.getContext('2d'),muzzles=[];
  for(const [i,aim] of stops.entries()){
    muzzles.push(photo(aim>0,100,null,null,aim));if(output)baseCtx.drawImage(output.domElement,i*640,0);
    if(glass)glass.still.push(aperture());
  }
  const result={muzzles,glass};if(base)result.row=base.toDataURL('image/png');
  if(kind==='rifle'&&output){
    const strip=canvas(1280,720),ctx=strip.getContext('2d');
    for(let i=0;i<16;i++){
      photo(false,100,i/15,'reload');
      ctx.drawImage(output.domElement,(i%4)*320,Math.floor(i/4)*180,320,180);
    }
    result.rifleReload=strip.toDataURL('image/webp',.94);
  }
  if(options.reloadTimes){
    const shots=options.shotTimes,loads=options.reloadTimes;
    const sequences=shots?{fire:shots,reload:loads}:{reload:loads};
    if(kind==='shotgun'||kind==='revolver')sequences.fireADS=shots;
    if(kind==='shotgun'){
      sequences.loopStart=loads.filter(t=>t<.15);
      sequences.loopEnd=loads.filter(t=>t>.76);
    }else if(kind==='sniper')sequences.empty=loads.filter(t=>t>=options.emptyStart&&t<1);
    const frameCount=Object.values(sequences).reduce((count,times)=>count+times.length,0);
    const [cx,cy,cw,ch]=options.crop,n=options.columns;
    const strideX=cw+4,strideY=ch+4;
    const anim=output?canvas(n*strideX,Math.ceil(frameCount/n)*strideY):null;
    const ctx=anim?.getContext('2d'),poses={};let frame=0;
    for(const [set,times] of Object.entries(sequences)){
      const fire=set==='fire'||set==='fireADS';
      const seq=poses[set]=[];
      for(const time of times){
        const muzzle=photo(set==='fireADS',fire?time:100,fire?null:time,set);
        if(glass&&fire)(glass[set]??=[]).push(aperture());
        // Cropped from a 512×288 view. Transparent gutters isolate neighbouring tiles.
        if(output)ctx.drawImage(output.domElement,cx*1.25,cy*1.25,cw*1.25,ch*1.25,(frame%n)*strideX+2,Math.floor(frame/n)*strideY+2,cw,ch);
        seq.push([frame++,...muzzle]);
      }
    }
    if(anim)result.sequence=shots?anim.toDataURL('image/webp',.94):anim.toDataURL('image/png');
    result.poses=poses;
  }
  if(!output){arena.gl.dispose();arena.gl.forceContextLoss();return result;}
  const scene=new T.Scene(),model=blasterMesh(kind);scene.add(model,new T.HemisphereLight(0xffffff,0xaec4dc,2.3));
  const key=new T.DirectionalLight(0xfff6dd,3.2),rim=new T.DirectionalLight(0x99dfff,1.1);
  key.position.set(2,3,-1);rim.position.set(-2,2,2);scene.add(key,rim);
  const center=new T.Box3().setFromObject(model).getCenter(new T.Vector3()),cam=new T.OrthographicCamera(-1,1,1,-1,.01,9);
  cam.position.copy(center).add(new T.Vector3(-2,.78,-.57));cam.lookAt(center);cam.rotateZ(-.075);cam.updateMatrixWorld(true);
  const bounds=new T.Box3(),v=new T.Vector3();
  model.traverseVisible(o=>{if(o.isMesh){
    const a=o.geometry.attributes.position;
    for(let i=0;i<a.count;i++)bounds.expandByPoint(v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).applyMatrix4(cam.matrixWorldInverse));
  }});
  const extent=bounds.getSize(new T.Vector3()),mid=bounds.getCenter(new T.Vector3()),h=Math.max(extent.y,extent.x*166/400)*1.18,w=h*400/166;
  Object.assign(cam,{left:mid.x-w/2,right:mid.x+w/2,top:mid.y+h/2,bottom:mid.y-h/2});cam.updateProjectionMatrix();
  output.setSize(400,166,false);output.render(scene,cam);result.card=output.domElement.toDataURL('image/png');
  output.dispose();output.forceContextLoss();arena.gl.dispose();arena.gl.forceContextLoss();
  return result;
}
