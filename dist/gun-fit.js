// The visible gun-local front cap is (muzzleX, muzzleY, muzzle). Forward is -Z.
export const SHOTGUN_PUMP_TRAVEL=.132;
export const gunFit={
 rifle:{muzzleX:.0014,muzzleY:.0753,muzzle:-.6164,support:-.368,supportGrip:-.057,grip:-.074,sight:.175,flash:.9},
 shotgun:{muzzleX:.0003,muzzleY:.0169,muzzle:-.7374,support:-.565,grip:-.068,sight:.067,flash:1.34},
 sniper:{muzzleX:.006,muzzleY:.064,muzzle:-1.143,support:-.397,grip:-.077,sight:.143,flash:1.17},
 smg:{muzzleX:.049,muzzleY:.033,muzzle:-.394,support:-.205,grip:-.066,sight:.111,flash:.64},
 burst:{muzzleX:0,muzzleY:.048,muzzle:-.480,support:-.275,grip:-.072,sight:.162,flash:.82},
 marksman:{muzzleX:0,muzzleY:.020,muzzle:-1.004,support:-.409,grip:-.072,sight:.152,flash:1.02},
 lmg:{muzzleX:0,muzzleY:.048,muzzle:-.773,support:-.387,grip:-.070,sight:.188,flash:1.05},
 pistol:{muzzleX:0,muzzleY:.057,muzzle:-.3267,support:-.045,grip:-.068,sight:.103,flash:.65},
 revolver:{muzzleX:0,muzzleY:.053,muzzle:-.382,support:-.022,grip:-.069,sight:.0836,flash:.85}
};
// The top edge of each iron front sight is the point the player puts under a target.
export const ironTips=Object.freeze({
 shotgun:Object.freeze([.00239,.02735,-.73511]),
 revolver:Object.freeze([.00002,.08210,-.36885])
});
const originalRevolverTip=Object.freeze([0,.0927,-.342]);
export const fittedIronTip=(key,body)=>key==='revolver'&&!body?.userData.armoryImported?originalRevolverTip:ironTips[key];
