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
