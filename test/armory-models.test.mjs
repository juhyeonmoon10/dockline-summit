import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRIMARY_WEAPONS,SECONDARY_WEAPONS} from '../dist/balance.js';
import {blasterMesh,loadGunAppearance} from '../dist/blaster.js';
import {armoryData,loadCarriedArmory} from '../dist/armory-data.js';
import {opticFit} from '../dist/optic-fit.js';
import {Raycaster,Vector3} from '../dist/assets/three.module.min.js';

test('each gun ships the full exterior from its credited Tripo export',async()=>{
  const ids=[...PRIMARY_WEAPONS,...SECONDARY_WEAPONS];
  const credits=await readFile(new URL('../dist/assets/weapon-photo-CREDITS.txt',import.meta.url),'utf8');
  const records=credits.split(/\r?\n\r?\n/);
  const sources=new Set();
  for(const id of ids){
    const record=records.find(section=>section.split('\n',1)[0].includes('('+id+')'));
    const sha=record?.match(/^Tripo GLB SHA-256: ([a-f0-9]{64})\s*$/m)?.[1];
    assert.ok(sha,id+' has a credited source');
    const data=await armoryData(id);
    assert.equal(data.sourceSha256,sha,id+' package matches the source credit');
    assert.equal(data.completeExterior,true,id+' replaces the whole earlier body');
    sources.add(sha);
  }
  assert.equal(sources.size,ids.length,'each gun uses a separate source export');
});

test('Tripo gun bodies replace the fallback while retaining each player’s action and sights',async()=>{
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
