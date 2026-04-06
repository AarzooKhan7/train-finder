import { useState, useEffect } from 'react';

const TRANSIT_HUBS = ['NDLS', 'CNB', 'PNBE', 'DDU', 'ET', 'HWH', 'VGLJ', 'BZA'];
const BACKEND_URL = "https://train-finder-mu.vercel.app/api/search";

export default function App() {
  const [source, setSource] = useState('JBN');
  const [dest, setDest] = useState('NDLS');
  const [date, setDate] = useState('2026-04-15');
  
  const [trains, setTrains] = useState([]);
  const [altRoutes, setAltRoutes] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [hubLoading, setHubLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const [sortBy, setSortBy] = useState('departure'); 
  const [history, setHistory] = useState([]);

  // Filters
  const [filterTime, setFilterTime] = useState('ALL'); 
  const [filterPremium, setFilterPremium] = useState(false);
  const [filterAC, setFilterAC] = useState(false); 

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('DIRECT-'));
    const parsed = keys.map(k => {
      const parts = k.split('-');
      return { src: parts[1], dst: parts[2], date: `${parts[3]}-${parts[4]}-${parts[5]}` };
    }).reverse().slice(0, 4);
    setHistory(parsed);
  };

  const swap = () => { setSource(dest); setDest(source); };
  const getCache = (key) => { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : null; };
  const setCache = (key, data) => { localStorage.setItem(key, JSON.stringify(data)); loadHistory(); };

  // Helper to format "05:58" to "5h 58m"
  const formatDuration = (dur) => {
    if (!dur) return 'N/A';
    const parts = dur.split(':');
    if (parts.length !== 2) return dur;
    return `${parseInt(parts[0])}h ${parseInt(parts[1])}m`;
  };

  const handleSearch = async (overrideSrc, overrideDst, overrideDate) => {
    const s = (overrideSrc || source).trim().toUpperCase();
    const d = (overrideDst || dest).trim().toUpperCase();
    const dt = overrideDate || date;

    setSource(s); setDest(d); setDate(dt);
    setLoading(true); setError(''); setTrains([]); setAltRoutes([]); setSearched(false);
    
    setFilterTime('ALL'); setFilterPremium(false); setFilterAC(false); setSortBy('departure');

    const cacheKey = `DIRECT-${s}-${d}-${dt}`;

    if (getCache(cacheKey)) {
      setTrains(getCache(cacheKey));
      setLoading(false); setSearched(true); return;
    }

    try {
      setStatusText(`Looking up ${s} → ${d}`);
      const res = await fetch(`${BACKEND_URL}?source=${s}&dest=${d}&date=${dt}`);
      const json = await res.json();
      
      if (json.status && json.data?.length > 0) {
        setTrains(json.data);
        setCache(cacheKey, json.data);
      }
    } catch {
      setError('Could not reach the server. Please check your connection.');
    }
    setLoading(false); setSearched(true);
  };

  const searchConnections = async () => {
    setHubLoading(true); setError('');
    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();
    const cacheKey = `ALT-${src}-${dst}-${date}`;

    if (getCache(cacheKey)) { setAltRoutes(getCache(cacheKey)); setHubLoading(false); return; }

    try {
      const apiToday = date; 
      const nextDayObj = new Date(date);
      nextDayObj.setDate(nextDayObj.getDate() + 1);
      const apiTomorrow = nextDayObj.toISOString().split('T')[0];
      let connections = [];

      for (let hub of TRANSIT_HUBS) {
        if (hub === src || hub === dst) continue;
        setStatusText(`Scanning network via ${hub}...`);
        const l1Res = await fetch(`${BACKEND_URL}?source=${src}&dest=${hub}&date=${apiToday}`);
        const l1Data = await l1Res.json();

        if (l1Data.status && l1Data.data?.length > 0) {
          const l2Res = await fetch(`${BACKEND_URL}?source=${hub}&dest=${dst}&date=${apiTomorrow}`);
          const l2Data = await l2Res.json();

          if (l2Data.status && l2Data.data) {
            l1Data.data.forEach(t1 => {
              l2Data.data.forEach(t2 => {
                const arrivalAtHub = new Date(`${date}T${t1.to_sta}:00`).getTime();
                let departureFromHub = new Date(`${date}T${t2.from_std}:00`).getTime();
                if (departureFromHub < arrivalAtHub) {
                  departureFromHub = new Date(`${apiTomorrow}T${t2.from_std}:00`).getTime();
                }
                const diffHours = (departureFromHub - arrivalAtHub) / (1000 * 60 * 60);

                if (diffHours >= 1 && diffHours <= 20) {
                  connections.push({ hub, leg1: t1, leg2: t2, layover: Math.round(diffHours) });
                }
              });
            });
          }
        }
      }
      const finalAlt = connections.sort((a, b) => a.layover - b.layover);
      setAltRoutes(finalAlt);
      setCache(cacheKey, finalAlt);
    } catch (err) {
      setError("Quota limit exceeded while searching hubs.");
    }
    setHubLoading(false);
  };

  // --- SMART FILTER & SORT ENGINE ---
  let processedTrains = [...trains];

  if (filterTime === 'MORNING') {
    processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 5 && parseInt(t.from_std.split(':')[0]) <= 11);
  } else if (filterTime === 'NIGHT') {
    processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 18 || parseInt(t.from_std.split(':')[0]) <= 4);
  }

  if (filterPremium) {
    const premiumCodes = ['VBEX', 'SHT', 'RAJ', 'TEJ'];
    processedTrains = processedTrains.filter(t => premiumCodes.includes(t.train_type) || t.train_name.toUpperCase().includes('VANDE') || t.train_name.toUpperCase().includes('SHATABDI'));
  }

  if (filterAC) {
    const acClasses = ['1A', '2A', '3A', '3E', 'CC', 'EC', 'EV'];
    processedTrains = processedTrains.filter(t => t.class_type && t.class_type.some(c => acClasses.includes(c)));
  }

  processedTrains.sort((a, b) => {
    const minsA = a.duration ? parseInt(a.duration.split(':')[0]) * 60 + parseInt(a.duration.split(':')[1]) : Infinity;
    const minsB = b.duration ? parseInt(b.duration.split(':')[0]) * 60 + parseInt(b.duration.split(':')[1]) : Infinity;
    if (sortBy === 'duration') return minsA - minsB;
    return a.from_std.localeCompare(b.from_std);
  });

  let fastestIndex = -1, earliestIndex = -1;
  if (processedTrains.length > 0) {
    earliestIndex = 0; 
    let minDuration = Infinity;
    processedTrains.forEach((t, i) => {
      if (t.duration) {
        const mins = parseInt(t.duration.split(':')[0]) * 60 + parseInt(t.duration.split(':')[1]);
        if (mins < minDuration) { minDuration = mins; fastestIndex = i; }
      }
    });
  }

  const shareToWhatsApp = (t) => {
    const text = `🚆 *${t.train_name} (${t.train_number})*\n🗓 ${date}\n📍 ${t.from_station_name} (${t.from_std}) ➔ ${t.to_station_name} (${t.to_sta})\n⏱ Duration: ${formatDuration(t.duration)}\n\nSearched via RailFinder`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f7f7f9; font-family: 'Inter', sans-serif; color: #1f2937; padding-bottom: 80px; -webkit-font-smoothing: antialiased; }
        
        .topbar { background: #ffffff; border-bottom: 1px solid #e5e7eb; padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; }
        .topbar-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; letter-spacing: -0.5px; color: #111;}
        .brand-icon { font-size: 20px; }
        
        .page { max-width: 800px; margin: 0 auto; padding: 40px 24px 0; }
        .page-title { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 6px; color: #111;}
        .page-subtitle { font-size: 15px; color: #6b7280; margin-bottom: 32px; font-weight: 400;}
        
        /* Premium Search Card */
        .search-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #f3f4f6;}
        .fields-grid { display: grid; grid-template-columns: 1fr 44px 1fr; gap: 16px; margin-bottom: 20px; align-items: center; }
        .date-row { margin-bottom: 24px; }
        
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .input-group label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
        
        /* Fixed Placeholders & Inputs */
        .premium-input { height: 48px; border: 1px solid #d1d5db; border-radius: 10px; padding: 0 16px; font-size: 15px; font-weight: 500; font-family: inherit; outline: none; transition: all 0.2s; background: #ffffff; color: #111; width: 100%;}
        .premium-input::placeholder { color: #9ca3af; font-weight: 400; }
        .premium-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        
        .swap-btn { height: 48px; width: 44px; margin-top: 22px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 10px; cursor: pointer; font-size: 16px; color: #4b5563; transition: 0.2s; display: flex; align-items: center; justify-content: center;}
        .swap-btn:hover { background: #e5e7eb; color: #111;}
        
        .search-btn { width: 100%; height: 52px; background: #111827; color: #ffffff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; letter-spacing: 0.3px;}
        .search-btn:hover { background: #374151; }
        .search-btn:disabled { background: #9ca3af; cursor: not-allowed; }

        /* History Pills */
        .history-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 32px; align-items: center; }
        .history-pill { background: #e5e7eb; color: #4b5563; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; transition: 0.2s;}
        .history-pill:hover { background: #1f2937; color: #ffffff; }

        /* Elegant Filter Bar & Custom Select */
        .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;}
        .results-count { font-size: 16px; font-weight: 600; color: #111; }
        
        .custom-select { appearance: none; padding: 8px 36px 8px 16px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 13px; font-weight: 500; outline: none; background: #ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center; cursor: pointer; color: #374151; transition: 0.2s;}
        .custom-select:hover { border-color: #9ca3af; }

        .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
        .filter-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #d1d5db; background: #ffffff; color: #4b5563; transition: 0.2s; }
        .filter-pill:hover { border-color: #9ca3af; background: #f9fafb;}
        .filter-pill.active { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; font-weight: 600;}
        
        /* Refined Train Card */
        .train-card { background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.02); transition: 0.2s;}
        .train-card:hover { border-color: #d1d5db; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
        
        .card-top { display: flex; justify-content: space-between; margin-bottom: 16px; align-items: flex-start; }
        .train-name { font-size: 16px; font-weight: 600; color: #111; display: flex; align-items: center; gap: 6px;}
        .train-num { font-size: 13px; color: #6b7280; font-weight: 400;}
        
        .badge-row { display: flex; gap: 6px; margin-bottom: 8px; }
        .smart-badge { padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-fastest { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
        .badge-earliest { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .badge-type { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb;}
        
        /* Upgraded Journey Visualizer */
        .journey-visual { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6;}
        .time-text { font-size: 20px; font-weight: 600; color: #111; letter-spacing: -0.5px;}
        .station-text { font-size: 11px; font-weight: 500; color: #6b7280; margin-top: 4px; letter-spacing: 0.3px;}
        
        .track { flex: 1; height: 2px; background: #e5e7eb; position: relative; display: flex; justify-content: center; align-items: center;}
        .track::before, .track::after { content: ''; position: absolute; width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; }
        .track::before { left: 0; } .track::after { right: 0; }
        
        .duration-pill { background: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; color: #4b5563; border: 1px solid #e5e7eb; z-index: 1;}

        .share-btn { background: #ffffff; color: #4b5563; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px;}
        .share-btn:hover { background: #f3f4f6; color: #111; }
        
        .hub-btn { width: 100%; height: 48px; background: #ea580c; color: #ffffff; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; margin-top: 16px; transition: 0.2s;}
        .hub-btn:hover { background: #c2410c; }

        @media (max-width: 600px) {
          .fields-grid { grid-template-columns: 1fr; gap: 12px; }
          .swap-btn { display: none; }
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-brand"><span className="brand-icon">🚆</span>RailFinder</div>
        <span style={{fontSize:'12px', color:'#6b7280', fontWeight: 500}}>India Rail Search</span>
      </div>

      <div className="page">
        <h1 className="page-title">Find trains</h1>
        <p className="page-subtitle">Search direct & connecting routes across India</p>

        <div className="search-card">
          <div className="fields-grid">
            <div className="input-group">
              <label>From</label>
              <input className="premium-input" placeholder="e.g. CNB" value={source} onChange={e => setSource(e.target.value.toUpperCase())} maxLength={8}/>
            </div>
            <button className="swap-btn" onClick={swap}>⇄</button>
            <div className="input-group">
              <label>To</label>
              <input className="premium-input" placeholder="e.g. NDLS" value={dest} onChange={e => setDest(e.target.value.toUpperCase())} maxLength={8}/>
            </div>
          </div>
          <div className="date-row input-group">
            <label>Date</label>
            <input className="premium-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <button className="search-btn" onClick={() => handleSearch()} disabled={loading || hubLoading}>
            {loading ? 'Searching...' : 'Search trains'}
          </button>
        </div>

        {history.length > 0 && (
          <div className="history-pills">
            <span style={{fontSize: '11px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase'}}>Recent:</span>
            {history.map((h, i) => (
              <div key={i} className="history-pill" onClick={() => handleSearch(h.src, h.dst, h.date)}>
                {h.src} ➔ {h.dst}
              </div>
            ))}
          </div>
        )}

        {error && <div style={{color:'#b91c1c', background:'#fef2f2', padding:'12px', border:'1px solid #fecaca', borderRadius:'8px', marginBottom:'24px', textAlign:'center', fontWeight: 500, fontSize:'13px'}}>{error}</div>}
        {(loading || hubLoading) && <div style={{textAlign:'center', padding:'40px 0', color:'#6b7280', fontWeight:500}}>🔄 {statusText}</div>}

        {!loading && searched && trains.length > 0 && (
          <>
            <div className="results-header">
              <div className="results-count">{processedTrains.length} Direct Trains</div>
              <select className="custom-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="departure">Sort: Earliest First</option>
                <option value="duration">Sort: Fastest Journey</option>
              </select>
            </div>
            
            <div className="filter-bar">
              <button className={`filter-pill ${filterTime === 'ALL' ? 'active' : ''}`} onClick={() => setFilterTime('ALL')}>All Day</button>
              <button className={`filter-pill ${filterTime === 'MORNING' ? 'active' : ''}`} onClick={() => setFilterTime('MORNING')}>🌅 Morning (5a-11a)</button>
              <button className={`filter-pill ${filterTime === 'NIGHT' ? 'active' : ''}`} onClick={() => setFilterTime('NIGHT')}>🌙 Night (6p-4a)</button>
              <button className={`filter-pill ${filterPremium ? 'active' : ''}`} onClick={() => setFilterPremium(!filterPremium)}>⚡ Premium Only</button>
              <button className={`filter-pill ${filterAC ? 'active' : ''}`} onClick={() => setFilterAC(!filterAC)}>❄️ AC Classes Only</button>
            </div>
          </>
        )}

        {!loading && searched && processedTrains.length === 0 && trains.length > 0 && (
           <div style={{textAlign:'center', padding:'40px', color:'#6b7280', fontWeight:500, background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb'}}>No trains match your current filters.</div>
        )}

        {!loading && searched && processedTrains.map((t, i) => {
          const isFastest = (i === fastestIndex && processedTrains.length > 1);
          const isEarliest = (i === earliestIndex && processedTrains.length > 1 && sortBy === 'departure');
          
          return (
            <div className="train-card" key={i}>
              <div className="card-top">
                <div>
                  <div className="badge-row">
                    {t.train_type && <span className="smart-badge badge-type">{t.train_type}</span>}
                    {isFastest && <span className="smart-badge badge-fastest">⚡ Fastest</span>}
                    {isEarliest && <span className="smart-badge badge-earliest">🌅 Earliest</span>}
                  </div>
                  <div className="train-name">
                    {t.train_name} <span className="train-num">#{t.train_number}</span>
                  </div>
                </div>
                <button className="share-btn" onClick={() => shareToWhatsApp(t)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                  Share
                </button>
              </div>
              
              <div className="journey-visual">
                <div>
                  <div className="time-text">{t.from_std}</div>
                  <div className="station-text">{t.from_station_name}</div>
                </div>
                <div className="track">
                  <span className="duration-pill">{formatDuration(t.duration)}</span>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="time-text">{t.to_sta}</div>
                  <div className="station-text">{t.to_station_name}</div>
                </div>
              </div>
              {t.class_type && (
                <div style={{fontSize: '12px', fontWeight: 500, color: '#6b7280', marginTop: '12px'}}>
                  Classes: <span style={{color: '#1f2937'}}>{t.class_type.join(', ')}</span>
                </div>
              )}
            </div>
          );
        })}

        {!loading && searched && trains.length === 0 && altRoutes.length === 0 && !hubLoading && (
          <div style={{textAlign:'center', background:'#ffffff', padding:'40px 24px', borderRadius:'16px', border: '1px solid #e5e7eb'}}>
            <h3 style={{fontSize:'18px', fontWeight:600, marginBottom:'8px', color: '#111'}}>No direct trains found</h3>
            <p style={{color:'#6b7280', fontSize:'14px', marginBottom:'24px', lineHeight: '1.5'}}>Our system can scan major transit hubs to find a smart connecting route.</p>
            <button className="hub-btn" onClick={searchConnections}>Scan Connecting Routes</button>
          </div>
        )}

        {!hubLoading && altRoutes.map((c, i) => (
          <div className="train-card" style={{borderLeft: '4px solid #ea580c'}} key={`alt-${i}`}>
            <h3 style={{color: '#ea580c', fontSize:'13px', fontWeight:700, marginBottom:'16px', textTransform:'uppercase', letterSpacing: '0.5px'}}>VIA {c.hub} (Layover: {c.layover}h)</h3>
            <div className="journey-visual" style={{marginBottom:'12px', background: '#ffffff', border: '1px solid #f3f4f6'}}>
              <div><div className="time-text">{c.leg1.from_std}</div></div>
              <div className="track"><span className="duration-pill">Leg 1 ({c.leg1.train_name})</span></div>
              <div style={{textAlign:'right'}}><div className="time-text">{c.leg1.to_sta}</div></div>
            </div>
            <div className="journey-visual" style={{background: '#ffffff', border: '1px solid #f3f4f6'}}>
              <div><div className="time-text">{c.leg2.from_std}</div></div>
              <div className="track"><span className="duration-pill">Leg 2 ({c.leg2.train_name})</span></div>
              <div style={{textAlign:'right'}}><div className="time-text">{c.leg2.to_sta}</div></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
