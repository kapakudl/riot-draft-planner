const {key}=require('./engine');
function normalize(rows) {
  const groups=new Map(),teamRows=new Map();let skippedRows=0;
  const roleMap={top:'top',jng:'jng',jungle:'jng',mid:'mid',middle:'mid',bot:'bot',bottom:'bot',adc:'bot',sup:'sup',support:'sup'};
  for(const row of rows) {
    if(String(row.position).trim().toLowerCase()==='team'){
      const id=String(row.gameid||'').trim(),side=String(row.side||'').trim().toLowerCase();
      if(id&&['blue','red'].includes(side)){
        const k=id+'|'+side;const list=teamRows.get(k)||[];list.push(row);teamRows.set(k,list);
      }
      continue;
    }
    const id=String(row.gameid||'').trim(),side=String(row.side||'').trim().toLowerCase();
    const role=roleMap[String(row.position||'').trim().toLowerCase()];
    if(!id){skippedRows++;continue;}
    const group=groups.get(id)||{rows:[],invalid:false};groups.set(id,group);
    if(!role||!['blue','red'].includes(side)||!key(row.champion||'')||!['0','1'].includes(String(row.result).trim())) {group.invalid=true;skippedRows++;continue;}
    group.rows.push({side,r:role,c:key(row.champion),result:Number(row.result),league:String(row.league||'Unknown').trim(),patch:String(row.patch||'Unknown').trim()});
  }
  let rejected=0;const games=[];
  for(const [id,group] of groups) {
    const rows=group.rows,blue=rows.filter(r=>r.side==='blue'),red=rows.filter(r=>r.side==='red');
    const validTeam=t=>t.length===5&&new Set(t.map(p=>p.r)).size===5&&new Set(t.map(p=>p.result)).size===1;
    if(group.invalid||!validTeam(blue)||!validTeam(red)||new Set(rows.map(p=>p.c)).size!==10||blue[0].result+red[0].result!==1||new Set(rows.map(p=>p.patch)).size!==1||new Set(rows.map(p=>p.league)).size!==1){rejected++;continue;}
    const strip=t=>t.map(({c,r})=>({c,r}));
    const draftOrder={};
    for(const [side,players] of [['blue',blue],['red',red]]) {
      const source=teamRows.get(id+'|'+side)||[];
      if(source.length!==1)continue;
      const picks=[1,2,3,4,5].map(i=>key(source[0]['pick'+i]||''));
      if(picks.every(c=>c&&players.some(p=>p.c===c))&&new Set(picks).size===5)draftOrder[side]=picks;
    }
    games.push({id,league:blue[0].league,patch:blue[0].patch,winner:blue[0].result?'blue':'red',blue:strip(blue),red:strip(red),draftOrder});
  }
  return {games,rejected,skippedRows};
}
module.exports={normalize};
