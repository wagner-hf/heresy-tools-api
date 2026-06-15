import express from 'express';
import cors from 'cors';
import YahooFinance from 'yahoo-finance2'; // La importación limpia que arreglamos antes

const app = express();
app.use(cors());

// --- CREDENCIALES OFICIALES DE ALPACA ---
const ALPACA_KEY = 'AKNNLBFLFLREOELC2SUTRSB7J3';
const ALPACA_SECRET = '7o4kqGMtyh3JsJW1jsuCNKpnenZzPTo1cpaPE6GpBNjE';
// Usamos la URL correcta según la documentación (v2)
const ALPACA_URL = 'https://api.alpaca.markets/v2'; 

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
  'accept': 'application/json'
};

// Inicializamos Yahoo para el Intrinsic Value
const yahooFinance = new YahooFinance();

// 1. Endpoint: Intrinsic Value (Se queda con Yahoo temporalmente)
app.get('/api/stock', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    const quote = await yahooFinance.quote(symbol);
    const summary = await yahooFinance.quoteSummary(symbol, { modules: ['defaultKeyStatistics'] });
    const stats = summary.defaultKeyStatistics || {};

    const currentPrice = quote.regularMarketPrice || 0;
    const epsTTM = quote.trailingEps || 0;
    const rawGrowth = stats.earningsQuarterlyGrowth || 0; 
    const currentGrowth = (rawGrowth * 100).toFixed(2);
    const targetPE = quote.trailingPE || quote.forwardPE || 0;

    res.json({ symbol: quote.symbol, currentPrice, epsTTM, currentGrowth, targetPE: targetPE.toFixed(2) });
  } catch (error) {
    console.error("Stock Error:", error);
    res.status(500).json({ error: 'Error fetching stock data.', details: error.message });
  }
});

// 2. Endpoint: Obtener Fechas de Opciones (Alpaca v2)
app.get('/api/options/dates', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    // Añadimos limit=10000 para asegurarnos de traer la mayor cantidad de fechas posible
    const response = await fetch(`${ALPACA_URL}/options/contracts?underlying_symbols=${symbol}&status=active&limit=10000`, { headers: alpacaHeaders });
    const data = await response.json();

    if (!data.option_contracts || data.option_contracts.length === 0) {
      return res.json([]); 
    }

    // Extraemos las fechas únicas
    const uniqueDates = [...new Set(data.option_contracts.map(c => c.expiration_date))];
    
    // Formateamos para el frontend
    const datesFormatted = uniqueDates.sort().map(dateStr => {
      return { 
          timestamp: Math.floor(new Date(dateStr).getTime() / 1000), 
          dateString: dateStr 
      };
    });

    res.json(datesFormatted);
  } catch (error) {
    console.error("Alpaca Dates Error:", error);
    res.status(500).json({ error: 'Error fetching option dates via Alpaca.', details: error.message });
  }
});

// 3. Endpoint: Obtener Cadena de Opciones (Alpaca v2)
app.get('/api/options/chain', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const dateTs = parseInt(req.query.date); 
    
    if (!symbol || !dateTs) return res.status(400).json({ error: 'Símbolo y fecha requeridos.' });

    // Convertimos el timestamp a "YYYY-MM-DD"
    const dateObj = new Date(dateTs * 1000);
    const dateString = dateObj.toISOString().split('T')[0];

    // Buscamos los Call para esa fecha exacta usando los filtros de Alpaca
    const contractsRes = await fetch(`${ALPACA_URL}/options/contracts?underlying_symbols=${symbol}&status=active&expiration_date_gte=${dateString}&expiration_date_lte=${dateString}&type=call&limit=1000`, { headers: alpacaHeaders });
    const contractsData = await contractsRes.json();

    if (!contractsData.option_contracts || contractsData.option_contracts.length === 0) {
      return res.json([]);
    }

    // Ya no necesitamos pedir los Snapshots porque "close_price" viene incluido
    const calls = contractsData.option_contracts.map(contract => {
      // Si Alpaca no tiene el close_price, devuelve null, así que usamos 0 como respaldo
      const price = parseFloat(contract.close_price || 0); 
      
      return {
        strike: parseFloat(contract.strike_price),
        price: price
      };
    }).filter(c => c.price > 0); // Ocultamos los que no tengan precio para no ensuciar la gráfica

    // Ordenamos por strike de menor a mayor
    calls.sort((a, b) => a.strike - b.strike);

    res.json(calls);
  } catch (error) {
    console.error("Alpaca Chain Error:", error);
    res.status(500).json({ error: 'Error fetching option chain via Alpaca.', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Proxy corriendo en puerto ${PORT}`));
