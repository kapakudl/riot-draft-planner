'use strict';
const E=window.DraftEngine;
const $=id=>document.getElementById(id);
let roster=[], games=[], sources=[], history=[], stats=E.aggregate([]), busy=false;
let bans=false;
let inspectedId=null;
const byId=new Map();
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function message(text){$('message').textContent=text;}
function image(c){const img=el('img',undefined,'portrait');img.src=c.image;img.alt='';img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true;},{once:true});return img;}
function name(id){return byId.get(id)?.name||id;}
function populateFilters(){
  for(const [id,field] of [['league','league'],['patch','patch']]){
    const old=$(id).value;$(id).replaceChildren(new Option('All '+(id==='league'?'leagues':'patches'),''));
    [...new Set(games.map(g=>g[field]))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).forEach(v=>$(id).add(new Option(v,v)));
    if([...$(id).options].some(o=>o.value===old))$(id).value=old;
  }
}
function updateStats(){stats=E.aggregate(games,$('league').value,$('patch').value);render();}
function pick(id){if(busy||!byId.has(id)||history.includes(id)||!E.state(history,bans).active)return;history.push(id);$('search').value='';render();}
function renderBoard(d){
  for(const team of ['blue','red']){
    const slots=$(team+'-slots');slots.replaceChildren();
    for(let i=0;i<5;i++){
      const active=d.active?.team===team&&d.active.type==='pick'&&d.active.index===i;
      const slot=el('div',undefined,'slot'+(active?' active':''));
      if(active)slot.setAttribute('aria-current','step');
      const c=byId.get(d.picks[team][i]);
      slot.append(c?image(c):el('div',String(i+1),'empty-icon'));
      const text=el('div');text.append(el('small',team[0].toUpperCase()+(i+1)+(active?' · PICKING NOW':'')),el('strong',c?c.name:active?'Choose champion':'Waiting'));slot.append(text);slots.append(slot);
    }
    const list=$(team+'-bans');list.replaceChildren();
    if(bans) d.seq.forEach((action,i)=>{if(action.type==='ban'&&action.team===team)list.append(el('span','Ban '+(action.index+1)+': '+(history[i]?name(history[i]):'—'),'ban'+(i===history.length?' active':'')));});
  }
}
function renderPool(){
  const grid=$('champion-grid');grid.replaceChildren();const query=E.key($('search').value);
  const complete=!E.state(history,bans).active;
  const matches=roster.filter(c=>E.key(c.name).includes(query));
  for(const c of matches){const b=el('button',undefined,'champion');b.type='button';b.disabled=busy||complete||history.includes(c.id);b.append(image(c),el('span',c.name));b.title=history.includes(c.id)?'Already picked or banned':c.name;b.addEventListener('click',()=>pick(c.id));grid.append(b);}
  if(!matches.length)grid.append(el('p',roster.length?'No matching champions.':'Connect to the internet and click Refresh champions.','muted'));
}
function renderOpening(d){
  const table=$('opening-table');table.replaceChildren();
  $('opening-coverage').textContent=stats.openingGames.toLocaleString()+' of '+stats.n.toLocaleString()+' filtered games have validated B1 data. '+(stats.openingGames?'Blue-side baseline: '+(100*stats.openingWins/stats.openingGames).toFixed(1)+'%.':'No draft-order evidence available.');
  const minimum=Math.max(1,Math.min(10000,Number($('minimum').value)||5));
  const best=E.openingRecommendations(stats,d.banned,roster,minimum);
  if(!best.length){const row=el('tr'),cell=el('td','No B1 candidates meet the minimum sample. Broaden your filters or lower minimum games.');cell.colSpan=5;row.append(cell);table.append(row);return;}
  for(const c of best){
    const row=el('tr'),cell=el('td'),button=el('button',c.name);
    button.disabled=busy||d.active?.type!=='pick'||d.active?.team!=='blue'||d.active?.index!==0||history.includes(c.id);
    button.title='Select as Blue first pick';button.addEventListener('click',()=>pick(c.id));cell.append(button);row.append(cell,el('td',String(c.n)),el('td',(100*c.w/c.n).toFixed(1)+'%'),el('td',c.share.toFixed(1)+'%'),el('td',c.score.toFixed(1)));table.append(row);
  }
}
function renderInspector(candidate,d){
  const box=$('candidate-inspector');box.replaceChildren();
  if(!candidate){box.append(el('p','Choose Inspect to see the evidence and score breakdown.','fine'));return;}
  const c=candidate;
  box.append(el('h3',c.name+' · '+(c.rank?'Rank #'+c.rank:'Not ranked')));
  box.append(el('p',(c.opening?'B1':'Draft-fit')+' score: '+c.score.toFixed(1)+' · '+Math.round(c.coverage*100)+'% evidence support','muted'));
  box.append(el('p','Overall: '+(c.overallN?(100*c.overallW/c.overallN).toFixed(1)+'% across '+c.overallN+' games':'no data')+' · Observed roles: '+(c.roles.join('/').toUpperCase()||'unknown'),'fine'));
  if(c.opening)box.append(el('p','First pick: '+c.n+' games · '+(c.n?(100*c.w/c.n).toFixed(1)+'% wins':'no data'),'fine'));
  for(const reason of c.reasons)box.append(el('p',reason,'exclusion'));
  const list=el('ul',undefined,'components');
  if(!c.opening)list.append(el('li','Neutral starting score: 50'));
  c.components.forEach(x=>list.append(el('li',x.label+': '+(x.points>=0?'+':'')+x.points.toFixed(2))));box.append(list);
  for(const [title,items] of [['With current allies',c.sy],['Against current enemies',c.vs]]){
    if(!items.length)continue;
    box.append(el('h4',title));
    for(const p of items){
      box.append(el('p',name(p.id)+' · '+p.n+' games · '+(p.n?(100*p.w/p.n).toFixed(1)+'% observed wins':'no observed wins')+' · '+(100*p.expected).toFixed(1)+'% heuristic baseline · '+(p.lift>=0?'+':'')+(100*p.lift).toFixed(2)+' pp adjusted lift','evidence-line'));
    }
  }
  box.append(el('p','Evidence support measures sample shrinkage, not prediction accuracy. Positive lift is an observed association after a simple champion-strength adjustment.','fine'));
}
function renderRecommendations(d){
  const target=$('recommendations');target.replaceChildren();
  const query=E.key($('rec-search').value);
  const isOpening=d.active?.type==='pick'&&d.active.team==='blue'&&d.active.index===0;
  $('recommendation-title').textContent=query?'Champion vetting':isOpening?'Top 5 first picks':'Top 5 draft fits';
  $('evidence').textContent=stats.n.toLocaleString()+' filtered games';
  if(!d.active||d.active.type!=='pick'){
    target.append(el('p',!d.active?'Draft complete. Undo to inspect the previous decision.':'Pick analysis resumes after the ban phase.','muted'));
    $('candidate-inspector').replaceChildren();return;
  }
  const minimum=Math.max(1,Math.min(10000,Number($('minimum').value)||5));
  const all=E.assess(stats,history,bans,roster,minimum);
  const shown=query?all.filter(c=>E.key(c.name).includes(query)):all.filter(c=>c.eligible).slice(0,5);
  $('evidence').textContent=stats.n.toLocaleString()+' filtered games · '+all.filter(c=>c.eligible).length+' ranked candidates'+(query?' · '+shown.length+' search matches':'');
  if(!shown.length)target.append(el('p',query?'No matching champions.':'Not enough supported draft evidence for recommendations. Search to vet any champion or pick manually from the pool.','muted'));
  for(const c of shown){
    const card=el('article',undefined,'recommendation');
    const top=el('div',undefined,'rec-top');top.append(image(c),el('strong',(c.rank?'#'+c.rank+' ':'')+c.name),el('span',c.eligible?c.score.toFixed(1):'—','score'));
    card.append(top,el('span',(c.n?(100*c.w/c.n).toFixed(1)+'%':'No')+(c.opening?' B1 wins · ':' overall wins · ')+c.n+' games','rec-detail'));
    if(c.eligible)card.append(el('span',c.components.map(x=>x.label+': '+(x.points>=0?'+':'')+x.points.toFixed(1)).join(' / '),'rec-detail'));
    else card.append(el('span',c.reasons.join(' · '),'exclusion'));
    if(c.coverage<0.5)card.append(el('span','Limited evidence support — inspect sample sizes.','rec-detail'));
    const actions=el('div',undefined,'candidate-actions');
    const inspect=el('button','Inspect');inspect.type='button';inspect.addEventListener('click',()=>{inspectedId=c.id;renderInspector(c,d);});
    const select=el('button',c.eligible?'Pick':'Pick manually');select.type='button';select.disabled=busy||history.includes(c.id);select.addEventListener('click',()=>pick(c.id));
    actions.append(inspect,select);card.append(actions);target.append(card);
  }
  renderInspector(all.find(c=>c.id===inspectedId),d);
}

