import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Yahoo Finance direct fetcher ─────────────────────────────────────────────
async function fetchYahooData(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1y&includePrePost=false`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

  // Filter out null values but keep alignment by working with full arrays
  const rawCloses  = quotes.close  || [];
  const rawHighs   = quotes.high   || [];
  const rawLows    = quotes.low    || [];
  const rawVolumes = quotes.volume || [];
  const timestamps = result.timestamp || [];

  // Build clean arrays (skip null candles)
  const closes  = rawCloses.filter(Boolean);
  const highs   = rawHighs.filter(Boolean);
  const lows    = rawLows.filter(Boolean);
  const volumes = rawVolumes.filter(Boolean);

  if (closes.length < 20) throw new Error(`Only ${closes.length} days of data for ${symbol} — need at least 20`);

  // ── Simple Moving Averages ────────────────────────────────────────────────────
  const sma = (n) => {
    if (closes.length < n) return null;
    const slice = closes.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  const ma50  = sma(50);
  const ma150 = sma(150);
  const ma200 = sma(200);

  // ── MA200 trend: compare today's MA200 vs MA200 from 22 trading days ago ──────
  const ma200Trending = (() => {
    if (closes.length < 222) return null;
    const oldMa200 = closes.slice(-222, -22).reduce((a, b) => a + b, 0) / 200;
    return ma200 !== null ? ma200 > oldMa200 : null;
  })();

  // ── Prices ───────────────────────────────────────────────────────────────────
  const currentPrice =
    meta.regularMarketPrice ||
    closes[closes.length - 1];

  // Use Yahoo's own 1-day change% directly — most reliable.
  // regularMarketChangePercent is already the correct 1D %.
  // chartPreviousClose is the start-of-range close (1yr ago) — never use it for daily change.
  const changePct =
    meta.regularMarketChangePercent != null
      ? meta.regularMarketChangePercent          // Yahoo gives this directly, already %
      : meta.regularMarketPreviousClose
        ? ((currentPrice - meta.regularMarketPreviousClose) / meta.regularMarketPreviousClose) * 100
        : closes.length >= 2
          ? ((closes[closes.length-1] - closes[closes.length-2]) / closes[closes.length-2]) * 100
          : 0;

  // ── 52W high/low: use meta first (more accurate), fallback to computed ─────────
  const high52w = meta.fiftyTwoWeekHigh  ?? (highs.length  ? Math.max(...highs)  : null);
  const low52w  = meta.fiftyTwoWeekLow   ?? (lows.length   ? Math.min(...lows)   : null);

  // ── Average volume (20-day) ───────────────────────────────────────────────────
  const avgVol20 = volumes.length >= 20
    ? Math.round(volumes.slice(-20).reduce((a, b) => a + b, 0) / 20)
    : null;

  return {
    symbol,
    currency:      meta.currency   || "INR",
    companyName:   meta.shortName  || meta.longName || symbol,
    sector:        meta.sector     || "",
    currentPrice:  r2(currentPrice),
    changePct:     r2(changePct),
    high52w:       r2(high52w),
    low52w:        r2(low52w),
    ma50:          ma50  ? r2(ma50)  : null,
    ma150:         ma150 ? r2(ma150) : null,
    ma200:         ma200 ? r2(ma200) : null,
    ma200Trending,
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

// ─── SEPA scoring (pure JS — deterministic, zero hallucination) ───────────────
function scoreSEPA(d) {
  const { currentPrice: p, ma50, ma150, ma200, high52w, low52w, ma200Trending } = d;
  const c = {};

  // C1: Price > MA200 AND Price > MA150
  c.C1 = {
    pass: !!(p && ma200 && ma150 && p > ma200 && p > ma150),
    detail: ma200 && ma150
      ? `₹${p} vs MA200 ₹${ma200} · MA150 ₹${ma150}`
      : "Insufficient MA data",
  };

  // C2: MA150 > MA200
  c.C2 = {
    pass: !!(ma150 && ma200 && ma150 > ma200),
    detail: ma150 && ma200
      ? `MA150 ₹${ma150} ${ma150 > ma200 ? ">" : "<"} MA200 ₹${ma200}`
      : "Insufficient MA data",
  };

  // C3: MA200 trending up (vs 22 trading days ago)
  c.C3 = {
    pass: ma200Trending === true,
    detail:
      ma200Trending === true  ? "MA200 rising over past ~1 month" :
      ma200Trending === false ? "MA200 flat or declining" :
                                "Need 222+ days of data",
  };

  // C4: MA50 > MA150 AND MA50 > MA200 (proper bullish stack)
  c.C4 = {
    pass: !!(ma50 && ma150 && ma200 && ma50 > ma150 && ma50 > ma200),
    detail: ma50 && ma150 && ma200
      ? `MA50 ₹${ma50} · MA150 ₹${ma150} · MA200 ₹${ma200}`
      : "Insufficient MA data",
  };

  // C5: Price >= 25% above 52W low
  const pctAboveLow = low52w ? ((p - low52w) / low52w) * 100 : null;
  c.C5 = {
    pass: pctAboveLow !== null && pctAboveLow >= 25,
    detail: pctAboveLow !== null
      ? `+${pctAboveLow.toFixed(1)}% above 52W low ₹${low52w}`
      : "52W low unavailable",
  };

  // C6: Price within 25% of 52W high
  const pctBelowHigh = high52w ? ((p - high52w) / high52w) * 100 : null;
  c.C6 = {
    pass: pctBelowHigh !== null && pctBelowHigh >= -25,
    detail: pctBelowHigh !== null
      ? `${pctBelowHigh.toFixed(1)}% from 52W high ₹${high52w}`
      : "52W high unavailable",
  };

  // C7: Relative Strength proxy vs Nifty50
  // (Real RS needs Nifty data; proxy = weighted sum of trend criteria + distance metrics)
  const trendScore =
    (c.C1.pass ? 20 : 0) +
    (c.C2.pass ? 15 : 0) +
    (c.C3.pass ? 15 : 0) +
    (c.C4.pass ? 15 : 0) +
    (pctAboveLow  !== null ? Math.min(pctAboveLow  * 0.3, 20) : 0) +
    (pctBelowHigh !== null ? Math.max(0, 25 + pctBelowHigh) * 0.6 : 0);
  const rsProxy = Math.min(99, Math.max(1, Math.round(trendScore)));
  c.C7 = {
    pass: rsProxy >= 70,
    detail: `RS ~${rsProxy} (trend-proxy vs Nifty50)`,
    rsRating: rsProxy,
  };

  // C8: VCP proxy — price near MA50 (within 8%) suggesting tight consolidation
  const distFromMa50 = ma50 && p ? Math.abs((p - ma50) / ma50) * 100 : null;
  const c8pass = !!(distFromMa50 !== null && distFromMa50 < 8 && c.C1.pass && c.C2.pass);
  c.C8 = {
    pass: c8pass,
    detail: distFromMa50 !== null
      ? `${distFromMa50.toFixed(1)}% from MA50 — ${c8pass ? "tight basing near highs" : "not in VCP"}`
      : "Insufficient data",
  };

  const sepaScore = Object.values(c).filter((x) => x.pass).length;
  const verdict   = sepaScore >= 6 ? "BUY_READY" : sepaScore >= 4 ? "WATCH" : "AVOID";

  const stage =
    c.C1.pass && c.C2.pass && c.C3.pass && c.C4.pass ? "Stage 2" :
    c.C1.pass && c.C2.pass                            ? "Stage 1" :
    p && ma200 && p < ma200 * 0.95                    ? "Stage 4" : "Stage 3";

  return { criteria: c, sepaScore, verdict, stage, rsRating: rsProxy };
}

// ─── Claude: narrative notes + pivot only ─────────────────────────────────────
async function generateNotes(scoredStocks) {
  const input = scoredStocks.map((s) => ({
    ticker:     s.ticker,
    company:    s.companyName,
    price:      s.currentPrice,
    high52w:    s.high52w,
    low52w:     s.low52w,
    ma50:       s.ma50,
    ma150:      s.ma150,
    ma200:      s.ma200,
    sepaScore:  s.sepaScore,
    verdict:    s.verdict,
    stage:      s.stage,
    criteriaPassCount: s.sepaScore,
    failedCriteria: Object.entries(s.criteria)
      .filter(([, v]) => !v.pass)
      .map(([k]) => k),
  }));

  const prompt = `You are a Mark Minervini-style stock analyst reviewing Indian stocks.

The SEPA scores and criteria have ALREADY been calculated from real Yahoo Finance data.
Your job is ONLY to:
1. Write a concise 1-2 sentence trading note per stock (what's good/bad about the setup, what to watch)
2. Suggest a pivot/breakout entry price in ₹ (just above recent resistance — use MA50 as base, add 1-3%)

Return ONLY a JSON array — no markdown, no backticks:
[{"ticker":"X","note":"...","pivot":1234.00}]

Stocks:
${JSON.stringify(input, null, 2)}`;

  const resp = await client.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages:   [{ role: "user", content: prompt }],
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
  if (tickers.length > 500)
    return res.status(400).json({ error: "Maximum 50 stocks per request" });

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  // ── 1. Fetch Yahoo Finance data for all tickers in parallel ──────────────────
  const fetchResults = await Promise.allSettled(
    tickers.map((t) => fetchYahooData(`${t}.${exchange}`))
  );

  const goodData = [];
  const errors   = [];

  fetchResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      goodData.push({ ticker: tickers[i], ...r.value });
    } else {
      errors.push({ ticker: tickers[i], error: r.reason?.message || "Unknown error" });
    }
  });

  if (goodData.length === 0)
    return res.status(500).json({
      error: "Failed to fetch data from Yahoo Finance for all requested stocks",
      details: errors,
    });

  // ── 2. Score SEPA criteria (pure math, no AI) ─────────────────────────────────
  const scored = goodData.map((s) => ({ ...s, ...scoreSEPA(s) }));

  // ── 3. Generate narrative notes with Claude ───────────────────────────────────
  let notes = [];
  try {
    notes = await generateNotes(scored);
  } catch (err) {
    console.warn("Note generation failed (non-fatal):", err.message);
  }
  const noteMap = Object.fromEntries(notes.map((n) => [n.ticker, n]));

  // ── 4. Build final response ───────────────────────────────────────────────────
  const stocks = scored.map((s) => ({
    ticker:      s.ticker,
    yf_symbol:   `${s.ticker}.${exchange}`,
    company:     s.companyName,
    sector:      s.sector,
    price:       s.currentPrice,
    change_pct:  s.changePct,
    high_52w:    s.high52w,
    low_52w:     s.low52w,
    ma50:        s.ma50,
    ma150:       s.ma150,
    ma200:       s.ma200,
    rs_rating:   s.rsRating,
    stage:       s.stage,
    criteria:    s.criteria,
    sepa_score:  s.sepaScore,
    verdict:     s.verdict,
    pivot:       noteMap[s.ticker]?.pivot ?? (s.ma50 ? r2(s.ma50 * 1.015) : null),
    note:        noteMap[s.ticker]?.note  ?? "",
    data_source: `Yahoo Finance · Real-time · ${today}`,
    data_points: s.dataPoints,
    last_updated: s.lastUpdated,
  }));

  return res.status(200).json({
    stocks,
    errors: errors.length ? errors : undefined,
    meta: { fetched: goodData.length, failed: errors.length, exchange, ts: new Date().toISOString() },
  });
}


export const config = {
  api:         { responseLimit: "10mb" },
  maxDuration: 60,
};
