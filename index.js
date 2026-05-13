import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

// --- ADMINISTRADOR DE AUTENTICACIÓN DE YAHOO (Bypass de seguridad) ---
let sessionCookie = '';
let yahooCrumb = '';

async function getYahooAuth() {
  if (sessionCookie && yahooCrumb) return { cookie: sessionCookie, crumb: yahooCrumb };
  try {
    const res = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    sessionCookie = res.headers.get('set-cookie')?.split(';')[0] || '';
    
    const resCrumb = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'cookie': sessionCookie, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    yahooCrumb = await resCrumb.text();
  } catch (e) {
    console.error("Auth error:", e);
  }
  return { cookie: sessionCookie, crumb: yahooCrumb };
}
// ---------------------------------------------------------------------

// 1. Endpoint: Intrinsic Value (Stock Data) - ¡AHORA DIRECTO Y SIN LIBRERÍAS!
app.get('/api/stock', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ error: 'Símbolo requerido.' });

    const auth = await getYahooAuth();
    const headers = { 
      'cookie': auth.cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    // 1.1 Pedir Precio, EPS, y PE
    const quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}&crumb=${auth.crumb}`, { headers });
    const quoteData = await quoteRes.json();

    if (!quoteData.quoteResponse || !quoteData.quoteResponse.result || quoteData.quoteResponse.result.length === 0) {
      return res.status(404).json({ error: 'Símbolo no encontrado.' });
    }
    const quote = quoteData.quoteResponse.result[0];

    // 1.2 Pedir Estadísticas (Growth Rate)
    const statRes = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics&crumb=${auth.crumb}`, { headers });
    const statData = await statRes.json();
    const stats = statData.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};

    const currentPrice = quote.regularMarketPrice || 0;
    const epsTTM = quote.epsTrailingTwelveMonths || quote.trailingEps || 0;
    const rawGrowth = stats.earningsQuarterlyGrowth?.raw || 0; 
    const currentGrowth = (rawGrowth * 100).toFixed(2);
    const targetPE = quote.trailingPE || quote.forwardPE || 0;

    res.json({ symbol: quote.symbol, currentPrice, epsTTM, currentGrowth, targetPE: targetPE.toFixed(2) });
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

    const auth = await getYahooAuth();
    const response = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${auth.crumb}`, {
      headers: { 
        'cookie': auth.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const data = await response.json();

    if (!data || !data.optionChain) throw new Error("Yahoo API Auth Error");

    const result = data.optionChain.result;
    if (!result || result.length === 0 || !result[0].expirationDates) {
      return res.json([]); 
    }

    const datesFormatted = result[0].expirationDates.map(ts => {
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

    const auth = await getYahooAuth();
    const response = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}?date=${dateTs}&crumb=${auth.crumb}`, {
      headers: { 
        'cookie': auth.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const data = await response.json();
    
    if (!data || !data.optionChain) throw new Error("Yahoo API Auth Error");

    const result = data.optionChain.result;
    if (!result || result.length === 0 || !result[0].options || result[0].options.length === 0) {
      return res.json([]);
    }

    const calls = result[0].options[0].calls.map(c => ({
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