function render(){
  const d=E.state(history,bans);renderBoard(d);renderPool();renderOpening(d);renderRecommendations(d);
  $('turn').textContent=d.active?(d.active.team==='blue'?'Blue':'Red')+' to '+d.active.type+' · '+(d.active.type==='pick'?d.active.team[0].toUpperCase()+(d.active.index+1):'Ban '+(d.active.index+1))+' · Phase '+d.active.phase:'Draft complete';
  $('progress').textContent=history.length+' / '+d.seq.length+' actions';
  $('dataset').textContent=games.length.toLocaleString()+' games · '+sources.length+' data loads';
  $('bans').disabled=busy||history.length>0;
  for(const id of ['sync','import','refresh','save','load','league','patch','minimum'])$(id).disabled=busy;
  $('undo').disabled=busy||!history.length;$('reset').disabled=busy||!history.length;
}
async function task(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){message(e.message||String(e));}finally{busy=false;render();}}
async function fetchRoster(){const data=await window.desktop.roster();roster=data.champions;byId.clear();roster.forEach(c=>byId.set(c.id,c));$('roster-status').textContent='Champion assets: '+data.version+(data.cached?' · cached roster (offline fallback)':' · live Data Dragon');}
$('test-api').addEventListener('click',async()=>{
  const button=$('test-api');button.disabled=true;$('api-status').textContent='Connecting…';
  try{const result=await window.desktop.testRiot({key:$('api-key').value,region:$('api-region').value});$('api-status').textContent='Connected: '+result.name;}
  catch(e){$('api-status').textContent=e.message;}
  finally{$('api-key').value='';button.disabled=false;}
});
$('search').addEventListener('input',renderPool);
$('rec-search').addEventListener('input',()=>renderRecommendations(E.state(history,bans)));
$('league').addEventListener('change',updateStats);$('patch').addEventListener('change',updateStats);$('minimum').addEventListener('change',render);
$('bans').addEventListener('change',()=>{bans=$('bans').checked;render();});
$('undo').addEventListener('click',()=>{history.pop();render();});
$('reset').addEventListener('click',()=>{if(confirm('Reset this draft? Imported match data will stay.')){history=[];render();}});
$('source').addEventListener('click',()=>window.desktop.source().catch(e=>message(e.message)));
$('refresh').addEventListener('click',()=>task(async()=>{await fetchRoster();message('Champion roster refreshed.');}));
$('sync').addEventListener('click',()=>task(async()=>{
  message('Downloading the public 2026 pro dataset. This may take a minute…');
  const data=await window.desktop.syncPro();games=data.games;sources=data.sources;
  populateFilters();stats=E.aggregate(games,$('league').value,$('patch').value);
  message('Pro data updated: '+data.report.accepted+' valid games; '+data.report.added+' new. Rejected '+data.report.rejected+' games.');
}));
$('import').addEventListener('click',()=>task(async()=>{
  message('Choose a CSV. Large season files may take a moment to process.');
  const data=await window.desktop.importCSV();if(!data){message('Import canceled.');return;}
  games=data.games;sources=data.sources;populateFilters();stats=E.aggregate(games,$('league').value,$('patch').value);
  const unknown=new Set(games.flatMap(g=>[...g.blue,...g.red].map(p=>p.c)).filter(id=>!byId.has(id)));
  message('Imported '+data.report.accepted+' valid games ('+data.report.added+' new). Rejected '+data.report.rejected+' incomplete/invalid games. '+(unknown.size?unknown.size+' historical champion names do not match the roster.':''));
}));
$('save').addEventListener('click',()=>task(async()=>{const saved=await window.desktop.saveDraft({format:1,bans,history,league:$('league').value,patch:$('patch').value,minimum:Number($('minimum').value)||5});message(saved?'Draft saved.':'Save canceled.');}));
$('load').addEventListener('click',()=>task(async()=>{
  const data=await window.desktop.loadDraft();if(!data)return;
  if(data.format!==1||typeof data.bans!=='boolean'||!E.validHistory(data.history,data.bans,new Set(roster.map(c=>c.id))))throw Error('Invalid draft or champion roster not loaded. Refresh champions and try again.');
  bans=data.bans;history=[...data.history];$('bans').checked=bans;
  let missing=false;
  for(const id of ['league','patch']){const exists=[...$(id).options].some(o=>o.value===(data[id]||''));$(id).value=exists?(data[id]||''):'';missing ||= !exists;}
  $('minimum').value=Math.max(1,Math.min(10000,Number(data.minimum)||5));stats=E.aggregate(games,$('league').value,$('patch').value);
  message(missing?'Draft opened. Some saved filters are unavailable; those filters were reset to All.':'Draft opened.');
}));
task(async()=>{
  const data=await window.desktop.dataset();games=data.games;sources=data.sources;populateFilters();stats=E.aggregate(games);
  await fetchRoster();message(games.length?'Ready. Filter your dataset and start drafting.':'Ready. Import a pro-match CSV to enable recommendations.');
});
