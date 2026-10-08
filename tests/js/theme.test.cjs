const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../viewer/theme.js'), 'utf8');
function setup(search = '', dark = false) {
  const handlers = {};
  const media = { matches: dark, addEventListener: (_, fn) => { media.change = fn; } };
  const select = { replaceChildren(...options) { this.options = options; },
    setAttribute() {}, addEventListener: (_, fn) => { select.change = fn; } };
  const document = { documentElement: { dataset: {}, lang: 'nb' },
    addEventListener: (event, fn) => { handlers[event] = fn; },
    getElementById: () => ({ append() {} }), createElement: () => select,
    querySelectorAll: () => [] };
  const location = { search, href: 'https://example.org/course/' + search };
  const window = { matchMedia: () => media, dispatchEvent() {} };
  vm.runInNewContext(source, { window, document, location, URL, URLSearchParams,
    Event, Option: function(text, value) { this.text = text; this.value = value; },
    MutationObserver: class { observe() {} },
    history: { state: null, replaceState: (_, __, href) => { location.href = href; } } });
  handlers.DOMContentLoaded();
  return { document, media, select, window, location };
}
test('automatic theme follows OS changes and invalid parameters fall back', () => {
  const ctx = setup('?theme=invalid', true);
  assert.equal(ctx.document.documentElement.dataset.theme, 'dark');
  ctx.media.matches = false; ctx.media.change();
  assert.equal(ctx.document.documentElement.dataset.theme, 'light');
});
test('explicit themes override OS preferences and survive linked navigation', () => {
  for (const theme of ['light', 'dark']) {
    const ctx = setup('?theme=' + theme, theme === 'light');
    ctx.media.change();
    assert.equal(ctx.document.documentElement.dataset.theme, theme);
    const target = new URL(ctx.window.KulTheme.medTema('./arena/?lang=en#place'));
    assert.equal(target.searchParams.get('theme'), theme);
    assert.equal(target.searchParams.get('lang'), 'en');
    assert.equal(target.hash, '#place');
  }
});
test('user choice updates share URL, preserves language and can return to automatic', () => {
  const ctx = setup('?lang=en', false);
  ctx.select.value = 'dark'; ctx.select.change();
  assert.equal(ctx.document.documentElement.dataset.theme, 'dark');
  assert.equal(new URL(ctx.location.href).searchParams.get('lang'), 'en');
  assert.equal(new URL(ctx.location.href).searchParams.get('theme'), 'dark');
  ctx.select.value = 'auto'; ctx.select.change();
  assert.equal(ctx.document.documentElement.dataset.theme, 'light');
  ctx.media.matches = true; ctx.media.change();
  assert.equal(ctx.document.documentElement.dataset.theme, 'dark');
});
