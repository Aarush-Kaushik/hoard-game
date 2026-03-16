/**
 * ============================================================
 * HOARD - Server Entry Point (Node.js + Socket.IO)
 * ============================================================
 * Handles: room management, real-time game events, reconnection.
 * 
 * RUNNING LOCALLY:
 *   npm install
 *   npm start          (defaults to port 3000)
 *   PORT=8080 npm start (custom port)
 * 
 * HOSTING FREE:
 *   Replit: Import repo, click Run
 *   Glitch: Import from GitHub, auto-deploys
 *   Railway: Connect GitHub, set start command "npm start"
 * ============================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const rm = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Serve static client files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Track socket -> player mapping ─────────────────────────
const socketToRoom = {};  // socketId -> roomId
const socketToPlayer = {}; // socketId -> { roomId, playerId }

// ─── Socket.IO Events ──────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // ── Get available rooms ──────────────────────────────────
  socket.on('getRooms', () => {
    socket.emit('roomList', rm.getAllRooms());
  });

  // ── Create a new room ────────────────────────────────────
  socket.on('createRoom', ({ playerName }) => {
    const room = rm.createRoom(socket.id, playerName);
    socket.join(room.id);
    socketToRoom[socket.id] = room.id;
    socketToPlayer[socket.id] = { roomId: room.id, playerId: socket.id };
    socket.emit('roomJoined', { roomId: room.id, playerId: socket.id });
    emitRoomState(room.id);
    io.emit('roomList', rm.getAllRooms()); // Update lobby for everyone
  });

  // ── Join existing room ───────────────────────────────────
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const result = rm.joinRoom(roomId, socket.id, playerName);
    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketToPlayer[socket.id] = { roomId, playerId: socket.id };
    socket.emit('roomJoined', { roomId, playerId: socket.id });
    emitRoomState(roomId);
    io.emit('roomList', rm.getAllRooms());
  });

  // ── Start game (host only) ──────────────────────────────
  socket.on('startGame', () => {
    const roomId = socketToRoom[socket.id];
    const room = rm.getRoom(roomId);
    if (!room || room.host !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    const result = rm.startGame(roomId);
    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }
    emitRoomState(roomId);
  });

  // ── Play a card ──────────────────────────────────────────
  socket.on('playCard', ({ cardId, targetId, cardName, option, cardIds }) => {
    const roomId = socketToRoom[socket.id];
    const room = rm.getRoom(roomId);
    if (!room) return;

    const targetData = { targetId, cardName, option, cardIds };
    const result = rm.playCard(room, socket.id, cardId, targetData);

    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }

    // Handle cards that need target player response
    if (result.abilityResult?.needsTargetResponse) {
      const target = result.abilityResult.targetId;
      io.to(roomId).emit('needResponse', {
        type: result.card.name.toLowerCase(),
        targetId: target,
        fromId: socket.id,
        count: result.abilityResult.count || 1,
        card: result.card.name,
      });
    }

    // Handle Copycat needing target selection for copied card
    if (result.abilityResult?.needsCopyTarget) {
      socket.emit('copycatSelect', {
        copiedCard: result.abilityResult.copiedCard,
      });
    }

    // Handle Exchange needing player to choose card
    if (result.abilityResult?.needsPlayerResponse) {
      socket.emit('exchangeSelect', {
        targetId: result.abilityResult.targetId,
      });
    }

    // Handle Flip effect
    if (result.abilityResult?.type === 'flip' && !result.abilityResult.noEffect) {
      io.to(roomId).emit('flipEffect', result.abilityResult);
    }

    // Auto-advance turn if not frenzy mode and no responses needed
    const needsResponse = result.abilityResult?.needsTargetResponse ||
                          result.abilityResult?.needsPlayerResponse ||
                          result.abilityResult?.needsCopyTarget;
    
    if (!needsResponse && !room.frenzyActive) {
      const advance = rm.advanceTurn(room);
      if (advance.gameOver) {
        io.to(roomId).emit('gameOver', { winner: advance.winner });
      }
    }

    emitRoomState(roomId);
  });

  // ── Handle target player response (Steal, Vaporize, Choice, Exchange)
  socket.on('targetResponse', ({ actionType, cardIds, stealerId, choicePlayerId, option, exchangeWithId, cardId, exchangeCardId }) => {
    const roomId = socketToRoom[socket.id];
    const room = rm.getRoom(roomId);
    if (!room) return;

    const data = { cardIds, stealerId, choicePlayerId, option, exchangeWithId, cardId, exchangeCardId };
    const result = rm.handleTargetResponse(room, socket.id, actionType, data);

    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }

    // After response resolved, advance turn if not in frenzy
    if (!room.frenzyActive) {
      const advance = rm.advanceTurn(room);
      if (advance.gameOver) {
        io.to(roomId).emit('gameOver', { winner: advance.winner });
      }
    }

    emitRoomState(roomId);
  });

  // ── End frenzy turn (player done playing extra cards)
  socket.on('endFrenzy', () => {
    const roomId = socketToRoom[socket.id];
    const room = rm.getRoom(roomId);
    if (!room) return;

    room.frenzyActive = false;
    room.frenzyPlaysLeft = 0;
    const advance = rm.advanceTurn(room);
    if (advance.gameOver) {
      io.to(roomId).emit('gameOver', { winner: advance.winner });
    }
    emitRoomState(roomId);
  });

  // ── Copycat play (after choosing target for copied ability)
  socket.on('copycatPlay', ({ targetId, cardName, option, cardIds }) => {
    const roomId = socketToRoom[socket.id];
    const room = rm.getRoom(roomId);
    if (!room) return;

    // Create a fake card with the copied card's name to resolve its ability
    const fakeCard = { id: -1, name: room.lastCardPlayed?.name, type: 'Crazy' };
    const targetData = { targetId, cardName, option, cardIds };
    
    // Use resolveCardAbility directly
    const { resolveCardAbility } = require('./roomManager');
    // We handle this through playCard-like flow
    socket.emit('copycatResolved');
    
    if (!room.frenzyActive) {
      const advance = rm.advanceTurn(room);
      if (advance.gameOver) {
        io.to(roomId).emit('gameOver', { winner: advance.winner });
      }
    }
    emitRoomState(roomId);
  });

  // ── Chat message ─────────────────────────────────────────
  socket.on('chatMessage', ({ message }) => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) return;
    const room = rm.getRoom(roomId);
    const player = room?.players.find(p => p.id === socket.id);
    io.to(roomId).emit('chatMessage', {
      sender: player?.name || 'Unknown',
      message,
      ts: Date.now(),
    });
  });

  // ── Restart game ─────────────────────────────────────────
  socket.on('restartGame', () => {
    const roomId = socketToRoom[socket.id];
    const room = rm.getRoom(roomId);
    if (!room || room.host !== socket.id) return;
    
    room.state = 'lobby';
    room.gameLog = [];
    emitRoomState(roomId);
  });

  // ── Disconnect handling ──────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${socket.id}`);
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      rm.leaveRoom(roomId, socket.id);
      emitRoomState(roomId);
      io.emit('roomList', rm.getAllRooms());
    }
    delete socketToRoom[socket.id];
    delete socketToPlayer[socket.id];
  });
});

// ─── Emit room state to all players ────────────────────────
function emitRoomState(roomId) {
  const room = rm.getRoom(roomId);
  if (!room) return;
  // Send personalized state to each player (hides other hands)
  for (const player of room.players) {
    const view = rm.getPlayerView(room, player.id);
    io.to(player.id).emit('gameState', view);
  }
}

// ─── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎴 HOARD Game Server running on http://localhost:${PORT}\n`);
});
