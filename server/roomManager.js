/**
 * ============================================================
 * HOARD - Room Manager
 * ============================================================
 * Manages game rooms, turn logic, and ALL card ability resolution.
 * Every ability is implemented exactly per game_overview.docx.
 * 
 * TO ADD NEW ABILITIES: Add a case in resolveCardAbility()
 * TO CHANGE ROOM LIMITS: Edit MIN_PLAYERS / MAX_PLAYERS below
 * ============================================================
 */

const { v4: uuidv4 } = require('uuid');
const {
  CARD_DEFINITIONS, buildDeck, shuffleArray,
  dealCards, drawFromStack, deleteCards,
  checkWinCondition, checkElimination
} = require('./gameLogic');

// ─── Configuration ──────────────────────────────────────────
const MIN_PLAYERS = 2;   // Change this to adjust min players
const MAX_PLAYERS = 8;   // Change this to adjust max players

// ─── Room Storage ───────────────────────────────────────────
const rooms = {};  // roomId -> room state

// ─── Create Room ────────────────────────────────────────────
function createRoom(hostId, hostName) {
  const roomId = uuidv4().slice(0, 6).toUpperCase();
  rooms[roomId] = {
    id: roomId,
    host: hostId,
    players: [{ id: hostId, name: hostName, connected: true }],
    state: 'lobby',  // lobby | playing | finished
    deck: [],
    hands: {},
    discardPile: [],
    turnOrder: [],
    currentTurnIndex: 0,
    roundNumber: 0,
    lastCardPlayed: null,       // Track last card for Flip/Copycat
    lastCardTarget: null,       // Who was targeted by last card
    lastCardPlayer: null,       // Who played the last card
    blankActive: false,         // Rule: Blank cancels next card ability
    disabledCards: [],          // Rule: DISABLE removes card type from play
    shields: {},                // playerId -> boolean (Shield protection)
    raccoons: {},               // playerId -> { active, cardsGained }
    revengeDebts: [],           // { debtorId, creditorId, cardsOwed }
    cancelledTurns: {},         // playerId -> true if turn is skipped
    frenzyActive: false,       // Is current player in Frenzy mode?
    frenzyPlaysLeft: 0,        // How many extra plays remain in Frenzy
    eliminatedPlayers: [],     // Players who are out
    gameLog: [],               // Event log for UI
  };
  return rooms[roomId];
}

// ─── Get Room ───────────────────────────────────────────────
function getRoom(roomId) { return rooms[roomId]; }
function getAllRooms() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    playerCount: r.players.filter(p => !r.eliminatedPlayers.includes(p.id)).length,
    maxPlayers: MAX_PLAYERS,
    state: r.state,
    host: r.players.find(p => p.id === r.host)?.name || 'Unknown',
  }));
}

// ─── Join Room ──────────────────────────────────────────────
function joinRoom(roomId, playerId, playerName) {
  const room = rooms[roomId];
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') {
    // Allow reconnection during game
    const existing = room.players.find(p => p.name === playerName);
    if (existing) {
      existing.connected = true;
      existing.id = playerId;
      return { room, reconnected: true, oldId: existing.id };
    }
    return { error: 'Game already in progress' };
  }
  if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' };
  if (room.players.find(p => p.name === playerName)) return { error: 'Name already taken' };
  
  room.players.push({ id: playerId, name: playerName, connected: true });
  return { room };
}

// ─── Leave Room ─────────────────────────────────────────────
function leaveRoom(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.connected = false;
  
  // If all players disconnected, clean up room after delay
  if (room.players.every(p => !p.connected)) {
    setTimeout(() => {
      if (rooms[roomId] && rooms[roomId].players.every(p => !p.connected)) {
        delete rooms[roomId];
      }
    }, 60000); // 1 minute cleanup
  }
  return room;
}

// ─── Start Game ─────────────────────────────────────────────
/**
 * Rules applied:
 * - Everyone gets 7 cards
 * - Rest of cards go to card stack (deck)
 * - Turn order decided at start, cannot change
 */
