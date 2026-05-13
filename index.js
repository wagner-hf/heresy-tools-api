import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';

const app = express();
app.use(cors());

// 1. Endpoint: Intrinsic Value (Calculadora 1)
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
    res.status(500).json({ error: 'Error fetching stock data.' });
  }
});

// 2. Endpoint: Obtener las Fechas de Expiración (Calculadora de Opciones)
app.get('/api/options/dates', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    const result = await yahooFinance.options(symbol);
    
    // Yahoo devuelve timestamps (Unix). Los convertimos a formato legible YYYY-MM-DD
    const datesFormatted = result.expirationDates.map(ts => {
      const dateObj = new Date(ts * 1000);
      return { timestamp: ts, dateString: dateObj.toISOString().split('T')[0] };
    });

    res.json(datesFormatted);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching option dates.' });
  }
});

// 3. Endpoint: Obtener la cadena de opciones (Precios y Strikes)
app.get('/api/options/chain', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const dateTs = parseInt(req.query.date); // Timestamp
    if (!symbol || !dateTs) return res.status(400).json({ error: 'Símbolo y fecha requeridos.' });

    const result = await yahooFinance.options(symbol, { date: dateTs });
    
    // Extraemos solo las opciones "Call" (como Joe pidió en su video)
    const calls = result.options[0].calls.map(c => ({
      strike: c.strike,
      price: c.lastPrice
    }));

    res.json(calls);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching option chain.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Proxy corriendo en puerto ${PORT}`));
