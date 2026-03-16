import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const PRESETS = {
  nifty:    ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','SBIN','BAJFINANCE','BHARTIARTL','KOTAKBANK','LT','ASIANPAINT','AXISBANK','MARUTI','SUNPHARMA'],
  it:       ['TCS','INFY','WIPRO','HCLTECH','TECHM','LTIM','MPHASIS','COFORGE','PERSISTENT','KPITTECH'],
  bank:     ['HDFCBANK','ICICIBANK','SBIN','KOTAKBANK','AXISBANK','BANDHANBNK','FEDERALBNK','IDFCFIRSTB','INDUSINDBK','PNB'],
  smallcap: ['IRCTC','DIXON','POLYCAB','ASTRAL','GRINDWELL','PAGEIND','METROPOLIS','TIINDIA','CMSINFO','CAMS'],
  momentum: ['ADANIENT','SIEMENS','CUMMINSIND','ETERNAL','IRFC','DIXON','RVNL','BEL','HAL','COCHINSHIP'],
}

const CRIT_LABELS = {
  C1:'Price > MA200 & MA150', C2:'MA150 > MA200',
  C3:'MA200 trending up',     C4:'MA50 > MA150 & MA200',
  C5:'≥25% above 52W low',    C6:'Within 25% of 52W high',
  C7:'RS ≥ 70 vs Nifty 50',   C8:'VCP / tight base (<4% σ)',
  C9:'Entry: within 5% of pivot',
}

const SEPA_CRITERIA = [
  'Price above 200-day & 150-day MA',
  '150-day MA above 200-day MA',
  '200-day MA trending up ≥ 1 month',
  '50-day MA above 150-day & 200-day',
  'Price ≥ 25% above 52-week low',
  'Price within 25% of 52-week high',
  'RS Rating ≥ 70 vs Nifty 50',
  'VCP: base tightness < 4% σ',
  'Entry within 0–5% of pivot (no chasing)',
  'Avg 20-day volume ≥ 100,000 (liquidity)',
]

const ZONE_CONFIG = {
  IN_BUY_ZONE:  { label: '✦ IN BUY ZONE',  cls: 'zoneBuy',     desc: '0–5% above pivot — ideal entry' },
  NEAR_PIVOT:   { label: '◎ NEAR PIVOT',   cls: 'zoneNear',    desc: 'Within 3% below pivot — watch for breakout' },
  EXTENDED:     { label: '⚠ EXTENDED',     cls: 'zoneExtended',desc: '>5% above pivot — do not chase' },
  BELOW_PIVOT:  { label: '↓ BELOW PIVOT',  cls: 'zoneBelow',   desc: 'Not yet at breakout level' },
  UNKNOWN:      { label: '? UNKNOWN',       cls: 'zoneUnknown', desc: 'Pivot data unavailable' },
}

const VERDICT_CONFIG = {
  BUY_READY:  { label: '✦ BUY READY',   cls: 'buy'      },
  NEAR_PIVOT: { label: '◎ NEAR PIVOT',  cls: 'nearPiv'  },
  EXTENDED:   { label: '⚠ EXTENDED',    cls: 'extended' },
  WATCH:      { label: '◉ WATCH',       cls: 'watch'    },
  AVOID:      { label: '✕ AVOID',       cls: 'avoid'    },
}

