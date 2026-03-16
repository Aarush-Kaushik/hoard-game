/**
 * ============================================================
 * HOARD - Game Logic Module
 * ============================================================
 * All game rules implemented from game_overview.docx exactly.
 * 
 * CARD TYPES & COUNTS:
 *   Basic (4 each): Draw, Steal, Exchange
 *   Misery (4 each): Revenge, Blank, Choice  
 *   Advanced (4 each): Vaporize, Flip, Cancel
 *   Passive (4 each): Present, Shield, Raccoon
 *   Crazy (1 each): Frenzy, Disable, Copycat, Shuffle
 *   Total: 52 cards
 * 
 * TO ADD NEW CARDS: Add entry to CARD_DEFINITIONS, then handle
 * the ability in resolveCardAbility() in roomManager.js
 * ============================================================
 */

// ─── Card Definitions ───────────────────────────────────────
// Each card has: name, type, count in deck, description
const CARD_DEFINITIONS = {
  // BASIC CARDS (yellow) - 4 each
  Draw:     { type: 'Basic',    count: 4, desc: 'Pick up 2 random cards from the card stack.' },
  Steal:    { type: 'Basic',    count: 4, desc: 'Steal 2 cards from any player of choice.' },
  Exchange: { type: 'Basic',    count: 4, desc: 'Exchange one of your cards with another player. Cannot exchange another Exchange card.' },

  // MISERY CARDS (red/pink) - 4 each
  Revenge:  { type: 'Misery',   count: 4, desc: 'When stolen, 2 of the stealer\'s cards get transferred to you on their next turn.' },
  Blank:    { type: 'Misery',   count: 4, desc: 'Cancels the next card\'s ability. Does not affect Crazy or Passive cards. Only applies once.' },
  Choice:   { type: 'Misery',   count: 4, desc: 'Target player gives you 1 card OR puts 2 cards at the bottom of the card stack.' },

  // ADVANCED CARDS (blue) - 4 each
  Vaporize: { type: 'Advanced', count: 4, desc: 'Deletes 2 cards from any player of choice.' },
  Flip:     { type: 'Advanced', count: 4, desc: 'Flips the roles of the last card played. Does not work against Crazy, Passive, or multi-target cards.' },
  Cancel:   { type: 'Advanced', count: 4, desc: 'Skips any player of choice\'s turn.' },

  // PASSIVE CARDS (green) - 4 each
  Present:  { type: 'Passive',  count: 4, desc: 'Gives 2 cards from the card stack to any person of choice, including yourself.' },
  Shield:   { type: 'Passive',  count: 4, desc: 'You are protected from the next card played against you.' },
  Raccoon:  { type: 'Passive',  count: 4, desc: 'Every round, gain 1 random card from the stack. Max 3 cards gained. Only 1 Raccoon active at a time.' },

  // CRAZY CARDS (purple) - 1 each
  Frenzy:   { type: 'Crazy',    count: 1, desc: 'Play up to 3 additional cards this turn (not Crazy or Passive).' },
  Disable:  { type: 'Crazy',    count: 1, desc: 'Disables a card from being played again. All players with that card put it at the bottom of the stack.' },
  Copycat:  { type: 'Crazy',    count: 1, desc: 'Copies the ability of the last card played.' },
  Shuffle:  { type: 'Crazy',    count: 1, desc: 'Reshuffles everyone\'s cards. User cannot see. Everyone gets the same amount back.' },
};

// ─── Deck Builder ───────────────────────────────────────────
/** Builds a fresh 52-card deck array */
function buildDeck() {
  const deck = [];
  let id = 0;
  for (const [name, def] of Object.entries(CARD_DEFINITIONS)) {
    for (let i = 0; i < def.count; i++) {
      deck.push({ id: id++, name, type: def.type });
    }
  }
  return deck;
}

// ─── Fisher-Yates Shuffle ───────────────────────────────────
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Deal Cards ─────────────────────────────────────────────
/** 
 * Rule: Everyone gets 7 cards.
 * Returns { hands: { playerId: [card,...] }, deck: [remaining cards] }
 */
function dealCards(deck, playerIds) {
  const hands = {};
  playerIds.forEach(id => { hands[id] = []; });
  // Deal 7 cards to each player
  for (let i = 0; i < 7; i++) {
    for (const pid of playerIds) {
      if (deck.length > 0) {
        hands[pid].push(deck.pop());
      }
    }
  }
  return { hands, deck };
}

// ─── Draw from Stack ────────────────────────────────────────
/** Draw N cards from top of deck. Returns drawn cards array */
function drawFromStack(deck, count) {
  const drawn = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    drawn.push(deck.pop());
  }
  return drawn;
}

// ─── Delete Cards (put at bottom of stack) ──────────────────
/** Rule: When a card is deleted, it goes to the bottom of the card stack */
function deleteCards(cards, deck) {
  cards.forEach(c => deck.unshift(c)); // unshift = bottom of stack (pop from top)
}

// ─── Check Win / Elimination ────────────────────────────────
/** 
 * Rule: Game ends when someone gets 15+ cards. They WIN.
 * Rule: If someone has 0 cards at end of their turn, they are OUT.
 * Rule: If someone eliminates a player, eliminator gets 2 random cards as reward.
 */
function checkWinCondition(hands, playerId) {
  const hand = hands[playerId];
  if (hand && hand.length >= 15) return { type: 'win', playerId };
  return null;
}

function checkElimination(hands, playerId) {
  const hand = hands[playerId];
  return hand && hand.length === 0;
}

// ─── Exports ────────────────────────────────────────────────
module.exports = {
  CARD_DEFINITIONS,
  buildDeck,
  shuffleArray,
  dealCards,
  drawFromStack,
  deleteCards,
  checkWinCondition,
  checkElimination,
};
