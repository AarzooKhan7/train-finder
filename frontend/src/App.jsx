import { useState } from 'react';

// The major hubs that connect the North, South, East, and West.
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

  const swap = () => { setSource(dest); setDest(source); };

  // --- HELPER FUNCTIONS ---
  const formatApiDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  };

  const getCache = (key) => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  };

  const setCache = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  // --- STAGE 1: DIRECT SEARCH (1 Token) ---
  const handleSearch = async () => {
    setLoading(true); setError(''); setTrains([]); setAltRoutes([]); setSearched(false);
    
    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();
    const cacheKey = `DIRECT-${src}-${dst}-${date}`;

    if (getCache(cacheKey)) {
      setTrains(getCache(cacheKey));
      setLoading(false); setSearched(true); return;
    }

    try {
      setStatusText(`Looking up ${src} → ${dst}`);
      const apiDate = formatApiDate(date);
      const res = await fetch(`${BACKEND_URL}?source=${src}&dest=${dst}&date=${apiDate}`);
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

  // --- STAGE 2: HUB SEARCH (Costs more tokens) ---
  const searchConnections = async () => {
    setHubLoading(true); setError('');
    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();
    const cacheKey = `ALT-${src}-${dst}-${date}`;

    if (getCache(cacheKey)) {
      setAltRoutes(getCache(cacheKey));
      setHubLoading(false); return;
    }

    try {
      const apiToday = formatApiDate(date);
      const nextDayObj = new Date(date);
      nextDayObj.setDate(nextDayObj.getDate() + 1);
      const tomorrowStr = nextDayObj.toISOString().split('T')[0];
      const apiTomorrow = formatApiDate(tomorrowStr);

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
                // Safe overnight math using Unix Timestamps
                const arrivalAtHub = new Date(`${date}T${t1.to_sta}:00`).getTime();
                let departureFromHub = new Date(`${date}T${t2.from_std}:00`).getTime();
                
                // If departure is early morning, it's the next day
                if (departureFromHub < arrivalAtHub) {
                  departureFromHub = new Date(`${tomorrowStr}T${t2.from_std}:00`).getTime();
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

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f5f3; font-family: 'DM Sans', sans-serif; color: #1a1a1a; padding-bottom: 80px; }
        .topbar { background: #fff; border-bottom: 1px solid #e8e8e5; padding: 0 32px; height: 56px; display: flex; align-items: center; justify-content: space-between; }
        .topbar-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -0.3px; }
        .brand-icon { width: 30px; height: 30px; background: #1a1a1a; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; }
        .page { max-width: 720px; margin: 0 auto; padding: 40px 24px 0; }
        .search-card { background: #fff; border: 1px solid #e8e8e5; border-radius: 16px; padding: 20px; margin-bottom: 32px; }
        .fields { display: grid; grid-template-columns: 1fr 36px 1fr 160px; gap: 10px; margin-bottom: 14px; align-items: end; }
        .field label { display: block; font-size: 11px; font-weight: 600; color: #aaa; margin-bottom: 6px; text-transform: uppercase;}
        .field input { width: 100%; height: 42px; background: #f8f8f6; border: 1px solid #e4e4e1; border-radius: 10px; padding: 0 14px; font-weight: 600; outline: none; }
        .search-btn { width: 100%; height: 44px; background: #1a1a1a; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; }
        .hub-btn { width: 100%; height: 44px; background: #f97316; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; margin-top: 10px; }
        .train-card { background: #fff; border: 1px solid #e8e8e5; border-radius: 14px; padding: 18px 20px; margin-bottom: 12px; }
        .card-top { display: flex; justify-content: space-between; margin-bottom: 14px; }
        .train-name { font-weight: 700; }
        .train-type-badge { display: inline-block; background: #f2f2f0; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #555; }
        .journey { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #f8f8f6; border-radius: 10px; margin-bottom: 14px; }
        .time-big { font-size: 20px; font-weight: 700; }
        .track-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .track-line { width: 100%; height: 1px; background: #ddd; position: relative; }
        .empty { text-align: center; padding: 40px 0; background: #fff; border-radius: 16px; border: 1px dashed #ccc; }
        .conn-card { border-left: 5px solid #f97316; }
      `}</style>

      <div className="topbar">
        <div className="topbar-brand"><div className="brand-icon">🚆</div>RailFinder</div>
        <span style={{fontSize:'12px', color:'#999'}}>India Rail Search</span>
      </div>

      <div className="page">
        <h1 style={{fontSize: '26px', fontWeight: 700, marginBottom: '4px'}}>Find trains</h1>
        <p style={{fontSize: '14px', color: '#888', marginBottom: '28px'}}>Search direct & connecting routes</p>

        <div className="search-card">
          <div className="fields">
            <div className="field">
              <label>From</label>
              <input value={source} onChange={e => setSource(e.target.value.toUpperCase())} maxLength={8}/>
            </div>
            <button onClick={swap} style={{height:'42px', width:'36px', borderRadius:'10px', border:'1px solid #e4e4e1', cursor:'pointer'}}>⇄</button>
            <div className="field">
              <label>To</label>
              <input value={dest} onChange={e => setDest(e.target.value.toUpperCase())} maxLength={8}/>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <button className="search-btn" onClick={handleSearch} disabled={loading || hubLoading}>
            {loading ? 'Searching Direct...' : 'Search trains'}
          </button>
        </div>

        {error && <div style={{color:'red', marginBottom:'20px', textAlign:'center'}}>{error}</div>}

        {/* LOADING STATE */}
        {(loading || hubLoading) && (
          <div style={{textAlign:'center', padding:'40px 0', color:'#888'}}>
            <p>🔄 {statusText}</p>
          </div>
        )}

        {/* DIRECT TRAINS RESULTS */}
        {!loading && searched && trains.map((t, i) => (
          <div className="train-card" key={i}>
            <div className="card-top">
              <div>
                {t.train_type && <div className="train-type-badge">{t.train_type}</div>}
                <div className="train-name">{t.train_name} (#{t.train_number})</div>
              </div>
            </div>
            <div className="journey">
              <div><div className="time-big">{t.from_std}</div><div style={{fontSize:'10px', color:'#aaa'}}>{t.from_station_name}</div></div>
              <div className="track-wrap"><div className="track-line" /></div>
              <div style={{textAlign:'right'}}><div className="time-big">{t.to_sta}</div><div style={{fontSize:'10px', color:'#aaa'}}>{t.to_station_name}</div></div>
            </div>
          </div>
        ))}

        {/* CONNECTING ROUTES PROMPT */}
        {!loading && searched && trains.length === 0 && altRoutes.length === 0 && !hubLoading && (
          <div className="empty">
            <p style={{fontWeight:600, color:'#555'}}>No direct trains found.</p>
            <button className="hub-btn" onClick={searchConnections}>Search Connecting Routes (Hub Scan)</button>
          </div>
        )}

        {/* CONNECTING TRAINS RESULTS */}
        {!hubLoading && altRoutes.map((c, i) => (
          <div className="train-card conn-card" key={`alt-${i}`}>
            <h3 style={{color: '#f97316', fontSize:'14px', marginBottom:'10px'}}>VIA {c.hub} (Layover: {c.layover}h)</h3>
            <div className="journey" style={{marginBottom:'5px'}}>
              <div><div className="time-big">{c.leg1.from_std}</div></div>
              <div className="track-wrap"><div className="track-line" />Leg 1 ({c.leg1.train_name})</div>
              <div><div className="time-big">{c.leg1.to_sta}</div></div>
            </div>
            <div className="journey">
              <div><div className="time-big">{c.leg2.from_std}</div></div>
              <div className="track-wrap"><div className="track-line" />Leg 2 ({c.leg2.train_name})</div>
              <div><div className="time-big">{c.leg2.to_sta}</div></div>
            </div>
          </div>
        ))}

      </div>
    </>
  );
}