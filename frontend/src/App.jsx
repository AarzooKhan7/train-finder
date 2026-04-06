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

  // --- FIXED UI: Single Active Filter State ---
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'MORNING', 'NIGHT', 'PREMIUM', 'AC'

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

  const formatDuration = (dur) => {
    if (!dur) return 'N/A';
    const parts = dur.split(':');
    if (parts.length !== 2) return dur;
    return `${parseInt(parts[0])}h ${parseInt(parts[1])}m`;
  };

  // --- NEW FEATURE: Date Stepper ---
  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleSearch = async (overrideSrc, overrideDst, overrideDate) => {
    const s = (overrideSrc || source).trim().toUpperCase();
    const d = (overrideDst || dest).trim().toUpperCase();
    const dt = overrideDate || date;

    setSource(s); setDest(d); setDate(dt);
    setLoading(true); setError(''); setTrains([]); setAltRoutes([]); setSearched(false);
    setActiveFilter('ALL'); setSortBy('departure');

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
      setError('Connection failed. Please check your network.');
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

  // --- STRICT SINGLE-FILTER ENGINE ---
  let processedTrains = [...trains];

  if (activeFilter === 'MORNING') {
    processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 5 && parseInt(t.from_std.split(':')[0]) <= 11);
  } else if (activeFilter === 'NIGHT') {
    processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 18 || parseInt(t.from_std.split(':')[0]) <= 4);
  } else if (activeFilter === 'PREMIUM') {
    const premiumCodes = ['VBEX', 'SHT', 'RAJ', 'TEJ'];
    processedTrains = processedTrains.filter(t => premiumCodes.includes(t.train_type) || t.train_name.toUpperCase().includes('VANDE') || t.train_name.toUpperCase().includes('SHATABDI'));
  } else if (activeFilter === 'AC') {
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
    <div className="rail-app-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        /* CSS RESET & OVERRIDES TO FIX YOUR WHITE TEXT ISSUE */
        .rail-app-wrapper {
          background: #f7f7f9;
          font-family: 'Inter', sans-serif;
          color: #111827 !important;
          min-height: 100vh;
          padding-bottom: 80px;
          -webkit-font-smoothing: antialiased;
        }
        
        .rail-app-wrapper h1, .rail-app-wrapper h2, .rail-app-wrapper h3, .rail-app-wrapper p, .rail-app-wrapper span {
          color: #111827;
        }

        .topbar { background: #ffffff; border-bottom: 1px solid #e5e7eb; padding: 0 32px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .topbar-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; letter-spacing: -0.5px; color: #111827 !important;}
        
        .page { max-width: 800px; margin: 0 auto; padding: 40px 24px 0; }
        .page-title { font-size: 32px; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; color: #111827 !important;}
        .page-subtitle { font-size: 15px; color: #6b7280 !important; margin-bottom: 32px; font-weight: 500;}
        
        /* Clean Input Card */
        .search-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #f3f4f6;}
        .fields-grid { display: grid; grid-template-columns: 1fr 44px 1fr; gap: 16px; margin-bottom: 20px; align-items: center; }
        
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .input-group label { font-size: 11px; font-weight: 700; color: #6b7280 !important; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .premium-input { height: 50px; border: 1px solid #d1d5db; border-radius: 12px; padding: 0 16px; font-size: 16px; font-weight: 600; font-family: inherit; outline: none; background: #ffffff; color: #111827 !important; width: 100%; transition: 0.2s;}
        .premium-input::placeholder { color: #9ca3af !important; font-weight: 500; opacity: 1; }
        .premium-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
        
        .swap-btn { height: 50px; width: 44px; margin-top: 22px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; cursor: pointer; font-size: 16px; color: #4b5563 !important; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
        .swap-btn:hover { background: #f3f4f6; color: #111827 !important;}
        
        /* Date Stepper UI */
        .date-stepper-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 24px;}
        .step-btn { height: 50px; padding: 0 16px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 12px; cursor: pointer; font-weight: 600; color: #4b5563 !important; transition: 0.2s; margin-top: 22px;}
        .step-btn:hover { background: #e5e7eb; color: #111827 !important;}

        .search-btn { width: 100%; height: 54px; background: #111827; color: #ffffff !important; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .search-btn:hover { background: #1f2937; }
        .search-btn:disabled { background: #9ca3af; cursor: not-allowed; }

        .history-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 32px; align-items: center; }
        .history-pill { background: #e5e7eb; color: #4b5563 !important; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s;}
        .history-pill:hover { background: #1f2937; color: #ffffff !important; }

        .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;}
        
        /* Fixed Sort Dropdown */
        .custom-select { appearance: none; padding: 10px 40px 10px 16px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 14px; font-weight: 600; outline: none; background: #ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 12px center; cursor: pointer; color: #111827 !important; transition: 0.2s;}
        
        /* Fixed Mutual Exclusive Filters */
        .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
        .filter-pill { padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; background: #ffffff; color: #4b5563 !important; transition: 0.2s; }
        .filter-pill:hover { border-color: #9ca3af; background: #f9fafb;}
        .filter-pill.active { background: #eff6ff; color: #2563eb !important; border-color: #93c5fd; font-weight: 700;}
        
        .train-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 16px; border: 1px solid #e5e7eb; box-shadow: 0 4px 15px rgba(0,0,0,0.02); transition: 0.2s;}
        .train-card:hover { border-color: #d1d5db; box-shadow: 0 8px 25px rgba(0,0,0,0.05); }
        
        .card-top { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start; }
        .train-name { font-size: 18px; font-weight: 700; color: #111827 !important; display: flex; align-items: center; gap: 8px;}
        .train-num { font-size: 14px; color: #6b7280 !important; font-weight: 500;}
        
        .badge-row { display: flex; gap: 8px; margin-bottom: 8px; }
        .smart-badge { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-fastest { background: #ecfdf5; color: #059669 !important; border: 1px solid #a7f3d0; }
        .badge-earliest { background: #eff6ff; color: #2563eb !important; border: 1px solid #bfdbfe; }
        .badge-type { background: #f3f4f6; color: #4b5563 !important; border: 1px solid #e5e7eb;}
        
        .journey-visual { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: #f9fafb; border-radius: 12px; border: 1px solid #f3f4f6;}
        .time-text { font-size: 22px; font-weight: 700; color: #111827 !important; letter-spacing: -0.5px;}
        .station-text { font-size: 12px; font-weight: 600; color: #6b7280 !important; margin-top: 4px; letter-spacing: 0.3px;}
        
        .track { flex: 1; height: 2px; background: #e5e7eb; position: relative; display: flex; justify-content: center; align-items: center;}
        .track::before, .track::after { content: ''; position: absolute; width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; }
        .track::before { left: 0; } .track::after { right: 0; }
        
        .duration-pill { background: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; color: #4b5563 !important; border: 1px solid #e5e7eb; z-index: 1;}

        .share-btn { background: #ffffff; color: #4b5563 !important; border: 1px solid #d1d5db; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px;}
        .share-btn:hover { background: #f9fafb; color: #111827 !important; border-color: #9ca3af;}
        
        .hub-btn { width: 100%; height: 52px; background: #ea580c; color: #ffffff !important; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; margin-top: 16px; transition: 0.2s;}
        .hub-btn:hover { background: #c2410c; }

        @media (max-width: 600px) {
          .fields-grid { grid-template-columns: 1fr; gap: 12px; }
          .swap-btn { display: none; }
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-brand"><span className="brand-icon">🚆</span>RailFinder</div>
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
          
          <div className="date-stepper-wrap">
            <button className="step-btn" onClick={() => changeDate(-1)}>⟨ Prev</button>
            <div className="input-group" style={{flex: 1}}>
              <label>Date</label>
              <input className="premium-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <button className="step-btn" onClick={() => changeDate(1)}>Next ⟩</button>
          </div>

          <button className="search-btn" onClick={() => handleSearch()} disabled={loading || hubLoading}>
            {loading ? 'Searching...' : 'Search trains'}
          </button>
        </div>

        {history.length > 0 && (
          <div className="history-pills">
            <span style={{fontSize: '11px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase'}}>Recent:</span>
            {history.map((h, i) => (
              <div key={i} className="history-pill" onClick={() => handleSearch(h.src, h.dst, h.date)}>
                {h.src} ➔ {h.dst}
              </div>
            ))}
          </div>
        )}

        {error && <div style={{color:'#b91c1c', background:'#fef2f2', padding:'14px', border:'1px solid #fecaca', borderRadius:'10px', marginBottom:'24px', textAlign:'center', fontWeight: 600, fontSize:'14px'}}>{error}</div>}
        {(loading || hubLoading) && <div style={{textAlign:'center', padding:'40px 0', color:'#6b7280', fontWeight:600}}>🔄 {statusText}</div>}

        {!loading && searched && trains.length > 0 && (
          <>
            <div className="results-header">
              <div style={{fontSize: '18px', fontWeight: 800}}>{processedTrains.length} Direct Trains</div>
              <select className="custom-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="departure">Sort: Earliest First</option>
                <option value="duration">Sort: Fastest Journey</option>
              </select>
            </div>
            
            {/* STRICT SINGLE-SELECT FILTER BAR */}
            <div className="filter-bar">
              <button className={`filter-pill ${activeFilter === 'ALL' ? 'active' : ''}`} onClick={() => setActiveFilter('ALL')}>All Trains</button>
              <button className={`filter-pill ${activeFilter === 'MORNING' ? 'active' : ''}`} onClick={() => setActiveFilter('MORNING')}>🌅 Morning (5a-11a)</button>
              <button className={`filter-pill ${activeFilter === 'NIGHT' ? 'active' : ''}`} onClick={() => setActiveFilter('NIGHT')}>🌙 Night (6p-4a)</button>
              <button className={`filter-pill ${activeFilter === 'PREMIUM' ? 'active' : ''}`} onClick={() => setActiveFilter('PREMIUM')}>⚡ Premium Only</button>
              <button className={`filter-pill ${activeFilter === 'AC' ? 'active' : ''}`} onClick={() => setActiveFilter('AC')}>❄️ AC Classes Only</button>
            </div>
          </>
        )}

        {!loading && searched && processedTrains.length === 0 && trains.length > 0 && (
           <div style={{textAlign:'center', padding:'40px', color:'#6b7280', fontWeight:600, background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb'}}>No trains match the selected filter.</div>
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
                  Share 💬
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
                <div style={{fontSize: '13px', fontWeight: 600, color: '#6b7280', marginTop: '16px'}}>
                  Available Classes: <span style={{color: '#1f2937'}}>{t.class_type.join(', ')}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}