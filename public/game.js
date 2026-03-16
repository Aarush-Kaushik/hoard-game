/**
 * ============================================================
 * HOARD - Client Game Logic (game.js)
 * ============================================================
 * Handles: UI rendering, socket events, card interactions,
 *          target selection, response modals, chat.
 *
 * CARD IMAGES: Located in /assets/cards/{CardName}.png
 * TO ADD NEW CARD GRAPHICS: Add {CardName}.png to assets/cards/
 *   then the card will automatically display if it exists in
 *   the server's CARD_DEFINITIONS.
 *
 * TO MODIFY UI: Each section is clearly labeled below.
 * ============================================================
 */

// ─── Socket Connection ──────────────────────────────────────
const socket = io();

// ─── State ──────────────────────────────────────────────────
let myPlayerId = null;
let currentRoomId = null;
let gameState = null;
let selectedCardId = null;
let pendingAction = null;     // { type, cardId, ... }
let modalSelectedCards = [];
let disableSelectedCard = null;
let choiceFromId = null;      // Who played the Choice card

// ─── Card type info (for UI fallbacks) ──────────────────────
const CARD_TYPES = {
  Draw: 'Basic', Steal: 'Basic', Exchange: 'Basic',
  Revenge: 'Misery', Blank: 'Misery', Choice: 'Misery',
  Vaporize: 'Advanced', Flip: 'Advanced', Cancel: 'Advanced',
  Present: 'Passive', Shield: 'Passive', Raccoon: 'Passive',
  Frenzy: 'Crazy', Disable: 'Crazy', Copycat: 'Crazy', Shuffle: 'Crazy',
};

// Cards that need a target player selection
const TARGET_CARDS = ['Steal', 'Exchange', 'Choice', 'Vaporize', 'Cancel', 'Present'];

// ═══════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════════════════

function createRoom() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  socket.emit('createRoom', { playerName: name });
}

function joinByCode() {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  if (!code) { showToast('Please enter a room code', 'error'); return; }
  socket.emit('joinRoom', { roomId: code, playerName: name });
}

function joinRoom(roomId) {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  socket.emit('joinRoom', { roomId, playerName: name });
}

// Refresh room list periodically
socket.emit('getRooms');
setInterval(() => {
  if (document.getElementById('lobby-screen').classList.contains('active')) {
    socket.emit('getRooms');
  }
}, 3000);

// ═══════════════════════════════════════════════════════════
// WAITING ROOM
// ═══════════════════════════════════════════════════════════

function renderWaitingRoom(state) {
  document.getElementById('display-room-code').textContent = state.id;
  const container = document.getElementById('player-list-room');
  container.innerHTML = '';
  
  state.players.forEach((p, i) => {
    const slot = document.createElement('div');
    slot.className = `player-slot filled ${state.isHost && p.id === state.players[0]?.id ? 'host' : ''}`;
    slot.innerHTML = `
      <div class="player-name">${escapeHtml(p.name)}</div>
      <div class="player-tag">${p.id === myPlayerId ? '(You)' : ''} ${i === 0 ? '👑 Host' : ''}</div>
    `;
    container.appendChild(slot);
  });
  
  // Show start button only for host with enough players
  const startBtn = document.getElementById('btn-start');
  if (state.isHost && state.players.length >= 2) {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }
}

function copyRoomCode() {
  const code = document.getElementById('display-room-code').textContent;
  navigator.clipboard?.writeText(code);
  showToast('Room code copied!', 'success');
}

function startGame() { socket.emit('startGame'); }

function leaveRoom() {
  socket.disconnect();
  socket.connect();
  currentRoomId = null;
  showScreen('lobby-screen');
}

// ═══════════════════════════════════════════════════════════
// GAME RENDERING
// ═══════════════════════════════════════════════════════════

