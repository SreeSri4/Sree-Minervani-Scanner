import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const PRESETS = {
  nifty:    ['RELIANCE','HDFCBANK','BHARTIARTL','SBIN','ICICIBANK','TCS','BAJFINANCE','HINDUNILVR','INFY','LT','SUNPHARMA','MARUTI','ITC','M&M','AXISBANK','NTPC','KOTAKBANK','TITAN','HCLTECH','ONGC','ULTRACEMCO','ADANIPORTS','BEL','COALINDIA','BAJAJFINSV','JSWSTEEL','POWERGRID','BAJAJ-AUTO','NESTLEIND','TATASTEEL','ADANIENT','ETERNAL','ASIANPAINT','HINDALCO','WIPRO','SBILIFE','EICHERMOT','SHRIRAMFIN','GRASIM','INDIGO','JIOFIN','HDFCLIFE','TECHM','TRENT','TMPV','TATACONSUM','APOLLOHOSP','DRREDDY','CIPLA','MAXHEALTH'],
  it:       ['TCS','INFY','WIPRO','HCLTECH','TECHM','LTIM','MPHASIS','COFORGE','PERSISTENT','KPITTECH'],
  bank:     ['HDFCBANK','ICICIBANK','SBIN','KOTAKBANK','AXISBANK','BANDHANBNK','FEDERALBNK','IDFCFIRSTB','INDUSINDBK','PNB'],
  smallcap: ['IRCTC','DIXON','POLYCAB','ASTRAL','GRINDWELL','PAGEIND','METROPOLIS','TIINDIA','CMSINFO','CAMS'],
  momentum: ['ADANIENT','SIEMENS','CUMMINSIND','ETERNAL','IRFC','DIXON','RVNL','BEL','HAL','COCHINSHIP'],
}

// ── Long criteria labels ────────────────────────────────────
const LONG_LABELS = {
  C1:'Price > MA200 & MA150', C2:'MA150 > MA200', C3:'MA200 trending up',
  C4:'MA50 > MA150 & MA200',  C5:'≥25% above 52W low', C6:'Within 25% of 52W high',
  C7:'RS ≥ 70 vs Nifty 50',   C8:'VCP tight base (<4% σ)', C9:'Entry within 5% of pivot',
  C10:'Avg 20D volume ≥ 100K',
}
const LONG_SEPA = [
  'Price above 200-day & 150-day MA','150-day MA above 200-day MA',
  '200-day MA trending up ≥ 1 month','50-day MA above 150-day & 200-day',
  'Price ≥ 25% above 52-week low','Price within 25% of 52-week high',
  'RS Rating ≥ 70 vs Nifty 50','VCP: base tightness < 4% σ',
  'Entry within 0–5% of pivot (no chasing)','Avg 20-day volume ≥ 100,000',
]

// ── Short criteria labels ───────────────────────────────────
const SHORT_LABELS = {
  S1:'Price < MA200 & MA150 (Stage 4)', S2:'MA150 < MA200 (bearish)',
  S3:'MA200 trending down',             S4:'MA50 < MA150 & MA200 (bear stack)',
  S5:'Within 30% of 52W low',           S6:'≥20% below 52W high (broken)',
  S7:'Lower highs pattern',             S8:'Weakness RS ≥ 70',
  S9:'Sales QOQ% declining',            S10:'EPS QOQ% declining',
}
const SHORT_CRITERIA_LIST = [
  'Price below 200-day & 150-day MA (Stage 4)','MA150 below MA200 (bearish stack)',
  'MA200 trending downward','MA50 < MA150 < MA200 (full bear stack)',
  'Price within 30% of 52-week low','Price ≥20% below 52-week high',
  'Lower highs price pattern confirmed','Weakness score ≥ 70 vs Nifty',
  'Sales QOQ% declining or decelerating','EPS QOQ% declining or decelerating',
]

