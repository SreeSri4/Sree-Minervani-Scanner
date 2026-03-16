import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Yahoo Finance direct fetcher ─────────────────────────────────────────────
async function fetchYahooData(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1y&includePrePost=false`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://finance.yahoo.com/",
    Origin: "https://finance.yahoo.com",
  };

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${symbol}`);

  const json = await res.json();
  if (json.chart?.error) throw new Error(json.chart.error.description || `No data for ${symbol}`);

  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Empty response for ${symbol}`);

  const meta   = result.meta || {};
  const quotes = result.indicators?.quote?.[0] || {};

  const closes  = (quotes.close  || []).filter(Boolean);
  const highs   = (quotes.high   || []).filter(Boolean);
  const lows    = (quotes.low    || []).filter(Boolean);
  const volumes = (quotes.volume || []).filter(Boolean);

  if (closes.length < 20) throw new Error(`Only ${closes.length} days of data for ${symbol}`);

  // ── Moving averages ───────────────────────────────────────────────────────────
  const sma = (n) => {
    if (closes.length < n) return null;
    return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
  };

  const ma50  = sma(50);
  const ma150 = sma(150);
  const ma200 = sma(200);

  // ── MA200 trend: compare current vs 22 trading days ago ──────────────────────
  const ma200Trending = (() => {
    if (closes.length < 222) return null;
    const oldMa200 = closes.slice(-222, -22).reduce((a, b) => a + b, 0) / 200;
    return ma200 !== null ? ma200 > oldMa200 : null;
  })();

  // ── Current price & 1D change ─────────────────────────────────────────────────
  const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];

  const changePct =
    meta.regularMarketChangePercent != null
      ? meta.regularMarketChangePercent
      : meta.regularMarketPreviousClose
        ? ((currentPrice - meta.regularMarketPreviousClose) / meta.regularMarketPreviousClose) * 100
        : closes.length >= 2
          ? ((closes[closes.length-1] - closes[closes.length-2]) / closes[closes.length-2]) * 100
          : 0;

  // ── 52-week range ─────────────────────────────────────────────────────────────
  const high52w = meta.fiftyTwoWeekHigh ?? (highs.length ? Math.max(...highs) : null);
  const low52w  = meta.fiftyTwoWeekLow  ?? (lows.length  ? Math.min(...lows)  : null);

  // ── Pivot: highest high of last 15 trading days (recent resistance) ───────────
  // This is the breakout level — price needs to close above this on volume
  const recentHighs15 = highs.slice(-15);
  const pivotFromData = recentHighs15.length ? Math.max(...recentHighs15) : null;

  // ── Base tightness: std-dev of last 15 closes as % of price ──────────────────
  // Lower = tighter = better VCP quality
  const baseTightness = (() => {
    const n = Math.min(15, closes.length);
    const slice = closes.slice(-n);
    const mean = slice.reduce((a, b) => a + b, 0) / n;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return currentPrice ? (Math.sqrt(variance) / currentPrice) * 100 : null;
  })();

  // ── ATR% (14-day Average True Range as % of price) ───────────────────────────
  // Used to size stop-loss; lower ATR = less volatile, easier to hold
  const atrPct = (() => {
    const n = Math.min(14, closes.length - 1);
    if (n < 1) return null;
    let totalTR = 0;
    for (let i = closes.length - n; i < closes.length; i++) {
      const high = highs[i] || closes[i];
      const low  = lows[i]  || closes[i];
      const prev = closes[i - 1] || closes[i];
      totalTR += Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
    }
    return currentPrice ? (totalTR / n / currentPrice) * 100 : null;
  })();

  // ── Average volume (20-day) ───────────────────────────────────────────────────
  const avgVol20 = volumes.length >= 20
    ? Math.round(volumes.slice(-20).reduce((a, b) => a + b, 0) / 20)
    : null;

  return {
    symbol,
    currency:      meta.currency  || "INR",
    companyName:   meta.shortName || meta.longName || symbol,
    sector:        meta.sector    || "",
    currentPrice:  r2(currentPrice),
    changePct:     r2(changePct),
    high52w:       r2(high52w),
    low52w:        r2(low52w),
    ma50:          ma50  ? r2(ma50)  : null,
    ma150:         ma150 ? r2(ma150) : null,
    ma200:         ma200 ? r2(ma200) : null,
    ma200Trending,
    pivotFromData: pivotFromData ? r2(pivotFromData) : null,
    baseTightness: baseTightness ? r2(baseTightness) : null,
    atrPct:        atrPct        ? r2(atrPct)        : null,
    avgVol20,
    dataPoints:    closes.length,
    lastUpdated:   meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

function r2(n) {
  return n != null ? Math.round(Number(n) * 100) / 100 : null;
}

// ─── SEPA scoring + entry zone ────────────────────────────────────────────────
function scoreSEPA(d) {
  const { currentPrice: p, ma50, ma150, ma200, high52w, low52w, ma200Trending, pivotFromData, baseTightness, avgVol20 } = d;
  const c = {};

  // C1: Price > MA200 AND Price > MA150
  c.C1 = {
    pass: !!(p && ma200 && ma150 && p > ma200 && p > ma150),
    detail: ma200 && ma150 ? `₹${p} vs MA200 ₹${ma200} · MA150 ₹${ma150}` : "Insufficient MA data",
  };

  // C2: MA150 > MA200
  c.C2 = {
    pass: !!(ma150 && ma200 && ma150 > ma200),
    detail: ma150 && ma200 ? `MA150 ₹${ma150} ${ma150 > ma200 ? ">" : "<"} MA200 ₹${ma200}` : "Insufficient MA data",
  };

  // C3: MA200 trending up
  c.C3 = {
    pass: ma200Trending === true,
    detail: ma200Trending === true ? "MA200 rising over past ~1 month"
          : ma200Trending === false ? "MA200 flat or declining"
          : "Need 222+ days of data",
  };

  // C4: MA50 > MA150 AND MA50 > MA200 (proper bullish stack)
  c.C4 = {
    pass: !!(ma50 && ma150 && ma200 && ma50 > ma150 && ma50 > ma200),
    detail: ma50 && ma150 && ma200 ? `MA50 ₹${ma50} · MA150 ₹${ma150} · MA200 ₹${ma200}` : "Insufficient MA data",
  };

  // C5: Price >= 25% above 52W low
  const pctAboveLow = low52w ? ((p - low52w) / low52w) * 100 : null;
  c.C5 = {
    pass: pctAboveLow !== null && pctAboveLow >= 25,
    detail: pctAboveLow !== null ? `+${pctAboveLow.toFixed(1)}% above 52W low ₹${low52w}` : "52W low unavailable",
  };

  // C6: Price within 25% of 52W high
  const pctBelowHigh = high52w ? ((p - high52w) / high52w) * 100 : null;
  c.C6 = {
    pass: pctBelowHigh !== null && pctBelowHigh >= -25,
    detail: pctBelowHigh !== null ? `${pctBelowHigh.toFixed(1)}% from 52W high ₹${high52w}` : "52W high unavailable",
  };

  // C7: RS proxy
  const trendScore =
    (c.C1.pass ? 20 : 0) + (c.C2.pass ? 15 : 0) + (c.C3.pass ? 15 : 0) + (c.C4.pass ? 15 : 0) +
    (pctAboveLow  !== null ? Math.min(pctAboveLow  * 0.3, 20) : 0) +
    (pctBelowHigh !== null ? Math.max(0, 25 + pctBelowHigh) * 0.6 : 0);
  const rsProxy = Math.min(99, Math.max(1, Math.round(trendScore)));
  c.C7 = { pass: rsProxy >= 70, detail: `RS ~${rsProxy} (trend-proxy vs Nifty50)`, rsRating: rsProxy };

  // C8: VCP / base tightness — stddev of last 15 closes < 4% of price = tight base
  const isTight = baseTightness !== null && baseTightness < 4;
  const distFromMa50 = ma50 && p ? Math.abs((p - ma50) / ma50) * 100 : null;
  const c8pass = !!(isTight && c.C1.pass && c.C2.pass);
  c.C8 = {
    pass: c8pass,
    detail: baseTightness !== null
      ? `Base tightness: ${baseTightness.toFixed(1)}% σ — ${c8pass ? "VCP forming ✓" : baseTightness >= 4 ? "too loose" : "not in uptrend"}`
      : distFromMa50 !== null
        ? `${distFromMa50.toFixed(1)}% from MA50`
        : "Insufficient data",
  };

  // ── Pivot & entry zone ─────────────────────────────────────────────────────────
  // Pivot = highest high of last 15 days (real resistance level)
  // Buy zone = 0% to +5% above pivot (Minervini's rule: never chase more than 5%)
  const pivot = pivotFromData || (ma50 ? r2(ma50 * 1.02) : null);
  const pivotPct = pivot ? ((p - pivot) / pivot) * 100 : null;

  // C9: Price must be in buy zone — at or just above pivot, NOT extended
  // Extended = more than 5% above pivot = DO NOT BUY (you're chasing)
  const entryZone =
    pivotPct === null   ? "UNKNOWN"      :
    pivotPct > 5        ? "EXTENDED"     :   // Already broke out, too late
    pivotPct >= 0       ? "IN_BUY_ZONE"  :   // Perfect — at or just above pivot
    pivotPct >= -3      ? "NEAR_PIVOT"   :   // Very close, watch for breakout
                          "BELOW_PIVOT";      // Not ready yet

  c.C9 = {
    // pass: entryZone === "IN_BUY_ZONE",
    pass: ["IN_BUY_ZONE", "NearPivot"].includes(entryZone),
    detail: pivot
      ? `${pivotPct !== null ? (pivotPct >= 0 ? "+" : "") + pivotPct.toFixed(1) + "% vs pivot ₹" + pivot : "pivot ₹" + pivot}`
      : "Pivot unavailable",
    entryZone,
    pivot,
    pivotPct: pivotPct !== null ? r2(pivotPct) : null,
  };

  // C10: 20-day average volume >= 100,000 (sufficient liquidity)
  const VOL_MIN = 100_000;
  c.C10 = {
    pass: avgVol20 !== null && avgVol20 >= VOL_MIN,
    detail: avgVol20 !== null
      ? `Avg vol ${(avgVol20 / 1000).toFixed(0)}K — ${avgVol20 >= VOL_MIN ? "liquid ✓" : "below 100K threshold"}`
      : "Volume data unavailable",
    avgVol20,
  };

  // ── Stop loss: 7-8% below pivot (Minervini's standard initial stop) ───────────
  const stopLoss = pivot ? r2(pivot * 0.925) : null;  // 7.5% below pivot

  // ── Risk/Reward: upside to 52W high vs downside to stop ──────────────────────
  const riskReward = (stopLoss && high52w && p)
    ? r2((high52w - p) / (p - stopLoss))
    : null;

  // ── Final verdict ─────────────────────────────────────────────────────────────
  // Minervini: BUY_READY requires SEPA criteria + must be IN buy zone (not extended)
  const sepaScore = Object.values(c).filter((x) => x.pass).length; // out of 10 now

  const verdict =
    sepaScore >= 8 && entryZone === "IN_BUY_ZONE"  ? "BUY_READY"     :
    sepaScore >= 8 && entryZone === "EXTENDED"      ? "EXTENDED"      :
    sepaScore >= 8 && entryZone === "NEAR_PIVOT"    ? "NEAR_PIVOT"    :
    sepaScore >= 6                                  ? "WATCH"         :
                                                      "AVOID";

  const stage =
    c.C1.pass && c.C2.pass && c.C3.pass && c.C4.pass ? "Stage 2" :
    c.C1.pass && c.C2.pass                            ? "Stage 1" :
    p && ma200 && p < ma200 * 0.95                    ? "Stage 4" : "Stage 3";

  return { criteria: c, sepaScore, verdict, stage, rsRating: rsProxy, entryZone, pivot, stopLoss, riskReward };
}

// ─── Claude: narrative notes ──────────────────────────────────────────────────
async function generateNotes(scoredStocks) {
  const input = scoredStocks.map((s) => ({
    ticker: s.ticker, company: s.companyName,
    price: s.currentPrice, verdict: s.verdict,
    entryZone: s.entryZone, pivot: s.pivot,
    stage: s.stage, sepaScore: s.sepaScore,
    stopLoss: s.stopLoss, riskReward: s.riskReward,
    baseTightness: s.baseTightness, atrPct: s.atrPct,
    failedCriteria: Object.entries(s.criteria).filter(([,v]) => !v.pass).map(([k]) => k),
  }));

  const prompt = `You are a Mark Minervini-style trader analyzing Indian stocks.

