import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Lightweight DOM adapter exercises the real relay renderer without a browser
// dependency. Browser QA covers native controls/layout; these guard role messaging.
function screen() {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const element = () => ({ hidden: false, disabled: false, textContent: '', innerHTML: '',
    childNodes: [], classList: { add() {} }, querySelectorAll: () => [],
    replaceChildren(content) { this.markup = content.html; } });
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(x => [x[1], element()]));
  const document = {
    getElementById(id) { assert.ok(elements.has(id), `missing UI element ${id}`); return elements.get(id); },
    querySelector: () => element(),
    createElement: () => ({ content: { childNodes: [] }, set innerHTML(value) { this.content.html = value; } }),
  };
  const context = vm.createContext({ document, window: {}, console, queueMicrotask, Campaign: {
    view: (campaign, role) => campaign.views[role], hints: () => [],
  } });
  const crew = readFileSync(new URL('../public/crew.js', import.meta.url), 'utf8');
  const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8')
    .replace('window.lastLight=', 'globalThis.acceptTest=data=>{relay=true;acceptRelay(data);};window.lastLight=');
  vm.runInContext(crew + '\n' + game, context);
  const accept = (owners, { checkpoint = false, offline = false, level = 0 } = {}) => {
    const roles = owners.flatMap((id, role) => id === 'a' ? [role] : []);
    context.acceptTest({ participantId: 'a', coordinator: true, roles, code: 'TESTROOM', state: {
      mode: 'campaign-v1', stage: level, started: 1, revision: 1, hints: Array(10).fill(0), hintVotes: {}, log: [],
      online: owners.map(id => !(offline && id === 'b')),
      crew: { version: level + 1, coordinatorId: 'a', stationOwners: owners,
        participants: [{id:'a',online:true},{id:'b',online:!offline},{id:'c',online:true}] },
      campaign: { seed: 1, status: checkpoint ? 'checkpoint' : 'playing',
        views: Object.fromEntries(roles.map(r => [r, { title: 'Test system', controls: [], clues: [`Station ${r} private clue`] }])) },
    } });
  };
  return { accept, get: id => elements.get(id), html };
}

test('assignment notice follows one, two and three-player roles and removes old station surface', () => {
  const s = screen();
  s.accept(['a','a','a']);
  assert.match(s.get('role-assignment').textContent, /Engineering \+ Communications \+ Navigation/);
  assert.match(s.get('role-assignment').textContent, /operate each/);
  s.accept(['a','b','a']);
  assert.match(s.get('role-assignment').textContent, /Engineering \+ Navigation/);
  s.accept(['b','c','a'], { level: 1 });
  assert.match(s.get('role-assignment').textContent, /LEVEL 2 · YOUR STATION: Navigation$/);
  assert.match(s.get('stations').markup, /Station 2 private clue/);
  assert.doesNotMatch(s.get('stations').markup, /Station 0 private clue/);
  assert.match(s.get('mode-label').textContent, /NAVIGATION · COORDINATOR/);
  assert.match(s.html, /id="role-assignment"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('checkpoint UI blocks offline owners and explains explicit recovery', () => {
  const s = screen();
  s.accept(['a','b','a'], { checkpoint:true, offline:true });
  assert.equal(s.get('next-level').disabled, true);
  assert.equal(s.get('release').hidden, false);
  assert.match(s.get('checkpoint-note').textContent, /Continue with fewer players/);
  s.accept(['a','a','a'], { checkpoint:true, offline:true });
  assert.equal(s.get('next-level').disabled, false);
  assert.match(s.get('checkpoint-note').textContent, /keep all three stations/);
  s.accept(['b','b','b']);
  assert.match(s.get('role-assignment').textContent, /No station assigned/);
  assert.doesNotMatch(s.get('stations').markup, /private clue/);
});
