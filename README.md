# 🇮🇳 Minervini India SEPA Screener

Screen NSE/BSE stocks against Mark Minervini's SEPA criteria using **real Yahoo Finance data**.

## How data is fetched (v2 — accurate prices)

| Step | What happens |
|------|-------------|
| 1 | Serverless function calls `query1.finance.yahoo.com/v8/finance/chart/{TICKER}.NS` directly |
| 2 | Downloads **1 year of daily OHLCV** candles per stock |
| 3 | Calculates **MA50, MA150, MA200** from actual close prices |
| 4 | Scores all **8 SEPA criteria** in pure JavaScript (no AI hallucination) |
| 5 | Claude writes a **1-sentence trading note** per stock (only narrative, not prices) |

> **v1 problem:** Claude used web search to guess prices → unreliable  
> **v2 fix:** Yahoo Finance API called directly → exact real-time prices & calculated MAs

---

## 🚀 Deploy to Vercel (5 minutes)

### 1 — Get your Anthropic API key
[console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key

### 2 — Push to GitHub
```bash
git init
git add .
git commit -m "Minervini India Screener v2"
git remote add origin https://github.com/YOUR_USERNAME/minervini-india-screener.git
git push -u origin main
```

### 3 — Deploy on Vercel
1. [vercel.com](https://vercel.com) → Add New Project → import repo
2. Add environment variable:  
   `ANTHROPIC_API_KEY` = your key from step 1
3. Click **Deploy** 🎉

---

## Run locally
```bash
npm install
cp .env.local.example .env.local   # add your Anthropic key
npm run dev
# → http://localhost:3000
```

---

## Project structure
```
pages/
  index.js          React UI
  api/
    analyze.js      Serverless: fetches Yahoo Finance + scores SEPA
styles/
  globals.css
  Home.module.css
```

---

## Minervini SEPA Criteria
| # | Criterion | Scored by |
|---|-----------|-----------|
| C1 | Price > MA200 & MA150 | JS (exact) |
| C2 | MA150 > MA200 | JS (exact) |
| C3 | MA200 trending up | JS (exact, 22-day comparison) |
| C4 | MA50 > MA150 & MA200 | JS (exact) |
| C5 | Price ≥ 25% above 52W low | JS (exact) |
| C6 | Price within 25% of 52W high | JS (exact) |
| C7 | RS ≥ 70 vs Nifty 50 | JS proxy (trend strength) |
| C8 | VCP / tight pattern | JS proxy (distance from MA50) |

> ⚠️ Educational only. Not SEBI-registered advice.
