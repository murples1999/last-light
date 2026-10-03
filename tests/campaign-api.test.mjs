import test from "node:test";
import assert from "node:assert/strict";
import { harness, tokens, cmd } from "./helpers.mjs";
import { copy, solution } from "./campaign-helpers.mjs";

async function campaignRoom(h, count = 1) {
  const players = [
    await h.request("create", { token: tokens[0], mode: "campaign-v1" }),
  ];
  for (let i = 1; i < count; i++)
    players.push(
      await h.request("join", { token: tokens[i], code: players[0].code }),
    );
  for (let i = 0; i < count; i++)
    players[i] = await h.request("sync", {
      token: tokens[i],
      code: players[0].code,
    });
  return players;
}
const stored = (h, r) => JSON.parse(h.rows.get(r.code).state);
async function act(h, r, type, role, extra = {}) {
  const members = JSON.parse(h.rows.get(r.code).members),
    owner = r.state.crew.stationOwners[role ?? 0];
  const participant = ["campaign-next", "campaign-restart", "reset"].includes(
    type,
  )
    ? r.state.crew.coordinatorId
    : owner;
  const token = tokens[members.findIndex((m) => m.id === participant)];
  const result = await h.request("sync", {
    code: r.code,
    token,
    command: cmd(r, type, role, extra),
  });
  assert.equal(result.status, 200, result.error);
  return result;
}
async function solvePhase(h, r) {
  for (const c of solution(h.Campaign, stored(h, r).campaign))
    r = await act(h, r, c.type, c.role, { field: c.field, value: c.value });
  return act(h, r, "campaign-check", 0);
}
async function advanceTo(h, r, level) {
  while (r.state.stage < level) {
    r = await solvePhase(h, r);
    r = await act(h, r, "campaign-next");
  }
  return r;
}
for (const count of [1, 2, 3])
  test(`campaign completes with ${count} people, exactly one checkpoint/log per level`, async () => {
    const h = harness();
    let [r] = await campaignRoom(h, count);
    const identity = r.state.crew.stationOwners.slice(),
      seed = r.state.campaign.seed;
    for (let level = 0; level < 10; level++) {
      r = await solvePhase(h, r);
      if (level === 9) {
        assert.equal(r.state.campaign.status, "playing");
        r = await solvePhase(h, r);
        assert.equal(r.state.campaign.status, "playing");
        r = await solvePhase(h, r);
      }
      assert.equal(r.state.log.length, level + 1);
      assert.equal(r.state.campaign.completed.length, level + 1);
      if (level < 9) {
        assert.equal(r.state.stage, level);
        assert.equal(r.state.campaign.status, "checkpoint");
        assert.equal(r.state.campaign.views[0].controls.length, 0);
        const epoch = r.state.epoch;
        r = await act(h, r, "campaign-next");
        assert.notEqual(r.state.epoch, epoch);
      }
    }
    assert.equal(r.state.stage, 10);
    assert.equal(r.state.campaign.status, "complete");
    assert.ok(r.state.finished >= r.state.started);
    assert.deepEqual(r.state.crew.stationOwners, identity);
    assert.equal(r.state.campaign.seed, seed);
  });

test("only explicit new campaign rooms use 24-hour TTL, classic remains two hours", async () => {
  const h = harness(),
    [c] = await campaignRoom(h),
    classic = await h.request("create", { token: tokens[1] });
  assert.equal(h.rows.get(c.code).expires - h.now(), 86400000);
  assert.equal(h.rows.get(classic.code).expires - h.now(), 7200000);
  assert.equal(
    (await h.request("create", { token: tokens[2], mode: "campaign-v2" }))
      .status,
    400,
  );
  h.advance(7200001);
  assert.equal(
    (await h.request("sync", { token: tokens[0], code: c.code })).status,
    200,
  );
  assert.equal(
    (await h.request("sync", { token: tokens[1], code: classic.code })).status,
    404,
  );
  h.advance(79200000);
  assert.equal(
    (await h.request("join", { token: tokens[0], code: c.code })).status,
    404,
  );
});

