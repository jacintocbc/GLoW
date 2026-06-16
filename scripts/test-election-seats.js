/**
 * Test script for election-seats WebSocket hub.
 * Usage: node scripts/test-election-seats.js [update|zero|off]
 */

const WebSocket = require('ws');

const action = process.argv[2] || 'update';

const zeroMessage = {
  type: 'mini-seats',
  action: 'update',
  timestamp: new Date().toISOString(),
  sceneState: {
    key: 'Mini - Seats',
    itemsPerPage: 4,
    doingRefresh: false,
    pageNumber: 1,
  },
  parties: [
    { code: 'LIB', total: 0 },
    { code: 'CON', total: 0 },
    { code: 'BQ', total: 0 },
    { code: 'NDP', total: 0 },
    { code: 'GRN', total: 0 },
  ],
  summary: {
    totalActiveRidings: 0,
    totalRidings: 343,
    majority: 172,
  },
  payload: {},
};

const updateMessage = {
  type: 'mini-seats',
  action: 'update',
  timestamp: new Date().toISOString(),
  sceneState: {
    key: 'Mini - Seats',
    itemsPerPage: 4,
    doingRefresh: false,
    pageNumber: 1,
  },
  parties: [
    { code: 'CAQ', total: 90 },
    { code: 'LIB', total: 21 },
    { code: 'QS', total: 11 },
    { code: 'PQ', total: 3 },
    { code: 'CON', total: 2 },
    { code: 'GRN', total: 1 },
  ],
  summary: {
    totalActiveRidings: 123,
    totalRidings: 125,
    majority: 63,
  },
  payload: {},
};

const offMessage = {
  type: 'mini-seats',
  action: 'off',
  timestamp: new Date().toISOString(),
};

const message =
  action === 'off' ? offMessage :
  action === 'zero' ? zeroMessage :
  updateMessage;

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  ws.send(JSON.stringify(message));
  console.log('Sent:', JSON.stringify(message, null, 2));
  ws.close();
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  console.error('Is GLoW running? WebSocket hub should be on ws://localhost:3000');
  process.exit(1);
});
