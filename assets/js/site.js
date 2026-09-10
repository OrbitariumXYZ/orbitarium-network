/* Orbitarium — progressive enhancement only.
   The page is complete without JS: every figure slot is server-rendered with its
   dash + state word, and no inert control carries an href. This script:
     1. loads data/registry.json and reconciles it with the data- attributes in markup
        (console warning on drift — the build gate does the hard assertion),
     2. binds click-to-copy on the contract-address slot ONLY when its record is stated,
     3. wires the tab groups.
   The entrance fade is pure CSS (assets/css/site.css) and needs no script. */

async function registry() {
  try {
    const r = await fetch('data/registry.json', { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function reconcile(reg) {
  if (!reg) return;
  const rec = reg.records || {};
  document.querySelectorAll('[data-registry]').forEach((el) => {
    const key = el.getAttribute('data-registry');
    const want = rec[key] ? rec[key].state : 'absent';
    const got = el.getAttribute('data-state');
    if (want !== got) {
      console.warn(`[registry] ${key}: markup says "${got}", registry says "${want}"`);
    }
  });
  // counts are the length of a registry list — never written into markup
  document.querySelectorAll('[data-count-of]').forEach((el) => {
    const key = el.getAttribute('data-count-of');
    const r = rec[key];
    const list = r && Array.isArray(r.value) ? r.value : [];
    el.textContent = r && r.state === 'stated' ? String(list.length) : el.getAttribute('data-empty') || '—';
  });
}

function wireCopy(reg) {
  const ca = document.querySelector('.ca');
  if (!ca) return;
  const state = ca.getAttribute('data-state');
  const btn = ca.querySelector('.ca-copy');
  const val = ca.querySelector('.ca-value');
  if (state !== 'stated' || !btn || !val) return; // inert: nothing bound
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(val.textContent.trim());
      btn.setAttribute('data-copied', '1');
      const prev = btn.textContent;
      btn.textContent = 'copied';
      setTimeout(() => { btn.removeAttribute('data-copied'); btn.textContent = prev; }, 1400);
    } catch { /* clipboard blocked — leave the visible address for manual copy */ }
  });
}

function wireTabs() {
  document.querySelectorAll('[data-tabs]').forEach((group) => {
    const btns = [...group.querySelectorAll('[role="tab"]')];
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      const panelId = b.getAttribute('aria-controls');
      group.querySelectorAll('[role="tabpanel"]').forEach((p) => {
        p.hidden = p.id !== panelId;
      });
    }));
  });
}

(async function () {
  wireTabs();
  const reg = await registry();
  reconcile(reg);
  wireCopy(reg);
})();