function inr(n) {
  if (n == null) return '—'
  return '₹' + new Intl.NumberFormat('en-IN').format(Math.round(Number(n)))
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
  const [loading, setLoading]         = useState(false)
  const [stocks, setStocks]           = useState(null)
  const [error, setError]             = useState('')
  const [fetchErrors, setFetchErrors] = useState([])
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [theme, setTheme]             = useState('dark')
  const inputRef = useRef(null)

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])

  function parseTickers(raw) {
    return raw.split(/[\s,;\n\t]+/).map(t => t.trim().toUpperCase().replace(/[^A-Z0-9&]/g, '')).filter(Boolean)
  }

  function addTicker(val) {
    const tokens = parseTickers(val || input)
    if (!tokens.length) return
    setTickers(prev => {
      const merged = [...prev]
      for (const t of tokens) { if (!merged.includes(t) && merged.length < 50) merged.push(t) }
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
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, exchange }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) throw new Error(data.error || 'Analysis failed')
      setStocks(data.stocks)
      if (data.errors?.length) setFetchErrors(data.errors)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const byVerdict = (v) => stocks?.filter(s => s.verdict === v) || []
  const buyReady  = byVerdict('BUY_READY')
  const nearPivot = byVerdict('NEAR_PIVOT')
  const extended  = byVerdict('EXTENDED')
  const watch     = byVerdict('WATCH')
  const avoid     = byVerdict('AVOID')
  const sorted    = [...buyReady, ...nearPivot, ...extended, ...watch, ...avoid]

  const filtered = activeFilter === 'ALL'        ? sorted
    : activeFilter === 'BUY_READY'               ? buyReady
    : activeFilter === 'NEAR_PIVOT'              ? nearPivot
    : activeFilter === 'EXTENDED'                ? extended
    : activeFilter === 'WATCH'                   ? watch
    : avoid

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
              <p>Yahoo Finance API · Pivot from real data · Entry zone filter · ₹ INR</p>
            </div>
          </div>
          <button className={styles.themeBtn} onClick={() => setTheme(t => t==='dark'?'light':'dark')}>
            {theme==='dark' ? <SunIcon /> : <MoonIcon />}
            {theme==='dark' ? 'Light' : 'Dark'}
          </button>
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
                {[['nifty','Nifty Top 15'],['it','IT Sector'],['bank','Banking'],['smallcap','Small/Mid Cap'],['momentum','Momentum']].map(([k,l]) => (
                  <button key={k} className={styles.presetBtn} onClick={() => loadPreset(k)}>{l}</button>
                ))}
              </div>
            </div>

            <div className={styles.sideSection}>
              <button className={styles.analyzeBtn} onClick={analyze} disabled={loading || tickers.length === 0}>
                {loading ? <><span className={styles.btnSpinner} /> Fetching data...</> : <><SearchIcon /> Analyze {tickers.length > 0 ? `${tickers.length} Stock${tickers.length>1?'s':''}` : 'Stocks'}</>}
              </button>
            </div>

            <div className={styles.sideSection}>
              <div className={styles.sectionLabel}>9 SEPA + Entry Filters</div>
              <div className={styles.criteriaList}>
                {SEPA_CRITERIA.map((c, i) => (
                  <div key={i} className={`${styles.critItem} ${i === 8 ? styles.critHighlight : ''}`}>
                    <div className={styles.critDot} />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.sideSection}>
              <div className={styles.sectionLabel}>Entry Zone Guide</div>
              <div className={styles.zoneGuide}>
                {Object.values(ZONE_CONFIG).filter(z => z.cls !== 'zoneUnknown').map(z => (
                  <div key={z.cls} className={styles.zoneGuideItem}>
                    <span className={`${styles.zoneDot} ${styles[z.cls]}`} />
                    <span className={styles.zoneGuideText}><strong>{z.label.replace(/[✦◎⚠↓?]\s/,'')}</strong> — {z.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.sideDisclaimer}>
              ⚠ Educational only · Not SEBI advice<br />Verify before trading
            </div>
          </aside>

          {/* Results panel */}
          <main className={styles.resultsPanel}>
            {loading && (
              <div className={styles.loadingBox}>
                <div className={styles.spinner} />
                <div className={styles.loadingText}>Fetching: {tickers.map(t=>`${t}.${exchange}`).join(', ')}</div>
                <div className={styles.loadingSub}>1yr OHLCV · MAs · Pivot from real data · Entry zone scoring</div>
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
                    <button onClick={() => setActiveFilter('ALL')} className={`${styles.sumPill} ${styles.total} ${activeFilter==='ALL'?styles.pillActive:''}`}><span className={styles.val}>{stocks.length}</span> All</button>
                    <button onClick={() => setActiveFilter('BUY_READY')} className={`${styles.sumPill} ${styles.buyPill} ${activeFilter==='BUY_READY'?styles.pillActive:''}`}><span className={styles.val}>{buyReady.length}</span> Buy Ready</button>
                    <button onClick={() => setActiveFilter('NEAR_PIVOT')} className={`${styles.sumPill} ${styles.nearPivPill} ${activeFilter==='NEAR_PIVOT'?styles.pillActive:''}`}><span className={styles.val}>{nearPivot.length}</span> Near Pivot</button>
                    <button onClick={() => setActiveFilter('EXTENDED')} className={`${styles.sumPill} ${styles.extPill} ${activeFilter==='EXTENDED'?styles.pillActive:''}`}><span className={styles.val}>{extended.length}</span> Extended</button>
                    <button onClick={() => setActiveFilter('WATCH')} className={`${styles.sumPill} ${styles.watchPill} ${activeFilter==='WATCH'?styles.pillActive:''}`}><span className={styles.val}>{watch.length}</span> Watch</button>
                    <button onClick={() => setActiveFilter('AVOID')} className={`${styles.sumPill} ${styles.avoidPill} ${activeFilter==='AVOID'?styles.pillActive:''}`}><span className={styles.val}>{avoid.length}</span> Avoid</button>
                  </div>
                  <div className={styles.infoBar}><LiveDot /> Live · Yahoo Finance · {exchange==='NS'?'NSE':'BSE'} · 10 filters · Pivot from 15D high · Vol ≥ 100K · Stop −7.5%</div>
                </div>

                <div className={styles.cardsGrid}>
                  {filtered.map((s, i) => <StockCard key={s.ticker} stock={s} exchange={exchange} delay={i * 40} />)}
                </div>

                {filtered.length === 0 && (
                  <div className={styles.filterEmpty}>No stocks match <strong>{activeFilter.replace('_',' ')}</strong></div>
                )}
              </>
            )}

            {!stocks && !loading && !error && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📊</div>
                <div className={styles.emptyText}>Add stocks and hit Analyze</div>
                <div className={styles.emptySub}>Prices, MAs & pivot from Yahoo Finance · Entry zone filter prevents chasing</div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  )
}

/* ── Stock Card ────────────────────────────────────────────── */
function StockCard({ stock: s, exchange, delay }) {
  const vc  = s.verdict==='BUY_READY' ? 'buyReady' : s.verdict==='NEAR_PIVOT' ? 'nearPivCard' : s.verdict==='EXTENDED' ? 'extCard' : s.verdict==='WATCH' ? 'watchCard' : 'avoidCard'
  const vconf = VERDICT_CONFIG[s.verdict] || VERDICT_CONFIG['AVOID']
  const zconf = ZONE_CONFIG[s.entry_zone] || ZONE_CONFIG['UNKNOWN']
  const chg = parseFloat(s.change_pct) || 0
  const sc  = s.sepa_score >= 9 ? 'var(--green)' : s.sepa_score >= 7 ? 'var(--amber)' : 'var(--red)'
  const pfl = s.low_52w  ? (((s.price - s.low_52w)  / s.low_52w)  * 100).toFixed(1) : null
  const pfh = s.high_52w ? (((s.price - s.high_52w) / s.high_52w) * 100).toFixed(1) : null
  const yfu = `https://finance.yahoo.com/quote/${s.yf_symbol}/`

  return (
    <div className={`${styles.stockCard} ${styles[vc]}`} style={{ animationDelay:`${delay}ms` }}>
      {/* Header */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopLeft}>
          <div className={styles.tSym}>
            {s.ticker}
            <span className={`${styles.tag} ${styles.tagEx}`}>{exchange}</span>
            {s.stage==='Stage 2' && <span className={`${styles.tag} ${styles.tagS2}`}>Stage 2</span>}
            {(s.rs_rating||0)>=70 && <span className={`${styles.tag} ${styles.tagRs}`}>RS {s.rs_rating}</span>}
          </div>
          <div className={styles.tName}>{s.company}{s.sector && <span className={styles.tSector}> · {s.sector}</span>}</div>
          <a className={styles.tLink} href={yfu} target="_blank" rel="noopener noreferrer">↗ {s.yf_symbol}</a>
        </div>
        <div className={styles.cardTopRight}>
          <div className={`${styles.vtag} ${styles[vconf.cls]}`}>{vconf.label}</div>
          <div className={`${styles.entryZoneBadge} ${styles[zconf.cls]}`}>{zconf.label}</div>
          <div className={styles.sepaScoreBig} style={{ color: sc }}>{s.sepa_score}<span>/10</span></div>
        </div>
      </div>

      {/* Price grid */}
      <div className={styles.priceGrid}>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>CMP</div><div className={styles.priceValue}>{inr(s.price)}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>1D Change</div><div className={`${styles.priceValue} ${chg>=0?styles.pos:styles.neg}`}>{chg>=0?'+':''}{chg.toFixed(2)}%</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>52W High</div><div className={styles.priceValue}>{inr(s.high_52w)}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>52W Low</div><div className={styles.priceValue}>{inr(s.low_52w)}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>vs 52W Low</div><div className={`${styles.priceValue} ${styles.pos}`}>{pfl?`+${pfl}%`:'—'}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>vs 52W High</div><div className={`${styles.priceValue} ${pfh&&parseFloat(pfh)>=-25?styles.pos:styles.neg}`}>{pfh?`${pfh}%`:'—'}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>MA 50</div><div className={styles.priceValue}>{inr(s.ma50)}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>MA 150</div><div className={styles.priceValue}>{inr(s.ma150)}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>MA 200</div><div className={styles.priceValue}>{inr(s.ma200)}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>Avg Vol 20D</div><div className={`${styles.priceValue} ${s.avg_vol20&&s.avg_vol20>=100000?styles.pos:styles.neg}`}>{s.avg_vol20 ? (s.avg_vol20>=1e6?(s.avg_vol20/1e6).toFixed(1)+'M':(s.avg_vol20/1000).toFixed(0)+'K') : '—'}</div></div>
        <div className={styles.priceBlock}><div className={styles.priceLabel}>ATR %</div><div className={styles.priceValue}>{s.atr_pct ? s.atr_pct.toFixed(1)+'%' : '—'}</div></div>
      </div>

      {/* Entry zone panel */}
      <div className={`${styles.entryPanel} ${styles[zconf.cls+'Panel'] || styles.entryPanelDefault}`}>
        <div className={styles.entryRow}>
          <div className={styles.entryItem}>
            <div className={styles.entryLabel}>Pivot (15d high)</div>
            <div className={styles.entryValue}>{inr(s.pivot)}</div>
          </div>
          <div className={styles.entryItem}>
            <div className={styles.entryLabel}>CMP vs Pivot</div>
            <div className={`${styles.entryValue} ${s.pivot_pct!=null&&s.pivot_pct>5?styles.neg:s.pivot_pct!=null&&s.pivot_pct>=0?styles.pos:''}`}>
              {s.pivot_pct != null ? pctFmt(s.pivot_pct) : '—'}
            </div>
          </div>
          <div className={styles.entryItem}>
            <div className={styles.entryLabel}>Stop Loss (−7.5%)</div>
            <div className={`${styles.entryValue} ${styles.neg}`}>{inr(s.stop_loss)}</div>
          </div>
          <div className={styles.entryItem}>
            <div className={styles.entryLabel}>Risk/Reward</div>
            <div className={`${styles.entryValue} ${s.risk_reward!=null&&s.risk_reward>=2?styles.pos:styles.neg}`}>
              {s.risk_reward != null ? s.risk_reward.toFixed(1)+'x' : '—'}
            </div>
          </div>
          <div className={styles.entryItem}>
            <div className={styles.entryLabel}>Base Tightness</div>
            <div className={`${styles.entryValue} ${s.base_tightness!=null&&s.base_tightness<4?styles.pos:styles.neg}`}>
              {s.base_tightness != null ? s.base_tightness.toFixed(1)+'% σ' : '—'}
            </div>
          </div>
          <div className={styles.entryItem}>
            <div className={styles.entryLabel}>Zone</div>
            <div className={`${styles.entryValue} ${styles[zconf.cls+'Text'] || ''}`}>{zconf.label.replace(/[✦◎⚠↓?]\s/,'')}</div>
          </div>
        </div>
        {s.entry_zone === 'EXTENDED' && (
          <div className={styles.extendedWarn}>⚠ CMP is {s.pivot_pct?.toFixed(1)}% above pivot — stock has already broken out. Wait for a new base to form before entering.</div>
        )}
        {s.entry_zone === 'IN_BUY_ZONE' && (
          <div className={styles.buyZoneNote}>✦ Price is within the buy zone. Enter on strong volume (≥1.5× avg). Set stop at {inr(s.stop_loss)}.</div>
        )}
      </div>

      {/* Score bar */}
      <div className={styles.scoreRow}>
        <span className={styles.scoreLbl}>SEPA</span>
        <div className={styles.scoreTrack}><div className={styles.scoreFill} style={{ width:`${(s.sepa_score/10)*100}%`, background: sc }} /></div>
        <span className={styles.scoreVal} style={{ color: sc }}>{s.sepa_score}/10</span>
      </div>

      {/* Criteria 2-col */}
      <div className={styles.checks}>
        {Object.entries(s.criteria||{}).map(([k, v]) => (
          <div key={k} className={`${styles.chk} ${v.pass?styles.chkPass:styles.chkFail}`}>
            <div className={`${styles.chkIco} ${v.pass?styles.pass:styles.fail}`}>{v.pass?'✓':'✕'}</div>
            <div className={styles.chkContent}>
              <span className={styles.chkLbl}>{CRIT_LABELS[k]||k}</span>
              <span className={styles.chkDet}>{(v.detail||'').substring(0,36)}</span>
            </div>
          </div>
        ))}
      </div>

      {s.note && <div className={styles.noteBox}>📊 {s.note}</div>}
      <div className={styles.cardFooter}>{s.data_source}</div>
    </div>
  )
}

function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> }
function SunIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> }
function MoonIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> }
function LiveDot()    { return <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'var(--green)',marginRight:5}} /> }
