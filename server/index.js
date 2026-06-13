const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('VoxelCraft Multiplayer WebSocket Server is running!\n');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

const clients = new Map(); // ws -> playerState
const modifiedBlocks = new Map(); // "x,y,z" -> blockType

function broadcast(data, excludeWs = null) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
  
  // Set default initial state for player
  const playerState = {
    id: playerId,
    name: 'Guest',
    x: 8,
    y: 30,
    z: 8,
    yaw: 0
  };
  clients.set(ws, playerState);

  // Send init packet to the new client
  // - player id
  // - positions of all other players
  const otherPlayers = {};
  for (const [otherWs, otherState] of clients.entries()) {
    if (otherWs !== ws) {
      otherPlayers[otherState.id] = {
        name: otherState.name,
        x: otherState.x,
        y: otherState.y,
        z: otherState.z,
        yaw: otherState.yaw
      };
    }
  }

  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    players: otherPlayers
  }));

  // Send all modified blocks to the new player to sync building
  for (const [key, blockType] of modifiedBlocks.entries()) {
    const [x, y, z] = key.split(',').map(Number);
    ws.send(JSON.stringify({
      type: 'block_update',
      x, y, z, blockType
    }));
  }

  // Broadcast player join to everyone else
  broadcast({
    type: 'player_join',
    id: playerId,
    x: playerState.x,
    y: playerState.y,
    z: playerState.z
  }, ws);

  console.log(`[Player Join] ID: ${playerId} connected`);

  // Handle messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const state = clients.get(ws);
      if (!state) return;

      switch (data.type) {
        case 'move':
          state.x = data.x;
          state.y = data.y;
          state.z = data.z;
          state.yaw = data.yaw;
          
          broadcast({
            type: 'player_move',
            id: state.id,
            x: state.x,
            y: state.y,
            z: state.z,
            yaw: state.yaw
          }, ws);
          break;

        case 'swing':
          broadcast({
            type: 'player_swing',
            id: state.id
          }, ws);
          break;

        case 'block_update':
          const blockKey = `${data.x},${data.y},${data.z}`;
          
          if (data.blockType === 0) {
            // Air / Broken block
            modifiedBlocks.delete(blockKey);
          } else {
            // Placed block
            modifiedBlocks.set(blockKey, data.blockType);
          }

          broadcast({
            type: 'block_update',
            x: data.x,
            y: data.y,
            z: data.z,
            blockType: data.blockType
          }, ws);
          break;

        case 'chat':
          const text = data.message;
          if (text.startsWith('/name ')) {
            const oldName = state.name;
            const newName = text.substring(6).trim();
            if (newName) {
              state.name = newName;
              broadcast({
                type: 'chat_message',
                sender: 'SYSTEM',
                message: `Player "${oldName.substring(0, 8)}" changed name to "${newName.substring(0, 8)}"`
              });
            }
          } else {
            broadcast({
              type: 'chat_message',
              sender: state.name,
              message: text
            });
          }
          break;
      }
    } catch (err) {
      console.error('Error parsing packet:', err);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    const state = clients.get(ws);
    if (state) {
      console.log(`[Player Leave] ID: ${state.id} disconnected`);
      broadcast({
        type: 'player_leave',
        id: state.id
      });
      clients.delete(ws);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server is listening on port ${PORT}`);
});
