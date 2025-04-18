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
    background: #b0f0a4;
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
// --- EXPORTAR PARA ANKI (CSV, 1 coluna / 1 card) ---
function exportToCSV() {
  // pega só os "cards" (anotações do tipo lt)
  const cards = annotations.filter(anno => anno.type === 'lt');
  if (!cards.length) {
    alert("Nenhum card (lt) para exportar.");
    return;
  }

  // para cada card, busca o <span.anki-marker> correspondente e extrai o texto
  const lines = cards.map(anno => {
    const span = document.querySelector(`span.anki-marker[data-anki-id="${anno.id}"]`);
    const raw = span 
      ? span.textContent 
      : anno.content;

    // limpa quebras e escapa aspas
    const clean = raw
      .replace(/\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/; /g, '\n')
      .replace(/;/g, '\n')
      .trim()
      .replace(/"/g, '""');

    // cada linha vira um card completo, entre aspas
    return `"${clean}"`;
  });

  // monta o CSV e dispara o download
  const uri = "data:text/csv;charset=utf-8,\uFEFF" + lines.join("\n");
  const a = document.createElement("a");
  a.href = encodeURI(uri);
  a.download = "anki_export.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}




// --- CRIA OS BOTÕES FLUTUANTES ---
const floatingBtns = document.createElement('div');
floatingBtns.id = 'ankiFloatingBtns';
floatingBtns.style.cssText = `
  position: absolute;
  z-index: 9999;
  display: none;
  background: #2e2e2e;               /* fundo cinza bonito */
  color: #2e2e2e;                       /* texto branco */
  border-radius: 8px;                /* cantos arredondados */
  padding: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);  /* sombra elegante */
  display: flex;
  gap: 6px;
`;

const BUTTON_SIZE = 32; // ajuste o px pro tamanho que quiser

const buttons = [
  { text: '[...]',   action: insertCloze,      color: '#b0f0a4' },
  { text: ' ',    action: () => highlightSelection('#fcf36d'), color: '#fcf36d' },
  { text: ' ',    action: () => highlightSelection('#aff1ff'), color: '#aff1ff' },
  { text: ' ',    action: () => highlightSelection('#febdd1'), color: '#febdd1' },
  { text: '★', action: saveSelection,     color: '#A1B4FF' }
];

buttons.forEach(btn => {
  const button = document.createElement('button');
  button.textContent = btn.text;
  Object.assign(button.style, {
  margin:        '2px',
  padding:       '0',
  width:         `${BUTTON_SIZE}px`,
  height:        `${BUTTON_SIZE}px`,
  display:       'inline-flex',
  alignItems:    'center',
  justifyContent:'center',
  background:    btn.color,
  color:         '#2e2e2e',
  border:        'none',
  borderRadius:  '4px',
  cursor:        'pointer',
  boxSizing:     'border-box',
  fontSize:      '16px',           // mesma fonte pra todo mundo
  lineHeight:    '1'               // força o texto exatamente centralizado
});

  button.addEventListener('click', btn.action);
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

// --- CONTAINER DO MENU FLOTANTE ---
const menuContainer = document.createElement('div');
Object.assign(menuContainer.style, {
  position: 'fixed',
  bottom: '10px',
  left: '10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '6px',
  background: '#2e2e2e',           // cinza escuro elegante
  color: '#e0f2fe',                   // texto branco (se for ter texto no container)
  padding: '10px',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.3)', // leve sombra
  zIndex: 10000
});
document.body.appendChild(menuContainer);

// --- BOTÃO "..." TOGGLE ---
const toggleBtn = document.createElement('button');
toggleBtn.textContent = '...';
Object.assign(toggleBtn.style, {
  padding: '6px 10px',
  background: '#444',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
});
menuContainer.appendChild(toggleBtn);

// --- CONTAINER DOS BOTÕES INTERNOS ---
const hiddenBtnsContainer = document.createElement('div');
Object.assign(hiddenBtnsContainer.style, {
  display: 'none',
  flexDirection: 'column',
  gap: '4px'
});
menuContainer.appendChild(hiddenBtnsContainer);

// --- BOTÃO DE EXPORTAÇÃO ---
const staticExportBtn = document.createElement('button');
staticExportBtn.textContent = 'Σ';
Object.assign(staticExportBtn.style, {
  padding: '6px 12px',
  background: '#A5D6A7',
  color: '#2e2e2e',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
});
staticExportBtn.addEventListener('click', exportToCSV);
hiddenBtnsContainer.appendChild(staticExportBtn);

// --- BOTÃO RESET ---
const staticResetBtn = document.createElement('button');
staticResetBtn.textContent = 'Ø';
Object.assign(staticResetBtn.style, {
  padding: '6px 12px',
  background: '#FFAB91',
  color: '#2e2e2e',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
});
staticResetBtn.addEventListener('click', () => {
  const confirmed = confirm('Vai apagar tudo mesmo? Está maluca?');
  if (confirmed) {
    localStorage.removeItem('ankiAnnotations'); // ou o nome correto do seu storage
    location.reload();
  }
});
hiddenBtnsContainer.appendChild(staticResetBtn);

// --- TOGGLE MOSTRAR/ESCONDER ---
let isOpen = false;
toggleBtn.addEventListener('click', () => {
  isOpen = !isOpen;
  hiddenBtnsContainer.style.display = isOpen ? 'flex' : 'none';
});


  // --- ATALHOS DE TECLADO ---
  document.addEventListener('keydown', function (e) {
      if (!e.shiftKey) return; 

    switch (e.key.toLowerCase()) {
      case 'd': // Ctrl + Alt + D
        e.preventDefault();
        saveSelection();
        break;
      case 'a': // Ctrl + Alt + A
        e.preventDefault();
        insertCloze();
        break;
      case 'q': // Ctrl + Alt + 1
        e.preventDefault();
        highlightSelection('#ffeb3b'); // amarelo
        break;
      case 'w': // Ctrl + Alt + 2
        e.preventDefault();
        highlightSelection('#90caf9'); // azul
        break;
      case 'e': // Ctrl + Alt + 3
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
      const parent = element.parentNode;

      // Coleta e limpa o texto interno
      let rawText = element.textContent;
      let cleanedText = rawText.replace(/[{}:\\/]|c1/gi, '').trim();
      cleanedText = ` ${cleanedText} `;
      // Remove o elemento e reinserta texto limpo
      const textNode = document.createTextNode(cleanedText);
      parent.replaceChild(textNode, element);

      // Remove do armazenamento
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
    const btnWidth = floatingBtns.offsetWidth || 150; // largura estimada se ainda não renderizou
    const margin = 10;

    let calculatedLeft = window.scrollX + rect.left + (rect.width / 2) - (btnWidth / 2);
    
    // Garante que não ultrapasse os limites da página
    calculatedLeft = Math.max(margin, calculatedLeft);
    calculatedLeft = Math.min(window.scrollX + window.innerWidth - btnWidth - margin, calculatedLeft);

    floatingBtns.style.display = 'block';
    floatingBtns.style.left = `${calculatedLeft}px`;
    floatingBtns.style.top = `${window.scrollY + rect.bottom + 5}px`;
  } else {
    floatingBtns.style.display = 'none';
  }
});



  // --- REINSERE AS ANOTAÇÕES SALVAS ---
  reinsertSavedCards();
})();