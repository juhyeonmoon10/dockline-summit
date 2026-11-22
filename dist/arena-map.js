// Dimensions in metres. Team one mirrors team zero through the centre of the court.
const pair = ({x,z,...rest}) => [{x,z,...rest},{x:-x,z:-z,...rest}];
const pairedRamp = r => [r,{...r,x:-r.x,z:-r.z,sign:-r.sign}];
const start = [
  {x:1.8,z:18.25,yaw:.25}, {x:-2.8,z:18.4,yaw:-.33}, {x:.1,z:19.4,yaw:-.08}
];
export const MAP = {
  id:'summit', label:'서밋 옥상', name:'서밋 옥상', title:'SUMMIT', description:'중앙 고가교와 양쪽 경사로가 만나는 옥상 경기장', width:35, depth:42,
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
  {x:-3.0,z:21.2,yaw:.22}, {x:-6.8,z:21.5,yaw:.34}, {x:6.4,z:22.1,yaw:-.22}
];
// Preserve the public room and saved preference ID of the old freight yard.
const SWITCHYARD = {
  id:'switchyard', label:'세관 4번 창고', name:'세관 4번 창고', title:'CUSTOMS 04',
  description:'중앙 계근대, 서쪽 검수 통로, 동쪽 하역 데크',
  preview:{x:11.8,y:5.4,z:17.7,targetX:-.5,targetY:2.65,targetZ:-1.6},
  width:32, depth:48, zone:{x:0,y:0,z:0,r:2.45},
  spawns:[yardStart,yardStart.map(p=>({x:-p.x,z:-p.z,yaw:p.yaw+Math.PI}))],
  patrols:[{x:0,y:0,z:.4},{x:-12,y:0,z:7},{x:10.2,y:0,z:12.8}]
    .map((opening,seat)=>[opening,{x:-yardStart[seat].x,y:0,z:-yardStart[seat].z}]),
  plates:pair({x:-3,y:1.65,z:15.7}),
  rangeTargets:[
    {x:-3,y:0,z:15.8}, {x:1.4,y:0,z:10.4}, {x:-11.9,y:0,z:12.6}, {x:8.5,y:0,z:15.15}
  ],
  boxes:[
    ...pair({x:5.3,z:8.8,w:3.15,d:7.9,h:3.14,kind:'trailer'}),
    ...pair({x:5.3,z:13.67,w:2.84,d:1.84,h:2.76,kind:'cab'}),
    ...pair({x:5.3,z:15.04,w:2.84,d:.9,h:1.21,kind:'hood'}),
    ...pair({x:-2.6,z:5.0,w:10.65,d:.48,h:3.24,kind:'partition'}),
    ...pair({x:-8.15,z:8.6,w:.46,d:7.65,h:4.8,kind:'inspection'}),
    ...pair({x:-12.0,z:9.2,w:4.5,d:.44,h:3.1,kind:'officeDoor'}),
    ...pair({x:-14.7,z:4.0,w:.44,d:9.3,h:3.1,kind:'officeWindow'}),
    ...pair({x:12.9,z:.4,w:5.4,d:9.2,h:1.18,kind:'dock'}),
    ...pair({x:9.9,z:.55,w:.55,d:5.5,h:1.87,kind:'pallet'}),
    ...pair({x:7.9,z:18.0,w:2.7,d:1.4,h:.96,kind:'sack'}),
    ...pair({x:-13.7,z:19.2,w:3.4,d:2.4,h:2.14,kind:'pallet'}),
    ...pair({x:-9.1,z:14.5,w:1.4,d:1.4,h:1.09,kind:'crate'}),
    ...pair({x:14.25,z:12.7,w:2.6,d:3.3,h:2.27,kind:'pallet'}),
    {x:0,z:0,w:2.82,d:.55,base:3.92,h:4.86,kind:'display'},
  ],
  ramps:pairedRamp({x:12.9,z:7.2,w:5.4,d:4.4,h:1.18,axis:'z',sign:-1,kind:'dock'}),
};

export const ARENAS = [SWITCHYARD, MAP];
export function getArena(id) {
  return ARENAS.find(arena=>arena.id===id) || MAP;
}
