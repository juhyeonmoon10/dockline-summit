// Pages maps each atlas to its content hash alongside the matching pose metadata.
export function weaponImageUrl(filename){
  const path='./assets/'+filename;
  return import.meta.resolve?.(path)??new URL(path,import.meta.url).href;
}
