const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ROUTE: Get Trains between two stations
app.get('/api/search', async (req, res) => {
    // 1. Extract source, dest, and the new dynamic date from the React UI
    const { source, dest, date } = req.query; 

    if (!source || !dest || !date) {
        return res.status(400).json({ error: 'Please provide source, dest, and date.' });
    }

    const options = {
        method: 'GET',
        url: 'https://irctc1.p.rapidapi.com/api/v3/trainBetweenStations', 
        params: { 
            fromStationCode: source, 
            toStationCode: dest,
            dateOfJourney: date // 2. Dynamic date goes here
        },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'irctc1.p.rapidapi.com',
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = await axios.request(options);
        res.json(response.data);
    } catch (error) {
        console.error("API Error Details:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Data fetch failed', details: error.message });
    }
});

app.get('/', (req, res) => res.send('Train-Finder API is Live! 🚄'));
module.exports = app;