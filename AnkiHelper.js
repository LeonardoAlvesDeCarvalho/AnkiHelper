(function () {
  if (document.getElementById('ankiFloatingBtns')) return;

  // Estilos
  const style = document.createElement('style');
  style.textContent = `
    .anki-marker { background: #ffeb3b40; border-bottom: 2px dashed #ffc107; }
    .anki-cloze { background: #e0f2fe; border-radius: 3px; padding: 2px; }
  `;
  document.head.appendChild(style);

  const storageKey = 'ankiAnnotations';
  let annotations = JSON.parse(localStorage.getItem(storageKey) || "[]");

  function getXPath(node, root = document.body) {
    if (node === root) return '.';
    if (node.nodeType === Node.TEXT_NODE) {
      const parentXPath = getXPath(node.parentNode, root);
      let index = 1;
      for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType === Node.TEXT_NODE) index++;
      }
      return parentXPath + '/text()[' + index + ']';
    }
    let index = 1;
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === node.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    return getXPath(node.parentNode, root) + '/' + node.nodeName.toLowerCase() + '[' + index + ']';
  }

  function getNodeByXPath(path, context = document.body) {
    return document.evaluate(path, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  function saveAnnotation(annotation) {
    annotations.push(annotation);
    localStorage.setItem(storageKey, JSON.stringify(annotations));
  }

  function wrapRange(range, type, content, color = null) {
    const span = document.createElement('span');
    span.dataset.ankiId = Date.now();

    if (type === 'lt') {
      span.className = 'anki-marker';
      if (content.includes('{{c1::')) {
        span.appendChild(document.createTextNode("{LT/ "));
        const parts = parseLtContent(content);
        parts.forEach(part => {
          if (part.type === 'text') {
            span.appendChild(document.createTextNode(part.content));
          } else if (part.type === 'cloze') {
            const clozeSpan = document.createElement('span');
            clozeSpan.className = 'anki-cloze';
            clozeSpan.textContent = part.content;
            span.appendChild(clozeSpan);
          }
        });
        span.appendChild(document.createTextNode(" /LT}"));
      } else {
        span.textContent = `{LT/ ${content} /LT}`;
      }
    } else if (type === 'cloze') {
      span.className = 'anki-cloze';
      span.textContent = `{{c1::${content}}}`;
    } else if (type === 'highlight') {
      span.style.backgroundColor = color;
      span.textContent = content;
    }

    range.deleteContents();
    range.insertNode(span);
  }

  function parseLtContent(content) {
    const parts = [];
    const regex = /({{c1::.*?}})/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'cloze', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }
    return parts;
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const annotation = {
      type: 'lt',
      xpath: getXPath(range.startContainer),
      startOffset: range.startOffset,
      length: selectedText.length,
      content: selectedText,
      color: null,
      id: Date.now()
    };

    wrapRange(range.cloneRange(), annotation.type, annotation.content);
    saveAnnotation(annotation);
    hideFloatingBtns();
  }

  function insertCloze() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const annotation = {
      type: 'cloze',
      xpath: getXPath(range.startContainer),
      startOffset: range.startOffset,
      length: selectedText.length,
      content: selectedText,
      color: null,
      id: Date.now()
    };

    wrapRange(range.cloneRange(), annotation.type, annotation.content);
    saveAnnotation(annotation);
    hideFloatingBtns();
  }

  function highlightSelection(color) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const annotation = {
      type: 'highlight',
      xpath: getXPath(range.startContainer),
      startOffset: range.startOffset,
      length: selectedText.length,
      content: selectedText,
      color: color,
      id: Date.now()
    };

    wrapRange(range.cloneRange(), annotation.type, annotation.content, color);
    saveAnnotation(annotation);
    hideFloatingBtns();
  }

  function reinsertSavedCards() {
    annotations.forEach(anno => {
      try {
        const node = getNodeByXPath(anno.xpath);
        if (!node || node.nodeType !== Node.TEXT_NODE) return;

        if (anno.type === 'lt' && node.parentNode?.classList?.contains('anki-marker')) return;

        const nodeText = node.nodeValue;
        if (nodeText.substring(anno.startOffset, anno.startOffset + anno.length) !== anno.content) return;

        const range = document.createRange();
        range.setStart(node, anno.startOffset);
        range.setEnd(node, anno.startOffset + anno.length);
        wrapRange(range, anno.type, anno.content, anno.color);
      } catch (e) {
        console.error('Erro ao reinserir anotação ID ' + anno.id, e);
      }
    });
  }

  function hideFloatingBtns() {
    floatingBtns.style.display = 'none';
  }

  const floatingBtns = document.createElement('div');
  floatingBtns.id = 'ankiFloatingBtns';
  floatingBtns.style.cssText = `
    position: absolute; z-index: 9999; display: none;
    background: #fff; border: 1px solid #ccc; border-radius: 6px;
    padding: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  `;

  const buttons = [
    { text: 'Card', action: saveSelection, color: '#2d89ef' },
    { text: 'c1', action: insertCloze, color: '#3B7' },
    { text: '★', action: () => highlightSelection('#ffeb3b'), color: '#f1c40f' },
    { text: '★', action: () => highlightSelection('#90caf9'), color: '#3498db' },
    { text: '★', action: () => highlightSelection('#f48fb1'), color: '#e91e63' }
  ];

  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.textContent = btn.text;
    button.style.cssText = `
      margin: 2px; padding: 5px 10px; background: ${btn.color};
      color: white; border: none; border-radius: 4px; cursor: pointer;
    `;
    button.onclick = btn.action;
    floatingBtns.appendChild(button);
  });

  document.body.appendChild(floatingBtns);

  function showFloatingButtons() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.toString().trim()) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    floatingBtns.style.top = `${window.scrollY + rect.top - 45}px`;
    floatingBtns.style.left = `${window.scrollX + rect.left}px`;
    floatingBtns.style.display = 'block';
  }

  // Suporte desktop
  document.addEventListener('mouseup', () => {
    setTimeout(showFloatingButtons, 50);
  });

  // Suporte mobile (Android)
  document.addEventListener('touchend', () => {
    setTimeout(showFloatingButtons, 300); // leve atraso para garantir que a seleção finalize
  });

  document.addEventListener('mousedown', e => {
    if (!floatingBtns.contains(e.target)) hideFloatingBtns();
  });

  document.addEventListener('touchstart', e => {
    if (!floatingBtns.contains(e.target)) hideFloatingBtns();
  });

  reinsertSavedCards();
})();
