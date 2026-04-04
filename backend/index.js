const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ROUTE: Get Trains between two stations
app.get('/api/search', async (req, res) => {
    const { from, to } = req.query; 

    const options = {
        method: 'GET',
        url: 'https://indian-railway-irctc.p.rapidapi.com/trainBetweenStations',
        params: { from: from, to: to },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'indian-railway-irctc.p.rapidapi.com'
        }
    };

    try {
        const response = await axios.request(options);
        res.json(response.data);
    } catch (error) {
        // This log helps us see the REAL error in Vercel Logs
        console.error("API Error Details:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Data fetch failed', 
            details: error.message 
        });
    }
});

// Base route to check if server is awake
app.get('/', (req, res) => res.send('Train-Finder API is Live! 🚄'));

module.exports = app;