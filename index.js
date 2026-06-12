import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2'; // La nueva librería mágica

const app = express();
app.use(cors());

// 1. Endpoint: Intrinsic Value (Stock Data)
app.get('/api/stock', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    // Pedimos la cotización básica (precio, EPS, PE)
    const quote = await yahooFinance.quote(symbol);
    
    // Pedimos las estadísticas clave (para el Growth Rate)
    const summary = await yahooFinance.quoteSummary(symbol, { modules: ['defaultKeyStatistics'] });
    const stats = summary.defaultKeyStatistics || {};

    const currentPrice = quote.regularMarketPrice || 0;
    const epsTTM = quote.trailingEps || 0;
    
    // La librería a veces devuelve el Growth como decimal, lo aseguramos a formato porcentaje
    const rawGrowth = stats.earningsQuarterlyGrowth || 0; 
    const currentGrowth = (rawGrowth * 100).toFixed(2);
    const targetPE = quote.trailingPE || quote.forwardPE || 0;

    res.json({ 
        symbol: quote.symbol, 
        currentPrice, 
        epsTTM, 
        currentGrowth, 
        targetPE: targetPE.toFixed(2) 
    });
  } catch (error) {
    console.error("Stock Error:", error);
    res.status(500).json({ error: 'Error fetching stock data.', details: error.message });
  }
});

// 2. Endpoint: Obtener las Fechas de Expiración (Calculadora de Opciones)
app.get('/api/options/dates', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    const optionsData = await yahooFinance.options(symbol);

    if (!optionsData || !optionsData.expirationDates) {
      return res.json([]); 
    }

    const datesFormatted = optionsData.expirationDates.map(dateObj => {
      // yahoo-finance2 convierte mágicamente los timestamps a objetos Date de Javascript
      return { 
          timestamp: Math.floor(dateObj.getTime() / 1000), 
          dateString: dateObj.toISOString().split('T')[0] 
      };
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

    // Convertimos el timestamp a Date para que la librería busque ese día específico
    const dateObj = new Date(dateTs * 1000);
    const optionsData = await yahooFinance.options(symbol, { date: dateObj });
    
    if (!optionsData || !optionsData.options || optionsData.options.length === 0) {
      return res.json([]);
    }

    const calls = optionsData.options[0].calls.map(c => ({
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
