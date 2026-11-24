// Gun-local centre of the optical glass, housing scale and the glass's final
// camera-space Z when the player shoulders that particular viewmodel.
function mount(y,z,scale,eyeZ,x=0){
  return Object.freeze({x,y,z,scale,eyeZ});
}
const mounts=Object.freeze({
  rifle:mount(.1752,-.119,.72,-.353),
  smg:mount(.1212,-.055,.70,-.328,.008),
  burst:mount(.1871,-.060,.72,-.358),
  marksman:mount(.1545,-.225,.78,-.394),
  lmg:mount(.1932,-.020,.74,-.365),
  pistol:mount(.1048,-.067,.55,-.302)
});
export const opticFit=id=>Object.hasOwn(mounts,id)?mounts[id]:null;
// The lightweight model displayed during the first download has its own receiver.
const fallbackMounts={
  rifle:mount(.1891,-.112,1,-.353), smg:mount(.134,-.055,.84,-.328),
  burst:mount(.152,-.062,1,-.358), marksman:mount(.108,-.149,1.08,-.394),
  lmg:mount(.182,-.011,1.07,-.365), pistol:mount(.127,-.067,.72,-.302)
};
export const fallbackOpticFit=id=>Object.hasOwn(fallbackMounts,id)?fallbackMounts[id]:null;
// A narrower window passes the eye slightly later in the shoulder animation.
// Hand off from the hip crosshair once the whole luminous bead fits.
const eyeEntry={smg:.91,pistol:.935};
export const reflexEngaged=(id,aim)=>Boolean(opticFit(id)&&aim>=(eyeEntry[id]??.90));

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