function renderGame(state) {
  gameState = state;
  
  const isMyTurn = state.currentPlayer === myPlayerId;
  
  // Turn info
  const turnPlayer = state.players.find(p => p.id === state.currentPlayer);
  document.getElementById('turn-name').textContent = turnPlayer ? turnPlayer.name : '---';
  document.getElementById('your-turn-label').classList.toggle('hidden', !isMyTurn);
  document.getElementById('round-num').textContent = state.roundNumber;
  document.getElementById('deck-count').textContent = state.deckCount;
  document.getElementById('deck-count-visual').textContent = state.deckCount;
  
  // Status bar
  renderStatusBar(state);
  
  // Frenzy banner
  const frenzyBanner = document.getElementById('frenzy-banner');
  if (state.frenzyActive && isMyTurn) {
    frenzyBanner.classList.add('active');
    document.getElementById('frenzy-plays').textContent = state.frenzyPlaysLeft;
  } else {
    frenzyBanner.classList.remove('active');
  }
  
  // Other players
  renderOtherPlayers(state);
  
  // Discard pile
  renderDiscardPile(state);
  
  // Player hand
  renderHand(state);
  
  // Game log
  renderLog(state);
}

function renderStatusBar(state) {
  const bar = document.getElementById('status-bar');
  bar.innerHTML = '';
  const me = state.players.find(p => p.id === myPlayerId);
  if (me?.hasShield) bar.innerHTML += '<span class="status-badge status-shield">🛡️ Shield Active</span>';
  if (me?.hasRaccoon) bar.innerHTML += '<span class="status-badge status-raccoon">🦝 Raccoon Active</span>';
  if (state.blankActive) bar.innerHTML += '<span class="status-badge status-blank">⬜ Blank Active</span>';
  if (state.disabledCards.length > 0) {
    bar.innerHTML += `<span class="status-badge" style="background:rgba(255,255,255,0.05);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.1)">🚫 Disabled: ${state.disabledCards.join(', ')}</span>`;
  }
}

function renderOtherPlayers(state) {
  const container = document.getElementById('other-players');
  container.innerHTML = '';
  
  state.players.filter(p => p.id !== myPlayerId).forEach(p => {
    const div = document.createElement('div');
    div.className = `opponent ${p.id === state.currentPlayer ? 'active-turn' : ''} ${p.isEliminated ? 'eliminated' : ''}`;
    div.dataset.playerId = p.id;
    
    let badges = '';
    if (p.hasShield) badges += '<div class="opp-badge badge-shield">🛡</div>';
    if (p.hasRaccoon) badges += '<div class="opp-badge badge-raccoon" style="right:18px">🦝</div>';
    
    div.innerHTML = `
      ${badges}
      <div class="opp-name">${escapeHtml(p.name)}${!p.connected ? ' 📴' : ''}</div>
      <div class="opp-cards">${p.cardCount} card${p.cardCount !== 1 ? 's' : ''} ${p.isEliminated ? '(OUT)' : ''}</div>
    `;
    container.appendChild(div);
  });
}

function renderDiscardPile(state) {
  const disc = document.getElementById('discard-visual');
  if (state.discardPile.length > 0) {
    const lastCard = state.discardPile[state.discardPile.length - 1];
    disc.innerHTML = `<img src="assets/cards/${lastCard.name}.png" alt="${lastCard.name}">`;
  } else {
    disc.innerHTML = '<span style="color:var(--text-muted);font-size:0.7rem">Empty</span>';
  }
}

function renderHand(state) {
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';
  document.getElementById('hand-count').textContent = `${state.myHand.length} cards`;
  
  const isMyTurn = state.currentPlayer === myPlayerId;
  
  state.myHand.forEach((card, i) => {
    const div = document.createElement('div');
    const isDisabled = state.disabledCards.includes(card.name);
    div.className = `card ${isDisabled ? 'disabled-card' : ''} ${selectedCardId === card.id ? 'selected' : ''}`;
    div.dataset.type = card.type;
    div.dataset.cardId = card.id;
    div.dataset.cardName = card.name;
    div.style.animationDelay = `${i * 0.05}s`;
    div.innerHTML = `<img src="assets/cards/${card.name}.png" alt="${card.name}" title="${card.name} (${card.type})">`;
    
    div.addEventListener('click', () => {
      if (isDisabled) return;
      handleCardClick(card);
    });
    
    container.appendChild(div);
  });
}

