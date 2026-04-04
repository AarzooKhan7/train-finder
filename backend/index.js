const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());



// ROUTE: Get Trains between two stations
app.get('/api/search', async (req, res) => {
    const { from, to } = req.query; // This will take JBN and BPL from the URL

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
        res.status(500).json({ error: 'Data fetch failed' });
    }
});

// Remove app.listen and the PORT variable. 
// Add this single line at the very bottom of index.js:
module.exports = app;