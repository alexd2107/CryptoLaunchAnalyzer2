#!/usr/bin/env node

// analyzer.js
// Real-time Pump.fun token tracker using PumpPortal + Moralis API

import WebSocket from 'ws';
import fetch from 'node-fetch';
import 'dotenv/config';

const PUMP_PORTAL_WS = 'wss://pumpportal.fun/api/data';
const MORALIS_SOLANA_API = 'https://solana-gateway.moralis.io';
const API_KEY = process.env.MORALIS_API_KEY;

if (!API_KEY) {
  console.error('Error: MORALIS_API_KEY not set in .env');
  process.exit(1);
}

// Cache to avoid repeated API calls
const tokenCache = new Map();

// Fetch token details from Moralis
async function getTokenDetails(mint) {
  if (tokenCache.has(mint)) return tokenCache.get(mint);
  try {
    const url = `${MORALIS_SOLANA_API}/token/mainnet/${mint}/price`;
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'X-API-Key': API_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    tokenCache.set(mint, data);
    return data;
  } catch (err) {
    console.error(`Error fetching details for ${mint}:`, err.message);
    return null;
  }
}

// Basic scoring logic
function calculateGraduationScore(details) {
  if (!details?.usdPrice) return 0;
  const price = details.usdPrice;
  return Math.min(100, price * 10); // placeholder heuristic
}

// Connect to PumpPortal WebSocket
function startPumpPortalListener() {
  console.log('Connecting to PumpPortal...');
  const ws = new WebSocket(PUMP_PORTAL_WS);

  ws.on('open', () => {
    console.log('Connected! Subscribing to Pump.fun new tokens...');
    ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === 'newToken') {
        const { mint, name, symbol } = msg.data;
        console.log(`\n🚀 New Token: ${name} (${symbol})`);
        console.log(`Mint: ${mint}`);

        const details = await getTokenDetails(mint);
        const score = calculateGraduationScore(details);

        console.log('Details:', details || 'No data');
        console.log(`Graduation Likelihood: ${score.toFixed(2)}%`);
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err.message);
    }
  });

  ws.on('close', () => {
    console.warn('WebSocket closed. Reconnecting in 5s...');
    setTimeout(startPumpPortalListener, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

startPumpPortalListener();
