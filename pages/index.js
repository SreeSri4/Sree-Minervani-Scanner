import { useState, useRef } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const PRESETS = {
  nifty:    ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','SBIN','BAJFINANCE','BHARTIARTL','KOTAKBANK','LT','ASIANPAINT','AXISBANK','MARUTI','SUNPHARMA'],
  it:       ['TCS','INFY','WIPRO','HCLTECH','TECHM','LTIM','MPHASIS','COFORGE','PERSISTENT','KPITTECH'],
  bank:     ['HDFCBANK','ICICIBANK','SBIN','KOTAKBANK','AXISBANK','BANDHANBNK','FEDERALBNK','IDFCFIRSTB','INDUSINDBK','PNB'],
  smallcap: ['IRCTC','DIXON','POLYCAB','ASTRAL','GRINDWELL','PAGEIND','METROPOLIS','TIINDIA','LAXMIMACH','CAMS'],
  momentum: ['ADANIENT','SIEMENS','CUMMINSIND','ZOMATO','IRFC','RAILVIKAS','RVNL','BEL','HAL','COCHINSHIP'],
}

const CRIT_LABELS = {
  C1:'Price > MA200 & MA150',  C2:'MA150 > MA200',
  C3:'MA200 trending up',      C4:'MA50 > MA150 & MA200',
  C5:'≥25% above 52W low',     C6:'Within 25% of 52W high',
  C7:'RS ≥ 70 vs Nifty 50',    C8:'VCP / tight pattern',
}

const SEPA_CRITERIA = [
  'Price above 200-day & 150-day MA',
  '150-day MA above 200-day MA',
  '200-day MA trending up ≥ 1 month',
  '50-day MA above 150-day & 200-day',
  'Price ≥ 25% above 52-week low',
  'Price within 25% of 52-week high',
  'RS Rating ≥ 70 vs Nifty 50',
  'VCP / tight consolidation near highs',
]

function inr(n) {
  if (n == null) return '—'
  return '₹' + new Intl.NumberFormat('en-IN').format(Math.round(Number(n)))
}

