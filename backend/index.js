const express = require('express');
const cors = require('cors');
const axios = require('axios');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

app.get('/api/search', async (req, res) => {
  const { source, dest, date } = req.query;

  if (!source || !dest || !date) {
    return res.status(400).json({ error: 'Missing source, dest, or date' });
  }

  const options = {
    method: 'GET',
    url: 'https://irctc1.p.rapidapi.com/api/v3/trainBetweenStations',
    params: {
      fromStationCode: source,
      toStationCode: dest,
      dateOfJourney: date // Will receive YYYY-MM-DD from frontend
    },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'irctc1.p.rapidapi.com'
    }
  };

  try {
    const response = await axios.request(options);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'RapidAPI failure', details: error.message });
  }
});

app.get('/', (req, res) => res.send('API is Online 🚄'));

module.exports = app;