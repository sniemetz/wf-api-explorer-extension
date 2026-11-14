export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function showMessage(container, kind, info = {}) {
  container.replaceChildren();
  if (kind === 'loading') {
    container.append(el('div', { class: 'msg', role: 'status' }, el('span', { class: 'spinner' }), info.text || 'Loading...'));
  } else if (kind === 'error') {
    const parts = [`Error: ${info.status ?? 'network'}`, info.url].filter(Boolean).join(' - ');
    container.append(
      el('div', { class: 'msg err', role: 'alert' }, el('div', { text: parts }),
        el('button', { type: 'button', text: 'Retry', onClick: info.onRetry })),
    );
  } else {
    container.append(el('div', { class: 'msg', text: info.text }));
  }
}

export function renderObjectList(container, objects, selectedCode, onSelect) {
  container.replaceChildren();
  for (const o of objects) {
    container.append(
      el('button', {
        type: 'button', class: 'row', role: 'option',
        'aria-selected': String(o.objCode === selectedCode),
        'data-code': o.objCode,
        onClick: () => onSelect(o),
      }, el('span', { text: o.label }), el('span', { class: 'code', text: o.objCode })),
    );
  }
}

const list = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '-' : String(v));

export function renderDetailHead(container, obj, detail) {
  container.replaceChildren(
    el('div', {}, el('strong', { text: detail?.label || obj.label }), ` (${obj.objCode})`),
    ...(detail ? [
      el('div', { text: `Flags: ${list(detail.flags)}` }),
      el('div', { text: `Operations: ${list(detail.operations)}` }),
    ] : []),
  );
}

export function renderTabs(container, tabs, counts, active, onTab) {
  container.replaceChildren(...tabs.map((t) => el('button', {
    type: 'button', role: 'tab', 'aria-selected': String(t.key === active),
    onClick: () => onTab(t.key),
  }, `${t.label}${counts ? ` (${counts[t.key]})` : ''}`)));
}

function valueNode(key, value, resolveCode, onLink) {
  const linkCode = (key === 'typeObjCode' || key === 'targetTypeObjCode') ? resolveCode(value) : undefined;
  if (linkCode) {
    return el('button', { type: 'button', class: 'objlink', text: linkCode, onClick: () => onLink(linkCode) });
  }
  if (key === 'possibleValues' && Array.isArray(value)) {
    return el('div', {}, ...value.map((p) => el('div', { text: `${p.label} (${p.value})` })));
  }
  if (key === 'arguments' && Array.isArray(value)) {
    return el('div', {}, ...value.map((a) => el('div', { text: `${a.name} (${a.type})` })));
  }
  if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) return document.createTextNode(list(value));
  if (value !== null && typeof value === 'object') return document.createTextNode(JSON.stringify(value));
  return document.createTextNode(String(value));
}

export function renderItems(container, entries, { expanded, onToggle, resolveCode, onLink, visibleAttrs }) {
  container.replaceChildren(...entries.map(([name, attrs]) => {
    const open = expanded.has(name);
    const item = el('div', { class: 'item' },
      el('button', { type: 'button', 'aria-expanded': String(open), onClick: () => onToggle(name) },
        el('strong', { class: 'pretty', text: attrs.label || name }),
        el('span', { class: 'meta', text: attrs.label ? name : '' })),
    );
    if (open) {
      const dl = el('dl', { class: 'attrs' });
      for (const [k, v] of visibleAttrs(attrs)) dl.append(el('dt', { text: `${k}:` }), el('dd', {}, valueNode(k, v, resolveCode, onLink)));
      item.append(dl);
    }
    return item;
  }));
}
