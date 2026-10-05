const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const Papa=require('papaparse');
const {normalize}=require('./importer');
const starter=require('./starter-data.json');
const starterRoster=require('./starter-roster.json');
const PRO_URL='https://drive.google.com/uc?export=download&id=1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm';
let win;
const file=name=>path.join(app.getPath('userData'),name);

async function read(name,fallback){try{return JSON.parse(await fs.readFile(file(name),'utf8'));}catch{return fallback;}}

async function write(name,value){await fs.mkdir(app.getPath('userData'),{recursive:true});const tmp=file(name+'.tmp');await fs.writeFile(tmp,JSON.stringify(value));await fs.rename(tmp,file(name));}

async function dataset(){
  const data=await read('matches.json',starter);
  const originals=new Map(starter.games.map(g=>[g.id,g]));
  let changed=false;

  for(const g of data.games){
    const original=originals.get(g.id);
    if(!g.draftOrder?.blue&&original?.draftOrder?.blue&&g.league===original.league&&g.patch===original.patch&&g.winner===original.winner&&['blue','red'].every(side=>g[side].map(p=>p.c).sort().join('|')===original[side].map(p=>p.c).sort().join('|'))){g.draftOrder=original.draftOrder;changed=true;}
  }
  
  if(changed)await write('matches.json',data);
  return data;
}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Data Dragon returned HTTP '+r.status);return r.json();}
function handle(channel,fn){ipcMain.handle(channel,async(event,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted caller');return fn(...args);});}
async function ingest(text,sourceName){
    const parsed=Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.replace(/^\uFEFF/,'').trim().toLowerCase()});
    if(parsed.errors.length)throw Error('Malformed CSV: '+parsed.errors[0].message);
    const required=['gameid','side','position','champion','result','league','patch'];
    if(!required.every(h=>parsed.meta.fields.includes(h)))throw Error('Missing required columns: '+required.filter(h=>!parsed.meta.fields.includes(h)).join(', '));
    const clean=normalize(parsed.data);if(!clean.games.length)throw Error('No complete valid 5v5 games found. Rejected '+clean.rejected+' games.');
    const old=await read('matches.json',starter);
    const merged=new Map(old.games.map(g=>[g.id,g]));const previous=merged.size;
    clean.games.forEach(g=>{
      const previous=merged.get(g.id);
      if(!g.draftOrder?.blue&&previous?.draftOrder?.blue&&g.winner===previous.winner&&g.league===previous.league&&g.patch===previous.patch&&['blue','red'].every(side=>g[side].map(p=>p.c).sort().join('|')===previous[side].map(p=>p.c).sort().join('|')))g.draftOrder=previous.draftOrder;
      merged.set(g.id,g);
    });
    const dataset={games:[...merged.values()],sources:[...old.sources,{name:sourceName,at:new Date().toISOString(),accepted:clean.games.length}]};
    await write('matches.json',dataset);
    return {...dataset,report:{accepted:clean.games.length,added:merged.size-previous,rejected:clean.rejected,skippedRows:clean.skippedRows}};
}
app.whenReady().then(()=>{
  handle('sync-pro',async()=>{
    const response=await fetch(PRO_URL,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('Pro-data download returned HTTP '+response.status+'. Use Get pro-play data for a manual download.');
    if((response.headers.get('content-type')||'').includes('text/html'))throw Error('The provider requires a browser download. Click Get pro-play data, download the CSV, then import it. Your existing data is unchanged.');
    const reader=response.body.getReader();const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>150*1024*1024){await reader.cancel();throw Error('Download exceeds the 150 MB limit.');}chunks.push(Buffer.from(value));}
    return ingest(Buffer.concat(chunks).toString('utf8'),'2026 Oracle’s Elixir public update');
  });
  handle('test-riot',async ({key,region})=>{
    const platforms=['na1','euw1','eun1','kr','jp1','br1','la1','la2','oc1','tr1','ru','ph2','sg2','th2','tw2','vn2'];
    if(typeof key!=='string'||!/^RGAPI-[A-Za-z0-9-]+$/.test(key.trim())||!platforms.includes(region))throw Error('Enter a valid Riot API key and platform.');
    let response;
    try{response=await fetch('https://'+region+'.api.riotgames.com/lol/status/v4/platform-data',{headers:{'X-Riot-Token':key.trim()},signal:AbortSignal.timeout(20000)});}
    catch{throw Error('Could not reach Riot. Check your connection and retry.');}
    if(response.status===401||response.status===403)throw Error('Riot rejected the key. It may be expired, invalid, or lack access.');
    if(response.status===429)throw Error('Riot rate limit reached. Wait before testing again.');
    if(!response.ok)throw Error('Riot returned HTTP '+response.status+'. Try again later.');
    const data=await response.json();return {name:data.name||region};
  });
  handle('roster',async()=>{
    try{
      const versions=await json('https://ddragon.leagueoflegends.com/api/versions.json');
      const version=versions[0];if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid version');
      const data=await json('https://ddragon.leagueoflegends.com/cdn/'+version+'/data/en_US/champion.json');
      const roster={version,champions:Object.values(data.data).map(c=>({id:require('./engine').key(c.name),name:c.name,image:'https://ddragon.leagueoflegends.com/cdn/'+version+'/img/champion/'+c.image.full})).sort((a,b)=>a.name.localeCompare(b.name))};
      if(!roster.champions.length)throw Error('Empty champion roster');
      await write('roster.json',roster);return {...roster,cached:false};
    }catch(e){const cached=await read('roster.json',starterRoster);if(cached)return {...cached,cached:true};throw Error('Could not load champions. Connect to the internet and retry. '+e.message);}
  });
  handle('dataset',()=>dataset());
  handle('import',async()=>{
    const chosen=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Oracle’s Elixir CSV',extensions:['csv']}]});
    if(chosen.canceled)return null;
    const p=chosen.filePaths[0];if((await fs.stat(p)).size>150*1024*1024)throw Error('CSV must be smaller than 150 MB.');
    return ingest(await fs.readFile(p,'utf8'),path.basename(p));
  });
  handle('save-draft',async data=>{
    if(typeof data!=='object'||JSON.stringify(data).length>20000)throw Error('Invalid draft');
    const chosen=await dialog.showSaveDialog(win,{defaultPath:'draft.json',filters:[{name:'Draft',extensions:['json']}]});
    if(chosen.canceled)return false;await fs.writeFile(chosen.filePath,JSON.stringify(data,null,2));return true;
  });
  handle('load-draft',async()=>{
    const chosen=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Draft',extensions:['json']}]});
    if(chosen.canceled)return null;if((await fs.stat(chosen.filePaths[0])).size>20000)throw Error('Draft file is too large');
    return JSON.parse(await fs.readFile(chosen.filePaths[0],'utf8'));
  });
  handle('source',()=>shell.openExternal('https://drive.google.com/file/d/1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm/view'));
  win=new BrowserWindow({width:1500,height:980,minWidth:1050,minHeight:700,backgroundColor:'#0d1420',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile('index.html');
});
app.on('window-all-closed',()=>app.quit());
