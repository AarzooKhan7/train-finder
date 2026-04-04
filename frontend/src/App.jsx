import { useState } from 'react';
import './App.css';

const TRANSIT_HUBS = ['CNB', 'PNBE', 'NDLS', 'DDU', 'ET', 'HWH', 'VGLJ'];

function App() {
  const [source, setSource] = useState('JBN');
  const [dest, setDest] = useState('BPL');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); 
  
  const [directRoutes, setDirectRoutes] = useState([]); 
  const [altRoutes, setAltRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  // HELPER: Formats YYYY-MM-DD to DD-MM-YYYY to match your index.js requirements
  const formatApiDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  };

  // HELPER: Precise Timestamp comparison across dates
  const toTimestamp = (dateStr, timeStr) => {
    return new Date(`${dateStr}T${timeStr}:00`).getTime();
  };

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setDirectRoutes([]);
    setAltRoutes([]);
    setStatusText("Initializing Smart Search...");

    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();

    try {
      const apiToday = formatApiDate(date);
      const nextDayObj = new Date(date);
      nextDayObj.setDate(nextDayObj.getDate() + 1);
      const nextDayStr = nextDayObj.toISOString().split('T')[0];
      const apiTomorrow = formatApiDate(nextDayStr);

      // --- BOX 1: DIRECT ROUTES ---
      setStatusText(`Checking Direct Trains...`);
      const dRes = await fetch(`https://train-finder-mu.vercel.app/api/search?source=${src}&dest=${dst}&date=${apiToday}`);
      const dData = await dRes.json();
      if (dData.status && dData.data) setDirectRoutes(dData.data);

      // --- BOX 2: SMART ALTERNATIVE MAPPING ---
      let connections = [];

      for (let hub of TRANSIT_HUBS) {
        if (hub === src || hub === dst) continue;
        setStatusText(`Scanning Hub: ${hub}...`);

        const l1Res = await fetch(`https://train-finder-mu.vercel.app/api/search?source=${src}&dest=${hub}&date=${apiToday}`);
        const l1Data = await l1Res.json();

        if (l1Data.status && l1Data.data?.length > 0) {
          // Check connections for BOTH today and tomorrow for the second leg
          const targetDates = [
            { label: 'Today', value: apiToday, raw: date },
            { label: 'Tomorrow', value: apiTomorrow, raw: nextDayStr }
          ];

          for (let target of targetDates) {
            const l2Res = await fetch(`https://train-finder-mu.vercel.app/api/search?source=${hub}&dest=${dst}&date=${target.value}`);
            const l2Data = await l2Res.json();

            if (l2Data.status && l2Data.data) {
              l1Data.data.forEach(t1 => {
                l2Data.data.forEach(t2 => {
                  const arrivalAtHub = toTimestamp(date, t1.to_sta);
                  const departureFromHub = toTimestamp(target.raw, t2.from_std);
                  
                  const diffMs = departureFromHub - arrivalAtHub;
                  const diffHours = diffMs / (1000 * 60 * 60);

                  // THE HANDSHAKE: Must be at least 2 hours to switch trains
                  if (diffHours >= 2 && diffHours <= 24) {
                    connections.push({
                      hub,
                      leg1: t1,
                      leg2: t2,
                      layover: Math.floor(diffHours),
                      day: target.label
                    });
                  }
                });
              });
            }
          }
        }
      }
      setAltRoutes(connections.sort((a, b) => a.layover - b.layover));

    } catch (err) {
      setError("Connectivity issue or API limit reached.");
    }
    setLoading(false);
  };

  return (
    <div className="App" style={{ padding: '20px', color: 'white', backgroundColor: '#000', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center' }}>🚄 Aarzoo's Smart Route Finder</h1>
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
        <input style={{padding:'8px'}} type="text" placeholder="From" value={source} onChange={e => setSource(e.target.value)} />
        <input style={{padding:'8px'}} type="text" placeholder="To" value={dest} onChange={e => setDest(e.target.value)} />
        <input style={{padding:'8px'}} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button onClick={handleSearch} disabled={loading} style={{ padding: '10px 20px', cursor: 'pointer', background: '#2563eb', color: 'white', border:'none', borderRadius:'4px' }}>
          {loading ? 'Searching...' : 'Find Routes'}
        </button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#fbbf24' }}>{statusText}</p>}
      {error && <p style={{ textAlign: 'center', color: '#ef4444' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        <div style={{ border: '2px solid #22c55e', borderRadius: '12px', padding: '15px' }}>
          <h2 style={{ color: '#22c55e', textAlign: 'center' }}>Direct Routes</h2>
          {directRoutes.map((t, i) => (
            <div key={i} style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #333' }}>
              <h3 style={{ margin: 0, color: '#60a5fa' }}>{t.train_name} (#{t.train_number})</h3>
              <p>{t.from_std} ➔ {t.to_sta}</p>
            </div>
          ))}
          {directRoutes.length === 0 && !loading && <p style={{textAlign:'center'}}>No direct trains found.</p>}
        </div>

        <div style={{ border: '2px solid #f97316', borderRadius: '12px', padding: '15px' }}>
          <h2 style={{ color: '#f97316', textAlign: 'center' }}>Alternative Routes</h2>
          {altRoutes.map((c, i) => (
            <div key={i} style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '15px', borderLeft: '5px solid #f97316' }}>
              <span style={{ color: '#f97316', fontWeight: 'bold' }}>VIA {c.hub} ({c.day} Connection)</span>
              <p style={{ margin: '8px 0' }}>1. {c.leg1.train_name} (Arr: {c.leg1.to_sta})</p>
              <div style={{height:'1px', background:'#333', margin:'8px 0'}} />
              <p style={{ margin: '8px 0' }}>2. {c.leg2.train_name} (Dep: {c.leg2.from_std})</p>
              <p style={{ fontSize: '12px', color: '#fbbf24' }}>Layover: {c.layover} hours</p>
            </div>
          ))}
          {altRoutes.length === 0 && !loading && <p style={{textAlign:'center'}}>No hub connections found.</p>}
        </div>

      </div>
    </div>
  );
}

export default App;