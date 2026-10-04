import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./helpers.mjs";
import { copy, solution, solveModel } from "./campaign-helpers.mjs";
const C = harness().Campaign;
const set = (c, r, field, value) =>
  C.apply(c, r, { type: "campaign-set", field, value: String(value) });
const action = (c, r, field) =>
  C.apply(c, r, { type: "campaign-action", field, value: field });
const check = (c) => C.apply(c, 0, { type: "campaign-check" });
function at(level, seed = 0) {
  const c = C.create(seed, { version: 2 });
  while (c.level < level) {
    assert.equal(solveModel(C, c).solved, true);
    C.next(c);
  }
  return c;
}
function plan(c) {
  for (const command of solution(C, c)) C.apply(c, command.role, command);
}

test("v2 is explicit; existing version-one states retain legacy rules on continue and restart", () => {
  assert.equal(C.create(0).version, 1);
  assert.equal(C.create(0, { version: 1 }).version, 1);
  assert.equal(C.create(0, { version: 2 }).version, 2);
  assert.throws(() => C.create(0, { version: 3 }));
  assert.equal(C.supportsVersion(1), true);
  assert.equal(C.supportsVersion(2), true);
  assert.equal(C.supportsVersion(3), false);
  const c = C.create(0);
  solveModel(C, c);
  C.next(c);
  C.restart(c);
  assert.equal(c.version, 1);
  assert.equal(c.level, 1);
});

test("all 72 version-two seeds solve every level, both finale profiles and serialized recovery", () => {
  for (let seed = 0; seed < 72; seed++) {
    let c = C.create(seed, { version: 2 });
    for (let level = 0; level < 10; level++) {
      assert.equal(c.level, level);
      for (let phase = 0; phase < (level === 9 ? 3 : 1); phase++) {
        if (level === 9 && phase === 0)
          set(c, 0, "busProfile", seed % 2 ? "drive" : "radio");
        const before = copy(c);
        for (let r = 0; r < 3; r++) {
          const v = C.view(c, r);
          assert.ok(v.objective.length > 10);
          assert.ok(v.learningGoal.length > 10);
          const projected = C.project(c, [r], 2);
          assert.equal(C.view(projected, (r + 1) % 3), null);
          assert.ok(!("puzzle" in projected));
          for (const x of v.controls) {
            assert.equal(typeof x.value, "string");
            if (x.disabled !== undefined) {
              assert.equal(typeof x.disabled, "boolean");
              assert.equal(typeof x.reason, "string");
            }
          }
        }
        assert.deepEqual(copy(c), before, "views are pure");
        c = copy(c);
        const result = solveModel(C, c);
        assert.equal(
          level === 9 && phase < 2 ? result.phaseChanged : result.solved,
          true,
          `seed ${seed} level ${level} phase ${phase}: ${result.feedback}`,
        );
      }
      // Check every completed station view, not only the Engineering check owner.
      // Relay API saves the checkpoint before projecting all stations for solo crews.
      c = copy(c);
      const checkpointBefore = copy(c);
      for (const role of [0, 1, 2]) {
        const completedView = C.view(c, role);
        assert.deepEqual(copy(completedView.controls), []);
        assert.equal(completedView.check, null);
        assert.equal(completedView.status, level === 9 ? "complete" : "checkpoint");
        if (level < 9) assert.equal(completedView.next.coordinatorOnly, true);
        else assert.equal(completedView.next, null);
      }
      for (const roles of [[0], [1], [2], [0, 1], [0, 1, 2]]) {
        const savedProjection = copy(C.project(c, roles, 2));
        for (const role of roles) {
          assert.deepEqual(copy(C.view(savedProjection, role)), copy(C.view(c, role)));
        }
      }
      assert.deepEqual(copy(c), checkpointBefore, "checkpoint projection is pure after reload");
      if (level < 9) {
        assert.equal(c.status, "checkpoint");
        assert.match(C.view(c, 0).submitInstruction, /coordinator.*continue/);
        C.next(c);
      }
    }
    assert.equal(c.status, "complete");
    assert.equal(c.completed.length, 10);
  }
});

test("repair requires measured evidence and exposes stranded reserve without losing allocations", () => {
  const c = at(2),
    q = c.puzzle.power;
  set(c, 1, "isolate", q.fault);
  assert.match(check(c).feedback, /recorded low- and high-load/);
  set(c, 0, "feed" + q.fault, 1);
  assert.match(
    C.view(c, 0).readings.find((x) => x.label === "Stranded reserve").value,
    /1 units/,
  );
  assert.equal(action(c, 1, "recordLoad").solved, false);
  assert.equal(q.observations[q.fault].length, 0);
  assert.equal(solveModel(C, c).solved, true);
});

test("shield and economy plans enable different routes and preserve launch reserve", () => {
  const c = at(5);
  action(c, 2, "east");
  const before = copy(c.puzzle.route);
  action(c, 2, "east");
  assert.deepEqual(copy(c.puzzle.route), before);
  for (const d of ["south", "east", "east", "north"]) action(c, 2, d);
  assert.equal(check(copy(c)).solved, true, "economy detour works");
  set(c, 0, "shielding", 2);
  assert.match(check(c).feedback, /exceed.*reserve/);
  assert.equal(
    solveModel(C, c).solved,
    true,
    "shield permits short radiation lane",
  );
});

