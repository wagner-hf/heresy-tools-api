const express = require('express');
const cors = require('cors');
const yahooFinance = require('yahoo-finance2').default;

const app = express();

// ¡MAGIA PURA! Esto desactiva el bloqueo de seguridad (CORS) 
// permitiendo que Webflow pueda leer los datos.
app.use(cors());

app.get('/api/stock', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: 'Debes enviar un símbolo.' });
    }

    // 1. Pedir datos principales a Yahoo Finance
    const quote = await yahooFinance.quote(symbol);
    
    // 2. Pedir datos estadísticos extra (para el Growth Rate)
    const quoteSummary = await yahooFinance.quoteSummary(symbol, { 
      modules: ['defaultKeyStatistics'] 
    });

    // 3. Extraer y limpiar los datos exactos que Webflow necesita
    const currentPrice = quote.regularMarketPrice || 0;
    const epsTTM = quote.trailingEps || quote.epsTrailingTwelveMonths || 0;
    
    // El crecimiento viene en decimal (ej. 0.15 = 15%). Lo convertimos.
    const rawGrowth = quoteSummary.defaultKeyStatistics?.earningsQuarterlyGrowth || 0;
    const currentGrowth = (rawGrowth * 100).toFixed(2);
    
    const targetPE = quote.trailingPE || quote.forwardPE || 0;

    // 4. Enviar la respuesta limpia a Webflow
    res.json({
      symbol: quote.symbol,
      currentPrice: currentPrice,
      epsTTM: epsTTM,
      currentGrowth: currentGrowth,
      targetPE: targetPE.toFixed(2)
    });

  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: 'Símbolo no encontrado o datos no disponibles.' });
  }
});

// Arrancar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Proxy corriendo en el puerto ${PORT}`);
});
