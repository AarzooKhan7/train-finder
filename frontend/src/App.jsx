import { useState } from 'react';
import './App.css';

function App() {
  const [source, setSource] = useState('CNB');
  const [dest, setDest] = useState('NDLS');
  const [date, setDate] = useState('2026-04-15');
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setTrains([]);

    try {
      // Using the verified YYYY-MM-DD format
      const url = `https://train-finder-mu.vercel.app/api/search?source=${source}&dest=${dest}&date=${date}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.status && json.data && json.data.length > 0) {
        setTrains(json.data);
      } else {
        setError("No trains found for this route or date.");
      }
    } catch (err) {
      setError("Failed to connect to the server.");
    }
    setLoading(false);
  };

  return (
    <div className="App" style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>🚄 Railway Dashboard</h1>
        <div style={styles.searchBar}>
          <input style={styles.input} value={source} onChange={e => setSource(e.target.value.toUpperCase())} placeholder="Source" />
          <input style={styles.input} value={dest} onChange={e => setDest(e.target.value.toUpperCase())} placeholder="Dest" />
          <input style={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button onClick={handleSearch} disabled={loading} style={styles.button}>
            {loading ? 'Searching...' : 'Find Trains'}
          </button>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <main style={styles.resultsGrid}>
        {trains.map((t, i) => (
          <div key={i} style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <span style={styles.trainType}>{t.train_type}</span>
                <h2 style={styles.trainName}>{t.train_name}</h2>
                <span style={styles.trainNo}>#{t.train_number}</span>
              </div>
              <div style={styles.duration}>⏱ {t.duration}</div>
            </div>

            <div style={styles.journey}>
              <div style={styles.station}>
                <div style={styles.time}>{t.from_std}</div>
                <div style={styles.code}>{t.from_station_name}</div>
              </div>
              <div style={styles.arrow}>→</div>
              <div style={styles.station}>
                <div style={styles.time}>{t.to_sta}</div>
                <div style={styles.code}>{t.to_station_name}</div>
              </div>
            </div>

            <div style={styles.footer}>
              <div style={styles.days}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <span key={day} style={{
                    ...styles.day, 
                    color: t.run_days.includes(day) ? '#38bdf8' : '#475569',
                    fontWeight: t.run_days.includes(day) ? 'bold' : 'normal'
                  }}>{day.charAt(0)}</span>
                ))}
              </div>
              <div style={styles.classes}>
                {t.class_type?.join(' | ')}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

const styles = {
  app: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f1f5f9', padding: '20px' },
  header: { maxWidth: '1000px', margin: '0 auto 40px', textAlign: 'center' },
  title: { fontSize: '2.5rem', marginBottom: '20px', color: '#38bdf8' },
  searchBar: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', background: '#1e293b', padding: '20px', borderRadius: '15px' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', flex: 1, minWidth: '150px' },
  button: { padding: '12px 30px', borderRadius: '8px', border: 'none', backgroundColor: '#0284c7', color: '#fff', cursor: 'pointer', fontWeight: 'bold' },
  error: { textAlign: 'center', background: '#7f1d1d', padding: '10px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto 20px' },
  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', maxWidth: '1200px', margin: '0 auto' },
  card: { background: '#1e293b', padding: '20px', borderRadius: '16px', borderLeft: '6px solid #0284c7' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  trainType: { fontSize: '0.7rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1px' },
  trainName: { fontSize: '1.1rem', margin: '5px 0' },
  trainNo: { fontSize: '0.8rem', color: '#94a3b8' },
  duration: { fontSize: '0.8rem', color: '#94a3b8' },
  journey: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderTop: '1px solid #334155', borderBottom: '1px solid #334155' },
  time: { fontSize: '1.4rem', fontWeight: 'bold' },
  code: { fontSize: '0.7rem', color: '#94a3b8' },
  arrow: { color: '#475569' },
  footer: { display: 'flex', justifyContent: 'space-between', marginTop: '15px', alignItems: 'center' },
  days: { display: 'flex', gap: '5px' },
  day: { fontSize: '0.7rem' },
  classes: { fontSize: '0.7rem', color: '#38bdf8', fontWeight: 'bold' }
};

export default App;