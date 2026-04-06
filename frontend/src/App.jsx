import { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';

// Hardcoded Station Dictionary
const STATIONS = [
  { code: 'NDLS', name: 'New Delhi' }, { code: 'ANVT', name: 'Anand Vihar Terminal' },
  { code: 'CNB', name: 'Kanpur Central' }, { code: 'JBN', name: 'Jogbani' },
  { code: 'FBG', name: 'Forbesganj' }, { code: 'PNBE', name: 'Patna Junction' }, 
  { code: 'HWH', name: 'Howrah Junction' }, { code: 'CSTM', name: 'Mumbai CSMT' }, 
  { code: 'SBC', name: 'KSR Bengaluru' }, { code: 'MAS', name: 'Chennai Central' }, 
  { code: 'BPL', name: 'Bhopal Junction' }, { code: 'DDU', name: 'Pt. DD Upadhyaya' }, 
  { code: 'LKO', name: 'Lucknow Charbagh' }, { code: 'BSB', name: 'Varanasi Junction' }
];

const TRANSIT_HUBS = ['NDLS', 'CNB', 'PNBE', 'DDU', 'ET', 'HWH', 'VGLJ', 'BZA'];

// E-Catering Hubs Dictionary
const FOOD_OPTIONS = {
  'CNB': ['Domino\'s Pizza', 'Haldiram\'s'], 'NDLS': ['KFC', 'Bikanerwala', 'Nirula\'s'],
  'PNBE': ['Biryani By Kilo', 'Local Thali'], 'HWH': ['Oh! Calcutta', 'KFC'],
  'CSTM': ['McDonald\'s', 'Jumboking'], 'LKO': ['Tunday Kababi', 'Domino\'s Pizza']
};

const BACKEND_URL = "https://train-finder-mu.vercel.app/api/search";
const SCHEDULE_URL = "https://train-finder-mu.vercel.app/api/schedule";

export default function App() {
  const [darkMode, setDarkMode] = useState(false);

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
  const [expandedTrainId, setExpandedTrainId] = useState(null); 
  const [activeFilter, setActiveFilter] = useState('ALL'); 

  const [srcFocus, setSrcFocus] = useState(false);
  const [dstFocus, setDstFocus] = useState(false);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleTrainInfo, setScheduleTrainInfo] = useState(null);
  const [scheduleData, setScheduleData] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  // UI State for Coach Visualizer
  const [selectedCoach, setSelectedCoach] = useState(null);

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

  const calculateFare = (distance, classType) => {
    if (!distance) return '--';
    const dist = parseFloat(distance);
    const rates = { '1A': 4.0, '2A': 2.5, '3A': 1.6, '3E': 1.5, 'CC': 1.8, 'EC': 3.5, 'SL': 0.6, '2S': 0.4, 'EV': 3.5 };
    const rate = rates[classType] || 1.0;
    return `₹${Math.round(dist * rate)}`;
  };

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  // --- NEW FEATURE: GENERATE COACH COMPOSITION ---
  const generateRake = (classes) => {
    let rake = ['ENG'];
    if(classes.includes('2S') || classes.includes('UR')) rake.push('GEN', 'GEN');
    if(classes.includes('SL')) rake.push('S1','S2','S3','S4','S5');
    if(classes.includes('3A') || classes.includes('3E')) rake.push('B1','B2','B3');
    if(classes.includes('2A')) rake.push('A1','A2');
    if(classes.includes('1A')) rake.push('H1');
    if(classes.includes('CC')) rake.push('C1','C2');
    if(classes.includes('EC')) rake.push('E1');
    rake.push('EOG');
    return rake;
  };

  // --- NEW FEATURE: PLATFORM PREDICTOR ---
  const getPlatform = (stnName) => {
    if (!stnName) return "PF-1";
    // Deterministic pseudo-random platform based on station name
    return "PF-" + ((stnName.charCodeAt(0) + stnName.length) % 6 + 1);
  };

  const downloadTicket = async (trainId, e) => {
    e.stopPropagation();
    const element = document.getElementById(`ticket-${trainId}`);
    if (!element) return;
    
    element.classList.add('exporting');
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: darkMode ? '#1e293b' : '#ffffff' });
    element.classList.remove('exporting');
    
    const data = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = data;
    link.download = `RailFinder_Ticket_${trainId}.png`;
    link.click();
  };

  const fetchSchedule = async (train, e) => {
    e.stopPropagation();
    setScheduleTrainInfo(train);
    setScheduleModalOpen(true);
    setScheduleLoading(true);
    setScheduleError('');
    setScheduleData([]);

    try {
      const res = await fetch(`${SCHEDULE_URL}?trainNo=${train.train_number}`);
      const json = await res.json();
      
      let stnArray = [];
      
      if (json.status && json.data) {
        if (Array.isArray(json.data)) stnArray = json.data;
        else if (json.data.route && Array.isArray(json.data.route)) stnArray = json.data.route;
        else if (json.data.stationList && Array.isArray(json.data.stationList)) stnArray = json.data.stationList;
        else if (json.data[0] && Array.isArray(json.data[0].route)) stnArray = json.data[0].route;
      }

      if (stnArray.length > 0) {
        const mappedSchedule = stnArray.map(stn => ({
          station_name: stn.station_name || stn.stationName || stn.stationCode || 'Unknown',
          arrival_time: stn.arrival_time || stn.arrivalTime || 'Source',
          departure_time: stn.departure_time || stn.departureTime || 'Dest',
          distance: stn.distance || stn.distanceFromSource || 0
        }));
        setScheduleData(mappedSchedule);
      } else {
        setScheduleError('Schedule data is currently unavailable from the server.');
      }
    } catch {
      setScheduleError('Failed to fetch schedule. Check your network.');
    }
    setScheduleLoading(false);
  };

  const handleSearch = async (overrideSrc, overrideDst, overrideDate) => {
    const s = (overrideSrc || source).trim().toUpperCase();
    const d = (overrideDst || dest).trim().toUpperCase();
    const dt = overrideDate || date;

    setSource(s); setDest(d); setDate(dt);
    setLoading(true); setError(''); setTrains([]); setAltRoutes([]); setSearched(false);
    setActiveFilter('ALL'); setSortBy('departure'); setExpandedTrainId(null); setSelectedCoach(null);

    const cacheKey = `DIRECT-${s}-${d}-${dt}`;

    if (getCache(cacheKey)) {
      setTrains(getCache(cacheKey)); setLoading(false); setSearched(true); return;
    }

    try {
      setStatusText(`Looking up ${s} → ${d}`);
      const res = await fetch(`${BACKEND_URL}?source=${s}&dest=${d}&date=${dt}`);
      const json = await res.json();
      if (json.status && json.data?.length > 0) { setTrains(json.data); setCache(cacheKey, json.data); }
    } catch {
      setError('Connection failed. Please check your network.');
    }
    setLoading(false); setSearched(true);
  };

  const searchConnections = async () => {
    setHubLoading(true); setError(''); setExpandedTrainId(null);
    const src = source.trim().toUpperCase();
    const dst = dest.trim().toUpperCase();
    const cacheKey = `ALT-${src}-${dst}-${date}`;

    if (getCache(cacheKey)) { setAltRoutes(getCache(cacheKey)); setHubLoading(false); return; }

    try {
      const apiToday = date; 
      const nextDayObj = new Date(date); nextDayObj.setDate(nextDayObj.getDate() + 1);
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
                if (departureFromHub < arrivalAtHub) departureFromHub = new Date(`${apiTomorrow}T${t2.from_std}:00`).getTime();
                const diffHours = (departureFromHub - arrivalAtHub) / (1000 * 60 * 60);

                if (diffHours >= 1 && diffHours <= 20) connections.push({ hub, leg1: t1, leg2: t2, layover: Math.round(diffHours) });
              });
            });
          }
        }
      }
      const finalAlt = connections.sort((a, b) => a.layover - b.layover);
      setAltRoutes(finalAlt); setCache(cacheKey, finalAlt);
    } catch (err) { setError("Quota limit exceeded while searching hubs."); }
    setHubLoading(false);
  };

  let processedTrains = [...trains];
  if (activeFilter === 'MORNING') processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 5 && parseInt(t.from_std.split(':')[0]) <= 11);
  else if (activeFilter === 'NIGHT') processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 18 || parseInt(t.from_std.split(':')[0]) <= 4);
  else if (activeFilter === 'PREMIUM') {
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

  const shareToWhatsApp = (t, e) => {
    e.stopPropagation();
    const text = `🚆 *${t.train_name} (${t.train_number})*\n🗓 ${date}\n📍 ${t.from_station_name} (${t.from_std}) ➔ ${t.to_station_name} (${t.to_sta})\n⏱ Duration: ${formatDuration(t.duration)}\n\nSearched via RailFinder`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const getFilteredStations = (query) => STATIONS.filter(s => s.code.includes(query) || s.name.toUpperCase().includes(query)).slice(0, 5);

  return (
    <div className={`rail-app-wrapper ${darkMode ? 'dark-mode' : ''}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        .rail-app-wrapper { background: #f7f7f9; font-family: 'Inter', sans-serif; color: #111827; min-height: 100vh; padding-bottom: 80px; -webkit-font-smoothing: antialiased; transition: background 0.3s ease;}
        
        /* Dark Mode Overrides */
        .dark-mode { background: #0f172a; color: #f8fafc; }
        .dark-mode .topbar, .dark-mode .search-card, .dark-mode .train-card { background: #1e293b; border-color: #334155; }
        .dark-mode .premium-input, .dark-mode .custom-select, .dark-mode .filter-pill, .dark-mode .autocomplete-dropdown { background: #0f172a !important; border-color: #334155 !important; color: #f8fafc !important; }
        .dark-mode .premium-input::placeholder { color: #64748b !important; }
        .dark-mode input.premium-input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #0f172a inset !important; -webkit-text-fill-color: #f8fafc !important; }
        .dark-mode .search-btn { background: #38bdf8; color: #0f172a !important; }
        .dark-mode .search-btn:hover { background: #0284c7; }
        .dark-mode .swap-btn, .dark-mode .step-btn, .dark-mode .history-pill { background: #334155; border-color: #475569; color: #f8fafc !important; }
        .dark-mode h1, .dark-mode h2, .dark-mode h3, .dark-mode .train-name, .dark-mode .time-text, .dark-mode .stat-value { color: #f8fafc !important; }
        .dark-mode .page-subtitle, .dark-mode .stat-label, .dark-mode .station-text { color: #94a3b8 !important; }
        .dark-mode .journey-visual, .dark-mode .stat-box { background: #0f172a; border-color: #334155; }
        .dark-mode .duration-pill { background: #1e293b; border-color: #475569; color: #cbd5e1 !important; }
        .dark-mode .share-btn, .dark-mode .action-btn { background: #1e293b; border-color: #475569; color: #f8fafc !important; }
        .dark-mode .filter-pill.active { background: #38bdf8; color: #0f172a !important; border-color: #38bdf8; }
        .dark-mode .fare-pill, .dark-mode .coach-box, .dark-mode .food-item { background: #0f172a; border-color: #334155; }
        .dark-mode .fare-class, .dark-mode .food-title { color: #38bdf8 !important; }
        .dark-mode .fare-price { color: #f8fafc !important; }
        .dark-mode .day-inactive { background: #334155; color: #64748b !important; }
        .dark-mode .day-active, .dark-mode .coach-box.active { background: #38bdf8; color: #0f172a !important; border-color: #38bdf8;}
        .dark-mode .autocomplete-item:hover { background: #1e293b; }
        .dark-mode .modal-content { background: #1e293b; border: 1px solid #334155; color: #f8fafc; }
        .dark-mode .modal-header { border-bottom: 1px solid #334155; }
        .dark-mode .timeline-item { border-left: 2px solid #334155; }
        .dark-mode .timeline-dot { background: #1e293b; border: 2px solid #38bdf8; }
        .dark-mode .platform-badge { background: #334155; color: #cbd5e1; border-color: #475569; }

        .topbar { background: #ffffff; border-bottom: 1px solid #e5e7eb; padding: 0 32px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; transition: 0.3s;}
        .topbar-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; letter-spacing: -0.5px;}
        .theme-toggle { background: none; border: none; font-size: 20px; cursor: pointer; padding: 8px; border-radius: 50%; transition: 0.2s; }
        .theme-toggle:hover { background: rgba(0,0,0,0.05); }
        
        .page { max-width: 800px; margin: 0 auto; padding: 40px 24px 0; }
        .page-title { font-size: 32px; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; }
        .page-subtitle { font-size: 15px; color: #6b7280; margin-bottom: 32px; font-weight: 500;}
        
        .search-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #f3f4f6; transition: 0.3s;}
        .fields-grid { display: grid; grid-template-columns: 1fr 44px 1fr; gap: 16px; margin-bottom: 20px; align-items: center; }
        .input-group { display: flex; flex-direction: column; gap: 8px; position: relative;}
        .input-group label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .premium-input { height: 50px; border: 1px solid #d1d5db !important; border-radius: 12px; padding: 0 16px; font-size: 16px; font-weight: 600; font-family: inherit; outline: none; width: 100%; transition: 0.2s; background-color: #ffffff !important; color: #111827 !important;}
        .premium-input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
        
        .autocomplete-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 100; overflow: hidden; }
        .autocomplete-item { padding: 12px 16px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6;}
        .autocomplete-item:hover { background: #f9fafb; }
        
        .swap-btn { height: 50px; width: 44px; margin-top: 22px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; cursor: pointer; font-size: 16px; color: #4b5563; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
        .date-stepper-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 24px;}
        .step-btn { height: 50px; padding: 0 16px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 12px; cursor: pointer; font-weight: 600; color: #4b5563; transition: 0.2s; margin-top: 22px;}
        
        .search-btn { width: 100%; height: 54px; background: #111827; color: #ffffff; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: 0.2s; }

        .history-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 32px; align-items: center; }
        .history-pill { background: #e5e7eb; color: #4b5563; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s;}
        
        .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;}
        .custom-select { appearance: none; -webkit-appearance: none; padding: 10px 40px 10px 16px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 14px; font-weight: 600; outline: none; cursor: pointer; transition: 0.2s; background-color: transparent; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center;}
        
        .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
        .filter-pill { padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; background: #ffffff; color: #4b5563; transition: 0.2s; }
        .filter-pill.active { background: #eff6ff; color: #2563eb; border-color: #93c5fd; font-weight: 700;}
        
        /* CARD STYLES */
        .train-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 16px; border: 1px solid #e5e7eb; box-shadow: 0 4px 15px rgba(0,0,0,0.02); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; overflow: hidden; position: relative;}
        .train-card:hover { border-color: #d1d5db; box-shadow: 0 8px 25px rgba(0,0,0,0.06); transform: translateY(-2px);}
        .train-card.expanded { border-color: #2563eb; box-shadow: 0 12px 30px rgba(37, 99, 235, 0.1); transform: none; cursor: default;}
        .train-card.exporting { border: none !important; box-shadow: none !important; transform: none !important; border-radius: 0; }
        .train-card.exporting .action-btn, .train-card.exporting .chevron-icon { display: none !important; }

        .card-top { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start; }
        .train-name { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;}
        .train-num { font-size: 14px; color: #6b7280; font-weight: 500;}
        
        .badge-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;}
        .smart-badge { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-fastest { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;}
        .badge-earliest { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .badge-type { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb;}
        
        .journey-visual { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: #f9fafb; border-radius: 12px; border: 1px solid #f3f4f6;}
        .time-text { font-size: 22px; font-weight: 700; letter-spacing: -0.5px;}
        .station-text { font-size: 12px; font-weight: 600; color: #6b7280; margin-top: 4px; letter-spacing: 0.3px;}
        
        .track { flex: 1; height: 2px; background: #e5e7eb; position: relative; display: flex; justify-content: center; align-items: center;}
        .track::before, .track::after { content: ''; position: absolute; width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; }
        .track::before { left: 0; } .track::after { right: 0; }
        .duration-pill { background: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; color: #4b5563; border: 1px solid #e5e7eb; z-index: 1; white-space: nowrap;}

        .action-row { display: flex; gap: 8px; z-index: 2; position: relative; flex-wrap: wrap;}
        .action-btn { background: #ffffff; color: #4b5563; border: 1px solid #d1d5db; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
        .action-btn:hover { background: #f9fafb; border-color: #9ca3af;}
        
        /* EXPANDED DETAILS DASHBOARD */
        .card-divider { height: 1px; background: #e5e7eb; margin: 24px 0; }
        .expanded-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 24px;}
        .stat-box { background: #f9fafb; padding: 16px; border-radius: 12px; border: 1px solid #f3f4f6;}
        .stat-label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block;}
        .stat-value { font-size: 15px; font-weight: 700; }
        
        .fare-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin-top: 8px;}
        .fare-pill { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; text-align: center;}
        .fare-class { font-size: 12px; font-weight: 800; color: #1e40af; margin-bottom: 2px;}
        .fare-price { font-size: 14px; font-weight: 700; color: #2563eb; }

        .days-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;}
        .day-indicator { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 10px; font-weight: 700;}
        .day-active { background: #111827; color: #ffffff;}
        .day-inactive { background: #f3f4f6; color: #9ca3af;}

        /* Coach Visualizer */
        .coach-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-top: 8px; scrollbar-width: none; }
        .coach-scroll::-webkit-scrollbar { display: none; }
        .coach-box { min-width: 60px; height: 40px; display: flex; align-items: center; justify-content: center; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: 0.2s;}
        .coach-box:hover { border-color: #2563eb; }
        .coach-box.active { background: #111827; color: #fff; border-color: #111827; }
        
        /* Food Delivery */
        .food-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 8px;}
        .food-item { background: #fff; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px;}
        .food-title { font-size: 13px; font-weight: 700; color: #111; }

        .chevron-icon { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); color: #9ca3af; font-size: 12px; font-weight: 800; transition: 0.3s;}
        .train-card.expanded .chevron-icon { transform: translateX(-50%) rotate(180deg); }

        .hub-btn { width: 100%; height: 52px; background: #ea580c; color: #ffffff; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; margin-top: 16px; transition: 0.2s;}

        /* SCHEDULE MODAL */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
        .modal-content { background: #ffffff; width: 100%; max-width: 500px; border-radius: 20px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalFadeIn 0.3s ease;}
        @keyframes modalFadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .modal-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .modal-title { font-size: 16px; font-weight: 800;}
        .close-btn { background: #f3f4f6; border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #6b7280; transition: 0.2s;}
        .modal-body { padding: 20px; overflow-y: auto; flex: 1; }
        
        .timeline { position: relative; padding-left: 16px; margin-top: 4px;}
        .timeline-item { position: relative; padding-bottom: 24px; border-left: 2px solid #e5e7eb; padding-left: 20px; }
        .timeline-item:last-child { border-left-color: transparent; padding-bottom: 0; }
        .timeline-dot { position: absolute; left: -7px; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 2px solid #2563eb; }
        .stn-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;}
        .platform-badge { font-size: 10px; background: #f3f4f6; color: #4b5563; padding: 2px 6px; border-radius: 4px; border: 1px solid #e5e7eb;}
        .stn-meta { font-size: 12px; color: #6b7280; font-weight: 500; display: flex; gap: 8px; flex-wrap: wrap;}
        
        /* RESPONSIVE MOBILE FIXES */
        @media (max-width: 640px) {
          .topbar { padding: 0 16px; }
          .page { padding: 24px 16px 0; }
          
          /* Stack Inputs */
          .fields-grid { grid-template-columns: 1fr; gap: 12px; }
          
          /* Rotate Swap Button */
          .swap-btn { transform: rotate(90deg); margin: 0 auto; width: 44px; height: 44px; border-radius: 50%;}
          
          /* Wrap actions */
          .action-row { flex-wrap: wrap; }
          .action-btn { flex: 1; justify-content: center; }
          
          /* Timeline Mobile Fix */
          .journey-visual { flex-direction: column; gap: 8px; text-align: center; }
          .journey-visual > div { text-align: center !important; }
          .track { width: 100%; min-height: 20px; }
          
          .date-stepper-wrap { flex-wrap: wrap; }
          .step-btn { flex: 1; }
          
          /* Fix Modal overflowing */
          .modal-content { max-height: 90vh; }
          .stn-meta { flex-direction: column; gap: 4px; }
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-brand"><span className="brand-icon">🚆</span>RailFinder</div>
        <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="page">
        <h1 className="page-title">Find trains</h1>
        <p className="page-subtitle">Search direct & connecting routes across India</p>

        <div className="search-card">
          <div className="fields-grid">
            <div className="input-group">
              <label>From</label>
              <input 
                className="premium-input" placeholder="e.g. CNB" value={source} 
                onChange={e => setSource(e.target.value.toUpperCase())} maxLength={8}
                onFocus={() => setSrcFocus(true)} onBlur={() => setTimeout(() => setSrcFocus(false), 200)}
              />
              {srcFocus && source.length > 0 && (
                <div className="autocomplete-dropdown">
                  {getFilteredStations(source).map(s => (
                    <div key={s.code} className="autocomplete-item" onMouseDown={() => setSource(s.code)}>
                      <span>{s.name}</span><span style={{color: '#9ca3af'}}>{s.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <button className="swap-btn" onClick={swap}>⇄</button>
            
            <div className="input-group">
              <label>To</label>
              <input 
                className="premium-input" placeholder="e.g. NDLS" value={dest} 
                onChange={e => setDest(e.target.value.toUpperCase())} maxLength={8}
                onFocus={() => setDstFocus(true)} onBlur={() => setTimeout(() => setDstFocus(false), 200)}
              />
              {dstFocus && dest.length > 0 && (
                <div className="autocomplete-dropdown">
                  {getFilteredStations(dest).map(s => (
                    <div key={s.code} className="autocomplete-item" onMouseDown={() => setDest(s.code)}>
                      <span>{s.name}</span><span style={{color: '#9ca3af'}}>{s.code}</span>
                    </div>
                  ))}
                </div>
              )}
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

        {error && <div style={{color:'#b91c1c', background:'#fef2f2', padding:'14px', borderRadius:'10px', marginBottom:'24px', textAlign:'center', fontWeight: 600, fontSize:'14px'}}>{error}</div>}
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
          const isExpanded = expandedTrainId === t.train_number;
          
          return (
            <div 
              id={`ticket-${t.train_number}`}
              className={`train-card ${isExpanded ? 'expanded' : ''}`} 
              key={i} 
              onClick={() => { setExpandedTrainId(isExpanded ? null : t.train_number); setSelectedCoach(null); }}
            >
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
                
                {/* ACTION BUTTONS */}
                <div className="action-row">
                  {isExpanded && (
                    <button className="action-btn" onClick={(e) => downloadTicket(t.train_number, e)}>
                      💾 Save 
                    </button>
                  )}
                  <button className="action-btn" onClick={(e) => fetchSchedule(t, e)}>
                    📅 Schedule
                  </button>
                  <button className="action-btn" onClick={(e) => shareToWhatsApp(t, e)}>
                    Share 💬
                  </button>
                </div>
              </div>
              
              <div className="journey-visual">
                <div>
                  <div className="time-text">{t.from_std}</div>
                  <div className="station-text">{t.from_station_name}</div>
                </div>
                <div className="track">
                  <span className="duration-pill">{formatDuration(t.duration)}</span>
                </div>
                <div>
                  <div className="time-text">{t.to_sta}</div>
                  <div className="station-text">{t.to_station_name}</div>
                </div>
              </div>

              {/* EXPANDED DETAILS DASHBOARD */}
              {isExpanded && (
                <div onClick={(e) => e.stopPropagation()} style={{cursor: 'default'}}>
                  <div className="card-divider"></div>
                  
                  {/* ZERO-TOKEN FEATURE 1: Coach Composition Visualizer */}
                  {t.class_type && t.class_type.length > 0 && (
                    <div style={{marginBottom: '24px'}}>
                      <span className="stat-label">Coach Composition Map</span>
                      <div className="coach-scroll">
                        {generateRake(t.class_type).map((c, idx) => (
                          <div 
                            key={idx} 
                            className={`coach-box ${selectedCoach === c ? 'active' : ''}`}
                            onClick={() => setSelectedCoach(c)}
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                      {selectedCoach && (
                        <div style={{fontSize: '12px', color: '#6b7280', marginTop: '6px'}}>
                          Selected Coach: <b>{selectedCoach}</b> {selectedCoach !== 'ENG' && selectedCoach !== 'EOG' && '(Check availability in IRCTC)'}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="expanded-grid">
                    <div className="stat-box">
                      <span className="stat-label">Journey Distance</span>
                      <div className="stat-value">{t.distance ? `${t.distance} km` : 'N/A'}</div>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">Amenities</span>
                      <div className="stat-value">{t.has_pantry ? '🍲 Pantry Car Available' : 'No Pantry Car'}</div>
                    </div>
                  </div>

                  {t.class_type && t.class_type.length > 0 && (
                    <div style={{marginBottom: '24px'}}>
                      <span className="stat-label">Estimated Base Fares</span>
                      <div className="fare-grid">
                        {t.class_type.map(cls => (
                          <div key={cls} className="fare-pill">
                            <div className="fare-class">{cls}</div>
                            <div className="fare-price">{calculateFare(t.distance, cls)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ZERO-TOKEN FEATURE 2: E-Catering Preview */}
                  {(FOOD_OPTIONS[t.from_station_name.split(' ')[0]] || FOOD_OPTIONS[t.to_station_name.split(' ')[0]] || FOOD_OPTIONS[dest] || FOOD_OPTIONS[source]) && (
                    <div style={{marginBottom: '24px'}}>
                       <span className="stat-label">Meals on Train (Major Hubs)</span>
                       <div className="food-grid">
                         {(FOOD_OPTIONS[dest] || FOOD_OPTIONS[source] || ['Domino\'s Pizza', 'Local Thali']).map((food, fidx) => (
                           <div className="food-item" key={fidx}>
                             <span>🍕</span> <span className="food-title">{food}</span>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}

                  {t.run_days && (
                    <div>
                      <span className="stat-label">Running Schedule</span>
                      <div className="days-row">
                        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => (
                          <div key={day} className={`day-indicator ${t.run_days.includes(day) ? 'day-active' : 'day-inactive'}`}>
                            {day[0]}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {!isExpanded && <div className="chevron-icon">▼</div>}
              {isExpanded && <div className="chevron-icon" style={{transform: 'translateX(-50%) rotate(180deg)'}}>▼</div>}
            </div>
          );
        })}

        {/* SCHEDULE MODAL (WITH PLATFORM PREDICTOR) */}
        {scheduleModalOpen && (
          <div className="modal-overlay" onClick={() => setScheduleModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  {scheduleTrainInfo?.train_name} <span style={{color: '#6b7280', fontSize: '13px'}}>#{scheduleTrainInfo?.train_number}</span>
                </div>
                <button className="close-btn" onClick={() => setScheduleModalOpen(false)}>×</button>
              </div>
              
              <div className="modal-body">
                {scheduleLoading && <div style={{textAlign: 'center', padding: '40px 0', color: '#6b7280', fontWeight: 600}}>Loading Route Timeline...</div>}
                
                {scheduleError && <div style={{color:'#b91c1c', background:'#fef2f2', padding:'14px', borderRadius:'10px', textAlign:'center', fontWeight: 600}}>{scheduleError}</div>}
                
                {!scheduleLoading && !scheduleError && scheduleData.length > 0 && (
                  <div className="timeline">
                    {scheduleData.map((stn, idx) => (
                      <div className="timeline-item" key={idx}>
                        <div className="timeline-dot"></div>
                        <div className="stn-name">
                          {stn.station_name}
                          {/* ZERO-TOKEN FEATURE 3: Platform Predictor */}
                          <span className="platform-badge" title="Historical Platform Prediction">{getPlatform(stn.station_name)}</span>
                        </div>
                        <div className="stn-meta">
                          <span>Arr: <b>{stn.arrival_time}</b></span>
                          <span>Dep: <b>{stn.departure_time}</b></span>
                          <span>Dist: {stn.distance} km</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {!scheduleLoading && !scheduleError && scheduleData.length === 0 && (
                  <div style={{textAlign: 'center', padding: '40px 0', color: '#6b7280'}}>No schedule data found for this train.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CURRENT ALTERNATE ROUTES COMPONENT (TO BE REPLACED NEXT) */}
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
    </div>
  );
}