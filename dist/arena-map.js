// Dimensions in metres. Team one mirrors team zero through the centre of the court.
const pair = ({x,z,...rest}) => [{x,z,...rest},{x:-x,z:-z,...rest}];
const pairedRamp = r => [r,{...r,x:-r.x,z:-r.z,sign:-r.sign}];
const start = [
  {x:1.8,z:18.25,yaw:.25}, {x:-2.8,z:18.4,yaw:-.33}, {x:.1,z:19.4,yaw:-.08}
];
export const MAP = {
  id:'summit', label:'서밋 아레나', name:'서밋 아레나', description:'중앙 고가교와 양쪽 경사로가 만나는 입체 경기장', width:35, depth:42,
  zone:{x:0,y:2.58,z:0,r:2.24},
  spawns:[start,start.map(p=>({x:-p.x,z:-p.z,yaw:p.yaw+Math.PI}))],
  patrols:[
    [{x:0,y:2.58,z:.35},{x:-5,y:0,z:-14}],
    [{x:-10.85,y:1.64,z:.7},{x:0,y:0,z:-14}],
    [{x:11.1,y:0,z:6},{x:5,y:0,z:-14}],
  ],
  plates:[{x:1.8,y:1.65,z:13.5},{x:-1.8,y:1.65,z:-13.5}],
  // Feet of the standing targets, from the near lane to the far terrace.
  rangeTargets:[
    {x:1.8,y:0,z:12.25}, {x:-4.3,y:0,z:7},
    {x:-2.3,y:2.58,z:2}, {x:10.85,y:1.64,z:-.7}
  ],
  boxes:[
    {x:0,z:0,w:8.1,d:7.2,base:2.25,h:2.58,kind:'summit'},
    ...[-1,1].flatMap(sx=>[-1,1].map(sz=>({x:3.46*sx,z:2.85*sz,w:.8,d:1,h:2.25,kind:'pier'}))),
    ...pair({x:10.85,z:-.7,w:4.15,d:7.0,h:1.64,kind:'terrace'}),
    ...pair({x:-6.9,z:9.9,w:3.5,d:2.55,h:2.65,kind:'block'}),
    ...pair({x:7.2,z:10.05,w:3.35,d:1.75,h:1.16,kind:'pod'}),
    ...pair({x:5.15,z:15.3,w:2.4,d:1.35,h:1.02,kind:'pod'}),
    ...pair({x:-14.25,z:7.2,w:2.1,d:3.0,h:2.15,kind:'block'}),
    ...pair({x:5.85,z:2.45,w:1.65,d:2.65,h:1.1,kind:'pod'}),
    ...pair({x:14.45,z:12,w:2.4,d:1.8,h:1.13,kind:'pod'}),
  ],
  ramps:[
    ...pairedRamp({x:0,z:6.75,w:4.8,d:6.3,h:2.58,axis:'z',sign:-1,kind:'summit'}),
    ...pairedRamp({x:10.85,z:5.15,w:4.15,d:4.7,h:1.64,axis:'z',sign:-1,kind:'terrace'}),
  ],
};

const yardStart = [
  {x:-3.0,z:19.4,yaw:.10}, {x:-8.4,z:20.1,yaw:.20}, {x:8.0,z:19.8,yaw:-.17}
];
const SWITCHYARD = {
  id:'switchyard', label:'스위치야드', name:'스위치야드', description:'화차 사이의 평면 교차로와 양옆의 높은 화물 승강장',
  width:42, depth:46, zone:{x:0,y:0,z:0,r:2.45},
  spawns:[yardStart,yardStart.map(p=>({x:-p.x,z:-p.z,yaw:p.yaw+Math.PI}))],
  patrols:[{x:0,y:0,z:.4},{x:-13.2,y:1.48,z:.4},{x:9.4,y:0,z:5}]
    .map((opening,seat)=>[opening,{x:-yardStart[seat].x,y:0,z:-yardStart[seat].z}]),
  plates:pair({x:-3,y:1.65,z:14.7}),
  rangeTargets:[
    {x:-3,y:0,z:14.3}, {x:-8.1,y:0,z:7.6}, {x:.45,y:0,z:-2.4}, {x:-13.2,y:1.48,z:-3.7}
  ],
  boxes:[
    ...pair({x:5.3,z:7.45,w:3.15,d:9.1,h:3.18,kind:'boxcar'}),
    ...pair({x:-5.3,z:10.45,w:3.12,d:6.1,h:.93,kind:'flatcar'}),
    ...pair({x:-5.3,z:9.15,w:2.65,d:2.8,base:.93,h:2.55,kind:'freight'}),
    ...pair({x:13.2,z:-.4,w:4.5,d:12.8,h:1.48,kind:'platform'}),
    ...pair({x:-14.8,z:15,w:4.8,d:2.8,h:2.25,kind:'freight'}),
    ...pair({x:1.1,z:14.2,w:2.45,d:2.35,h:2.14,kind:'freight'}),
    ...pair({x:-8.7,z:3.35,w:1.8,d:3.0,h:1.04,kind:'supply'}),
    ...pair({x:3.85,z:-2.45,w:1.65,d:1.6,h:1.18,kind:'relay'}),
    ...pair({x:17.8,z:7.5,w:2.8,d:5.25,h:2.55,kind:'relay'}),
  ],
  ramps:pairedRamp({x:13.2,z:8.8,w:4.5,d:5.6,h:1.48,axis:'z',sign:-1,kind:'platform'}),
};

export const ARENAS = [MAP, SWITCHYARD];
export function getArena(id) {
  return ARENAS.find(arena=>arena.id===id) || MAP;
}