function renderLog(state) {
  const panel = document.getElementById('log-panel');
  panel.innerHTML = '';
  state.gameLog.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = entry.msg;
    panel.appendChild(div);
  });
  panel.scrollTop = panel.scrollHeight;
}

// ═══════════════════════════════════════════════════════════
// CARD CLICK HANDLING
// ═══════════════════════════════════════════════════════════

/**
 * When a player clicks a card in their hand:
 * - If it's not their turn (and no frenzy), show error
 * - If card needs a target, open target selection modal
 * - If card is Disable, open card name selection modal
 * - Otherwise, play it directly
 */
function handleCardClick(card) {
  if (!gameState) return;
  const isMyTurn = gameState.currentPlayer === myPlayerId;
  
  // During frenzy, also allow plays
  if (!isMyTurn && !(gameState.frenzyActive && gameState.currentPlayer === myPlayerId)) {
    showToast("It's not your turn!", 'error');
    return;
  }
  
  selectedCardId = card.id;
  renderHand(gameState); // Highlight selected
  
  // Disable: choose card name to ban
  if (card.name === 'Disable') {
    openDisableModal(card);
    return;
  }
  
  // Cards needing target player selection
  if (TARGET_CARDS.includes(card.name)) {
    openTargetModal(card);
    return;
  }
  
  // Shuffle, Draw, Blank, Frenzy, Shield, Raccoon, Revenge, Flip, Copycat - play directly
  socket.emit('playCard', { cardId: card.id });
  selectedCardId = null;
}

// ═══════════════════════════════════════════════════════════
// TARGET SELECTION MODAL
// ═══════════════════════════════════════════════════════════

function openTargetModal(card) {
  const modal = document.getElementById('modal-target');
  const title = document.getElementById('modal-target-title');
  const desc = document.getElementById('modal-target-desc');
  const playerList = document.getElementById('modal-target-players');
  
  title.textContent = `${card.name} — Choose Target`;
  
  const descriptions = {
    Steal: 'Choose a player to steal 2 cards from.',
    Exchange: 'Choose a player to exchange a card with.',
    Choice: 'Choose a player: they give you 1 card or discard 2.',
    Vaporize: 'Choose a player to delete 2 cards from.',
    Cancel: 'Choose a player to skip their next turn.',
    Present: 'Choose a player to give 2 cards from the deck (can be yourself).',
  };
  desc.textContent = descriptions[card.name] || 'Select a target player.';
  
  playerList.innerHTML = '';
  
  // Present can target self
  const candidates = gameState.players.filter(p => {
    if (p.isEliminated) return false;
    if (card.name === 'Present') return true; // Can target self
    return p.id !== myPlayerId;
  });
  
  candidates.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'modal-player-btn';
    btn.innerHTML = `<span>${escapeHtml(p.name)} ${p.id === myPlayerId ? '(You)' : ''}</span><span>${p.cardCount} cards</span>`;
    btn.addEventListener('click', () => {
      socket.emit('playCard', { cardId: card.id, targetId: p.id });
      closeModal('modal-target');
      selectedCardId = null;
    });
    playerList.appendChild(btn);
  });
  
  modal.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// DISABLE MODAL
// ═══════════════════════════════════════════════════════════

function openDisableModal(card) {
  const modal = document.getElementById('modal-disable');
  const list = document.getElementById('disable-card-list');
  list.innerHTML = '';
  disableSelectedCard = null;
  
  const allCards = ['Draw','Steal','Exchange','Revenge','Blank','Choice','Vaporize','Flip','Cancel','Present','Shield','Raccoon','Frenzy','Disable','Copycat','Shuffle'];
  const available = allCards.filter(c => !gameState.disabledCards.includes(c));
  
  available.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'card-name-btn';
    const typeColors = { Basic: 'var(--basic)', Misery: 'var(--misery)', Advanced: 'var(--advanced)', Passive: 'var(--passive)', Crazy: 'var(--crazy)' };
    btn.style.borderColor = typeColors[CARD_TYPES[name]] || 'transparent';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      list.querySelectorAll('.card-name-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      disableSelectedCard = name;
    });
    list.appendChild(btn);
  });
  
  modal.classList.add('active');
}

