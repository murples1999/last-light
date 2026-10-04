import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, tokens, cmd, room } from './helpers.mjs';
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

for (const count of [1, 2, 3]) test(`${count} people cover all stations and consent once per person`, async () => {
  const h = harness(), players = await room(h, count), ids = players.map(p => p.participantId);
  let current = players[0];
  assert.equal(new Set(current.state.crew.stationOwners).size, count);
  assert.equal(h.Crew.allAssignedOnline(current.state), true);
  same(h.Crew.voteEligibleIds(current.state).sort(), ids.sort());
  for (let i = 0; i < count; i++) {
    current = await h.request('sync', { code: current.code, token: tokens[i], command: cmd(current, 'hint') });
    assert.equal(current.status, 200);
    assert.equal(current.state.hints[0], i === count - 1 ? 1 : 0);
  }
  same(current.state.hintVotes, {});
});

test('disconnect reserves ownership; coordinator succession and explicit continue preserve puzzle', async () => {
  const h = harness(), players = await room(h, 3), [a, b, c] = players;
  let current = await h.request('sync', { code: a.code, token: tokens[0], command: cmd(a, 'power-set', 0, { field: 'feed0', value: '1' }) });
  const puzzle = structuredClone(current.state.power), epoch = current.state.epoch, version = current.state.crew.version;
  await h.request('leave', { code: a.code, token: tokens[0] });
  current = await h.request('sync', { code: a.code, token: tokens[1] });
  assert.equal(current.coordinator, true);
  assert.equal(current.state.crew.coordinatorId, b.participantId);
  assert.equal(current.state.crew.version, version);
  same(current.state.crew.stationOwners, a.state.crew.stationOwners);
  assert.equal(h.Crew.allAssignedOnline(current.state), false);
  const denied = await h.request('continue', { code: a.code, token: tokens[2], rosterVersion: version });
  assert.equal(denied.status, 403);
  current = await h.request('continue', { code: a.code, token: tokens[1], rosterVersion: version });
  assert.equal(current.status, 200);
  assert.equal(current.state.epoch, epoch);
  same(current.state.power, puzzle);
  assert.equal(current.state.crew.stationOwners[0], b.participantId);
  assert.equal(current.state.crew.version, version + 1);
  assert.equal(h.Crew.canCheck(current.state, b.participantId), true);
  const returned = await h.request('join', { code: a.code, token: tokens[0] });
  assert.equal(returned.participantId, a.participantId);
  same(returned.roles, []);
  assert.equal(returned.coordinator, false);
  assert.equal(returned.state.crew.stationOwners[0], b.participantId);
  const stale = await h.request('sync', { code: a.code, token: tokens[0], command: cmd(a, 'power-set', 0, { field: 'feed0', value: '2' }) });
  assert.equal(stale.errorCode, 'STALE_ROSTER');
  const wrongOwner = await h.request('sync', { code: a.code, token: tokens[0], command: cmd(returned, 'power-set', 0, { field: 'feed0', value: '2' }) });
  assert.equal(wrongOwner.errorCode, 'NOT_STATION_OWNER');
});

test('offline vote clears while still-online votes survive; no automatic rejoin consent', async () => {
  const h = harness(), [a, b, c] = await room(h, 3);
  let current = await h.request('sync', { token: tokens[0], code: a.code, command: cmd(a, 'hint') });
  current = await h.request('sync', { token: tokens[2], code: a.code, command: cmd(current, 'hint') });
  current = await h.request('leave', { token: tokens[2], code: a.code });
  assert.equal(current.state.hintVotes[a.participantId], true);
  assert.equal(current.state.hintVotes[c.participantId], undefined);
  current = await h.request('sync', { token: tokens[1], code: a.code, command: cmd(current, 'hint') });
  assert.equal(current.state.hints[0], 0);
  current = await h.request('join', { token: tokens[2], code: a.code });
  assert.equal(current.state.hints[0], 0);
  assert.equal(current.state.hintVotes[c.participantId], undefined);
  current = await h.request('sync', { token: tokens[2], code: a.code, command: cmd(current, 'hint') });
  assert.equal(current.state.hints[0], 1);
});

test('heartbeat expiration clears a returning vote even without an intervening poll', async () => {
  const h = harness(), [a] = await room(h, 2);
  const voted = await h.request('sync', { token: tokens[0], code: a.code, command: cmd(a, 'hint') });
  h.advance(15001);
  const returned = await h.request('sync', { token: tokens[0], code: a.code });
  assert.equal(returned.state.hintVotes[a.participantId], undefined);
  assert.equal(returned.state.hints[0], 0);
  assert.equal(h.Crew.allAssignedOnline(returned.state), false);
});

