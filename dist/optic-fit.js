// Gun-local centre of the optical glass, housing scale and the glass's final
// camera-space Z when the player shoulders that particular viewmodel.
function mount(y,z,scale,eyeZ){
  return Object.freeze({x:0,y,z,scale,eyeZ});
}
const mounts=Object.freeze({
  rifle:mount(.178,-.112,1.00,-.353),
  smg:mount(.134,-.055,.84,-.328),
  burst:mount(.152,-.062,1.00,-.358),
  shotgun:mount(.093,-.190,.98,-.417),
  marksman:mount(.108,-.149,1.08,-.394),
  lmg:mount(.182,-.011,1.07,-.365),
  pistol:mount(.127,-.067,.72,-.302)
});
export const opticFit=id=>Object.hasOwn(mounts,id)?mounts[id]:null;
// A narrower window passes the eye slightly later in the shoulder animation.
// Hand off from the hip crosshair once the whole luminous bead fits.
const eyeEntry={smg:.875,pistol:.895,shotgun:.87};
export const reflexEngaged=(id,aim)=>Boolean(opticFit(id)&&aim>=(eyeEntry[id]??.84));

// The full opening spans .076 x .054 model units. The lower shoulders
// and the two bevels at the crown give it a clear silhouette in profile.
export const REFLEX_APERTURE=Object.freeze([
  [-.033,-.027],[.033,-.027],[.038,-.020],[.038,.012],
  [.032,.023],[.022,.027],[-.022,.027],[-.032,.023],[-.038,.012],[-.038,-.020]
].map(Object.freeze));
export function insideReflexWindow(x,y,margin=0){
  for(let i=0;i<REFLEX_APERTURE.length;i++){
    const a=REFLEX_APERTURE[i],b=REFLEX_APERTURE[(i+1)%REFLEX_APERTURE.length],dx=b[0]-a[0],dy=b[1]-a[1];
    if(dx*(y-a[1])-dy*(x-a[0])<margin*Math.hypot(dx,dy))return false;
  }
  return true;
}
