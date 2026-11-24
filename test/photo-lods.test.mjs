import test from 'node:test';
import assert from 'node:assert/strict';
import {armoryBytes,armoryData,armoryPositions} from '../dist/armory-data.js';
import {PRIMARY_WEAPONS,SECONDARY_WEAPONS} from '../dist/balance.js';

function drawnBounds(parts){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const part of parts){
    const positions=armoryPositions(part.positions);
    const indices=new Uint16Array(armoryBytes(part.faces).buffer);
    for(const index of indices)for(let axis=0;axis<3;axis++){
      const coordinate=positions[index*3+axis];
      lo[axis]=Math.min(lo[axis],coordinate);
      hi[axis]=Math.max(hi[axis],coordinate);
    }
  }
  return [lo,hi];
}

function assertSilhouette(label,source,actual){
  const span=source[1].map((value,i)=>value-source[0][i]);
  for(let axis=0;axis<3;axis++){
    // The bake rounds positions to 0.1 mm when packing them into the game.
    const tolerance=Math.max(span[axis]*.10,Math.max(...span)*.008)+.0017;
    for(let end=0;end<2;end++){
      assert.ok(Math.abs(source[end][axis]-actual[end][axis])<=tolerance,
        label+' lost an exterior extremity on '+['x','y','z'][axis]);
    }
  }
}

test('photo guns retain their exterior in both the carried mesh and each preview part',async()=>{
  for(const id of [...PRIMARY_WEAPONS,...SECONDARY_WEAPONS]){
    const data=await armoryData(id);
    assert.deepEqual(Object.keys(data.preview).sort(),Object.keys(data.held).sort(),id);
    for(const [name,part] of Object.entries(data.held)){
      assertSilhouette(id+' preview '+name,drawnBounds([part]),drawnBounds([data.preview[name]]));
    }
    assertSilhouette(id+' carried',drawnBounds(Object.values(data.held)),drawnBounds(Object.values(data.carried)));
  }
});
