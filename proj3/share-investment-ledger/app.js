const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');

const app = express();
const port = 3001;

// Database setup
const db = new sqlite3.Database('shares.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the shares database.');
});

// Create tables
db.serialize(() => {
    // Drop existing tables
    db.run(`DROP TABLE IF EXISTS live_prices`);
    db.run(`DROP TABLE IF EXISTS sold_shares`);
    db.run(`DROP TABLE IF EXISTS holdings`);
    db.run(`DROP TABLE IF EXISTS stock_symbols`);

    // Table for personal share holdings
    db.run(`CREATE TABLE IF NOT EXISTS holdings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_price REAL NOT NULL,
        purchase_date TEXT NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'sold'))
    )`);

    // Table for sold shares
    db.run(`CREATE TABLE IF NOT EXISTS sold_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        holding_id INTEGER,
        quantity INTEGER NOT NULL,
        sell_price REAL NOT NULL,
        sell_date TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY(holding_id) REFERENCES holdings(id)
    )`);

    // Table for live share prices
    db.run(`CREATE TABLE IF NOT EXISTS live_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        current_price REAL NOT NULL,
        previous_price REAL,
        last_updated TEXT NOT NULL
    )`);

    // Table for stock symbols
    db.run(`CREATE TABLE IF NOT EXISTS stock_symbols (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        exchange TEXT NOT NULL
    )`);

    // Add some sample stock symbols
    db.run(`INSERT OR IGNORE INTO stock_symbols (symbol, name, exchange) VALUES 
        ('AAPL', 'Apple Inc.', 'NASDAQ'),
        ('GOOGL', 'Alphabet Inc.', 'NASDAQ'),
        ('MSFT', 'Microsoft Corporation', 'NASDAQ'),
        ('AMZN', 'Amazon.com Inc.', 'NASDAQ'),
        ('META', 'Meta Platforms Inc.', 'NASDAQ'),
        ('TSLA', 'Tesla Inc.', 'NASDAQ'),
        ('NVDA', 'NVIDIA Corporation', 'NASDAQ'),
        ('JPM', 'JPMorgan Chase & Co.', 'NYSE'),
        ('BAC', 'Bank of America Corp.', 'NYSE'),
        ('WMT', 'Walmart Inc.', 'NYSE')
    `);
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes for Holdings
app.post('/api/holdings', async (req, res) => {
    const { symbol, quantity, purchase_price, notes } = req.body;
    const purchase_date = new Date().toISOString();

    try {
        const validatedSymbol = await validateAndFormatSymbol(symbol);
        if (!validatedSymbol) {
            res.status(400).json({ error: 'Invalid or unsupported stock symbol' });
            return;
        }

        // Store the validated symbol data
        db.run(
            'INSERT OR REPLACE INTO stock_symbols (symbol, name, exchange) VALUES (?, ?, ?)',
            [validatedSymbol.symbol, validatedSymbol.name, validatedSymbol.exchange]
        );

        // Create the holding with the validated symbol
        db.run(
            'INSERT INTO holdings (symbol, quantity, purchase_price, purchase_date, notes) VALUES (?, ?, ?, ?, ?)',
            [validatedSymbol.symbol, quantity, purchase_price, purchase_date, notes],
            function(err) {
                if (err) {
                    res.status(400).json({ error: err.message });
                    return;
                }
                res.json({ 
                    id: this.lastID,
                    symbol: validatedSymbol.symbol,
                    name: validatedSymbol.name,
                    exchange: validatedSymbol.exchange
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/holdings', (req, res) => {
    db.all('SELECT * FROM holdings', [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.put('/api/holdings/:id', async (req, res) => {
    const { id } = req.params;
    const { quantity, purchase_price, purchase_date, notes } = req.body;

    try {
        db.run(
            'UPDATE holdings SET quantity = ?, purchase_price = ?, purchase_date = ?, notes = ? WHERE id = ?',
            [quantity, purchase_price, purchase_date, notes, id],
            function(err) {
                if (err) {
                    res.status(400).json({ error: err.message });
                    return;
                }
                res.json({ 
                    message: 'Holding updated successfully',
                    changes: this.changes 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sell shares endpoint with improved validation and error handling
app.post('/api/holdings/sell', async (req, res) => {
    const { holding_id, quantity, sell_price, notes } = req.body;
    
    // Input validation
    if (!holding_id || !quantity || !sell_price) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate numeric values
    const numericHoldingId = parseInt(holding_id, 10);
    const numericQuantity = parseInt(quantity, 10);
    const numericSellPrice = parseFloat(sell_price);
    
    if (isNaN(numericHoldingId) || numericHoldingId <= 0) {
        return res.status(400).json({ error: 'Invalid holding ID' });
    }
    if (isNaN(numericQuantity) || numericQuantity <= 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (isNaN(numericSellPrice) || numericSellPrice <= 0) {
        return res.status(400).json({ error: 'Invalid sell price' });
    }

    const sell_date = new Date().toISOString().split('T')[0];

    db.serialize(() => {
        db.get(
            'SELECT * FROM holdings WHERE id = ? AND status != ?',
            [numericHoldingId, 'sold'],
            (err, holding) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (!holding) {
                    return res.status(404).json({ error: 'Active holding not found' });
                }
                
                if (holding.quantity < numericQuantity) {
                    return res.status(400).json({ error: 'Not enough shares to sell' });
                }

                db.run('BEGIN TRANSACTION');

                try {
                    // Insert into sold_shares
                    db.run(
                        'INSERT INTO sold_shares (holding_id, quantity, sell_price, sell_date, notes) VALUES (?, ?, ?, ?, ?)',
                        [numericHoldingId, numericQuantity, numericSellPrice, sell_date, notes || '']
                    );

                    // Update holdings
                    if (holding.quantity === numericQuantity) {
                        // All shares sold - mark as sold
                        db.run(
                            'UPDATE holdings SET status = ?, notes = ? WHERE id = ?',
                            ['sold', notes || '', numericHoldingId]
                        );
                    } else {
                        // Partial sale - update quantity
                        db.run(
                            'UPDATE holdings SET quantity = quantity - ? WHERE id = ?',
                            [numericQuantity, numericHoldingId]
                        );
                    }

                    db.run('COMMIT', (err) => {
                        if (err) {
                            console.error('Error committing transaction:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to complete sale' });
                        }
                        res.json({
                            message: 'Shares sold successfully',
                            holding_id: numericHoldingId,
                            quantity: numericQuantity,
                            sell_price: numericSellPrice,
                            sell_date
                        });
                    });
                } catch (error) {
                    console.error('Error in sale transaction:', error);
                    db.run('ROLLBACK');
                    res.status(500).json({ error: 'Failed to complete sale' });
                }
            }
        );
    });
});

// Get sold shares endpoint
app.get('/api/sold-shares', (req, res) => {
    db.all(`
        SELECT 
            s.*,
            h.symbol,
            h.purchase_price
        FROM sold_shares s
        JOIN holdings h ON h.id = s.holding_id
        ORDER BY s.sell_date DESC
    `, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Function to fetch stock price from Yahoo Finance
const priceCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

async function getYahooFinancePrice(symbol) {
    try {
        const now = Date.now();
        const cached = priceCache.get(symbol);
        
        if (cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.data;
        }

        const validatedSymbol = await validateAndFormatSymbol(symbol);
        if (!validatedSymbol) {
            console.error(`Invalid symbol: ${symbol}`);
            return null;
        }

        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${validatedSymbol.symbol}`, {
            params: {
                interval: '1d',
                range: '2d'
            }
        });

        const result = response.data.chart.result[0];
        const priceData = {
            currentPrice: result.meta.regularMarketPrice,
            previousClose: result.meta.previousClose,
            symbol: validatedSymbol.symbol,
            name: validatedSymbol.name,
            exchange: validatedSymbol.exchange,
            timestamp: result.meta.regularMarketTime,
            currency: result.meta.currency
        };

        priceCache.set(symbol, {
            data: priceData,
            timestamp: now
        });

        return priceData;
    } catch (error) {
        console.error(`Error fetching price for ${symbol}:`, error.message);
        return null;
    }
}

// Stock symbol search endpoint
app.get('/api/symbols/search', async (req, res) => {
    const query = req.query.q;
    try {
        const results = await searchYahooSymbols(query);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Routes for Live Prices
app.post('/api/prices', (req, res) => {
    const { symbol } = req.body;
    const last_updated = new Date().toISOString();
    
    getYahooFinancePrice(symbol)
        .then(priceData => {
            if (!priceData) {
                res.status(404).json({ error: 'Unable to fetch price' });
                return;
            }
            
            db.run(
                'INSERT OR REPLACE INTO live_prices (symbol, current_price, previous_price, last_updated) VALUES (?, ?, ?, ?)',
                [priceData.symbol, priceData.currentPrice, priceData.previousClose, last_updated],
                function(err) {
                    if (err) {
                        res.status(400).json({ error: err.message });
                        return;
                    }
                    res.json({ 
                        symbol: priceData.symbol, 
                        current_price: priceData.currentPrice, 
                        previous_price: priceData.previousClose, 
                        last_updated 
                    });
                }
            );
        })
        .catch(error => {
            res.status(500).json({ error: error.message });
        });
});

app.get('/api/prices', (req, res) => {
    db.all('SELECT * FROM live_prices', [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/prices/:symbol', async (req, res) => {
    const { symbol } = req.params;
    try {
        const price = await getYahooFinancePrice(symbol);
        if (price === null) {
            res.status(404).json({ error: 'Unable to fetch price' });
            return;
        }

        const last_updated = new Date().toISOString();
        
        // Update or insert the price in database
        db.run(
            'INSERT OR REPLACE INTO live_prices (symbol, current_price, previous_price, last_updated) VALUES (?, ?, ?, ?)',
            [price.symbol, price.currentPrice, price.previousClose, last_updated],
            function(err) {
                if (err) {
                    res.status(400).json({ error: err.message });
                    return;
                }
                res.json({ symbol: price.symbol, current_price: price.currentPrice, previous_price: price.previousClose, last_updated });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all prices for multiple symbols
app.post('/api/prices/batch', async (req, res) => {
    const { symbols } = req.body;
    try {
        const prices = await Promise.all(
            symbols.map(async (symbol) => {
                const priceData = await getYahooFinancePrice(symbol);
                return { 
                    symbol: priceData ? priceData.symbol : symbol,
                    currentPrice: priceData ? priceData.currentPrice : null,
                    previousPrice: priceData ? priceData.previousClose : null
                };
            })
        );

        const last_updated = new Date().toISOString();
        
        // Update all prices in database
        const updates = prices.map(({ symbol, currentPrice, previousPrice }) => {
            return new Promise((resolve, reject) => {
                if (currentPrice === null) {
                    resolve();
                    return;
                }
                db.run(
                    'INSERT OR REPLACE INTO live_prices (symbol, current_price, previous_price, last_updated) VALUES (?, ?, ?, ?)',
                    [symbol, currentPrice, previousPrice, last_updated],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        });

        await Promise.all(updates);
        res.json(prices.filter(p => p.currentPrice !== null));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Function to search Yahoo Finance symbols
async function searchYahooSymbols(query) {
    try {
        const response = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search`, {
            params: {
                q: query,
                quotesCount: 10,
                newsCount: 0,
                enableFuzzyQuery: true,
                quotesQueryId: 'tss_match_phrase_query'
            }
        });
        
        if (response.data && response.data.quotes) {
            return response.data.quotes.map(quote => ({
                symbol: quote.symbol,
                name: quote.shortname || quote.longname || '',
                exchange: quote.exchange || '',
                type: quote.quoteType || '',
                score: quote.score || 0
            })).filter(quote => 
                quote.type === 'EQUITY' && 
                quote.exchange && 
                ['NYQ', 'NMS', 'NGM', 'BSE', 'NSE'].includes(quote.exchange)
            );
        }
        return [];
    } catch (error) {
        console.error('Error searching Yahoo symbols:', error);
        return [];
    }
}

// Function to validate and format symbol
async function validateAndFormatSymbol(symbol) {
    try {
        const results = await searchYahooSymbols(symbol);
        if (results.length > 0) {
            // Sort by score and prefer exact matches
            results.sort((a, b) => {
                if (a.symbol === symbol) return -1;
                if (b.symbol === symbol) return 1;
                return b.score - a.score;
            });
            return results[0];
        }
        return null;
    } catch (error) {
        console.error('Error validating symbol:', error);
        return null;
    }
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
