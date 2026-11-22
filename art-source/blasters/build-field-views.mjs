// Build runner for the ego-browser Node bridge, using the project's local HTTP
// server. Set fieldBakeOptions in the calling script before importing this file.
// e.g. globalThis.fieldBakeOptions={assets:'C:/.../dist/assets',space:23,page:'p2',origin:'http://127.0.0.1:18765'}
const {assets,space,page:label,origin}=globalThis.fieldBakeOptions;
const fs=await import('node:fs/promises');
const task=await taskSpace(space),page=task.page(label);
const source=await fs.readFile(new URL('./bake-field-views.mjs',import.meta.url),'utf8');
const guns=['shotgun','sniper','smg','burst','marksman','lmg','pistol'];
const magazines={columns:5,crop:[64,72,448,216],reloadTimes:[0,.21,.425,.61,.93]};
const options={
  shotgun:{columns:4,crop:[128,108,384,180],shotTimes:[0,.025,.06,.10,.15,.20,.25,.31,.36,.40,.46,.54],reloadTimes:[0,.045,.085,.13,.19,.23,.30,.36,.44,.50,.54,.59,.68,.76,.82,.88,.94,1]},
  sniper:{columns:4,crop:[192,100,320,188],shotTimes:[0,.025,.07,.12,.18,.23,.29,.36,.45,.57,.67,.72,.78,.85,.90],reloadTimes:[0,.05,.10,.15,.19,.25,.34,.45,.55,.60,.63,.67,.71,.76,.81,.86,.90,.93,.97,1]},
};
const decode=s=>Buffer.from(s.slice(s.indexOf(',')+1),'base64');
const manifest={},staged=new Map();
await page.goto(origin+'/sim.js?bake=field');
for(const [index,kind] of guns.entries()){
  const bake=options[kind]||magazines;
  const result=await page.evaluate(async({source,kind,options,index})=>{
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try{
      const {bakeFieldViews}=await import(url);
      const {WEAPONS}=await import('/balance.js');
      const result=await bakeFieldViews(kind,{...options,capacity:WEAPONS[kind].mag,reloadDuration:WEAPONS[kind].reload,emptyDuration:WEAPONS[kind].emptyReload});
      // Collect the full-resolution row in the page. No lossy intermediate.
      if(!window.fieldSheet){
        window.fieldSheet=document.createElement('canvas');window.fieldSheet.width=1280;window.fieldSheet.height=2520;
      }
      const image=new Image();image.src=result.row;await image.decode();
      const guns=['shotgun','sniper','smg','burst','marksman','lmg','pistol'];
      window.fieldSheet.getContext('2d').drawImage(image,0,360*guns.indexOf(kind));
      if(index>=2){
        if(!window.magSheet)window.magSheet=document.createElement('canvas');
        const motion=new Image();motion.src=result.sequence;await motion.decode();
        if(index===2){window.magSheet.width=motion.width;window.magSheet.height=motion.height*5;}
        window.magSheet.getContext('2d').drawImage(motion,0,(index-2)*motion.height);
        for(const frame of result.poses.reload)frame[0]+=(index-2)*options.columns;
        delete result.sequence;
      }
      delete result.row;return result;
    }finally{URL.revokeObjectURL(url);}
  },{source,kind,index,options:bake});
  manifest[kind]={row:index,muzzles:result.muzzles,...bake,poses:result.poses};
  staged.set('loadout-'+kind+'.png',decode(result.card));
  if(result.sequence){
    staged.set(kind+'-motion.webp',decode(result.sequence));
  }
  console.log(kind,'hip / ADS',result.muzzles);
}
const sheet=await page.evaluate(()=>window.fieldSheet.toDataURL('image/webp',.96));
staged.set('field-views.webp',decode(sheet));
const mags=await page.evaluate(()=>window.magSheet.toDataURL('image/webp',.94));
staged.set('field-reloads.webp',decode(mags));
const rows=Object.entries(manifest).map(([name,value])=>'  '+name+':'+JSON.stringify(value));
staged.set('field-frames.js','// Generated with art-source/blasters/build-field-views.mjs.\nexport const fieldViews={\n'+rows.join(',\n')+'\n};\n');
for(const [name,data] of staged)await fs.writeFile(assets+'/'+name,data);
console.log('Wrote',staged.size,'files');
