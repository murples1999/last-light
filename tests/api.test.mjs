import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, tokens, cmd, room } from './helpers.mjs';
const copy = value => JSON.parse(JSON.stringify(value));

async function solve(h, initial, count) {
  let result = initial;
  const members = JSON.parse(h.rows.get(result.code).members);
  const tokensById = Object.fromEntries(members.map((m, i) => [m.id, tokens[i]]));
  const act = async (type, role, extra = {}) => {
    const owner = result.state.crew.stationOwners[role];
    result = await h.request('sync', { code: result.code, token: tokensById[owner], command: cmd(result, type, role, extra) });
    assert.equal(result.status, 200, result.error);
  };
  const p = result.state.power, targets = { K7: 2, M4: 3, R2: 1 };
  await act('power-set', 1, { field: 'isolate', value: String(p.fault) });
  await act('power-set', 2, { field: 'patch', value: p.routes[p.fault] });
  for (let feed = 0; feed < 4; feed++) await act('power-set', 0, { field: 'feed' + feed, value: String(feed === p.fault ? 0 : targets[feed === p.spare ? p.routes[p.fault] : p.routes[feed]]) });
  await act('power-check', 0);
  assert.equal(result.state.stage, 1);
  for (const [role, field, value] of [[0, 'first', '8'], [1, 'middle', '2'], [2, 'last', '6']]) await act('set', role, { field, value });
  for (const role of [0, 1, 2]) await act('lock', role);
  assert.equal(result.state.stage, 2);
  for (const [role, field, value] of [[0, 'pressure', '5'], [1, 'call', 'DAWN'], [2, 'ring', '2'], [2, 'spoke', '6']]) await act('set', role, { field, value });
  for (const role of [0, 1, 2]) await act('lock', role);
  assert.equal(result.state.stage, 3);
  assert.equal(result.state.log.length, 3);
  assert.ok(result.state.finished >= result.state.started);
  assert.equal(new Set(result.state.crew.stationOwners).size, count);
  return result;
}
for (const count of [1, 2, 3]) test(`complete all three stages with ${count} assigned people`, async () => {
  const h = harness(), [a] = await room(h, count);
  await solve(h, a, count);
});

test('remaining participant completes after both colleagues disconnect, without resetting progress', async () => {
  const h = harness(), [a, b, c] = await room(h, 3);
  await h.request('leave', { code: a.code, token: tokens[0] });
  await h.request('leave', { code: a.code, token: tokens[1] });
  let result = await h.request('sync', { code: a.code, token: tokens[2] });
  assert.equal(result.coordinator, true);
  result = await h.request('continue', { code: a.code, token: tokens[2], rosterVersion: result.state.crew.version });
  assert.deepEqual(result.roles, [0, 1, 2]);
  await solve(h, result, 1);
});

for (const count of [1, 2, 3]) test(`migrate a legacy ${count}-member room in place`, async () => {
  const h = harness(), players = await room(h, count), a = players[0];
  const row = h.rows.get(a.code), state = JSON.parse(row.state), members = JSON.parse(row.members);
  delete state.crew;
  state.stage = 1; state.values.first = '8'; state.hints[0] = 1;
  state.hintVotes = [true, true, false]; state.recent = ['legacy-command'];
  const oldMembers = members.map(({ token, seen }) => ({ token, seen }));
  while (oldMembers.length < 3) oldMembers.push(null);
  row.state = JSON.stringify(state); row.members = JSON.stringify(oldMembers);
  const result = await h.request('sync', { token: tokens[0], code: a.code });
  assert.equal(result.status, 200);
  assert.equal(result.state.stage, 1);
  assert.equal(result.state.epoch, state.epoch);
  assert.deepEqual(result.state.power, state.power);
  assert.equal(result.state.values.first, '8');
  assert.equal(result.state.hints[0], 1);
  assert.deepEqual(result.state.hintVotes, {});
  assert.equal(new Set(result.state.crew.stationOwners).size, count);
  assert.equal(h.Crew.allAssignedOnline(result.state), true);
  const again = await h.request('sync', { token: tokens[0], code: a.code });
  assert.deepEqual(again.state.crew, result.state.crew);
});

