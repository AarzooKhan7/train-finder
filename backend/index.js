const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ROUTE: Get details for a specific train number
app.get('/api/train', async (req, res) => {
    const trainNo = req.query.trainNo; // Takes the train number from the URL

    // Safety check: Make sure the user actually provided a train number
    if (!trainNo) {
        return res.status(400).json({ error: 'Please provide a train number using ?trainNo=...' });
    }

    const options = {
        method: 'GET',
        // Notice how the trainNo is injected directly into the URL path
        url: `https://indian-railway-irctc.p.rapidapi.com/api/trains-search/v1/train/${trainNo}`,
        params: { 
            isH5: 'true', 
            client: 'web' 
        },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'indian-railway-irctc.p.rapidapi.com',
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = await axios.request(options);
        res.json(response.data);
    } catch (error) {
        console.error("API Error Details:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Data fetch failed', 
            details: error.message 
        });
    }
});

app.get('/', (req, res) => res.send('Train-Finder API is Live! 🚄'));

module.exports = app;