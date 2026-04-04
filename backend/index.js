// ============================================================
//  Train Finder — Backend (index.js)
//  Deploy target: Vercel Serverless (module.exports = app)
// ============================================================

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');

// FIX 1: Load dotenv ONLY when running locally.
// On Vercel, env vars are injected automatically from the dashboard.
// This prevents a crash if 'dotenv' is not installed in the cloud env.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();

// FIX 2: Explicit CORS config.
// Allows your deployed React frontend (and localhost dev) to call this API.
// origin: '*' means any domain can call it — fine for a student project.
// For production apps you would restrict this to your exact frontend URL.
app.use(cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());


// ──────────────────────────────────────────────────────────────
//  ROUTE: GET /api/search
//  Accepts: ?source=JBN&dest=NDLS&date=DD-MM-YYYY
// ──────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {

  const { source, dest, date } = req.query;

  // Validate all three params are present
  if (!source || !dest || !date) {
    return res.status(400).json({
      error: 'Missing parameters. Please provide source, dest, and date.'
    });
  }

  // Guard: if the API key was never set in Vercel dashboard, fail clearly
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.error('RAPIDAPI_KEY environment variable is not set!');
    return res.status(500).json({
      error: 'Server is missing API credentials. Check Vercel environment variables.'
    });
  }

  const options = {
    method: 'GET',
    url: 'https://irctc1.p.rapidapi.com/api/v3/trainBetweenStations',
    params: {
      fromStationCode: source,
      toStationCode:   dest,
      dateOfJourney:   date,
    },
    headers: {
      'x-rapidapi-key':  apiKey,
      'x-rapidapi-host': 'irctc1.p.rapidapi.com',
      // FIX 3: Removed 'Content-Type: application/json' from here.
      // This is a GET request — it has no body, so Content-Type is wrong.
      // Some APIs reject requests with an incorrect Content-Type header.
    },
  };

  try {
    const response = await axios.request(options);
    return res.json(response.data);

  } catch (error) {
    // Log the full RapidAPI error on the server side for debugging
    const errorDetails = error.response ? error.response.data : error.message;
    console.error('RapidAPI call failed:', errorDetails);

    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      error: 'Failed to fetch train data from RapidAPI.',
      details: errorDetails,
    });
  }
});


// ──────────────────────────────────────────────────────────────
//  HEALTH CHECK: GET /
// ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Train-Finder API is Live! 🚄');
});


// ──────────────────────────────────────────────────────────────
//  VERCEL SERVERLESS EXPORT
//  Do NOT use app.listen() here — Vercel manages the server lifecycle.
//  module.exports hands Vercel the Express app as a serverless function.
// ──────────────────────────────────────────────────────────────
module.exports = app;