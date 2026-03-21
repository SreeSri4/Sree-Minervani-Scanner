// pages/api/fno.js
// Returns list of F&O stock symbols using stock-nse-india package
// Cached for 24 hours — F&O list doesn't change intraday

import { NseIndia } from 'stock-nse-india'

const nseIndia = new NseIndia()

let _cache = null
let _cacheTime = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Serve from cache if fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return res.status(200).json(_cache)
  }

  try {
    const data = await nseIndia.getEquityStockIndices('SECURITIES IN F&O')

    // data.data is an array of { symbol, ... } objects
    const symbols = (data?.data || [])
      .map(s => s.symbol)
      .filter(Boolean)
      .filter(s => s !== 'NIFTY 50') // exclude index entries
      .sort()

    const result = { symbols, count: symbols.length, ts: new Date().toISOString() }
    _cache = result
    _cacheTime = Date.now()

    console.log(`[fno] Loaded ${symbols.length} F&O stocks`)
    return res.status(200).json(result)

  } catch (err) {
    console.error('[fno] Error:', err.message)
    return res.status(500).json({ error: err.message, symbols: [] })
  }
}
