const TTL = 7200000,
  CAMPAIGN_TTL = 86400000,
  HEARTBEAT_TTL = 15000,
  MAX_PARTICIPANTS = 32;
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const json = (x, status = 200) =>
  new Response(JSON.stringify(x), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const classicFresh = () => ({
  stage: 0,
  power: Power.create(),
  epoch: crypto.randomUUID(),
  revision: 0,
  values: {
    reactor: "1",
    antenna: "1",
    thruster: "1",
    first: "0",
    middle: "0",
    last: "0",
    pressure: "0",
    call: "HOME",
    ring: "1",
    spoke: "1",
  },
  locks: [false, false, false],
  online: [true, false, false],
  hints: [0, 0, 0],
  hintVotes: {},
  feedback: "",
  log: [],
  started: Date.now(),
  finished: null,
  recent: [],
});
function fresh(mode) {
  const state = classicFresh();
  if (mode === "campaign-v1") {
    state.mode = mode;
    state.campaign = Campaign.create();
    state.hints = Array(Campaign.TOTAL).fill(0);
    delete state.power;
    delete state.values;
  }
  return state;
}
const fields = [
  [
    ["reactor", [1, 2, 3]],
    ["antenna", [1, 2, 3]],
    ["thruster", [1, 2, 3]],
  ],
  [
    ["first", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ["middle", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ["last", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
  ],
  [
    ["pressure", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ["call", ["HOME", "DAWN", "OPEN"]],
    ["ring", [1, 2, 3]],
  ],
];
const hash = async (s) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
const validToken = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9-]{30,80}$/.test(s);
const fail = (message, status = 400, code = "INVALID_COMMAND") => {
  throw Object.assign(Error(message), { status, code });
};
const online = (member, now) =>
  member.seen > 0 && now - member.seen < HEARTBEAT_TTL;

function rosterChanged(s, previousOwners = s.crew.stationOwners) {
  s.crew.version++;
  s.hintVotes = {};
  s.locks = s.locks.map(
    (locked, role) =>
      locked && previousOwners[role] === s.crew.stationOwners[role],
  );
}

// The existing JSON columns need no SQL migration. Old indexed seats become IDs
// exactly once, with vacant stations assigned to the first existing participant.
function migrate(s, members) {
  if (s.crew) return members;
  const seats = members.map((member) =>
    member ? { ...member, id: crypto.randomUUID() } : null,
  );
  const active = seats.filter(Boolean);
  if (!active.length)
    fail("Room has no participants", 503, "INVALID_ROOM_STATE");
  s.crew = {
    version: 1,
    coordinatorId: active[0].id,
    participants: active.map((p) => ({ id: p.id, online: false })),
    stationOwners: seats.map((p) => p?.id || active[0].id),
  };
  s.hintVotes = {};
  s.recent = [];
  return active;
}

function refreshRoster(s, members, now) {
  const previousIds = s.crew.participants.map((p) => p.id).join(",");
  s.crew.participants = members.map((p) => ({
    id: p.id,
    online: online(p, now),
  }));
  if (!Crew.isOnline(s, s.crew.coordinatorId)) {
    // Membership insertion order is stable, including across reconnects.
    s.crew.coordinatorId =
      members.find(
        (p) => online(p, now) && Crew.rolesForParticipant(s, p.id).length,
      )?.id ||
      members.find((p) => online(p, now))?.id ||
      s.crew.coordinatorId;
  }
  if (previousIds !== s.crew.participants.map((p) => p.id).join(","))
    rosterChanged(s);
  // Presence is not membership. An absent person loses only their own vote;
  // still-online votes remain valid while the reserved crew waits for them.
  for (const p of s.crew.participants) if (!p.online) delete s.hintVotes[p.id];
  s.online = s.crew.stationOwners.map((id) => Crew.isOnline(s, id));
  s.locks = s.locks.map((v, role) => v && s.online[role]);
}

function assignOwners(s, owners) {
  if (owners.every((id, role) => id === s.crew.stationOwners[role])) return;
  const previous = s.crew.stationOwners;
  s.crew.stationOwners = owners;
  delete s.crew.rotation;
  rosterChanged(s, previous);
  s.online = owners.map((id) => Crew.isOnline(s, id));
}

function addParticipant(s, members, token, now) {
  const owners = Crew.voteEligibleIds(s);
  if (owners.length >= 3)
    fail(
      "This room already has three station operators. Continue with fewer players before adding a replacement.",
      409,
      "ROOM_FULL",
    );
  if (members.length >= MAX_PARTICIPANTS)
    fail(
      "This room has reached its participant limit. Start a new room.",
      409,
      "ROOM_FULL",
    );
  const targets = [owners.length, 2, 1, 0];
  const role = targets.find(
    (r) =>
      Crew.isOnline(s, s.crew.stationOwners[r]) &&
      Crew.rolesForParticipant(s, s.crew.stationOwners[r]).length > 1,
  );
  if (role === undefined)
    fail(
      "Reserved stations are offline. Ask the coordinator to continue with fewer players first.",
      409,
      "STATIONS_RESERVED",
    );
  const member = { id: crypto.randomUUID(), token, seen: now };
  members.push(member);
  refreshRoster(s, members, now);
  const assignments = s.crew.stationOwners.slice();
  assignments[role] = member.id;
  assignOwners(s, assignments);
  return member;
}

function requireVersion(s, version) {
  if (!Number.isInteger(version) || version !== s.crew.version)
    fail("Crew changed. Sync the room and try again.", 409, "STALE_ROSTER");
}
function requireCoordinator(s, id) {
  if (id !== s.crew.coordinatorId)
    fail(
      "Only the crew coordinator can change station assignments or reset",
      403,
      "NOT_COORDINATOR",
    );
}
function continueWithFewer(s, id) {
  requireCoordinator(s, id);
  const eligible = s.crew.participants
    .filter((p) => p.online && Crew.rolesForParticipant(s, p.id).length)
    .map((p) => p.id);
  if (!eligible.length) eligible.push(id);
  const owners = s.crew.stationOwners.slice();
  for (let role = 0; role < 3; role++) {
    if (Crew.isOnline(s, owners[role])) continue;
    owners[role] = eligible.reduce((best, candidate) =>
      owners.filter((owner) => owner === candidate).length <
      owners.filter((owner) => owner === best).length
        ? candidate
        : best,
    );
  }
  assignOwners(s, owners);
}

const fingerprint = (c) =>
  JSON.stringify([
    c.type,
    c.role,
    c.stage,
    c.epoch,
    c.rosterVersion,
    c.field,
    c.value,
    c.hintIndex,
  ]);
function command(s, id, c) {
  if (c === undefined || c === null) return s;
  if (
    typeof c !== "object" ||
    Array.isArray(c) ||
    typeof c.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,60}$/.test(c.id) ||
    typeof c.type !== "string"
  )
    fail("Invalid command");
  const signature = fingerprint(c),
    replay = s.recent.find((x) => x.participantId === id && x.id === c.id);
  // A committed Continue changes the roster version itself. Its exact receipt
  // may be replayed safely; other old-role commands still require fresh ownership.
  if (replay && c.type === "campaign-next" && replay.signature === signature)
    return s;
  requireVersion(s, c.rosterVersion);
  if (replay) {
    if (replay.signature !== signature)
      fail("Command ID already used for another action", 409, "COMMAND_REPLAY");
    return s;
  }
  if (c.epoch !== s.epoch || c.stage !== s.stage)
    fail("Puzzle changed. Try again.", 409, "STALE_PUZZLE");
  if (c.type === "reset") {
    requireCoordinator(s, id);
    s = { ...fresh(s.mode), crew: s.crew, online: s.online, recent: s.recent };
  } else {
    if (
      s.mode === "campaign-v1" &&
      ["campaign-next", "campaign-restart"].includes(c.type)
    ) {
      requireCoordinator(s, id);
      if (c.type === "campaign-next" && !Crew.allAssignedOnline(s))
        fail(
          "Wait for assigned operators, or explicitly continue with fewer players first",
          409,
          "STATIONS_RESERVED",
        );
      try {
        c.type === "campaign-next"
          ? Campaign.next(s.campaign)
          : Campaign.restart(s.campaign);
      } catch (e) {
        fail(e.message);
      }
      if (c.type === "campaign-next") {
        const next = Crew.nextRotation(s.crew.stationOwners, s.crew.rotation);
        assignOwners(s, next.owners);
        s.crew.rotation = next.rotation;
      }
      s.stage = s.campaign.level;
      s.epoch = crypto.randomUUID();
      s.hintVotes = {};
      s.locks = [false, false, false];
      s.feedback =
        c.type === "campaign-next"
          ? Crew.voteEligibleIds(s).length > 1
            ? "Next system online. Stations reassigned — check your assignment and new notes."
            : "Next system online. You still operate all three stations."
          : "Current level restarted. Revealed hints are preserved.";
    } else {
      if (s.stage >= (s.mode === "campaign-v1" ? Campaign.TOTAL : 3))
        fail("Mission complete");
      if (c.type === "hint") {
        if (s.mode === "campaign-v1" && s.campaign.status !== "playing")
          fail("This level is already verified");
        if (!Crew.voteEligibleIds(s).includes(id))
          fail("Only assigned operators can vote", 403, "NOT_ASSIGNED");
        if (c.hintIndex !== s.hints[s.stage])
          fail("Hint changed. Try again.", 409, "STALE_HINT");
        if (s.hints[s.stage] >= 2) fail("All hints are already revealed");
        s.hintVotes[id] = !s.hintVotes[id];
        if (
          Crew.allAssignedOnline(s) &&
          Crew.voteEligibleIds(s).every((p) => s.hintVotes[p] === true)
        ) {
          s.hints[s.stage]++;
          s.hintVotes = {};
        }
      } else {
        const r = c.role;
        if (
          !Number.isInteger(r) ||
          !Crew.rolesForParticipant(s, id).includes(r)
        )
          fail(
            "This is another participant’s station",
            403,
            "NOT_STATION_OWNER",
          );
        if (s.mode === "campaign-v1") {
          if (c.type === "campaign-check" && !Crew.canCheck(s, id))
            fail(
              "Engineering can check when every assigned operator is online",
            );
          let result;
          try {
            result = Campaign.apply(s.campaign, r, c);
          } catch (e) {
            fail(e.message);
          }
          s.feedback = result.feedback;
          if (result.solved) {
            s.log.push(
              "LEVEL " +
                (c.stage + 1) +
                ": " +
                Campaign.view(s.campaign, r).title +
                " verified.",
            );
            s.hintVotes = {};
            s.locks = [false, false, false];
            s.stage = s.campaign.level;
            if (s.campaign.status === "complete") s.finished = Date.now();
          }
          // Finale phases share a level index; rotate the epoch so delayed phase
          // controls cannot accidentally operate the next console.
          if (result.phaseChanged) {
            s.epoch = crypto.randomUUID();
            s.hintVotes = {};
          }
        } else if (s.stage === 0 && c.type.startsWith("power-")) {
          if (
            c.type === "power-set" &&
            (typeof c.field !== "string" || typeof c.value !== "string")
          )
            fail("Invalid station control");
          if (c.type === "power-check" && !Crew.canCheck(s, id))
            fail(
              "Engineering can check when every assigned operator is online",
            );
          try {
            Power.apply(s, r, c);
          } catch (e) {
            fail(e.message);
          }
          if (s.stage !== c.stage) s.hintVotes = {};
        } else if (s.stage === 0) fail("Use the power console");
        else if (c.type === "set") {
          if (s.locks[r]) fail("Unlock your station first");
          let [key, options] = fields[s.stage][r];
          if (s.stage === 2 && r === 2 && c.field === "spoke") {
            key = "spoke";
            options = [1, 2, 3, 4, 5, 6, 7, 8, 9];
          }
          if (c.field !== key || !options.map(String).includes(c.value))
            fail("Invalid input");
          s.values[key] = c.value;
          s.feedback = "";
        } else if (c.type === "lock") {
          if (!Crew.allAssignedOnline(s))
            fail(
              "Wait for assigned operators, or ask the coordinator to continue with fewer players",
            );
          s.locks[r] = !s.locks[r];
          s.feedback = "";
          if (s.locks.every(Boolean)) {
            const v = s.values,
              ok =
                s.stage === 1
                  ? v.first === "8" && v.middle === "2" && v.last === "6"
                  : v.pressure === "5" &&
                    v.call === "DAWN" &&
                    v.ring === "2" &&
                    v.spoke === "6";
            s.locks = [false, false, false];
            if (ok) {
              s.log.push(
                [
                  "",
                  "SIGNAL: Authorization code 826",
                  "AIRLOCK: Pressure 5 · DAWN · Ring 2 / Spoke 6",
                ][s.stage++],
              );
              s.hintVotes = {};
              s.feedback =
                s.stage === 3
                  ? "Escape pod ready. Mission complete."
                  : "Sequence accepted. Next system online.";
              if (s.stage === 3) s.finished = Date.now();
            } else
              s.feedback =
                "Safety interlock: settings disagree. Check your notes.";
          }
        } else fail("Unknown command");
      }
    }
  }
  s.recent.push({
    participantId: id,
    id: c.id,
    signature,
    ...(s.mode === "campaign-v1" ? { epoch: c.epoch } : {}),
  });
  // A live epoch has at most 64 accepted campaign commands. Keep its entire
  // receipt history inside the bounded dedup window: once a receipt is evicted,
  // its epoch is necessarily stale and cannot execute again. Maintenance
  // rollover changes no puzzle, hint, vote, roster or checkpoint data.
  if (
    s.mode === "campaign-v1" &&
    c.epoch === s.epoch &&
    s.recent.filter((x) => x.epoch === s.epoch).length >= 64
  )
    s.epoch = crypto.randomUUID();
  s.recent = s.recent.slice(-100);
  return s;
}

function responseState(s, id, code) {
  const visible = { ...s };
  delete visible.recent;
  const roles = Crew.rolesForParticipant(s, id);
  if (s.mode === "campaign-v1") {
    visible.campaign = Campaign.project(
      s.campaign,
      roles,
      s.hints[Math.min(s.stage, Campaign.TOTAL - 1)],
    );
    if (s.crew.coordinatorId !== id)
      for (const view of Object.values(visible.campaign.views))
        view.next = null;
  }
  return {
    state: visible,
    participantId: id,
    roles,
    coordinator: s.crew.coordinatorId === id,
    role: roles[0] ?? null,
    code,
  };
}

export async function api(req, env) {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin)
    return json({ error: "Origin not allowed" }, 403);
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "JSON required" }, 415);
  const raw = await req.text();
  if (raw.length > 4096) return json({ error: "Request too large" }, 413);
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!b || typeof b !== "object" || Array.isArray(b) || !validToken(b.token))
    return json({ error: "Invalid session" }, 400);
  const token = await hash(b.token),
    now = Date.now(),
    path = new URL(req.url).pathname;
  try {
    if (path === "/api/create") {
      if (b.mode !== undefined && !["classic", "campaign-v1"].includes(b.mode))
        fail("Unknown room mode");
      await env.DB.prepare("DELETE FROM rooms WHERE expires < ?")
        .bind(now)
        .run();
      const active = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM rooms WHERE expires > ?",
      )
        .bind(now)
        .first();
      if (active.n >= 100)
        return json(
          { error: "Room capacity reached. Please try again later." },
          429,
        );
      const code = Array.from(
        crypto.getRandomValues(new Uint8Array(8)),
        (n) => ALPH[n % 32],
      ).join("");
      const s = fresh(b.mode),
        id = crypto.randomUUID(),
        members = [{ id, token, seen: now }];
      s.crew = {
        version: 1,
        coordinatorId: id,
        participants: [{ id, online: true }],
        stationOwners: [id, id, id],
      };
      s.online = [true, true, true];
      await env.DB.prepare(
        "INSERT INTO rooms(code,state,members,revision,expires) VALUES(?,?,?,0,?)",
      )
        .bind(
          code,
          JSON.stringify(s),
          JSON.stringify(members),
          now + (s.mode === "campaign-v1" ? CAMPAIGN_TTL : TTL),
        )
        .run();
      return json(responseState(s, id, code));
    }
    if (
      ![
        "/api/join",
        "/api/sync",
        "/api/leave",
        "/api/release",
        "/api/continue",
        "/api/assign",
      ].includes(path) ||
      typeof b.code !== "string" ||
      !/^[A-HJ-NP-Z2-9]{8}$/.test(b.code)
    )
      return json({ error: "Invalid room" }, 400);
    if (path !== "/api/sync" && b.command != null)
      fail("Commands must use /api/sync");
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await env.DB.prepare(
        "SELECT * FROM rooms WHERE code = ? AND expires > ?",
      )
        .bind(b.code, now)
        .first();
      if (!row)
        return json(
          { error: "Room not found or expired. Ask the crew for a new room." },
          404,
        );
      let s = JSON.parse(row.state),
        members = migrate(s, JSON.parse(row.members));
      let member = members.find((x) => x.token === token);
      if (!member && path !== "/api/join")
        return json({ error: "Session not in this room. Join again." }, 403);
      // A delayed poll must not undo an explicit leave when its CAS retries.
      // Timeouts still reconnect through sync; an explicit leave requires join.
      if (member?.seen === 0 && path !== "/api/join" && path !== "/api/leave")
        fail("Session has left this room. Join again.", 403, "SESSION_LEFT");
      // Refresh other heartbeats before admitting a new person; reserved offline
      // stations are never silently stolen. Existing sessions may always return.
      if (member) {
        if (!online(member, now)) {
          delete s.hintVotes[member.id];
          s.locks = s.locks.map(
            (v, role) => v && s.crew.stationOwners[role] !== member.id,
          );
        }
        member.seen = path === "/api/leave" ? 0 : now;
      }
      refreshRoster(s, members, now);
      if (!member) member = addParticipant(s, members, token, now);
      if (["/api/release", "/api/continue", "/api/assign"].includes(path)) {
        requireVersion(s, b.rosterVersion);
        requireCoordinator(s, member.id);
        if (path === "/api/assign") {
          const owners = b.stationOwners;
          if (
            !Array.isArray(owners) ||
            owners.length !== 3 ||
            !owners.every(
              (id) => typeof id === "string" && Crew.isOnline(s, id),
            )
          )
            fail("Assign all three stations to online participants");
          assignOwners(s, owners.slice());
        } else continueWithFewer(s, member.id);
      }
      s = command(s, member.id, b.command);
      s.revision = row.revision + 1;
      const result = await env.DB.prepare(
        "UPDATE rooms SET state=?,members=?,revision=? WHERE code=? AND revision=?",
      )
        .bind(
          JSON.stringify(s),
          JSON.stringify(members),
          s.revision,
          b.code,
          row.revision,
        )
        .run();
      if (result.meta.changes) return json(responseState(s, member.id, b.code));
    }
    return json(
      { error: "Room is busy. Try again.", errorCode: "ROOM_BUSY" },
      409,
    );
  } catch (e) {
    if (e.status)
      return json({ error: e.message, errorCode: e.code }, e.status);
    console.error("Room storage failed", e?.name);
    return json(
      {
        error:
          "Room service temporarily unavailable. Your controls are unchanged; retry shortly.",
      },
      503,
    );
  }
}
