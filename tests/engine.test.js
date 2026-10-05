const test=require('node:test');const assert=require('node:assert/strict');
const E=require('../engine');const {normalize}=require('../importer');
const roles=E.roles;
function game(id,winner='blue') {return {id,league:'Test',patch:'1.1',winner,draftOrder:{blue:roles.map((_,i)=>'b'+i),red:roles.map((_,i)=>'r'+i)},blue:roles.map((r,i)=>({c:'b'+i,r})),red:roles.map((r,i)=>({c:'r'+i,r}))};}
function rows(g){return ['blue','red'].flatMap(side=>g[side].map(p=>({gameid:g.id,side,position:p.r,champion:p.c,result:side===g.winner?'1':'0',league:g.league,patch:g.patch})));}
test('pick order matches both user-requested phases',()=>assert.deepEqual(E.sequence().map(a=>a.team[0]+(a.index+1)),['b1','r1','r2','b2','b3','r3','r4','b4','b5','r5']));
test('full draft has 10 bans, same picks, correct second ban phase',()=>{const seq=E.sequence(true);assert.equal(seq.length,20);assert.deepEqual(seq.filter(a=>a.type==='pick'),E.sequence());assert.deepEqual(seq.slice(12,16).map(a=>a.team),['red','blue','red','blue']);});
test('state and undo preserve current pick',()=>{const h=['b0','r0','r1'];assert.equal(E.state(h).active.team,'blue');h.pop();assert.equal(E.state(h).active.team,'red');assert.equal(E.state(h).active.index,1);});
test('invalid saved histories rejected',()=>{const set=new Set(['a','b']);assert.equal(E.validHistory(['a','a'],false,set),false);assert.equal(E.validHistory(['x'],false,set),false);assert.equal(E.validHistory(['a','b'],false,set),true);});
test('CSV normalization accepts player rows and ignores aggregate team rows',()=>{const r=rows(game('1'));r.push({position:'team'});assert.equal(normalize(r).games.length,1);});
test('reject incomplete, duplicate, invalid outcomes, and inconsistent metadata',()=>{const r=rows(game('1'));assert.equal(normalize(r.slice(1)).rejected,1);assert.equal(normalize([...r,r[0]]).rejected,1);const bad=structuredClone(r);bad[0].result='';assert.equal(normalize(bad).rejected,1);const patch=structuredClone(r);patch[0].patch='2.1';assert.equal(normalize(patch).rejected,1);});
test('filters do not silently broaden',()=>{const g=game('1');assert.equal(E.aggregate([g],'Other').n,0);assert.equal(E.aggregate([g],'','2.2').n,0);assert.equal(E.aggregate([g],'Test','1.1').n,1);});
test('pair and opponent sample counts correspond to games',()=>{const s=E.aggregate([game('1'),game('2','red')]);assert.deepEqual(s.pairs.get('b0|b1'),{n:2,w:1});assert.deepEqual(s.against.get('b0|r0'),{n:2,w:1});});
test('flex assignment is possible without locking roles early',()=>{const stats={champions:new Map([['a',{n:10,roles:{top:5,mid:5}}],['b',{n:10,roles:{top:10}}],['c',{n:10,roles:{top:10}}]])};assert.equal(E.fits(['a','b'],stats),true);assert.equal(E.fits(['b','c'],stats),false);});
test('recommendations exclude unavailable champions, honor samples and stop at completion',()=>{const games=Array.from({length:10},(_,i)=>game(String(i)));const stats=E.aggregate(games);const roster=[...games[0].blue,...games[0].red].map(p=>({id:p.c,name:p.c}));assert.equal(E.recommend(stats,[],false,roster,11).length,0);const recs=E.recommend(stats,['b0'],false,roster,1);assert(recs.length<=5);assert(recs.every(c=>c.id!=='b0'));assert(recs.every(c=>Number.isFinite(c.score)));assert.equal(E.recommend(stats,roster.map(c=>c.id),false,roster,1).length,0);assert.equal(E.recommend(stats,[],true,roster,1).length,0);});
test('selection changes evidence for the next team',()=>{const gs=Array.from({length:10},(_,i)=>game(String(i)));const s=E.aggregate(gs);const roster=[...gs[0].blue,...gs[0].red].map(p=>({id:p.c,name:p.c}));const before=E.recommend(s,[],false,roster,1);const after=E.recommend(s,['b0'],false,roster,1);assert.equal(before[0].vs.length,0);assert.equal(after[0].vs.length,1);assert.equal(after[0].vs[0].id,'b0');});

