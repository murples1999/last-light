import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./helpers.mjs";
import { copy, solution, solveModel, operations } from "./campaign-helpers.mjs";
const C = harness().Campaign;

test("all 72 seeds solve all ten distinct levels through legal controls and checkpoints", () => {
  const kinds = new Set();
  for (let seed = 0; seed < C.SEEDS; seed++) {
    const c = C.create(seed);
    for (let level = 0; level < 10; level++) {
      assert.equal(c.level, level);
      kinds.add(c.puzzle.kind);
      let result = solveModel(C, c, { enumerate: level === 2 });
      if (level === 9) {
        assert.equal(result.phaseChanged, true);
        assert.equal(c.puzzle.phase, 1);
        result = solveModel(C, c);
        assert.equal(result.phaseChanged, true);
        assert.equal(c.puzzle.phase, 2);
        result = solveModel(C, c);
      }
      assert.equal(result.solved, true, `seed ${seed} level ${level + 1}`);
      assert.equal(c.completed.length, level + 1);
      if (level < 9) {
        assert.equal(c.status, "checkpoint");
        assert.equal(c.level, level);
        assert.throws(() => C.apply(c, 0, { type: "campaign-check" }));
        C.next(c);
      }
    }
    assert.equal(c.status, "complete");
    assert.equal(c.level, 10);
    assert.throws(() => C.next(c));
    assert.throws(() => C.restart(c));
  }
  assert.equal(kinds.size, 10);
});

test("views are pure, role scoped and have stable teaching/control fields", () => {
  const c = C.create(17);
  for (let level = 0; level < 10; level++) {
    const phases = level === 9 ? 3 : 1;
    for (let phase = 0; phase < phases; phase++) {
      const before = copy(c);
      for (const role of [0, 1, 2]) {
        const v = C.view(c, role);
        for (const key of [
          "learningGoal",
          "submitInstruction",
          "briefing",
          "objective",
        ])
          assert.ok(v[key]?.length > 10, key);
        assert.ok(Object.hasOwn(v, "check"));
        assert.ok(Object.hasOwn(v, "next"));
        assert.equal(v.next, null);
        assert.equal(v.check !== null, role === 0);
        for (const control of v.controls) {
          assert.equal(typeof control.value, "string");
          if (control.type === "select")
            assert.ok(
              control.options.every((o) => typeof o.value === "string"),
            );
        }
        const projected = C.project(c, [role], 1);
        assert.deepEqual(Object.keys(projected.views), [String(role)]);
        assert.equal(C.view(projected, (role + 1) % 3), null);
        assert.equal(C.hints(projected).length, 1);
        assert.ok(!Object.hasOwn(projected, "puzzle"));
        assert.ok(!JSON.stringify(projected).includes('"target"'));
      }
      assert.deepEqual(copy(c), before);
      solveModel(C, c);
    }
    if (level < 9) C.next(c);
  }
});

test("invalid values, cross-role controls, budget overflow and incomplete checks are recoverable", () => {
  const c = C.create(0),
    before = copy(c);
  for (const value of [[], {}, null, true, 1, "-1", "4", "NaN"])
    assert.throws(() =>
      C.apply(c, 0, { type: "campaign-set", field: "feed0", value }),
    );
  for (const role of [1, 2])
    assert.throws(() =>
      C.apply(c, role, { type: "campaign-set", field: "feed0", value: "1" }),
    );
  assert.deepEqual(copy(c), before);
  assert.equal(C.apply(c, 0, { type: "campaign-check" }).solved, false);
  assert.equal(c.level, 0);
  C.apply(c, 0, { type: "campaign-set", field: "feed0", value: "3" });
  C.apply(c, 0, { type: "campaign-set", field: "feed1", value: "3" });
  assert.throws(() =>
    C.apply(c, 0, { type: "campaign-set", field: "feed2", value: "1" }),
  );
  const identity = {
    seed: c.seed,
    level: c.level,
    completed: copy(c.completed),
  };
  C.restart(c);
  assert.equal(c.checks, 0);
  assert.deepEqual(
    { seed: c.seed, level: c.level, completed: copy(c.completed) },
    identity,
  );
  solveModel(C, c);
  assert.equal(c.status, "checkpoint");
});

test("diagnosis requires observations, grid rejects hazards and sequence mistakes keep completed steps", () => {
  const c = C.create(0);
  solveModel(C, c);
  C.next(c);
  C.apply(c, 1, { type: "campaign-set", field: "isolate", value: "0" });
  C.apply(c, 2, { type: "campaign-set", field: "report", value: "K7" });
  assert.equal(C.apply(c, 0, { type: "campaign-check" }).solved, false);
  while (c.level < 5) {
    solveModel(C, c);
    C.next(c);
  }
  const route = copy(c.puzzle.route);
  C.apply(c, 2, { type: "campaign-action", field: "north", value: "north" });
  assert.deepEqual(copy(c.puzzle.route), route);
  C.apply(c, 2, { type: "campaign-action", field: "east", value: "east" });
  const oneMove = copy(c.puzzle.route);
  C.apply(c, 2, { type: "campaign-action", field: "east", value: "east" });
  assert.deepEqual(copy(c.puzzle.route), oneMove);
  C.apply(c, 2, { type: "campaign-action", field: "undo", value: "undo" });
  assert.deepEqual(copy(c.puzzle.route), route);
  while (c.level < 7) {
    solveModel(C, c);
    C.next(c);
  }
  C.apply(c, 2, { type: "campaign-action", field: "launch", value: "launch" });
  assert.equal(c.puzzle.sequence.length, 0);
  C.apply(c, 0, { type: "campaign-action", field: "cool", value: "cool" });
  C.apply(c, 0, { type: "campaign-action", field: "cool", value: "cool" });
  assert.deepEqual(copy(c.puzzle.sequence), ["cool"]);
  for (const [i, op] of operations.slice(1).entries())
    C.apply(c, (i + 1) % 3, { type: "campaign-action", field: op, value: op });
  assert.equal(C.apply(c, 0, { type: "campaign-check" }).solved, true);
});

test("seed validation and hint counts are bounded without changing model state", () => {
  for (const seed of [-1, 72, 1.5, "2", null, {}, [], Infinity, NaN])
    assert.throws(() => C.create(seed));
  const c = C.create(0),
    before = copy(c);
  assert.equal(C.hints(c, -1).length, 0);
  assert.equal(C.hints(c, 9).length, 2);
  assert.equal(C.hints(c, "2").length, 0);
  assert.equal(C.project(c, [0], -1).hintTexts.length, 0);
  assert.deepEqual(copy(c), before);
});
