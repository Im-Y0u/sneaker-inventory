document.addEventListener('DOMContentLoaded', function() {
    // Translation object
    const translations = {
        en: {
            title: "BOAS SHOP",
            searchPlaceholder: "Search by name...",
            sortDefault: "Default",
            sortLowHigh: "Low-High",
            sortHighLow: "High-Low",
            filterSize: "Filter by Size",
            availableSizes: "Available Sizes:",
            noResults: "No matching sneakers found",
            loading: "Loading inventory...",
            error: "Error loading inventory. Please try again later and contact the owner",
            retry: "Retry",
            reset: "Reset Filters",
            footer: "Boas Shop - Sneaker Inventory",
            priceNote: "Prices do not include the €5 shipping increase"
        },
        pt: {
            title: "BOAS SHOP",
            searchPlaceholder: "Pesquisar pelo nome...",
            sortDefault: "Padrão",
            sortLowHigh: "Menor-Maior",
            sortHighLow: "Maior-Menor",
            filterSize: "Filtrar por Tamanho",
            availableSizes: "Tamanhos Disponíveis:",
            noResults: "Nenhum tênis encontrado",
            loading: "Carregando estoque...",
            error: "Erro ao carregar estoque. Por favor tente novamente mais tarde e contacte o dono.",
            retry: "Tentar novamente",
            reset: "Redefinir Filtros",
            footer: "Boas Shop - Sneaker Inventory",
            priceNote: "Preços não incluem o preço do envio que é €5"
        }
    };

    let currentLanguage = 'en';
    
    // Obfuscated URL components (same as original)
    const urlParts = {
        protocol: [0x68, 0x74, 0x74, 0x70, 0x73, 0x3a, 0x2f, 0x2f],
        domain: [100, 111, 99, 115, 46, 103, 111, 111, 103, 108, 101, 46, 99, 111, 109],
        path: [47, 115, 112, 114, 101, 97, 100, 115, 104, 101, 101, 116, 115],
        getId: function() {
            return '/d/e/2PACX-1vTo2OTo7z73stGi8MjrUjKEDhgZmk_eIzAral-e4izDyjDbjSJO7vTeg4LXlrwPncotNCth4lFh6YaF/pub?gid=1204797675&single=true&output=csv';
        },
        getFullUrl: function() {
            return [
                String.fromCharCode(...this.protocol),
                String.fromCharCode(...this.domain),
                String.fromCharCode(...this.path),
                this.getId()
            ].join('');
        }
    };

    let allShoes = [];
    let selectedSizes = [];
    let currentSort = 'default';
    let currentFilteredShoes = null;

    // Initialize the app
    function init() {
        document.getElementById('year').textContent = new Date().getFullYear();
        
        // Detect user language
        const userLang = navigator.language || navigator.userLanguage;
        if (userLang.startsWith('pt')) {
            switchLanguage('pt');
        } else {
            switchLanguage('en');
        }
        
        setupEventListeners();
        loadDataWithRetry(3);
    }

    function switchLanguage(lang) {
        currentLanguage = lang;
        
        // Update UI elements
        document.querySelector('h1').textContent = translations[lang].title;
        document.getElementById('search').placeholder = translations[lang].searchPlaceholder;
        document.getElementById('sort-default').innerHTML = `<i class="fas fa-bars"></i> ${translations[lang].sortDefault}`;
        document.getElementById('sort-price-asc').innerHTML = `<i class="fas fa-sort-amount-up"></i> ${translations[lang].sortLowHigh}`;
        document.getElementById('sort-price-desc').innerHTML = `<i class="fas fa-sort-amount-down"></i> ${translations[lang].sortHighLow}`;
        document.getElementById('size-filter-toggle').innerHTML = `<i class="fas fa-filter"></i> ${translations[lang].filterSize}`;
        document.querySelector('#no-results p').textContent = translations[lang].noResults;
        document.getElementById('reset-filters').textContent = translations[lang].reset;
        document.querySelector('footer p').innerHTML = `© <span id="year"></span> ${translations[lang].footer}`;
        document.querySelector('.price-note').textContent = translations[lang].priceNote;
        
        // Update active button
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`lang-${lang}`).classList.add('active');
        
        // Update loading/error messages if they're visible
        const loadingEl = document.getElementById('loading');
        if (loadingEl.style.display !== 'none') {
            loadingEl.innerHTML = `
                <div class="spinner"></div>
                ${translations[lang].loading}
            `;
        }
        
        // Update shoe cards (size labels)
        if (allShoes.length > 0) {
            sortShoes(currentSort);
        }
    }

    // Enhanced data loader with retries
    async function loadDataWithRetry(maxAttempts) {
        let attempt = 0;
        let success = false;

        while (attempt < maxAttempts && !success) {
            attempt++;
            try {
                await loadData();
                success = true;
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                if (attempt >= maxAttempts) {
                    showError();
                }
            }
        }
    }

    async function loadData() {
        const url = urlParts.getFullUrl();
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const csvData = await response.text();
        const parsedData = await parseData(csvData);
        const filteredData = filterData(parsedData);
        
        allShoes = groupShoesBySKU(filteredData);
        processData();
    }

    // Multiple parsing strategies
    async function parseData(csvData) {
        // Try Papa Parse first
        try {
            const result = Papa.parse(csvData, {
                header: true,
                skipEmptyLines: true,
                transform: value => value ? value.trim() : ''
            });
            if (result.data.length > 0) return result.data;
        } catch (e) {
            console.warn("Papa Parse failed, trying alternative:", e);
        }

        // Fallback to manual parsing
        return parseCSVManually(csvData);
    }

    function parseCSVManually(csvData) {
        const lines = csvData.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, i) => {
                obj[header] = values[i] ? values[i].trim() : '';
                return obj;
            }, {});
        });
    }

    function filterData(data) {
        return data.filter(item => {
            if (!item.notes) return true;
            const note = item.notes.toLowerCase();
            return !note.includes('consign') && 
                   !note.includes('hold') && 
                   !note.includes('hide');
        });
    }

    // Helper function to match sizes with both . and ,
    function matchSizes(filterSize, itemSize) {
        // Convert both sizes to strings and normalize
        const normalize = (size) => String(size).replace(/,/g, '.').trim().toLowerCase();
        
        // Exact match
        if (normalize(filterSize) === normalize(itemSize)) return true;
        
        // Match equivalent . and , versions
        if (normalize(filterSize).replace('.', ',') === normalize(itemSize)) return true;
        if (normalize(filterSize) === normalize(itemSize).replace('.', ',')) return true;
        
        return false;
    }

    function groupShoesBySKU(shoes) {
        const grouped = {};
        
        shoes.forEach(shoe => {
            if (!shoe.Name || !shoe.Size) return;
            
            const groupKey = (shoe.SKU && shoe.SKU !== '-') 
                ? `${shoe.Name}|${shoe.SKU}`
                : shoe.Name;
            
            const originalSize = shoe.Size.toString();
            
            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    name: shoe.Name,
                    sku: shoe.SKU || '-',
                    image: getValidImageUrl(shoe.image_url),
                    price: adjustPrice(shoe['Price + ship']), // Use adjustPrice instead of formatPrice
                    sizes: []
                };
            }
            
            const existingSize = grouped[groupKey].sizes.find(s => 
                matchSizes(s.size, originalSize)
            );
            
            if (existingSize) {
                existingSize.quantity += 1;
            } else {
                grouped[groupKey].sizes.push({
                    size: originalSize,
                    quantity: 1
                });
            }
        });
        
        return Object.values(grouped);
    }

    // Adjust price with 4% fee and minimum €5 increase
    function adjustPrice(price) {
        if (!price) return 'N/A';
        
        // Parse the original price
        let originalPrice;
        if (price.includes(',')) {
            originalPrice = parseFloat(price.replace(',', '.').replace(' €', ''));
        } else {
            originalPrice = parseFloat(price.replace(' €', ''));
        }
        
        if (isNaN(originalPrice)) return 'N/A';
        
        // Calculate adjusted price
        let adjustedPrice = originalPrice * 1.04; // 4% fee
        const priceIncrease = adjustedPrice - originalPrice;
        
        // Ensure minimum €5 increase
        if (priceIncrease < 5) {
            adjustedPrice = originalPrice + 5;
        }
        
        // Round to nearest whole number
        adjustedPrice = Math.round(adjustedPrice);
        
        return `€${adjustedPrice}`;
    }

    function getValidImageUrl(url) {
        if (!url) return 'https://via.placeholder.com/300x200?text=No+Image';
        if (url.includes('drive.google.com')) {
            return url.replace('/view?usp=sharing', '/uc?export=view');
        }
        return url;
    }

    function processData() {
        currentFilteredShoes = null;
        sortShoes(currentSort);
        document.getElementById('loading').style.display = 'none';
    }

    function displayShoes(shoes) {
        const shoeGrid = document.getElementById('shoe-grid');
        shoeGrid.innerHTML = '';
        
        if (shoes.length === 0) {
            document.getElementById('no-results').style.display = 'flex';
            return;
        }
        
        document.getElementById('no-results').style.display = 'none';
        
        shoes.forEach(shoe => {
            const shoeCard = document.createElement('div');
            shoeCard.className = 'shoe-card';
            shoeCard.innerHTML = `
                <div class="shoe-image-container">
                    <img src="${shoe.image}" alt="${shoe.name}" class="shoe-image" 
                        onerror="this.src='https://via.placeholder.com/300x200?text=Image+Not+Available'">
                </div>
                <div class="shoe-info">
                    <h2>${shoe.name}</h2>
                    <p>SKU: ${shoe.sku}</p>
                    <div class="price">${shoe.price}</div>
                    <div class="sizes-container">
                        <p>${translations[currentLanguage].availableSizes}</p>
                        ${shoe.sizes.map(size => `
                            <span class="size-badge">
                                ${size.size}
                                <span class="size-quantity">(${size.quantity})</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
            shoeGrid.appendChild(shoeCard);
            
            shoeCard.querySelector('.shoe-image').addEventListener('click', function() {
                const lightbox = document.getElementById('lightbox');
                const lightboxImg = document.getElementById('lightbox-img');
                const caption = document.querySelector('.lightbox-caption');
                
                lightbox.style.display = 'block';
                lightboxImg.src = this.src;
                lightboxImg.classList.remove('zoomed');
                caption.textContent = this.alt;
            });
        });
    }

    function closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        lightbox.style.display = 'none';
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
    }

    function sortShoes(sortType) {
        currentSort = sortType;
        const shoesToSort = currentFilteredShoes || [...allShoes];
        let sortedShoes = [...shoesToSort];
        
        switch(sortType) {
            case 'price-asc':
                sortedShoes.sort((a, b) => extractPrice(a.price) - extractPrice(b.price));
                break;
            case 'price-desc':
                sortedShoes.sort((a, b) => extractPrice(b.price) - extractPrice(a.price));
                break;
            default:
                sortedShoes = currentFilteredShoes ? [...currentFilteredShoes] : [...allShoes];
        }
        
        updateActiveSortButton(sortType);
        displayShoes(sortedShoes);
    }

    function extractPrice(priceStr) {
        if (!priceStr || priceStr === 'N/A') return 0;
        const num = priceStr.replace(/[^\d.]/g, '');
        return parseFloat(num) || 0;
    }

    function updateActiveSortButton(sortType) {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        let activeBtnId = 'sort-default';
        if (sortType === 'price-asc') activeBtnId = 'sort-price-asc';
        if (sortType === 'price-desc') activeBtnId = 'sort-price-desc';
        
        document.getElementById(activeBtnId).classList.add('active');
    }

    function setupEventListeners() {
        document.getElementById('search').addEventListener('input', filterShoes);
        document.getElementById('reset-filters').addEventListener('click', resetFilters);
        document.getElementById('size-filter-toggle').addEventListener('click', function(e) {
            e.stopPropagation();
            document.getElementById('size-filter-panel').classList.toggle('show');
        });
        
        // Language switchers
        document.getElementById('lang-en').addEventListener('click', () => switchLanguage('en'));
        document.getElementById('lang-pt').addEventListener('click', () => switchLanguage('pt'));

        // Lightbox functionality
        document.querySelector('.close-btn').addEventListener('click', function() {
            document.getElementById('lightbox').style.display = 'none';
        });

        document.getElementById('lightbox').addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });

        // Add zoom functionality
        document.getElementById('lightbox-img').addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('zoomed');
            
            if (this.classList.contains('zoomed')) {
                this.style.cursor = 'grab';
                this.addEventListener('mousedown', startDrag);
            } else {
                this.style.cursor = 'zoom-in';
                this.removeEventListener('mousedown', startDrag);
            }
        });

        // Drag functionality for zoomed image
        let isDragging = false;
        let startX, startY, scrollLeft, scrollTop;

        function startDrag(e) {
            isDragging = true;
            const img = e.target;
            startX = e.pageX - img.offsetLeft;
            startY = e.pageY - img.offsetTop;
            scrollLeft = img.scrollLeft;
            scrollTop = img.scrollTop;
            
            img.style.cursor = 'grabbing';
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();
            const img = document.getElementById('lightbox-img');
            const x = e.pageX - img.offsetLeft;
            const y = e.pageY - img.offsetTop;
            const walkX = (x - startX) * 2;
            const walkY = (y - startY) * 2;
            
            img.scrollLeft = scrollLeft - walkX;
            img.scrollTop = scrollTop - walkY;
        }

        function stopDrag() {
            isDragging = false;
            const img = document.getElementById('lightbox-img');
            img.style.cursor = 'grab';
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }

        document.querySelectorAll('.size-option').forEach(option => {
            option.addEventListener('click', function() {
                const size = this.getAttribute('data-size');
                if (selectedSizes.includes(size)) {
                    selectedSizes = selectedSizes.filter(s => s !== size);
                } else {
                    selectedSizes.push(size);
                }
                updateSizeOptions();
                filterShoes();
            });
        });
        
        document.getElementById('sort-default').addEventListener('click', () => sortShoes('default'));
        document.getElementById('sort-price-asc').addEventListener('click', () => sortShoes('price-asc'));
        document.getElementById('sort-price-desc').addEventListener('click', () => sortShoes('price-desc'));
        
        document.addEventListener('click', function() {
            document.getElementById('size-filter-panel').classList.remove('show');
        });
        
        document.getElementById('size-filter-panel').addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    function filterShoes() {
        const searchTerm = document.getElementById('search').value.toLowerCase();
        
        currentFilteredShoes = allShoes.filter(shoe => {
            const matchesSearch = shoe.name.toLowerCase().includes(searchTerm) || 
                               shoe.sku.toLowerCase().includes(searchTerm);
            
            const matchesSize = selectedSizes.length === 0 || 
                             selectedSizes.some(selectedSize => 
                                 shoe.sizes.some(size => 
                                     matchSizes(selectedSize, size.size))
                                 );
            
            return matchesSearch && matchesSize;
        });
        
        sortShoes(currentSort);
    }

    function updateSizeOptions() {
        document.querySelectorAll('.size-option').forEach(option => {
            const size = option.getAttribute('data-size');
            option.classList.toggle('selected', selectedSizes.includes(size));
        });
        updateSelectedSizesDisplay();
    }

    function updateSelectedSizesDisplay() {
        const container = document.getElementById('selected-sizes');
        container.innerHTML = '';
        
        selectedSizes.forEach(size => {
            const chip = document.createElement('div');
            chip.className = 'size-chip';
            chip.innerHTML = `
                ${size}
                <button data-size="${size}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(chip);
        });
        
        container.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const sizeToRemove = this.getAttribute('data-size');
                selectedSizes = selectedSizes.filter(s => s !== sizeToRemove);
                updateSizeOptions();
                filterShoes();
            });
        });
    }

    function resetFilters() {
        document.getElementById('search').value = '';
        selectedSizes = [];
        currentFilteredShoes = null;
        updateSizeOptions();
        sortShoes('default');
    }

    function showError() {
        document.getElementById('loading').innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error loading inventory. Please try again later.</p>
            <button onclick="window.location.reload()">Retry</button>
        `;
    }

    document.addEventListener("DOMContentLoaded", function () {
        const filterToggleBtn = document.querySelector(".filter-toggle-btn");
        const sizeFilterPanel = document.getElementById("size-filter-panel");
    
        if (filterToggleBtn && sizeFilterPanel) {
            filterToggleBtn.addEventListener("click", function () {
                sizeFilterPanel.classList.toggle("show");
            });
    
            // Fecha o painel ao clicar fora dele
            document.addEventListener("click", function (event) {
                if (!sizeFilterPanel.contains(event.target) && !filterToggleBtn.contains(event.target)) {
                    sizeFilterPanel.classList.remove("show");
                }
            });
        }
    });
    
    document.addEventListener("DOMContentLoaded", function () {
        const filterToggleBtn = document.querySelector(".filter-toggle-btn");
        const sizeFilterPanel = document.getElementById("size-filter-panel");
    
        if (filterToggleBtn && sizeFilterPanel) {
            filterToggleBtn.addEventListener("click", function () {
                sizeFilterPanel.classList.toggle("show");
            });
    
            // Fecha o painel ao clicar fora dele
            document.addEventListener("click", function (event) {
                if (!sizeFilterPanel.contains(event.target) && !filterToggleBtn.contains(event.target)) {
                    sizeFilterPanel.classList.remove("show");
                }
            });
        }
    });
    

    // Start the app
    init();
});