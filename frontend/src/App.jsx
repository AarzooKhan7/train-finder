import { useState } from 'react';
import './App.css';

function App() {
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [trainData, setTrainData] = useState(null);
  const [loading, setLoading] = useState(false);

  const searchTrains = async () => {
    setLoading(true);
    try {
      // Calling the new backend route
      const response = await fetch(`https://train-finder-mu.vercel.app/api/search?source=${source}&dest=${dest}`);
      const data = await response.json();
      setTrainData(data);
      console.log(data); // This will let us see the raw data in the browser console
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
        <button onClick={searchTrains}>
          {loading ? "Searching..." : "Find Routes"}
        </button>
      </div>

      <p style={{marginTop: "20px"}}>Check the browser console (Right Click -> Inspect -> Console) for results after searching.</p>
    </div>
  );
}

export default App;