const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { chromium } = require('../bruno-userscript-build/node_modules/playwright');

const script = readFileSync(require.resolve('../src.js'), 'utf8');

// Bruno v4.2.1 DOM contract, including lazy panels and a portal-mounted Preview menu.
async function mount(page, options) {
  await page.setContent(`
    <div id="status"><button><div><span>Dev Tools</span></div></button></div>
    <div role="tablist"><button role="tab">Response</button>
      ${options.overflow ? '<button class="more-tabs">More</button>' : '<button role="tab" aria-selected="false">Timeline</button>'}
    </div>
    <div id="content"></div>
  `);
  await page.evaluate((options) => {
    window.copied = null;
    window.errors = [];
    console.error = (...args) => window.errors.push(args.map(String).join(' '));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text) => {
        if (options.rejectCopy) throw new Error('Clipboard denied');
        window.copied = text;
      }
    } });

    const render = () => {
      if (options.noEntries) return;
      document.querySelector('#content').innerHTML = '<div class="timeline-container"></div>';
      for (const id of ['FIRST', 'SECOND']) {
        const item = document.createElement('div');
        item.className = 'timeline-event';
        item.innerHTML = '<div class="tl-row-wrap"><div class="tl-row" role="button" aria-expanded="false">Request</div></div>';
        document.querySelector('.timeline-container').append(item);
        const expand = () => {
          const wrap = item.firstElementChild;
          if (wrap.querySelector('.tl-detail')) return;
          item.querySelector('.tl-row').setAttribute('aria-expanded', 'true');
          wrap.insertAdjacentHTML('beforeend', `<div class="tl-detail"><div class="tl-tabs">
            <button data-testid="tl-tab-request">Request</button><button data-testid="tl-tab-response">Response</button>
            ${options.noNetwork ? '' : '<button data-testid="tl-tab-network">Network</button>'}
            </div><div class="tl-panel"><div style="display:block"><div class="CodeMirror"></div></div></div></div>`);
          wrap.querySelector('.CodeMirror').CodeMirror = { getValue: () => 'WRONG REQUEST BODY' };
          const panels = wrap.querySelector('.tl-panel');
          for (const tab of ['response', 'network']) {
            wrap.querySelector(`[data-testid="tl-tab-${tab}"]`)?.addEventListener('click', () => {
              let panel = panels.querySelector(`[data-panel="${tab}"]`);
              if (!panel) {
                panel = document.createElement('div');
                panel.dataset.panel = tab;
                panels.append(panel);
                if (tab === 'network') {
                  panel.innerHTML = `<pre class="network-logs-pre"><div><div class="network-logs-entry network-logs-entry--request"><div>GET /${id}</div></div></div><div><div class="network-logs-entry"><div>Authorization: Bearer secret-${id}</div></div></div></pre>`;
                } else {
                  panel.innerHTML = '<div class="tl-response-meta"><span>201 Created</span><span>37ms</span><span>123 B</span></div><div class="tl-block"><button data-testid="response-body-toggle" aria-expanded="false">Body</button></div>';
                  const body = panel.querySelector('.tl-block');
                  const toggle = body.firstElementChild;
                  const showEditor = () => {
                    body.insertAdjacentHTML('beforeend', '<div class="CodeMirror"></div>');
                    body.querySelector('.CodeMirror').CodeMirror = { getValue: () => `RESPONSE-${id}` };
                  };
                  toggle.onclick = () => {
                    toggle.setAttribute('aria-expanded', 'true');
                    if (options.emptyBody) {
                      body.insertAdjacentHTML('beforeend', '<div class="tl-empty">No Body</div>');
                    } else if (options.preview) {
                      body.insertAdjacentHTML('beforeend', '<button data-testid="format-response-tab">JSON</button>');
                      body.lastElementChild.onclick = () => {
                        const menu = document.querySelector('#preview-menu');
                        if (menu) { menu.remove(); return; }
                        const portal = document.createElement('div');
                        portal.id = 'preview-menu';
                        portal.innerHTML = '<div data-testid="preview-response-tab" title="Turn off Preview Mode"><input type="checkbox" checked></div>';
                        portal.querySelector('input').oninput = showEditor;
                        document.body.append(portal);
                      };
                    } else {
                      showEditor();
                    }
                  };
                  if (!options.foldedBody) toggle.click();
                }
              }
              for (const child of panels.children) child.style.display = child === panel ? 'block' : 'none';
            });
          }
        };
        item.querySelector('.tl-row').onclick = expand;
        if (options.expandedSecond && id === 'SECOND') expand();
      }
    };
    if (options.overflow) {
      document.querySelector('.more-tabs').onclick = () => {
        const menu = document.createElement('button');
        menu.setAttribute('role', 'menuitem');
        menu.textContent = 'Timeline';
        menu.onclick = render;
        document.body.append(menu);
      };
    } else {
      document.querySelector('[role="tab"]:last-child').onclick = render;
    }
  }, options);
}

test('Copy uses the selected v4.2.1 response, masks logs and cleans up', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    for (const options of [
      {}, { expandedSecond: true }, { overflow: true, foldedBody: true, preview: true },
      { noNetwork: true }, { emptyBody: true }, { noEntries: true }, { rejectCopy: true }
    ]) {
      await mount(page, options);
      await page.evaluate((script) => { window.dispose = (0, eval)(script); }, script);
      const copy = page.getByRole('button', { name: 'Copy', exact: true });
      await copy.waitFor();
      await copy.click();
      await page.waitForFunction(() => window.copied !== null || window.errors.length > 0);
      const { copied, errors } = await page.evaluate(() => ({ copied: window.copied, errors: window.errors }));
      if (options.noEntries || options.rejectCopy) {
        assert.equal(copied, null);
        assert.match(errors.join(' '), options.noEntries ? /No Timeline request found/ : /Clipboard denied/);
      } else {
        const id = options.expandedSecond ? 'SECOND' : 'FIRST';
        const logs = options.noNetwork ? '' : `GET /${id}\nAuthorization: Bearer ****`;
        const body = options.emptyBody ? '' : `RESPONSE-${id}`;
        assert.equal(copied, `201 Created, 37ms, 123 B, ${logs}\n\n${body}\n`.replace(/\n{3,}/g, '\n\n'));
        assert.deepEqual(errors, []);
      }
      await page.evaluate(() => window.dispose());
      assert.equal(await copy.count(), 0);
    }
  } finally {
    await browser.close();
  }
});
