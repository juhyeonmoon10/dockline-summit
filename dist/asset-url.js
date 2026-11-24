// Pages supplies a content-hashed URL. The LAN server serves the same asset by name.
export function assetUrl(filename){
  const path='./assets/'+filename;
  return import.meta.resolve?.(path)??new URL(path,import.meta.url).href;
}