function confirmDisable() {
  if (!disableSelectedCard) { showToast('Select a card to disable', 'error'); return; }
  socket.emit('playCard', { cardId: selectedCardId, cardName: disableSelectedCard });
  closeModal('modal-disable');
  selectedCardId = null;
  disableSelectedCard = null;
}

// ═══════════════════════════════════════════════════════════
// RESPONSE MODALS (when YOU are targeted)
// ═══════════════════════════════════════════════════════════

/**
 * When another player targets you with Steal, Vaporize, Choice, or Exchange,
 * the server sends a 'needResponse' event. You must choose cards to give/delete.
 */
function handleNeedResponse(data) {
  if (data.targetId !== myPlayerId) return; // Not for me
  
  switch (data.type) {
    case 'steal':
      openCardChoiceModal(
        'You are being robbed! 🏴‍☠️',
        `Choose ${data.count} card(s) to give away.`,
        data.count, 'steal', { stealerId: data.fromId }
      );
      break;
    case 'vaporize':
      openCardChoiceModal(
        'Your cards are being vaporized! 💨',
        `Choose ${data.count} card(s) to delete.`,
        data.count, 'vaporize', {}
      );
      break;
    case 'choice':
      choiceFromId = data.fromId;
      document.getElementById('modal-choice').classList.add('active');
      break;
    case 'exchange':
      openCardChoiceModal(
        'Card Exchange! 🔄',
        'Choose 1 card to give in the exchange.',
        1, 'exchange', { exchangeWithId: data.fromId }
      );
      break;
  }
}

function openCardChoiceModal(title, desc, count, actionType, extraData) {
  const modal = document.getElementById('modal-choose-cards');
  document.getElementById('modal-cards-title').textContent = title;
  document.getElementById('modal-cards-desc').textContent = desc;
  
  modalSelectedCards = [];
  pendingAction = { actionType, count, extraData };
  
  const list = document.getElementById('modal-cards-list');
  list.innerHTML = '';
  
  gameState.myHand.forEach(card => {
    // Rule: Cannot exchange an Exchange card
    if (actionType === 'exchange' && card.name === 'Exchange') return;
    
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.type = card.type;
    div.dataset.cardId = card.id;
    div.innerHTML = `<img src="assets/cards/${card.name}.png" alt="${card.name}">`;
    div.addEventListener('click', () => {
      const idx = modalSelectedCards.indexOf(card.id);
      if (idx !== -1) {
        modalSelectedCards.splice(idx, 1);
        div.classList.remove('selected');
      } else if (modalSelectedCards.length < count) {
        modalSelectedCards.push(card.id);
        div.classList.add('selected');
      }
    });
    list.appendChild(div);
  });
  
  modal.classList.add('active');
}

function confirmCardSelection() {
  if (!pendingAction) return;
  const { actionType, count, extraData } = pendingAction;
  
  if (modalSelectedCards.length < Math.min(count, gameState.myHand.length)) {
    showToast(`Select ${count} card(s)`, 'error');
    return;
  }
  
  socket.emit('targetResponse', {
    actionType,
    cardIds: modalSelectedCards,
    ...extraData,
    choicePlayerId: extraData.stealerId || extraData.exchangeWithId || choiceFromId,
  });
  
  closeModal('modal-choose-cards');
  pendingAction = null;
  modalSelectedCards = [];
}