function startGame(roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length < MIN_PLAYERS) return { error: `Need at least ${MIN_PLAYERS} players` };
  
  // Build and shuffle deck
  room.deck = shuffleArray(buildDeck());
  
  // Deal 7 cards to each
  const playerIds = room.players.map(p => p.id);
  const { hands, deck } = dealCards(room.deck, playerIds);
  room.hands = hands;
  room.deck = deck;
  
  // Set turn order (fixed for entire game per rules)
  room.turnOrder = [...playerIds];
  room.currentTurnIndex = 0;
  room.roundNumber = 1;
  room.state = 'playing';
  room.discardPile = [];
  room.shields = {};
  room.raccoons = {};
  room.revengeDebts = [];
  room.cancelledTurns = {};
  room.disabledCards = [];
  room.eliminatedPlayers = [];
  room.blankActive = false;
  room.frenzyActive = false;
  room.frenzyPlaysLeft = 0;
  room.lastCardPlayed = null;
  room.gameLog = [{ msg: 'Game started!', ts: Date.now() }];
  
  return { room };
}

// ─── Get Current Turn Player ────────────────────────────────
function getCurrentPlayer(room) {
  if (!room || room.state !== 'playing') return null;
  return room.turnOrder[room.currentTurnIndex];
}

// ─── Advance Turn ───────────────────────────────────────────
/**
 * Rules:
 * - Round ends when all players have played
 * - At round end, Raccoon holders gain 1 card (max 3 total)
 * - If player has 0 cards at end of turn, they are eliminated
 * - Cancelled turns are skipped
 */
function advanceTurn(room) {
  const currentId = getCurrentPlayer(room);
  
  // Reset frenzy state
  room.frenzyActive = false;
  room.frenzyPlaysLeft = 0;
  
  // Rule: 0 cards at end of turn = eliminated
  if (room.hands[currentId] && room.hands[currentId].length === 0) {
    if (!room.eliminatedPlayers.includes(currentId)) {
      room.eliminatedPlayers.push(currentId);
      room.gameLog.push({ msg: `${getPlayerName(room, currentId)} has been eliminated (0 cards)!`, ts: Date.now() });
    }
  }
  
  // Move to next non-eliminated player
  let nextIndex = room.currentTurnIndex;
  let loopCount = 0;
  const activePlayers = room.turnOrder.filter(id => !room.eliminatedPlayers.includes(id));
  
  if (activePlayers.length <= 1) {
    // Game over - last player standing or no players
    room.state = 'finished';
    if (activePlayers.length === 1) {
      room.gameLog.push({ msg: `${getPlayerName(room, activePlayers[0])} wins by being the last player!`, ts: Date.now() });
    }
    return { gameOver: true, winner: activePlayers[0] || null };
  }
  
  do {
    nextIndex = (nextIndex + 1) % room.turnOrder.length;
    loopCount++;
    if (loopCount > room.turnOrder.length * 2) break;
  } while (room.eliminatedPlayers.includes(room.turnOrder[nextIndex]));
  
  // Check if a full round has completed
  const prevRoundIndex = room.currentTurnIndex;
  room.currentTurnIndex = nextIndex;
  
  // Detect round completion (wrapped around)
  if (nextIndex <= prevRoundIndex || loopCount >= activePlayers.length) {
    room.roundNumber++;
    // Rule: Raccoon effect at end of round
    processRaccoonEffects(room);
  }
  
  // Rule: Check for cancelled turns (Cancel card effect)
  const nextPlayerId = room.turnOrder[nextIndex];
  if (room.cancelledTurns[nextPlayerId]) {
    delete room.cancelledTurns[nextPlayerId];
    room.gameLog.push({ msg: `${getPlayerName(room, nextPlayerId)}'s turn is skipped (Cancel)!`, ts: Date.now() });
    return advanceTurn(room); // Recursively skip
  }
  
  // Process revenge debts at start of turn
  processRevengeDebts(room, nextPlayerId);
  
  return { gameOver: false, nextPlayer: nextPlayerId };
}