test('assignment and membership changes reset consent and reject stale commands', async () => {
  const h = harness(), [a, b] = await room(h, 2);
  let current = await h.request('sync', { token: tokens[0], code: a.code, command: cmd(a, 'hint') });
  const old = cmd(current, 'hint');
  current = await h.request('assign', { token: tokens[0], code: a.code, rosterVersion: current.state.crew.version, stationOwners: [b.participantId, a.participantId, b.participantId] });
  assert.equal(current.status, 200);
  same(current.state.hintVotes, {});
  assert.equal(h.Crew.canCheck(current.state, a.participantId), false);
  assert.equal(h.Crew.canCheck(current.state, b.participantId), true);
  const stale = await h.request('sync', { token: tokens[0], code: a.code, command: old });
  assert.equal(stale.errorCode, 'STALE_ROSTER');
  const missing = await h.request('sync', { token: tokens[0], code: a.code, command: { ...cmd(current, 'hint'), rosterVersion: undefined } });
  assert.equal(missing.errorCode, 'STALE_ROSTER');
  current = await h.request('sync', { token: tokens[0], code: a.code, command: cmd(current, 'hint') });
  current = await h.request('join', { token: tokens[2], code: a.code });
  same(current.state.hintVotes, {});
});

test('command retries are idempotent, ID misuse rejected, reset retains crew and retry receipt', async () => {
  const h = harness(), [a] = await room(h, 2), vote = cmd(a, 'hint');
  const first = await h.request('sync', { token: tokens[0], code: a.code, command: vote });
  const duplicate = await h.request('sync', { token: tokens[0], code: a.code, command: vote });
  same(duplicate.state.hintVotes, first.state.hintVotes);
  const misuse = await h.request('sync', { token: tokens[0], code: a.code, command: { ...vote, type: 'power-check' } });
  assert.equal(misuse.errorCode, 'COMMAND_REPLAY');
  const reset = cmd(first, 'reset');
  const result = await h.request('sync', { token: tokens[0], code: a.code, command: reset });
  const again = await h.request('sync', { token: tokens[0], code: a.code, command: reset });
  assert.notEqual(result.state.epoch, a.state.epoch);
  assert.equal(again.state.epoch, result.state.epoch);
  same(result.state.crew, a.state.crew);
  same(result.state.hintVotes, {});
});

test('new joins cannot steal offline reserved stations; replacement follows explicit continue', async () => {
  const h = harness(), [a] = await room(h, 3);
  await h.request('leave', { token: tokens[2], code: a.code });
  let result = await h.request('join', { token: tokens[3], code: a.code });
  assert.equal(result.status, 409);
  result = await h.request('continue', { token: tokens[0], code: a.code, rosterVersion: a.state.crew.version });
  result = await h.request('join', { token: tokens[3], code: a.code });
  assert.equal(result.status, 200);
  assert.equal(result.roles.length, 1);
  result = await h.request('join', { token: tokens[2], code: a.code });
  same(result.roles, []);
  const observerVote = await h.request('sync', { token: tokens[2], code: a.code, command: cmd(result, 'hint') });
  assert.equal(observerVote.errorCode, 'NOT_ASSIGNED');
});


for (const count of [2, 3]) test(`${count}-player randomized rotation is fair across repeated blocks`, () => {
  const { Crew } = harness();
  const outcomes = new Set();
  for (let seed = 0; seed < 128; seed++) {
    let n = (seed * 2654435761 + 1) >>> 0;
    const random = () => ((n = (1664525 * n + 1013904223) >>> 0) / 2 ** 32);
    let owners = count === 3 ? ['a', 'b', 'c'] : ['a', 'b', 'a'], rotation;
    const history = [owners];
    for (let level = 1; level < 60; level++) {
      const next = Crew.nextRotation(owners, rotation, random);
      if (level === 1) outcomes.add(JSON.stringify(next.owners));
      if (count === 3) assert.ok(next.owners.every((id, r) => id !== owners[r]));
      else for (const id of ['a', 'b'])
        assert.notEqual(next.owners.filter(x => x === id).length, owners.filter(x => x === id).length);
      ({ owners, rotation } = JSON.parse(JSON.stringify(next)));
      history.push(owners);
    }
    const block = count === 3 ? 3 : 6;
    for (let start = 0; start < history.length; start += block)
      for (const id of count === 3 ? ['a', 'b', 'c'] : ['a', 'b'])
        for (let role = 0; role < 3; role++)
          assert.equal(history.slice(start, start + block).filter(x => x[role] === id).length, count === 3 ? 1 : 3);
  }
  assert.equal(outcomes.size, 2, 'both random directions are reachable');
});

test('solo rotation preserves all stations without drawing randomness', () => {
  const next = harness().Crew.nextRotation(['a', 'a', 'a'], null, () => assert.fail('solo rerolled'));
  same(next.owners, ['a', 'a', 'a']);
});
