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

  // --- NEW FEATURES: ZERO-TOKEN FILTERS ---
  const [filterTime, setFilterTime] = useState('ALL'); // ALL, MORNING, NIGHT
  const [filterPremium, setFilterPremium] = useState(false); // Vande Bharat/Shatabdi/Rajdhani only
  const [filterAC, setFilterAC] = useState(false); // AC classes only

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

  // --- STAGE 1: DIRECT SEARCH ---
  const handleSearch = async (overrideSrc, overrideDst, overrideDate) => {
    const s = (overrideSrc || source).trim().toUpperCase();
    const d = (overrideDst || dest).trim().toUpperCase();
    const dt = overrideDate || date;

    setSource(s); setDest(d); setDate(dt);
    setLoading(true); setError(''); setTrains([]); setAltRoutes([]); setSearched(false);
    
    // Reset Filters on new search
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
      setError('Could not reach the server. Please try again.');
    }
    setLoading(false); setSearched(true);
  };

  // --- STAGE 2: HUB SEARCH ---
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

  // 1. Apply Time Filter
  if (filterTime === 'MORNING') {
    processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 5 && parseInt(t.from_std.split(':')[0]) <= 11);
  } else if (filterTime === 'NIGHT') {
    processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 18 || parseInt(t.from_std.split(':')[0]) <= 4);
  }

  // 2. Apply Premium Filter
  if (filterPremium) {
    const premiumCodes = ['VBEX', 'SHT', 'RAJ', 'TEJ'];
    processedTrains = processedTrains.filter(t => premiumCodes.includes(t.train_type) || t.train_name.toUpperCase().includes('VANDE') || t.train_name.toUpperCase().includes('SHATABDI'));
  }

  // 3. Apply AC Filter
  if (filterAC) {
    const acClasses = ['1A', '2A', '3A', '3E', 'CC', 'EC', 'EV'];
    processedTrains = processedTrains.filter(t => t.class_type && t.class_type.some(c => acClasses.includes(c)));
  }

  // 4. Sort
  processedTrains.sort((a, b) => {
    const minsA = a.duration ? parseInt(a.duration.split(':')[0]) * 60 + parseInt(a.duration.split(':')[1]) : Infinity;
    const minsB = b.duration ? parseInt(b.duration.split(':')[0]) * 60 + parseInt(b.duration.split(':')[1]) : Infinity;
    if (sortBy === 'duration') return minsA - minsB;
    return a.from_std.localeCompare(b.from_std);
  });

  // Calculate Badges on the FILTERED results
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

  // --- NEW FEATURE: WHATSAPP SHARE ---
  const shareToWhatsApp = (t) => {
    const text = `🚆 *${t.train_name} (${t.train_number})*\n🗓 ${date}\n📍 ${t.from_station_name} (${t.from_std}) ➔ ${t.to_station_name} (${t.to_sta})\n⏱ Duration: ${t.duration || 'N/A'}\n\nSearched via RailFinder`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0eee9; font-family: 'Inter', sans-serif; color: #111; padding-bottom: 80px; }
        
        .topbar { background: #111; color: #fff; padding: 0 32px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .topbar-brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; letter-spacing: -0.5px; }
        .brand-icon { font-size: 20px; }
        
        .page { max-width: 760px; margin: 0 auto; padding: 40px 24px 0; }
        .page-title { font-size: 36px; font-weight: 800; letter-spacing: -1px; margin-bottom: 8px; }
        .page-subtitle { font-size: 16px; color: #666; margin-bottom: 32px; }
        
        .search-card { background: #fff; border-radius: 20px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); }
        .fields-grid { display: grid; grid-template-columns: 1fr 48px 1fr; gap: 16px; margin-bottom: 16px; align-items: center; }
        .date-row { margin-bottom: 24px; }
        
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .premium-input { height: 52px; border: 1px solid #e0e0e0; border-radius: 12px; padding: 0 16px; font-size: 16px; font-weight: 600; font-family: inherit; outline: none; transition: 0.2s; background: #fafafa; width: 100%;}
        .premium-input:focus { border-color: #111; background: #fff; }
        
        .swap-btn { height: 52px; width: 48px; margin-top: 22px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 12px; cursor: pointer; font-size: 18px; color: #555; transition: 0.2s; display: flex; align-items: center; justify-content: center;}
        .swap-btn:hover { background: #eee; }
        
        .search-btn { width: 100%; height: 56px; background: #111; color: #fff; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .search-btn:hover { background: #333; transform: translateY(-1px); }
        .search-btn:disabled { background: #999; cursor: not-allowed; transform: none; }

        .history-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px; align-items: center; }
        .history-pill { background: #e5e3de; color: #444; padding: 8px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;}
        .history-pill:hover { background: #111; color: #fff; }

        /* Filter Bar UI */
        .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
        .filter-pill { padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid #ddd; background: #fff; color: #666; transition: 0.2s; }
        .filter-pill.active { background: #111; color: #fff; border-color: #111; }
        
        .train-card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 16px; border: 1px solid #eee; box-shadow: 0 4px 15px rgba(0,0,0,0.02); }
        .card-top { display: flex; justify-content: space-between; margin-bottom: 16px; align-items: flex-start; }
        .train-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
        .badge-row { display: flex; gap: 8px; margin-bottom: 6px; }
        .smart-badge { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-fastest { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
        .badge-earliest { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .badge-type { background: #f3f4f6; color: #4b5563; }
        
        .journey-visual { display: flex; align-items: center; gap: 16px; padding: 16px; background: #fafafa; border-radius: 12px; margin-bottom: 12px; }
        .time-text { font-size: 22px; font-weight: 800; letter-spacing: -0.5px;}
        .station-text { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; margin-top: 2px;}
        .track { flex: 1; height: 2px; background: #e5e7eb; position: relative; display: flex; justify-content: center; align-items: center;}
        .track::before, .track::after { content: ''; position: absolute; width: 6px; height: 6px; background: #d1d5db; border-radius: 50%; }
        .track::before { left: 0; } .track::after { right: 0; }
        .duration-pill { background: #fff; padding: 4px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; color: #6b7280; border: 1px solid #e5e7eb; z-index: 1;}

        .share-btn { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px;}
        .share-btn:hover { background: #d1fae5; }
        .hub-btn { width: 100%; height: 50px; background: #ea580c; color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; margin-top: 16px; transition: 0.2s;}
        .hub-btn:hover { background: #c2410c; }

        @media (max-width: 600px) {
          .fields-grid { grid-template-columns: 1fr; gap: 12px; }
          .swap-btn { display: none; }
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-brand"><span className="brand-icon">🚆</span>RailFinder</div>
        <span style={{fontSize:'13px', color:'#aaa', fontWeight: 500}}>India Rail Search</span>
      </div>

      <div className="page">
        <h1 className="page-title">Find trains</h1>
        <p className="page-subtitle">Search direct & connecting routes across India</p>

        <div className="search-card">
          <div className="fields-grid">
            <div className="input-group">
              <label>From</label>
              <input className="premium-input" value={source} onChange={e => setSource(e.target.value.toUpperCase())} maxLength={8}/>
            </div>
            <button className="swap-btn" onClick={swap}>⇄</button>
            <div className="input-group">
              <label>To</label>
              <input className="premium-input" value={dest} onChange={e => setDest(e.target.value.toUpperCase())} maxLength={8}/>
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

        {/* RECENT SEARCHES */}
        {history.length > 0 && (
          <div className="history-pills">
            <span style={{fontSize: '12px', color: '#888', fontWeight: 600}}>Recent:</span>
            {history.map((h, i) => (
              <div key={i} className="history-pill" onClick={() => handleSearch(h.src, h.dst, h.date)}>
                {h.src} ➔ {h.dst}
              </div>
            ))}
          </div>
        )}

        {error && <div style={{color:'#dc2626', background:'#fef2f2', padding:'12px', borderRadius:'10px', marginBottom:'20px', textAlign:'center', fontWeight: 600, fontSize:'14px'}}>{error}</div>}
        {(loading || hubLoading) && <div style={{textAlign:'center', padding:'40px 0', color:'#666', fontWeight:600}}>🔄 {statusText}</div>}

        {/* HEADER & UI CONTROLS */}
        {!loading && searched && trains.length > 0 && (
          <>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
              <div style={{fontSize: '18px', fontWeight: 800}}>{processedTrains.length} Trains Found</div>
              <select style={{padding: '8px 16px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '13px', fontWeight: 600, outline:'none', background:'#fff', cursor:'pointer'}} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="departure">Sort: Earliest First</option>
                <option value="duration">Sort: Fastest Journey</option>
              </select>
            </div>
            
            {/* ZERO TOKEN FILTERS */}
            <div className="filter-bar">
              <button className={`filter-pill ${filterTime === 'ALL' ? 'active' : ''}`} onClick={() => setFilterTime('ALL')}>All Day</button>
              <button className={`filter-pill ${filterTime === 'MORNING' ? 'active' : ''}`} onClick={() => setFilterTime('MORNING')}>🌅 Morning (5a-11a)</button>
              <button className={`filter-pill ${filterTime === 'NIGHT' ? 'active' : ''}`} onClick={() => setFilterTime('NIGHT')}>🌙 Night (6p-4a)</button>
              <button className={`filter-pill ${filterPremium ? 'active' : ''}`} onClick={() => setFilterPremium(!filterPremium)}>⚡ Premium Only</button>
              <button className={`filter-pill ${filterAC ? 'active' : ''}`} onClick={() => setFilterAC(!filterAC)}>❄️ AC Classes Only</button>
            </div>
          </>
        )}

        {/* DIRECT TRAINS RESULTS */}
        {!loading && searched && processedTrains.length === 0 && trains.length > 0 && (
           <div style={{textAlign:'center', padding:'30px', color:'#888', fontWeight:600}}>No trains match your current filters.</div>
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
                  <div className="train-name">{t.train_name} <span style={{color:'#888', fontSize:'14px'}}>#{t.train_number}</span></div>
                </div>
                <button className="share-btn" onClick={() => shareToWhatsApp(t)}>Share 💬</button>
              </div>
              
              <div className="journey-visual">
                <div><div className="time-text">{t.from_std}</div><div className="station-text">{t.from_station_name}</div></div>
                <div className="track"><span className="duration-pill">{t.duration || 'N/A'}</span></div>
                <div style={{textAlign:'right'}}><div className="time-text">{t.to_sta}</div><div className="station-text">{t.to_station_name}</div></div>
              </div>
              {t.class_type && (
                <div style={{fontSize: '11px', fontWeight: 700, color: '#888', marginTop: '10px'}}>
                  Classes: <span style={{color: '#111'}}>{t.class_type.join(', ')}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* CONNECTING ROUTES PROMPT */}
        {!loading && searched && trains.length === 0 && altRoutes.length === 0 && !hubLoading && (
          <div style={{textAlign:'center', background:'#fff', padding:'40px 20px', borderRadius:'16px'}}>
            <h3 style={{fontSize:'18px', fontWeight:800, marginBottom:'8px'}}>No direct trains found</h3>
            <p style={{color:'#666', fontSize:'14px', marginBottom:'24px'}}>Our system can scan major transit hubs to find a smart connecting route.</p>
            <button className="hub-btn" onClick={searchConnections}>Scan Connecting Routes</button>
          </div>
        )}

        {/* CONNECTING TRAINS RESULTS */}
        {!hubLoading && altRoutes.map((c, i) => (
          <div className="train-card" style={{borderLeft: '4px solid #ea580c'}} key={`alt-${i}`}>
            <h3 style={{color: '#ea580c', fontSize:'14px', fontWeight:800, marginBottom:'16px', textTransform:'uppercase'}}>VIA {c.hub} (Layover: {c.layover}h)</h3>
            <div className="journey-visual" style={{marginBottom:'8px'}}>
              <div><div className="time-text">{c.leg1.from_std}</div></div>
              <div className="track"><span className="duration-pill">Leg 1 ({c.leg1.train_name})</span></div>
              <div style={{textAlign:'right'}}><div className="time-text">{c.leg1.to_sta}</div></div>
            </div>
            <div className="journey-visual">
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