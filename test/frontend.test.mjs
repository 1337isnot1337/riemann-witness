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

  addEventListener(event, handler) { this.handlers.set(event, handler); }
  querySelector(selector) { return this.selectors.get(selector); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  before(node) { this.previous = node; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}

function searchFixture() {
  const elements = new Map(['#register', '#search', '#q', '#entries', '#more',
    '#signatures-plot', '[data-count]', '#registry-total'].map(selector => [selector, new Element()]));
  elements.get('#register').selectors.set('.status', new Element());
  const requests = [];
  const IntersectionObserver = class { observe() {} };
  runInNewContext(app, {
    document: {
      querySelector: key => elements.get(key),
      querySelectorAll: () => [],
      createElement: () => new Element(),
    },
    location: {origin: 'https://registry.example', hash: ''},
    sessionStorage: {getItem: () => null, setItem() {}},
    window: {IntersectionObserver},
    IntersectionObserver,
    crypto,
    AbortSignal,
    URLSearchParams,
    setInterval() {},
    fetch(url) {
      const {pathname, searchParams} = new URL(url);
      if (pathname === '/api/count') return Promise.resolve(Response.json({total: 1}));
      assert.equal(pathname, '/api/registry');
      return new Promise(resolve => requests.push({query: Object.fromEntries(searchParams), resolve}));
    },
  });
  const field = elements.get('#q');
  return {
    requests,
    field,
    results: elements.get('#entries'),
    more: elements.get('#more'),
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
  const cursor = {q: 'Alpha', before: '1', afterName: 'Alpha'};
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