// ─── Process Raccoon Effects ────────────────────────────────
/** Rule: Every round, Raccoon holders gain 1 card. Max 3 cards gained total. Only 1 active at a time. */
function processRaccoonEffects(room) {
  for (const [playerId, raccoon] of Object.entries(room.raccoons)) {
    if (raccoon.active && raccoon.cardsGained < 3 && !room.eliminatedPlayers.includes(playerId)) {
      const drawn = drawFromStack(room.deck, 1);
      if (drawn.length > 0) {
        room.hands[playerId].push(...drawn);
        raccoon.cardsGained++;
        room.gameLog.push({ msg: `${getPlayerName(room, playerId)}'s Raccoon gained a card (${raccoon.cardsGained}/3)`, ts: Date.now() });
        // Check win after gaining card
        const win = checkWinCondition(room.hands, playerId);
        if (win) {
          room.state = 'finished';
          room.gameLog.push({ msg: `${getPlayerName(room, playerId)} wins with 15+ cards!`, ts: Date.now() });
        }
      }
      if (raccoon.cardsGained >= 3) {
        raccoon.active = false;
        room.gameLog.push({ msg: `${getPlayerName(room, playerId)}'s Raccoon expired (max 3 cards)`, ts: Date.now() });
      }
    }
  }
}

// ─── Process Revenge Debts ──────────────────────────────────
/** Rule: When Revenge is stolen, stealer gives 2 cards to original owner on stealer's next turn */
function processRevengeDebts(room, playerId) {
  const debts = room.revengeDebts.filter(d => d.debtorId === playerId);
  for (const debt of debts) {
    if (room.hands[playerId] && room.hands[playerId].length >= 2) {
      // Auto-transfer 2 random cards from debtor to creditor
      const hand = room.hands[playerId];
      const transferCount = Math.min(2, hand.length);
      const transferred = [];
      for (let i = 0; i < transferCount; i++) {
        const idx = Math.floor(Math.random() * hand.length);
        transferred.push(hand.splice(idx, 1)[0]);
      }
      if (room.hands[debt.creditorId]) {
        room.hands[debt.creditorId].push(...transferred);
      }
      room.gameLog.push({ msg: `Revenge! ${getPlayerName(room, playerId)} gave 2 cards to ${getPlayerName(room, debt.creditorId)}`, ts: Date.now() });
    }
  }
  room.revengeDebts = room.revengeDebts.filter(d => d.debtorId !== playerId);
}

// ─── Play Card ──────────────────────────────────────────────
/**
 * Rules:
 * - Players MUST play a card at start of turn (unless cancelled)
 * - Card abilities used as soon as played
 * - Blank cancels next card ability (not Crazy/Passive)
 * - Shield protects from next card against you
 * - Disabled cards cannot be played
 */
