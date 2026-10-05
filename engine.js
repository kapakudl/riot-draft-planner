(function (root) {
  'use strict';
  const key = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const roles = ['top', 'jng', 'mid', 'bot', 'sup'];
  function sequence(bans = false) {
    const picks = ['blue','red','red','blue','blue','red','red','blue','blue','red'];
    const count = {blue:0, red:0};
    const p = picks.map((team,i) => ({team, type:'pick', index:count[team]++, phase:i<6?1:2}));
    if (!bans) return p;
    const b = {blue:0,red:0};
    const make = (teams,phase) => teams.map(team=>({team,type:'ban',index:b[team]++,phase}));
    return [...make(['blue','red','blue','red','blue','red'],1),...p.slice(0,6),...make(['red','blue','red','blue'],2),...p.slice(6)];
  }
  function state(history, bans=false) {
    const seq=sequence(bans), picks={blue:[],red:[]}, banned=[];
    history.forEach((champion,i)=>{const a=seq[i]; if(a.type==='pick') picks[a.team].push(champion); else banned.push(champion);});
    return {picks,banned,active:seq[history.length],seq};
  }
  function validHistory(history,bans,roster) {
    return Array.isArray(history) && history.length<=sequence(bans).length && new Set(history).size===history.length && history.every(c=>roster.has(c));
  }
  function aggregate(games, league='', patch='') {
    const champions=new Map(), pairs=new Map(), against=new Map(), firstPicks=new Map();
    let openingGames=0,openingWins=0;
    const bump=(map,k,win)=>{const s=map.get(k)||{n:0,w:0};s.n++;s.w+=win;map.set(k,s);return s;};
    const chosen=games.filter(g=>(!league||g.league===league)&&(!patch||g.patch===patch));
    for(const g of chosen){
      const opening=g.draftOrder?.blue?.[0];
      if(opening&&g.blue.some(p=>p.c===opening)){const win=g.winner==='blue'?1:0;bump(firstPicks,opening,win);openingGames++;openingWins+=win;}
    }
    for(const g of chosen) for(const side of ['blue','red']) {
      const team=g[side], enemy=g[side==='blue'?'red':'blue'];
      const win=side===g.winner?1:0;
      for(const p of team) {
        const s=bump(champions,p.c,win);s.roles ||= {};s.roles[p.r]=(s.roles[p.r]||0)+1;
        for(const a of team) if(a.c!==p.c) bump(pairs,p.c+'|'+a.c,win);
        for(const e of enemy) bump(against,p.c+'|'+e.c,win);
      }
    }
    return {champions,pairs,against,firstPicks,openingGames,openingWins,n:chosen.length};
  }
  function roleOptions(c,stats) {
    const s=stats.champions.get(c);if(!s) return roles;
    return roles.filter(r=>(s.roles[r]||0)/s.n>=0.05);
  }
  function fits(team,stats) {
    const options=team.map(c=>roleOptions(c,stats)).sort((a,b)=>a.length-b.length);
    function assign(i,used) {if(i===options.length)return true;return options[i].some(r=>!used.has(r)&&assign(i+1,new Set([...used,r])));}
    return assign(0,new Set());
  }
  function rate(s){return s?(s.w+10)/(s.n+20):0.5;}
  function wilson(w,n){
    if(!n)return 0;
    const z=1.96,p=w/n,z2=z*z;
    return (p+z2/(2*n)-z*Math.sqrt(p*(1-p)/n+z2/(4*n*n)))/(1+z2/n);
  }
  function baselineExpectation(a,b,enemy){
    // Combine smoothed champion odds; opponent strength is subtracted.
    const odds=p=>Math.log(p/(1-p));
    const value=odds(a)+(enemy?-1:1)*odds(b);
    return 1/(1+Math.exp(-value));
  }
  function assess(stats, history, bans, roster, minimum=5){
    const d=state(history,bans),used=new Set(history);
    if(!d.active||d.active.type!=='pick')return [];
    const opening=d.active.team==='blue'&&d.active.index===0;
    const allies=d.picks[d.active.team],enemies=d.picks[d.active.team==='blue'?'red':'blue'];
    const maxOpening=Math.max(1,...[...stats.firstPicks.values()].map(s=>s.n));
    const results=roster.map(c=>{
      const overall=stats.champions.get(c.id),s=opening?stats.firstPicks.get(c.id):overall;
      const reasons=[];
      if(used.has(c.id))reasons.push('Already picked or banned');
      if(!s||!s.n)reasons.push(opening?'No recorded B1 appearances in these filters':'No appearances in these filters');
      else if(s.n<minimum)reasons.push('Below minimum: '+s.n+' / '+minimum+' '+(opening?'B1 games':'games'));
      const options=overall?roleOptions(c.id,stats):[];
      if(!fits([...allies,c.id],stats))reasons.push('No distinct five-role assignment with current allies');
      const result={...c,n:s?.n||0,w:s?.w||0,overallN:overall?.n||0,overallW:overall?.w||0,opening,roles:options,sy:[],vs:[],components:[],reasons};
      if(opening){
        const conservative=wilson(result.w,result.n);
        const priority=Math.sqrt(result.n/maxOpening);
        const flexibility=Math.max(0,options.length-1)/4;
        result.share=stats.openingGames?100*result.n/stats.openingGames:0;
        result.components=[{label:'Conservative B1 results',points:65*conservative},{label:'Observed first-pick priority',points:25*priority},{label:'Observed role flexibility',points:10*flexibility}];
        result.score=result.components.reduce((sum,c)=>sum+c.points,0);
        result.coverage=result.n/(result.n+20);
      }else{
        const base=rate(overall);
        const evidence=(id,enemy)=>{
          const pair=(enemy?stats.against:stats.pairs).get(c.id+'|'+id)||{n:0,w:0};
          const expected=baselineExpectation(base,rate(stats.champions.get(id)),enemy);
          const lift=(pair.w-pair.n*expected)/(pair.n+20);
          return {id,...pair,expected,lift,support:pair.n/(pair.n+20)};
        };
        result.sy=allies.map(id=>evidence(id,false));result.vs=enemies.map(id=>evidence(id,true));
        const mean=arr=>arr.length?arr.reduce((sum,p)=>sum+p.lift,0)/arr.length:0;
        result.components=[{label:'Overall results (small adjustment)',points:10*(base-0.5)},{label:'Ally pairing lift',points:45*mean(result.sy)},{label:'Opponent matchup lift',points:45*mean(result.vs)}];
        result.score=Math.max(0,Math.min(100,50+result.components.reduce((sum,c)=>sum+c.points,0)));
        const links=[...result.sy,...result.vs];
        result.coverage=links.length?links.reduce((sum,p)=>sum+p.support,0)/links.length:0;
        result.supportedLinks=links.filter(p=>p.n>=5).length;
        if(!result.supportedLinks)reasons.push('No current ally/opponent pairing has at least 5 games');
      }
      result.eligible=reasons.length===0;
      return result;
    });
    const eligible=results.filter(c=>c.eligible).sort((a,b)=>b.score-a.score||b.n-a.n||a.name.localeCompare(b.name));
    eligible.forEach((c,i)=>c.rank=i+1);
    return [...eligible,...results.filter(c=>!c.eligible).sort((a,b)=>a.name.localeCompare(b.name))];
  }
  function openingRecommendations(stats, history, roster, minimum=5){
    return assess(stats,[],false,roster,minimum).filter(c=>c.eligible&&!history.includes(c.id)).slice(0,5);
  }
  function recommend(stats, history, bans, roster, minimum=5){
    return assess(stats,history,bans,roster,minimum).filter(c=>c.eligible).slice(0,5);
  }
  const api={key,roles,sequence,state,validHistory,aggregate,fits,recommend,openingRecommendations,assess,wilson};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DraftEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
