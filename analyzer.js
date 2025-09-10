import WebSocket from 'ws';
import fetch from 'node-fetch';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import { Server } from 'socket.io';
import 'dotenv/config';

const PUMP_PORTAL_WS = 'wss://pumpportal.fun/api/data';
const MORALIS_SOLANA_API = 'https://solana-gateway.moralis.io';
const API_KEY = process.env.MORALIS_API_KEY;

const PORT = process.env.PORT || 3000;
const tokens = []; // In-memory store for dashboard

// CSV Writer
const csvWriter = createObjectCsvWriter({
  path: 'tokens.csv',
  header: [
    { id: 'name', title: 'Name' },
    { id: 'symbol', title: 'Symbol' },
    { id: 'mint', title: 'Mint' },
    { id: 'price', title: 'PriceUSD' },
    { id: 'score', title: 'Graduation%' },
  ],
  append: true,
});

// Setup Express + Socket.IO
import express from 'express';
const app = express();
app.use(express.static('public'));
const server = app.listen(PORT, () => console.log(`Dashboard running on http://localhost:${PORT}`));
const io = new Server(server);

// Token cache to avoid duplicate API calls
const tokenCache = new Map();

// Fetch token details from Moralis
async function getTokenDetails(mint) {
  if (tokenCache.has(mint)) return tokenCache.get(mint);
  try {
    const res = await fetch(`${MORALIS_SOLANA_API}/token/mainnet/${mint}/price`, {
      headers: { accept: 'application/json', 'X-API-Key': API_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    tokenCache.set(mint, data);
    return data;
  } catch (err) {
    console.error(`Error fetching token ${mint}:`, err.message);
    return null;
  }
}

// Graduation scoring (placeholder)
function calculateGraduationScore(details) {
  if (!details?.usdPrice) return 0;
  return Math.min(100, details.usdPrice * 10);
}

// Broadcast to dashboard
function broadcastToken(token) {
  io.emit('newToken', token);
}

// Append token to CSV
async function saveToken(token) {
  await csvWriter.writeRecords([token]);
}

// Connect to PumpPortal WebSocket
function startPumpPortalListener() {
  const ws = new WebSocket(PUMP_PORTAL_WS);

  ws.on('open', () => {
    console.log('Connected! Subscribing to new tokens...');
    ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === 'newToken') {
        const { mint, name, symbol } = msg.data;
        const details = await getTokenDetails(mint);
        const score = calculateGraduationScore(details);

        const token = {
          name,
          symbol,
          mint,
          price: details?.usdPrice || 0,
          score: score.toFixed(2),
        };

        console.log(`🚀 New Token: ${name} (${symbol}) - Graduation: ${score.toFixed(2)}%`);

        tokens.push(token);
        broadcastToken(token);
        await saveToken(token);
      }
    } catch (err) {
      console.error('Error processing message:', err.message);
    }
  });

  ws.on('close', () => {
    console.warn('WebSocket closed. Reconnecting in 5s...');
    setTimeout(startPumpPortalListener, 5000);
  });

  ws.on('error', (err) => console.error('WebSocket error:', err.message));
}

startPumpPortalListener();
