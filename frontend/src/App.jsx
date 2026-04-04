import { useState } from 'react';
import './App.css';

function App() {
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  // Add state for the date (default to today)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); 
  const [trainData, setTrainData] = useState(null);
  const [loading, setLoading] = useState(false);

  const searchTrains = async () => {
    setLoading(true);
    try {
      // The HTML date picker gives YYYY-MM-DD. The API needs DD-MM-YYYY. Let's flip it!
      const formattedDate = date.split('-').reverse().join('-');
      
      // Pass the new date to the backend
      const response = await fetch(`https://train-finder-mu.vercel.app/api/search?source=${source}&dest=${dest}&date=${formattedDate}`);
      const data = await response.json();
      setTrainData(data);
    } catch (error) {
      console.error("Failed to fetch", error);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <h1>🚄 Aarzoo's Route Finder</h1>
      
      <div className="search-box">
        <input
          type="text"
          placeholder="Source (e.g., JBN)"
          value={source}
          onChange={(e) => setSource(e.target.value.toUpperCase())}
        />
        <input
          type="text"
          placeholder="Destination (e.g., NDLS)"
          value={dest}
          onChange={(e) => setDest(e.target.value.toUpperCase())}
        />
        {/* New Date Input */}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button onClick={searchTrains}>
          {loading ? "Searching..." : "Find Routes"}
        </button>
      </div>

      <div className="results-container" style={{ marginTop: '20px' }}>
        {trainData && trainData.data && trainData.data.length > 0 ? (
          trainData.data.map((train, index) => (
            <div key={index} className="results-card" style={{ border: '1px solid #555', margin: '10px auto', padding: '15px', borderRadius: '8px', maxWidth: '500px', textAlign: 'left' }}>
              <h2 style={{ margin: '0 0 10px 0', color: '#61dafb' }}>🚂 {train.train_name} ({train.train_number})</h2>
              <p style={{ margin: '5px 0' }}><strong>From:</strong> {train.from_station_name} at {train.from_std}</p>
              <p style={{ margin: '5px 0' }}><strong>To:</strong> {train.to_station_name} at {train.to_sta}</p>
              <p style={{ margin: '5px 0' }}><strong>Duration:</strong> {train.duration}</p>
            </div>
          ))
        ) : (
           trainData && <p>No trains found for this route or date.</p>
        )}
      </div>
    </div>
  );
}

export default App;