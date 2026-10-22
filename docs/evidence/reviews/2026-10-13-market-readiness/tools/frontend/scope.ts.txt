import { readFileSync } from 'fs';
import { isLaunchSurface } from '<repo>/shared/constants/launch-scope';
const src = readFileSync('<repo>/client/src/concept2cure/v2/surfaceViews.ts','utf8');
const bind: Record<string,string> = {};
for (const m of src.matchAll(/const (\w+) = lazy(?:Owned)?Surface\(\(\) => import\('\.\/(?:surfaces|intelligence)\/(\w+)'\)/g)) bind[m[1]] = m[2];
const reg = [...src.matchAll(/^\s+'?([a-z0-9-]+)'?: \{ component: (\w+)/gm)].map(m=>[m[1],m[2]]);
const fileIn: Record<string,{in:string[],out:string[]}> = {};
let inN=0,outN=0;
for (const [id,comp] of reg) { const f = bind[comp] ?? comp; fileIn[f] ??= {in:[],out:[]}; (isLaunchSurface(id)?fileIn[f].in:fileIn[f].out).push(id); isLaunchSurface(id)?inN++:outN++; }
console.log('SURFACE_VIEWS entries', reg.length, 'in-scope', inN, 'out-of-scope', outN);
const outOnly = Object.entries(fileIn).filter(([f,v])=>v.in.length===0).map(([f])=>f);
console.log('files only serving out-of-scope ids:', outOnly.length);
console.log(outOnly.join(' '));