// ── Zone/verdict configs ─────────────────────────────────────
const LONG_VERDICT = {
  BUY_READY:  { label:'✦ BUY READY',  cls:'buy'      },
  NEAR_PIVOT: { label:'◎ NEAR PIVOT', cls:'nearPiv'  },
  EXTENDED:   { label:'⚠ EXTENDED',   cls:'extended' },
  WATCH:      { label:'◉ WATCH',      cls:'watch'    },
  AVOID:      { label:'✕ AVOID',      cls:'avoid'    },
}
const LONG_ZONE = {
  IN_BUY_ZONE: { label:'✦ IN BUY ZONE',  cls:'zoneBuy',     panel:'zoneBuyPanel',      desc:'0–5% above pivot — ideal entry' },
  NEAR_PIVOT:  { label:'◎ NEAR PIVOT',   cls:'zoneNear',    panel:'zoneNearPanel',     desc:'Within 3% below pivot — watch' },
  EXTENDED:    { label:'⚠ EXTENDED',     cls:'zoneExtended',panel:'zoneExtendedPanel', desc:'>5% above pivot — do not chase' },
  BELOW_PIVOT: { label:'↓ BELOW PIVOT',  cls:'zoneBelow',   panel:'entryPanelDefault', desc:'Not at breakout level' },
  UNKNOWN:     { label:'? UNKNOWN',      cls:'zoneUnknown', panel:'entryPanelDefault', desc:'Pivot data unavailable' },
}
const SHORT_VERDICT = {
  SHORT_NOW:    { label:'▼ SHORT NOW',    cls:'shortNow'   },
  NEAR_SHORT:   { label:'◎ NEAR SHORT',  cls:'nearShort'  },
  WAIT_MA50:    { label:'⏳ WAIT MA50',   cls:'waitMa50'   },
  WATCH_SHORT:  { label:'◉ WATCH SHORT', cls:'watchShort' },
  AVOID_SHORT:  { label:'✕ AVOID',       cls:'avoid'      },
}
const SHORT_ZONE = {
  AT_RESISTANCE:  { label:'▼ AT RESISTANCE', cls:'zoneShortNow',  panel:'zoneShortNowPanel',  desc:'Right at MA50 resistance — ideal short entry' },
  APPROACHING:    { label:'↑ APPROACHING',   cls:'zoneApproach',  panel:'zoneApproachPanel',  desc:'Bouncing toward MA50, getting close' },
  ABOVE_MA50:     { label:'⚠ ABOVE MA50',    cls:'zoneAboveMa50', panel:'zoneAboveMa50Panel', desc:'Above MA50 — wait for rejection first' },
  DEEPLY_OVERSOLD:{ label:'↓ OVERSOLD',      cls:'zoneOversold',  panel:'entryPanelDefault',  desc:'Too far below MA50 — wait for bounce' },
  UNKNOWN:        { label:'? UNKNOWN',        cls:'zoneUnknown',   panel:'entryPanelDefault',  desc:'Zone data unavailable' },
}

function inr(n) {
  if (n == null) return '—'
  return '₹' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))
}
function pctFmt(n, decimals = 1) {
  if (n == null) return '—'
  const v = parseFloat(n)
  return (v >= 0 ? '+' : '') + v.toFixed(decimals) + '%'
}

