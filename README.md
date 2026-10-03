# LAST LIGHT

A cooperative browser escape-room game for one, two or three players, with a separate offline solo mode.

Live game: https://airlock-nine.murples.chatgpt.site

## Current gameplay

- Engineering distributes a six-unit reserve across four feeds.
- Communications traces and isolates an unreliable relay.
- Navigation monitors destination health and reroutes a healthy spare.
- The power puzzle uses 72 solvable wiring/fault variants.
- Signal decoding and airlock authorization follow the repaired power stage.
- Multiplayer hints require unanimous votes; revealed hints can be revisited independently.

## Architecture

Plain HTML/CSS/JavaScript UI. A Cloudflare-compatible ESM Worker serves embedded assets and a D1-backed room API. The supported multiplayer mode is server-relayed, with one-second synchronization. Experimental PeerJS direct P2P is retained but is not required or verified on restrictive networks.

Rooms hold game state, hashed session identifiers and heartbeat timestamps. They expire two hours after creation; no player account, name, microphone or chat is collected by the game. The host can release offline seats. This is a lightweight game session system, not a security boundary for confidential information.

## Source layout

- `public/`: interface and client-side game code
- `public/power.js`: shared deterministic power-puzzle rules and station rendering
- `public/crew.js`: shared participant and station ownership queries
- `tests/`: backend and ownership regression tests (`node --test tests/*.test.mjs`)
- `worker/api.js`: room validation, participant sessions, state changes and optimistic concurrency
- `db/schema.ts`, `drizzle/`: database schema and generated migration history
- `scripts/build.mjs`: embeds browser assets into the Worker
- `scripts/validate-artifact.mjs`: checks the Worker artifact

## Build

Requires a current Node.js version with Web Crypto support.

1. Run `npm ci --ignore-scripts`.
2. Copy `.openai/hosting.example.json` to `.openai/hosting.json` for local artifact checks.
3. Run `npm run build`.
4. Run `node scripts/validate-artifact.mjs`.

The generated entrypoint is `dist/server/index.js`, exporting `default.fetch(request, env, ctx)`. Production requires the `DB` D1 binding and the generated SQL migrations. Publishing credentials and production project configuration are intentionally not included in this public repository. Building alone does not publish the game.

## Collaboration

Keep changes focused and submit a branch/PR for integration. Never commit credentials, runtime databases, player sessions or deployment secrets. Generated migrations already applied to production must remain immutable; add new migrations for later schema changes.

Online rooms adapt to one, two or three people. Players can own multiple stations and switch between station tabs. The coordinator can explicitly continue with fewer players or assign stations after a disconnect. Rejoining players never silently reclaim stations that were reassigned. Hint consent is unanimous per assigned person, rather than per station. A new level expansion is only a proposal and is not implemented.

## Third-party software

`public/peerjs.min.js` is PeerJS 1.5.5, distributed under the MIT license; see `public/peerjs.LICENSE.txt`. Dependency licenses also apply to installed development tooling.
