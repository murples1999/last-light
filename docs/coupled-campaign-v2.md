# Coupled campaign v2

## Release boundary and compatibility

This development branch is based on main `f08fb694aac377ec6f34a3946dfe0f1cf8d7f81c`. It does not authorize deployment or merging. Both Zachary and Jeff must sign off before main changes.

Version 1 is frozen inside `CampaignV1`. Existing saved rooms continue through its exact view, apply, next, restart, hints and projection rules. No saved puzzle is migrated or replaced. `Campaign.create(seed)` and `{version:1}` still create v1. New API room mode `campaign-v2` must explicitly use `Campaign.create(seed, {version:2})`. `Campaign.VERSION` is the latest supported version, **not** the only accepted saved version; `Campaign.supportsVersion(version)` accepts numeric 1 or 2. `createLegacy(seed)` is an alias for v1 creation. All other public method signatures are unchanged.

The facade does not require a new renderer. It continues to return select/button controls, readings, clues, check, next, objective and progress. Startup buttons additionally include optional `disabled:boolean` and `reason:string`; render the reason next to unavailable actions. The authoritative model checks prerequisites even if a client ignores disabled. Private clues remain projected only to their station; public source and seeds remain intentionally non-secret.

New controls: `recordLoad` (Communications button), `shielding` (Engineering select 0/2), `cargoPhase` (Communications select 0/1/2), `boost` (Engineering select 0/2), `busProfile` (Engineering radio/drive), `flightRoute` (Navigation direct/sheltered), `reviseRepair` and `reviseFlight` (buttons available to every station in the relevant finale workspace). Command types and authorization checks are unchanged. Revision buttons return `phaseChanged: true`, just like forward workspace transitions; rotate the command epoch so delayed controls cannot cross into a reopened workspace. V2 has no manual route fuel or packet power selector.

Role rotation is independent of puzzle contents. Use existing role ownership and checkpoint/Continue boundaries. Finale workspace changes do not create a level checkpoint or rotate roles.

## Progression and concrete plans

All examples below use seed 0; rotations, wiring and signal references vary deterministically across 72 seeds. Level numbers here are player-facing, one-based.

### Levels 1–2: retain shared reserve and experimental diagnosis

Keep the original foundations. Allocation teaches six shared units and private mapping/targets; diagnosis teaches comparing the same relay at low and high load before reporting the fault. V1 rooms retain all existing behavior.

### Level 3: repair combines allocation and actual diagnostic evidence

Earlier rules: level 1's reserve and level 2's measured low/high comparison.

- Engineering chooses allocations within six total units, including experimental loads.
- Communications chooses a relay, records its 1- and 2-unit outputs, and isolates the measured fault.
- Navigation redirects the healthy spare and checks destination targets.

Valid seed-0 plan: record B at input 1/output 1 and input 2/output 0; isolate B; patch spare A to K7; allocate A/B/C/D = 2/0/3/1. Plausible wrong plan: isolate B and enter those allocations without evidence. Output balance alone cannot pass. Another wrong plan leaves one unit on isolated B, stranding reserve needed by a working destination.

Evidence records are separate from instantaneous trace readings. They survive allocation edits. Lockout status is explicit, and Engineering sees stranded allocation totals. Zeroing an isolated or unpatched line recovers reserve; no edit silently adds power.

### Level 4: ordered transmission has visible draft validity

Earlier rule: compare partial clues across stations, now with unique ordering.

Stations retain their assigned slots and private timing relationships. Seed 0 valid sequence: EMBER, TIDE, HALO, WREN. Four EMBER entries are a plausible initial draft but immediately show repeated fragments, before a check. This is feedback, not a new hard puzzle constraint.

### Level 5: signal retains coupled equations with plain language

Engineering chooses gain to meet energy; Communications chooses the clean carrier; Navigation chooses phase to meet the reference. Seed 0: frequency 2, gain 1, phase 0 gives energy 3 and remainder 2. Gain 1 with frequency 3 is invalid even though it was correct before the carrier changed.

The modulo wording is replaced with addition, division, and the remainder. Non-answer worked example: 11 divided by 4 has two full groups and 3 left over. Existing relational dependencies are preserved.

### Level 6: route combines ordered waypoints with shared reserve

- Engineering chooses economy (no shield allocation) or shielding (two units), with the private radiation scan.
- Communications supplies BLUE then AMBER and debris, and sets the handshake.
- Navigation plots and revises the route using those constraints.

Seven units total; two must remain for launch. Each move costs one; shielding costs two and opens radiation cells. Fuel is derived automatically.

Seed-0 start A1, BLUE B1, AMBER/exit D1. C1 is radiation. Valid shielded plan: A1–B1–C1–D1, three moves + two shield units = five. Valid economy plan: A1–B1–B2–C2–D2–D1, five moves + zero shield = five. The first route is inaccessible without shielding; the second exceeds reserve if shielding remains on. Thus neither setting permits every viable route: Engineering changes Navigation's feasible plan, rather than copying a move count. A late shield change can invalidate an existing route, without discarding it. Public coordinate orientation is identical for every station. Plans/undo spend no fuel.

### Level 7: cargo placement changes signal phase

Earlier rules: shared balance, private placement conditions and level 5's remainder reasoning.

- Engineering places Sensor/Water.
- Communications places Battery/Tools and chooses cargo beacon phase.
- Navigation places Food/Shield and communicates its required bay.

Every bay weighs four; Sensor/Water separate, Battery/Tools together, Shield in the seeded bay and Food elsewhere. Phase = remainder of Battery bay index + seeded offset divided by three. Indices are explicitly 0, 1, 2.

