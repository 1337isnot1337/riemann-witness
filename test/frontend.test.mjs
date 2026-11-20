import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

class Element {
  children = [];
  attributes = new Map();
  handlers = new Map();
  selectors = new Map();
  classList = Object.assign(new Set(), {remove(name) { this.delete(name); }});
  style = {};
  rect = {top: 20, bottom: 80};

  addEventListener(event, handler) { this.handlers.set(event, handler); }
  querySelector(selector) { return this.selectors.get(selector); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  before(node) { this.previous = node; }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  insertBefore(node, before) {
    node.remove();
    node.parent = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, node);
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return this.rect; }
}

function searchFixture() {
  const elements = new Map(['#register', '#search', '#q', '#entries', '#more', '#registry-order', '.registry-archive',
    '#signatures-plot', '[data-count]', '#registry-total', '#signature-plot-track', '#signature-plot-marks',
    '#signature-plot-range', '#signature-plot-name', '#signature-plot-number', '#signature-plot-when',
    '#signature-plot-earlier', '#signature-plot-later', '#signature-plot-count', '#signature-plot-first-count',
    '#first-signature', '#last-signature'].map(selector => [selector, new Element()]));
  elements.get('#registry-order').value = 'newest';
  elements.get('#register').selectors.set('.status', new Element());
  const requests = [], timers = [];
  let poll, total = 1;
  const IntersectionObserver = class { observe() {} };
  const document = {
    querySelector: key => elements.get(key),
    querySelectorAll: () => [],
    createElement: () => new Element(),
  };
  runInNewContext(app, {
    document,
    location: {origin: 'https://registry.example', hash: ''},
    sessionStorage: {getItem: () => null, setItem() {}},
    window: {IntersectionObserver, innerHeight: 100},
    IntersectionObserver,
    crypto,
    AbortSignal,
    URLSearchParams,
    setInterval(callback, interval) { assert.equal(interval, 90000); assert.equal(poll, undefined); poll = callback; },
    setTimeout(callback, interval) { assert.equal(interval, 1500); timers.push(callback); },
    fetch(url) {
      const {pathname, searchParams} = new URL(url);
      if (pathname === '/api/count') return Promise.resolve(Response.json({total}));
      assert.equal(pathname, '/api/registry');
      return new Promise(resolve => requests.push({query: Object.fromEntries(searchParams), resolve}));
    },
  });
  const field = elements.get('#q');
  return {
    requests,
    order: elements.get('#registry-order'),
    field,
    document,
    timers,
    results: elements.get('#entries'),
    more: elements.get('#more'),
    refresh(next) { total = next; poll(); },
    submit(query) {
      field.value = query;
      elements.get('#search').handlers.get('submit')({preventDefault() {}});
    },
  };
}

const row = (id, name) => ({id, name, created_at: '2026-11-20T19:31:53.000Z'});
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('a failed append keeps rows and cursor, and an older search cannot replace newer results', async () => {
  const {requests, field, results, more, submit} = searchFixture();
  submit('Alpha');
  requests[0].resolve(Response.json({entries: [row(1, 'Alpha')], more: true}));
  await flush();
  const first = results.children[0];
  assert.ok(first);
  assert.equal(more.hidden, false);

  field.value = 'Unsubmitted';
  more.onclick();
  const cursor = {q: 'Alpha', order: 'newest', before: '1'};
  assert.deepEqual(requests[1].query, cursor);
  requests[1].resolve(Response.json({error: 'Try again.'}, {status: 503}));
  await flush();
  assert.deepEqual(results.children, [first]);
  assert.equal(more.disabled, false);
  assert.match(results.previous.textContent, /Previous results are still shown/);

  more.onclick();
  assert.deepEqual(requests[2].query, cursor);
  requests[2].resolve(Response.json({entries: [row(2, 'Alpha Later')], more: false}));
  await flush();
  assert.equal(results.children.length, 2);
  assert.equal(results.children[0], first);

  submit('Slow');
  submit('Fast');
  requests[4].resolve(Response.json({entries: [row(4, 'Fast')], more: false}));
  await flush();
  const winner = results.children[0];
  requests[3].resolve(Response.json({entries: [row(3, 'Slow')], more: true}));
  await flush();
  assert.deepEqual(results.children, [winner]);
  assert.equal(more.hidden, true);
  assert.equal(results.attributes.get('aria-busy'), 'false');
});

test('a count change updates visible first-page rows without moving focus or restarting highlights', async () => {
  const {requests, field, document, timers, results, more, submit, refresh} = searchFixture();
  submit('');
  requests[0].resolve(Response.json({entries: [row(2, 'Previous'), row(1, 'Oldest')], more: true}));
  await flush();
  const existing = results.children[0];
  document.activeElement = existing.children[0];
  assert.equal(existing.classList.has('just-added'), false);

  refresh(1);
  await flush();
  field.value = 'Draft search';
  refresh(2);
  await flush();
  field.value = '';
  results.rect = {top: 180, bottom: 240};
  refresh(3);
  await flush();
  assert.equal(requests.length, 1);

  results.rect = {top: 20, bottom: 80};
  refresh(4);
  await flush();
  assert.deepEqual(requests[1].query, {q: '', order: 'newest'});
  assert.equal(more.disabled, false);
  assert.equal(results.attributes.get('aria-busy'), 'false');
  requests[1].resolve(Response.json({entries: [row(3, 'New'), row(2, 'Previous')], more: true}));
  await flush();
  assert.equal(results.children[1], existing);
  assert.ok(existing.contains(document.activeElement));
  const added = results.children[0];
  assert.ok(added.classList.has('just-added'));
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(added.classList.has('just-added'), false);

  refresh(5);
  await flush();
  more.onclick();
  assert.deepEqual(requests[3].query, {q: '', order: 'newest', before: '2'});
  requests[3].resolve(Response.json({entries: [row(1, 'Oldest')], more: false}));
  await flush();
  requests[2].resolve(Response.json({entries: [row(4, 'While Paginating')], more: false}));
  await flush();
  assert.equal(results.children.length, 3);
  assert.equal(results.children[0], added);
  refresh(6);
  await flush();
  assert.equal(requests.length, 4);
});


test('changing order during pagination restarts at the first match and ignores the old response', async () => {
  const {requests, order, results, more, submit} = searchFixture();
  submit('Alpha');
  requests[0].resolve(Response.json({entries: [row(10, 'Alpha ten')], more: true}));
  await flush();
  more.onclick();
  order.value = 'oldest';
  order.handlers.get('change')();
  assert.deepEqual(requests[2].query, {q: 'Alpha', order: 'oldest'});
  requests[2].resolve(Response.json({entries: [row(2, 'Alpha two')], more: true}));
  await flush();
  requests[1].resolve(Response.json({entries: [row(8, 'Stale')], more: false}));
  await flush();
  assert.equal(results.children.length, 1);
  more.onclick();
  assert.deepEqual(requests[3].query, {q: 'Alpha', order: 'oldest', after: '2'});
  requests[3].resolve(Response.json({entries: [row(7, 'Alpha seven')], more: false}));
  await flush();
  assert.equal(results.children.length, 2);
  assert.equal(more.hidden, true);
});
