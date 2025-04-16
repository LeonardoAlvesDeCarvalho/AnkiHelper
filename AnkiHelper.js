(function () {
  if (document.getElementById('ankiFloatingBtns')) return;
  const style = document.createElement('style');
  // Insere os estilos
style.textContent = `
  .anki-marker {
  border-bottom: 2px dashed #ffc107;
  white-space: pre-wrap;
  display: inline;
  padding: 0;
  margin: 0;
}
  .anki-cloze {
    background: #e0f2fe;
    border-radius: 3px;
    padding: 2px;
  }
`;

  document.head.appendChild(style);

  const storageKey = 'ankiAnnotations';
  let annotations = JSON.parse(localStorage.getItem(storageKey) || "[]");

  // --- FUNÇÕES AUXILIARES PARA XPATH ---
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

  // --- FUNÇÃO DE DISTÂNCIA (mantida se precisar futuramente) ---
  function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b[i-1] === a[j-1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
      }
    }
    return matrix[b.length][a.length];
  }

  // --- ARMAZENAMENTO DA ANOTAÇÃO ---
  function saveAnnotation(annotation) {
  annotations.push(annotation);
  localStorage.setItem(storageKey, JSON.stringify(annotations));
}
	// --- FUNÇÃO PARA REMOVER ANOTAÇÃO ---
function removeAnnotation(id) {
  console.log('Tentando remover anotação com ID:', id);
  console.log('Anotações atuais:', annotations);

  // Remove a anotação do array
  annotations = annotations.filter(annotation => annotation.id !== id);

  // Atualiza o localStorage
  localStorage.setItem(storageKey, JSON.stringify(annotations));

  // Remove o destaque visual do texto
  const span = document.querySelector(`[data-anki-id="${id}"]`);
  if (span) {
    const parent = span.parentNode;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  }

  // Oculta os botões flutuantes (caso estejam visíveis)
  hideFloatingBtns();
}


function removeBtns() {
    floatingBtns.style.display = 'none';
}

  // --- FUNÇÃO DE WRAP (INSERE OS SPANS COM A MARCAÇÃO) ---
  function wrapRange(range, type, content, color = null, id = null) {
  const span = document.createElement('span');
  const uniqueId = id || Date.now();
  span.dataset.ankiId = uniqueId;


  if (type === 'lt') {
    span.className = 'anki-marker';
    
    // Sem {LT/ ... /LT}, apenas adiciona o conteúdo formatado
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


  // --- FUNÇÃO PARA PARSEAR O CONTEÚDO LT EM PARTES ---
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

  // --- SALVA A SELEÇÃO ATUAL ---
  function saveSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      console.error('Seleção não é de um nó de texto único');
      return;
    }
    const startOffset = range.startOffset;
    const length = selectedText.length;
    const xpath = getXPath(range.startContainer);
    const annotation = {
      type: 'lt',
      xpath: xpath,
      startOffset: startOffset,
      length: length,
      content: selectedText,
      color: null,
      id: Date.now()
    };

    wrapRange(range.cloneRange(), annotation.type, annotation.content, null, annotation.id);
    saveAnnotation(annotation);
    hideFloatingBtns();
  }

  // --- SALVA A SELEÇÃO COMO CLOZE ---
  function insertCloze() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      console.error('Seleção não é de um nó de texto único');
      return;
    }
    const startOffset = range.startOffset;
    const length = selectedText.length;
    const xpath = getXPath(range.startContainer);
    const annotation = {
      type: 'cloze',
      xpath: xpath,
      startOffset: startOffset,
      length: length,
      content: selectedText,
      color: null,
      id: Date.now()
    };

    wrapRange(range.cloneRange(), annotation.type, annotation.content, null, annotation.id);
    saveAnnotation(annotation);
    hideFloatingBtns();
  }

  // --- SALVA A SELEÇÃO COMO HIGHLIGHT ---
  function highlightSelection(color) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    if (!selectedText) return;

    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      console.error('Seleção não é de um nó de texto único');
      return;
    }
    const startOffset = range.startOffset;
    const length = selectedText.length;
    const xpath = getXPath(range.startContainer);
    const annotation = {
      type: 'highlight',
      xpath: xpath,
      startOffset: startOffset,
      length: length,
      content: selectedText,
      color: color,
      id: Date.now()
    };

    wrapRange(range.cloneRange(), annotation.type, annotation.content, annotation.color, annotation.id);

    saveAnnotation(annotation);
    hideFloatingBtns();
  }

  // --- REINSERE AS ANOTAÇÕES SALVAS ---
  function reinsertSavedCards() {
    annotations.forEach(anno => {
      try {
        const node = getNodeByXPath(anno.xpath);
        if (!node || node.nodeType !== Node.TEXT_NODE) return;

        // Para LT: se o nó já estiver dentro de um span com classe "anki-marker", ignoramos
        if (anno.type === 'lt') {
          if (node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('anki-marker')) {
            return;
          }
        } else {
          // Para outros tipos, verificamos se o trecho bate exatamente:
          const nodeText = node.nodeValue;
          if (nodeText.substring(anno.startOffset, anno.startOffset + anno.length) !== anno.content) {
            console.warn('Texto não bate para a anotação ID', anno.id);
            return;
          }
        }
        const range = document.createRange();
        range.setStart(node, anno.startOffset);
        range.setEnd(node, anno.startOffset + anno.length);
        wrapRange(range, anno.type, anno.content, anno.color, anno.id);
      } catch (e) {
        console.error('Erro ao reinserir anotação ID ' + anno.id, e);
      }
    });
  }

  function hideFloatingBtns() {
    floatingBtns.style.display = 'none';
  }

  // --- CRIA OS BOTÕES FLUTUANTES ---
  const floatingBtns = document.createElement('div');