SEPA data is pre-calculated. Write a concise 1-2 sentence trade note per stock covering:
- For EXTENDED stocks: warn clearly they have already broken out, do not chase
- For IN_BUY_ZONE: describe the setup quality and what confirms the entry
- For NEAR_PIVOT: what to watch for before buying
- For WATCH/AVOID: what's missing or wrong

Return ONLY a JSON array, no markdown:
[{"ticker":"X","note":"..."}]

Stocks: ${JSON.stringify(input, null, 2)}`;

  const resp = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text  = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const match = text.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

// ─── Route handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { tickers, exchange } = req.body || {};
  if (!Array.isArray(tickers) || tickers.length === 0)
    return res.status(400).json({ error: "No tickers provided" });
  if (tickers.length > 50)
    return res.status(400).json({ error: "Maximum 50 stocks per request" });

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ── 1. Fetch Yahoo Finance data ───────────────────────────────────────────────
  const fetchResults = await Promise.allSettled(
    tickers.map((t) => fetchYahooData(`${t}.${exchange}`))
  );

  const goodData = [], errors = [];
  fetchResults.forEach((r, i) => {
    if (r.status === "fulfilled") goodData.push({ ticker: tickers[i], ...r.value });
    else errors.push({ ticker: tickers[i], error: r.reason?.message || "Unknown error" });
  });

  if (goodData.length === 0)
    return res.status(500).json({ error: "Failed to fetch data from Yahoo Finance", details: errors });

  // ── 2. Score SEPA (pure JS math) ──────────────────────────────────────────────
  const scored = goodData.map((s) => ({ ...s, ...scoreSEPA(s) }));

  // ── 3. Claude generates narrative notes ───────────────────────────────────────
  let notes = [];
  try { notes = await generateNotes(scored); }
  catch (err) { console.warn("Notes failed:", err.message); }
  const noteMap = Object.fromEntries(notes.map((n) => [n.ticker, n]));

  // ── 4. Final response ─────────────────────────────────────────────────────────
  const stocks = scored.map((s) => ({
    ticker:       s.ticker,
    yf_symbol:    `${s.ticker}.${exchange}`,
    company:      s.companyName,
    sector:       s.sector,
    price:        s.currentPrice,
    change_pct:   s.changePct,
    high_52w:     s.high52w,
    low_52w:      s.low52w,
    ma50:         s.ma50,
    ma150:        s.ma150,
    ma200:        s.ma200,
    rs_rating:    s.rsRating,
    stage:        s.stage,
    criteria:     s.criteria,
    sepa_score:   s.sepaScore,
    verdict:      s.verdict,
    entry_zone:   s.entryZone,
    pivot:        s.pivot,
    pivot_pct:    s.criteria.C9?.pivotPct ?? null,
    stop_loss:    s.stopLoss,
    risk_reward:  s.riskReward,
    base_tightness: s.baseTightness,
    atr_pct:      s.atrPct,
    avg_vol20:    s.avgVol20,
    note:         noteMap[s.ticker]?.note ?? "",
    data_source:  `Yahoo Finance · Real-time · ${today}`,
    data_points:  s.dataPoints,
    last_updated: s.lastUpdated,
  }));

  return res.status(200).json({
    stocks,
    errors: errors.length ? errors : undefined,
    meta: { fetched: goodData.length, failed: errors.length, exchange, ts: new Date().toISOString() },
  });
}

export const config = {
  api: { responseLimit: "10mb" },
  maxDuration: 60,
};
