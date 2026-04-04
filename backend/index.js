const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ROUTE: Get Trains between two stations
app.get('/api/search', async (req, res) => {
    // Taking source and dest from your React frontend
    const { source, dest } = req.query; 

    if (!source || !dest) {
        return res.status(400).json({ error: 'Please provide source and dest.' });
    }

    const options = {
        method: 'GET',
        // Exact URL from the RapidAPI cURL snippet
        url: 'https://irctc1.p.rapidapi.com/api/v3/trainBetweenStations', 
        params: { 
            // Exact parameter names from the left column
            fromStationCode: source, 
            toStationCode: dest,
            dateOfJourney: '2026-04-10' // Hardcoded for testing
        },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            // Exact host from the RapidAPI cURL snippet
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