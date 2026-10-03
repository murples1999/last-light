import assert from "node:assert/strict";
export const copy = (value) => JSON.parse(JSON.stringify(value));
export const operations = [
  "cool",
  "vent",
  "release",
  "prime",
  "align",
  "launch",
];
const cartesian = (choices) =>
  choices.reduce(
    (sets, options) =>
      sets.flatMap((set) => options.map((option) => [...set, option])),
    [[]],
  );
const check = (C, c) => C.apply(c, 0, { type: "campaign-check" });
const set = (role, field, value) => ({
  type: "campaign-set",
  role,
  field,
  value: String(value),
});
const action = (role, field) => ({
  type: "campaign-action",
  role,
  field,
  value: field,
});

// Enumerate finite candidate settings and ask the model itself to validate each.
// Test-only access to authoritative puzzle data is never shipped to the browser.
export function solution(C, c, { enumerate = false } = {}) {
  const p = c.puzzle,
    level = c.level === 9 ? [2, 4, 7][p.phase] : c.level;
  if (level === 0) {
    const candidates = cartesian(Array(3).fill([0, 1, 2, 3]));
    const matches = candidates.filter((values) => {
      const t = copy(c);
      values.forEach((v, i) => (t.puzzle.values["feed" + i] = String(v)));
      return check(C, t).solved;
    });
    assert.equal(matches.length, 1);
    return matches[0].map((v, i) => set(0, "feed" + i, v));
  }
  if (level === 1) {
    const plan = [];
    for (const load of [1, 2]) {
      plan.push(set(0, "load", load));
      for (let i = 0; i < 4; i++)
        plan.push(set(1, "trace", i), action(1, "probe"));
    }
    plan.push(set(1, "isolate", p.fault), set(2, "report", p.routes[p.fault]));
    return plan;
  }
  if (level === 2) {
    const power = p.power,
      targets = { K7: 2, M4: 3, R2: 1 };
    if (enumerate) {
      let solutions = 0;
      for (const alloc of cartesian(Array(4).fill([0, 1, 2, 3]))) {
        if (alloc.reduce((a, b) => a + b, 0) > 6) continue;
        for (let isolate = 0; isolate < 4; isolate++)
          for (const patch of ["NONE", "K7", "M4", "R2"]) {
            const t = copy(c);
            Object.assign(t.puzzle.power, { alloc, isolate, patch });
            const r = check(C, t);
            if (r.solved || r.phaseChanged) solutions++;
          }
      }
      assert.equal(
        solutions,
        1,
        "Each repair variant has exactly one six-unit solution",
      );
    }
    return [
      set(1, "isolate", power.fault),
      set(2, "patch", power.routes[power.fault]),
      ...[0, 1, 2, 3].map((i) =>
        set(
          0,
          "feed" + i,
          i === power.fault
            ? 0
            : targets[
                i === power.spare ? power.routes[power.fault] : power.routes[i]
              ],
        ),
      ),
    ];
  }
  if (level === 3) {
    const vals = ["EMBER", "TIDE", "HALO", "WREN"];
    let matches = [];
    for (const selected of cartesian(Array(4).fill(vals))) {
      const t = copy(c);
      selected.forEach((v, i) => (t.puzzle.values["slot" + i] = v));
      if (check(C, t).solved) matches.push(selected);
    }
    assert.equal(matches.length, 1);
    return matches[0].map((v, i) => set([0, 1, 2, 0][i], "slot" + i, v));
  }
  if (level === 4) {
    const matches = [];
    for (const [frequency, gain, phase] of cartesian([
      [1, 2, 3, 4, 5, 6, 7, 8],
      [0, 1, 2, 3, 4],
      [0, 1, 2, 3],
    ])) {
      const t = copy(c);
      Object.assign(t.puzzle.values, {
        frequency: String(frequency),
        gain: String(gain),
        phase: String(phase),
      });
      const r = check(C, t);
      if (r.solved || r.phaseChanged) matches.push([frequency, gain, phase]);
    }
    assert.equal(matches.length, 1);
    const [f, g, p] = matches[0];
    return [set(1, "frequency", f), set(0, "gain", g), set(2, "phase", p)];
  }
  if (level === 5) {
    const m = p.map,
      solutions = [];
    function explore(path, moves) {
      if (path.at(-1) === m.end) {
        const t = copy(c);
        t.puzzle.route = path;
        t.puzzle.values.fuel = String(moves.length);
        if (check(C, t).solved) solutions.push(moves);
        return;
      }
      if (moves.length === 8) return;
      const at = path.at(-1),
        x = at % 4,
        y = Math.floor(at / 4);
      for (const [d, dx, dy] of [
        ["north", 0, -1],
        ["east", 1, 0],
        ["south", 0, 1],
        ["west", -1, 0],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          n = ny * 4 + nx;
        if (
          nx < 0 ||
          nx > 3 ||
          ny < 0 ||
          ny > 3 ||
          path.includes(n) ||
          m.blocked.includes(n)
        )
          continue;
        explore([...path, n], [...moves, d]);
      }
    }
    explore([m.start], []);
    assert.ok(solutions.length > 0, "Every rotated route is solvable");
    const moves = solutions[0];
    return [
      ...moves.map((d) => action(2, d)),
      set(0, "fuel", moves.length),
      set(1, "beaconOrder", "BLUE-AMBER"),
    ];
  }
  if (level === 6) {
    const matches = [];
    for (const vals of cartesian(Array(6).fill([0, 1, 2]))) {
      const t = copy(c);
      vals.forEach((v, i) => (t.puzzle.values["crate" + i] = String(v)));
      if (check(C, t).solved) matches.push(vals);
    }
    assert.equal(
      matches.length,
      4,
      "Cargo puzzle permits four rule-equivalent arrangements",
    );
    return matches[0].map((v, i) => set(Math.floor(i / 2), "crate" + i, v));
  }
  if (level === 7) return operations.map((op, i) => action(i % 3, op));
  if (level === 8) {
    const matches = [];
    for (const [branch, exit, power, phase] of cartesian([
      [0, 1, 2],
      [0, 1],
      [0, 1, 2, 3, 4, 5, 6],
      [0, 1, 2],
    ])) {
      const t = copy(c);
      Object.assign(t.puzzle.values, {
        branch: String(branch),
        exit: String(exit),
        power: String(power),
        phase: String(phase),
      });
      if (check(C, t).solved) matches.push([branch, exit, power, phase]);
    }
    assert.equal(matches.length, 1);
    const [branch, exit, power, phase] = matches[0];
    return [
      set(2, "branch", branch),
      set(2, "exit", exit),
      set(0, "power", power),
      set(1, "phase", phase),
    ];
  }
  throw Error("No solution for level " + level);
}
export function solveModel(C, c, options) {
  for (const command of solution(C, c, options))
    C.apply(c, command.role, command);
  return check(C, c);
}
