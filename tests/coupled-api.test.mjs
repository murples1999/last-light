import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, tokens, cmd } from './helpers.mjs';
import { copy, solution } from './campaign-helpers.mjs';

const stored = (h, r) => JSON.parse(h.rows.get(r.code).state);
async function room(h, count, seed = 0, mode = 'campaign-v2') {
  let r = await h.request('create', { token: tokens[0], mode });
  assert.equal(r.status, 200, r.error);
  // Fix a legal seed in test storage; seed selection is not a public API control.
  const row = h.rows.get(r.code), state = stored(h, r);
  state.campaign = h.Campaign.create(seed, { version: mode === 'campaign-v2' ? 2 : 1 });
  row.state = JSON.stringify(state);
  for (let i = 1; i < count; i++)
    assert.equal((await h.request('join', { code:r.code, token:tokens[i] })).status, 200);
  return h.request('sync', { code:r.code, token:tokens[0] });
}
function tokenFor(h, r, role, coordinator = false) {
  const members = JSON.parse(h.rows.get(r.code).members);
  const id = coordinator ? r.state.crew.coordinatorId : r.state.crew.stationOwners[role];
  return tokens[members.findIndex(m => m.id === id)];
}
async function act(h, r, type, role = 0, extra = {}) {
  const token = tokenFor(h, r, role, ['campaign-next','campaign-restart','reset'].includes(type));
  const result = await h.request('sync', { code:r.code, token, command:cmd(r,type,role,extra) });
  assert.equal(result.status, 200, `${type} at level ${r.state.stage}: ${result.error}`);
  return result;
}
async function plan(h, r) {
  for (const c of solution(h.Campaign, stored(h,r).campaign))
    r = await act(h,r,c.type,c.role,{field:c.field,value:c.value});
  return r;
}
async function solve(h, r) { return act(h,await plan(h,r),'campaign-check'); }
async function at(h, r, level) {
  while(r.state.stage < level) r = await act(h,await solve(h,r),'campaign-next');
  return r;
}

for (const count of [1,2,3]) test(`v2 API completes all 72 seeds with ${count} players and fair checkpoint roles`, async () => {
  for (let seed = 0; seed < 72; seed++) {
    const h = harness();
    let r = await room(h,count,seed);
    const coordinator = r.state.crew.coordinatorId, history = [copy(r.state.crew.stationOwners)];
    for (let level=0; level<10; level++) {
      const crew = copy(r.state.crew);
      const phases = level === 9 ? 3 : 1;
      for (let phase=0; phase<phases; phase++) {
        const epoch = r.state.epoch;
        r = await solve(h,r);
        assert.equal(r.state.campaign.version,2);
        assert.deepEqual(r.state.crew,crew);
        if(level===9 && phase<2) {
          assert.notEqual(r.state.epoch,epoch);
          assert.equal(r.state.campaign.status,'playing');
          assert.equal(r.state.log.length,9);
        }
      }
      assert.equal(r.state.log.length,level+1);
      assert.equal(r.state.campaign.completed.length,level+1);
      for(let player=0;player<count;player++) {
        const synced=await h.request('sync',{code:r.code,token:tokens[player]});
        assert.equal(synced.status,200,`seed ${seed}, level ${level+1}, player ${player+1}: ${synced.error}`);
        assert.deepEqual(Object.keys(synced.state.campaign.views),synced.roles.map(String));
      }
      if(level<9) {
        r = await act(h,r,'campaign-next');
        const owners = r.state.crew.stationOwners, prior = history.at(-1);
        assert.equal(r.state.crew.coordinatorId,coordinator);
        assert.equal(new Set(owners).size,count);
        if(count===3) assert.ok(owners.every((id,role)=>id!==prior[role]));
        if(count===2) for(const id of new Set(owners))
          assert.notEqual(owners.filter(x=>x===id).length,prior.filter(x=>x===id).length);
        history.push(copy(owners));
      }
    }
    assert.equal(r.state.campaign.status,'complete');
    assert.equal(r.state.stage,10);
    assert.ok(r.state.finished >= r.state.started);
    for(let start=0;start+(count===3?3:6)<=history.length;start+=count===3?3:6)
      for(const id of new Set(history[0])) for(let role=0;role<3;role++)
        assert.equal(history.slice(start,start+(count===3?3:6)).filter(x=>x[role]===id).length,count===3?1:count===2?3:6);
  }
});

