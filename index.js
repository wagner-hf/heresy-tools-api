import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';

const app = express();
app.use(cors());

// 1. Endpoint: Intrinsic Value (Este funciona perfecto con la librería)
app.get('/api/stock', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    const quote = await yahooFinance.quote(symbol);
    const quoteSummary = await yahooFinance.quoteSummary(symbol, { modules: ['defaultKeyStatistics'] });

    const currentPrice = quote.regularMarketPrice || 0;
    const epsTTM = quote.trailingEps || quote.epsTrailingTwelveMonths || 0;
    const rawGrowth = quoteSummary.defaultKeyStatistics?.earningsQuarterlyGrowth || 0;
    const currentGrowth = (rawGrowth * 100).toFixed(2);
    const targetPE = quote.trailingPE || quote.forwardPE || 0;

    res.json({ symbol: quote.symbol, currentPrice, epsTTM, currentGrowth, targetPE: targetPE.toFixed(2) });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching stock data.', details: error.message });
  }
});

// 2. Endpoint: Obtener las Fechas de Expiración (Bypass directo a Yahoo)
app.get('/api/options/dates', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    // Conexión directa a la API oculta de Yahoo
    const response = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const data = await response.json();

    if (!data.optionChain.result || data.optionChain.result.length === 0) {
      return res.json([]);
    }

    const result = data.optionChain.result[0];
    if (!result.expirationDates || result.expirationDates.length === 0) {
      return res.json([]);
    }

    const datesFormatted = result.expirationDates.map(ts => {
      const dateObj = new Date(ts * 1000);
      return { timestamp: ts, dateString: dateObj.toISOString().split('T')[0] };
    });

    res.json(datesFormatted);
  } catch (error) {
    console.error("Options Error:", error);
    res.status(500).json({ error: 'Error fetching option dates.', details: error.message });
  }
});

// 3. Endpoint: Obtener la cadena de opciones (Precios y Strikes)
app.get('/api/options/chain', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const dateTs = parseInt(req.query.date); 
    if (!symbol || !dateTs) return res.status(400).json({ error: 'Símbolo y fecha requeridos.' });

    // Conexión directa especificando la fecha exacta
    const response = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}?date=${dateTs}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const data = await response.json();
    
    if (!data.optionChain.result || data.optionChain.result.length === 0) {
      return res.json([]);
    }

    const result = data.optionChain.result[0];
    if (!result.options || result.options.length === 0) {
      return res.json([]);
    }

    const calls = result.options[0].calls.map(c => ({
      strike: c.strike,
      price: c.lastPrice
    }));

    res.json(calls);
  } catch (error) {
    console.error("Chain Error:", error);
    res.status(500).json({ error: 'Error fetching option chain.', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Proxy corriendo en puerto ${PORT}`));