function playCard(room, playerId, cardId, targetData) {
  if (room.state !== 'playing') return { error: 'Game not in progress' };
  
  const currentPlayer = getCurrentPlayer(room);
  
  // Check if it's this player's turn (or frenzy extra plays)
  if (currentPlayer !== playerId && !room.frenzyActive) {
    return { error: 'Not your turn' };
  }
  if (room.frenzyActive && currentPlayer !== playerId) {
    return { error: 'Not your turn' };
  }
  
  // Find card in hand
  const hand = room.hands[playerId];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not in your hand' };
  
  const card = hand[cardIndex];
  
  // Check if card is disabled
  if (room.disabledCards.includes(card.name)) {
    return { error: `${card.name} has been disabled and cannot be played` };
  }
  
  // Frenzy restriction: cannot play Crazy or Passive during frenzy extra plays
  if (room.frenzyActive && room.frenzyPlaysLeft > 0) {
    if (card.type === 'Crazy' || card.type === 'Passive') {
      return { error: 'Cannot play Crazy or Passive cards during Frenzy extra plays' };
    }
  }
  
  // Remove card from hand
  hand.splice(cardIndex, 1);
  
  // Add to discard pile
  room.discardPile.push(card);
  
  room.gameLog.push({ msg: `${getPlayerName(room, playerId)} played ${card.name}`, ts: Date.now() });
  
  // Check if Blank is active (cancels ability of non-Crazy, non-Passive cards)
  if (room.blankActive && card.type !== 'Crazy' && card.type !== 'Passive') {
    room.blankActive = false;
    room.gameLog.push({ msg: `${card.name}'s ability was cancelled by Blank!`, ts: Date.now() });
    room.lastCardPlayed = card;
    room.lastCardPlayer = playerId;
    room.lastCardTarget = targetData?.targetId || null;
    
    // If frenzy, decrement plays
    if (room.frenzyActive && room.frenzyPlaysLeft > 0) {
      room.frenzyPlaysLeft--;
    }
    
    return { success: true, cancelled: true, card };
  }
  
  // Check Shield protection on target
  if (targetData?.targetId && room.shields[targetData.targetId]) {
    const targetType = card.type;
    // Shield blocks the card
    if (card.name !== 'Present' && card.type !== 'Passive') {
      delete room.shields[targetData.targetId];
      room.gameLog.push({ msg: `${getPlayerName(room, targetData.targetId)}'s Shield blocked ${card.name}!`, ts: Date.now() });
      room.lastCardPlayed = card;
      room.lastCardPlayer = playerId;
      room.lastCardTarget = targetData.targetId;
      
      if (room.frenzyActive && room.frenzyPlaysLeft > 0) {
        room.frenzyPlaysLeft--;
      }
      return { success: true, shielded: true, card };
    }
  }
  
  // Resolve the card ability
  const result = resolveCardAbility(room, playerId, card, targetData);
  
  // Track last card (for Flip and Copycat)
  room.lastCardPlayed = card;
  room.lastCardPlayer = playerId;
  room.lastCardTarget = targetData?.targetId || null;
  
  // If frenzy extra play, decrement counter
  if (room.frenzyActive && room.frenzyPlaysLeft > 0 && card.name !== 'Frenzy') {
    room.frenzyPlaysLeft--;
  }
  
  // Check win condition after play
  for (const pid of room.turnOrder) {
    if (!room.eliminatedPlayers.includes(pid)) {
      const win = checkWinCondition(room.hands, pid);
      if (win) {
        room.state = 'finished';
        room.gameLog.push({ msg: `${getPlayerName(room, pid)} wins with 15+ cards!`, ts: Date.now() });
        return { success: true, card, abilityResult: result, gameOver: true, winner: pid };
      }
    }
  }
  
  // Check eliminations
  for (const pid of room.turnOrder) {
    if (!room.eliminatedPlayers.includes(pid) && room.hands[pid]?.length === 0 && pid !== playerId) {
      room.eliminatedPlayers.push(pid);
      room.gameLog.push({ msg: `${getPlayerName(room, pid)} eliminated (0 cards)!`, ts: Date.now() });
      // Rule: eliminator gets 2 random cards as reward
      const reward = drawFromStack(room.deck, 2);
      if (reward.length > 0 && room.hands[playerId]) {
        room.hands[playerId].push(...reward);
        room.gameLog.push({ msg: `${getPlayerName(room, playerId)} gained ${reward.length} reward cards for eliminating a player!`, ts: Date.now() });
      }
    }
  }
  
  return { success: true, card, abilityResult: result };
}

// ─── Resolve Card Ability ───────────────────────────────────
/**
 * Every card ability from game_overview.docx implemented here.
 * TO ADD NEW CARD ABILITIES: Add a new case below.
 */