test('explicit v2 creation, reset/restart and TTL coexist with saved v1 dispatch', async () => {
  const h=harness();
  for(const mode of ['campaign-v1','campaign-v2']) {
    let r=await room(h,2,17,mode);
    const version=mode==='campaign-v2'?2:1;
    assert.equal(r.state.campaign.version,version);
    assert.equal(h.rows.get(r.code).expires-h.now(),86400000);
    r=await at(h,r,5);
    assert.equal(r.state.campaign.version,version);
    // Sync every owner to verify their version-specific projected console.
    const views=[];
    for(let i=0;i<2;i++) {
      const p=await h.request('sync',{code:r.code,token:tokens[i]});
      views.push(...Object.values(p.state.campaign.views));
      assert.deepEqual(Object.keys(p.state.campaign.views),p.roles.map(String));
    }
    const allFields=views.flatMap(v=>v.controls.map(c=>c.field));
    assert.ok(allFields.includes(version===2?'shielding':'fuel'));
    assert.ok(!allFields.includes(version===2?'fuel':'shielding'));
    r=await act(h,r,'campaign-restart');
    assert.equal(r.state.campaign.version,version);
    const crew=copy(r.state.crew);
    r=await act(h,r,'reset');
    assert.equal(r.state.mode,mode);
    assert.equal(r.state.campaign.version,version);
    assert.deepEqual(r.state.crew,crew);
  }
  const classic=await h.request('create',{token:tokens[0]});
  assert.equal(classic.state.campaign,undefined);
  assert.equal(h.rows.get(classic.code).expires-h.now(),7200000);
});

test('unsupported or mismatched saved versions fail closed without changing storage', async () => {
  for(const version of [3,'2',1]) {
    const h=harness(),r=await room(h,1);
    const row=h.rows.get(r.code),state=stored(h,r);
    state.campaign.version=version; row.state=JSON.stringify(state);
    const before=copy(row);
    const denied=await h.request('sync',{code:r.code,token:tokens[0]});
    assert.equal(denied.errorCode,'UNSUPPORTED_CAMPAIGN');
    assert.deepEqual(h.rows.get(r.code),before);
  }
});

for(const count of [1,2,3]) test(`v2 finale conflict/revision/reconnect rejects stale workspace controls (${count} players)`,async()=>{
  let h=harness(),r=await room(h,count);
  r=await at(h,r,9);
  r=await solve(h,r); // radio-heavy repair -> flight
  const crew=copy(r.state.crew), evidence=copy(stored(h,r).campaign.puzzle.power.observations);
  for(const [role,field,value] of [[2,'flightRoute','sheltered'],[1,'frequency','3'],[0,'gain','1'],[2,'phase','0']])
    r=await act(h,r,'campaign-set',role,{field,value});
  r=await act(h,r,'campaign-check');
  assert.match(r.state.feedback,/provides 3 flight fuel.*needs 5/);
  assert.equal(stored(h,r).campaign.puzzle.phase,1);
  const delayed=cmd(r,'campaign-set',2,{field:'flightRoute',value:'direct'}), delayedToken=tokenFor(h,r,2);
  r=await act(h,r,'hint');
  const revision=cmd(r,'campaign-action',2,{field:'reviseRepair',value:'reviseRepair'}), reviser=tokenFor(h,r,2), epoch=r.state.epoch;
  r=await h.request('sync',{code:r.code,token:reviser,command:revision});
  assert.equal(r.status,200,r.error);
  assert.notEqual(r.state.epoch,epoch);
  assert.deepEqual(r.state.hintVotes,{});
  assert.deepEqual(r.state.crew,crew);
  assert.deepEqual(stored(h,r).campaign.puzzle.power.observations,evidence);
  const again=await h.request('sync',{code:r.code,token:reviser,command:revision});
  assert.equal(again.state.epoch,r.state.epoch);
  assert.equal((await h.request('sync',{code:r.code,token:delayedToken,command:delayed})).errorCode,'STALE_PUZZLE');
  // New worker instance and reconnect preserve the reopened workspace and roles.
  const row=copy(h.rows.get(r.code)); h=harness();h.rows.set(r.code,row);
  for(let i=0;i<count;i++) {
    r=await h.request('join',{code:r.code,token:tokens[i]});
    assert.equal(r.state.campaign.views[r.roles[0]].progress.step,0);
    assert.deepEqual(r.state.crew,crew);
  }
  r=await act(h,r,'campaign-set',0,{field:'busProfile',value:'drive'});
  r=await solve(h,r); // retain sheltered route, rebalance repair
  r=await solve(h,r); // compatible flight -> launch
  const launchEpoch=r.state.epoch, staleLaunch=cmd(r,'campaign-action',0,{field:'cool',value:'cool'}), launcher=tokenFor(h,r,0);
  r=await plan(h,r);
  r=await act(h,r,'campaign-action',1,{field:'reviseFlight',value:'reviseFlight'});
  assert.notEqual(r.state.epoch,launchEpoch);
  assert.equal(stored(h,r).campaign.puzzle.phase,1);
  assert.deepEqual(stored(h,r).campaign.puzzle.sequence,[]);
  assert.deepEqual(r.state.crew,crew);
  assert.equal((await h.request('sync',{code:r.code,token:launcher,command:staleLaunch})).errorCode,'STALE_PUZZLE');
  // Even when the same launch workspace returns, old commands stay stale.
  r=await solve(h,r);
  assert.equal((await h.request('sync',{code:r.code,token:launcher,command:staleLaunch})).errorCode,'STALE_PUZZLE');
  r=await solve(h,r);
  assert.equal(r.state.campaign.status,'complete');
  assert.equal(r.state.log.length,10);
});