export default function Home() {
  const [tickers, setTickers]       = useState([])
  const [exchange, setExchange]     = useState('NS')
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [stocks, setStocks]         = useState(null)
  const [error, setError]           = useState('')
  const [fetchErrors, setFetchErrors] = useState([])
  const inputRef = useRef(null)

  function addTicker(val) {
    const raw = (val || input).trim().toUpperCase().replace(/[^A-Z0-9&]/g, '')
    if (!raw) return
    if (tickers.includes(raw)) { setInput(''); return }
    if (tickers.length >= 15) { alert('Max 15 stocks at a time'); return }
    setTickers(prev => [...prev, raw])
    setInput('')
    inputRef.current?.focus()
  }

  function removeTicker(t) { setTickers(prev => prev.filter(x => x !== t)) }
  function loadPreset(key) { setTickers([...PRESETS[key]]) }
  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTicker() }
  }

  async function analyze() {
    if (!tickers.length) return
    setLoading(true)
    setError('')
    setStocks(null)
    setFetchErrors([])

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, exchange }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Analysis failed')
      setStocks(data.stocks)
      if (data.errors?.length) setFetchErrors(data.errors)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const buy    = stocks?.filter(s => s.verdict === 'BUY_READY') || []
  const watch  = stocks?.filter(s => s.verdict === 'WATCH')     || []
  const avoid  = stocks?.filter(s => s.verdict === 'AVOID')     || []
  const sorted = [...buy, ...watch, ...avoid]

  return (
    <>
      <Head>
        <title>Minervini India SEPA Screener</title>
        <meta name="description" content="Screen Indian stocks using Mark Minervini SEPA methodology — live Yahoo Finance data" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🇮🇳</text></svg>" />
      </Head>

      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logo}>🇮🇳</div>
          <div className={styles.titleBlock}>
            <h1>Minervini India SEPA Screener <span className={styles.badge}>NSE · BSE</span></h1>
            <p>Direct Yahoo Finance API · MA Calculated from Real OHLCV Data · ₹ INR</p>
          </div>
        </div>

        {/* Input card */}
        <div className={styles.card}>
          <div className={styles.sectionLabel}>Exchange</div>
          <div className={styles.toggleRow}>
            <button className={`${styles.exchBtn} ${exchange==='NS'?styles.active:''}`} onClick={() => setExchange('NS')}>NSE (.NS)</button>
            <button className={`${styles.exchBtn} ${exchange==='BO'?styles.active:''}`} onClick={() => setExchange('BO')}>BSE (.BO)</button>
            <span className={styles.exchNote}>Suffix auto-appended for Yahoo Finance API</span>
          </div>

          <div className={styles.sectionLabel}>Stock Symbols</div>
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              className={styles.tickerInput}
              type="text"
              placeholder="e.g. RELIANCE, TCS, INFY"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={handleKey}
              maxLength={20}
            />
            <button className={styles.addBtn} onClick={() => addTicker()}>+ Add</button>
          </div>

          {tickers.length > 0 && (
            <div className={styles.chips}>
              {tickers.map(t => (
                <div key={t} className={styles.chip}>
                  {t}<span className={styles.chipSuffix}>.{exchange}</span>
                  <button className={styles.chipRm} onClick={() => removeTicker(t)}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className={styles.presets}>
            <span className={styles.presetLabel}>Quick sets:</span>
            {[['nifty','Nifty Top 15'],['it','IT Sector'],['bank','Banking'],['smallcap','Small/Mid Cap'],['momentum','Momentum']].map(([k,l]) => (
              <button key={k} className={styles.presetBtn} onClick={() => loadPreset(k)}>{l}</button>
            ))}
          </div>

          <button className={styles.analyzeBtn} onClick={analyze} disabled={loading || tickers.length === 0}>
            {loading ? (
              <><span className={styles.btnSpinner} /> Fetching real-time data from Yahoo Finance...</>
            ) : (
              <><SearchIcon /> Analyze with Minervini SEPA Criteria</>
            )}
          </button>
        </div>

        {/* Criteria card */}
        <div className={styles.card}>
          <div className={styles.sectionLabel}>8 Minervini SEPA Filters — scored from real Yahoo Finance data</div>
          <div className={styles.criteriaGrid}>
            {SEPA_CRITERIA.map((c, i) => (
              <div key={i} className={styles.critItem}>
                <div className={styles.critDot} /><span>{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className={styles.card}>
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <div className={styles.loadingText}>
                Fetching: {tickers.map(t=>`${t}.${exchange}`).join(', ')}
              </div>
              <div className={styles.loadingSub}>
                Pulling 1-year OHLCV history · Calculating MA50 / MA150 / MA200<br />
                Scoring all 8 SEPA criteria · Takes 5–15 seconds
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={styles.errBox}>
            <div className={styles.errIcon}>⚠</div>
            <div className={styles.errTitle}>Analysis Failed</div>
            <div className={styles.errMsg}>{error}</div>
            <div className={styles.errHint}>Check the ticker symbol or try again</div>
          </div>
        )}

        {/* Partial fetch errors */}
        {fetchErrors.length > 0 && (
          <div className={styles.warnBox}>
            <strong>⚠ Could not fetch data for:</strong>{' '}
            {fetchErrors.map(e => `${e.ticker} (${e.error})`).join(' · ')}
          </div>
        )}

        {/* Results */}
        {stocks && !loading && (
          <>
            <div className={styles.infoBar}>
              <LiveIcon />
              Real-time data from Yahoo Finance API · {exchange==='NS'?'NSE':'BSE'} · MAs calculated from 1-year OHLCV history · Prices in ₹
            </div>

            <div className={styles.summaryBar}>
              <div className={`${styles.sumPill} ${styles.total}`}><span className={styles.val}>{stocks.length}</span>&nbsp;Analyzed</div>
              <div className={`${styles.sumPill} ${styles.buyPill}`}><span className={styles.val}>{buy.length}</span>&nbsp;Buy Ready</div>
              <div className={`${styles.sumPill} ${styles.watchPill}`}><span className={styles.val}>{watch.length}</span>&nbsp;Watch</div>
              <div className={`${styles.sumPill} ${styles.avoidPill}`}><span className={styles.val}>{avoid.length}</span>&nbsp;Avoid</div>
            </div>

            {sorted.map((s, i) => (
              <StockCard key={s.ticker} stock={s} exchange={exchange} delay={i * 55} />
            ))}
          </>
        )}

        {!stocks && !loading && !error && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <div className={styles.emptyText}>Add stocks above and hit Analyze</div>
            <div className={styles.emptySub}>Prices & MAs fetched directly from Yahoo Finance API · All in ₹</div>
          </div>
        )}

        <div className={styles.disclaimer}>
          ⚠ Data fetched directly from Yahoo Finance API · MAs calculated from real OHLCV history<br />
          For educational purposes only · Not SEBI-registered advice · Verify with your broker before trading
        </div>
      </main>
    </>
  )
}

/* ── Stock Card ────────────────────────────────────────────── */
function StockCard({ stock: s, exchange, delay }) {
  const vc  = s.verdict==='BUY_READY' ? 'buyReady' : s.verdict==='WATCH' ? 'watchCard' : 'avoidCard'
  const bc  = s.verdict==='BUY_READY' ? 'buy'      : s.verdict==='WATCH' ? 'watch'     : 'avoid'
  const btx = s.verdict==='BUY_READY' ? '✦ BUY READY' : s.verdict==='WATCH' ? '◎ WATCH' : '✕ AVOID'
  const chg = parseFloat(s.change_pct) || 0
  const sc  = s.sepa_score >= 7 ? 'var(--green)' : s.sepa_score >= 5 ? 'var(--amber)' : 'var(--red)'
  const pfl = s.low_52w  ? (((s.price - s.low_52w)  / s.low_52w)  * 100).toFixed(1) : null
  const pfh = s.high_52w ? (((s.price - s.high_52w) / s.high_52w) * 100).toFixed(1) : null
  const yfu = `https://finance.yahoo.com/quote/${s.yf_symbol}/`

  return (
    <div className={`${styles.stockCard} ${styles[vc]}`} style={{ animationDelay:`${delay}ms` }}>
      {/* Top */}
      <div className={styles.cardTop}>
        <div>
          <div className={styles.tSym}>
            {s.ticker}
            <span className={`${styles.tag} ${styles.tagEx}`}>{exchange}</span>
            {s.stage==='Stage 2' && <span className={`${styles.tag} ${styles.tagS2}`}>Stage 2</span>}
            {(s.rs_rating||0)>=70 && <span className={`${styles.tag} ${styles.tagRs}`}>RS {s.rs_rating}</span>}
          </div>
          <div className={styles.tName}>
            {s.company}
            {s.sector && <span className={styles.tSector}> · {s.sector}</span>}
          </div>
          <a className={styles.tLink} href={yfu} target="_blank" rel="noopener noreferrer">
            ↗ {s.yf_symbol} on Yahoo Finance
          </a>
        </div>
        <div className={styles.rightCol}>
          <div className={`${styles.vtag} ${styles[bc]}`}>{btx}</div>
          <div className={styles.dataSource}>{s.data_source}</div>
          {s.data_points && <div className={styles.dataPoints}>{s.data_points} days of data</div>}
        </div>
      </div>

      {/* Prices */}
      <div className={styles.prow}>
        {[
          { label:'CMP',         val: inr(s.price),     cls:'' },
          { label:'Change',      val: `${chg>=0?'+':''}${chg.toFixed(2)}%`, cls: chg>=0?'pos':'neg' },
          { label:'52W High',    val: inr(s.high_52w),  cls:'' },
          { label:'52W Low',     val: inr(s.low_52w),   cls:'' },
          { label:'vs 52W Low',  val: pfl ? `+${pfl}%` : '—', cls:'pos' },
          { label:'vs 52W High', val: pfh ? `${pfh}%`  : '—', cls: pfh && parseFloat(pfh)>=-25 ? 'pos' : 'neg' },
          { label:'MA 50',       val: inr(s.ma50),      cls:'' },
          { label:'MA 150',      val: inr(s.ma150),     cls:'' },
          { label:'MA 200',      val: inr(s.ma200),     cls:'' },
        ].map(({ label, val, cls }) => (
          <div key={label} className={styles.pi}>
            <div className={styles.pl}>{label}</div>
            <div className={`${styles.pv} ${cls==='pos'?styles.pos:cls==='neg'?styles.neg:''}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Score bar */}
      <div className={styles.scoreRow}>
        <span className={styles.scoreLbl}>SEPA Score</span>
        <div className={styles.scoreTrack}>
          <div className={styles.scoreFill} style={{ width:`${(s.sepa_score/8)*100}%`, background:sc }} />
        </div>
        <span className={styles.scoreVal} style={{ color:sc }}>{s.sepa_score}/8</span>
      </div>

      {/* Criteria checks */}
      <div className={styles.checks}>
        {Object.entries(s.criteria||{}).map(([k,v]) => (
          <div key={k} className={styles.chk}>
            <div className={`${styles.chkIco} ${v.pass?styles.pass:styles.fail}`}>{v.pass?'✓':'✕'}</div>
            <span className={styles.chkLbl}>{CRIT_LABELS[k]||k}</span>
            <span className={styles.chkDet}>{(v.detail||'').substring(0,30)}</span>
          </div>
        ))}
      </div>

      {/* Pivot */}
      {s.pivot && (
        <div className={styles.pivotRow}>
          <span className={styles.pivotIcon}>◈</span>
          <span className={styles.pivotTxt}>Pivot / Breakout Entry — buy above on 2–3× avg volume</span>
          <span className={styles.pivotPrice}>{inr(s.pivot)}</span>
        </div>
      )}

      {/* Note */}
      {s.note && <div className={styles.noteBox}>📊 {s.note}</div>}
    </div>
  )
}

function SearchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
}
function LiveIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14M4.93 19.07 19.07 4.93" strokeWidth="0"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
}