floatingBtns.id = 'ankiFloatingBtns';
floatingBtns.style.cssText = `
  position: absolute; z-index: 9999; display: none;
  background: #fff; border: 1px solid #ccc; border-radius: 6px;
  padding: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
`;

const buttons = [
  { text: 'c1', action: insertCloze, color: '#3B7' },
  { text: '★', action: () => highlightSelection('#ffeb3b'), color: '#f1c40f' },
  { text: '★', action: () => highlightSelection('#90caf9'), color: '#3498db' },
  { text: '★', action: () => highlightSelection('#f48fb1'), color: '#e91e63' },
  { text: 'Card', action: saveSelection, color: '#2d89ef' }
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

document.body.appendChild(floatingBtns); // <- MUITO IMPORTANTE

document.addEventListener('mouseup', e => {
  const sel = window.getSelection();
  if (sel.toString().trim()) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    floatingBtns.style.display = 'block';
    floatingBtns.style.left = `${window.scrollX + rect.left}px`;
    floatingBtns.style.top = `${window.scrollY + rect.bottom + 5}px`;
  } else {
    floatingBtns.style.display = 'none';
  }
});




  // --- ATALHOS DE TECLADO ---
  document.addEventListener('keydown', function (e) {
    if (!e.ctrlKey || !e.altKey) return;

    switch (e.key.toLowerCase()) {
      case 'd': // Ctrl + Alt + D
        e.preventDefault();
        saveSelection();
        break;
      case 'a': // Ctrl + Alt + A
        e.preventDefault();
        insertCloze();
        break;
      case '1': // Ctrl + Alt + 1
        e.preventDefault();
        highlightSelection('#ffeb3b'); // amarelo
        break;
      case '2': // Ctrl + Alt + 2
        e.preventDefault();
        highlightSelection('#90caf9'); // azul
        break;
      case '3': // Ctrl + Alt + 3
        e.preventDefault();
        highlightSelection('#f48fb1'); // rosa
        break;
      case '¹': // Ctrl + Alt + 1
        e.preventDefault();
        highlightSelection('#ffeb3b'); // amarelo
        break;
      case '²': // Ctrl + Alt + 2
        e.preventDefault();
        highlightSelection('#90caf9'); // azul
        break;
      case '³': // Ctrl + Alt + 3
        e.preventDefault();
        highlightSelection('#f48fb1'); // rosa
        break;
      case 'r': // Ctrl + Alt + R - Remove annotation
        e.preventDefault();
        const selectedNode = window.getSelection().anchorNode;
        const parentNode = selectedNode ? selectedNode.parentNode : null;
        if (parentNode && parentNode.dataset && parentNode.dataset.ankiId) {
          const annotationId = parseInt(parentNode.dataset.ankiId, 10);
          removeAnnotation(annotationId);  // Remover a anotação com o ID
       }
      break;
case 'x': // Ctrl + Alt + X - Remove annotation
            e.preventDefault();
            const sel = window.getSelection();
            if (sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            let node = range.commonAncestorContainer;

            // Encontra o elemento de anotação mais próximo
            let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            while (element && element !== document.body) {
                if (element.dataset.ankiId) {
                    const annotationId = parseInt(element.dataset.ankiId, 10);

                    // Remove o elemento do DOM
                    const parent = element.parentNode;
                    while (element.firstChild) {
                        parent.insertBefore(element.firstChild, element);
                    }
                    parent.removeChild(element);

                    // Remove do armazenamento SEM CHAMAR reinsertSavedCards()
                    annotations = annotations.filter(anno => anno.id !== annotationId);
                    localStorage.setItem(storageKey, JSON.stringify(annotations));
                    
                    break;
                }
                element = element.parentElement;
            }
            break;


    }
  });

  // --- EXIBE OS BOTÕES FLUTUANTES QUANDO HÁ UMA SELEÇÃO ---
  document.addEventListener('mouseup', e => {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      floatingBtns.style.display = 'block';
      floatingBtns.style.left = `${window.scrollX + rect.left}px`;
      floatingBtns.style.top = `${window.scrollY + rect.bottom + 5}px`;
    } else {
      floatingBtns.style.display = 'none';
    }
  });
  // Suporte mobile (Android)
  document.addEventListener('touchend', () => {
    setTimeout(showFloatingButtons, 300); // leve atraso para garantir que a seleção finalize
  });

  document.addEventListener('touchstart', e => {
    if (!floatingBtns.contains(e.target)) hideFloatingBtns();
  });
  // --- REINSERE AS ANOTAÇÕES SALVAS ---
  reinsertSavedCards();
})();
