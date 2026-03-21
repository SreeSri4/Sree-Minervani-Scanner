import { NseIndia } from "stock-nse-india";

// Cache F&O list for 24h — it changes only when NSE updates the F&O segment
let _fnoCache = null;
let _fnoCacheTime = 0;
const FNO_TTL = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const now = Date.now();
  if (_fnoCache && now - _fnoCacheTime < FNO_TTL) {
    return res.status(200).json({ symbols: _fnoCache, cached: true });
  }

  try {
    const nseIndia = new NseIndia();
    const data = await nseIndia.getEquityStockIndices("SECURITIES IN F&O");

    // data.data is an array of objects; each has a `symbol` field
    const symbols = (data?.data || [])
      .map(s => s.symbol?.trim().toUpperCase())
      .filter(Boolean)
      .sort();

    if (symbols.length === 0) throw new Error("Empty F&O list returned");

    _fnoCache = symbols;
    _fnoCacheTime = now;

    console.log(`F&O list fetched: ${symbols.length} stocks`);
    return res.status(200).json({ symbols, cached: false, count: symbols.length });
  } catch (err) {
    console.error("F&O fetch failed:", err.message);
    // Return a fallback hardcoded list of liquid F&O stocks if NSE API fails
    const fallback = [
      "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","HINDUNILVR","SBIN",
      "BAJFINANCE","BHARTIARTL","KOTAKBANK","LT","AXISBANK","MARUTI","SUNPHARMA",
      "WIPRO","HCLTECH","TATAMOTORS","ADANIENT","NTPC","POWERGRID","ONGC",
      "COALINDIA","TITAN","ULTRACEMCO","NESTLEIND","TECHM","GRASIM","DIVISLAB",
      "DRREDDY","CIPLA","EICHERMOT","HEROMOTOCO","BAJAJFINSV","INDUSINDBK",
      "JSWSTEEL","HINDALCO","TATASTEEL","ASIANPAINT","BRITANNIA","APOLLOHOSP"
    ].sort();
    return res.status(200).json({
      symbols: fallback,
      cached: false,
      fallback: true,
      error: err.message,
      count: fallback.length,
    });
  }
}

export const config = { api: { responseLimit: "2mb" } };