function resolveCardAbility(room, playerId, card, targetData) {
  switch (card.name) {
    
    // ── BASIC: Draw ─────────────────────────────────────────
    // Ability: Pick up 2 random cards from the card stack
    case 'Draw': {
      const drawn = drawFromStack(room.deck, 2);
      room.hands[playerId].push(...drawn);
      room.gameLog.push({ msg: `${getPlayerName(room, playerId)} drew ${drawn.length} cards`, ts: Date.now() });
      return { type: 'draw', cards: drawn };
    }
    
    // ── BASIC: Steal ────────────────────────────────────────
    // Ability: Steal 2 cards from any player of choice
    // Rule: The victim decides which cards to give
    // Rule: Stolen card owner sees card only after receiving
    case 'Steal': {
      const targetId = targetData?.targetId;
      if (!targetId || !room.hands[targetId]) return { error: 'Invalid target' };
      // Server requests target player to choose 2 cards to give
      return { type: 'steal', needsTargetResponse: true, targetId, count: 2 };
    }
    
    // ── BASIC: Exchange ─────────────────────────────────────
    // Ability: Exchange one card with another player. Cannot exchange another Exchange card.
    case 'Exchange': {
      const targetId = targetData?.targetId;
      if (!targetId || !room.hands[targetId]) return { error: 'Invalid target' };
      // Player needs to choose which card to give, target chooses which to give back
      return { type: 'exchange', needsPlayerResponse: true, targetId };
    }
    
    // ── MISERY: Revenge ─────────────────────────────────────
    // Ability: When stolen, 2 of stealer's cards transfer to you on their next turn
    // This is a PASSIVE trap - effect is set up when played to hand
    case 'Revenge': {
      room.gameLog.push({ msg: `${getPlayerName(room, playerId)} played Revenge (trap set)`, ts: Date.now() });
      return { type: 'revenge', info: 'Revenge trap is now in your hand area' };
    }
    
    // ── MISERY: Blank ───────────────────────────────────────
    // Ability: Cancels next card's ability. Not Crazy or Passive. Applies once.
    case 'Blank': {
      room.blankActive = true;
      room.gameLog.push({ msg: `Blank activated! Next non-Crazy/non-Passive card is cancelled`, ts: Date.now() });
      return { type: 'blank' };
    }
    
    // ── MISERY: Choice ──────────────────────────────────────
    // Ability: Target gives you 1 card OR puts 2 cards at bottom of stack
    case 'Choice': {
      const targetId = targetData?.targetId;
      if (!targetId || !room.hands[targetId]) return { error: 'Invalid target' };
      return { type: 'choice', needsTargetResponse: true, targetId };
    }
    
    // ── ADVANCED: Vaporize ──────────────────────────────────
    // Ability: Deletes 2 cards from any player of choice
    // Rule: Deleted cards go to bottom of stack
    // Rule: Target player decides which cards to delete
    case 'Vaporize': {
      const targetId = targetData?.targetId;
      if (!targetId || !room.hands[targetId]) return { error: 'Invalid target' };
      return { type: 'vaporize', needsTargetResponse: true, targetId, count: 2 };
    }
    
    // ── ADVANCED: Flip ──────────────────────────────────────
    // Ability: Flips roles of last card. Not Crazy, Passive, or multi-target.
    case 'Flip': {
      if (!room.lastCardPlayed) {
        room.gameLog.push({ msg: 'Flip had no effect (no previous card)', ts: Date.now() });
        return { type: 'flip', noEffect: true };
      }
      const last = room.lastCardPlayed;
      if (last.type === 'Crazy' || last.type === 'Passive') {
        room.gameLog.push({ msg: `Flip cannot affect ${last.type} cards`, ts: Date.now() });
        return { type: 'flip', noEffect: true };
      }
      // Multi-target check (Shuffle is multi-target)
      if (last.name === 'Shuffle') {
        room.gameLog.push({ msg: 'Flip cannot affect multi-target cards', ts: Date.now() });
        return { type: 'flip', noEffect: true };
      }
      // Flip: reverse the last card's effect - the original player becomes the target
      return { type: 'flip', flippedCard: last.name, originalPlayer: room.lastCardPlayer, originalTarget: room.lastCardTarget };
    }
    
    // ── ADVANCED: Cancel ────────────────────────────────────
    // Ability: Skips any player of choice's turn
    case 'Cancel': {
      const targetId = targetData?.targetId;
      if (!targetId) return { error: 'Invalid target' };
      room.cancelledTurns[targetId] = true;
      room.gameLog.push({ msg: `${getPlayerName(room, targetId)}'s next turn will be skipped!`, ts: Date.now() });
      return { type: 'cancel', targetId };
    }
    
    // ── PASSIVE: Present ────────────────────────────────────
    // Ability: Gives 2 cards from stack to any player (including self)
    case 'Present': {
      const targetId = targetData?.targetId || playerId;
      const drawn = drawFromStack(room.deck, 2);
      if (room.hands[targetId]) {
        room.hands[targetId].push(...drawn);
      }
      room.gameLog.push({ msg: `${getPlayerName(room, playerId)} gave 2 cards to ${getPlayerName(room, targetId)}`, ts: Date.now() });
      return { type: 'present', targetId, cards: drawn };
    }
    
    // ── PASSIVE: Shield ─────────────────────────────────────
    // Ability: Protected from next card played against you
    case 'Shield': {
      room.shields[playerId] = true;
      room.gameLog.push({ msg: `${getPlayerName(room, playerId)} is now shielded!`, ts: Date.now() });
      return { type: 'shield' };
    }
    
    // ── PASSIVE: Raccoon ────────────────────────────────────
    // Ability: Every round, gain 1 card. Max 3. Only 1 Raccoon active at a time.
    case 'Raccoon': {
      // Check if any Raccoon is already active (for any player)
      const hasActiveRaccoon = Object.values(room.raccoons).some(r => r.active);
      if (hasActiveRaccoon) {
        room.gameLog.push({ msg: 'A Raccoon is already active! This one has no effect.', ts: Date.now() });
        return { type: 'raccoon', noEffect: true };
      }
      room.raccoons[playerId] = { active: true, cardsGained: 0 };
      room.gameLog.push({ msg: `${getPlayerName(room, playerId)}'s Raccoon is now active!`, ts: Date.now() });
      return { type: 'raccoon' };
    }
    
    // ── CRAZY: Frenzy ───────────────────────────────────────
    // Ability: Play up to 3 more cards this turn (not Crazy or Passive)
    case 'Frenzy': {
      room.frenzyActive = true;
      room.frenzyPlaysLeft = 3;
      room.gameLog.push({ msg: `FRENZY! ${getPlayerName(room, playerId)} can play up to 3 more cards!`, ts: Date.now() });
      return { type: 'frenzy', playsLeft: 3 };
    }
    
    // ── CRAZY: Disable ──────────────────────────────────────
    // Ability: Disables a card type from being played. All holders discard it.
    case 'Disable': {
      const cardToDisable = targetData?.cardName;
      if (!cardToDisable || !CARD_DEFINITIONS[cardToDisable]) return { error: 'Invalid card to disable' };
      room.disabledCards.push(cardToDisable);
      // All players with that card put it at bottom of stack
      const affected = [];
      for (const pid of room.turnOrder) {
        if (room.hands[pid]) {
          const toRemove = room.hands[pid].filter(c => c.name === cardToDisable);
          room.hands[pid] = room.hands[pid].filter(c => c.name !== cardToDisable);
          deleteCards(toRemove, room.deck);
          if (toRemove.length > 0) affected.push({ id: pid, count: toRemove.length });
        }
      }
      room.gameLog.push({ msg: `DISABLE! ${cardToDisable} is banned for the rest of the game!`, ts: Date.now() });
      return { type: 'disable', cardName: cardToDisable, affected };
    }
    
    // ── CRAZY: Copycat ──────────────────────────────────────
    // Ability: Copies ability of last card played
    case 'Copycat': {
      if (!room.lastCardPlayed) {
        room.gameLog.push({ msg: 'Copycat had no card to copy', ts: Date.now() });
        return { type: 'copycat', noEffect: true };
      }
      room.gameLog.push({ msg: `COPYCAT copies ${room.lastCardPlayed.name}!`, ts: Date.now() });
      return { type: 'copycat', copiedCard: room.lastCardPlayed.name, needsCopyTarget: true };
    }
    
    // ── CRAZY: Shuffle ──────────────────────────────────────
    // Ability: Reshuffles everyone's cards. Same amount back. User can't see.
    case 'Shuffle': {
      // Collect all cards from all active players
      const allCards = [];
      const counts = {};
      for (const pid of room.turnOrder) {
        if (!room.eliminatedPlayers.includes(pid) && room.hands[pid]) {
          counts[pid] = room.hands[pid].length;
          allCards.push(...room.hands[pid]);
        }
      }
      // Shuffle all cards
      shuffleArray(allCards);
      // Redistribute same amounts
      let idx = 0;
      for (const pid of room.turnOrder) {
        if (!room.eliminatedPlayers.includes(pid) && counts[pid] !== undefined) {
          room.hands[pid] = allCards.slice(idx, idx + counts[pid]);
          idx += counts[pid];
        }
      }
      room.gameLog.push({ msg: `SHUFFLE! All cards have been reshuffled!`, ts: Date.now() });
      return { type: 'shuffle' };
    }
    
    default:
      return { error: 'Unknown card' };
  }
}