test("campaign hint consent is per person, capped at two, preserved on restart, reset at next level", async () => {
  const h = harness();
  let [r] = await campaignRoom(h, 2);
  const vote = async (token) => {
    r = await h.request("sync", {
      token,
      code: r.code,
      command: cmd(r, "hint"),
    });
    assert.equal(r.status, 200, r.error);
  };
  await vote(tokens[0]);
  assert.equal(r.state.hints[0], 0);
  await vote(tokens[1]);
  assert.equal(r.state.hints[0], 1);
  assert.equal(h.Campaign.hints(r.state.campaign).length, 1);
  await vote(tokens[0]);
  await vote(tokens[1]);
  assert.equal(r.state.hints[0], 2);
  const third = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: cmd(r, "hint"),
  });
  assert.equal(third.status, 400);
  const seed = r.state.campaign.seed,
    epoch = r.state.epoch;
  r = await act(h, r, "campaign-restart");
  assert.equal(r.state.hints[0], 2);
  assert.equal(r.state.campaign.seed, seed);
  assert.notEqual(r.state.epoch, epoch);
  r = await solvePhase(h, r);
  r = await act(h, r, "campaign-next");
  assert.equal(r.state.hints[0], 2);
  assert.equal(r.state.hints[1], 0);
  assert.equal(h.Campaign.hints(r.state.campaign).length, 0);
});

test("checkpoint/rejoin and explicit fewer-player recovery preserve campaign and identity", async () => {
  const h = harness();
  let [r, b, c] = await campaignRoom(h, 3);
  r = await advanceTo(h, r, 2);
  r = await solvePhase(h, r);
  const prior = copy(stored(h, r).campaign),
    seed = r.state.campaign.seed;
  await h.request("leave", { token: tokens[1], code: r.code });
  await h.request("leave", { token: tokens[2], code: r.code });
  r = await h.request("sync", { token: tokens[0], code: r.code });
  r = await h.request("continue", {
    token: tokens[0],
    code: r.code,
    rosterVersion: r.state.crew.version,
  });
  assert.deepEqual(r.roles, [0, 1, 2]);
  assert.deepEqual(stored(h, r).campaign, prior);
  const rejoin = await h.request("join", { token: tokens[1], code: r.code });
  assert.equal(rejoin.participantId, b.participantId);
  assert.deepEqual(rejoin.roles, []);
  assert.deepEqual(rejoin.state.campaign.views, {});
  assert.equal(rejoin.state.campaign.seed, seed);
  r = await act(h, r, "campaign-next");
  assert.equal(r.state.stage, 3);
  assert.equal(r.state.campaign.completed.length, 3);
});

test("role projection does not leak other clues; only coordinator can next/restart; stale and malformed writes do not persist", async () => {
  const h = harness();
  let [r, b, c] = await campaignRoom(h, 3);
  for (const [index, p] of [r, b, c].entries()) {
    assert.deepEqual(Object.keys(p.state.campaign.views), p.roles.map(String));
    assert.equal(Object.hasOwn(p.state.campaign, "puzzle"), false);
    assert.equal(Object.hasOwn(p.state, "recent"), false);
    if (!p.roles.includes(2))
      assert.ok(
        !JSON.stringify(p.state.campaign.views).includes("requires 2 units"),
      );
  }
  for (const request of [
    { token: tokens[1], command: cmd(b, "campaign-restart") },
    {
      token: tokens[1],
      command: cmd(b, "campaign-set", 0, { field: "feed0", value: "1" }),
    },
    {
      token: tokens[0],
      command: cmd(r, "campaign-set", 0, { field: "feed0", value: [] }),
    },
    {
      token: tokens[0],
      command: cmd(r, "campaign-set", 0, {
        field: "feed0",
        value: "1",
        epoch: "stale",
      }),
    },
    {
      token: tokens[0],
      command: cmd(r, "campaign-set", 0, {
        field: "feed0",
        value: "1",
        rosterVersion: 0,
      }),
    },
  ]) {
    const before = copy(h.rows.get(r.code));
    const response = await h.request("sync", { code: r.code, ...request });
    assert.ok(response.status >= 400);
    assert.deepEqual(h.rows.get(r.code), before);
  }
  r = await solvePhase(h, r);
  const nonCoordinator = await h.request("sync", {
    token: tokens[1],
    code: r.code,
  });
  assert.equal(nonCoordinator.state.campaign.views[1].next, null);
  assert.equal(
    (
      await h.request("sync", {
        token: tokens[1],
        code: r.code,
        command: cmd(nonCoordinator, "campaign-next"),
      })
    ).status,
    403,
  );
});

