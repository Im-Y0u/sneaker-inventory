/* =========================================================
   Sneaker Inventory v2 — faster data loading + modern UI
   Key improvements over v1:
   1. Zero external libraries (PapaParse, FontAwesome, Google Fonts removed)
   2. Stale-while-revalidate: instant render from localStorage cache,
      then a background refresh from the Google Sheet
   3. Inline CSV parser (no CDN round-trip)
   4. Native lazy-loaded images with fallback chain
   ========================================================= */

document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    /* ---------- Sheet URL (assembled, same published CSV as v1) ---------- */
    const SHEET_URL = [
        'https://', 'docs.google.com', '/spreadsheets',
        '/d/e/2PACX-1vTo2OTo7z73stGi8MjrUjKEDhgZmk_eIzAral-e4izDyjDbjSJO7vTeg4LXlrwPncotNCth4lFh6YaF',
        '/pub?gid=1204797675&single=true&output=csv'
    ].join('');

    const CACHE_KEY = 'si_inventory_cache_v2';
    const FETCH_TIMEOUT = 12000;
    const MAX_ATTEMPTS = 3;

    /* ---------- Translations ---------- */
    const translations = {
        en: {
            searchPlaceholder: 'Search by name or SKU...',
            sortDefault: 'Default',
            sortLowHigh: 'Low-High',
            sortHighLow: 'High-Low',
            filterSize: 'Filter by Size',
            footwear: 'EU Footwear',
            clothing: 'Clothing',
            availableSizes: 'Available sizes:',
            noResults: 'No matching sneakers found',
            error: 'Error loading inventory. Please try again later and contact the owner.',
            retry: 'Retry',
            reset: 'Reset Filters',
            itemsOne: '1 item',
            itemsMany: '{n} items',
            shippingNote: 'Prices do not include shipping costs',
            feeNote: 'Prices shown include a 4% fee (minimum \u20ac5 increase)',
            noImage: 'No image'
        },
        pt: {
            searchPlaceholder: 'Pesquisar por nome ou SKU...',
            sortDefault: 'Padr\u00e3o',
            sortLowHigh: 'Menor-Maior',
            sortHighLow: 'Maior-Menor',
            filterSize: 'Filtrar por Tamanho',
            footwear: 'Cal\u00e7ado EU',
            clothing: 'Roupa',
            availableSizes: 'Tamanhos dispon\u00edveis:',
            noResults: 'Nenhum t\u00eanis encontrado',
            error: 'Erro ao carregar estoque. Por favor tente novamente mais tarde e contacte o dono.',
            retry: 'Tentar novamente',
            reset: 'Redefinir Filtros',
            itemsOne: '1 artigo',
            itemsMany: '{n} artigos',
            shippingNote: 'Pre\u00e7os n\u00e3o incluem custos de envio',
            feeNote: 'Pre\u00e7os apresentados incluem taxa de 4% (m\u00ednimo de \u20ac5)',
            noImage: 'Sem imagem'
        }
    };

    /* ---------- State ---------- */
    let currentLanguage = 'en';
    let allShoes = [];
    let selectedSizes = [];
    let currentSort = 'default';
    let currentFilteredShoes = null;
    let pendingRefresh = false;

    const SVG_PLACEHOLDER =
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">` +
            `<rect width="300" height="200" fill="#ece3d0"/>` +
            `<path d="M120 130c0-8 6-12 16-16 8-4 12-8 16-16 4 12 18 16 32 18 12 2 24 4 24 14v8H120z" fill="#c4b394"/>` +
            `<rect x="120" y="138" width="88" height="6" rx="3" fill="#c05e2a"/>` +
            `</svg>`
        );

    const $ = (sel) => document.querySelector(sel);
    const els = {
        search: $('#search'),
        loading: $('#loading'),
        grid: $('#shoe-grid'),
        noResults: $('#no-results'),
        errorState: $('#error-state'),
        errorMessage: $('#error-message'),
        retryBtn: $('#retry-btn'),
        resetBtn: $('#reset-filters'),
        sizeToggle: $('#size-filter-toggle'),
        sizePanel: $('#size-filter-panel'),
        panelTitle: $('.panel-title'),
        filterCount: $('#filter-count'),
        selectedSizes: $('#selected-sizes'),
        resultsCount: $('#results-count'),
        lightbox: $('#lightbox'),
        lightboxImg: $('#lightbox-img'),
        lightboxCaption: $('.lightbox-caption'),
        lightboxStage: $('.lightbox-stage'),
        lightboxClose: $('.lightbox-close')
    };

    /* =========================================================
       DATA LOADING — stale-while-revalidate
       ========================================================= */

    function init() {
        $('#year').textContent = new Date().getFullYear();
        setLanguage(savedLanguage(), false);
        setupEventListeners();

        // On mobile the size panel becomes a fixed bottom sheet. It must live
        // outside the header, because the header's backdrop-filter would
        // otherwise become the containing block for position:fixed.
        syncPanelParent();

        // 1) Instant paint from cache (if any)
        const cached = readCache();
        if (cached && cached.csv) {
            const ok = applyData(cached.csv);
            els.loading.style.display = 'none';
            if (ok) pendingRefresh = true;
        }

        // 2) Background refresh from the sheet
        refreshFromSheet();
    }

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function writeCache(csvText) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), csv: csvText }));
        } catch (e) { /* storage full or unavailable — ignore */ }
    }

    async function refreshFromSheet() {
        let success = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !success; attempt++) {
            try {
                const csvText = await fetchSheet();
                if (!pendingRefresh || csvText !== readCache()?.csv) {
                    writeCache(csvText);
                    applyData(csvText);
                }
                success = true;
            } catch (err) {
                console.warn(`Sheet fetch attempt ${attempt} failed:`, err);
                if (attempt < MAX_ATTEMPTS) {
                    await new Promise(r => setTimeout(r, 600 * attempt));
                }
            }
        }

        if (!success && !readCache()) {
            showError(); // no cache to fall back on
        }
        els.loading.style.display = 'none';
        pendingRefresh = false;
    }

    function fetchSheet() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        return fetch(SHEET_URL, { cache: 'no-cache', signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .finally(() => clearTimeout(timer));
    }

    /* =========================================================
       PARSING & GROUPING (same rules as v1)
       ========================================================= */

    function applyData(csvText) {
        try {
            const rows = parseCSV(csvText);
            const filtered = rows.filter(row => {
                if (!row.notes) return true;
                const note = row.notes.toLowerCase();
                return !note.includes('consign') && !note.includes('hold') && !note.includes('hide');
            });
            allShoes = groupShoes(filtered);
            if (allShoes.length === 0) return false;
            currentFilteredShoes = null;
            render();
            return true;
        } catch (e) {
            console.error('Failed to parse sheet data:', e);
            return false;
        }
    }

    // Minimal RFC-4180 style CSV parser (handles quoted fields, commas and newlines)
    function parseCSV(text) {
        const rows = [];
        let row = [], field = '', inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inQuotes) {
                if (c === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else field += c;
            } else if (c === '"') {
                inQuotes = true;
            } else if (c === ',') {
                row.push(field.trim()); field = '';
            } else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(field.trim()); field = '';
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
            } else field += c;
        }
        row.push(field.trim());
        if (row.length > 1 || row[0] !== '') rows.push(row);
        if (rows.length === 0) return [];

        const headers = rows[0];
        return rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
            return obj;
        });
    }

    function groupShoes(items) {
        const grouped = {};
        items.forEach(item => {
            if (!item.Name || !item.Size) return;
            const groupKey = (item.SKU && item.SKU !== '-')
                ? `${item.Name}|${item.SKU}`
                : item.Name;

            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    name: item.Name,
                    sku: item.SKU || '-',
                    image: imageUrls(item.image_url),
                    price: formatPrice(item['Price + ship']),
                    sizes: []
                };
            }

            const size = String(item.Size).trim();
            const existing = grouped[groupKey].sizes.find(s => s.size === size);
            if (existing) existing.quantity += 1;
            else grouped[groupKey].sizes.push({ size: size, quantity: 1 });
        });
        return Object.values(grouped);
    }

    function formatPrice(price) {
        if (!price) return 'N/A';
        price = String(price).trim();
        if (price.includes(',')) {
            return '\u20ac' + price.replace(',', '.').replace(/\s*\u20ac/, '');
        }
        return price;
    }

    function priceValue(priceStr) {
        if (!priceStr || priceStr === 'N/A') return 0;
        const m = String(priceStr).replace(',', '.').match(/\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : 0;
    }

    /* ---------- Images: fast URLs + fallback chain ---------- */

    function imageUrls(url) {
        if (!url) return { primary: SVG_PLACEHOLDER, fallback: null };
        url = String(url).trim();

        // Google Drive: use the thumbnail endpoint (much faster than /uc?export=view)
        if (url.includes('drive.google.com')) {
            const fileMatch = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
            if (fileMatch) {
                return {
                    primary: `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w600`,
                    fallback: url.replace('/view?usp=sharing', '/uc?export=view')
                };
            }
            return { primary: url.replace('/view?usp=sharing', '/uc?export=view'), fallback: null };
        }
        return { primary: url, fallback: null };
    }

    function attachImage(imgEl, urls, name) {
        imgEl.src = urls.primary;
        imgEl.alt = name;
        imgEl.loading = 'lazy';
        imgEl.decoding = 'async';
        let stage = 0;
        imgEl.addEventListener('error', function () {
            stage++;
            if (stage === 1 && urls.fallback) this.src = urls.fallback;
            else { this.classList.add('is-error'); this.parentElement.style.background = `no-repeat center/56px 40px url("${SVG_PLACEHOLDER}")`; }
        });
    }

    /* =========================================================
       RENDERING
       ========================================================= */

    function render() {
        const list = sortedList(currentFilteredShoes || [...allShoes]);
        displayShoes(list);
        updateResultsCount(list.length);
    }

    function sortedList(source) {
        const list = [...source];
        if (currentSort === 'price-asc') list.sort((a, b) => priceValue(a.price) - priceValue(b.price));
        if (currentSort === 'price-desc') list.sort((a, b) => priceValue(b.price) - priceValue(a.price));
        return list;
    }

    function displayShoes(shoes) {
        els.grid.innerHTML = '';
        els.noResults.hidden = shoes.length > 0;

        if (shoes.length === 0) return;

        const frag = document.createDocumentFragment();

        shoes.forEach((shoe, idx) => {
            const card = document.createElement('div');
            card.className = 'shoe-card';
            card.style.animationDelay = `${Math.min(idx * 30, 300)}ms`;

            const imgContainer = document.createElement('div');
            imgContainer.className = 'shoe-image-container';
            const img = document.createElement('img');
            img.className = 'shoe-image';
            attachImage(img, shoe.image, shoe.name);
            imgContainer.appendChild(img);

            const info = document.createElement('div');
            info.className = 'shoe-info';
            info.innerHTML =
                `<h2>${escapeHtml(shoe.name)}</h2>` +
                `<p class="shoe-sku">SKU: ${escapeHtml(shoe.sku)}</p>` +
                `<div class="price">${escapeHtml(shoe.price)}</div>` +
                `<div class="sizes-container">` +
                `<span class="sizes-label">${t('availableSizes')}</span>` +
                shoe.sizes.map(s =>
                    `<span class="size-badge">${escapeHtml(s.size)}` +
                    (s.quantity > 1 ? ` <span class="size-quantity">(${s.quantity})</span>` : '') +
                    `</span>`
                ).join('') +
                `</div>`;

            card.appendChild(imgContainer);
            card.appendChild(info);
            frag.appendChild(card);

            imgContainer.addEventListener('click', () => openLightbox(shoe));
        });

        els.grid.appendChild(frag);
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function updateResultsCount(n) {
        if (n === allShoes.length && selectedSizes.length === 0 && !els.search.value) {
            els.resultsCount.hidden = true;
            return;
        }
        els.resultsCount.hidden = false;
        els.resultsCount.textContent = t(n === 1 ? 'itemsOne' : 'itemsMany').replace('{n}', n);
    }

    function showError() {
        els.loading.style.display = 'none';
        els.errorState.hidden = false;
        els.errorMessage.textContent = t('error');
        els.retryBtn.textContent = t('retry');
    }

    /* =========================================================
       FILTERING & SORTING
       ========================================================= */

    // Normalize sizes: "40,5" → "40.5"; keep fractions ("42 2/3") intact
    const normalizeSize = (s) => String(s).replace(/,/g, '.').trim().toLowerCase();

    function sizeMatches(filterSize, itemSize) {
        const f = normalizeSize(filterSize);
        const s = normalizeSize(itemSize);
        if (f === s) return true; // exact (covers XS, "-", "42 2/3", ...)
        // Improvements over v1: "38 (DMG Box 65\u20ac)" still matches filter "38"
        if (/\d/.test(f) && !f.includes('/') && !s.includes('/')) {
            const prefix = s.match(/^(\d+(?:\.\d+)?)(?=\s|\(|$)/);
            return prefix && prefix[1] === f;
        }
        return false;
    }

    function filterShoes() {
        const term = els.search.value.toLowerCase().trim();
        currentFilteredShoes = allShoes.filter(shoe => {
            const matchesSearch = !term ||
                shoe.name.toLowerCase().includes(term) ||
                shoe.sku.toLowerCase().includes(term);
            const matchesSize = selectedSizes.length === 0 ||
                selectedSizes.some(sel => shoe.sizes.some(sz => sizeMatches(sel, sz.size)));
            return matchesSearch && matchesSize;
        });
        render();
    }

    function setSort(sortType) {
        currentSort = sortType;
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(sortType === 'default' ? 'sort-default'
            : sortType === 'price-asc' ? 'sort-price-asc' : 'sort-price-desc').classList.add('active');
        render();
    }

    function toggleSize(size) {
        selectedSizes = selectedSizes.includes(size)
            ? selectedSizes.filter(s => s !== size)
            : [...selectedSizes, size];
        updateSizeUI();
        filterShoes();
    }

    function updateSizeUI() {
        document.querySelectorAll('.size-option').forEach(opt => {
            opt.classList.toggle('selected', selectedSizes.includes(opt.dataset.size));
        });
        els.filterCount.hidden = selectedSizes.length === 0;
        els.filterCount.textContent = selectedSizes.length;
        els.sizeToggle.classList.toggle('active', selectedSizes.length > 0);

        els.selectedSizes.innerHTML = '';
        selectedSizes.forEach(size => {
            const chip = document.createElement('div');
            chip.className = 'size-chip';
            chip.innerHTML = `${escapeHtml(size)}<button type="button" aria-label="Remove ${escapeHtml(size)}">&times;</button>`;
            chip.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSize(size);
            });
            els.selectedSizes.appendChild(chip);
        });
    }

    function resetFilters() {
        els.search.value = '';
        selectedSizes = [];
        currentFilteredShoes = null;
        updateSizeUI();
        setSort('default');
    }

    /* =========================================================
       LIGHTBOX (click zoom + drag pan)
       ========================================================= */

    let scale = 1;

    function openLightbox(shoe) {
        els.lightboxImg.alt = shoe.name;
        els.lightboxCaption.textContent = `${shoe.name} — ${shoe.price}`;
        scale = 1;
        els.lightboxStage.classList.remove('zoomed');
        els.lightboxImg.style.transform = '';
        // use the already-loaded card image for an instant open
        els.lightboxImg.src = shoe.image.primary;
        els.lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        els.lightbox.hidden = true;
        document.body.style.overflow = '';
    }

    /* =========================================================
       LANGUAGE
       ========================================================= */

    function savedLanguage() {
        const saved = localStorage.getItem('si_lang');
        if (saved === 'en' || saved === 'pt') return saved;
        return (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
    }

    function setLanguage(lang, rerender = true) {
        currentLanguage = lang;
        localStorage.setItem('si_lang', lang);

        els.search.placeholder = t('searchPlaceholder');
        $('#sort-default').textContent = t('sortDefault');
        $('#sort-price-asc').lastChild.textContent = ` ${t('sortLowHigh')}`;
        $('#sort-price-desc').lastChild.textContent = ` ${t('sortHighLow')}`;
        els.sizeToggle.querySelector('span').textContent = t('filterSize');
        els.panelTitle.textContent = t('filterSize');
        const sizeGroupTitles = els.sizePanel.querySelectorAll('.size-group h4');
        sizeGroupTitles[0].textContent = t('footwear');
        sizeGroupTitles[1].textContent = t('clothing');
        els.noResults.querySelector('p').textContent = t('noResults');
        els.resetBtn.textContent = t('reset');
        if (!els.errorState.hidden) {
            els.errorMessage.textContent = t('error');
            els.retryBtn.textContent = t('retry');
        }
        const footerPs = document.querySelectorAll('.site-footer p');
        footerPs[1].textContent = t('shippingNote');
        footerPs[2].innerHTML = t('feeNote');

        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`lang-${lang}`).classList.add('active');

        if (rerender && allShoes.length > 0) render();
    }

    function t(key) { return translations[currentLanguage][key]; }

    /* =========================================================
       EVENT LISTENERS
       ========================================================= */

    function setupEventListeners() {
        els.search.addEventListener('input', filterShoes);
        els.resetBtn.addEventListener('click', resetFilters);
        els.retryBtn.addEventListener('click', () => {
            els.errorState.hidden = true;
            els.loading.style.display = '';
            refreshFromSheet();
        });

        els.sizeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = els.sizePanel.classList.toggle('show');
            els.sizeToggle.setAttribute('aria-expanded', open);
        });
        document.addEventListener('click', () => els.sizePanel.classList.remove('show'));
        els.sizePanel.addEventListener('click', (e) => e.stopPropagation());

        document.querySelectorAll('.size-option').forEach(opt => {
            opt.addEventListener('click', () => toggleSize(opt.dataset.size));
        });

        document.getElementById('sort-default').addEventListener('click', () => setSort('default'));
        document.getElementById('sort-price-asc').addEventListener('click', () => setSort('price-asc'));
        document.getElementById('sort-price-desc').addEventListener('click', () => setSort('price-desc'));

        $('#lang-en').addEventListener('click', () => setLanguage('en'));
        $('#lang-pt').addEventListener('click', () => setLanguage('pt'));

        // Lightbox
        els.lightboxClose.addEventListener('click', closeLightbox);
        els.lightbox.addEventListener('click', (e) => { if (e.target === els.lightbox) closeLightbox(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.lightbox.hidden) closeLightbox(); });

        els.lightboxStage.addEventListener('click', (e) => {
            e.stopPropagation();
            scale = scale === 1 ? 2 : 1;
            els.lightboxStage.classList.toggle('zoomed', scale > 1);
            els.lightboxImg.style.transform = scale > 1 ? 'scale(2)' : '';
            if (scale === 1) els.lightboxImg.style.translate = '0 0';
        });

        // Drag to pan when zoomed (pointer events = mouse + touch)
        let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
        els.lightboxStage.addEventListener('pointerdown', (e) => {
            if (scale === 1) return;
            dragging = true;
            startX = e.clientX; startY = e.clientY;
            baseX = parseFloat(els.lightboxImg.style.translateX) || 0;
            baseY = parseFloat(els.lightboxImg.style.translateY) || 0;
            els.lightboxStage.classList.add('grabbing');
            try { els.lightboxStage.setPointerCapture(e.pointerId); } catch (err) {}
        });
        els.lightboxStage.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            e.preventDefault();
            els.lightboxImg.style.translate = `${baseX + e.clientX - startX}px ${baseY + e.clientY - startY}px`;
        });
        const endDrag = () => {
            dragging = false;
            els.lightboxStage.classList.remove('grabbing');
        };
        els.lightboxStage.addEventListener('pointerup', endDrag);
        els.lightboxStage.addEventListener('pointercancel', endDrag);
    }

    /* ---------- Mobile: keep the size sheet outside the header ---------- */
    const mqMobile = window.matchMedia('(max-width: 640px)');
    function syncPanelParent() {
        if (mqMobile.matches) {
            document.body.appendChild(els.sizePanel);        // bottom sheet
        } else {
            document.querySelector('.size-filter-container').appendChild(els.sizePanel); // dropdown
        }
    }
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncPanelParent);

    /* ---------- Start ---------- */
    init();
});