// ─── Handle Target Responses ────────────────────────────────
/**
 * When cards like Steal, Vaporize, Choice, Exchange need the target
 * player to choose cards, this function processes their response.
 */
function handleTargetResponse(room, responderId, actionType, data) {
  switch (actionType) {
    
    // Steal: target gives 2 cards (they choose which)
    case 'steal': {
      const { cardIds, stealerId } = data;
      const targetHand = room.hands[responderId];
      if (!targetHand) return { error: 'Invalid responder' };
      
      const cardsToGive = [];
      for (const cid of cardIds.slice(0, 2)) {
        const idx = targetHand.findIndex(c => c.id === cid);
        if (idx !== -1) {
          cardsToGive.push(targetHand.splice(idx, 1)[0]);
        }
      }
      
      // Check for Revenge trap
      const revengeCards = cardsToGive.filter(c => c.name === 'Revenge');
      if (revengeCards.length > 0) {
        // Rule: when Revenge is stolen, stealer owes 2 cards on their next turn
        room.revengeDebts.push({ debtorId: stealerId, creditorId: responderId, cardsOwed: 2 });
        room.gameLog.push({ msg: `${getPlayerName(room, responderId)} had a Revenge card! ${getPlayerName(room, stealerId)} will owe 2 cards!`, ts: Date.now() });
      }
      
      // Rule: stealer sees cards only after receiving
      room.hands[stealerId].push(...cardsToGive);
      room.gameLog.push({ msg: `${getPlayerName(room, stealerId)} stole ${cardsToGive.length} cards from ${getPlayerName(room, responderId)}`, ts: Date.now() });
      return { success: true, cards: cardsToGive };
    }
    
    // Vaporize: target chooses 2 cards to delete
    case 'vaporize': {
      const { cardIds } = data;
      const targetHand = room.hands[responderId];
      if (!targetHand) return { error: 'Invalid responder' };
      
      const toDelete = [];
      for (const cid of cardIds.slice(0, 2)) {
        const idx = targetHand.findIndex(c => c.id === cid);
        if (idx !== -1) toDelete.push(targetHand.splice(idx, 1)[0]);
      }
      // Rule: deleted cards go to bottom of stack
      deleteCards(toDelete, room.deck);
      room.gameLog.push({ msg: `${toDelete.length} cards were vaporized from ${getPlayerName(room, responderId)}`, ts: Date.now() });
      return { success: true };
    }
    
    // Choice: target gives 1 card OR puts 2 at bottom of stack
    case 'choice': {
      const { option, cardIds, choicePlayerId } = data;
      const targetHand = room.hands[responderId];
      if (!targetHand) return { error: 'Invalid responder' };
      
      if (option === 'give') {
        // Give 1 card to the Choice player
        const cid = cardIds[0];
        const idx = targetHand.findIndex(c => c.id === cid);
        if (idx !== -1) {
          const card = targetHand.splice(idx, 1)[0];
          room.hands[choicePlayerId].push(card);
          // Check Revenge
          if (card.name === 'Revenge') {
            room.revengeDebts.push({ debtorId: choicePlayerId, creditorId: responderId, cardsOwed: 2 });
          }
          room.gameLog.push({ msg: `${getPlayerName(room, responderId)} gave 1 card to ${getPlayerName(room, choicePlayerId)}`, ts: Date.now() });
        }
      } else {
        // Put 2 cards at bottom of stack
        for (const cid of cardIds.slice(0, 2)) {
          const idx = targetHand.findIndex(c => c.id === cid);
          if (idx !== -1) {
            const card = targetHand.splice(idx, 1)[0];
            room.deck.unshift(card);
          }
        }
        room.gameLog.push({ msg: `${getPlayerName(room, responderId)} put 2 cards at the bottom of the stack`, ts: Date.now() });
      }
      return { success: true };
    }
    
    // Exchange: both players choose a card
    case 'exchange': {
      const { cardId, exchangeWithId, exchangeCardId } = data;
      const playerHand = room.hands[responderId];
      const targetHand = room.hands[exchangeWithId];
      if (!playerHand || !targetHand) return { error: 'Invalid' };
      
      // Player gives their chosen card
      const pIdx = playerHand.findIndex(c => c.id === cardId);
      // Target gives their chosen card
      const tIdx = targetHand.findIndex(c => c.id === exchangeCardId);
      
      if (pIdx !== -1 && tIdx !== -1) {
        const pCard = playerHand.splice(pIdx, 1)[0];
        const tCard = targetHand.splice(tIdx, 1)[0];
        // Rule: Cannot exchange an Exchange card
        if (pCard.name === 'Exchange' || tCard.name === 'Exchange') {
          // Put them back
          playerHand.push(pCard);
          targetHand.push(tCard);
          return { error: 'Cannot exchange an Exchange card' };
        }
        playerHand.push(tCard);
        targetHand.push(pCard);
        room.gameLog.push({ msg: `${getPlayerName(room, responderId)} exchanged a card with ${getPlayerName(room, exchangeWithId)}`, ts: Date.now() });
      }
      return { success: true };
    }
    
    default:
      return { error: 'Unknown action' };
  }
}

