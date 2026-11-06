// Keep a brief replay window for pellet effects without resending old volleys
// throughout the authoritative 40-event history. Damage and all other events stay.
export function gameSnapshot(game){
  if(!Number.isFinite(game.elapsed)||!Array.isArray(game.events))return game;
  const oldest=game.elapsed-.30-1e-8;
  const events=game.events.filter(event=>event.type!=='shot'||event.weapon!=='shotgun'||
    !Number.isFinite(event.at)||event.at>=oldest);
  return events.length===game.events.length?game:{...game,events};
}
