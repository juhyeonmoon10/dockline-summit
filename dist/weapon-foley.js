// Recorded action takes, stored together to unlock all reloads with one request.
// Durations and the silent guard between takes are in milliseconds.
export const foleyUrl='./assets/audio/foley/mechanisms.ogg';
export const revolverFoleyUrl='./assets/audio/foley/revolver.ogg';
export const cylinderCues=[['cylinderOpen',165],['cylinderEject',245],['loaderSeat',170],['cylinderClose',190]];
const guard=30;
const cues=[
  ['magOut',296],['magSeat',151],['settle',94],
  ['pistolOut',290],['pistolSeat',102],['smgOut',137],['smgSeat',98],
  ['sniperOut',86],['sniperSeat',105],['heavyOut',129],['heavySeat',141],
  ['shell',142],['shellAlt',206],['pumpOpen',170],['pumpClose',204],
  ['boltOpen',224],['boltClose',215]
];

export function unpackFoley(ctx,decoded,sequence=cues){
  const buffers=new Map(),rate=decoded.sampleRate;
  let offset=guard;
  for(const [id,duration] of sequence){
    const start=Math.round(offset*rate/1000),end=Math.round((offset+duration)*rate/1000);
    if(end>decoded.length)throw new Error('Incomplete recorded action pack');
    const take=ctx.createBuffer(decoded.numberOfChannels,end-start,rate);
    for(let c=0;c<decoded.numberOfChannels;c++){
      take.copyToChannel(decoded.getChannelData(c).subarray(start,end),c);
    }
    buffers.set(id,take);offset+=duration+guard;
  }
  return buffers;
}

const rifle={out:'magOut',seat:'magSeat',settle:'settle'};
const precision={out:'sniperOut',seat:'sniperSeat',settle:'settle'};
const magazines={
  rifle,burst:rifle,marksman:precision,sniper:precision,
  pistol:{out:'pistolOut',seat:'pistolSeat',settle:'settle'},
  smg:{out:'smgOut',seat:'smgSeat',settle:'settle'},
  lmg:{out:'heavyOut',seat:'heavySeat',settle:'settle'}
};
export function reloadClips(weapon){return magazines[weapon]||rifle;}
