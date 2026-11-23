// Normalized contacts shared by the cylinder animation and its recorded foley.
export const REVOLVER_RELOAD_CONTACT=Object.freeze({open:.20,eject:.34,seat:.63,close:.84});

export function revolverCylinderSwing(t){
  const smooth=(lo,hi)=>{
    const u=Math.max(0,Math.min(1,(t-lo)/(hi-lo)));
    return u*u*(3-2*u);
  };
  return 1.53*smooth(.075,REVOLVER_RELOAD_CONTACT.open)*(1-smooth(.72,REVOLVER_RELOAD_CONTACT.close));
}
