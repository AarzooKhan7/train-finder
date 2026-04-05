import { useState, useEffect } from 'react';
import './App.css';

// 1. CONFIGURATION
const BACKEND_URL = "https://train-finder-mu.vercel.app/api/search";
const TRANSIT_HUBS = ['CNB', 'PNBE', 'NDLS', 'DDU', 'ET'];

function App() {
  const [source, setSource] = useState('JBN');
  const [dest, setDest] = useState('BPL');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [directRoutes, setDirectRoutes] = useState([]);
  const [altRoutes, setAltRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  // 2. HELPER: Time & Date Logic
  const formatApiDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  };

  const getTimestamp = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`).getTime();

  // 3. CACHING LOGIC (The Safety Shield)
  const getCache = (key) => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  };

  const setCache = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // 4. THE MASTER SEARCH FUNCTION
  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setDirectRoutes([]);
    setAltRoutes([]);
    
    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();
    const cacheKey = `${src}-${dst}-${date}`;

    // 1. Check Cache
    const cachedData = getCache(cacheKey);
    if (cachedData) {
      setStatusText("Loading from local memory...");
      setDirectRoutes(cachedData.direct);
      setAltRoutes(cachedData.alt);
      setLoading(false);
      return;
    }

    try {
      // 2. Date Setup
      const apiToday = formatApiDate(date); // DD-MM-YYYY
      const nextDayObj = new Date(date);
      nextDayObj.setDate(nextDayObj.getDate() + 1);
      const tomorrowStr = nextDayObj.toISOString().split('T')[0];
      const apiTomorrow = formatApiDate(tomorrowStr);

      // --- SECTION 1: DIRECT (FIXED PARAMETER) ---
      setStatusText("Searching direct routes...");
      // FIX: Changed 'dateToday' to 'date' to match your index.js
      const dRes = await fetch(`${BACKEND_URL}?source=${src}&dest=${dst}&date=${apiToday}`);
      const dData = await dRes.json();
      const direct = (dData.status && dData.data) ? dData.data : [];

      // --- SECTION 2: SMART ALTERNATIVES (FIXED PARAMETERS) ---
      let connections = [];
      for (let hub of TRANSIT_HUBS) {
        if (hub === src || hub === dst) continue;
        setStatusText(`Mapping network via ${hub}...`);

        // Leg 1: Source to Hub
        const l1Res = await fetch(`${BACKEND_URL}?source=${src}&dest=${hub}&date=${apiToday}`);
        const l1Data = await l1Res.json();

        if (l1Data.status && l1Data.data?.length > 0) {
          // Leg 2: Hub to Destination
          const l2Res = await fetch(`${BACKEND_URL}?source=${hub}&dest=${dst}&date=${apiTomorrow}`);
          const l2Data = await l2Res.json();

          if (l2Data.status && l2Data.data) {
            l1Data.data.forEach(t1 => {
              l2Data.data.forEach(t2 => {
                const arrival = getTimestamp(date, t1.to_sta);
                const departure = getTimestamp(tomorrowStr, t2.from_std);
                const diffHours = (departure - arrival) / (1000 * 60 * 60);

                // Handshake: 2 to 20 hours
                if (diffHours >= 2 && diffHours <= 20) {
                  connections.push({ hub, leg1: t1, leg2: t2, layover: Math.round(diffHours) });
                }
              });
            });
          }
        }
      }

      const finalAlt = connections.sort((a, b) => a.layover - b.layover);
      
      setDirectRoutes(direct);
      setAltRoutes(finalAlt);
      setCache(cacheKey, { direct, alt: finalAlt });

    } catch (err) {
      setError("Quota limit exceeded or Network error.");
    }
    setLoading(false);
  };

  return (
    <div className="App" style={styles.container}>
      <header style={styles.header}>
        <h1>🚄 Aarzoo's Final Route Finder</h1>
        <div style={styles.searchBar}>
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source" style={styles.input}/>
          <input value={dest} onChange={e => setDest(e.target.value)} placeholder="Dest" style={styles.input}/>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input}/>
          <button onClick={handleSearch} disabled={loading} style={styles.button}>
            {loading ? 'Analyzing...' : 'Find All Options'}
          </button>
        </div>
      </header>

      {error && <div style={styles.errorCard}>🚨 {error}</div>}
      {loading && <div style={styles.loadingBar}>{statusText}</div>}

      <main style={styles.dashboard}>
        <section style={styles.section}>
          <h2 style={{color:'#4CAF50'}}>Direct Routes</h2>
          {directRoutes.length > 0 ? directRoutes.map((t, i) => (
            <div key={i} style={styles.trainCard}>
              <h3>{t.train_name} (#{t.train_number})</h3>
              <p>{t.from_std} ➔ {t.to_sta}</p>
            </div>
          )) : <p>No direct trains found.</p>}
        </section>

        <section style={styles.section}>
          <h2 style={{color:'#FF9800'}}>Connecting Routes</h2>
          {altRoutes.length > 0 ? altRoutes.map((c, i) => (
            <div key={i} style={styles.connCard}>
              <div style={styles.hubHeader}>VIA {c.hub}</div>
              <div style={styles.leg}>1. {c.leg1.train_name} (Arr: {c.leg1.to_sta})</div>
              <div style={styles.layover}>Wait {c.layover} hours</div>
              <div style={styles.leg}>2. {c.leg2.train_name} (Dep: {c.leg2.from_std})</div>
            </div>
          )) : <p>No smart connections found.</p>}
        </section>
      </main>
    </div>
  );
}

// 5. STYLES (Professional Dark Mode)
const styles = {
  container: { backgroundColor: '#0a0a0a', minHeight: '100vh', color: '#fff', padding: '20px' },
  header: { textAlign: 'center', marginBottom: '40px' },
  searchBar: { display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #333', backgroundColor: '#1a1a1a', color: '#fff' },
  button: { padding: '12px 25px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  errorCard: { backgroundColor: '#450a0a', color: '#f87171', padding: '15px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto 20px' },
  loadingBar: { textAlign: 'center', color: '#fbbf24', marginBottom: '20px', fontSize: '14px' },
  dashboard: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px', maxWidth: '1200px', margin: '0 auto' },
  section: { backgroundColor: '#111', padding: '20px', borderRadius: '15px', border: '1px solid #222' },
  trainCard: { backgroundColor: '#1a1a1a', padding: '15px', borderRadius: '10px', marginBottom: '10px', borderLeft: '4px solid #4CAF50' },
  connCard: { backgroundColor: '#1a1a1a', padding: '15px', borderRadius: '10px', marginBottom: '15px', borderLeft: '4px solid #FF9800' },
  hubHeader: { fontSize: '12px', fontWeight: 'bold', color: '#FF9800', marginBottom: '10px' },
  leg: { fontSize: '14px', margin: '5px 0' },
  layover: { fontSize: '11px', color: '#fbbf24', margin: '10px 0', borderTop: '1px dashed #333', paddingTop: '10px' }
};

export default App;