// ─── Helper ─────────────────────────────────────────────────
function getPlayerName(room, playerId) {
  const p = room.players.find(p => p.id === playerId);
  return p ? p.name : 'Unknown';
}

// ─── Get Sanitized State ────────────────────────────────────
/** Returns game state visible to a specific player (hides other hands) */
function getPlayerView(room, playerId) {
  if (!room) return null;
  const view = {
    id: room.id,
    state: room.state,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      cardCount: room.hands[p.id]?.length || 0,
      isEliminated: room.eliminatedPlayers.includes(p.id),
      hasShield: !!room.shields[p.id],
      hasRaccoon: room.raccoons[p.id]?.active || false,
    })),
    myHand: room.hands[playerId] || [],
    deckCount: room.deck.length,
    discardPile: room.discardPile.slice(-5), // last 5 cards
    currentPlayer: getCurrentPlayer(room),
    roundNumber: room.roundNumber,
    disabledCards: room.disabledCards,
    frenzyActive: room.frenzyActive,
    frenzyPlaysLeft: room.frenzyPlaysLeft,
    blankActive: room.blankActive,
    gameLog: room.gameLog.slice(-15), // last 15 log entries
    isHost: room.host === playerId,
  };
  return view;
}

// ─── Delete Room ────────────────────────────────────────────
function deleteRoom(roomId) { delete rooms[roomId]; }

module.exports = {
  createRoom, getRoom, getAllRooms, joinRoom, leaveRoom,
  startGame, getCurrentPlayer, advanceTurn, playCard,
  handleTargetResponse, getPlayerView, deleteRoom,
  MIN_PLAYERS, MAX_PLAYERS,
};
