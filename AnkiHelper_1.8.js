(function () {
    // Verifica se já foi injetado para evitar duplicação
    if (document.getElementById('ankiFloatingBtns') || document.getElementById('ankiMenuContainer')) return;

    // ================= CONFIGURAÇÃO INICIAL =================
    const style = document.createElement('style');
    style.textContent = `
        .anki-marker {
            border-bottom: 2px dashed #ffc107;
            white-space: pre-wrap;  /* Mantém espaços e quebras de linha */
            display: inline;
            padding: 0;
            margin: 0;
            position: relative;     /* Adicionado */
            left: 0;               /* Adicionado */
            box-sizing: content-box; /* Adicionado */
        }
        .anki-cloze {
            background: #b0f0a4;
            border-radius: 3px;
            padding: 2px;
        }
        .anki-marker-deleted {
            border-bottom: 2px dashed #fff;
            white-space: pre-wrap;
            display: inline;
            padding: 0;
            margin: 0;
        }
    `;
    document.head.appendChild(style);
    const defaultPageStorageKey = 'ankiDefaultPage';
    const pageStorageKey = 'ankiCustomizedPage';

    // ================= FUNÇÕES DE PERSISTÊNCIA =================
    function loadCustomizedPage() {
        const savedHTML = localStorage.getItem(pageStorageKey);
        if (savedHTML) {
            // Cria um elemento temporário para parsear o HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = savedHTML;

            // Remove quaisquer elementos do Anki que possam ter sido salvos por engano
            const ankiElements = tempDiv.querySelectorAll('#ankiFloatingBtns, #ankiMenuContainer');
            ankiElements.forEach(el => el.remove());

            // Substitui o conteúdo do body
            document.body.innerHTML = tempDiv.innerHTML;

            // Reaplica os estilos dinâmicos
            reapplyDynamicStyles();
        }
    }

    function loadDefaultPage() {
        const defaultHTML = localStorage.getItem(defaultPageStorageKey);
        if (defaultHTML) {
            // Cria um elemento temporário para parsear o HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = defaultHTML;

            // Remove elementos do Anki que possam existir no template
            const ankiElements = tempDiv.querySelectorAll('#ankiFloatingBtns, #ankiMenuContainer');
            ankiElements.forEach(el => el.remove());

            // Obtém o HTML limpo
            const cleanHTML = tempDiv.innerHTML;

            // 1. Salva como página customizada
            localStorage.setItem(pageStorageKey, cleanHTML);

            // 2. Aplica ao DOM
            document.body.innerHTML = cleanHTML;

            // 3. Reaplica estilos
            reapplyDynamicStyles();
        } else {
            console.warn('Nenhuma página padrão encontrada no localStorage');
        }
    }

    function saveCustomizedPage() {
        // Clona o body para não afetar o DOM atual
        const bodyClone = document.body.cloneNode(true);

        // Remove os elementos de UI do Anki antes de salvar
        const ankiElements = bodyClone.querySelectorAll('#ankiFloatingBtns, #ankiMenuContainer');
        ankiElements.forEach(el => el.remove());

        // Limpa spans vazios ou inválidos
        bodyClone.querySelectorAll('span[data-anki-id]').forEach(span => {
            if (!span.textContent || span.textContent.trim() === '') {
                span.remove();
            }
        });

        // Salva o HTML limpo
        localStorage.setItem(pageStorageKey, bodyClone.innerHTML);
    }

    function saveDefaultPage() {
        // Clona o body para não afetar o DOM atual
        const bodyClone = document.body.cloneNode(true);

        // Remove os elementos de UI do Anki antes de salvar
        const ankiElements = bodyClone.querySelectorAll('#ankiFloatingBtns, #ankiMenuContainer');
        ankiElements.forEach(el => el.remove());

        // Limpa spans vazios ou inválidos
        bodyClone.querySelectorAll('span[data-anki-id]').forEach(span => {
            if (!span.textContent || span.textContent.trim() === '') {
                span.remove();
            }
        });

        // Salva o HTML limpo
        localStorage.setItem(defaultPageStorageKey, bodyClone.innerHTML);
    }

    function cleanupInvalidSpans() {
        document.querySelectorAll('span[data-anki-id]').forEach(span => {
            if (!span.textContent || span.textContent.trim() === '') {
                span.remove();
            }
        });
    }

    function reapplyDynamicStyles() {
        document.querySelectorAll('.anki-marker').forEach(marker => {
            marker.style.borderBottom = '2px dashed #ffc107';
        });
        document.querySelectorAll('.anki-cloze').forEach(cloze => {
            cloze.style.background = '#b0f0a4';
            cloze.style.borderRadius = '3px';
            cloze.style.padding = '2px';
        });
    }

    // ================= FUNÇÕES DE ANOTAÇÃO =================
    function wrapRange(range, type, content, color = null, id = null) {
        const span = document.createElement('span');
        const uniqueId = id || Date.now();
        span.dataset.ankiId = uniqueId;

        if (type === 'lt') {
            span.className = 'anki-marker';
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
        saveCustomizedPage();
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
        const selectedText = sel.toString();
        if (!selectedText) return;

        wrapRange(range.cloneRange(), 'lt', selectedText);
        hideFloatingBtns();
    }

    function insertCloze() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const selectedText = sel.toString();
        if (!selectedText) return;

        // Verifica se a seleção está dentro de um .anki-marker
        let parent = range.commonAncestorContainer;
        if (parent.nodeType !== Node.ELEMENT_NODE) {
            parent = parent.parentElement;
        }

        let isInsideLtMarker = false;
        while (parent && parent !== document.body) {
            if (parent.classList && parent.classList.contains('anki-marker')) {
                isInsideLtMarker = true;
                break;
            }
            parent = parent.parentElement;
        }

        if (!isInsideLtMarker) {
            alert("Ajeita a postura, abre o olho.");
            return;
        }

        wrapRange(range.cloneRange(), 'cloze', selectedText);
        hideFloatingBtns();
    }

    function highlightSelection(color) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const selectedText = sel.toString();
        if (!selectedText) return;

        wrapRange(range.cloneRange(), 'highlight', selectedText, color);
        hideFloatingBtns();
    }

    function removeAnnotation(id) {
        const span = document.querySelector(`[data-anki-id="${id}"]`);
        if (span) {
            span.classList.remove('anki-marker', 'anki-cloze');
            span.classList.add('anki-marker-deleted');
            span.style.backgroundColor = '';
            saveCustomizedPage();
        }
        hideFloatingBtns();
    }

    function hideFloatingBtns() {
        floatingBtns.style.display = 'none';
    }

    // ================= EXPORTAÇÃO =================
    function exportToCSV() {
        const markers = document.querySelectorAll('.anki-marker[data-anki-id]');
        if (!markers.length) {
            alert("Nenhuma anotação para exportar.");
            return;
        }

        const lines = Array.from(markers).map(marker => {
            const clean = marker.textContent
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/"/g, '""')
                .replace(/:/g, ':\n')
                .replace(/;/g, ';\n');
            return `"${clean}"`;
        });

        const uri = "data:text/csv;charset=utf-8,\uFEFF" + lines.join("\n");
        const a = document.createElement("a");
        a.href = encodeURI(uri);
        a.download = "anki_export.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ================= INTERFACE DO USUÁRIO =================
    // --- Botões Flutuantes ---
    const floatingBtns = document.createElement('div');
    floatingBtns.id = 'ankiFloatingBtns';
    floatingBtns.style.cssText = `
        position: absolute;
        z-index: 9999;
        display: none;
        background: #2e2e2e;
        color: #2e2e2e;
        border-radius: 8px;
        padding: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        gap: 6px;
    `;

    const BUTTON_SIZE = 32;
    const buttons = [
        { text: '[...]', action: insertCloze, color: '#b0f0a4' },
        { text: ' ', action: () => highlightSelection('#fcf36d'), color: '#fcf36d' },
        { text: ' ', action: () => highlightSelection('#aff1ff'), color: '#aff1ff' },
        { text: ' ', action: () => highlightSelection('#febdd1'), color: '#febdd1' },
        { text: '★', action: saveSelection, color: '#A1B4FF' }
    ];

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        Object.assign(button.style, {
            margin: '2px',
            padding: '0',
            width: `${BUTTON_SIZE}px`,
            height: `${BUTTON_SIZE}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btn.color,
            color: '#2e2e2e',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            boxSizing: 'border-box',
            fontSize: '16px',
            lineHeight: '1'
        });
        button.addEventListener('click', btn.action);
        floatingBtns.appendChild(button);
    });

    // --- Menu Principal ---
    const menuContainer = document.createElement('div');
    menuContainer.id = 'ankiMenuContainer';
    Object.assign(menuContainer.style, {
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '6px',
        background: '#2e2e2e',
        color: '#e0f2fe',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        zIndex: 10000
    });

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

    const hiddenBtnsContainer = document.createElement('div');
    Object.assign(hiddenBtnsContainer.style, {
        display: 'none',
        flexDirection: 'column',
        gap: '4px'
    });

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
        if (confirm('Apagar tudo?')) {
            loadDefaultPage();
            //location.reload();
        }
    });

    hiddenBtnsContainer.appendChild(staticExportBtn);
    hiddenBtnsContainer.appendChild(staticResetBtn);
    menuContainer.appendChild(toggleBtn);
    menuContainer.appendChild(hiddenBtnsContainer);

    let isOpen = false;
    toggleBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        hiddenBtnsContainer.style.display = isOpen ? 'flex' : 'none';
    });

    // ================= EVENT LISTENERS =================
    document.addEventListener('mouseup', e => {
        const sel = window.getSelection();
        if (sel.toString().trim()) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            const btnWidth = floatingBtns.offsetWidth || 150;
            const margin = 10;

            let left = window.scrollX + rect.left + (rect.width / 2) - (btnWidth / 2);
            left = Math.max(margin, Math.min(window.scrollX + window.innerWidth - btnWidth - margin, left));

            floatingBtns.style.display = 'block';
            floatingBtns.style.left = `${left}px`;
            floatingBtns.style.top = `${window.scrollY + rect.bottom + 5}px`;
        } else {
            floatingBtns.style.display = 'none';
        }
    });

    document.addEventListener('keydown', function (e) {
        if (!e.shiftKey) return;

        switch (e.key.toLowerCase()) {
            case 'd': saveSelection(); e.preventDefault(); break;
            case 'a': insertCloze(); e.preventDefault(); break;
            case 'q': case '¹': highlightSelection('#ffeb3b'); e.preventDefault(); break;
            case 'w': case '²': highlightSelection('#90caf9'); e.preventDefault(); break;
            case 'e': case '³': highlightSelection('#f48fb1'); e.preventDefault(); break;
            case 'x': // Ctrl + Alt + X - Marcar anotação como deletada
                e.preventDefault();
                const sel = window.getSelection();
                if (sel.rangeCount === 0) return;

                const range = sel.getRangeAt(0);
                let node = range.commonAncestorContainer;

                let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                while (element && element !== document.body) {
                    if (element.dataset.ankiId) {
                        const annotationId = element.dataset.ankiId;

                        // Limpa marcação {{c1::...}}
                        const originalText = element.textContent;
                        const cleanedText = originalText.replace(/\{\{c1::/gi, '').replace(/\}\}/g, '');
                        element.textContent = cleanedText;

                        // Troca classe de anki-marker para anki-marker-deleted
                        element.classList.remove('anki-marker', 'anki-cloze');
                        element.classList.add('anki-marker-deleted');

                        // Remove estilos de highlight
                        element.style.backgroundColor = '';

                        // Salva as alterações na página
                        saveCustomizedPage();
                        break;
                    }
                    element = element.parentElement;
                }
                break;
        }
    });

    window.addEventListener('beforeunload', saveCustomizedPage);

    // ================= INICIALIZAÇÃO =================
    // 1. Primeiro carrega o conteúdo salvo
    saveDefaultPage();
    loadCustomizedPage();

    // 2. Depois adiciona os elementos de UI
    document.body.appendChild(floatingBtns);
    document.body.appendChild(menuContainer);
})();