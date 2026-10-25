import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out=path.join(root,'unity/TestResults');
const temp=path.join(out,'.reference');
await fs.mkdir(temp,{recursive:true});
await fs.writeFile(path.join(temp,'package.json'),' {"type":"module"} ');
async function transpile(dir,relative=''){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    if(entry.name.startsWith('__'))continue;
    const rel=path.join(relative,entry.name),src=path.join(dir,entry.name);
    if(entry.isDirectory()){await transpile(src,rel);continue;}
    if(!entry.name.endsWith('.ts'))continue;
    let code=ts.transpileModule(await fs.readFile(src,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    code=code.replace(/(from\s+['"])(\.[^'"]+)(['"])/g,'$1$2.js$3');
    const dest=path.join(temp,rel.replace(/\.ts$/,'.js'));
    await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,code);
  }
}
await transpile(path.join(root,'src/game'));
const {createGameState}=await import(pathToFileURL(path.join(temp,'state.js')));
const {createRng}=await import(pathToFileURL(path.join(temp,'rng.js')));
const {computeLayout}=await import(pathToFileURL(path.join(temp,'layout.js')));
const {reduce}=await import(pathToFileURL(path.join(temp,'reducer.js')));
function snapshot(s){
  return {hp:s.hp,score:s.score,combo:s.combo,kills:s.kills,crit:s.critCount,normal:s.normalCount,maxCombo:s.maxCombo,
    holdId:s.holdMonsterId??0,nextId:s.nextMonsterId,fever:s.frenzyActive,burning:s.burning,now:s.now,
    feverT:s.feverT,spawnTimer:s.spawnTimer,pairCooldown:s.pairCooldown,longCooldown:s.longCooldown,airT:s.airT,attackT:s.attackT,burnCarry:s.burnCarry,playerLane:s.playerLane==='top'?0:1,
    monsters:s.monsters.map(m=>({id:m.id,kind:m.kind==='normal'?0:m.kind==='twin'?1:2,lane:m.lane==='top'?0:1,partner:m.partnerId??0,x:m.x,y:m.y,sf:m.sf??0,phase:m.phase,pairT:m.pairT??0,holdT:m.holdT??0,waitT:m.waitT??6,removed:m.removed,pending:m.pairPending??false,escaped:m.escaped??false,anchored:m.anchored??false}))};
}
const cases=[];
for(let character=0;character<2;character++)for(let difficulty=1;difficulty<=4;difficulty++){
  const seed=20261024+character*100+difficulty;
  let s=createGameState({seed,diffLevel:difficulty,characterId:character===0?'zhe':'rin',layout:computeLayout(1280,720,1)});
  const rng=createRng(seed),steps=[];
  function apply(event,step){s=reduce(s,event,rng).state;steps.push(step);}
  for(let frame=0;frame<6000;frame++){
    if(frame%900===300){apply({type:'Pause'},{type:3});apply({type:'Tick',dt:.05},{type:0,dt:.05});apply({type:'Resume'},{type:4});}
    for(const old of s.monsters){
      const m=s.monsters.find(x=>x.id===old.id);if(!m||m.removed||m.escaped)continue;
      if(m.kind==='hold'){
        const head=m.x+m.h*.46;
        if(s.holdMonsterId===null&&(m.anchored||(head<=s.layout.hitX+8&&head>=s.layout.hitX-s.layout.zoneHalf))){
          apply({type:'Press',lane:m.lane,inputId:'hold'},{type:1,lane:m.lane==='top'?0:1,input:'hold'});
        }
      }else if(!m.pairPending&&m.x<=s.layout.hitX+8&&m.x>=s.layout.hitX-s.layout.zoneHalf){
        // Include occasional outer-zone hits and a few misses in the second half.
        if(frame>3600&&m.id%29===0)continue;
        apply({type:'Press',lane:m.lane,inputId:'hit:'+m.lane},{type:1,lane:m.lane==='top'?0:1,input:'hit:'+m.lane});
      }
    }
    if(frame===2800&&s.holdMonsterId!==null)apply({type:'Release',inputId:'hold'},{type:2,input:'hold'});
    const dt=frame%170===0?.03:1/60;
    apply({type:'Tick',dt},{type:0,dt});
    if(frame%120===0||frame===5999){steps[steps.length-1].verify=true;steps[steps.length-1].expected=snapshot(s);}
    if(s.phase==='over')break;
  }
  cases.push({seed,difficulty,character,steps});
  console.log(`reference ${character===0?'zhe':'rin'} ${difficulty} stars: ${s.now.toFixed(2)}s, ${s.score} score, ${s.kills} kills`);
}
await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'reference.json'),JSON.stringify({cases}));
console.log(`Wrote ${cases.length} deterministic TypeScript replays`);