test("duplicate solve/next and CAS retries cannot advance twice; finale phase epoch rejects old controls", async () => {
  const h = harness();
  let [r] = await campaignRoom(h);
  for (const c of solution(h.Campaign, stored(h, r).campaign))
    r = await act(h, r, c.type, c.role, { field: c.field, value: c.value });
  const solve = cmd(r, "campaign-check", 0);
  h.conflict(3);
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: solve,
  });
  assert.equal(r.status, 200);
  assert.equal(r.state.campaign.checks, 1);
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: solve,
  });
  assert.equal(r.state.campaign.completed.length, 1);
  assert.equal(r.state.log.length, 1);
  const next = cmd(r, "campaign-next");
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: next,
  });
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: next,
  });
  assert.equal(r.state.stage, 1);
  r = await advanceTo(h, r, 9);
  const old = cmd(r, "campaign-set", 0, { field: "feed0", value: "0" }),
    epoch = r.state.epoch;
  r = await solvePhase(h, r);
  assert.notEqual(r.state.epoch, epoch);
  assert.equal(r.state.campaign.views[0].progress.step, 1);
  assert.equal(
    (await h.request("sync", { token: tokens[0], code: r.code, command: old }))
      .status,
    409,
  );
});

test("maintenance epoch rollover prevents replay of evicted commands without changing puzzle or consent", async () => {
  const h = harness();
  let [r] = await campaignRoom(h);
  r = await advanceTo(h, r, 5);
  const plan = solution(h.Campaign, stored(h, r).campaign),
    move = plan.find((x) => x.type === "campaign-action"),
    original = cmd(r, move.type, move.role, {
      field: move.field,
      value: move.value,
    });
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: original,
  });
  r = await act(h, r, "campaign-action", 2, { field: "undo", value: "undo" });
  const route = copy(stored(h, r).campaign.puzzle.route),
    completed = copy(r.state.campaign.completed);
  let rollover;
  for (let i = 0; i < 110; i++) {
    const before = r.state.epoch,
      c = cmd(r, "campaign-set", 0, { field: "fuel", value: "0" });
    r = await h.request("sync", { token: tokens[0], code: r.code, command: c });
    assert.equal(r.status, 200);
    if (before !== r.state.epoch) rollover = c;
  }
  assert.ok(rollover);
  const before = copy(stored(h, r).campaign);
  const duplicate = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: rollover,
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(stored(h, r).campaign, before);
  const replay = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: original,
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.errorCode, "STALE_PUZZLE");
  assert.deepEqual(stored(h, r).campaign.puzzle.route, route);
  assert.deepEqual(r.state.campaign.completed, completed);
});

test("offline operators block checks and hint release until explicit fewer-player recovery", async () => {
  const h = harness();
  let [r] = await campaignRoom(h, 2);
  await h.request("leave", { token: tokens[1], code: r.code });
  r = await h.request("sync", { token: tokens[0], code: r.code });
  const check = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: cmd(r, "campaign-check", 0),
  });
  assert.equal(check.status, 400);
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: cmd(r, "hint"),
  });
  assert.equal(r.state.hints[0], 0);
  const seed = r.state.campaign.seed;
  r = await h.request("continue", {
    token: tokens[0],
    code: r.code,
    rosterVersion: r.state.crew.version,
  });
  assert.deepEqual(r.state.hintVotes, {});
  r = await h.request("sync", {
    token: tokens[0],
    code: r.code,
    command: cmd(r, "hint"),
  });
  assert.equal(r.state.hints[0], 1);
  assert.equal(r.state.campaign.seed, seed);
  r = await solvePhase(h, r);
  assert.equal(r.state.campaign.status, "checkpoint");
});

test("concurrent campaign hints reveal once and a finale sub-checkpoint survives rejoin", async () => {
  const h = harness();
  let [r] = await campaignRoom(h, 3);
  const votes = await Promise.all(
    tokens
      .slice(0, 3)
      .map((token) =>
        h.request("sync", { token, code: r.code, command: cmd(r, "hint") }),
      ),
  );
  votes.forEach((v) => assert.equal(v.status, 200));
  r = await h.request("sync", { token: tokens[0], code: r.code });
  assert.equal(r.state.hints[0], 1);
  r = await advanceTo(h, r, 9);
  r = await solvePhase(h, r);
  const prior = copy(stored(h, r).campaign);
  await h.request("leave", { token: tokens[0], code: r.code });
  const rejoin = await h.request("join", { token: tokens[0], code: r.code });
  assert.equal(rejoin.participantId, r.participantId);
  assert.equal(rejoin.state.campaign.views[0].progress.step, 1);
  assert.deepEqual(stored(h, r).campaign, prior);
});
