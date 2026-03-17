// pages/api/pricebands.js
// Fetches NSE sec_list.csv server-side (no CORS issues) and returns { SYMBOL: band } map
// CSV format: Symbol,Series,Security Name,Band,Remarks
// Band values in CSV: "2", "5", "10", "20", "40", "No Band"

let _cache = null
let _cacheTime = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Serve from cache if fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return res.status(200).json(_cache)
  }

  try {
    const resp = await fetch('https://archives.nseindia.com/content/equities/sec_list.csv', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/csv,text/plain,*/*',
        'Referer': 'https://www.nseindia.com/',
      },
    })

    if (!resp.ok) {
      return res.status(502).json({ error: `NSE returned HTTP ${resp.status}` })
    }

    const text = await resp.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // Parse CSV — col 0 = Symbol, col 3 = Band
    // Security Name (col 2) can contain commas inside quotes, so we use a proper parser
    function parseCSVLine(line) {
      const cols = []
      let cur = '', inQuote = false
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === ',' && !inQuote) { cols.push(cur); cur = '' }
        else { cur += ch }
      }
      cols.push(cur)
      return cols
    }

    const bands = {}
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      if (cols.length < 4) continue
      const sym  = cols[0].trim().toUpperCase()
      const band = cols[3].trim()
      if (sym) bands[sym] = band
    }

    _cache = bands
    _cacheTime = Date.now()
    console.log(`[pricebands] Loaded ${Object.keys(bands).length} entries from NSE`)
    return res.status(200).json(bands)

  } catch (err) {
    console.error('[pricebands] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