export default function Home() {
  const [tickers, setTickers]         = useState([])
  const [exchange, setExchange]       = useState('NS')
  const [input, setInput]             = useState('')
  const [mode, setMode]               = useState('long')   // 'long' | 'short'
  const [loading, setLoading]         = useState(false)
  const [stocks, setStocks]           = useState(null)
  const [error, setError]             = useState('')
  const [fetchErrors, setFetchErrors] = useState([])
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [theme, setTheme]             = useState('light')
  const [priceBands, setPriceBands]   = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])

  // Fetch NSE price band data via our server-side API route (avoids CORS)
  useEffect(() => {
    async function fetchPriceBands() {
      try {
        const resp = await fetch('/api/pricebands')
        if (!resp.ok) { console.warn('[PriceBand] API error:', resp.status); return }
        const data = await resp.json()
        if (data.error) { console.warn('[PriceBand] API returned error:', data.error); return }
        console.log('[PriceBand] Loaded', Object.keys(data).length, 'entries')
        setPriceBands(data)
      } catch (e) {
        console.error('[PriceBand] Fetch failed:', e)
      }
    }
    fetchPriceBands()
  }, [])

  function parseTickers(raw) {
    return raw.split(/[\s,;\n\t]+/).map(t => t.trim().toUpperCase().replace(/[^A-Z0-9&]/g, '')).filter(Boolean)
  }

  function addTicker(val) {
    const tokens = parseTickers(val || input)
    if (!tokens.length) return
    setTickers(prev => {
      const merged = [...prev]
      for (const t of tokens) { if (!merged.includes(t) && merged.length < 500) merged.push(t) }
      return merged
    })
    setInput('')
    inputRef.current?.focus()
  }

  function handlePaste(e) { e.preventDefault(); addTicker(e.clipboardData.getData('text')) }
  function removeTicker(t) { setTickers(prev => prev.filter(x => x !== t)) }
  function loadPreset(key) { setTickers([...PRESETS[key]]) }
  function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTicker() } }

  async function analyze() {
    if (!tickers.length) return
    setLoading(true); setError(''); setStocks(null); setFetchErrors([]); setActiveFilter('ALL')
    try {
      const endpoint = '/api/analyze'
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, exchange, mode }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Analysis failed')
      setStocks(data.stocks)
      if (data.errors?.length) setFetchErrors(data.errors)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

// Filter groups depend on mode
  const filterGroups = mode==='long' ? [
    { key:'ALL',        label:'All',        count: stocks?.length||0,                       cls:'total' },
    { key:'BUY_READY',  label:'Buy Ready',  count: stocks?.filter(s=>s.verdict==='BUY_READY').length||0,  cls:'buyPill' },
    { key:'NEAR_PIVOT', label:'Near Pivot', count: stocks?.filter(s=>s.verdict==='NEAR_PIVOT').length||0, cls:'nearPivPill' },
    { key:'EXTENDED',   label:'Extended',   count: stocks?.filter(s=>s.verdict==='EXTENDED').length||0,   cls:'extPill' },
    { key:'WATCH',      label:'Watch',      count: stocks?.filter(s=>s.verdict==='WATCH').length||0,      cls:'watchPill' },
    { key:'AVOID',      label:'Avoid',      count: stocks?.filter(s=>s.verdict==='AVOID').length||0,      cls:'avoidPill' },
  ] : [
    { key:'ALL',         label:'All',          count: stocks?.length||0,                                          cls:'total' },
    { key:'SHORT_NOW',   label:'Short Now',    count: stocks?.filter(s=>s.verdict==='SHORT_NOW').length||0,    cls:'shortNowPill' },
    { key:'NEAR_SHORT',  label:'Near Short',   count: stocks?.filter(s=>s.verdict==='NEAR_SHORT').length||0,   cls:'nearShortPill' },
    { key:'WAIT_MA50',   label:'Wait MA50',    count: stocks?.filter(s=>s.verdict==='WAIT_MA50').length||0,    cls:'watchPill' },
    { key:'WATCH_SHORT', label:'Watch Short',  count: stocks?.filter(s=>s.verdict==='WATCH_SHORT').length||0,  cls:'nearPivPill' },
    { key:'AVOID_SHORT', label:'Avoid',        count: stocks?.filter(s=>s.verdict==='AVOID_SHORT').length||0, cls:'avoidPill' },
  ]
 
  const LONG_ORDER  = ['BUY_READY','NEAR_PIVOT','EXTENDED','WATCH','AVOID']
  const SHORT_ORDER = ['SHORT_NOW','NEAR_SHORT','WAIT_MA50','WATCH_SHORT','AVOID_SHORT']
  const order = mode==='long' ? LONG_ORDER : SHORT_ORDER
  const sorted  = stocks ? [...stocks].sort((a,b) => order.indexOf(a.verdict)-order.indexOf(b.verdict)) : []
  const filtered = activeFilter==='ALL' ? sorted : sorted.filter(s=>s.verdict===activeFilter)

  return (
    <>
      <Head>
        <title>Minervini India SEPA Screener</title>
        <meta name="description" content="Screen Indian stocks using Mark Minervini SEPA — live Yahoo Finance data" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🇮🇳</text></svg>" />
      </Head>

      <div className={styles.appShell}>
        {/* Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topLeft}>
            <div className={styles.logo}>🇮🇳</div>
            <div className={styles.titleBlock}>
              <h1>Minervini India SEPA Screener <span className={styles.badge}>NSE · BSE</span></h1>
              <p>Yahoo Finance API · Real OHLCV · Quarterly Financials · ₹ INR</p>
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {/* Mode toggle */}
            <div className={styles.modeToggle}>
              <button className={`${styles.modeBtn} ${mode==='long'?styles.modeLong:''}`} onClick={()=>{setMode('long');setStocks(null);setActiveFilter('ALL')}}>
                ▲ Long
              </button>
              <button className={`${styles.modeBtn} ${mode==='short'?styles.modeShort:''}`} onClick={()=>{setMode('short');setStocks(null);setActiveFilter('ALL')}}>
                ▼ Short
              </button>
            </div>
          <button className={styles.themeBtn} onClick={() => setTheme(t => t==='dark'?'light':'dark')}>
            {theme==='dark' ? <SunIcon /> : <MoonIcon />}
            {theme==='dark' ? 'Light' : 'Dark'}
          </button>
          </div>
        </header>

        <div className={styles.bodyWrap}>
          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.sideSection}>
              <div className={styles.sectionLabel}>Exchange</div>
              <div className={styles.toggleRow}>
                <button className={`${styles.exchBtn} ${exchange==='NS'?styles.active:''}`} onClick={() => setExchange('NS')}>NSE (.NS)</button>
                <button className={`${styles.exchBtn} ${exchange==='BO'?styles.active:''}`} onClick={() => setExchange('BO')}>BSE (.BO)</button>
              </div>
            </div>
            
            <div className={styles.sideSection}>
              <button className={styles.analyzeBtn} onClick={analyze} disabled={loading||tickers.length===0}
                style={{background: mode==='short' ? 'linear-gradient(135deg,#ff5c5c,#ff9933)' : undefined}}>
                {loading ? <><span className={styles.btnSpinner}/> Fetching data...</>
                  : <>{mode==='long'?<ArrowUpIcon/>:<ArrowDownIcon/>} {mode==='long'?'Long':'Short'} Scan {tickers.length>0?`${tickers.length} Stock${tickers.length>1?'s':''}`:'Stocks'}</>}
              </button>
            </div>
                  
            <div className={styles.sideSection}>
              <div className={styles.sectionLabel}>Stock Symbols</div>
              <div className={styles.inputHint}>Type, paste comma-separated list, or use presets</div>
              <textarea
                ref={inputRef}
                className={styles.tickerTextarea}
                placeholder={'RELIANCE, TCS, INFY\nor paste a list...'}
                value={input}
                onChange={e => setInput(e.target.value.toUpperCase())}
                onKeyDown={handleKey}
                onPaste={handlePaste}
                rows={3}
              />
              <button className={styles.addBtn} onClick={() => addTicker()}>+ Add to List</button>
            </div>

            {tickers.length > 0 && (
              <div className={styles.sideSection}>
                <div className={styles.sectionLabel}>
                  Selected ({tickers.length}/500)
                  <button className={styles.clearAll} onClick={() => setTickers([])}>clear all</button>
                </div>
                <div className={styles.chips}>
                  {tickers.map(t => (
                    <div key={t} className={styles.chip}>
                      {t}<span className={styles.chipSuffix}>.{exchange}</span>
                      <button className={styles.chipRm} onClick={() => removeTicker(t)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.sideSection}>
              <div className={styles.sectionLabel}>Quick Presets</div>
              <div className={styles.presets}>
                {[['nifty','Nifty 50'],['it','IT Sector'],['bank','Banking'],['smallcap','Small/Mid Cap'],['momentum','Momentum']].map(([k,l]) => (
                  <button key={k} className={styles.presetBtn} onClick={() => loadPreset(k)}>{l}</button>
                ))}
              </div>
            </div>

            <div className={styles.sideSection}>
              <div className={styles.sectionLabel}>{mode==='long'?'10 SEPA + Entry Filters':'10 Short Criteria'}</div>
              <div className={styles.criteriaList}>
                {(mode==='long'?LONG_SEPA:SHORT_CRITERIA_LIST).map((c,i)=>(
                  <div key={i} className={`${styles.critItem} ${i>=8?styles.critHighlight:''}`}>
                    <div className={styles.critDot} style={{background: mode==='short'?'var(--red)':undefined}}/>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {mode==='short' && (
              <div className={styles.sideSection}>
                <div className={styles.sectionLabel}>Short Entry Guide</div>
                <div className={styles.zoneGuide}>
                  <div className={styles.zoneGuideItem}><span className={styles.zoneDot} style={{background:'var(--red)'}}/><span className={styles.zoneGuideText}><strong>AT RESISTANCE</strong> — Price at MA50 from below, ideal short</span></div>
                  <div className={styles.zoneGuideItem}><span className={styles.zoneDot} style={{background:'var(--amber)'}}/><span className={styles.zoneGuideText}><strong>APPROACHING</strong> — Bouncing up toward MA50, get ready</span></div>
                  <div className={styles.zoneGuideItem}><span className={styles.zoneDot} style={{background:'var(--text3)'}}/><span className={styles.zoneGuideText}><strong>WAIT MA50</strong> — Already above MA50, wait for rejection</span></div>
                  <div className={styles.zoneGuideItem}><span className={styles.zoneDot} style={{background:'var(--blue)'}}/><span className={styles.zoneGuideText}><strong>OVERSOLD</strong> — Too extended down, wait for dead-cat bounce</span></div>
                </div>
              </div>
            )}
            {mode==='long' && (
              <div className={styles.sideSection}>
                <div className={styles.sectionLabel}>Entry Zone Guide</div>
                <div className={styles.zoneGuide}>
                  {Object.values(LONG_ZONE).filter(z=>z.cls!=='zoneUnknown').map(z=>(
                    <div key={z.cls} className={styles.zoneGuideItem}>
                      <span className={`${styles.zoneDot} ${styles[z.cls]}`}/>
                      <span className={styles.zoneGuideText}><strong>{z.label.replace(/[✦◎⚠↓?]\s/,'')}</strong> — {z.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.sideDisclaimer}>
              ⚠ Educational only · Not SEBI advice<br />Verify before trading
            </div>
          </aside>

          {/* Results panel */}
          <main className={styles.resultsPanel}>
            {loading && (
              <div className={styles.loadingBox}>
                <div className={styles.spinner} style={{borderTopColor: mode==='short'?'var(--red)':'var(--saffron)'}} />
                <div className={styles.loadingText}>Fetching: {tickers.map(t=>`${t}.${exchange}`).join(', ')}</div>
                <div className={styles.loadingSub}>{mode==='long'?'1yr OHLCV · MAs · Pivot · Entry zone':'1yr OHLCV · MAs · Quarterly Financials · Short zone'}</div>
              </div>
            )}

            {error && (
              <div className={styles.errBox}>
                <div className={styles.errIcon}>⚠</div>
                <div className={styles.errTitle}>Analysis Failed</div>
                <div className={styles.errMsg}>{error}</div>
                <div className={styles.errHint}>Check ticker symbol or try again</div>
              </div>
            )}

            {fetchErrors.length > 0 && (
              <div className={styles.warnBox}>⚠ Could not fetch: {fetchErrors.map(e=>e.ticker).join(', ')}</div>
            )}

            {stocks && !loading && (
              <>
                <div className={styles.resultsHeader}>
                  <div className={styles.summaryBar}>
                    {filterGroups.map(fg=>(
                      <button key={fg.key} onClick={()=>setActiveFilter(fg.key)}
                        className={`${styles.sumPill} ${styles[fg.cls]||''} ${activeFilter===fg.key?styles.pillActive:''}`}>
                        <span className={styles.val}>{fg.count}</span> {fg.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.infoBar}>
                    <LiveDot color={mode==='short'?'var(--red)':'var(--green)'}/>
                    Live · Yahoo Finance · {exchange==='NS'?'NSE':'BSE'} · {mode==='long'?'Pivot from 15D high · Stop −7.5%':'Short stop +7% · Financials from YF'}
                  </div>
                </div>
                <div className={styles.cardsGrid}>
                  {filtered.map((s,i)=>mode==='long'
                    ? <LongCard key={s.ticker} stock={s} exchange={exchange} delay={i*40}/>
                    : <ShortCard key={s.ticker} stock={s} exchange={exchange} delay={i*40}/>
                  )}
                </div>
                {filtered.length===0 && <div className={styles.filterEmpty}>No stocks match <strong>{activeFilter.replace(/_/g,' ')}</strong></div>}
              </>
            )}
 
            {!stocks&&!loading&&!error && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{mode==='long'?'📈':'📉'}</div>
                <div className={styles.emptyText}>{mode==='long'?'Find stocks ready to buy':'Find stocks ready to short'}</div>
                <div className={styles.emptySub}>{mode==='long'?'10 Minervini SEPA filters + entry zone':'10 short criteria including Sales & EPS QOQ%'}</div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  )
}

/* ── Stock Card ────────────────────────────────────────────── */
function getBandBadge(bandsMap, ticker, styles) {
  // bandsMap === null  → CSV not yet loaded, show a neutral loading badge
  if (bandsMap === null) return <span className={`${styles.priceBand} ${styles.bandGrey}`}>Band…</span>
  const raw = bandsMap[ticker]
  // ticker not in map at all → No Band (NSE doesn't restrict it)
  if (raw === undefined) return <span className={`${styles.priceBand} ${styles.bandGrey}`}>NB</span>
  const b = String(raw).trim()
  if (b === '2' || b === '5')  return <span className={`${styles.priceBand} ${styles.bandRed}`}>{b}%</span>
  if (b === '10')               return <span className={`${styles.priceBand} ${styles.bandOrange}`}>10%</span>
  if (b === '20' || b === '40') return <span className={`${styles.priceBand} ${styles.bandGreen}`}>{b}%</span>
  // explicit "No Band" string in CSV
  return <span className={`${styles.priceBand} ${styles.bandGrey}`}>NB</span>
}

/* ── Long Card ─────────────────────────────────────────────── */
function LongCard({ stock:s, exchange, delay }) {
  const vconf = LONG_VERDICT[s.verdict]||LONG_VERDICT['AVOID']
  const zconf = LONG_ZONE[s.entry_zone]||LONG_ZONE['UNKNOWN']
  const chg   = parseFloat(s.change_pct)||0
  const maxSc = s.max_score||10
  const ratio = s.sepa_score/maxSc
  const sc    = ratio>=0.8?'var(--green)':ratio>=0.6?'var(--amber)':'var(--red)'
  const pfl   = s.low_52w  ? (((s.price-s.low_52w)/s.low_52w)*100).toFixed(1) : null
  const pfh   = s.high_52w ? (((s.price-s.high_52w)/s.high_52w)*100).toFixed(1) : null
  const vc    = s.verdict==='BUY_READY'?'buyReady':s.verdict==='NEAR_PIVOT'?'nearPivCard':s.verdict==='EXTENDED'?'extCard':s.verdict==='WATCH'?'watchCard':'avoidCard'
 
  return (
    <div className={`${styles.stockCard} ${styles[vc]}`} style={{animationDelay:`${delay}ms`}}>
      <div className={styles.cardTop}>
        <div className={styles.cardTopLeft}>
          <div className={styles.tSym}>{s.ticker}
            <span className={`${styles.tag} ${styles.tagEx}`}>{exchange}</span>
            {s.stage==='Stage 2'&&<span className={`${styles.tag} ${styles.tagS2}`}>Stage 2</span>}
            {(s.rs_rating||0)>=70&&<span className={`${styles.tag} ${styles.tagRs}`}>RS {s.rs_rating}</span>}
          </div>
          <div className={styles.tName}>{s.company}{s.sector&&<span className={styles.tSector}> · {s.sector}</span>}</div>
          <a className={styles.tLink} href={`https://finance.yahoo.com/quote/${s.yf_symbol}/`} target="_blank" rel="noopener noreferrer">↗ {s.yf_symbol}</a>
          {s.data_points<200&&<span className={styles.newListingBadge}>⚡ {s.data_points}d history</span>}
        </div>
        <div className={styles.cardTopRight}>
          <div className={`${styles.vtag} ${styles[vconf.cls]}`}>{vconf.label}</div>
          <div className={`${styles.entryZoneBadge} ${styles[zconf.cls]}`}>{zconf.label}</div>
          <div className={styles.sepaScoreBig} style={{color:sc}}>{s.sepa_score}<span>/{maxSc}</span></div>
        </div>
      </div>
 
      <div className={styles.priceGrid}>
        <PB label="CMP" val={inr(s.price)}/>
        <PB label="1D Change" val={pctFmt(s.change_pct)} cls={chg>=0?'pos':'neg'}/>
        <PB label="52W High" val={inr(s.high_52w)}/>
        <PB label="52W Low" val={inr(s.low_52w)}/>
        <PB label="vs 52W Low" val={pfl?`+${pfl}%`:'—'} cls="pos"/>
        <PB label="vs 52W High" val={pfh?`${pfh}%`:'—'} cls={pfh&&parseFloat(pfh)>=-25?'pos':'neg'}/>
        <PB label="MA 50" val={inr(s.ma50)}/><PB label="MA 150" val={inr(s.ma150)}/>
        <PB label="MA 200" val={inr(s.ma200)}/>
        <PB label="Avg Vol 20D" val={s.avg_vol20?(s.avg_vol20>=1e6?(s.avg_vol20/1e6).toFixed(1)+'M':(s.avg_vol20/1000).toFixed(0)+'K'):'—'} cls={s.avg_vol20>=100000?'pos':'neg'}/>
        <div className={styles.priceBlock}>
          <div className={styles.priceLabel}>ATR % · Circuit</div>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            <span className={styles.priceValue}>{s.atr_pct?s.atr_pct.toFixed(1)+'%':'—'}</span>
            {s.circuit_band&&<span className={`${styles.circuitBadge} ${styles[circuitClass(s.circuit_band)]}`}>{circuitLabel(s.circuit_band)}</span>}
          </div>
        </div>
      </div>
 
      <div className={`${styles.entryPanel} ${styles[zconf.panel]}`}>
        <div className={styles.entryRow}>
          <EI label="Pivot (15D high)" val={inr(s.pivot)}/>
          <EI label="CMP vs Pivot" val={pctFmt(s.pivot_pct)} cls={s.pivot_pct!=null&&s.pivot_pct>5?'neg':s.pivot_pct!=null&&s.pivot_pct>=0?'pos':''}/>
          <EI label="Stop Loss (−7.5%)" val={inr(s.stop_loss)} cls="neg"/>
          <EI label="Risk/Reward" val={s.risk_reward!=null?s.risk_reward.toFixed(1)+'x':'—'} cls={s.risk_reward>=2?'pos':'neg'}/>
          <EI label="Base Tightness" val={s.base_tightness!=null?s.base_tightness.toFixed(1)+'% σ':'—'} cls={s.base_tightness!=null&&s.base_tightness<4?'pos':'neg'}/>
          <EI label="Zone" val={zconf.label.replace(/[✦◎⚠↓?]\s/,'')}/>
        </div>
        {s.entry_zone==='EXTENDED'&&<div className={styles.extendedWarn}>⚠ {(s.pivot_pct||0).toFixed(1)}% above pivot — already broke out. Do not chase. Wait for new base.</div>}
        {s.entry_zone==='IN_BUY_ZONE'&&<div className={styles.buyZoneNote}>✦ In buy zone. Enter on strong volume (≥1.5× avg). Stop at {inr(s.stop_loss)}.</div>}
      </div>
 
      <div className={styles.scoreRow}>
        <span className={styles.scoreLbl}>SEPA</span>
        <div className={styles.scoreTrack}><div className={styles.scoreFill} style={{width:`${(ratio*100).toFixed(0)}%`,background:sc}}/></div>
        <span className={styles.scoreVal} style={{color:sc}}>{s.sepa_score}/{maxSc}</span>
      </div>
 
      <div className={styles.checks}>
        {Object.entries(s.criteria||{}).map(([k,v])=>(
          <div key={k} className={`${styles.chk} ${v.na?styles.chkNa:v.pass?'':styles.chkFail}`}>
            <div className={`${styles.chkIco} ${v.na?styles.naIco:v.pass?styles.pass:styles.fail}`}>{v.na?'—':v.pass?'✓':'✕'}</div>
            <div className={styles.chkContent}>
              <span className={styles.chkLbl}>{LONG_LABELS[k]||k}</span>
              <span className={styles.chkDet}>{(v.detail||'').substring(0,38)}</span>
            </div>
          </div>
        ))}
      </div>
      {s.note&&<div className={styles.noteBox}>📊 {s.note}</div>}
      <div className={styles.cardFooter}>{s.data_source}</div>
    </div>
  )
}
 
/* ── Short Card ────────────────────────────────────────────── */
function ShortCard({ stock:s, exchange, delay }) {
  const vconf = SHORT_VERDICT[s.verdict]||SHORT_VERDICT['AVOID_SHORT']
  const zconf = SHORT_ZONE[s.short_zone]||SHORT_ZONE['UNKNOWN']
  const chg   = parseFloat(s.change_pct)||0
  const maxSc = s.max_score||10
  const ratio = s.score/maxSc
  const sc    = ratio>=0.8?'var(--red)':ratio>=0.6?'var(--amber)':'var(--text3)'
  const pfl   = s.low_52w  ? (((s.price-s.low_52w)/s.low_52w)*100).toFixed(1) : null
  const pfh   = s.high_52w ? (((s.price-s.high_52w)/s.high_52w)*100).toFixed(1) : null
  const vc    = s.verdict==='SHORT_NOW'?'shortNowCard':s.verdict==='NEAR_SHORT'?'nearShortCard':s.verdict==='WAIT_MA50'?'watchCard':s.verdict==='WATCH_SHORT'?'nearPivCard':'avoidCard'
 
  return (
    <div className={`${styles.stockCard} ${styles[vc]}`} style={{animationDelay:`${delay}ms`}}>
      <div className={styles.cardTop}>
        <div className={styles.cardTopLeft}>
          <div className={styles.tSym}>{s.ticker}
            <span className={`${styles.tag} ${styles.tagEx}`}>{exchange}</span>
            {s.stage==='Stage 4'&&<span className={`${styles.tag} ${styles.tagStage4}`}>Stage 4</span>}
            {s.lower_highs&&<span className={`${styles.tag} ${styles.tagBear}`}>↓ Lower Highs</span>}
          </div>
          <div className={styles.tName}>{s.company}{s.sector&&<span className={styles.tSector}> · {s.sector}</span>}</div>
          <a className={styles.tLink} href={`https://finance.yahoo.com/quote/${s.yf_symbol}/`} target="_blank" rel="noopener noreferrer">↗ {s.yf_symbol}</a>
          {s.data_points<200&&<span className={styles.newListingBadge}>⚡ {s.data_points}d history</span>}
        </div>
        <div className={styles.cardTopRight}>
          <div className={`${styles.vtag} ${styles[vconf.cls]}`}>{vconf.label}</div>
          <div className={`${styles.entryZoneBadge} ${styles[zconf.cls]}`}>{zconf.label}</div>
          <div className={styles.sepaScoreBig} style={{color:sc}}>{s.score}<span>/{maxSc}</span></div>
        </div>
      </div>
 
      {/* Price grid */}
      <div className={styles.priceGrid}>
        <PB label="CMP" val={inr(s.price)}/>
        <PB label="1D Change" val={pctFmt(s.change_pct)} cls={chg>=0?'pos':'neg'}/>
        <PB label="52W High" val={inr(s.high_52w)}/>
        <PB label="52W Low" val={inr(s.low_52w)}/>
        <PB label="vs 52W Low" val={pfl?`+${pfl}%`:'—'} cls={pfl&&parseFloat(pfl)<=30?'neg':''}/>
        <PB label="vs 52W High" val={pfh?`${pfh}%`:'—'} cls={pfh&&parseFloat(pfh)<=-20?'neg':'pos'}/>
        <PB label="MA 50" val={inr(s.ma50)}/><PB label="MA 200" val={inr(s.ma200)}/>
        <PB label="Dist from MA50" val={s.dist_from_ma50!=null?pctFmt(s.dist_from_ma50):'—'} cls={s.dist_from_ma50!=null&&Math.abs(s.dist_from_ma50)<=5?'neg':''}/>
        <PB label="Avg Vol 20D" val={s.avg_vol20?(s.avg_vol20>=1e6?(s.avg_vol20/1e6).toFixed(1)+'M':(s.avg_vol20/1000).toFixed(0)+'K'):'—'}/>
      </div>
 
      {/* Financials panel */}
      <div className={styles.finPanel}>
        <div className={styles.finTitle}>Quarterly Financials</div>
        <div className={styles.finGrid}>
          <FI label="Sales QOQ%" val={pctFmt(s.sales_qoq)} cls={s.sales_qoq!=null&&s.sales_qoq<0?'neg':'pos'} prior={s.sales_prior_qoq!=null?`Prior: ${pctFmt(s.sales_prior_qoq)}`:null}/>
          <FI label="EPS QOQ%" val={pctFmt(s.eps_qoq)} cls={s.eps_qoq!=null&&s.eps_qoq<0?'neg':'pos'} prior={s.eps_prior_qoq!=null?`Prior: ${pctFmt(s.eps_prior_qoq)}`:null}/>
        </div>
      </div>
 
      {/* Short entry panel */}
      <div className={`${styles.entryPanel} ${styles[zconf.panel]||styles.entryPanelDefault}`}>
        <div className={styles.entryRow}>
          <EI label="Short Entry" val={inr(s.short_entry)}/>
          <EI label="Stop Loss (+7%)" val={inr(s.short_stop)} cls="neg"/>
          <EI label="Target" val={inr(s.short_target)} cls="pos"/>
          <EI label="Risk/Reward" val={s.short_rr!=null?s.short_rr.toFixed(1)+'x':'—'} cls={s.short_rr>=2?'pos':'neg'}/>
          <EI label="ATR %" val={s.atr_pct?s.atr_pct.toFixed(1)+'%':'—'}/>
          <EI label="Short Zone" val={zconf.label.replace(/[▼◎⏳↑↓⚠?]\s/,'')}/>
        </div>
        {s.short_zone==='AT_RESISTANCE'&&<div className={styles.buyZoneNote} style={{color:'var(--red)',background:'rgba(255,92,92,.08)',borderColor:'var(--red)'}}>▼ At MA50 resistance — ideal short. Stop {inr(s.short_stop)}, target {inr(s.short_target)}.</div>}
        {s.short_zone==='DEEPLY_OVERSOLD'&&<div className={styles.extendedWarn}>↓ Too extended below MA50. Wait for dead-cat bounce to MA50 before shorting.</div>}
      </div>
 
      {/* Score bar */}
      <div className={styles.scoreRow}>
        <span className={styles.scoreLbl}>SHORT</span>
        <div className={styles.scoreTrack}><div className={styles.scoreFill} style={{width:`${(ratio*100).toFixed(0)}%`,background:sc}}/></div>
        <span className={styles.scoreVal} style={{color:sc}}>{s.score}/{maxSc}</span>
      </div>
 
      {/* Criteria */}
      <div className={styles.checks}>
        {Object.entries(s.criteria||{}).map(([k,v])=>(
          <div key={k} className={`${styles.chk} ${v.na?styles.chkNa:v.pass?'':styles.chkFail}`}>
            <div className={`${styles.chkIco} ${v.na?styles.naIco:v.pass?styles.pass:styles.fail}`}>{v.na?'—':v.pass?'✓':'✕'}</div>
            <div className={styles.chkContent}>
              <span className={styles.chkLbl}>{SHORT_LABELS[k]||k}</span>
              <span className={styles.chkDet}>{(v.detail||'').substring(0,38)}</span>
            </div>
          </div>
        ))}
      </div>
      {s.note&&<div className={styles.noteBox}>📉 {s.note}</div>}
      <div className={styles.cardFooter}>{s.data_source}</div>
    </div>
  )
}
 
/* ── Small helper components ───────────────────────────────── */
function PB({ label, val, cls }) {
  return <div className={styles.priceBlock}>
    <div className={styles.priceLabel}>{label}</div>
    <div className={`${styles.priceValue} ${cls?styles[cls]:''}`}>{val}</div>
  </div>
}
function EI({ label, val, cls }) {
  return <div className={styles.entryItem}>
    <div className={styles.entryLabel}>{label}</div>
    <div className={`${styles.entryValue} ${cls?styles[cls]:''}`}>{val}</div>
  </div>
}
function FI({ label, val, cls, prior }) {
  return <div className={styles.finItem}>
    <div className={styles.finLabel}>{label}</div>
    <div className={`${styles.finValue} ${cls?styles[cls]:''}`}>{val}</div>
    {prior&&<div className={styles.finPrior}>{prior}</div>}
  </div>
}

function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> }
function SunIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> }
function MoonIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> }
function ArrowUpIcon()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg> }
function ArrowDownIcon(){ return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M19 12l-7 7-7-7"/></svg> }
function LiveDot({color}){ return <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:color||'var(--green)',marginRight:5}}/> }