Valid seed-0 arrangement: Sensor+Shield in bay index 0, Water+Food in 1, Battery+Tools in 2; phase 2. Balanced cargo with phase 0 is a plausible but invalid plan. Moving the heavy pair can preserve balance yet require retuning. Multiple equivalent cargo arrangements remain valid.

### Level 8: prepare startup while tuning a live signal

Earlier rules: signal coupling plus station-owned dependency order.

Each station can tune its instrument during safe startup preparation. Coolant → vent → latch remain preparable before signal agreement. Prime → align → launch require a valid signal, checked at each operation and on final check.

Seed 0 valid tuning: carrier 2, gain 1, phase 0; valid startup: Engineering coolant, Communications vent, Navigation latch, Engineering prime, Communications align, Navigation launch. Correct order with a noisy carrier cannot prime. Retuning after priming clears only prime/align/launch and preserves coolant/vent/latch. Repeated or out-of-order operations do not erase completed safe preparation. Unavailable buttons name the expected operation/station or signal constraint.

### Level 9: routing changes reserve and signal together

- Engineering chooses economy or a two-unit booster.
- Navigation chooses direct SERVICE link or longer SERVICE relay route and HOME exit.
- Communications tunes phase using hop count, booster setting and offset.

Budget: hops + booster cost ≤ 4. Direct START–SERVICE–HOME has two hops and requires booster cost 2. Relay START–BRIDGE–SERVICE–RELAY–HOME has four hops and works only in economy. Phase uses hops + booster **setting** (0 economy, 1 boosted) + seeded offset, remainder after division by three.

Seed 0 valid boosted direct plan: total four, phase 0. Valid economy relay plan: total four, phase 1. Wrong but plausible: enable boost while keeping the relay route; six units exceed reserve. Direct economy is also invalid. A phase calculated for one valid plan is wrong for the other. Debris and LOOP remain invalid.

### Level 10: repair, route, signal and launch share one physical plan

This retains three reviewable workspaces, not three independent worksheets. Repair output constrains all later checks, and explicit revision reopens prior choices.

Repair profiles allocate six units:

| Profile     | K7 oxygen | M4 radio | R2 drive | Gain cap | Flight fuel |
| ----------- | --------: | -------: | -------: | -------: | ----------: |
| Radio-heavy |         2 |        3 |        1 |        3 |           3 |
| Drive-heavy |         2 |        1 |        3 |        1 |           5 |

Maximum gain is actual repaired M4 output. Flight fuel is actual repaired R2 output + 2. Profile selection changes required outputs; it does not conjure or reallocate power. Fault evidence, isolation, spare routing and target loads must all be valid.

Escape options:

| Route     | Fuel needed | Gain needed | Phase wheel target           |
| --------- | ----------: | ----------: | ---------------------------- |
| Direct    |           3 |           3 | (base phase + 3) remainder 4 |
| Sheltered |           5 |           1 | (base phase + 5) remainder 4 |

Communications retains a seeded clean carrier. Engineering's energy target is clean carrier + route gain. Navigation's phase reference uses clean carrier + route phase wheel target, remainder four. Displayed launch reserve is 1 + available flight fuel − route fuel; valid profile/route combinations leave one safety unit. Repair and signal conditions are rechecked before prime, align, launch and final completion.

Seed-0 radio repair: faulty A observed at 1 and 2, isolated A, spare B patched to R2; A/B/C/D = 0/1/2/3. Direct flight uses carrier 3, gain 3, phase 2 (energy 6, reference remainder 1). This is a valid end-to-end plan.

**Required conflict-and-revision example:** the radio repair is valid in isolation. The sheltered route is a valid flight option in isolation, and its signal can be independently tuned with carrier 3, gain 1, phase 0. Combined, it requires five fuel while the repaired ship provides three. The check explains both numbers and invites repair/route revision. Reopen repair, select drive-heavy, rebalance A/B/C/D = 0/3/2/1, retain the same fault evidence and spare routing. Recheck repair, tune sheltered carrier 3/gain 1/phase 0, then perform startup. This combined plan succeeds. Conversely drive-heavy plus direct route fails because gain 3 exceeds repaired radio cap 1.

Engineering makes profile/allocation/gain decisions; Communications measures fault, isolates it and chooses clean carrier; Navigation patches spare, selects escape lane and phase. During launch each owns two dependency operations. Partners can explicitly reopen the repair or flight workspace; revisions are visible and reversible planning steps.

## Recovery and invalidation

- Failed checks do not discard plans, evidence, prior level checkpoints or safe startup steps.
- `reviseRepair`: return to repair; retain diagnostics, feed allocations, patch, profile, route and tuning; clear startup. Repair and flight must be checked again.
- `reviseFlight`: retain verified repair, route and tuning; return to flight planning; clear startup. Coupled conditions must be checked again.
- Changing a tuning control in level 8 preserves its first three startup operations and invalidates the last three.
- Explicit restart remains a deterministic restart of the current level, retaining completed-level checkpoints, version and seed. It is distinct from revision and intentionally clears current-level experiments.
- Projections do not contain authoritative puzzle/target objects. Private per-station clues remain restricted by existing projection/role ownership.

## Verification

`node --test tests/campaign.test.mjs tests/coupled-campaign.test.mjs` covers all 72 seeds for both versions, legal station controls, pure/scoped projections, recovery after serialization, budget and unsafe-action rejection, diagnosis evidence, route/boost tradeoffs, cargo retuning, safe startup invalidation, and finale conflict → repair revision → retuning → successful launch. V1 tests retain original expected behavior and are not rewritten to fit v2.

Full API/build/browser verification belongs to integration with the explicit campaign-v2 room selector and renderer. Passing model tests alone does not assert multiplayer UI or deployment readiness.
