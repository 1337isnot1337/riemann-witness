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

  get href() { return this.attributes.get('href'); }
  set href(value) { this.attributes.set('href', value); }
  set dateTime(value) { this.attributes.set('datetime', value); }

  addEventListener(event, handler) { this.handlers.set(event, handler); }
  querySelector(selector) { return this.selectors.get(selector); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  before(node) { this.previous = node; }
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? Object.assign(new Element(), {textContent: node}) : node;
      this.insertBefore(child, null);
    }
  }
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

function searchFixture(initialCounts = {total: 1}) {
  const elements = new Map(['#register', '#search', '#q', '#entries', '#more', '#registry-order', '.registry-archive',
    '#signatures-plot', '[data-count]', '#registry-total', '#registry-public-count', '#registry-private-count',
    '#registry-private', '#signature-plot-track', '#signature-plot-marks', '#signature-plot-range', '#signature-plot-name',
    '#signature-plot-person', '#signature-plot-number', '#signature-plot-when', '#signature-plot-earlier', '#signature-plot-later',
    '#signature-plot-heading', '#signature-plot-zone', '#signature-plot-caption', '#signature-plot-choice',
    '#signature-plot-steps', '#signature-private-detail',
    '#first-signature', '#last-signature'].map(selector => [selector, new Element()]));
  elements.get('#registry-order').value = 'newest';
  elements.get('#register').selectors.set('.status', new Element());
  const requests = [], timers = [];
  let poll, counts = initialCounts;
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
      if (pathname === '/api/count') return Promise.resolve(Response.json(counts));
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
    elements,
    timers,
    results: elements.get('#entries'),
    more: elements.get('#more'),
    refresh(next) { counts = typeof next === 'number' ? {total: next} : next; poll(); },
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

test('the aggregate private count selects Private and can return to the public strip', async () => {
  const {requests, elements, submit, refresh} = searchFixture({total: 4, public: 1, private: 3});
  const privateButton = elements.get('#registry-private');
  const privateCount = elements.get('#registry-private-count');
  const privateDetail = elements.get('#signature-private-detail');
  const publicChoice = elements.get('#signature-plot-choice');
  const publicRange = elements.get('#signature-plot-range');
  const publicRow = row(3, 'Public witness');

  submit('');
  requests[0].resolve(Response.json({entries: [publicRow], more: false}));
  await flush();
  assert.equal(privateButton.disabled, false);
  assert.equal(privateCount.textContent, '3');
  assert.equal(privateDetail.hidden, true);
  privateButton.handlers.get('click')();
  assert.equal(privateButton.attributes.get('aria-pressed'), 'true');
  assert.equal(privateDetail.hidden, false);
  assert.equal(publicChoice.hidden, true);
  assert.equal(elements.get('#signature-plot-steps').hidden, true);
  privateButton.handlers.get('click')();
  assert.equal(privateButton.attributes.get('aria-pressed'), 'false');
  assert.equal(elements.get('#signature-plot-person').textContent, publicRow.name);
  privateButton.handlers.get('click')();
  publicRange.handlers.get('focus')();
  assert.equal(privateButton.attributes.get('aria-pressed'), 'false');
  assert.equal(privateDetail.hidden, true);
  assert.equal(publicChoice.hidden, false);

  privateButton.handlers.get('click')();
  submit('3');
  assert.equal(privateButton.disabled, true);
  assert.equal(privateDetail.hidden, true);
  refresh({total: 6, public: 1, private: 5});
  await flush();
  assert.equal(privateButton.disabled, true);
  requests[1].resolve(Response.json({entries: [publicRow], more: false}));
  await flush();
  assert.equal(privateButton.disabled, true);
  submit('');
  requests[2].resolve(Response.json({entries: [publicRow], more: false}));
  await flush();
  assert.equal(privateButton.disabled, false);
  assert.equal(privateCount.textContent, '5');
  assert.equal(publicChoice.hidden, false);

  refresh({total: 6, public: 0, private: 6});
  await flush();
  requests[3].resolve(Response.json({entries: [], more: false}));
  await flush();
  assert.equal(privateDetail.hidden, false);
  assert.equal(elements.get('#signature-plot-name').href, undefined);
  assert.equal(elements.get('#signature-plot-person').textContent, '');
  assert.equal(elements.get('#signature-plot-number').textContent, '');
  assert.equal(elements.get('#signature-plot-when').attributes.has('datetime'), false);
  assert.equal(publicRange.attributes.has('aria-valuetext'), false);
});

test('an all-private register shows the aggregate count and no time strip', async () => {
  const {requests, elements, submit, refresh} = searchFixture({total: 1, public: 0, private: 1});
  const plot = elements.get('#signatures-plot');
  const privateCount = elements.get('#registry-private-count');
  submit('');
  requests[0].resolve(Response.json({entries: [], more: false}));
  await flush();
  assert.equal(plot.hidden, false);
  assert.equal(privateCount.textContent, '1');
  assert.equal(elements.get('#signature-private-detail').hidden, false);
  for (const selector of ['#signature-plot-track','#signature-plot-caption']){
    assert.equal(elements.get(selector).hidden, true);
  }

  refresh({total: 1_000_000, public: 0, private: 1_000_000});
  await flush();
  assert.equal(privateCount.textContent, '1,000,000');
  requests[1].resolve(Response.json({entries: [], more: false}));
  await flush();
  refresh({total: 0, public: 0, private: 0});
  await flush();
  assert.equal(plot.hidden, true);
  assert.equal(elements.get('#registry-private').disabled, true);
  requests[2].resolve(Response.json({entries: [], more: false}));
  await flush();
});

test('the signature strip spaces marks by UTC and keeps the selected witness and date legible', async () => {
  const {requests, elements, submit} = searchFixture();
  const signatures = [
    {...row(4, 'Late'), created_at: '2026-11-21T00:10:00.000Z'},
    {...row(3, 'Middle'), created_at: '2026-11-20T23:55:00.000Z'},
    {...row(2, 'Early'), created_at: '2026-11-20T23:50:00.000Z'},
  ];
  submit('');
  requests[0].resolve(Response.json({entries: signatures, more: false}));
  await flush();
  const track = elements.get('#signature-plot-marks');
  assert.deepEqual(track.children.map(mark => mark.style.left), ['0%', '25%', '100%']);
  assert.ok(track.children.every(mark => mark.style.top === undefined));
  assert.equal(elements.get('#signature-plot-heading').textContent, 'Latest public signatures');
  assert.equal(elements.get('#signature-plot-person').textContent, 'Late');
  assert.equal(elements.get('#signature-plot-number').textContent, '#000004');
  assert.equal(elements.get('#signature-plot-when').textContent, 'Nov 21 · 00:10:00 UTC');
  elements.get('#signature-plot-earlier').handlers.get('click')();
  assert.equal(elements.get('#signature-plot-person').textContent, 'Middle');
  assert.equal(elements.get('#signature-plot-when').textContent, 'Nov 20 · 23:55:00 UTC');
});

test('an unchanged count poll revalidates moderated notes after the initial page', async () => {
  const count = {total: 1, public: 1, private: 0};
  const {requests, results, document, submit, refresh} = searchFixture(count);
  const original = {...row(1, 'Witness'), message: 'Original note'};
  submit('');
  requests[0].resolve(Response.json({entries: [original], more: false}));
  await flush();
  assert.equal(requests.length, 1);
  const oldLine = results.children[0];
  document.activeElement = oldLine.children[0];
  const note = line => line.children[0].children[1].children.at(-1).textContent;
  assert.equal(note(oldLine), 'Original note');

  const updated = {...original, message: '[note removed]'};
  refresh(count);
  await flush();
  assert.deepEqual(requests[1].query, {q: '', order: 'newest'});
  requests[1].resolve(Response.json({entries: [updated], more: false}));
  await flush();
  const newLine = results.children[0];
  assert.equal(results.children.length, 1);
  assert.equal(newLine, oldLine);
  assert.equal(document.activeElement, newLine.children[0]);
  assert.equal(note(newLine), '[note removed]');
  assert.equal(newLine.classList.has('just-added'), false);
  refresh(count);
  await flush();
  requests[2].resolve(Response.json({entries: [updated], more: false}));
  await flush();
  assert.equal(results.children[0], newLine);
});
