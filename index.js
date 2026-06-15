import express from 'express';
import cors from 'cors';
import YahooFinance from 'yahoo-finance2'; 

const app = express();
app.use(cors());

// --- CREDENCIALES DE ALPACA ---
// (Nota: En el futuro, es mejor poner esto en Variables de Entorno de Render)
const ALPACA_KEY = 'AKNNLBFLFLREOELC2SUTRSB7J3';
const ALPACA_SECRET = '7o4kqGMtyh3JsJW1jsuCNKpnenZzPTo1cpaPE6GpBNjE';
const ALPACA_URL = 'https://data.alpaca.markets/v1beta1'; 

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
  'accept': 'application/json'
};

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

// 2. Endpoint: Obtener Fechas de Opciones (AHORA CON ALPACA)
app.get('/api/options/dates', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    // Pedimos a Alpaca todos los contratos activos de ese símbolo
    const response = await fetch(`${ALPACA_URL}/options/contracts?underlying_symbols=${symbol}&status=active`, { headers: alpacaHeaders });
    const data = await response.json();

    if (!data.option_contracts || data.option_contracts.length === 0) {
      return res.json([]); 
    }

    // Extraemos fechas únicas
    const uniqueDates = [...new Set(data.option_contracts.map(c => c.expiration_date))];
    
    // Formateamos para que el frontend lo entienda igual que antes
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

// 3. Endpoint: Obtener Cadena de Opciones (AHORA CON ALPACA)
app.get('/api/options/chain', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const dateTs = parseInt(req.query.date); 
    
    if (!symbol || !dateTs) return res.status(400).json({ error: 'Símbolo y fecha requeridos.' });

    // 1. Convertimos el timestamp que manda tu frontend de vuelta a "YYYY-MM-DD"
    const dateObj = new Date(dateTs * 1000);
    const dateString = dateObj.toISOString().split('T')[0];

    // 2. Buscamos en Alpaca los contratos Calls para esa fecha específica
    const contractsRes = await fetch(`${ALPACA_URL}/options/contracts?underlying_symbols=${symbol}&expiration_date_eq=${dateString}&type=call`, { headers: alpacaHeaders });
    const contractsData = await contractsRes.json();

    if (!contractsData.option_contracts || contractsData.option_contracts.length === 0) {
      return res.json([]);
    }

    // 3. Extraemos los símbolos de esos contratos (ej. AAPL240119C00150000)
    const optionSymbols = contractsData.option_contracts.map(c => c.symbol).join(',');

    // 4. Pedimos los precios actuales de esos contratos (Snapshots)
    const snapshotsRes = await fetch(`${ALPACA_URL}/options/snapshots?symbols=${optionSymbols}`, { headers: alpacaHeaders });
    const snapshotsData = await snapshotsRes.json();

    // 5. Cruzamos la información (Strike + Precio)
    const calls = contractsData.option_contracts.map(contract => {
      const snap = snapshotsData.snapshots[contract.symbol];
      // Usamos el último precio de trade, si no hay, usamos 0
      const price = snap && snap.latestTrade ? snap.latestTrade.p : 0; 
      
      return {
        strike: parseFloat(contract.strike_price),
        price: price
      };
    }).filter(c => c.price > 0); // Filtramos los que tengan precio 0 para limpiar la tabla

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
