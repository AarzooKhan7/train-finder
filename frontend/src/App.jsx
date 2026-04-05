import { useState } from 'react';
import './App.css';

const BACKEND_URL = "https://train-finder-mu.vercel.app/api/search";
const TRANSIT_HUBS = ['CNB', 'NDLS', 'PNBE', 'DDU', 'ET'];

function App() {
  const [source, setSource] = useState('JBN');
  const [dest, setDest] = useState('BPL');
  const [date, setDate] = useState('2026-04-10');
  
  const [directRoutes, setDirectRoutes] = useState([]);
  const [altRoutes, setAltRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  // 1. FORMAT DATE: Converts 2026-04-10 -> 10-04-2026 for your index.js
  const formatApiDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  };

  // 2. TIMESTAMP HELPER
  const getTimestamp = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`).getTime();

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setDirectRoutes([]);
    setAltRoutes([]);
    
    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();

    try {
      const apiToday = formatApiDate(date);
      const nextDayObj = new Date(date);
      nextDayObj.setDate(nextDayObj.getDate() + 1);
      const tomorrowStr = nextDayObj.toISOString().split('T')[0];
      const apiTomorrow = formatApiDate(tomorrowStr);

      // --- SECTION 1: DIRECT ---
      setStatusText("Checking direct routes...");
      const dRes = await fetch(`${BACKEND_URL}?source=${src}&dest=${dst}&date=${apiToday}`);
      const dData = await dRes.json();
      if (dData.status && dData.data) setDirectRoutes(dData.data);

      // --- SECTION 2: ALTERNATIVES ---
      let connections = [];
      for (let hub of TRANSIT_HUBS) {
        if (hub === src || hub === dst) continue;
        setStatusText(`Checking Leg 1 via ${hub}...`);

        // Use 'date' parameter exactly as index.js expects
        const l1Res = await fetch(`${BACKEND_URL}?source=${src}&dest=${hub}&date=${apiToday}`);
        const l1Data = await l1Res.json();

        // QUOTA SAVER: If no trains to hub, don't check hub to dest
        if (l1Data.status && l1Data.data && l1Data.data.length > 0) {
          setStatusText(`Found Leg 1! Now checking ${hub} to ${dst}...`);
          const l2Res = await fetch(`${BACKEND_URL}?source=${hub}&dest=${dst}&date=${apiTomorrow}`);
          const l2Data = await l2Res.json();

          if (l2Data.status && l2Data.data) {
            l1Data.data.forEach(t1 => {
              l2Data.data.forEach(t2 => {
                const arrival = getTimestamp(date, t1.to_sta);
                const departure = getTimestamp(tomorrowStr, t2.from_std);
                const diff = (departure - arrival) / (1000 * 60 * 60);

                if (diff >= 2 && diff <= 24) {
                  connections.push({ hub, leg1: t1, leg2: t2, layover: Math.round(diff) });
                }
              });
            });
          }
        }
      }
      setAltRoutes(connections.sort((a, b) => a.layover - b.layover));

    } catch (err) {
      setError("Quota exceeded or connection error.");
    }
    setLoading(false);
  };

  return (
    <div className="App" style={{ backgroundColor: '#000', color: '#fff', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{textAlign: 'center'}}>🚄 Aarzoo's Final Fix</h1>
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
        <input style={{padding:'10px'}} value={source} onChange={e => setSource(e.target.value.toUpperCase())} placeholder="Source" />
        <input style={{padding:'10px'}} value={dest} onChange={e => setDest(e.target.value.toUpperCase())} placeholder="Dest" />
        <input style={{padding:'10px'}} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button onClick={handleSearch} disabled={loading} style={{padding:'10px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer'}}>
          {loading ? 'Searching...' : 'Find Routes'}
        </button>
      </div>

      {loading && <div style={{textAlign: 'center', color: '#fbbf24'}}>{statusText}</div>}
      {error && <div style={{textAlign: 'center', color: '#ef4444'}}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div style={{ border: '2px solid #22c55e', padding: '20px', borderRadius: '10px' }}>
          <h2 style={{color: '#22c55e'}}>Direct</h2>
          {directRoutes.map((t, i) => <div key={i} style={{marginBottom:'10px', padding:'10px', border:'1px solid #333'}}>{t.train_name}</div>)}
          {directRoutes.length === 0 && !loading && <p>No direct trains.</p>}
        </div>

        <div style={{ border: '2px solid #f97316', padding: '20px', borderRadius: '10px' }}>
          <h2 style={{color: '#f97316'}}>Alternative</h2>
          {altRoutes.map((c, i) => (
            <div key={i} style={{marginBottom:'15px', borderLeft:'4px solid #f97316', padding:'10px', backgroundColor:'#111'}}>
              <strong>VIA {c.hub}</strong>
              <p>1. {c.leg1.train_name} ➔ 2. {c.leg2.train_name}</p>
              <small>Layover: {c.layover}h</small>
            </div>
          ))}
          {altRoutes.length === 0 && !loading && <p>No connections found.</p>}
        </div>
      </div>
    </div>
  );
}

export default App;