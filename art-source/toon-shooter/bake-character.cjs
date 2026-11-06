// After editing Soldier.gltf (for example in Blender), refresh the inline browser asset.
const fs=require('node:fs'),path=require('node:path');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'Soldier.gltf'),'utf8'));
fs.writeFileSync(path.join(__dirname,'../../dist/assets/soldier-data.js'),'// Quaternius Toon Shooter Game Kit (CC0), trimmed to the four locomotion clips.\nexport const soldierData='+JSON.stringify(data)+';\n');
