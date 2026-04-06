import { useState, useEffect } from 'react';

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

const BACKEND_URL = "https://train-finder-mu.vercel.app/api/search";
const SCHEDULE_URL = "https://train-finder-mu.vercel.app/api/schedule";
const LIVE_URL = "https://train-finder-mu.vercel.app/api/live";

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

  // Schedule Modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleTrainInfo, setScheduleTrainInfo] = useState(null);
  const [scheduleData, setScheduleData] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Live Status Modal
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [liveTrainInfo, setLiveTrainInfo] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);

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

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  // --- SCHEDULE API WITH PASS-THROUGH FILTER ---
  const fetchSchedule = async (train, e) => {
    e.stopPropagation();
    setScheduleTrainInfo(train);
    setScheduleModalOpen(true);
    setScheduleLoading(true);
    setScheduleData([]);

    try {
      const res = await fetch(`${SCHEDULE_URL}?trainNo=${train.train_number}`);
      const json = await res.json();
      
      let stnArray = [];
      if (json.status && json.data) {
        if (Array.isArray(json.data)) stnArray = json.data;
        else if (json.data.route) stnArray = json.data.route;
        else if (json.data.stationList) stnArray = json.data.stationList;
      }

      if (stnArray.length > 0) {
        const mappedSchedule = stnArray.map(stn => ({
          name: stn.station_name || stn.stationName || stn.stationCode || 'Unknown',
          code: stn.stationCode || stn.station_code || '',
          arr: stn.arrival_time || stn.arrivalTime || 'Starts',
          dep: stn.departure_time || stn.departureTime || 'Ends',
          dist: stn.distance || stn.distanceFromSource || 0,
          halt: stn.haltTime || stn.halt_time || 0,
          day: stn.day || stn.journeyDay || 1
        }));

        // CORE FIX: Filter out stations where train does not stop
        const filteredSchedule = mappedSchedule.filter((stn, idx) => {
          if (idx === 0 || idx === mappedSchedule.length - 1) return true; // Keep Origin & Dest
          
          // If halt is '00:00' or 0, or if Arrival matches Departure, it's a pass-through.
          const isPassThrough = (stn.halt === "00:00" || stn.halt == 0) && (stn.arr === stn.dep);
          return !isPassThrough; 
        });

        setScheduleData(filteredSchedule);
      }
    } catch (err) {
      console.error(err);
    }
    setScheduleLoading(false);
  };

  // --- LIVE STATUS API INTEGRATION ---
  const fetchLiveStatus = async (train, e) => {
    e.stopPropagation();
    setLiveTrainInfo(train);
    setLiveModalOpen(true);
    setLiveLoading(true);
    setLiveData(null);

    try {
      // RapidAPI endpoint call (trusting the response structure)
      const res = await fetch(`${LIVE_URL}?trainNo=${train.train_number}&startDay=1`);
      const json = await res.json();
      
      // Fallback parser to grab the object whether it's inside data or at the root
      let dataObj = json.data || json;
      
      if (dataObj) {
        setLiveData({
          currentStation: dataObj.current_station_name || dataObj.currentStationName || dataObj.station_name || 'Train departed/unavailable',
          delay: dataObj.delay_in_mins || dataObj.delay || 0,
          updateTime: dataObj.update_time || dataObj.updatedAt || new Date().toLocaleTimeString(),
          eta: dataObj.eta || dataObj.actualArrivalTime || '--:--',
          etd: dataObj.etd || dataObj.actualDepartureTime || '--:--',
          statusText: dataObj.status || dataObj.statusAsOf || (dataObj.delay > 0 ? `Delayed by ${dataObj.delay} mins` : 'On Time')
        });
      }
    } catch (err) {
      console.error(err);
    }
    setLiveLoading(false);
  };

  const handleSearch = async (overrideSrc, overrideDst, overrideDate) => {
    const s = (overrideSrc || source).trim().toUpperCase();
    const d = (overrideDst || dest).trim().toUpperCase();
    const dt = overrideDate || date;

    setSource(s); setDest(d); setDate(dt);
    setLoading(true); setError(''); setTrains([]); setAltRoutes([]); setSearched(false);
    setActiveFilter('ALL'); setSortBy('departure'); setExpandedTrainId(null);

    const cacheKey = `DIRECT-${s}-${d}-${dt}`;
    if (getCache(cacheKey)) { setTrains(getCache(cacheKey)); setLoading(false); setSearched(true); return; }

    try {
      setStatusText(`Looking up ${s} → ${d}`);
      const res = await fetch(`${BACKEND_URL}?source=${s}&dest=${d}&date=${dt}`);
      const json = await res.json();
      if (json.status && json.data?.length > 0) { setTrains(json.data); setCache(cacheKey, json.data); }
    } catch { setError('Connection failed. Please check your network.'); }
    setLoading(false); setSearched(true);
  };

  const searchConnections = async () => {
    setHubLoading(true); setError(''); setExpandedTrainId(null);
    const src = source.trim().toUpperCase(); const dst = dest.trim().toUpperCase();
    const cacheKey = `ALT-${src}-${dst}-${date}`;

    if (getCache(cacheKey)) { setAltRoutes(getCache(cacheKey)); setHubLoading(false); return; }

    try {
      const apiToday = date; 
      const nextDayObj = new Date(date); nextDayObj.setDate(nextDayObj.getDate() + 1);
      const apiTomorrow = nextDayObj.toISOString().split('T')[0];
      let connections = [];

      for (let hub of TRANSIT_HUBS) {
        if (hub === src || hub === dst) continue;
        setStatusText(`Scanning via ${hub}...`);
        const l1Res = await fetch(`${BACKEND_URL}?source=${src}&dest=${hub}&date=${apiToday}`);
        const l1Data = await l1Res.json();

        if (l1Data.status && l1Data.data?.length > 0) {
          const l2Res = await fetch(`${BACKEND_URL}?source=${hub}&dest=${dst}&date=${apiTomorrow}`);
          const l2Data = await l2Res.json();

          if (l2Data.status && l2Data.data) {
            l1Data.data.forEach(t1 => {
              l2Data.data.forEach(t2 => {
                const arrHub = new Date(`${date}T${t1.to_sta}:00`).getTime();
                let depHub = new Date(`${date}T${t2.from_std}:00`).getTime();
                if (depHub < arrHub) depHub = new Date(`${apiTomorrow}T${t2.from_std}:00`).getTime();
                const diff = (depHub - arrHub) / (1000 * 60 * 60);
                if (diff >= 1 && diff <= 20) connections.push({ hub, leg1: t1, leg2: t2, layover: Math.round(diff) });
              });
            });
          }
        }
      }
      const finalAlt = connections.sort((a, b) => a.layover - b.layover);
      setAltRoutes(finalAlt); setCache(cacheKey, finalAlt);
    } catch (err) { setError("Quota limit exceeded."); }
    setHubLoading(false);
  };

  let processedTrains = [...trains];
  if (activeFilter === 'MORNING') processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 5 && parseInt(t.from_std.split(':')[0]) <= 11);
  else if (activeFilter === 'NIGHT') processedTrains = processedTrains.filter(t => parseInt(t.from_std.split(':')[0]) >= 18 || parseInt(t.from_std.split(':')[0]) <= 4);
  else if (activeFilter === 'PREMIUM') {
    const p = ['VBEX', 'SHT', 'RAJ', 'TEJ'];
    processedTrains = processedTrains.filter(t => p.includes(t.train_type) || t.train_name.toUpperCase().includes('VANDE') || t.train_name.toUpperCase().includes('SHATABDI'));
  } else if (activeFilter === 'AC') {
    const ac = ['1A', '2A', '3A', '3E', 'CC', 'EC', 'EV'];
    processedTrains = processedTrains.filter(t => t.class_type && t.class_type.some(c => ac.includes(c)));
  }

  processedTrains.sort((a, b) => {
    const minsA = a.duration ? parseInt(a.duration.split(':')[0]) * 60 + parseInt(a.duration.split(':')[1]) : Infinity;
    const minsB = b.duration ? parseInt(b.duration.split(':')[0]) * 60 + parseInt(b.duration.split(':')[1]) : Infinity;
    if (sortBy === 'duration') return minsA - minsB;
    return a.from_std.localeCompare(b.from_std);
  });

  const shareToWhatsApp = (t, e) => {
    e.stopPropagation();
    const text = `🚆 *${t.train_name} (${t.train_number})*\n🗓 ${date}\n📍 ${t.from_station_name} (${t.from_std}) ➔ ${t.to_station_name} (${t.to_sta})\n\nSearched via RailFinder`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const getFilteredStations = (query) => STATIONS.filter(s => s.code.includes(query) || s.name.toUpperCase().includes(query)).slice(0, 5);

  return (
    <div className={`rail-app-wrapper ${darkMode ? 'dark-mode' : ''}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        .rail-app-wrapper { background: #f7f7f9; font-family: 'Inter', sans-serif; color: #111827; min-height: 100vh; padding-bottom: 80px; -webkit-font-smoothing: antialiased; }
        
        .dark-mode { background: #0f172a; color: #f8fafc; }
        .dark-mode .topbar, .dark-mode .search-card, .dark-mode .train-card { background: #1e293b; border-color: #334155; }
        .dark-mode .premium-input, .dark-mode .custom-select, .dark-mode .filter-pill, .dark-mode .autocomplete-dropdown { background: #0f172a !important; border-color: #334155 !important; color: #f8fafc !important; }
        .dark-mode .search-btn { background: #3b82f6; color: #fff !important; }
        .dark-mode .swap-btn, .dark-mode .step-btn, .dark-mode .history-pill { background: #334155; border-color: #475569; color: #f8fafc !important; }
        .dark-mode h1, .dark-mode .train-name, .dark-mode .time-text { color: #f8fafc !important; }
        .dark-mode .journey-visual, .dark-mode .stat-box { background: #0f172a; border-color: #334155; }
        .dark-mode .duration-pill { background: #1e293b; border-color: #475569; color: #cbd5e1 !important; }
        .dark-mode .action-btn { background: #1e293b; border-color: #475569; color: #f8fafc !important; }
        .dark-mode .filter-pill.active { background: #3b82f6; color: #fff !important; border-color: #3b82f6; }
        .dark-mode .modal-content { background: #1e293b; border-color: #334155; color: #f8fafc; }
        .dark-mode .modal-header { border-bottom: 1px solid #334155; }
        .dark-mode .timeline-item { border-left: 2px dashed #475569; }
        .dark-mode .timeline-dot { background: #1e293b; border-color: #3b82f6; }
        .dark-mode .live-card { background: #0f172a; border-color: #334155; }

        .topbar { background: #ffffff; border-bottom: 1px solid #e5e7eb; padding: 0 32px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50;}
        .topbar-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; letter-spacing: -0.5px;}
        .theme-toggle { background: none; border: none; font-size: 20px; cursor: pointer; padding: 8px; border-radius: 50%; }
        
        .page { max-width: 800px; margin: 0 auto; padding: 40px 24px 0; }
        .page-title { font-size: 32px; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; }
        .page-subtitle { font-size: 15px; color: #6b7280; margin-bottom: 32px; font-weight: 500;}
        
        .search-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #f3f4f6;}
        .fields-grid { display: grid; grid-template-columns: 1fr 44px 1fr; gap: 16px; margin-bottom: 20px; align-items: center; }
        .input-group { display: flex; flex-direction: column; gap: 8px; position: relative;}
        .input-group label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .premium-input { height: 50px; border: 1px solid #d1d5db !important; border-radius: 12px; padding: 0 16px; font-size: 16px; font-weight: 600; font-family: inherit; outline: none; width: 100%; transition: 0.2s; background-color: #ffffff !important; color: #111827 !important;}
        .premium-input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
        input.premium-input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px white inset !important; -webkit-text-fill-color: #111827 !important; }
        
        .autocomplete-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 100; overflow: hidden; }
        .autocomplete-item { padding: 12px 16px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6;}
        .autocomplete-item:hover { background: #f9fafb; }
        
        .swap-btn { height: 50px; width: 44px; margin-top: 22px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; cursor: pointer; font-size: 16px; color: #4b5563; display: flex; align-items: center; justify-content: center; }
        .date-stepper-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 24px;}
        .step-btn { height: 50px; padding: 0 16px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 12px; cursor: pointer; font-weight: 600; color: #4b5563; margin-top: 22px;}
        
        .search-btn { width: 100%; height: 54px; background: #111827; color: #ffffff; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; }

        .history-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 32px; align-items: center; }
        .history-pill { background: #e5e7eb; color: #4b5563; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; }
        
        .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;}
        .custom-select { appearance: none; -webkit-appearance: none; padding: 10px 40px 10px 16px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 14px; font-weight: 600; outline: none; cursor: pointer; background-color: transparent; }
        
        .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
        .filter-pill { padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; background: #ffffff; color: #4b5563; }
        .filter-pill.active { background: #eff6ff; color: #2563eb; border-color: #93c5fd; font-weight: 700;}
        
        .train-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 16px; border: 1px solid #e5e7eb; box-shadow: 0 4px 15px rgba(0,0,0,0.02); transition: all 0.3s ease; cursor: pointer; position: relative;}
        .train-card:hover { border-color: #d1d5db; box-shadow: 0 8px 25px rgba(0,0,0,0.06); transform: translateY(-2px);}
        .train-card.expanded { border-color: #2563eb; box-shadow: 0 12px 30px rgba(37, 99, 235, 0.1); transform: none; cursor: default;}

        .card-top { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start; }
        .train-name { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;}
        .train-num { font-size: 14px; color: #6b7280; font-weight: 500;}
        
        .journey-visual { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: #f9fafb; border-radius: 12px; border: 1px solid #f3f4f6;}
        .time-text { font-size: 22px; font-weight: 700; letter-spacing: -0.5px;}
        .station-text { font-size: 12px; font-weight: 600; color: #6b7280; margin-top: 4px; letter-spacing: 0.3px;}
        
        .track { flex: 1; height: 2px; background: #e5e7eb; position: relative; display: flex; justify-content: center; align-items: center;}
        .track::before, .track::after { content: ''; position: absolute; width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; }
        .track::before { left: 0; } .track::after { right: 0; }
        .duration-pill { background: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; color: #4b5563; border: 1px solid #e5e7eb; z-index: 1;}

        /* Left-aligned actions */
        .action-row { display: flex; gap: 8px; z-index: 2; position: relative; flex-wrap: wrap;}
        .action-btn { background: #ffffff; color: #4b5563; border: 1px solid #d1d5db; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;}
        .action-btn:hover { background: #f9fafb; border-color: #9ca3af;}
        .action-btn.live { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
        
        .card-divider { height: 1px; background: #e5e7eb; margin: 24px 0; }
        .expanded-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 24px;}
        .stat-box { background: #f9fafb; padding: 16px; border-radius: 12px; border: 1px solid #f3f4f6;}
        .stat-label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block;}
        .stat-value { font-size: 15px; font-weight: 700; }
        
        .chevron-icon { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); color: #9ca3af; font-size: 12px; font-weight: 800; transition: 0.3s;}
        .train-card.expanded .chevron-icon { transform: translateX(-50%) rotate(180deg); }

        /* === NEW PREMIUM MODAL UI === */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
        .modal-content { background: #ffffff; width: 100%; max-width: 550px; border-radius: 20px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalFadeIn 0.3s ease;}
        @keyframes modalFadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .modal-header { padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .modal-title { font-size: 18px; font-weight: 800;}
        .close-btn { background: #f3f4f6; border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #6b7280; }
        .modal-body { padding: 24px; overflow-y: auto; flex: 1; }
        
        /* PREMIUM SCHEDULE TIMELINE */
        .timeline { padding: 10px 0; }
        .timeline-item { display: flex; gap: 20px; margin-bottom: 0; position: relative; }
        .timeline-time { width: 60px; font-size: 14px; font-weight: 700; color: #111827; text-align: right; flex-shrink: 0; padding-top: 2px;}
        .timeline-time span { display: block; font-size: 11px; font-weight: 500; color: #6b7280;}
        
        .timeline-divider { position: relative; width: 16px; display: flex; flex-direction: column; align-items: center; }
        .timeline-line { width: 2px; flex: 1; background: repeating-linear-gradient(to bottom, #cbd5e1 0, #cbd5e1 6px, transparent 6px, transparent 12px); margin-top: 4px; margin-bottom: 4px;}
        .timeline-dot { width: 14px; height: 14px; border-radius: 50%; background: #ffffff; border: 3px solid #3b82f6; z-index: 2;}
        .timeline-item:last-child .timeline-line { display: none; }
        .timeline-item:first-child .timeline-dot { border-color: #10b981; }
        .timeline-item:last-child .timeline-dot { border-color: #ef4444; }
        
        .timeline-content { flex: 1; padding-bottom: 32px; }
        .stn-name { font-size: 16px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;}
        .halt-badge { font-size: 11px; background: #f1f5f9; color: #475569; padding: 3px 8px; border-radius: 6px; font-weight: 600;}
        
        /* PREMIUM LIVE TRACKER UI */
        .live-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;}
        .radar-container { position: relative; width: 60px; height: 60px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;}
        .radar-dot { width: 20px; height: 20px; background: #3b82f6; border-radius: 50%; z-index: 2; position: relative;}
        .radar-ring { position: absolute; width: 100%; height: 100%; border: 3px solid #3b82f6; border-radius: 50%; animation: radarPulse 2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
        @keyframes radarPulse { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
        
        .live-station { font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 8px;}
        .live-status-pill { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; margin-bottom: 20px;}
        .status-ontime { background: #dcfce7; color: #059669; }
        .status-delayed { background: #fee2e2; color: #dc2626; }
        
        .live-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: left;}
        .live-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;}
        .live-val { font-size: 18px; font-weight: 800;}

        @media (max-width: 640px) {
          .fields-grid { grid-template-columns: 1fr; gap: 12px; }
          .swap-btn { transform: rotate(90deg); margin: 0 auto; width: 44px; height: 44px; border-radius: 50%;}
          .action-row { flex-wrap: wrap; }
          .action-btn { flex: 1; justify-content: center; }
          .journey-visual { flex-direction: column; gap: 8px; text-align: center; }
          .journey-visual > div { text-align: center !important; }
          .track { width: 100%; min-height: 20px; }
          .date-stepper-wrap { flex-wrap: wrap; }
          .step-btn { flex: 1; }
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
              />
            </div>
            <button className="swap-btn" onClick={swap}>⇄</button>
            <div className="input-group">
              <label>To</label>
              <input 
                className="premium-input" placeholder="e.g. NDLS" value={dest} 
                onChange={e => setDest(e.target.value.toUpperCase())} maxLength={8}
              />
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

        {!loading && searched && trains.length > 0 && (
          <div className="results-header">
            <div style={{fontSize: '18px', fontWeight: 800}}>{processedTrains.length} Direct Trains</div>
            <select className="custom-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="departure">Sort: Earliest First</option>
              <option value="duration">Sort: Fastest Journey</option>
            </select>
          </div>
        )}

        {!loading && searched && processedTrains.map((t, i) => {
          const isExpanded = expandedTrainId === t.train_number;
          
          return (
            <div 
              className={`train-card ${isExpanded ? 'expanded' : ''}`} 
              key={i} 
              onClick={() => setExpandedTrainId(isExpanded ? null : t.train_number)}
            >
              <div className="card-top">
                <div>
                  <div className="train-name">
                    {t.train_name} <span className="train-num">#{t.train_number}</span>
                  </div>
                </div>
                
                {/* MODERN LEFT-ALIGNED ACTION ROW */}
                <div className="action-row">
                  <button className="action-btn live" onClick={(e) => fetchLiveStatus(t, e)}>
                    📍 Live Status
                  </button>
                  <button className="action-btn" onClick={(e) => fetchSchedule(t, e)}>
                    📅 Schedule
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
                <div style={{textAlign:'right'}}>
                  <div className="time-text">{t.to_sta}</div>
                  <div className="station-text">{t.to_station_name}</div>
                </div>
              </div>

              {isExpanded && (
                <div onClick={(e) => e.stopPropagation()} style={{cursor: 'default'}}>
                  <div className="card-divider"></div>
                  
                  <div className="expanded-grid">
                    <div className="stat-box">
                      <span className="stat-label">Journey Distance</span>
                      <div className="stat-value">{t.distance ? `${t.distance} km` : 'N/A'}</div>
                    </div>
                  </div>
                </div>
              )}
              
              {!isExpanded && <div className="chevron-icon">▼</div>}
              {isExpanded && <div className="chevron-icon" style={{transform: 'translateX(-50%) rotate(180deg)'}}>▼</div>}
            </div>
          );
        })}

        {/* --- SCHEDULE MODAL (REDESIGNED TIMELINE) --- */}
        {scheduleModalOpen && (
          <div className="modal-overlay" onClick={() => setScheduleModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  {scheduleTrainInfo?.train_name} <span style={{color: '#6b7280', fontSize: '14px'}}>#{scheduleTrainInfo?.train_number}</span>
                </div>
                <button className="close-btn" onClick={() => setScheduleModalOpen(false)}>×</button>
              </div>
              
              <div className="modal-body">
                {scheduleLoading && <div style={{textAlign: 'center', padding: '40px 0', color: '#6b7280', fontWeight: 600}}>Loading Stoppages...</div>}
                
                {!scheduleLoading && scheduleData.length > 0 && (
                  <div className="timeline">
                    {scheduleData.map((stn, idx) => (
                      <div className="timeline-item" key={idx}>
                        <div className="timeline-time">
                          {stn.arr !== 'Starts' ? stn.arr : stn.dep}
                          <span>Day {stn.day}</span>
                        </div>
                        
                        <div className="timeline-divider">
                          <div className="timeline-dot"></div>
                          <div className="timeline-line"></div>
                        </div>

                        <div className="timeline-content">
                          <div className="stn-name">
                            {stn.name}
                            {(stn.halt !== '00:00' && stn.halt !== 0) && <span className="halt-badge">{stn.halt} halt</span>}
                          </div>
                          <div style={{fontSize: '12px', color: '#64748b'}}>
                            Departs at {stn.dep} • Distance: {stn.dist} km
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!scheduleLoading && scheduleData.length === 0 && (
                  <div style={{textAlign: 'center', padding: '40px 0', color: '#6b7280'}}>No stoppage data found.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- NEW FEATURE: LIVE TRACKING MODAL --- */}
        {liveModalOpen && (
          <div className="modal-overlay" onClick={() => setLiveModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  Live Status <span style={{color: '#6b7280', fontSize: '14px'}}>#{liveTrainInfo?.train_number}</span>
                </div>
                <button className="close-btn" onClick={() => setLiveModalOpen(false)}>×</button>
              </div>
              
              <div className="modal-body">
                {liveLoading && <div style={{textAlign: 'center', padding: '40px 0', color: '#6b7280', fontWeight: 600}}>Connecting to IRCTC Radar...</div>}
                
                {!liveLoading && liveData && (
                  <div className="live-card">
                    <div className="radar-container">
                      <div className="radar-ring"></div>
                      <div className="radar-dot"></div>
                    </div>
                    
                    <div style={{fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px'}}>Current Location</div>
                    <div className="live-station">{liveData.currentStation}</div>
                    
                    <div className={`live-status-pill ${liveData.delay > 0 ? 'status-delayed' : 'status-ontime'}`}>
                      {liveData.statusText}
                    </div>

                    <div className="live-grid">
                      <div>
                        <div className="live-label">ETA</div>
                        <div className="live-val">{liveData.eta}</div>
                      </div>
                      <div>
                        <div className="live-label">Last Updated</div>
                        <div className="live-val" style={{color: '#3b82f6'}}>{liveData.updateTime}</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {!liveLoading && !liveData && (
                  <div style={{textAlign: 'center', padding: '40px 0', color: '#6b7280'}}>Unable to fetch live tracking. Train might not have started.</div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}