test('v2 disabled descriptors match server interlocks and retuning preserves safe preparation',async()=>{
  const h=harness(); let r=await at(h,await room(h,3),7);
  const readControl=async(role,field)=>{
    const p=await h.request('sync',{code:r.code,token:tokenFor(h,r,role)});
    return p.state.campaign.views[role].controls.find(c=>c.field===field);
  };
  const prime=await readControl(0,'prime');
  assert.equal(prime.disabled,true);assert.equal(typeof prime.reason,'string');
  for(const [role,field] of [[0,'cool'],[1,'vent'],[2,'release']])
    r=await act(h,r,'campaign-action',role,{field,value:field});
  r=await act(h,r,'campaign-action',0,{field:'prime',value:'prime'});
  assert.deepEqual(stored(h,r).campaign.puzzle.sequence,['cool','vent','release']);
  assert.match(r.state.feedback,/Safety interlock/);
  r=await plan(h,r);
  assert.equal(stored(h,r).campaign.puzzle.sequence.length,6);
  r=await act(h,r,'campaign-set',0,{field:'gain',value:'0'});
  assert.deepEqual(stored(h,r).campaign.puzzle.sequence,['cool','vent','release']);
  assert.equal((await readControl(0,'prime')).disabled,true);
  r=await solve(h,r);
  assert.equal(r.state.campaign.status,'checkpoint');
});

test('v2 checkpoint duplicate Continue, offline recovery and epoch rollover preserve rotation',async()=>{
  const h=harness();let r=await room(h,3);
  r=await solve(h,r);
  await h.request('leave',{code:r.code,token:tokens[2]});
  const blocked=await h.request('sync',{code:r.code,token:tokens[0],command:cmd(r,'campaign-next')});
  assert.equal(blocked.errorCode,'STATIONS_RESERVED');
  r=await h.request('continue',{code:r.code,token:tokens[0],rosterVersion:r.state.crew.version});
  const next=cmd(r,'campaign-next');h.conflict(2);
  r=await h.request('sync',{code:r.code,token:tokens[0],command:next});
  assert.equal(r.status,200,r.error);
  const crew=copy(r.state.crew);
  const retry=await h.request('sync',{code:r.code,token:tokens[0],command:next});
  assert.deepEqual(retry.state.crew,crew);
  const returned=await h.request('join',{code:r.code,token:tokens[2]});
  assert.deepEqual(returned.roles,[]);
  crew.participants=copy(returned.state.crew.participants);
  const epoch=r.state.epoch;
  for(let i=0;i<66;i++)r=await h.request('sync',{code:r.code,token:tokens[0],command:cmd(r,'hint')});
  assert.equal(r.status,200);assert.notEqual(r.state.epoch,epoch);
  assert.deepEqual(r.state.crew,crew);
});
