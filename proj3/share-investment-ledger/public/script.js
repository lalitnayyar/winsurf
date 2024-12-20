document.addEventListener('DOMContentLoaded', function() {
    // Load initial data
    loadHoldings();
    loadSoldShares();
    setInterval(loadHoldings, 30000); // Refresh holdings every 30 seconds

    // Initialize sell shares modal
    const sellModal = new bootstrap.Modal(document.getElementById('sellSharesModal'));

    // Initialize update holding modal
    const updateModal = new bootstrap.Modal(document.getElementById('updateHoldingModal'));

    // Symbol search functionality
    const symbolInput = document.getElementById('symbol');
    const symbolSuggestions = document.getElementById('symbolSuggestions');
    let searchTimeout;

    symbolInput.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        
        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Clear suggestions if input is empty
        if (!query) {
            symbolSuggestions.innerHTML = '';
            return;
        }
        
        // Add loading state
        symbolInput.classList.add('loading');
        
        // Set new timeout for search
        searchTimeout = setTimeout(() => {
            fetch(`/api/symbols/search?q=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(suggestions => {
                    symbolSuggestions.innerHTML = '';
                    symbolInput.classList.remove('loading');
                    
                    if (suggestions.length === 0) {
                        symbolSuggestions.innerHTML = `
                            <div class="no-results">
                                No matching symbols found
                            </div>
                        `;
                        return;
                    }
                    
                    suggestions.forEach(suggestion => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.innerHTML = `
                            <span class="suggestion-symbol">${suggestion.symbol}</span>
                            <span class="suggestion-name">${suggestion.name}</span>
                            <span class="suggestion-exchange">${suggestion.exchange}</span>
                        `;
                        
                        div.addEventListener('click', () => {
                            symbolInput.value = suggestion.symbol;
                            symbolInput.dataset.name = suggestion.name;
                            symbolInput.dataset.exchange = suggestion.exchange;
                            symbolSuggestions.innerHTML = '';
                        });
                        
                        symbolSuggestions.appendChild(div);
                    });
                })
                .catch(error => {
                    console.error('Error fetching symbol suggestions:', error);
                    symbolInput.classList.remove('loading');
                    symbolSuggestions.innerHTML = `
                        <div class="search-error">
                            Error fetching suggestions. Please try again.
                        </div>
                    `;
                });
        }, 300); // 300ms debounce
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!symbolInput.contains(e.target) && !symbolSuggestions.contains(e.target)) {
            symbolSuggestions.innerHTML = '';
        }
    });

    // Handle keyboard navigation
    symbolInput.addEventListener('keydown', function(e) {
        const items = symbolSuggestions.querySelectorAll('.suggestion-item');
        const currentIndex = Array.from(items).findIndex(item => item.classList.contains('active'));
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (currentIndex < items.length - 1) {
                    if (currentIndex >= 0) items[currentIndex].classList.remove('active');
                    items[currentIndex + 1].classList.add('active');
                    items[currentIndex + 1].scrollIntoView({ block: 'nearest' });
                }
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (currentIndex > 0) {
                    items[currentIndex].classList.remove('active');
                    items[currentIndex - 1].classList.add('active');
                    items[currentIndex - 1].scrollIntoView({ block: 'nearest' });
                }
                break;
                
            case 'Enter':
                e.preventDefault();
                const activeItem = symbolSuggestions.querySelector('.suggestion-item.active');
                if (activeItem) {
                    activeItem.click();
                }
                break;
                
            case 'Escape':
                symbolSuggestions.innerHTML = '';
                break;
        }
    });

    // Update form submission to include symbol validation
    document.getElementById('addShareForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            symbol: document.getElementById('symbol').value.trim(),
            quantity: parseInt(document.getElementById('quantity').value),
            purchase_price: parseFloat(document.getElementById('purchase_price').value),
            notes: document.getElementById('notes').value.trim()
        };
        
        fetch('/api/holdings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
                return;
            }
            
            // Clear form
            document.getElementById('addShareForm').reset();
            symbolSuggestions.innerHTML = '';
            
            // Show success message
            showSuccess(`Added ${data.symbol} (${data.name}) successfully!`);
            
            // Reload holdings
            loadHoldings();
        })
        .catch(error => {
            console.error('Error:', error);
            showError('Failed to add holding. Please try again.');
        });
    });

    function openSellModal(holdingId, maxQuantity, currentPrice, symbol, stockName) {
        const form = document.getElementById('sellSharesForm');
        const quantityInput = document.getElementById('sellQuantity');
        const priceInput = document.getElementById('sellPrice');
        
        // Reset form
        form.reset();
        
        // Set form values
        document.getElementById('sellHoldingId').value = holdingId;
        document.getElementById('sellModalLabel').textContent = `Sell ${symbol} - ${stockName}`;
        
        // Set quantity constraints
        quantityInput.max = maxQuantity;
        quantityInput.value = maxQuantity;
        
        // Set current price
        priceInput.value = currentPrice.toFixed(2);
        
        // Show modal
        sellModal.show();
    }

    // Handle sell form submission
    document.getElementById('sellSharesForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const holdingId = document.getElementById('sellHoldingId').value;
        const quantity = document.getElementById('sellQuantity').value;
        const sellPrice = document.getElementById('sellPrice').value;
        const notes = document.getElementById('sellNotes').value;
        const symbol = document.getElementById('sellModalLabel').textContent.split(' - ')[0].replace('Sell ', '');

        try {
            const response = await fetch('/api/holdings/sell', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    holding_id: parseInt(holdingId),
                    quantity: parseInt(quantity),
                    sell_price: parseFloat(sellPrice),
                    notes: notes
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to sell shares');
            }

            // Show success message
            showSuccess(`Successfully sold ${quantity} shares of ${symbol}`);
            
            // Refresh data
            await loadHoldings();
            await loadSoldShares();
            
            // Close modal
            sellModal.hide();
        } catch (error) {
            console.error('Error selling shares:', error);
            showError(error.message);
        }
    });

    // Add input validation
    document.getElementById('sellQuantity').addEventListener('input', function() {
        const maxQuantity = parseInt(this.max);
        const value = parseInt(this.value);
        
        if (isNaN(value) || value <= 0) {
            this.setCustomValidity('Please enter a positive number');
        } else if (value > maxQuantity) {
            this.setCustomValidity(`Maximum quantity is ${maxQuantity}`);
        } else {
            this.setCustomValidity('');
        }
    });

    document.getElementById('sellPrice').addEventListener('input', function() {
        const value = parseFloat(this.value);
        if (isNaN(value) || value <= 0) {
            this.setCustomValidity('Please enter a valid price');
        } else {
            this.setCustomValidity('');
        }
    });

    // Update holding functionality
    document.getElementById('updateHoldingBtn').addEventListener('click', updateHolding);

    // Live status functionality with improved error handling
    let priceUpdateInterval;
    const priceUpdateDelay = 30000; // 30 seconds

    async function startLivePriceUpdates() {
        // Clear any existing interval
        if (priceUpdateInterval) {
            clearInterval(priceUpdateInterval);
        }

        async function updatePrices() {
            const holdings = document.querySelectorAll('[data-symbol]');
            const symbols = Array.from(holdings).map(el => el.dataset.symbol);
            
            for (const symbol of symbols) {
                try {
                    const response = await fetch('/api/prices', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ symbol })
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch price for ${symbol}`);
                    }

                    const data = await response.json();
                    updatePriceDisplay(symbol, data);
                } catch (error) {
                    console.error(`Error updating price for ${symbol}:`, error);
                    // Mark price as stale in UI
                    markPriceAsStale(symbol);
                }
            }
        }

        // Initial update
        await updatePrices();
        
        // Set interval for future updates
        priceUpdateInterval = setInterval(updatePrices, priceUpdateDelay);
    }

    startLivePriceUpdates();

    // Set current date and validate date inputs
    function initializeDateInputs() {
        const today = new Date().toISOString().split('T')[0];
        const purchaseDateInput = document.getElementById('purchase_date');
        
        // Set max date to today
        purchaseDateInput.max = today;
        
        // Set default value to today for new entries
        if (!purchaseDateInput.value) {
            purchaseDateInput.value = today;
        }
        
        // Add validation
        purchaseDateInput.addEventListener('input', function() {
            const selectedDate = new Date(this.value);
            const currentDate = new Date();
            
            if (selectedDate > currentDate) {
                this.setCustomValidity('Purchase date cannot be in the future');
            } else {
                this.setCustomValidity('');
            }
        });
    }

    initializeDateInputs();

    // Update price display with status indicators
    function updatePriceDisplay(symbol, priceData) {
        const priceElements = document.querySelectorAll(`[data-symbol="${symbol}"] .current-price`);
        const statusElements = document.querySelectorAll(`[data-symbol="${symbol}"] .status-indicator`);
        
        priceElements.forEach(el => {
            const previousPrice = parseFloat(el.dataset.previousPrice) || priceData.currentPrice;
            el.dataset.previousPrice = priceData.currentPrice;
            
            // Update price with animation
            el.classList.remove('price-up', 'price-down');
            el.parentElement.classList.remove('price-flash-up', 'price-flash-down');
            
            if (priceData.currentPrice > previousPrice) {
                el.classList.add('price-up');
                el.parentElement.classList.add('price-flash-up');
            } else if (priceData.currentPrice < previousPrice) {
                el.classList.add('price-down');
                el.parentElement.classList.add('price-flash-down');
            }
            
            el.textContent = formatCurrency(priceData.currentPrice);
        });
        
        statusElements.forEach(el => {
            el.classList.remove('status-up', 'status-down', 'status-neutral');
            if (priceData.currentPrice > priceData.previousClose) {
                el.classList.add('status-up');
                el.title = 'Price is up from previous close';
            } else if (priceData.currentPrice < priceData.previousClose) {
                el.classList.add('status-down');
                el.title = 'Price is down from previous close';
            } else {
                el.classList.add('status-neutral');
                el.title = 'No change from previous close';
            }
        });
    }

    function loadHoldings() {
        fetch('/api/holdings')
            .then(response => response.json())
            .then(holdings => {
                const tableBody = document.getElementById('holdingsTableBody');
                const soldSharesBody = document.getElementById('soldSharesTableBody');
                tableBody.innerHTML = '';
                soldSharesBody.innerHTML = '';
                
                // Get unique symbols
                const symbols = [...new Set(holdings.map(h => h.symbol))];
                
                // Fetch all prices and stock info at once
                fetch('/api/prices/batch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ symbols })
                })
                .then(response => response.json())
                .then(prices => {
                    const priceMap = new Map(prices.map(p => [p.symbol, { 
                        currentPrice: p.currentPrice, 
                        previousPrice: p.previousPrice,
                        name: p.name || ''
                    }]));
                    
                    let totalQuantity = 0;
                    let totalInvestment = 0;
                    let totalCurrentValue = 0;
                    let totalProfitLoss = 0;
                    
                    // Active Holdings
                    holdings.filter(h => h.status === 'active').forEach(holding => {
                        const priceData = priceMap.get(holding.symbol);
                        const currentPrice = priceData ? priceData.currentPrice : null;
                        const previousPrice = priceData ? priceData.previousPrice : null;
                        const stockName = priceData ? priceData.name : '';
                        
                        const totalInvestmentForHolding = holding.purchase_price * holding.quantity;
                        const currentValueForHolding = currentPrice ? currentPrice * holding.quantity : 0;
                        const pl = currentPrice ? 
                            (currentPrice - holding.purchase_price) * holding.quantity : 
                            null;
                        const profitPercentage = currentPrice ? 
                            ((currentPrice - holding.purchase_price) / holding.purchase_price * 100) :
                            null;
                        
                        // Update totals
                        totalQuantity += holding.quantity;
                        totalInvestment += totalInvestmentForHolding;
                        if (currentPrice) {
                            totalCurrentValue += currentValueForHolding;
                            totalProfitLoss += pl;
                        }
                        
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${getStockStatusIndicator(currentPrice, previousPrice)}</td>
                            <td>
                                <strong>${holding.symbol}</strong><br>
                                <small class="text-muted">${stockName}</small>
                            </td>
                            <td>${holding.quantity}</td>
                            <td>${formatCurrency(holding.purchase_price)}</td>
                            <td>${currentPrice ? formatCurrency(currentPrice) : 'Loading...'}</td>
                            <td>${formatCurrency(totalInvestmentForHolding)}</td>
                            <td>${currentPrice ? formatCurrency(currentValueForHolding) : 'Loading...'}</td>
                            <td class="${pl >= 0 ? 'profit' : 'loss'}">${pl ? formatCurrency(pl) : '-'}</td>
                            <td class="${profitPercentage >= 0 ? 'profit' : 'loss'}">${profitPercentage ? formatPercentage(profitPercentage) : '-'}</td>
                            <td>${new Date(holding.purchase_date).toLocaleDateString()}</td>
                            <td>${holding.notes || '-'}</td>
                            <td>
                                <button class="btn btn-outline-primary btn-sell" onclick="openSellModal(${holding.id}, ${holding.quantity}, ${currentPrice || 0}, '${holding.symbol}', '${stockName}')">
                                    Sell
                                </button>
                                <button class="btn btn-outline-secondary btn-update" onclick="openUpdateModal(${holding.id}, '${holding.symbol}', ${holding.quantity}, ${holding.purchase_price}, '${holding.purchase_date}', '${holding.notes || ''}')">
                                    Update
                                </button>
                            </td>
                        `;
                        tableBody.appendChild(row);
                    });
                    
                    // Sold Shares
                    holdings.filter(h => h.status === 'sold').forEach(holding => {
                        const stockName = priceMap.get(holding.symbol)?.name || '';
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>
                                <strong>${holding.symbol}</strong><br>
                                <small class="text-muted">${stockName}</small>
                            </td>
                            <td>${holding.quantity}</td>
                            <td>${formatCurrency(holding.purchase_price)}</td>
                            <td>${formatCurrency(holding.sell_price)}</td>
                            <td>${formatCurrency(holding.purchase_price * holding.quantity)}</td>
                            <td>${formatCurrency(holding.sell_price * holding.quantity)}</td>
                            <td class="${(holding.sell_price - holding.purchase_price) >= 0 ? 'profit' : 'loss'}">
                                ${formatCurrency((holding.sell_price - holding.purchase_price) * holding.quantity)}
                            </td>
                            <td class="${(holding.sell_price - holding.purchase_price) >= 0 ? 'profit' : 'loss'}">
                                ${formatPercentage(((holding.sell_price - holding.purchase_price) / holding.purchase_price * 100))}
                            </td>
                            <td>${new Date(holding.sell_date).toLocaleDateString()}</td>
                            <td>${holding.notes || '-'}</td>
                        `;
                        soldSharesBody.appendChild(row);
                    });
                    
                    // Update totals row
                    document.getElementById('totalQuantity').textContent = totalQuantity;
                    document.getElementById('totalInvestment').textContent = formatCurrency(totalInvestment);
                    document.getElementById('totalCurrentValue').textContent = formatCurrency(totalCurrentValue);
                    document.getElementById('totalProfitLoss').textContent = formatCurrency(totalProfitLoss);
                    const totalProfitPercent = (totalProfitLoss / totalInvestment * 100);
                    document.getElementById('totalProfitPercent').textContent = formatPercentage(totalProfitPercent);
                    document.getElementById('totalProfitPercent').className = totalProfitPercent >= 0 ? 'profit' : 'loss';
                    document.getElementById('totalProfitLoss').className = totalProfitLoss >= 0 ? 'profit' : 'loss';
                })
                .catch(error => console.error('Error fetching prices:', error));
            })
            .catch(error => console.error('Error:', error));
    }

    function loadSoldShares() {
        fetch('/api/sold-shares')
            .then(response => response.json())
            .then(soldShares => {
                const tableBody = document.getElementById('soldSharesTableBody');
                tableBody.innerHTML = '';
                
                soldShares.forEach(share => {
                    const totalInvestment = share.purchase_price * share.quantity;
                    const totalReturn = share.sell_price * share.quantity;
                    const pl = totalReturn - totalInvestment;
                    const profitPercentage = (pl / totalInvestment * 100);
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${share.symbol}</td>
                        <td>${share.quantity}</td>
                        <td>${formatCurrency(share.purchase_price)}</td>
                        <td>${formatCurrency(share.sell_price)}</td>
                        <td>${formatCurrency(totalInvestment)}</td>
                        <td>${formatCurrency(totalReturn)}</td>
                        <td class="${pl >= 0 ? 'profit' : 'loss'}">${formatCurrency(pl)}</td>
                        <td class="${profitPercentage >= 0 ? 'profit' : 'loss'}">${formatPercentage(profitPercentage)}</td>
                        <td>${new Date(share.sell_date).toLocaleDateString()}</td>
                        <td>${share.notes || '-'}</td>
                    `;
                    tableBody.appendChild(row);
                });
            })
            .catch(error => console.error('Error:', error));
    }

    function openUpdateModal(id, symbol, quantity, purchasePrice, purchaseDate, notes) {
        document.getElementById('updateHoldingId').value = id;
        document.getElementById('updateSymbol').value = symbol;
        document.getElementById('updateQuantity').value = quantity;
        document.getElementById('updatePurchasePrice').value = purchasePrice;
        document.getElementById('updatePurchaseDate').value = purchaseDate;
        document.getElementById('updateNotes').value = notes || '';
        new bootstrap.Modal(document.getElementById('updateHoldingModal')).show();
    }

    async function updateHolding() {
        const id = document.getElementById('updateHoldingId').value;
        const quantity = document.getElementById('updateQuantity').value;
        const purchase_price = document.getElementById('updatePurchasePrice').value;
        const purchase_date = document.getElementById('updatePurchaseDate').value;
        const notes = document.getElementById('updateNotes').value;

        try {
            const response = await fetch(`/api/holdings/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    quantity,
                    purchase_price,
                    purchase_date,
                    notes
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update holding');
            }

            new bootstrap.Modal(document.getElementById('updateHoldingModal')).hide();
            await loadHoldings(); // Refresh the holdings table
            showSuccess('Holding updated successfully', 'success');
        } catch (error) {
            console.error('Error updating holding:', error);
            showSuccess('Failed to update holding', 'danger');
        }
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    function formatPercentage(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value / 100);
    }

    function getStockStatusIndicator(currentPrice, previousPrice) {
        if (!previousPrice) return '';
        const status = currentPrice > previousPrice ? 'up' : 'down';
        return `<span class="stock-status stock-${status}"></span>`;
    }

    function markPriceAsStale(symbol) {
        const statusElements = document.querySelectorAll(`[data-symbol="${symbol}"] .price-status`);
        statusElements.forEach(el => {
            el.classList.add('status-stale');
            el.title = 'Price update failed';
        });
    }

    // Helper function to show alerts
    function showSuccess(message, type = 'info') {
        const alertsContainer = document.getElementById('alerts');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        alertsContainer.appendChild(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 150);
        }, 5000);
    }

    function showError(message) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger alert-dismissible fade show';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.getElementById('alerts').appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    }
});
