import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRIMARY_WEAPONS,SECONDARY_WEAPONS} from '../dist/balance.js';
import {blasterMesh,loadGunAppearance} from '../dist/blaster.js';
import {armoryData,armoryPositions,loadCarriedArmory} from '../dist/armory-data.js';
import {opticFit} from '../dist/optic-fit.js';
import {Raycaster,Vector3} from '../dist/assets/three.module.min.js';

test('each gun ships the exterior from its credited source export',async()=>{
  const ids=[...PRIMARY_WEAPONS,...SECONDARY_WEAPONS];
  const credits=await readFile(new URL('../dist/assets/weapon-photo-CREDITS.txt',import.meta.url),'utf8');
  const records=credits.split(/\r?\n\r?\n/);
  const sources=new Set();
  for(const id of ids){
    const record=records.find(section=>section.split('\n',1)[0].includes('('+id+')'));
    const hashLine=id==='burst'?/^Community GLB SHA-256: ([a-f0-9]{64})\s*$/m:/^Tripo GLB SHA-256: ([a-f0-9]{64})\s*$/m;
    const sha=record?.match(hashLine)?.[1];
    assert.ok(sha,id+' has a credited source');
    const data=await armoryData(id);
    assert.equal(data.sourceSha256,sha,id+' package matches the source credit');
    assert.equal(data.completeExterior,true,id+' replaces the whole earlier body');
    if(id==='burst'){
      const credit=data.sourceCredit;
      assert.equal(credit.author,'Frostoise');
      assert.equal(credit.license,'CC BY 4.0');
      for(const value of [credit.title,credit.author,credit.url,credit.licenseURL])assert.ok(record.includes(value));
      const triangles=part=>Buffer.from(part.faces,'base64').length/6;
      assert.equal(triangles(data.held.magazine),1860,'the entire authored magazine animates');
      assert.equal(triangles(data.held.body)+triangles(data.held.magazine),data.sourceTriangles);
      assert.equal(data.sourceTriangles,24010,'all three authored material islands reach the game');
      assert.deepEqual(data.maps,['orm'],'artist normals and authored surface finish');
    }
    sources.add(sha);
  }
  assert.equal(sources.size,ids.length,'each gun uses a separate source export');
});

test('the untextured FAMAS LODs retain its dark rear panel and brighter worn edges',async()=>{
  const data=await armoryData('burst');
  for(const lod of ['preview','carried']){
    const part=data[lod].body,positions=armoryPositions(part.positions);
    const colors=Buffer.from(part.colors,'base64'),tones=[],stock=[];
    for(let i=0;i<positions.length;i+=3){
      const tone=(colors[i]+colors[i+1]+colors[i+2])/3;
      tones.push(tone);
      const [x,y,z]=positions.subarray(i,i+3);
      if(z>.24&&Math.abs(x)>.014&&y>.01&&y<.085)stock.push(tone);
    }
    stock.sort((a,b)=>a-b);tones.sort((a,b)=>a-b);
    const middle=stock[Math.floor(stock.length/2)];
    assert.ok(stock.length>=4&&middle>=20&&middle<=78,lod+' rear panel has the gunmetal finish');
    assert.ok(tones[Math.floor(tones.length*.9)]-tones[Math.floor(tones.length*.1)]>30,lod+' retains edge contrast');
  }
});

test('imported gun bodies replace the fallback while retaining each player’s action and sights',async()=>{
  for(const id of [...PRIMARY_WEAPONS,...SECONDARY_WEAPONS].filter(id=>id!=='shotgun')){
    const first=blasterMesh(id),magazine=first.getObjectByName('magazine'),window=first.getObjectByName('reflex-window');
    await loadGunAppearance(first);
    const second=blasterMesh(id),body=first.getObjectByName('tripo-exterior');
    assert.ok(body?.geometry.attributes.uv,id+' has a textured exterior');
    assert.ok(body.userData.previewGeometry.attributes.color,id+' has a software preview');
    assert.equal(second.getObjectByName('tripo-exterior').geometry,body.geometry,id+' instances share geometry');
    assert.equal(first.getObjectByName('body'),undefined,id+' fallback removed');
    if(id!=='revolver'){
      assert.ok(magazine,id+' has a magazine');
      assert.equal(first.getObjectByName('magazine'),magazine);
      assert.notEqual(second.getObjectByName('magazine'),magazine);
    }else assert.ok(first.getObjectByName('cylinder-hinge')&&first.getObjectByName('hammer'));
    const optic=opticFit(id);
    if(optic){
      assert.ok(window&&first.getObjectByName('reflex-window')===window);
      const ray=new Raycaster(new Vector3(optic.x,.8,optic.z+.010*optic.scale),new Vector3(0,-1,0));
      const pad=ray.intersectObject(body)[0];
      assert.ok(pad&&Math.abs(pad.point.y-(optic.y-.050*optic.scale))<.015,id+' optic mount contacts the imported body');
    }
    if(id==='sniper')assert.ok(first.getObjectByName('bolt')&&first.getObjectByName('ocular-glass'));
    const {body:carried}=await loadCarriedArmory(id);
    assert.ok(carried.index.length>=30&&carried.index.length<=3600,id+' carried model budget');
    assert.equal(carried.position.length,carried.color.length);
  }
});
