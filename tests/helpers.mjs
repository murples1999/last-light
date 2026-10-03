import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

export function harness() {
  let now = 100000;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const context = vm.createContext({
    crypto: webcrypto,
    Date: Clock,
    Response,
    Request,
    TextEncoder,
    URL,
    console,
  });
  const source = [
    "public/campaign.js",
    "public/power.js",
    "public/crew.js",
    "worker/api.js",
  ]
    .map((p) => readFileSync(new URL("../" + p, import.meta.url), "utf8"))
    .join("\n");
  vm.runInContext(
    source.replace("export async function api", "async function api") +
      "\nglobalThis.testApi = api; globalThis.testCrew = Crew; globalThis.testCampaign = Campaign;",
    context,
  );
  const rows = new Map();
  let conflicts = 0,
    storageError = false,
    nextUpdateGate = null;
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (storageError) throw Error("storage unavailable");
              if (sql.startsWith("SELECT COUNT"))
                return {
                  n: [...rows.values()].filter((r) => r.expires > args[0])
                    .length,
                };
              const row = rows.get(args[0]);
              return row && row.expires > args[1] ? structuredClone(row) : null;
            },
            async run() {
              if (storageError) throw Error("storage unavailable");
              if (sql.startsWith("DELETE")) {
                for (const [key, r] of rows)
                  if (r.expires < args[0]) rows.delete(key);
                return {};
              }
              if (sql.startsWith("INSERT")) {
                const [code, state, members, expires] = args;
                if (rows.has(code)) throw Error("duplicate");
                rows.set(code, { code, state, members, revision: 0, expires });
                return {};
              }
              const [state, members, revision, code, previous] = args;
              if (nextUpdateGate) {
                const gate = nextUpdateGate;
                nextUpdateGate = null;
                gate.enter();
                await gate.wait;
              }
              if (conflicts > 0) {
                conflicts--;
                return { meta: { changes: 0 } };
              }
              const r = rows.get(code);
              if (r.revision !== previous) return { meta: { changes: 0 } };
              rows.set(code, { ...r, state, members, revision });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  async function request(path, body, options = {}) {
    const req = new Request("https://example.test/api/" + path, {
      method: options.method || "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      ...(options.method === "GET"
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    const res = await context.testApi(req, { DB });
    return { status: res.status, ...(await res.json()) };
  }
  return {
    request,
    rows,
    Crew: context.testCrew,
    Campaign: context.testCampaign,
    now: () => now,
    advance: (n) => (now += n),
    conflict: (n) => (conflicts = n),
    storageError: (value) => (storageError = value),
    holdNextUpdate() {
      let enter, release;
      const entered = new Promise((resolve) => (enter = resolve));
      const wait = new Promise((resolve) => (release = resolve));
      nextUpdateGate = { enter, wait };
      return { entered, release };
    },
  };
}
export const tokens = ["a", "b", "c", "d"].map((c) => c.repeat(32));
export function cmd(response, type, role = response.roles[0], extra = {}) {
  return {
    id: webcrypto.randomUUID(),
    type,
    role,
    stage: response.state.stage,
    epoch: response.state.epoch,
    rosterVersion: response.state.crew.version,
    hintIndex: response.state.hints[response.state.stage],
    ...extra,
  };
}
export async function room(h, count) {
  const players = [await h.request("create", { token: tokens[0] })];
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