test('input/auth errors do not change persisted puzzle state or expose session material', async () => {
  const h = harness(), [a, b] = await room(h, 2);
  const persisted = () => copy(h.rows.get(a.code));
  const before = persisted();
  const cases = [
    ['sync', { token: tokens[2], code: a.code }, 403],
    ['assign', { token: tokens[1], code: a.code, rosterVersion: a.state.crew.version, stationOwners: [b.participantId, b.participantId, b.participantId] }, 403],
    ['assign', { token: tokens[0], code: a.code, rosterVersion: a.state.crew.version, stationOwners: ['unknown', b.participantId, a.participantId] }, 400],
    ['sync', { token: tokens[1], code: a.code, command: cmd(b, 'reset') }, 403],
    ['sync', { token: tokens[1], code: a.code, command: cmd(b, 'power-set', 0, { participantId: a.participantId, field: 'feed0', value: '1' }) }, 403],
    ['sync', { token: tokens[0], code: a.code, command: cmd(a, 'power-set', 0, { field: 'feed0', value: '9' }) }, 400],
    ['sync', { token: tokens[0], code: a.code, command: cmd(a, 'power-set', 0, { field: 'feed0', value: '1', epoch: 'stale' }) }, 409],
    ['sync', { token: tokens[0], code: a.code, command: cmd(a, 'nonsense') }, 400],
    ['join', { token: tokens[0], code: a.code, command: cmd(a, 'hint') }, 400],
    ['leave', { token: tokens[0], code: a.code, command: cmd(a, 'hint') }, 400],
  ];
  for (const [path, body, status] of cases) {
    const result = await h.request(path, body);
    assert.equal(result.status, status, result.error);
    assert.deepEqual(persisted(), before);
  }
  const text = JSON.stringify(a);
  for (const member of JSON.parse(before.members)) assert.ok(!text.includes(member.token));
  assert.ok(!text.includes(tokens[0]));
  assert.ok(!Object.hasOwn(a.state, 'recent'));
});

test('transport guards, room expiration, storage failure, and CAS retry/exhaustion', async () => {
  const h = harness();
  assert.equal((await h.request('create', { token: tokens[0] }, { method: 'GET' })).status, 405);
  assert.equal((await h.request('create', { token: tokens[0] }, { headers: { Origin: 'https://other.test' } })).status, 403);
  assert.equal((await h.request('create', { token: tokens[0] }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await h.request('create', 'x'.repeat(4097))).status, 413);
  assert.equal((await h.request('create', '{')).status, 400);
  assert.equal((await h.request('create', { token: 'bad' })).status, 400);
  const [a] = await room(h, 1);
  h.conflict(3);
  const result = await h.request('sync', { token: tokens[0], code: a.code, command: cmd(a, 'power-check', 0) });
  assert.equal(result.status, 200);
  assert.equal(result.state.power.checks, 1);
  h.conflict(8);
  const conflict = await h.request('sync', { token: tokens[0], code: a.code });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.errorCode, 'ROOM_BUSY');
  h.storageError(true);
  assert.equal((await h.request('sync', { token: tokens[0], code: a.code })).status, 503);
  h.storageError(false);
  h.advance(7200001);
  assert.equal((await h.request('sync', { token: tokens[0], code: a.code })).status, 404);
});

test('concurrent votes persist once per participant and cannot reveal twice', async () => {
  const h = harness(), [a] = await room(h, 3);
  const responses = await Promise.all(tokens.slice(0, 3).map(token => h.request('sync', { token, code: a.code, command: cmd(a, 'hint') })));
  responses.forEach(r => assert.equal(r.status, 200));
  const current = await h.request('sync', { token: tokens[0], code: a.code });
  assert.equal(current.state.hints[0], 1);
  assert.deepEqual(current.state.hintVotes, {});
});

test('a returned observer can recover a room when all current operators are gone', async () => {
  const h = harness(), [a] = await room(h, 3);
  await h.request('leave', { token: tokens[0], code: a.code });
  let result = await h.request('sync', { token: tokens[1], code: a.code });
  await h.request('continue', { token: tokens[1], code: a.code, rosterVersion: result.state.crew.version });
  await h.request('leave', { token: tokens[1], code: a.code });
  await h.request('leave', { token: tokens[2], code: a.code });
  result = await h.request('join', { token: tokens[0], code: a.code });
  assert.equal(result.coordinator, true);
  assert.deepEqual(result.roles, []);
  result = await h.request('continue', { token: tokens[0], code: a.code, rosterVersion: result.state.crew.version });
  assert.deepEqual(result.roles, [0, 1, 2]);
  assert.equal(result.state.epoch, a.state.epoch);
});

test('an in-flight poll cannot revive an explicit leave on CAS retry', async () => {
  const h = harness(), [a] = await room(h, 2);
  const gate = h.holdNextUpdate();
  const pendingPoll = h.request('sync', { token: tokens[1], code: a.code });
  await gate.entered;
  const left = await h.request('leave', { token: tokens[1], code: a.code });
  assert.equal(left.status, 200);
  gate.release();
  const stalePoll = await pendingPoll;
  assert.equal(stalePoll.status, 403);
  assert.equal(stalePoll.errorCode, 'SESSION_LEFT');
  assert.equal(JSON.parse(h.rows.get(a.code).members)[1].seen, 0);
  const rejoin = await h.request('join', { token: tokens[1], code: a.code });
  assert.equal(rejoin.status, 200);
  assert.equal(h.Crew.allAssignedOnline(rejoin.state), true);
});

test('power controls reject coercible objects and arrays', async () => {
  const h = harness(), [a] = await room(h, 1);
  for (const value of [[], {}, null, true, 1]) {
    const result = await h.request('sync', { token: tokens[0], code: a.code, command: cmd(a, 'power-set', 0, { field: 'feed0', value }) });
    assert.equal(result.status, 400);
  }
});