// ─── Choice response ────────────────────────────────────────
function choiceOption(option) {
  closeModal('modal-choice');
  if (option === 'give') {
    openCardChoiceModal(
      'Give 1 Card',
      'Choose 1 card to give.',
      1, 'choice', { choicePlayerId: choiceFromId, option: 'give' }
    );
  } else {
    openCardChoiceModal(
      'Discard 2 Cards',
      'Choose 2 cards to put at the bottom of the deck.',
      2, 'choice', { choicePlayerId: choiceFromId, option: 'discard' }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FRENZY
// ═══════════════════════════════════════════════════════════

function endFrenzy() {
  socket.emit('endFrenzy');
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.log-panel, .chat-panel').forEach(p => p.classList.remove('active'));
  
  if (tab === 'log') {
    document.querySelector('.sidebar-tab:first-child').classList.add('active');
    document.getElementById('log-panel').classList.add('active');
  } else {
    document.querySelector('.sidebar-tab:last-child').classList.add('active');
    document.getElementById('chat-panel').classList.add('active');
  }
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chatMessage', { message: msg });
  input.value = '';
}

// ═══════════════════════════════════════════════════════════
// GAME OVER
// ═══════════════════════════════════════════════════════════

function requestRestart() {
  document.getElementById('game-over-overlay').classList.remove('active');
  socket.emit('restartGame');
}

function backToLobby() {
  document.getElementById('game-over-overlay').classList.remove('active');
  leaveRoom();
}

// ═══════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════
// SOCKET EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

socket.on('roomJoined', ({ roomId, playerId }) => {
  myPlayerId = playerId;
  currentRoomId = roomId;
  showScreen('room-screen');
});

socket.on('roomList', (rooms) => {
  const list = document.getElementById('room-list');
  if (rooms.length === 0) {
    list.innerHTML = '<div class="no-rooms">No rooms available — create one!</div>';
    return;
  }
  list.innerHTML = '';
  rooms.filter(r => r.state === 'lobby').forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `
      <div class="room-info">
        <span class="room-id">${r.id}</span>
        <span class="room-meta">${r.playerCount}/${r.maxPlayers} players · Host: ${escapeHtml(r.host)}</span>
      </div>
      <button class="btn btn-secondary room-join-btn" onclick="joinRoom('${r.id}')">Join</button>
    `;
    list.appendChild(item);
  });
});

socket.on('gameState', (state) => {
  if (state.state === 'lobby') {
    showScreen('room-screen');
    renderWaitingRoom(state);
  } else if (state.state === 'playing') {
    showScreen('game-screen');
    renderGame(state);
  } else if (state.state === 'finished') {
    showScreen('game-screen');
    renderGame(state);
  }
});

socket.on('needResponse', (data) => {
  handleNeedResponse(data);
});

socket.on('gameOver', ({ winner }) => {
  const overlay = document.getElementById('game-over-overlay');
  const winnerName = gameState?.players.find(p => p.id === winner)?.name || 'Someone';
  document.getElementById('game-over-winner').textContent = `${winnerName} wins! 🎉`;
  overlay.classList.add('active');
});

socket.on('chatMessage', ({ sender, message }) => {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-sender">${escapeHtml(sender)}:</span> ${escapeHtml(message)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
});

socket.on('error', ({ message }) => {
  showToast(message, 'error');
});

socket.on('copycatSelect', ({ copiedCard }) => {
  showToast(`Copycat copied ${copiedCard}!`, 'success');
  // For copycat with target cards, open target modal
  if (TARGET_CARDS.includes(copiedCard)) {
    const fakeCard = { id: -1, name: copiedCard, type: 'Crazy' };
    openTargetModal(fakeCard);
  }
});

socket.on('exchangeSelect', ({ targetId }) => {
  openCardChoiceModal(
    'Exchange — Choose Your Card',
    'Choose 1 card to give in the exchange. Cannot exchange an Exchange card.',
    1, 'exchange', { exchangeWithId: targetId }
  );
});

socket.on('flipEffect', (data) => {
  showToast(`Flip reversed ${data.flippedCard}!`, 'success');
});

socket.on('disconnect', () => {
  showToast('Disconnected from server. Reconnecting...', 'error');
});

socket.on('connect', () => {
  if (currentRoomId) {
    showToast('Reconnected!', 'success');
  }
});

// ─── Keyboard shortcuts ─────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  }
});