test('B1 is read from team draft order, never player order',()=>{
  const r=rows(game('1'));
  r.push({gameid:'1',side:'Blue',position:'team',pick1:'b3',pick2:'b0',pick3:'b1',pick4:'b2',pick5:'b4'});
  const g=normalize(r).games[0];assert.equal(g.draftOrder.blue[0],'b3');
  const s=E.aggregate([g]);assert.equal(s.firstPicks.get('b3').n,1);assert.equal(s.firstPicks.has('b0'),false);
});
test('missing and malformed draft order never invent first picks',()=>{
  const r=rows(game('1'));let g=normalize(r).games[0];assert.equal(E.aggregate([g]).openingGames,0);
  r.push({gameid:'1',side:'Blue',position:'team',pick1:'b0',pick2:'b0',pick3:'b2',pick4:'b3',pick5:'b4'});
  g=normalize(r).games[0];assert.equal(E.aggregate([g]).openingGames,0);
});
test('opening ranks B1 outcomes rather than overall champion outcomes',()=>{
  const games=[];
  for(let i=0;i<10;i++){const g=game(String(i),i<8?'blue':'red');g.draftOrder.blue=['b0','b1','b2','b3','b4'];games.push(g);}
  for(let i=0;i<10;i++){const g=game(String(i+10),i<2?'blue':'red');g.draftOrder.blue=['b1','b0','b2','b3','b4'];games.push(g);}
  const stats=E.aggregate(games),roster=[{id:'b0',name:'A'},{id:'b1',name:'B'}];
  assert.equal(stats.champions.get('b0').w,stats.champions.get('b1').w);
  const result=E.recommend(stats,[],false,roster,5);assert.equal(result[0].id,'b0');assert.equal(result[0].share,50);assert.equal(result[0].n,10);assert(result[0].score>result[1].score);
  assert.equal(E.openingRecommendations(stats,['b0'],roster,5)[0].id,'b1');assert.equal(E.openingRecommendations(stats,[],roster,11).length,0);
});

test('draft evidence can outrank a higher overall win rate and responds to enemy changes',()=>{
  const champions=new Map([['high',{n:100,w:60,roles:{top:100}}],['fit',{n:100,w:50,roles:{mid:100}}],['enemy',{n:100,w:50,roles:{top:100}}],['other',{n:100,w:50,roles:{mid:100}}]]);
  const stats={champions,pairs:new Map(),against:new Map([['high|enemy',{n:40,w:8}],['fit|enemy',{n:40,w:32}],['high|other',{n:40,w:32}],['fit|other',{n:40,w:8}]]),firstPicks:new Map(),openingGames:0,openingWins:0,n:100};
  const roster=[{id:'high',name:'High win rate'},{id:'fit',name:'Draft fit'}];
  assert.equal(E.recommend(stats,['enemy'],false,roster,5)[0].id,'fit');
  assert.equal(E.recommend(stats,['other'],false,roster,5)[0].id,'high');
});
test('all candidates remain inspectable when samples or current matchup evidence are missing',()=>{
  const stats=E.aggregate([game('1')]);
  const candidates=E.assess(stats,['b0'],false,[{id:'r0',name:'Rare'},{id:'unknown',name:'Unseen'}],5);
  assert.equal(candidates.length,2);assert(candidates.every(c=>!c.eligible));
  assert(candidates.find(c=>c.id==='unknown').reasons.some(r=>r.includes('No appearances')));
  assert(candidates.every(c=>Number.isFinite(c.score)));
});
test('missing evidence contributes no lift and cannot create a supported recommendation',()=>{
  const stats=E.aggregate(Array.from({length:40},(_,i)=>game(String(i))));
  const result=E.assess(stats,['unseen'],false,[{id:'b0',name:'A'}],5)[0];
  assert.equal(result.vs[0].lift,0);assert.equal(result.eligible,false);assert.equal(result.coverage,0);
});
test('B1 conservative scoring does not elevate a one-game perfect record over established success',()=>{
  assert(E.wilson(1,1)<E.wilson(60,100));
});