test("cargo and startup enforce earlier signal conditions and safe invalidation", () => {
  const c = at(6);
  plan(c);
  set(c, 1, "cargoPhase", (Number(c.puzzle.values.cargoPhase) + 1) % 3);
  assert.match(check(c).feedback, /different Battery bay/);
  solveModel(C, c);
  C.next(c);
  for (const [r, op] of [
    [0, "cool"],
    [1, "vent"],
    [2, "release"],
  ])
    action(c, r, op);
  action(c, 0, "prime");
  assert.equal(c.puzzle.sequence.length, 3, "unready signal blocks priming");
  plan(c);
  assert.equal(c.puzzle.sequence.length, 6);
  set(c, 0, "gain", c.puzzle.values.gain);
  assert.equal(
    c.puzzle.sequence.length,
    6,
    "same-value commands preserve completed startup",
  );
  set(c, 0, "gain", 0);
  assert.deepEqual(copy(c.puzzle.sequence), ["cool", "vent", "release"]);
  assert.equal(check(c).solved, false);
  assert.equal(solveModel(C, c).solved, true);
});

test("packet booster changes route feasibility rather than copying hops", () => {
  const c = at(8);
  set(c, 2, "exit", 1);
  assert.match(check(c).feedback, /two-unit booster/);
  set(c, 0, "boost", 2);
  set(c, 1, "phase", (3 + c.puzzle.offset) % 3);
  assert.equal(check(copy(c)).solved, true);
  set(c, 2, "branch", 1);
  assert.match(check(c).feedback, /exceed.*reserve/);
  assert.equal(solveModel(C, c).solved, true);
});

test("individually valid finale plans conflict together, then repair revision and retuning permit launch", () => {
  const c = at(9);
  assert.equal(solveModel(C, c).phaseChanged, true);
  const evidence = copy(c.puzzle.power.observations);
  set(c, 2, "flightRoute", "sheltered");
  set(c, 1, "frequency", 3);
  set(c, 0, "gain", 1);
  set(c, 2, "phase", 0);
  const independentSignal = copy(c);
  independentSignal.version = 1;
  independentSignal.level = 4;
  independentSignal.puzzle.target = { frequency: 3, gain: 1, phase: 0 };
  assert.equal(
    check(independentSignal).solved,
    true,
    "sheltered signal is valid on its own",
  );
  assert.match(check(c).feedback, /provides 3 flight fuel.*needs 5/);
  assert.equal(action(c, 0, "reviseRepair").phaseChanged, true);
  assert.equal(c.puzzle.phase, 0);
  assert.deepEqual(copy(c.puzzle.power.observations), evidence);
  set(c, 0, "busProfile", "drive");
  assert.match(check(c).feedback, /Destination outputs/);
  assert.equal(solveModel(C, c).phaseChanged, true);
  assert.equal(c.puzzle.values.flightRoute, "sheltered");
  assert.equal(solveModel(C, c).phaseChanged, true);
  plan(c);
  assert.equal(c.puzzle.sequence.length, 6);
  assert.equal(action(c, 2, "reviseFlight").phaseChanged, true);
  assert.equal(c.puzzle.phase, 1);
  assert.equal(c.puzzle.sequence.length, 0);
  assert.deepEqual(copy(c.puzzle.power.observations), evidence);
  set(c, 2, "flightRoute", "direct");
  assert.match(check(c).feedback, /supports only 1/);
  solveModel(C, c);
  assert.equal(solveModel(C, c).solved, true);
});

test("version-two restart is deterministic and invalid inputs cannot mutate state", () => {
  const c = at(9, 17),
    before = copy(c);
  for (const bad of [
    { type: "campaign-set", field: "busProfile", value: "cheat" },
    { type: "campaign-action", field: "reviseFlight", value: "reviseFlight" },
  ])
    assert.throws(() => C.apply(c, 0, bad));
  assert.throws(() => set(c, 1, "busProfile", "drive"));
  assert.deepEqual(copy(c), before);
  plan(c);
  C.restart(c);
  assert.deepEqual(copy(c.puzzle), before.puzzle);
  assert.equal(c.version, 2);
  assert.deepEqual(copy(c.completed), before.completed);
});

test("both finale repair profiles work for every seed and launch rechecks actual upstream output", () => {
  for (let seed = 0; seed < 72; seed++) {
    const template = at(9, seed);
    for (const profile of ["radio", "drive"]) {
      const c = copy(template);
      set(c, 0, "busProfile", profile);
      assert.equal(solveModel(C, c).phaseChanged, true);
      assert.equal(solveModel(C, c).phaseChanged, true);
      plan(c);
      const invalid = copy(c);
      invalid.puzzle.power.alloc.fill(0);
      assert.equal(
        check(invalid).solved,
        false,
        "startup does not replace upstream validation",
      );
      assert.equal(check(c).solved, true);
    }
  }
});
