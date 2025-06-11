// Constants for card and game rules
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANKS = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11,
    'Q': 12, 'K': 13, 'A': 14
};

// ------------------------------
// Game State Variables         
// ------------------------------
let deck = [];              // Cards in the deck
let players = [[], [], [], []]; // Player hands
let chips = [100, 100, 100, 100]; // Chip counts for each player
let currentBets = [0, 0, 0, 0]; // Current bets by each player
let pot = 0;                // Total pot amount
let communityCards = [];     // Cards on the table
let currentPlayer = 0;       // Index of the current player
let roundStage = 0;          // 0: pre-flop, 1: flop, 2: turn, 3: river
let sidePots = []; // Each side pot: {amount: number, eligiblePlayers: number[]}

// ------------------------------
// Betting Round State          
// ------------------------------
let bettingRoundActive = false; // Is a betting round in progress?
let currentBet = 0;         // The current amount to call
let lastToAct = -1;          // The last player who raised
let lastRaiseAmount = 0;      // The size of the last raise

// ------------------------------
// Action State               
// ------------------------------
const playerStates = [          // Tracked variables of the user
    { folded: false },
    { folded: false },
    { folded: false },
    { folded: false }
];
const playerHasActed = [false, false, false, false];  //Track players

// ------------------------------
// Bluffing State             
// ------------------------------
const bluffCount = { 0: 0, 1: 0, 2: 0, 3: 0 }; // Track bluff attempts by AI
const maxBluffsPerRound = 2;                  // Limit bluffs per AI per round

// ------------------------------
// Automated Gameplay Flags     
// ------------------------------
let isStartOfBettingRound = true;              // Flag to enable check at round start

// ------------------------------
// Awarding State               
// ------------------------------
let potHasBeenAwarded = false;                  // Ensures pot is only awarded once
let lastAwardedPotTransactionId = 0;          // Keep track and avoid repeat calls
let currentAwardTransactionId = 0;

function createDeck() {
  try {
    const d = [];
    for (const s of SUITS) {
      for (const v of VALUES) {
        d.push(v + s);
      }
    }
    console.log(`[GAME] Created deck with ${d.length} cards`);
    return d;
  } catch (error) {
    console.error("[ERROR] Failed to create deck:", error);
    // Return a fallback deck if creation fails
    return VALUES.flatMap(v => SUITS.map(s => v + s));
  }
}

function shuffle(deck) {
  try {
    if (!deck || !Array.isArray(deck) || deck.length < 2) {
      console.error("[ERROR] Invalid deck passed to shuffle:", deck);
      return;
    }
    
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    console.log(`[GAME] Deck shuffled successfully`);
  } catch (error) {
    console.error("[ERROR] Failed to shuffle deck:", error);
    // If shuffle fails, do a simpler shuffle as fallback
    if (deck && Array.isArray(deck)) {
      deck.sort(() => Math.random() - 0.5);
      console.log("[GAME] Used fallback shuffle method");
    }
  }
}

function dealInitialCards() {
  try {
    // Verify deck has enough cards
    if (!deck || deck.length < 8) {
      console.error("[ERROR] Not enough cards in deck to deal:", deck ? deck.length : 0);
      // Create and shuffle a new deck if needed
      deck = createDeck();
      shuffle(deck);
    }
    
    // Deal two cards to each player
    for (let i = 0; i < 4; i++) {
      const card1 = deck.pop();
      const card2 = deck.pop();
      
      if (!card1 || !card2) {
        throw new Error("Failed to pop cards from deck");
      }
      
      players[i] = [card1, card2];
    }
    
    console.log("[GAME] Initial cards dealt to all players");
  } catch (error) {
    console.error("[ERROR] Failed to deal initial cards:", error);
    // Emergency recovery - create new cards directly
    for (let i = 0; i < 4; i++) {
      // Generate random cards if dealing fails
      const suits = ['S', 'H', 'D', 'C'];
      const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
      const randomCards = [
        values[Math.floor(Math.random() * values.length)] + suits[Math.floor(Math.random() * suits.length)],
        values[Math.floor(Math.random() * values.length)] + suits[Math.floor(Math.random() * suits.length)]
      ];
      players[i] = randomCards;
    }
    console.log("[GAME] Used emergency card generation");
  }
}

// Initialize and handle the betting slider with minimum raise enforcement
function initializeBettingSlider() {
  try {
    const slider = document.getElementById('bet-slider');
    const valueDisplay = document.getElementById('bet-value-display');
    const confirmButton = document.getElementById('confirm-bet-btn');
    
    if (!slider || !valueDisplay || !confirmButton) {
      console.error("[ERROR] Betting slider elements not found!");
      return;
    }
    
    // Remove any existing event listeners by cloning and replacing elements
    const newSlider = slider.cloneNode(true);
    const newConfirmButton = confirmButton.cloneNode(true);
    
    if (slider.parentNode) slider.parentNode.replaceChild(newSlider, slider);
    if (confirmButton.parentNode) confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
    
    // Get the new references after replacement
    const updatedSlider = document.getElementById('bet-slider');
    const updatedConfirmButton = document.getElementById('confirm-bet-btn');
    
    if (!updatedSlider || !updatedConfirmButton) {
      console.error("[ERROR] Failed to update slider elements");
      return;
    }
    
    // Update display when slider changes
    updatedSlider.addEventListener('input', function() {
      try {
        // Ensure value doesn't go below minimum
        const minValue = parseInt(this.min) || 1;
        if (parseInt(this.value) < minValue) {
          this.value = minValue;
        }
        
        // Make sure value doesn't exceed max
        const maxValue = parseInt(this.max);
        if (parseInt(this.value) > maxValue) {
          this.value = maxValue;
        }
        
        valueDisplay.textContent = `Bet: $${this.value}`;
        
        // If this is a raise, update button text to show total bet
        if (currentBet > 0) {
          updatedConfirmButton.textContent = `Raise to $${parseInt(currentBets[3]) + parseInt(this.value)}`;
        } else {
          updatedConfirmButton.textContent = `Bet $${this.value}`;
        }
      } catch (err) {
        console.error("[ERROR] Error in slider input handler:", err);
      }
    });
    
    // Handle bet/raise button click
    updatedConfirmButton.addEventListener('click', function() {
      try {
        const betAmount = parseInt(updatedSlider.value, 10);
        
        if (currentPlayer !== 3) {
          updateInfo("It's not your turn!");
          return;
        }
        
        // Player has acted regardless of action
        playerHasActed[currentPlayer] = true;
        
        // Ensure bet amount is at least the minimum
        if (currentBet > 0) {
          const toCall = currentBet - currentBets[3];
          const minRaise = Math.max(lastRaiseAmount, 1);
          const minRaiseAmount = toCall + minRaise;
          
          if (betAmount < minRaiseAmount) {
            updateInfo(`Raise must be at least $${minRaiseAmount}!`);
            return;
          }
        }
        
        // Call the appropriate playerAction function
        playerAction('bet-slider');
      } catch (err) {
        console.error("[ERROR] Error in confirm button handler:", err);
      }
    });
    
    // Function to update slider based on player's chips and minimum raise
    function updateSliderMax() {
      try {
        const playerChips = Math.max(0, chips[3] || 0);
        
        // Calculate minimum raise if there's a current bet
        if (currentBet > 0) {
          const toCall = Math.max(0, currentBet - currentBets[3]);
          const minRaise = Math.max(lastRaiseAmount, 1);
          const minRaiseAmount = toCall + minRaise;
          
          // Set minimum value for the slider
          updatedSlider.min = minRaiseAmount;
          console.log(`[SLIDER] Setting minimum raise to ${minRaiseAmount}`);
          
          // Default value for raise (min raise + a bit more if chips allow)
          const defaultValue = Math.min(minRaiseAmount + Math.floor(minRaiseAmount * 0.5), playerChips);
          
          // Set max value based on player's chips
          updatedSlider.max = Math.max(playerChips, minRaiseAmount);
          
          // Ensure value is at least minimum and not more than max
          updatedSlider.value = Math.min(Math.max(defaultValue, minRaiseAmount), playerChips);
          
          // Update button text for raise
          updatedConfirmButton.textContent = `Raise to $${parseInt(currentBets[3]) + parseInt(updatedSlider.value)}`;
        } else {
          // For initial bet, allow any amount up to player's chips
          updatedSlider.min = 1;
          updatedSlider.max = playerChips;
          
          // Default to around 1/3 of the pot for initial bet
          const potSize = pot + currentBets.reduce((sum, bet) => sum + bet, 0);
          const defaultBet = Math.min(Math.max(Math.ceil(potSize * 0.3), 10), playerChips);
          
          updatedSlider.value = defaultBet;
          updatedConfirmButton.textContent = `Bet $${updatedSlider.value}`;
        }
        
        valueDisplay.textContent = `Bet: $${updatedSlider.value}`;
        
        // Enable/disable the button based on player's turn
        updatedConfirmButton.disabled = currentPlayer !== 3 || playerStates[3].folded;
        
        // Disable slider if player can't act
        updatedSlider.disabled = currentPlayer !== 3 || playerStates[3].folded;
      } catch (err) {
        console.error("[ERROR] Error in updateSliderMax:", err);
      }
    }
    
    // Initial update
    updateSliderMax();
    
    // Make update functions available globally
    window.updateBettingSlider = updateSliderMax;
    
    // Update slider when game state changes
    const originalUpdateChipsAndBets = updateChipsAndBets;
    updateChipsAndBets = function() {
      originalUpdateChipsAndBets();
      if (window.updateBettingSlider) window.updateBettingSlider();
    };
    
    const originalCheckBettingRoundEnd = checkBettingRoundEnd;
    checkBettingRoundEnd = function(latestActor) {
      originalCheckBettingRoundEnd(latestActor);
      if (currentPlayer === 3 && !playerStates[3].folded && window.updateBettingSlider) {
        window.updateBettingSlider();
      }
    };
    
    console.log("[UI] Betting slider initialized successfully");
  } catch (error) {
    console.error("[ERROR] Failed to initialize betting slider:", error);
  }
}



function startBettingRound() {
  console.log("\n=== STARTING BETTING ROUND ===");
  
  try {
    // Check if a betting round is already active
    if (bettingRoundActive) {
      console.warn("[GAME] Betting round already active. Forcing reset.");
    }
    
    // Mark as start of betting round and reset all betting state
    isStartOfBettingRound = true;
    bettingRoundActive = true;
    
    // Use the existing forceResetBettingState function which already does all the resets
    forceResetBettingState();
    
    // Additional reset for player actions
    for (let i = 0; i < 4; i++) {
      playerHasActed[i] = false;
    }
    
    // Clear the raise input field
    const raiseInput = document.getElementById('raise-input');
    if (raiseInput) {
      raiseInput.value = '';
    }

    // Update the betting slider if it exists
    if (window.updateBettingSlider) {
      try {
        window.updateBettingSlider();
      } catch (sliderError) {
        console.error("[ERROR] Failed to update betting slider:", sliderError);
      }
    }
    
    // Find first active player (not folded)
    const activePlayers = playerStates.filter(p => !p.folded).length;
    if (activePlayers < 2) {
      console.error("[ERROR] Not enough active players to start betting round");
      // Emergency fix - show the showdown if only one player remains
      if (activePlayers === 1) {
        setTimeout(() => showdown(), 500);
        return;
      }
    }
    
    // Find the first active player to start the round
    currentPlayer = findNextActivePlayer(-1);
    
    if (currentPlayer === -1) {
      console.error("[ERROR] No active players found to start the round");
      setTimeout(() => newGame(), 1000);
      return;
    }
    
    // Update UI to indicate whose turn it is
    updateInfo(currentPlayer, 'turn'); 
    
    // Enable buttons if it's the human player's turn
    if (currentPlayer === 3 && !playerStates[3].folded) {
      disableActionButtons(false);
    } else {
      // Have AI take their turn after a short delay
      setTimeout(() => {
        if (bettingRoundActive && !playerStates[currentPlayer].folded) {
          aiTakeTurn(currentPlayer);
        }
      }, 1000);
    }
    
    console.log(`[GAME] Started betting round with player ${currentPlayer + 1}`);
  } catch (error) {
    console.error("[ERROR] Failed to start betting round:", error);
    // Emergency recovery
    setTimeout(() => {
      // Force next round or showdown if we can't start betting
      if (roundStage < 3) {
        nextRound();
      } else {
        showdown();
      }
    }, 1000);
  }
}

/**
 * Updates the card display for both player and community cards
 * @param {boolean} revealAll - Whether to show all cards (for showdown)
 * @param {boolean} showAllIn - Whether to show cards of all-in players
 */
function showCards(revealAll = false, showAllIn = false) {
  try {
    // Render player cards
    for (let i = 0; i < 4; i++) {
      const container = document.getElementById(`player-${i+1}-cards`);
      if (!container) {
        console.error(`[ERROR] Card container for player ${i+1} not found`);
        continue;
      }
      
      // Clear container
      container.innerHTML = '';
      
      // Check if player has folded
      const hasFolded = playerStates[i].folded;
      
      // Check if player has cards
      if (!players[i] || !Array.isArray(players[i]) || players[i].length === 0) {
        console.warn(`[WARNING] Player ${i+1} has no cards to display`);
        // Add empty card backs as placeholder
        for (let j = 0; j < 2; j++) {
          const emptyCard = document.createElement('div');
          emptyCard.className = 'card card-back';
          emptyCard.style.backgroundColor = '#0057b7';
          container.appendChild(emptyCard);
        }
        continue;
      }
      
      // Check if we should show this player's cards:
      // - It's the human player (i === 3) and they're still active
      // - It's showdown and all cards are revealed
      // - The player is all-in and showAllIn is true
      // - The player has their cards explicitly marked as revealed
      const shouldReveal = 
        (i === 3 && !hasFolded) || 
        (revealAll && !hasFolded) ||
        (showAllIn && chips[i] === 0 && !hasFolded) ||
        (playerStates[i].cardsRevealed && !hasFolded);
      
      // Render each card
      players[i].forEach(card => {
        if (!card) {
          console.warn(`[WARNING] Null card found for player ${i+1}`);
          return;
        }
        
        const div = document.createElement('div');
        div.className = 'card';
        
        // Show cards face-up if conditions are met
        if (shouldReveal) {
          if (card.length < 2) {
            console.error(`[ERROR] Invalid card format: ${card}`);
            div.classList.add('card-error');
            div.textContent = '?';
          } else {
            const value = card[0];
            const suit = card[1];
            
            // Set suit class for proper coloring
            div.classList.add(suit === 'H' || suit === 'D' ? 'red-card' : 'black-card');
            div.textContent = value + getSuitSymbol(suit);
          }
        } else {
          // Show card back for opponents' cards or folded players
          div.textContent = '';
          div.classList.add('card-back');
          div.style.backgroundColor = '#0057b7';
        }
        
        container.appendChild(div);
      });
    }
    
    // Render community cards (unchanged from original)
    const commContainer = document.getElementById('community-cards');
    if (!commContainer) {
      console.error("[ERROR] Community cards container not found");
    } else {
      commContainer.innerHTML = '';
      
      if (!communityCards || !Array.isArray(communityCards)) {
        console.error("[ERROR] Community cards array is invalid");
      } else {
        communityCards.forEach(card => {
          if (!card) return;
          
          const div = document.createElement('div');
          div.className = 'card';
          
          if (card.length < 2) {
            console.error(`[ERROR] Invalid community card format: ${card}`);
            div.classList.add('card-error');
            div.textContent = '?';
          } else {
            const value = card[0];
            const suit = card[1];
            
            // Set suit class for proper coloring
            div.classList.add(suit === 'H' || suit === 'D' ? 'red-card' : 'black-card');
            div.textContent = value + getSuitSymbol(suit);
          }
          
          commContainer.appendChild(div);
        });
      }
    }
    
    console.log(`[UI] Cards displayed${revealAll ? ' (all revealed)' : ''}${showAllIn ? ' (all-in players revealed)' : ''}`);
  } catch (error) {
    console.error("[ERROR] Failed to show cards:", error);
  }
}

function getSuitSymbol(suit) {
  try {
    const suitMap = {
      'S': '♠',
      'H': '♥',
      'D': '♦',
      'C': '♣'
    };
    
    // Check if the suit is valid
    if (typeof suit !== 'string') {
      console.error(`[ERROR] Invalid suit type: ${typeof suit}`);
      return '?';
    }
    
    // Return the mapped symbol or the original suit as fallback
    const symbol = suitMap[suit] || suit;
    
    // Warn about unmapped suits
    if (!suitMap[suit]) {
      console.warn(`[WARNING] Unmapped suit symbol: ${suit}`);
    }
    
    return symbol;
  } catch (error) {
    console.error("[ERROR] Error in getSuitSymbol:", error);
    return '?'; // Return question mark as a safe fallback
  }
}

function getBestHand(cards) {
  try {
    // Input validation
    if (!cards || !Array.isArray(cards) || cards.length < 5) {
      console.error("[ERROR] Invalid cards input to getBestHand:", cards);
      return { rank: 0, name: "Invalid Hand", value: [] };
    }
    
    // Filter out any invalid cards
    const validCards = cards.filter(c => c && typeof c === 'string' && c.length >= 2);
    
    if (validCards.length < 5) {
      console.error("[ERROR] Not enough valid cards to form a hand:", validCards);
      return { rank: 0, name: "Invalid Hand", value: [] };
    }
    
    // Convert cards to objects: { value: 'A', suit: 'H' }
    const cardObjs = validCards.map(c => ({ value: c[0], suit: c[1] }));
    const valueOrder = '23456789TJQKA';
    const valueCount = {};
    const suitCount = {};

    // Count values and suits
    cardObjs.forEach(card => {
      valueCount[card.value] = (valueCount[card.value] || 0) + 1;
      suitCount[card.suit] = (suitCount[card.suit] || 0) + 1;
    });

    // Sort values by frequency, then by rank (for tiebreakers)
    const valuesByFreq = Object.entries(valueCount).sort((a, b) => {
      if (b[1] === a[1]) {
        return valueOrder.indexOf(b[0]) - valueOrder.indexOf(a[0]);
      }
      return b[1] - a[1];
    });

    // Get unique values sorted by rank (high to low)
    const sortedValues = [...new Set(cardObjs.map(c => c.value))]
      .sort((a, b) => valueOrder.indexOf(b) - valueOrder.indexOf(a));

    // Check for flush
    const flushSuit = Object.keys(suitCount).find(suit => suitCount[suit] >= 5);
    const flushCards = flushSuit
      ? cardObjs.filter(c => c.suit === flushSuit).map(c => c.value)
      : [];

    // Helper function to find a straight in a set of values
    function getStraight(vals) {
      if (!vals || vals.length < 5) return null;
      
      // Get indices in value order
      const idxs = vals.map(v => valueOrder.indexOf(v))
                      .filter(idx => idx !== -1) // Filter out invalid values
                      .sort((a, b) => b - a);     // Sort high to low
      
      // Check for regular straight
      for (let i = 0; i <= idxs.length - 5; i++) {
        if (idxs[i] - idxs[i + 4] === 4 &&
            new Set(idxs.slice(i, i + 5)).size === 5) {
          return idxs.slice(i, i + 5).map(i => valueOrder[i]);
        }
      }
      
      // Handle wheel straight A-2-3-4-5
      if (vals.includes('A') && vals.includes('2') && vals.includes('3') &&
          vals.includes('4') && vals.includes('5')) {
        return ['5', '4', '3', '2', 'A'];
      }
      
      return null;
    }

    // Evaluate hands from highest to lowest rank
    let handRank = 0;
    let handName = "High Card";
    let handValue = [];
    
    // 1. Straight Flush
    const flushStraight = flushCards.length >= 5 ? getStraight(flushCards) : null;
    if (flushStraight) {
      // Check for royal flush (A-K-Q-J-T)
      if (flushStraight[0] === 'A' && flushStraight[1] === 'K') {
        return { rank: 9, name: 'Royal Flush', value: flushStraight };
      }
      return { rank: 8, name: 'Straight Flush', value: flushStraight };
    }

    // 2. Four of a Kind
    if (valuesByFreq.length > 0 && valuesByFreq[0][1] === 4) {
      // Include kicker for Four of a Kind
      const kickers = sortedValues.filter(v => v !== valuesByFreq[0][0]).slice(0, 1);
      return { rank: 7, name: 'Four of a Kind', value: [valuesByFreq[0][0], ...kickers] };
    }
    
    // 3. Full House
    if (valuesByFreq.length > 1 && valuesByFreq[0][1] === 3 && valuesByFreq[1][1] >= 2) {
      return { rank: 6, name: 'Full House', value: [valuesByFreq[0][0], valuesByFreq[1][0]] };
    }
    
    // 4. Flush
    if (flushCards.length >= 5) {
      return { rank: 5, name: 'Flush', value: flushCards.slice(0, 5) };
    }
    
    // 5. Straight
    const straight = getStraight(sortedValues);
    if (straight) {
      return { rank: 4, name: 'Straight', value: straight };
    }
    
    // 6. Three of a Kind
    if (valuesByFreq.length > 0 && valuesByFreq[0][1] === 3) {
      // Include kickers for Three of a Kind
      const kickers = sortedValues.filter(v => v !== valuesByFreq[0][0]).slice(0, 2);
      return { rank: 3, name: 'Three of a Kind', value: [valuesByFreq[0][0], ...kickers] };
    }
    
    // 7. Two Pair
    if (valuesByFreq.length > 1 && valuesByFreq[0][1] === 2 && valuesByFreq[1][1] === 2) {
      // Include kicker for Two Pair
      const kickers = sortedValues.filter(v => v !== valuesByFreq[0][0] && v !== valuesByFreq[1][0]).slice(0, 1);
      return { rank: 2, name: 'Two Pair', value: [valuesByFreq[0][0], valuesByFreq[1][0], ...kickers] };
    }
    
    // 8. One Pair
    if (valuesByFreq.length > 0 && valuesByFreq[0][1] === 2) {
      // Include kickers for One Pair
      const kickers = sortedValues.filter(v => v !== valuesByFreq[0][0]).slice(0, 3);
      return { rank: 1, name: 'One Pair', value: [valuesByFreq[0][0], ...kickers] };
    }
    
    // 9. High Card
    return { rank: 0, name: 'High Card', value: sortedValues.slice(0, 5) };
    
  } catch (error) {
    console.error("[ERROR] Error in getBestHand:", error);
    return { rank: 0, name: "Error", value: [] };
  }
}

function showdown() {
  console.log("[GAME] SHOWDOWN: Evaluating hands and determining winner");
  try {
    // Disable player actions during showdown
    disableActionButtons(true);
    
    // Add all current bets to the pot before showdown (missed in original)
    for (let i = 0; i < 4; i++) {
      pot += currentBets[i];
      currentBets[i] = 0;
    }
    updateChipsAndBets(); // Update UI to reflect pot change
    
    // Make sure showdown isn't processed multiple times
    if (potHasBeenAwarded) {
      console.warn("[WARNING] Showdown called but pot already awarded");
      return;
    }
    
    // Reveal all cards for non-folded players
    showCards(true);
    
    // Only evaluate players who haven't folded
    const activePlayers = [];
    for (let i = 0; i < 4; i++) {
      if (!playerStates[i].folded) {
        activePlayers.push({ index: i });
      }
    }
    
    console.log(`[GAME] Active players in showdown: ${activePlayers.length}`);
    
    if (activePlayers.length === 0) {
      console.error("[ERROR] No active players in showdown - this shouldn't happen");
      // Emergency recovery - start new game with delay
      updateInfo("Error in showdown. Starting new game in 3 seconds...");
      setTimeout(() => {
        newGame();
      }, 3000);
      return;
    }
    
    if (activePlayers.length === 1) {
      // Only one player remains - they win uncontested
      const winnerIdx = activePlayers[0].index;
      console.log(`[GAME] Only one player left: Player ${winnerIdx + 1} wins uncontested`);
      
      // Move pot chips to the winner visually
      moveChipsFromPotToPlayer(winnerIdx);
      
      // Delay the pot award to allow for chip animation
      setTimeout(() => {
        awardPotToPlayer(winnerIdx, "uncontested");
      }, 1000);
      
      return; // awardPotToPlayer handles starting the next game
    }
    
    // Log the total pot amount at showdown
    console.log(`[GAME] Total pot at showdown: $${pot}`);
    
    // Evaluate each player's hand
    const playerScores = [];
    for (let playerData of activePlayers) {
      const i = playerData.index;
      
      // Skip players with incomplete hands
      if (!players[i] || players[i].length < 2) {
        console.error(`[ERROR] Player ${i + 1} has incomplete hand: ${players[i]}`);
        continue;
      }
      
      try {
        // Combine player's hole cards with community cards
        const fullHand = [...players[i], ...communityCards];
        console.log(`[GAME] Player ${i + 1} hand: ${fullHand.join(', ')}`);
        
        // Safety check for valid cards
        if (fullHand.length < 5) {
          console.error(`[ERROR] Not enough cards for hand evaluation: Player ${i + 1} has ${fullHand.length} cards`);
          continue;
        }
        
        // Get best 5-card hand using the getBestHand function
        const bestHand = getBestHand(fullHand);
        console.log(`[GAME] Player ${i + 1} best hand: ${bestHand.name} (${bestHand.value.join(', ')})`);
        
        // For backward compatibility, convert to score format expected by compareHands
        const score = [bestHand.rank, ...bestHand.value.map(v => RANKS[v] || 0)];
        
        playerScores.push({ 
          player: i, 
          score, 
          handName: bestHand.name,
          handValue: bestHand.value
        });
      } catch (handError) {
        console.error(`[ERROR] Failed to evaluate hand for Player ${i + 1}:`, handError);
      }
    }

    // Handle case where no valid hands could be evaluated
    if (playerScores.length === 0) {
      console.error("[ERROR] No valid hands to evaluate");
      updateInfo("Error evaluating hands. Starting new game in 3 seconds...");
      setTimeout(() => {
        newGame();
      }, 3000);
      return;
    }

    // Sort players by hand strength (best to worst)
    playerScores.sort((a, b) => {
      try {
        const result = compareHands(b.score, a.score);
        console.log(`[GAME] Comparing Player ${a.player + 1} (${a.handName}) vs Player ${b.player + 1} (${b.handName}): ${result}`);
        return result;
      } catch (compareError) {
        console.error("[ERROR] Error comparing hands:", compareError);
        return 0; // Default to tie on error
      }
    });

    console.log("[GAME] Players ranked by hand strength:");
    playerScores.forEach((p, idx) => {
      console.log(`[GAME] ${idx + 1}. Player ${p.player + 1}: ${p.handName}`);
    });

    // Find winners (may be multiple in case of tie)
    const bestScore = playerScores[0].score;
    const winners = [];
    
    for (const player of playerScores) {
      try {
        const comparison = compareHands(player.score, bestScore);
        const isWinner = comparison === 0;
        console.log(`[GAME] Checking if Player ${player.player + 1} is a winner: ${isWinner ? 'YES' : 'NO'}`);
        if (isWinner) {
          winners.push(player.player);
        }
      } catch (error) {
        console.error(`[ERROR] Error determining winner status for Player ${player.player + 1}:`, error);
      }
    }
    
    console.log(`[GAME] Winners: ${winners.map(w => w + 1).join(', ')}`);

    // Display results in UI
    let resultMessage = "SHOWDOWN RESULTS:\n";
    for (const player of playerScores) {
      const isWinner = winners.includes(player.player) ? " [WINNER]" : "";
      resultMessage += `Player ${player.player + 1}: ${player.handName}${isWinner}\n`;
    }
    updateInfo(resultMessage);
    
    // Award pot after a delay
    setTimeout(() => {
      if (winners.length === 1) {
        const winnerIdx = winners[0];
        const winningPlayer = playerScores.find(p => p.player === winnerIdx);
        const winningHand = winningPlayer ? winningPlayer.handName : 'winning hand';
        
        // Log the winner for debugging
        console.log(`[GAME] Single winner: Player ${winnerIdx + 1} with ${winningHand}`);
        
        // Move pot chips to the winner visually
        moveChipsFromPotToPlayer(winnerIdx);
        
        // Award pot to winner after chip animations complete
        setTimeout(() => {
          const awarded = awardPotToPlayer(winnerIdx, `with ${winningHand}`);
          if (!awarded) {
            // If awarding failed, force a new game as backup
            console.error("[ERROR] Failed to award pot, forcing new game");
            setTimeout(() => newGame(), 2000);
          }
        }, 1500); // Longer delay to ensure all animations finish
        
      } else if (winners.length > 1) {
        // Split pot on tie
        const splitAmount = Math.floor(pot / winners.length);
        const remainder = pot - (splitAmount * winners.length); // Handle remainder
        
        console.log(`[GAME] Splitting pot: $${pot} into ${winners.length} winners ($${splitAmount} each, remainder: $${remainder})`);
        
        // Distribute pot chips among winners
        const potChipDisplay = document.getElementById('pot-chips');
        if (potChipDisplay) {
          const allChips = Array.from(potChipDisplay.querySelectorAll('.chip'));
          const chipsPerWinner = Math.max(1, Math.floor(allChips.length / winners.length));
          
          // Move chips to each winner
          winners.forEach((winnerIdx, index) => {
            // Calculate chip range for this winner
            const startIdx = index * chipsPerWinner;
            const endIdx = (index === winners.length - 1) 
                          ? allChips.length  // Last winner gets remaining chips
                          : (index + 1) * chipsPerWinner;
            
            // Create a temporary array for this winner's chips
            const winnerChips = [];
            for (let i = startIdx; i < endIdx && i < allChips.length; i++) {
              winnerChips.push(allChips[i]);
            }
            
            // If we have chips to move, create a custom movement function for this subset
            if (winnerChips.length > 0) {
              setTimeout(() => {
                try {
                  moveSpecificChipsToPlayer(winnerChips, winnerIdx);
                } catch (error) {
                  console.error(`[ERROR] Failed to move chips to Player ${winnerIdx + 1}:`, error);
                }
              }, index * 300); // Stagger timing for winners
            }
          });
        }
        
        // Reset pot after awarding
        const oldPot = pot;
        pot = 0;
        
        // Award split amount to each winner
        winners.forEach((winner, index) => {
          // Award remainder to first winner (common practice)
          const extraAmount = (index === 0) ? remainder : 0;
          chips[winner] += splitAmount + extraAmount;
        });
        
        // Pot has been awarded
        potHasBeenAwarded = true;
        
        updateInfo(`Tie between players: ${winners.map(w => w + 1).join(', ')}. Each wins $${splitAmount}.`);
        updateChipsAndBets();
        
        // Schedule new game after a tie with countdown
        setTimeout(() => { 
          updateInfo(`Players split the pot ($${oldPot}). Starting new game in 2 seconds...`);
        }, 2000);
        
        setTimeout(() => { 
          updateInfo(`Players split the pot. Starting new game in 1 second...`);
        }, 3000);
        
        setTimeout(() => {
          newGame();
        }, 4000);
      }
    }, 1500);
  } catch (error) {
    console.error("[ERROR] Error during showdown:", error);
    updateInfo("An error occurred during showdown. Starting new game in 3 seconds...");
    
    // Auto-start new game even on error
    setTimeout(() => {
      newGame();
    }, 3000);
  }
}

// Helper function to move specific chips to a player
function moveSpecificChipsToPlayer(chips, playerIndex) {
  try {
    const playerChipDisplay = document.querySelector(`#player-${playerIndex + 1} .chip-display`);
    
    // Validation
    if (!playerChipDisplay) {
      console.error(`[ERROR] Player ${playerIndex + 1} chip display not found`);
      return;
    }
    
    if (!chips || !Array.isArray(chips) || chips.length === 0) {
      console.warn(`[WARNING] No chips to move to Player ${playerIndex + 1}`);
      return;
    }
    
    console.log(`[ANIMATION] Moving ${chips.length} specific chips to Player ${playerIndex + 1}`);
    
    // Get the player position for animation
    let playerRect;
    try {
      playerRect = playerChipDisplay.getBoundingClientRect();
    } catch (rectError) {
      console.error(`[ERROR] Failed to get player ${playerIndex + 1} position:`, rectError);
      // Fallback to adding chips directly without animation
      chips.forEach(chip => {
        if (!chip) return;
        
        const newPlayerChip = document.createElement('div');
        const colorClass = chip.className.match(/chip\s+(\w+)/);
        newPlayerChip.className = `chip ${colorClass ? colorClass[1] : 'red'}`;
        playerChipDisplay.appendChild(newPlayerChip);
      });
      return;
    }
    
    // Create container for animations to better manage them
    const animationContainer = document.createElement('div');
    animationContainer.id = `chip-animation-container-${Date.now()}`;
    animationContainer.style.position = 'fixed';
    animationContainer.style.top = '0';
    animationContainer.style.left = '0';
    animationContainer.style.width = '100%';
    animationContainer.style.height = '100%';
    animationContainer.style.pointerEvents = 'none';
    animationContainer.style.zIndex = '9999';
    document.body.appendChild(animationContainer);
    
    // Keep track of animation clones to ensure cleanup
    const animationClones = [];
    
    // Animate each chip
    chips.forEach((chip, i) => {
      if (!chip) return;
      
      try {
        let chipRect;
        
        // Check if chip is a valid DOM element
        if (!chip.getBoundingClientRect) {
          console.warn(`[WARNING] Invalid chip at index ${i}:`, chip);
          return;
        }
        
        try {
          chipRect = chip.getBoundingClientRect();
        } catch (rectError) {
          console.warn(`[WARNING] Could not get chip position at index ${i}:`, rectError);
          return;
        }
        
        // Create a visual clone for animation
        const chipClone = document.createElement('div');
        chipClone.className = chip.className + ' moving-chip';
        chipClone.style.position = 'fixed';
        chipClone.style.left = `${chipRect.left}px`;
        chipClone.style.top = `${chipRect.top}px`;
        chipClone.style.width = `${chipRect.width}px`;
        chipClone.style.height = `${chipRect.height}px`;
        chipClone.style.zIndex = '1000';
        
        // Add to animation container instead of body
        animationContainer.appendChild(chipClone);
        animationClones.push(chipClone);
        
        // Remove the original chip with staggered timing
        setTimeout(() => {
          try {
            if (chip.parentNode) {
              chip.remove();
            }
          } catch (removeError) {
            console.warn(`[WARNING] Failed to remove original chip:`, removeError);
          }
        }, i * 50);
        
        // Animate to player position with staggered timing
        setTimeout(() => {
          try {
            chipClone.style.transition = 'all 0.6s ease-out';
            chipClone.style.left = `${playerRect.left + (playerRect.width/2) - (chipRect.width/2)}px`;
            chipClone.style.top = `${playerRect.top + (i % 5) * 5}px`;
          } catch (transitionError) {
            console.warn(`[WARNING] Failed to start chip animation:`, transitionError);
            
            // Remove failed animation
            if (chipClone.parentNode) {
              chipClone.remove();
            }
          }
          
          // After animation completes
          setTimeout(() => {
            try {
              // Remove animation clone
              if (chipClone.parentNode) {
                chipClone.remove();
              }
              
              // Add a new chip to the player if the display still exists
              if (playerChipDisplay.isConnected) {
                const newPlayerChip = document.createElement('div');
                // Extract color class from original chip class
                const colorClass = chip.className.match(/chip\s+(\w+)/);
                newPlayerChip.className = `chip ${colorClass ? colorClass[1] : 'red'}`;
                playerChipDisplay.appendChild(newPlayerChip);
                
                // Limit player chips
                const playerChips = playerChipDisplay.querySelectorAll('.chip');
                if (playerChips.length > 12) {
                  if (playerChipDisplay.firstChild) {
                    playerChipDisplay.removeChild(playerChipDisplay.firstChild);
                  }
                }
              }
            } catch (finalError) {
              console.error(`[ERROR] Final step of chip animation failed:`, finalError);
            }
          }, 600);
        }, 100 + i * 100);
      } catch (chipError) {
        console.error(`[ERROR] Failed to animate chip at index ${i}:`, chipError);
      }
    });
    
    // Clean up the animation container after all animations should be complete
    setTimeout(() => {
      try {
        // Force remove any remaining clone elements
        animationClones.forEach(clone => {
          if (clone.parentNode) {
            clone.remove();
          }
        });
        
        // Remove the container
        if (animationContainer.parentNode) {
          animationContainer.remove();
        }
      } catch (cleanupError) {
        console.error(`[ERROR] Failed to clean up chip animations:`, cleanupError);
      }
    }, chips.length * 100 + 1000);
    
  } catch (error) {
    console.error(`[ERROR] Error in moveSpecificChipsToPlayer:`, error);
  }
}

function updatePot() {
  try {
    // Calculate the visible pot (current pot + all current bets)
    let visiblePot = pot;
    
    // Safety check for pot value
    if (typeof pot !== 'number' || isNaN(pot)) {
      console.error(`[ERROR] Invalid pot value: ${pot}, resetting to 0`);
      pot = 0;
      visiblePot = 0;
    }
    
    // Add all current bets to the visible pot
    let totalBets = 0;
    for (let i = 0; i < 4; i++) {
      // Validate each bet amount
      if (typeof currentBets[i] !== 'number' || isNaN(currentBets[i])) {
        console.error(`[ERROR] Invalid bet for Player ${i+1}: ${currentBets[i]}, resetting to 0`);
        currentBets[i] = 0;
      } else if (currentBets[i] < 0) {
        console.error(`[ERROR] Negative bet for Player ${i+1}: ${currentBets[i]}, resetting to 0`);
        currentBets[i] = 0;
      }
      
      visiblePot += currentBets[i];
      totalBets += currentBets[i];
    }
    
    // Get the pot element
    const potElement = document.getElementById('pot');
    if (!potElement) {
      console.error(`[ERROR] Pot display element not found`);
      return;
    }
    
    // Set the pot display to show the total potential pot
    potElement.textContent = visiblePot;
    
    // Also update pot chips visual if available
    updatePotChipsVisual(visiblePot);
    
    console.log(`[UI] Pot display updated: $${visiblePot} (base pot: $${pot}, current bets: $${totalBets})`);
  } catch (error) {
    console.error(`[ERROR] Failed to update pot display:`, error);
  }
}

// Helper function to update pot chips visual representation
function updatePotChipsVisual(potAmount) {
  try {
    const potChipsContainer = document.getElementById('pot-chips');
    if (!potChipsContainer) return; // Not all versions may have this element
    
    // Only update visuals if the amount has changed significantly
    const currentChipCount = potChipsContainer.querySelectorAll('.chip').length;
    const desiredChipCount = Math.min(15, Math.ceil(potAmount / 10)); // Limit to 15 chips max
    
    // If we already have enough chips, don't change anything
    if (Math.abs(currentChipCount - desiredChipCount) < 2) return;
    
    // Clear existing chips if there's a big difference
    if (Math.abs(currentChipCount - desiredChipCount) > 5) {
      potChipsContainer.innerHTML = '';
    }
    
    // Add or remove chips to match desired count
    const chipColors = ['red', 'blue', 'green', 'black', 'white'];
    
    if (currentChipCount < desiredChipCount) {
      // Add more chips
      for (let i = currentChipCount; i < desiredChipCount; i++) {
        const chip = document.createElement('div');
        chip.className = `chip ${chipColors[i % chipColors.length]}`;
        potChipsContainer.appendChild(chip);
      }
    } else if (currentChipCount > desiredChipCount) {
      // Remove excess chips
      const chips = potChipsContainer.querySelectorAll('.chip');
      for (let i = desiredChipCount; i < currentChipCount; i++) {
        if (chips[i] && chips[i].parentNode) {
          chips[i].remove();
        }
      }
    }
  } catch (error) {
    console.warn(`[WARNING] Failed to update pot chips visual:`, error);
    // Non-critical error, can continue without visual update
  }
}

function updateChipsAndBets() {
  try {
    // Validate chip and bet values before updating UI
    for (let i = 0; i < 4; i++) {
      // Ensure chips are valid numbers
      if (typeof chips[i] !== 'number' || isNaN(chips[i])) {
        console.error(`[ERROR] Invalid chip value for Player ${i+1}: ${chips[i]}, resetting to 0`);
        chips[i] = 0;
      }
      
      // Ensure chips are not negative
      if (chips[i] < 0) {
        console.error(`[ERROR] Negative chips for Player ${i+1}: ${chips[i]}, resetting to 0`);
        chips[i] = 0;
      }
      
      // Ensure bets are valid numbers
      if (typeof currentBets[i] !== 'number' || isNaN(currentBets[i])) {
        console.error(`[ERROR] Invalid bet for Player ${i+1}: ${currentBets[i]}, resetting to 0`);
        currentBets[i] = 0;
      }
      
      // Ensure bets are not negative
      if (currentBets[i] < 0) {
        console.error(`[ERROR] Negative bet for Player ${i+1}: ${currentBets[i]}, resetting to 0`);
        currentBets[i] = 0;
      }
      
      // Update the UI elements if they exist
      const chipElement = document.getElementById(`player-${i+1}-chips`);
      if (chipElement) {
        chipElement.textContent = chips[i];
      } else {
        console.warn(`[WARNING] Chip display element for Player ${i+1} not found`);
      }
      
      const betElement = document.getElementById(`player-${i+1}-bet`);
      if (betElement) {
        betElement.textContent = currentBets[i];
      } else {
        console.warn(`[WARNING] Bet display element for Player ${i+1} not found`);
      }
    }

    // Validate pot value
    if (typeof pot !== 'number' || isNaN(pot)) {
      console.error(`[ERROR] Invalid pot value: ${pot}, resetting to 0`);
      pot = 0;
    }
    
    // Ensure pot is not negative
    if (pot < 0) {
      console.error(`[ERROR] Negative pot: ${pot}, resetting to 0`);
      pot = 0;
    }

    // Update the pot display
    const potElement = document.getElementById('pot');
    if (potElement) {
      potElement.textContent = pot;
    } else {
      console.warn(`[WARNING] Pot display element not found`);
    }
    
    // Use the dedicated function to update pot visuals
    updatePot();
    
    // Update betting slider if it exists
    if (window.updateBettingSlider) {
      try {
        window.updateBettingSlider();
      } catch (sliderError) {
        console.error(`[ERROR] Failed to update betting slider:`, sliderError);
      }
    }
    
    console.log(`[UI] === Chips and Bets Updated ===`);
    console.log(`[GAME] Current bet: $${currentBet}`);
    console.log(`[GAME] Player bets: ${JSON.stringify(currentBets)}`);
    console.log(`[GAME] Pot: $${pot}`);
  } catch (error) {
    console.error(`[ERROR] Failed to update chips and bets:`, error);
  }
}

function forceResetBettingState() {
  console.log("[GAME] === FORCE RESETTING BETTING STATE ===");
  
  try {
    // Log current state before reset
    console.log(`[GAME] Previous state - currentBet: $${currentBet}, lastRaiseAmount: $${lastRaiseAmount}, lastToAct: ${lastToAct}`);
    console.log(`[GAME] Previous player bets: ${JSON.stringify(currentBets)}`);
    
    // Store any non-zero bets to add to pot if needed
    let totalBetsToTransfer = 0;
    for (let i = 0; i < 4; i++) {
      if (typeof currentBets[i] === 'number' && !isNaN(currentBets[i]) && currentBets[i] > 0) {
        totalBetsToTransfer += currentBets[i];
      }
    }
    
    // If there are outstanding bets, consider adding them to pot
    if (totalBetsToTransfer > 0) {
      console.log(`[GAME] Warning: Resetting with $${totalBetsToTransfer} in outstanding bets`);
      // Optionally add to pot - uncomment if needed
      // pot += totalBetsToTransfer;
      // console.log(`[GAME] Added $${totalBetsToTransfer} to pot from reset bets`);
    }
    
    // Reset all betting-related variables
    currentBet = 0;
    lastRaiseAmount = 0;
    lastToAct = -1;
    
    // Reset all player bets and action flags
    for (let i = 0; i < 4; i++) {
      currentBets[i] = 0;
      playerHasActed[i] = false;
    }
    
    // Reset the start of betting round flag
    isStartOfBettingRound = true;
    
    // Set betting round active if it wasn't already
    if (!bettingRoundActive) {
      console.log("[GAME] Setting betting round active during forced reset");
      bettingRoundActive = true;
    }
    
    // Log new state after reset
    console.log("[GAME] Betting state forcibly reset");
    console.log(`[GAME] New state - currentBet: $${currentBet}, lastRaiseAmount: $${lastRaiseAmount}, lastToAct: ${lastToAct}`);
    console.log(`[GAME] New player bets: ${JSON.stringify(currentBets)}`);
    
    // Update UI to reflect changes
    updateChipsAndBets();
    
    // Check if betting slider needs to be updated
    if (window.updateBettingSlider) {
      try {
        window.updateBettingSlider();
      } catch (sliderError) {
        console.error("[ERROR] Failed to update betting slider during reset:", sliderError);
      }
    }
    
    return true; // Indicate successful reset
  } catch (error) {
    console.error("[ERROR] Failed to force reset betting state:", error);
    
    // Emergency reset in case of failure
    currentBet = 0;
    lastRaiseAmount = 0;
    lastToAct = -1;
    
    for (let i = 0; i < 4; i++) {
      currentBets[i] = 0;
      playerHasActed[i] = false;
    }
    
    updateChipsAndBets();
    return false; // Indicate failed reset (though we did emergency reset)
  }
}

function updateInfo(playerIndexOrMessage, action = null, amount = null) {
  try {
    // Find the info element
    const infoElement = document.getElementById('info');
    if (!infoElement) {
      console.error("[ERROR] Info element not found in DOM");
      return;
    }
    
    let message = '';
    
    // Debug output to help diagnose issues
    console.log(`[INFO] updateInfo called with:`, { playerIndexOrMessage, action, amount });
    
    // If only one string parameter is passed, use it as a direct message
    if (typeof playerIndexOrMessage === 'string' && action === null) {
      message = playerIndexOrMessage;
      console.log(`[INFO] Direct message: ${message}`);
    } else {
      // Validate player index
      const playerIndex = playerIndexOrMessage;
      if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex > 3) {
        console.error(`[ERROR] Invalid player index: ${playerIndex}`);
        message = "Game in progress..."; // Fallback message
      } else {
        // Convert player index to name (player 4 is "You")
        const playerName = playerIndex === 3 ? "You" : `Player ${playerIndex + 1}`;
        
        // Format based on action
        console.log(`[INFO] Processing action: ${action || 'null'} for ${playerName}`);
        
        // Ensure amount is properly formatted when needed
        let formattedAmount = amount;
        if (action === 'call' || action === 'bet' || action === 'raise' || action === 'allin') {
          if (typeof amount !== 'number' && amount !== null) {
            try {
              formattedAmount = parseInt(amount);
              if (isNaN(formattedAmount)) {
                formattedAmount = 0;
              }
            } catch (e) {
              console.warn(`[WARNING] Could not parse amount: ${amount}`);
              formattedAmount = 0;
            }
          }
        }
        
        switch(action) {
          case 'check':
            message = `${playerName} checked.`;
            break;
          case 'call':
            message = `${playerName} called $${formattedAmount}.`;
            break;
          case 'bet':
            message = `${playerName} bet $${formattedAmount}.`;
            break;
          case 'raise':
            message = `${playerName} raised to $${formattedAmount}.`;
            break;
          case 'fold':
            message = `${playerName} folded.`;
            break;
          case 'allin':
            message = `${playerName} went ALL IN with $${formattedAmount}!`;
            break;
          case 'win':
            if (amount) {
              message = `${playerName} won ${amount}.`;
            } else {
              message = `${playerName} won the pot.`;
            }
            break;
          case 'turn':
            message = `${playerName}'s turn to act.`;
            break;
          case 'showdown':
            message = `Showdown! All players reveal their cards.`;
            break;
          case 'newgame':
            message = `New game started. ${playerName}'s turn.`;
            break;
          case 'deal':
            if (amount === 'flop') message = `Dealing the flop...`;
            else if (amount === 'turn') message = `Dealing the turn...`;
            else if (amount === 'river') message = `Dealing the river...`;
            else message = `Dealing cards...`;
            break;
          case null:
          case undefined:
            message = `${playerName}'s turn.`;
            break;
          default:
            // For custom messages with player context
            message = `${playerName} ${action}${formattedAmount !== null ? ' ' + formattedAmount : ''}.`;
        }
      }
    }
    
    console.log(`[INFO] Final message: ${message}`);
    
    // Sanitize the message to prevent XSS (except for intentional newlines)
    const sanitizeHtml = (str) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
    
    // Handle multi-line text safely
    if (message.includes('\n')) {
      // For multi-line text, replace newlines with <br> after sanitizing
      const sanitizedMessage = sanitizeHtml(message);
      infoElement.innerHTML = sanitizedMessage.replace(/\n/g, '<br>');
    } else {
      // For single line, use textContent which is safer
      infoElement.textContent = message;
    }
    
    // Optional: Highlight new messages with brief animation
    infoElement.classList.remove('message-update');
    void infoElement.offsetWidth; // Force reflow
    infoElement.classList.add('message-update');
    
  } catch (error) {
    console.error("[ERROR] Failed to update info message:", error);
    // Try direct DOM manipulation as last resort
    try {
      const infoElement = document.getElementById('info');
      if (infoElement) {
        infoElement.textContent = "Game in progress...";
      }
    } catch (e) {
      // Give up silently
    }
  }
}

function resetBets() {
  try {
    console.log("[GAME] Resetting all player bets");
    
    // Store total bets for logging
    let totalBets = currentBets.reduce((sum, bet) => sum + (isNaN(bet) ? 0 : bet), 0);
    
    // Reset bets for all players
    for (let i = 0; i < 4; i++) {
      const previousBet = currentBets[i];
      currentBets[i] = 0;
      
      // Log individual bet resets, especially if non-zero
      if (previousBet !== 0) {
        console.log(`[GAME] Reset Player ${i+1} bet from $${previousBet} to $0`);
      }
    }
    
    // Update UI to reflect bet changes
    updateChipsAndBets();
    
    console.log(`[GAME] All bets reset (total prior bets: $${totalBets})`);
    
    // Reset current bet amount since all bets are now 0
    if (currentBet !== 0) {
      const prevCurrentBet = currentBet;
      currentBet = 0;
      console.log(`[GAME] Reset current bet from $${prevCurrentBet} to $0`);
    }
    
    // Update betting slider if it exists
    if (window.updateBettingSlider) {
      try {
        window.updateBettingSlider();
      } catch (sliderError) {
        console.error("[ERROR] Failed to update betting slider after reset:", sliderError);
      }
    }
    
    return true; // Indicate successful reset
  } catch (error) {
    console.error("[ERROR] Failed to reset bets:", error);
    
    // Emergency reset in case of failure
    for (let i = 0; i < 4; i++) {
      currentBets[i] = 0;
    }
    currentBet = 0;
    
    // Try to update UI even after error
    try {
      updateChipsAndBets();
    } catch (uiError) {
      console.error("[ERROR] Failed to update UI after bet reset error:", uiError);
    }
    
    return false; // Indicate failed reset
  }
}

function handRankToName(rank) {
  try {
    // Ensure the rank is a number
    const numRank = Number(rank);
    
    // Check if parsing resulted in a valid number
    if (isNaN(numRank)) {
      console.error(`[ERROR] Invalid hand rank: ${rank} (not a number)`);
      return 'Unknown';
    }
    
    // Define the complete ranking map including Royal Flush
    const rankMap = {
      9: 'Royal Flush',
      8: 'Straight Flush',
      7: 'Four of a Kind',
      6: 'Full House',
      5: 'Flush',
      4: 'Straight',
      3: 'Three of a Kind',
      2: 'Two Pair',
      1: 'One Pair',
      0: 'High Card'
    };
    
    // Get the name from the map or default to 'Unknown'
    const handName = rankMap[numRank] || 'Unknown';
    
    // Log warning for unknown ranks
    if (handName === 'Unknown') {
      console.warn(`[WARNING] Converted unknown hand rank: ${rank} to 'Unknown'`);
    }
    
    return handName;
  } catch (error) {
    console.error(`[ERROR] Failed to convert hand rank to name:`, error);
    return 'Unknown';
  }
}

function nextRound() {
  console.log("\n=== NEXT ROUND STARTING ===");
  
  // Transfer all bets to the pot
  for (let i = 0; i < 4; i++) {
    pot += currentBets[i];
    currentBets[i] = 0;
  }
  
  // Set flag to indicate we're starting a new betting round
  isStartOfBettingRound = true;
  
  // Reset the pot awarded flag
  potHasBeenAwarded = false;
  lastAwardedPotTransactionId = 0;
  
  console.log(`Pot is now $${pot}`);
  
  // DO NOT CLEAR EXISTING POT CHIPS - Keep them throughout the hand
  
  // Handle different stages of the game
  if (roundStage === 0) {
    // Deal the flop
    communityCards.push(deck.pop(), deck.pop(), deck.pop());
    showCards();
    updateInfo('deal', null, 'flop'); // UPDATED
    roundStage = 1;
  } else if (roundStage === 1) {
    // Deal the turn
    communityCards.push(deck.pop());
    showCards();
    updateInfo('deal', null, 'turn'); // UPDATED
    roundStage = 2;
  } else if (roundStage === 2) {
    // Deal the river
    communityCards.push(deck.pop());
    showCards();
    updateInfo('deal', null, 'river'); // UPDATED
    roundStage = 3;
  } else {
    // End of hand - showdown
    updateInfo("Round complete. Starting showdown..."); // Direct message
    
    setTimeout(() => {
      showdown();
    }, 1000);
    return;
  }

  // Check if we should run out all remaining cards instead of normal betting
  if (shouldRunOutCards()) {
    console.log("[GAME] Detected all-in situation at start of new round");
    runOutRemainingCards();
    return;
  }
  
  // Reset bluff counts for new round
  for (let i = 0; i < 4; i++) {
    bluffCount[i] = 0;
  }
  
  // Start the new betting round - this will handle bet resets and UI updates
  startBettingRound();
  
  // Update UI with the newly dealt cards
  showCards();
}

function handleFold(playerIndex) {
  try {
    // Validate player index
    if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex > 3) {
      console.error(`[ERROR] Invalid player index in handleFold: ${playerIndex}`);
      return false;
    }
    
    // Check if player has already folded
    if (playerStates[playerIndex].folded) {
      console.warn(`[WARNING] Player ${playerIndex + 1} already folded`);
      return false;
    }
    
    console.log(`[GAME] Player ${playerIndex + 1} is folding`);
    
    // Mark player as folded
    playerStates[playerIndex].folded = true;
    playerHasActed[playerIndex] = true;
    
    // Update info display
    updateInfo(playerIndex, 'fold');
    
    try {
      // Visually indicate fold
      const playerElement = document.getElementById(`player-${playerIndex + 1}`);
      if (playerElement) {
        playerElement.classList.add('folded');
      }
      
      // Hide their cards
      const cardContainer = document.getElementById(`player-${playerIndex + 1}-cards`);
      if (cardContainer) {
        cardContainer.innerHTML = '';
        // Add blank card backs
        for (let i = 0; i < 2; i++) {
          const back = document.createElement('div');
          back.classList.add('card', 'card-back');
          back.style.backgroundColor = '#0057b7';
          cardContainer.appendChild(back);
        }
      }
    } catch (uiError) {
      console.error(`[ERROR] Failed to update UI for Player ${playerIndex + 1} fold:`, uiError);
      // Non-critical error, continue with game logic
    }
    
    // If it's the user, disable their action buttons
    if (playerIndex === 3) {
      disableActionButtons(true);
      
      // Also update the betting slider if it exists
      if (window.updateBettingSlider) {
        try {
          window.updateBettingSlider();
        } catch (sliderError) {
          console.error("[ERROR] Failed to update betting slider after fold:", sliderError);
        }
      }
    }
    
    // Check how many players are still active
    const activePlayers = [];
    for (let i = 0; i < 4; i++) {
      if (!playerStates[i].folded) {
        activePlayers.push({ index: i });
      }
    }
    
    console.log(`[GAME] Active players after fold: ${activePlayers.length}`);
    
    if (activePlayers.length === 1) {
      // Only one player left - they win uncontested
      const winnerIndex = activePlayers[0].index;
      console.log(`[GAME] Only one player left: Player ${winnerIndex + 1}`);
      
      // Safety check - ensure all bets are moved to pot before awarding
      let additionalChips = 0;
      for (let i = 0; i < 4; i++) {
        if (currentBets[i] > 0) {
          additionalChips += currentBets[i];
          currentBets[i] = 0;
        }
      }
      
      if (additionalChips > 0) {
        pot += additionalChips;
        console.log(`[GAME] Added $${additionalChips} from outstanding bets to pot before award`);
      }
      
      // Try to move chips visually before award
      try {
        moveChipsFromPotToPlayer(winnerIndex);
      } catch (moveError) {
        console.error("[ERROR] Failed to move chips visually:", moveError);
      }
      
      // Award pot with a delay to allow animation
      setTimeout(() => {
        try {
          const awarded = awardPotToPlayer(winnerIndex, "uncontested");
          
          if (awarded) {
            // End the hand completely
            try {
              const communityContainer = document.getElementById('community-cards');
              if (communityContainer) {
                communityContainer.innerHTML = '';
              }
              showCards(false);
            } catch (clearError) {
              console.error("[ERROR] Failed to clear community cards:", clearError);
            }
            
            console.log(`[GAME] Fold complete - hand ended due to uncontested win`);
            return true;
          } else {
            console.error("[ERROR] Failed to award pot after fold");
            // Continue with game as fallback
          }
        } catch (awardError) {
          console.error("[ERROR] Exception in awardPotToPlayer:", awardError);
          // Continue with game as fallback
        }
      }, 1000);
      
      return true; // Hand is over, don't continue to next player
    }
    
    // Continue the game
    console.log(`[GAME] Continuing after fold from Player ${playerIndex + 1}`);
    
    // Check if this ends the betting round
    try {
      checkBettingRoundEnd(playerIndex);
    } catch (checkError) {
      console.error("[ERROR] Error in checkBettingRoundEnd after fold:", checkError);
      
      // Emergency recovery - find next active player
      currentPlayer = findNextActivePlayer(playerIndex);
      
      if (currentPlayer === 3 && !playerStates[3].folded) {
        disableActionButtons(false);
      } else if (currentPlayer !== -1) {
        setTimeout(() => aiTakeTurn(currentPlayer), 1000);
      } else {
        // No active players? This shouldn't happen after the earlier check
        console.error("[ERROR] No active players found after fold");
        setTimeout(() => newGame(), 2000);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`[ERROR] Failed to handle fold for Player ${playerIndex + 1}:`, error);
    
    // Emergency recovery - mark player as folded anyway
    if (playerIndex >= 0 && playerIndex <= 3) {
      playerStates[playerIndex].folded = true;
      playerHasActed[playerIndex] = true;
    }
    
    // Try to recover game state
    setTimeout(() => {
      try {
        currentPlayer = findNextActivePlayer(playerIndex);
        if (currentPlayer >= 0) {
          updateInfo(currentPlayer, 'turn');
          
          if (currentPlayer === 3 && !playerStates[3].folded) {
            disableActionButtons(false);
          } else {
            setTimeout(() => aiTakeTurn(currentPlayer), 1000);
          }
        } else {
          // No active players - try showdown or new game
          setTimeout(() => newGame(), 2000);
        }
      } catch (recoveryError) {
        console.error("[ERROR] Failed to recover from fold error:", recoveryError);
        setTimeout(() => newGame(), 2000);
      }
    }, 1000);
    
    return false;
  }
}

// Helper function for going to next player
function goToNextPlayer(currentIdx) {
  try {
    // Check if betting round is active
    if (!bettingRoundActive) {
      console.log("[GAME] Not moving to next player - betting round not active");
      return false;
    }
    
    // Validate current index
    if (typeof currentIdx !== 'number' || currentIdx < -1 || currentIdx > 3) {
      console.error(`[ERROR] Invalid current player index in goToNextPlayer: ${currentIdx}`);
      currentIdx = currentPlayer; // Use current player as fallback
    }
    
    // Find next active (non-folded) player
    const previousPlayer = currentPlayer;
    currentPlayer = findNextActivePlayer(currentIdx);
    
    if (currentPlayer === -1) {
      console.error("[ERROR] No active players found when moving to next player");
      
      // Check how many active players remain
      const activePlayers = playerStates.filter(p => !p.folded).length;
      
      if (activePlayers <= 1) {
        // Game should end with showdown or uncontested win
        console.log("[GAME] Only one or no players remain active - ending hand");
        setTimeout(() => showdown(), 1000);
        return false;
      } else {
        // This shouldn't happen if there are multiple active players
        console.error("[ERROR] Multiple active players but findNextActivePlayer returned -1");
        
        // Emergency fallback - find first non-folded player
        for (let i = 0; i < 4; i++) {
          if (!playerStates[i].folded) {
            currentPlayer = i;
            break;
          }
        }
        
        if (currentPlayer === -1) {
          // Still no valid player - force a new game
          console.error("[ERROR] Could not recover valid player - forcing new game");
          setTimeout(() => newGame(), 2000);
          return false;
        }
      }
    }
    
    console.log(`[GAME] Moving from Player ${currentIdx + 1} to Player ${currentPlayer + 1}`);
    
    // Update the information display
    updateInfo(currentPlayer, 'turn');
    
    // Enable or disable action buttons based on whose turn it is
    if (currentPlayer === 3 && !playerStates[3].folded) {
      disableActionButtons(false);
      
      // Update betting slider for human player
      if (window.updateBettingSlider) {
        try {
          window.updateBettingSlider();
        } catch (sliderError) {
          console.error("[ERROR] Failed to update betting slider:", sliderError);
        }
      }
    } else if (!playerStates[currentPlayer].folded) {
      // Make sure human buttons are disabled when it's AI turn
      disableActionButtons(true);
      
      // Schedule AI's turn with a reasonable delay
      setTimeout(() => {
        try {
          // Check if betting round is still active before AI acts
          if (bettingRoundActive && currentPlayer === currentPlayer && !playerStates[currentPlayer].folded) {
            aiTakeTurn(currentPlayer);
          } else {
            console.log(`[GAME] Skipping AI turn - conditions changed before timeout`);
          }
        } catch (aiError) {
          console.error(`[ERROR] AI turn failed:`, aiError);
          
          // Emergency recovery - move to next player
          goToNextPlayer(currentPlayer);
        }
      }, 1000);
    }
    
    return true;
  } catch (error) {
    console.error("[ERROR] Failed to move to next player:", error);
    
    // Emergency recovery - try to find next player
    try {
      if (currentPlayer >= 0 && currentPlayer <= 3) {
        const nextPlayer = findNextActivePlayer(currentPlayer);
        if (nextPlayer !== -1) {
          currentPlayer = nextPlayer;
          
          // Update UI
          updateInfo(currentPlayer, 'turn');
          
          if (currentPlayer === 3) {
            disableActionButtons(false);
          } else {
            setTimeout(() => aiTakeTurn(currentPlayer), 1000);
          }
          
          return true;
        }
      }
      
      // If recovery failed, try to continue game somehow
      console.error("[ERROR] Could not find next player during recovery");
      setTimeout(() => checkBettingRoundEnd(currentIdx), 1000);
      
      return false;
    } catch (recoveryError) {
      console.error("[ERROR] Failed to recover from goToNextPlayer error:", recoveryError);
      return false;
    }
  }
}

function updateUI() {
  try {
    console.log("[UI] Updating all game interface elements");
    
    // Update player chips and bets
    for (let i = 0; i < 4; i++) {
      try {
        // Ensure chip values are valid numbers
        if (typeof chips[i] !== 'number' || isNaN(chips[i])) {
          console.error(`[ERROR] Invalid chip value for Player ${i+1}: ${chips[i]}, resetting to 0`);
          chips[i] = 0;
        }
        
        // Ensure chip values are not negative
        if (chips[i] < 0) {
          console.error(`[ERROR] Negative chips for Player ${i+1}: ${chips[i]}, resetting to 0`);
          chips[i] = 0;
        }
        
        // Update the chip display
        const chipElement = document.getElementById(`player-${i + 1}-chips`);
        if (chipElement) {
          chipElement.textContent = chips[i];
        } else {
          console.warn(`[WARNING] Chip display element for Player ${i+1} not found`);
        }
        
        // Ensure bet values are valid numbers
        if (typeof currentBets[i] !== 'number' || isNaN(currentBets[i])) {
          console.error(`[ERROR] Invalid bet for Player ${i+1}: ${currentBets[i]}, resetting to 0`);
          currentBets[i] = 0;
        }
        
        // Ensure bet values are not negative
        if (currentBets[i] < 0) {
          console.error(`[ERROR] Negative bet for Player ${i+1}: ${currentBets[i]}, resetting to 0`);
          currentBets[i] = 0;
        }
        
        // Update the bet display
        const betElement = document.getElementById(`player-${i + 1}-bet`);
        if (betElement) {
          betElement.textContent = currentBets[i];
        } else {
          console.warn(`[WARNING] Bet display element for Player ${i+1} not found`);
        }
        
        // Update visual state of player
        const playerElement = document.getElementById(`player-${i + 1}`);
        if (playerElement) {
          // Clear and re-apply any state classes
          if (playerStates[i].folded) {
            playerElement.classList.add('folded');
          } else {
            playerElement.classList.remove('folded');
          }
          
          // Add active class to current player
          if (i === currentPlayer) {
            playerElement.classList.add('active');
          } else {
            playerElement.classList.remove('active');
          }
        }
      } catch (playerError) {
        console.error(`[ERROR] Failed to update UI for Player ${i+1}:`, playerError);
        // Continue with other players even if one fails
      }
    }
    
    // Update pot value
    try {
      // Validate pot value
      if (typeof pot !== 'number' || isNaN(pot)) {
        console.error(`[ERROR] Invalid pot value: ${pot}, resetting to 0`);
        pot = 0;
      }
      
      // Ensure pot is not negative
      if (pot < 0) {
        console.error(`[ERROR] Negative pot: ${pot}, resetting to 0`);
        pot = 0;
      }
      
      // Update the pot display
      const potElement = document.getElementById("pot");
      if (potElement) {
        potElement.textContent = pot;
      } else {
        console.warn(`[WARNING] Pot display element not found`);
      }
    } catch (potError) {
      console.error(`[ERROR] Failed to update pot display:`, potError);
    }
    
    // Update community cards display
    try {
      showCards(false);
    } catch (cardsError) {
      console.error(`[ERROR] Failed to update card display:`, cardsError);
    }
    
    // Update betting slider if it exists
    if (window.updateBettingSlider) {
      try {
        window.updateBettingSlider();
      } catch (sliderError) {
        console.error(`[ERROR] Failed to update betting slider:`, sliderError);
      }
    }
    
    // Update buttons based on current player
    try {
      if (currentPlayer === 3 && !playerStates[3].folded) {
        disableActionButtons(false);
      } else {
        disableActionButtons(true);
      }
    } catch (buttonsError) {
      console.error(`[ERROR] Failed to update action buttons:`, buttonsError);
    }
    
    // Update pot chips visual display
    try {
      updatePot();
    } catch (potChipsError) {
      console.error(`[ERROR] Failed to update pot chips display:`, potChipsError);
    }
    
    console.log("[UI] User interface update complete");
    return true;
  } catch (error) {
    console.error("[ERROR] Critical failure updating UI:", error);
    
    // Try minimal emergency update
    try {
      updateChipsAndBets();
    } catch (e) {
      console.error("[ERROR] Even emergency UI update failed:", e);
    }
    
    return false;
  }
}

function findPreviousActivePlayer(startIndex) {
  try {
    // Validate start index
    if (typeof startIndex !== 'number') {
      console.error(`[ERROR] Invalid startIndex in findPreviousActivePlayer: ${startIndex}`);
      startIndex = currentPlayer; // Fall back to current player
    }
    
    // Normalize index to 0-3 range
    startIndex = ((startIndex % 4) + 4) % 4;
    
    // Check if there are any active players
    const activePlayers = playerStates.filter(p => !p.folded).length;
    if (activePlayers === 0) {
      console.error("[ERROR] No active players found in findPreviousActivePlayer");
      return -1; // Return invalid index
    }
    
    // Find previous non-folded player
    let idx = startIndex;
    let loopCounter = 0; // Safety counter to prevent infinite loops
    
    do {
      idx = (idx + 1) % 4; // Go forward
      loopCounter++;
      
      // Safety check for infinite loop
      if (loopCounter > 4) {
        console.error("[ERROR] Infinite loop detected in findPreviousActivePlayer");
        
        // Emergency fallback - return first non-folded player
        for (let i = 0; i < 4; i++) {
          if (!playerStates[i].folded) {
            return i;
          }
        }
        return -1; // No active players found
      }
    } while (playerStates[idx].folded);
    
    console.log(`[GAME] Previous active player from ${startIndex + 1} is Player ${idx + 1}`);
    return idx;
  } catch (error) {
    console.error("[ERROR] Exception in findPreviousActivePlayer:", error);
    
    // Emergency fallback - try to find any active player
    try {
      for (let i = 0; i < 4; i++) {
        if (!playerStates[i].folded) {
          return i;
        }
      }
    } catch (fallbackError) {
      console.error("[ERROR] Fallback in findPreviousActivePlayer also failed:", fallbackError);
    }
    
    return -1; // Return invalid index if all else fails
  }
}

function handleCheck(playerIndex) {
  try {
    // Validate player index
    if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex > 3) {
      console.error(`[ERROR] Invalid player index in handleCheck: ${playerIndex}`);
      return false;
    }
    
    // Check if player has folded
    if (playerStates[playerIndex].folded) {
      console.warn(`[WARNING] Player ${playerIndex + 1} cannot check - player has folded`);
      return false;
    }
    
    // Fix: Use currentBets array instead of undefined playerBets
    // Can only check if no bet to call
    if (currentBets[playerIndex] < currentBet) {
      updateInfo(`Player ${playerIndex + 1} cannot check - there's a bet to call!`);
      console.warn(`[WARNING] Player ${playerIndex + 1} cannot check - current bet is $${currentBet}, player has bet $${currentBets[playerIndex]}`);
      return false;
    }
    
    // Check if it's the player's turn
    if (currentPlayer !== playerIndex) {
      console.warn(`[WARNING] Player ${playerIndex + 1} cannot check - not their turn`);
      return false;
    }
    
    console.log(`[GAME] Player ${playerIndex + 1} checking`);
    
    // Mark player as having acted
    playerHasActed[playerIndex] = true;
    
    // Update info display
    updateInfo(playerIndex, 'check');
    
    // Record this action for AI to respond to
    if (window.lastPlayerAction !== undefined) {
      window.lastPlayerAction = {
        player: playerIndex,
        action: 'check'
      };
    }
    
    // Special handling for start of betting round
    if (isStartOfBettingRound && playerIndex === currentPlayer) {
      isStartOfBettingRound = false;
      console.log(`[GAME] No longer start of betting round after Player ${playerIndex + 1} check`);
    }
    
    // Check if this ends the betting round
    try {
      checkBettingRoundEnd(playerIndex);
    } catch (endCheckError) {
      console.error("[ERROR] Error in checkBettingRoundEnd after check:", endCheckError);
      
      // Emergency recovery - go to next player
      try {
        goToNextPlayer(playerIndex);
      } catch (nextPlayerError) {
        console.error("[ERROR] Failed to go to next player after check recovery:", nextPlayerError);
        
        // Last resort - find next player manually
        currentPlayer = findNextActivePlayer(playerIndex);
        if (currentPlayer === 3 && !playerStates[3].folded) {
          disableActionButtons(false);
        } else if (currentPlayer !== -1 && !playerStates[currentPlayer].folded) {
          setTimeout(() => aiTakeTurn(currentPlayer), 1000);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`[ERROR] Failed to handle check for Player ${playerIndex + 1}:`, error);
    
    // Try to recover by going to next player
    try {
      goToNextPlayer(playerIndex);
    } catch (recoveryError) {
      console.error("[ERROR] Check recovery also failed:", recoveryError);
    }
    
    return false;
  }
}

/**
 * Handles when a player goes all-in (bets all their remaining chips)
 * @param {number} playerIndex - The index of the player going all-in (0-3)
 * @param {boolean} isRaise - Whether this all-in is part of a raise action
 * @returns {number} - The amount bet in the all-in
 */
function handleAllIn(playerIndex, isRaise = false) {
  try {
    // Validate player index
    if (playerIndex < 0 || playerIndex > 3) {
      console.error(`[ERROR] Invalid player index in handleAllIn: ${playerIndex}`);
      return 0;
    }
    
    // Get player's remaining chips
    const allInAmount = chips[playerIndex];
    
    if (allInAmount <= 0) {
      console.error(`[ERROR] Player ${playerIndex + 1} has no chips to go all-in with`);
      return 0;
    }
    
    console.log(`[GAME] Player ${playerIndex + 1} going ALL IN with $${allInAmount}`);
    
    // Place the bet (actual chip movement happens here)
    const amountBet = placeBet(playerIndex, allInAmount);
    
    // Update UI to show all-in status
    updateInfo(playerIndex, 'allin', amountBet);
    
    // Animate chips moving to pot
    moveChipsToPot(playerIndex, amountBet);
    
    // If this all-in is larger than the current bet, it becomes the new bet to match
    // but only for players who have enough chips to match it
    if (currentBets[playerIndex] > currentBet) {
      // This all-in raises the stakes
      if (isRaise) {
        lastRaiseAmount = currentBets[playerIndex] - currentBet;
        lastToAct = playerIndex;
      }
      
      currentBet = currentBets[playerIndex];
      console.log(`[GAME] All-in sets new current bet: $${currentBet}`);
    }
    
    // Add visual indication that player is all-in
    try {
      const playerElement = document.getElementById(`player-${playerIndex + 1}`);
      if (playerElement) {
        playerElement.classList.add('all-in');
      }
    } catch (uiError) {
      console.warn(`[WARNING] Failed to update UI for all-in: ${uiError}`);
    }
    
    return amountBet;
  } catch (error) {
    console.error(`[ERROR] Failed to handle all-in for Player ${playerIndex + 1}:`, error);
    return 0;
  }
}

function handleCall(playerIndex) {
  if (playerStates[playerIndex].folded) return false;
  
  const toCall = currentBet - currentBets[playerIndex];
  
  console.log(`handleCall for Player ${playerIndex + 1}: toCall = ${toCall}`);
  
  if (toCall <= 0) {
    // Nothing to call, treat as check
    console.log(`Nothing to call - treating as check`);
    updateInfo(playerIndex, 'check');
    return true;
  }
  
  if (toCall >= chips[playerIndex]) {
    // Not enough to call - go all-in
    console.log(`Not enough to call - going all-in`);
    return handleAllIn(playerIndex, false);
  } else {
    // Regular call
    console.log(`Regular call of ${toCall}`);
    placeBet(playerIndex, toCall);
    updateInfo(playerIndex, 'call', toCall);
    moveChipsToPot(playerIndex, toCall);
  }

  // Update UI
  updateChipsAndBets();
  return true;
}

/**
 * Adds visual indication that a player is all-in
 * @param {number} playerIndex - Index of the player who is all-in
 */
function addAllInIndicator(playerIndex) {
  try {
    const playerElement = document.getElementById(`player-${playerIndex + 1}`);
    if (!playerElement) return;
    
    // Add all-in class
    playerElement.classList.add('all-in');
    
    // Create an all-in indicator if it doesn't exist
    if (!playerElement.querySelector('.all-in-indicator')) {
      const indicator = document.createElement('div');
      indicator.className = 'all-in-indicator';
      indicator.textContent = 'ALL IN';
      playerElement.appendChild(indicator);
      
      // Add fade-in animation
      setTimeout(() => {
        indicator.classList.add('visible');
      }, 50);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to add all-in indicator for Player ${playerIndex + 1}:`, error);
  }
}

function updateActionButtons() {
  try {
    console.log("[UI] Updating action button states");
    
    // Check if it's the human player's turn and they haven't folded
    const yourTurn = currentPlayer === 3 && !playerStates[3].folded;
    
    // Get all action buttons
    const buttons = {
      raise: document.getElementById('raise-btn'),
      call: document.getElementById('call-btn'),
      check: document.getElementById('check-btn'),
      bet: document.getElementById('bet-btn'),
      fold: document.getElementById('fold-btn'),
      confirm: document.getElementById('confirm-bet-btn')
    };
    
    // Check which buttons exist in the DOM
    const missingButtons = [];
    for (const [name, element] of Object.entries(buttons)) {
      if (!element) {
        missingButtons.push(name);
        delete buttons[name]; // Remove from our collection
      }
    }
    
    if (missingButtons.length > 0) {
      console.warn(`[WARNING] Some action buttons not found: ${missingButtons.join(', ')}`);
    }
    
    // Calculate bet-specific states
    let canCheck = false;
    let canCall = false;
    let canBet = false;
    let canRaise = false;
    
    // Only calculate states if it's the player's turn
    if (yourTurn) {
      const playerBetAmount = currentBets[3];
      
      // Player can check if they've already matched the current bet
      canCheck = playerBetAmount >= currentBet;
      
      // Player can call if there's a bet to call
      canCall = currentBet > playerBetAmount && chips[3] > 0;
      
      // Player can bet if there's no current bet and they have chips
      canBet = currentBet === 0 && chips[3] > 0;
      
      // Player can raise if there's an existing bet and they have enough chips for minimum raise
      const minRaiseAmount = Math.max(lastRaiseAmount, 1);
      const toCall = currentBet - playerBetAmount;
      const totalNeededToRaise = toCall + minRaiseAmount;
      canRaise = currentBet > 0 && chips[3] >= totalNeededToRaise;
    }
    
    // Update standard buttons (raise, call, check, bet, fold)
    for (const [name, button] of Object.entries(buttons)) {
      if (!button) continue;
      
      // Default to disabled
      button.disabled = true;
      
      if (yourTurn) {
        // Enable/disable based on specific conditions
        switch (name) {
          case 'raise':
            button.disabled = !canRaise;
            break;
          case 'call':
            button.disabled = !canCall;
            break;
          case 'check':
            button.disabled = !canCheck;
            break;
          case 'bet':
            button.disabled = !canBet;
            break;
          case 'fold':
            // Can always fold unless it's free to check
            button.disabled = canCheck && currentBet === 0;
            break;
          case 'confirm':
            // Enable if it's player's turn and they have chips
            button.disabled = chips[3] <= 0;
            break;
        }
      }
      
      // Add visual classes for enabled/disabled
      if (button.disabled) {
        button.classList.add('disabled');
      } else {
        button.classList.remove('disabled');
      }
    }
    
    // Update betting slider if it exists
    if (window.updateBettingSlider) {
      try {
        window.updateBettingSlider();
      } catch (sliderError) {
        console.error("[ERROR] Failed to update betting slider:", sliderError);
      }
    }
    
    // Visual indication of player's turn
    const playerElement = document.getElementById('player-4'); // Human player
    if (playerElement) {
      if (yourTurn) {
        playerElement.classList.add('active-turn');
      } else {
        playerElement.classList.remove('active-turn');
      }
    }
    
    console.log(`[UI] Button states updated - Player turn: ${yourTurn}, Can check: ${canCheck}, Can call: ${canCall}, Can bet: ${canBet}, Can raise: ${canRaise}`);
    return true;
  } catch (error) {
    console.error("[ERROR] Failed to update action buttons:", error);
    
    // Emergency fallback - try to set all buttons based on turn only
    try {
      const yourTurn = currentPlayer === 3 && !playerStates[3].folded;
      const buttonIds = ['raise-btn', 'call-btn', 'check-btn', 'bet-btn', 'fold-btn', 'confirm-bet-btn'];
      
      for (const id of buttonIds) {
        const button = document.getElementById(id);
        if (button) {
          button.disabled = !yourTurn;
        }
      }
    } catch (fallbackError) {
      console.error("[ERROR] Even button fallback failed:", fallbackError);
    }
    
    return false;
  }
}

function handleRaise(playerIndex, raiseAmount) {
  if (playerStates[playerIndex].folded) return false;

  // Calculate minimum raise amount
  const toCall = currentBet - currentBets[playerIndex]; // Amount needed to match current bet
  const minRaiseAmount = Math.max(lastRaiseAmount, 1); // Minimum raise is at least the last raise or 1 chip
  
  // Total required includes call amount plus the raise amount
  const totalRequired = toCall + raiseAmount;
  
  // Check if the raise meets minimum requirements
  if (raiseAmount < minRaiseAmount && currentBet > 0) {
    console.log(`Invalid raise: ${raiseAmount} is less than minimum ${minRaiseAmount}`);
    updateInfo(`Raise must be at least $${minRaiseAmount}!`); // Direct message
    return false;
  }
  
  // Check for all-in raise
  if (totalRequired >= chips[playerIndex]) {
    // Going all-in instead of a standard raise
    return handleAllIn(playerIndex, true);
  }

  // Place the bet
  placeBet(playerIndex, totalRequired);
  
  // Update the current bet and track this raise amount
  const newBet = currentBets[playerIndex];
  const actualRaiseAmount = newBet - currentBet;
  currentBet = newBet;
  lastRaiseAmount = actualRaiseAmount; // Track the size of this raise
  
  console.log(`Player ${playerIndex + 1} raised by ${actualRaiseAmount} to ${currentBet}`);
  
  lastToAct = playerIndex; // This player becomes the last to act

  updateInfo(playerIndex, 'raise', currentBet); // Show final bet amount
  
  moveChipsToPot(playerIndex, totalRequired);

  // Update UI
  updateChipsAndBets();
  
  return true;
}

/**
 * Checks if the game should run out the remaining cards without further betting
 * @returns {boolean} - True if all-in showdown should occur
 */
function shouldRunOutCards() {
  try {
    console.log("[GAME] Checking if we should run out remaining cards without betting");
    
    // Get active (non-folded) players
    const activePlayers = [];
    for (let i = 0; i < 4; i++) {
      if (!playerStates[i].folded) {
        activePlayers.push({
          index: i, 
          chips: chips[i],
          bet: currentBets[i]
        });
      }
    }
    
    // Not enough players to continue
    if (activePlayers.length <= 1) {
      return false; // Will be handled by normal showdown
    }
    
    // Check if all active players but one are all-in
    const allInPlayers = activePlayers.filter(p => p.chips === 0);
    
    // Skip if no all-in players
    if (allInPlayers.length === 0) {
      return false;
    }
    
    // If everyone remaining is all-in, or all but one player is all-in, 
    // and all bets are called, run out cards
    const nonAllInCount = activePlayers.length - allInPlayers.length;
    const betsMatched = activePlayers.every(p => {
      // Player has put in all their chips (all-in)
      if (p.chips === 0) return true;
      
      // Or player has matched the current bet
      return p.bet === currentBet;
    });
    
    // All-in showdown happens when:
    // 1. All active players are all-in, or
    // 2. All but one player is all-in AND all bets have been matched
    const shouldRun = (nonAllInCount === 0) || 
                       (nonAllInCount === 1 && betsMatched);
    
    console.log(`[GAME] Run out remaining cards? ${shouldRun} (${allInPlayers.length} all-in players, ${nonAllInCount} with chips, bets matched: ${betsMatched})`);
    
    return shouldRun;
  } catch (error) {
    console.error("[ERROR] Error in shouldRunOutCards:", error);
    return false; // Default to normal play on error
  }
}

/**
 * Runs out all remaining community cards without further betting
 */
function runOutRemainingCards() {
  try {
    console.log("[GAME] Running out all remaining cards without further betting");
    
    // Collect all bets to the pot
    for (let i = 0; i < 4; i++) {
      pot += currentBets[i];
      currentBets[i] = 0;
    }
    
    // Reset betting state
    bettingRoundActive = false;
    
    // Update UI to display "Running out cards..." message
    updateInfo("All-in! Running out remaining community cards...");
    
    // Show all player cards who are all-in
    showAllInPlayerCards();
    
    // Figure out which cards we need to deal based on current stage
    let cardsToAdd = 0;
    let delayMultiplier = 1;
    
    switch (roundStage) {
      case 0: // Pre-flop - need to deal flop, turn, and river
        cardsToAdd = 5;
        break;
      case 1: // Flop - need to deal turn and river
        cardsToAdd = 2;
        break;
      case 2: // Turn - need to deal river
        cardsToAdd = 1;
        break;
      case 3: // River - all cards already dealt
        cardsToAdd = 0;
        break;
    }
    
    // If we need to add cards, do so with animation
    if (cardsToAdd > 0) {
      let newStage = roundStage;
      
      // Deal the flop (3 cards) if needed
      if (roundStage === 0) {
        setTimeout(() => {
          // Deal the flop (3 cards)
          updateInfo('deal', null, 'flop');
          communityCards.push(deck.pop(), deck.pop(), deck.pop());
          newStage = 1;
          showCards();
        }, 1000 * delayMultiplier++);
      }
      
      // Deal the turn if needed
      if (roundStage <= 1) {
        setTimeout(() => {
          updateInfo('deal', null, 'turn');
          communityCards.push(deck.pop());
          newStage = 2;
          showCards();
        }, 1000 * delayMultiplier++);
      }
      
      // Deal the river if needed
      if (roundStage <= 2) {
        setTimeout(() => {
          updateInfo('deal', null, 'river');
          communityCards.push(deck.pop());
          newStage = 3;
          showCards();
        }, 1000 * delayMultiplier++);
      }
      
      // Set to final round stage
      roundStage = 3;
      
      // Show final message before showdown
      setTimeout(() => {
        updateInfo("All cards dealt. Going to showdown...");
      }, 1000 * delayMultiplier++);
      
      // Go to showdown after all cards are dealt
      setTimeout(() => {
        showdown();
      }, 1000 * delayMultiplier + 1000);
    } else {
      // All cards are already dealt, go straight to showdown
      setTimeout(() => {
        showdown();
      }, 1000);
    }
  } catch (error) {
    console.error("[ERROR] Error in runOutRemainingCards:", error);
    
    // Emergency recovery - try to get to showdown
    setTimeout(() => {
      try {
        // Make sure we've added all required cards
        while (communityCards.length < 5 && deck.length > 0) {
          communityCards.push(deck.pop());
        }
        showdown();
      } catch (e) {
        console.error("[ERROR] Failed emergency card dealing:", e);
        setTimeout(() => newGame(), 2000);
      }
    }, 1000);
  }
}

/**
 * Shows the cards of all players who are all-in
 */
function showAllInPlayerCards() {
  try {
    console.log("[GAME] Revealing cards for all-in players");
    
    // Look for players who are all-in
    for (let i = 0; i < 4; i++) {
      // Skip folded players
      if (playerStates[i].folded) continue;
      
      // Check if player is all-in (has no chips)
      if (chips[i] === 0) {
        console.log(`[GAME] Player ${i + 1} is all-in, revealing cards`);
        
        // Mark this player as having revealed cards
        if (!playerStates[i].cardsRevealed) {
          playerStates[i].cardsRevealed = true;
          
          // Add visual indicator that cards are revealed
          try {
            const playerElement = document.getElementById(`player-${i + 1}`);
            if (playerElement) {
              playerElement.classList.add('cards-revealed');
            }
          } catch (uiError) {
            console.warn(`[WARNING] UI update for card reveal failed:`, uiError);
          }
        }
      }
    }
    
    // Update the card display to show revealed cards
    showCards(false, true); // Use a second parameter to show all-in player cards
  } catch (error) {
    console.error("[ERROR] Failed to show all-in player cards:", error);
  }
}

function findNextActivePlayer(startIndex) {
  try {
    // Validate start index
    if (typeof startIndex !== 'number') {
      console.error(`[ERROR] Invalid startIndex in findNextActivePlayer: ${startIndex}`);
      startIndex = currentPlayer >= 0 ? currentPlayer : 0; // Fall back to current player or 0
    }
    
    // Normalize index to 0-3 range
    startIndex = ((startIndex % 4) + 4) % 4;
    
    // Check if there are any active players
    const activePlayers = playerStates.filter(p => !p.folded).length;
    if (activePlayers === 0) {
      console.error("[ERROR] No active players found in findNextActivePlayer");
      return -1; // Return invalid index
    }
    
    // Find next non-folded player
    let idx = startIndex;
    let loopCounter = 0; // Safety counter to prevent infinite loops
    
    do {
      idx = (idx + 1) % 4; // Go forward
      loopCounter++;
      
      // Safety check for infinite loop
      if (loopCounter > 4) {
        console.error("[ERROR] Infinite loop detected in findNextActivePlayer");
        
        // Emergency fallback - return first non-folded player
        for (let i = 0; i < 4; i++) {
          if (!playerStates[i].folded) {
            console.log(`[GAME] Emergency fallback - returning Player ${i + 1} as next active`);
            return i;
          }
        }
        return -1; // No active players found
      }
    } while (playerStates[idx].folded);
    
    console.log(`[GAME] Next active player from ${startIndex + 1} is Player ${idx + 1}`);
    return idx;
  } catch (error) {
    console.error("[ERROR] Exception in findNextActivePlayer:", error);
    
    // Emergency fallback - try to find any active player
    try {
      for (let i = 0; i < 4; i++) {
        if (!playerStates[i].folded) {
          return i;
        }
      }
    } catch (fallbackError) {
      console.error("[ERROR] Fallback in findNextActivePlayer also failed:", fallbackError);
    }
    
    return -1; // Return invalid index if all else fails
  }
}

function checkBettingRoundEnd(latestActor) {
  try {
    console.log(`[GAME] Checking if betting round ends after action from Player ${latestActor + 1}`);
    
    // Validate latest actor
    if (typeof latestActor !== 'number' || latestActor < 0 || latestActor > 3) {
      console.error(`[ERROR] Invalid latestActor in checkBettingRoundEnd: ${latestActor}`);
      // Try to recover by using currentPlayer
      latestActor = currentPlayer;
    }
    
    // Mark the latest actor as having acted
    playerHasActed[latestActor] = true;
    
    // Get all players who haven't folded
    const activePlayers = [];
    for (let i = 0; i < 4; i++) {
      if (!playerStates[i].folded) {
        activePlayers.push(i);
      }
    }
    
    // Log current game state
    console.log(`[GAME] Active players: ${activePlayers.length} (${activePlayers.map(i => i + 1).join(', ')})`);
    console.log(`[GAME] Current bets: [${currentBets.join(', ')}]`);
    console.log(`[GAME] Current bet to match: ${currentBet}`);
    console.log(`[GAME] Players who have acted: [${playerHasActed.map(acted => acted ? 'yes' : 'no').join(', ')}]`);
    
    // For debugging, log who is lastToAct
    if (lastToAct >= 0) {
      console.log(`[GAME] Last player to raise was Player ${lastToAct + 1}`);
    }

    // If only one player remains, they win automatically
    if (activePlayers.length === 1) {
      console.log(`[GAME] Only one player left: Player ${activePlayers[0] + 1}`);
      
      // Safety check - ensure all bets are moved to pot before awarding
      let additionalChips = 0;
      for (let i = 0; i < 4; i++) {
        if (currentBets[i] > 0) {
          additionalChips += currentBets[i];
          currentBets[i] = 0;
        }
      }
      
      if (additionalChips > 0) {
        pot += additionalChips;
        console.log(`[GAME] Added $${additionalChips} from outstanding bets to pot before award`);
      }
      
      // Try to move chips visually before award
      try {
        moveChipsFromPotToPlayer(activePlayers[0]);
      } catch (moveError) {
        console.error("[ERROR] Failed to move chips visually:", moveError);
      }
      
      // Award pot with delay for animation
      setTimeout(() => {
        try {
          awardPotToPlayer(activePlayers[0], "uncontested");
        } catch (awardError) {
          console.error("[ERROR] Failed to award pot to uncontested winner:", awardError);
          // Force new game as recovery
          setTimeout(() => newGame(), 2000);
        }
      }, 1000);
      
      return;
    }

    // Check if all active players have matched the current bet
    // FIXED: Account for all-in players who can't match the bet
    let allMatched = true;
    for (const playerIdx of activePlayers) {
      // Player is considered matched if:
      // 1. They've matched the current bet OR
      // 2. They're all-in (no chips left)
      const isAllIn = chips[playerIdx] === 0;
      
      if (currentBets[playerIdx] !== currentBet && !isAllIn) {
        allMatched = false;
        console.log(`[GAME] Player ${playerIdx + 1} hasn't matched the current bet: ${currentBets[playerIdx]} vs ${currentBet} (not all-in)`);
        break;
      }
    }
    
    // Check if all active players have acted this round
    let allHaveActed = true;
    for (const playerIdx of activePlayers) {
      if (!playerHasActed[playerIdx]) {
        allHaveActed = false;
        console.log(`[GAME] Player ${playerIdx + 1} hasn't acted yet this round`);
        break;
      }
    }
    
    console.log(`[GAME] All bets matched? ${allMatched}`);
    console.log(`[GAME] All players acted? ${allHaveActed}`);
    
    // Round ends when all active players have acted AND all bets are matched
    if (allMatched && allHaveActed) {
      console.log(`[GAME] Betting round complete - all players acted and all bets matched`);
      bettingRoundActive = false;
      disableActionButtons(true);

      // NEW CODE: Check if we should run out remaining cards due to all-in situation
      if (shouldRunOutCards()) {
        console.log("[GAME] All-in situation detected - running out remaining cards");
        
        // Clear any pending AI turns
        clearTimeout(window.pendingAITurn);
        
        // Short delay before running out cards
        setTimeout(() => {
          try {
            runOutRemainingCards();
          } catch (runOutError) {
            console.error("[ERROR] Failed to run out remaining cards:", runOutError);
            // Force showdown as recovery
            setTimeout(() => showdown(), 1000);
          }
        }, 1000);
        
        return; // Exit without proceeding to next round
      }
      
      // If this is the final round (river), go directly to showdown
      if (roundStage === 3) {
        updateInfo("Final betting round complete. Going to showdown...");
        
        // Clear any pending AI turns
        clearTimeout(window.pendingAITurn);
        
        setTimeout(() => {
          try {
            showdown();
          } catch (showdownError) {
            console.error("[ERROR] Failed to execute showdown:", showdownError);
            // Force new game as recovery
            setTimeout(() => newGame(), 3000);
          }
        }, 1000);
      } else {
        // Otherwise automatically move to next round after a delay
        updateInfo("Betting round complete. Moving to next round...");
        
        // Clear any pending AI turns
        clearTimeout(window.pendingAITurn);
        
        // Auto-advance to next round after a short delay
        setTimeout(() => {
          try {
            nextRound();
          } catch (nextRoundError) {
            console.error("[ERROR] Failed to advance to next round:", nextRoundError);
            // Force new game as recovery
            setTimeout(() => newGame(), 3000);
          }
        }, 1500);
      }
      return; // Exit the function to prevent moving to next player
    }
    
    // If we get here, the round is not over - continue to next player
    try {
      const previousPlayer = currentPlayer;
      currentPlayer = findNextActivePlayer(latestActor);
      
      if (currentPlayer === -1) {
        throw new Error("No active players found when looking for next player");
      }
      
      console.log(`[GAME] Moving from Player ${latestActor + 1} to Player ${currentPlayer + 1}`);
      
      // No longer at start of betting round once players start acting
      isStartOfBettingRound = false;
      
      // If it's the human player's turn, enable buttons
      if (currentPlayer === 3 && !playerStates[3].folded) {
        disableActionButtons(false);
        
        // Update betting slider
        if (window.updateBettingSlider) {
          try {
            window.updateBettingSlider();
          } catch (sliderError) {
            console.error("[ERROR] Failed to update betting slider:", sliderError);
          }
        }
        
        // Show turn message after a short delay
        setTimeout(() => {
          updateInfo(currentPlayer, 'turn');
        }, 800);
      } else if (!playerStates[currentPlayer].folded) {
        // Make sure human buttons are disabled when it's AI turn
        disableActionButtons(true);
        
        const showTurnMessage = false; // Set to true if you want "Player X's turn" before AI moves
        
        if (showTurnMessage) {
          updateInfo(currentPlayer, 'turn');
          
          // Schedule the next AI's turn after delay with safety checks
          window.pendingAITurn = setTimeout(() => {
            if (bettingRoundActive && !playerStates[currentPlayer].folded) {
              aiTakeTurn(currentPlayer);
            }
          }, 1500);
        } else {
          // Just have AI take turn immediately (well, after a short delay for UX)
          window.pendingAITurn = setTimeout(() => {
            if (bettingRoundActive && !playerStates[currentPlayer].folded) {
              aiTakeTurn(currentPlayer);
            }
          }, 800);
        }
      } else {
        console.error(`[ERROR] Next player (${currentPlayer + 1}) is folded - this shouldn't happen`);
        // Try to recover by finding another player
        checkBettingRoundEnd(currentPlayer);
      }
    } catch (nextPlayerError) {
      console.error("[ERROR] Failed to determine next player:", nextPlayerError);
      
      // Emergency recovery - try another approach to find next player
      try {
        // Check if we have active players
        if (activePlayers.length > 1) {
          // Find anyone other than latest actor who hasn't acted
          for (const playerIdx of activePlayers) {
            if (playerIdx !== latestActor && !playerHasActed[playerIdx]) {
              currentPlayer = playerIdx;
              console.log(`[GAME] Emergency recovery - setting Player ${currentPlayer + 1} as next`);
              
              if (currentPlayer === 3) {
                disableActionButtons(false);
                updateInfo(currentPlayer, 'turn');
              } else {
                setTimeout(() => aiTakeTurn(currentPlayer), 1000);
              }
              return;
            }
          }
          
          // If everyone has acted, we should end the betting round
          // This is likely a logic error if we got here
          console.error("[ERROR] All players have acted but betting round didn't end - forcing next round");
          
          // Force next round or showdown
          if (roundStage === 3) {
            setTimeout(() => showdown(), 1000);
          } else {
            setTimeout(() => nextRound(), 1500);
          }
        } else if (activePlayers.length === 1) {
          // Only one player left - award pot
          console.log(`[GAME] Only one active player left in recovery: Player ${activePlayers[0] + 1}`);
          setTimeout(() => awardPotToPlayer(activePlayers[0], "uncontested"), 1000);
        } else {
          // No active players? Shouldn't be possible
          console.error("[ERROR] No active players found during recovery - forcing new game");
          setTimeout(() => newGame(), 2000);
        }
      } catch (recoveryError) {
        console.error("[ERROR] Critical failure in betting round recovery:", recoveryError);
        setTimeout(() => newGame(), 2000);
      }
    }
  } catch (error) {
    console.error("[ERROR] Critical failure in checkBettingRoundEnd:", error);
    
    // Emergency recovery - try to continue the game somehow
    setTimeout(() => {
      try {
        // If at final stage, go to showdown
        if (roundStage === 3) {
          showdown();
        } else {
          // Otherwise try to go to next round
          nextRound();
        }
      } catch (finalError) {
        // Last resort - new game
        console.error("[ERROR] Final recovery attempt failed:", finalError);
        newGame();
      }
    }, 2000);
  }
}

/**
 * Awards the pot to a player and handles all related game state updates
 * @param {number} playerIdx - Index of the player to award pot to (0-3)
 * @param {string} reason - Reason for the award ("uncontested", "with Straight Flush", etc.)
 * @returns {boolean} - Whether the pot was successfully awarded
 */
function awardPotToPlayer(playerIdx, reason) {
  try {
    // Generate a new transaction ID
    currentAwardTransactionId++;
    const thisTransactionId = currentAwardTransactionId;
    
    console.log(`[AWARD-START] Transaction #${thisTransactionId}: Attempting to award pot to Player ${playerIdx + 1}`);
    
    // Validate player index
    if (typeof playerIdx !== 'number' || playerIdx < 0 || playerIdx > 3) {
      console.error(`[AWARD-ERROR] Transaction #${thisTransactionId}: Invalid player index: ${playerIdx}`);
      return false;
    }
    
    // Check if pot has already been awarded this hand
    if (potHasBeenAwarded) {
      console.log(`[AWARD-REJECT] Transaction #${thisTransactionId}: Pot already awarded this hand`);
      return false;
    }
    
    // Check if this specific transaction has been processed
    if (thisTransactionId <= lastAwardedPotTransactionId) {
      console.log(`[AWARD-REJECT] Transaction #${thisTransactionId}: Transaction already processed in #${lastAwardedPotTransactionId}`);
      return false;
    }
    
    // Calculate total pot (current pot + all active bets)
    let totalPot = pot;
    let totalBets = 0;
    for (let i = 0; i < 4; i++) {
      if (typeof currentBets[i] === 'number' && !isNaN(currentBets[i]) && currentBets[i] > 0) {
        totalPot += currentBets[i];
        totalBets += currentBets[i];
        currentBets[i] = 0;  // Clear all bets
      }
    }
    
    // Check if there's anything to award
    if (totalPot <= 0) {
      console.log(`[AWARD-SKIP] Transaction #${thisTransactionId}: No chips to award!`);
      return false; // Nothing to award
    }
    
    // Mark pot as awarded to prevent duplicate awards
    potHasBeenAwarded = true;
    lastAwardedPotTransactionId = thisTransactionId;
    
    // Validate and update chips
    const previousChips = chips[playerIdx];
    if (typeof previousChips !== 'number' || isNaN(previousChips)) {
      console.error(`[AWARD-WARNING] Transaction #${thisTransactionId}: Invalid chip count for player: ${previousChips}, resetting to 0`);
      chips[playerIdx] = 0; // Reset to zero before adding pot
    }
    
    // Award chips
    console.log(`[AWARD-EXECUTE] Transaction #${thisTransactionId}: Awarding $${totalPot} to Player ${playerIdx + 1}. Previous chips: $${chips[playerIdx]}`);
    chips[playerIdx] += totalPot;
    
    // Reset pot AFTER awarding
    pot = 0;
    
    // Log which bets went into this award
    if (totalBets > 0) {
      console.log(`[AWARD-DETAIL] Transaction #${thisTransactionId}: Award included $${totalBets} from current bets`);
    }
    
    // Format reason for display
    const displayReason = reason === "uncontested" 
                          ? "uncontested" 
                          : (reason ? reason : "");
    
    // Update the UI and display information
    try {
      updateInfo(playerIdx, 'win', `$${totalPot} ${displayReason}`.trim());
    } catch (infoError) {
      console.error(`[AWARD-ERROR] Transaction #${thisTransactionId}: Failed to update info:`, infoError);
      // Non-critical error, continue
    }
    
    // Store hand result for AI learning and analytics
    try {
      window.lastHandResult = {
        winner: playerIdx,
        amount: totalPot,
        reason: reason,
        timestamp: new Date().getTime(),
        participants: playerStates
            .map((state, index) => ({ index, folded: state.folded }))
            .filter(p => !p.folded)
            .map(p => p.index),
        wasBluff: false // AI sets this based on actual knowledge
      };
    } catch (resultError) {
      console.error(`[AWARD-ERROR] Transaction #${thisTransactionId}: Failed to store hand result:`, resultError);
      // Non-critical error, continue
    }
    
    // Update the UI to reflect changes to chips and pot
    try {
      updateChipsAndBets();
    } catch (uiError) {
      console.error(`[AWARD-ERROR] Transaction #${thisTransactionId}: Failed to update UI:`, uiError);
      // Non-critical error, continue with game flow
    }
    
    // Disable buttons during the transition
    try {
      disableActionButtons(true);
    } catch (buttonError) {
      console.error(`[AWARD-ERROR] Transaction #${thisTransactionId}: Failed to disable buttons:`, buttonError);
      // Non-critical error, continue
    }
    
    // Reset the betting round state
    bettingRoundActive = false;
    isStartOfBettingRound = false;
    
    // Clear any pending AI turns that might overlap with new game
    clearTimeout(window.pendingAITurn);
    
    // Schedule the start of a new game after a delay with countdown
    console.log(`[AWARD-COMPLETE] Transaction #${thisTransactionId}: Scheduling new game in 3 seconds`);
    
    // Create separate timeouts that can be cleared if necessary
    const timeout1 = setTimeout(() => { 
      try {
        updateInfo(`Player ${playerIdx + 1} won $${totalPot}. Starting new game in 2 seconds...`);
      } catch (error) {
        console.error("[AWARD-ERROR] Countdown message 1 failed:", error);
      }
    }, 1000);
    
    const timeout2 = setTimeout(() => { 
      try {
        updateInfo(`Player ${playerIdx + 1} won $${totalPot}. Starting new game in 1 second...`);
      } catch (error) {
        console.error("[AWARD-ERROR] Countdown message 2 failed:", error);
      }
    }, 2000);
    
    const timeout3 = setTimeout(() => {
      try {
        newGame();
      } catch (error) {
        console.error("[AWARD-ERROR] Failed to start new game:", error);
        // Last resort - try again or reload page
        try {
          setTimeout(() => {
            updateInfo("Error starting new game. Trying again...");
            setTimeout(newGame, 1000);
          }, 1000);
        } catch (finalError) {
          console.error("[AWARD-CRITICAL] Critical failure starting new game:", finalError);
          // Could add page reload as absolute last resort
        }
      }
    }, 3000);
    
    // Store timeouts so they can be cleared if needed
    window.awardTimeouts = [timeout1, timeout2, timeout3];
    
    return true; // Award successful
  } catch (error) {
    console.error(`[AWARD-CRITICAL] Transaction #${currentAwardTransactionId || 'unknown'}: Critical failure in pot award:`, error);
    
    // Emergency recovery
    try {
      // Still mark pot as awarded to prevent repeated attempts
      potHasBeenAwarded = true;
      pot = 0;
      for (let i = 0; i < 4; i++) {
        currentBets[i] = 0;
      }
      
      // Force UI update
      updateChipsAndBets();
      
      // Ensure new game starts even after error
      setTimeout(() => {
        try {
          updateInfo("Error awarding pot. Starting new game...");
          setTimeout(newGame, 1000);
        } catch (newGameError) {
          console.error("[AWARD-CRITICAL] Failed final recovery attempt:", newGameError);
        }
      }, 2000);
    } catch (recoveryError) {
      console.error("[AWARD-CRITICAL] Failed award recovery:", recoveryError);
    }
    
    return false;
  }
}

/**
 * Analyzes a hand of cards to count rank and suit frequencies
 * @param {string[]} cards - Array of card strings (e.g. ["AH", "KS", "QH"])
 * @returns {Object} - Object containing rank and suit frequency analysis
 */
function analyzeHand(cards) {
  try {
    // Validate input
    if (!cards || !Array.isArray(cards)) {
      console.error("[ERROR] Invalid cards input to analyzeHand:", cards);
      return { ranksCount: {}, suitsCount: {}, ranks: [] };
    }
    
    // Filter out invalid cards
    const validCards = cards.filter(card => {
      if (!card || typeof card !== 'string' || card.length < 2) {
        console.warn(`[WARNING] Skipping invalid card in analyzeHand: ${card}`);
        return false;
      }
      return true;
    });
    
    if (validCards.length === 0) {
      console.error("[ERROR] No valid cards to analyze");
      return { ranksCount: {}, suitsCount: {}, ranks: [] };
    }
    
    // Initialize counters
    const ranksCount = {};
    const suitsCount = {};
    const ranks = [];
    
    // Process each card
    validCards.forEach(card => {
      try {
        const rank = card[0];
        const suit = card[1];
        
        // Validate rank
        if (!RANKS[rank]) {
          console.warn(`[WARNING] Unknown card rank in analyzeHand: ${rank}`);
          return; // Skip this card
        }
        
        // Add to numeric ranks array for sorting
        ranks.push(RANKS[rank]);
        
        // Count rank frequency
        ranksCount[rank] = (ranksCount[rank] || 0) + 1;
        
        // Count suit frequency
        suitsCount[suit] = (suitsCount[suit] || 0) + 1;
        
      } catch (cardError) {
        console.error(`[ERROR] Failed to process card in analyzeHand: ${card}`, cardError);
        // Continue with other cards
      }
    });
    
    // Sort ranks in descending order (high to low)
    ranks.sort((a, b) => b - a);
    
    console.log(`[GAME] Analyzed ${validCards.length} cards: ${validCards.join(', ')}`);
    
    return { ranksCount, suitsCount, ranks };
  } catch (error) {
    console.error("[ERROR] Exception in analyzeHand:", error);
    // Return empty analysis as fallback
    return { ranksCount: {}, suitsCount: {}, ranks: [] };
  }
}

/**
 * Evaluates a poker hand and returns its rank and value
 * @param {string[]} cards - Array of card strings (e.g. ["AH", "KS", "QH", "JD", "TS"])
 * @returns {number[]} - Array where first element is hand rank (0-9) and remaining elements are for tiebreaking
 */
function evaluateHand(cards) {
  try {
    // Handle invalid inputs
    if (!cards || !Array.isArray(cards)) {
      console.error("[ERROR] Invalid cards array in evaluateHand:", cards);
      return [0, 0]; // Return high card with lowest possible value
    }
    
    // Filter valid cards
    const validCards = cards.filter(card => card && typeof card === 'string' && card.length >= 2);
    
    if (validCards.length < 5) {
      console.error(`[ERROR] Not enough valid cards in evaluateHand: ${validCards.length} valid out of ${cards.length} total`);
      return [0, 0]; // Return high card with lowest possible value
    }
    
    // Analyze card distribution
    const { ranksCount, suitsCount, ranks } = analyzeHand(validCards);
    
    if (!ranks || ranks.length === 0) {
      console.error("[ERROR] Failed to analyze hand in evaluateHand");
      return [0, 0]; // Return high card with lowest possible value
    }

    // Check for flush
    const flushSuit = Object.keys(suitsCount).find(s => suitsCount[s] >= 5);
    const isFlush = !!flushSuit;
    
    // Get flush cards if there is a flush
    const flushCards = isFlush ? validCards.filter(c => c[1] === flushSuit) : [];

    // Check for straight using unique ranks
    const uniqueRanks = [...new Set(ranks)].sort((a,b) => b - a);
    let straightHigh = null;
    
    // Check regular straight (5 cards in sequence)
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i+4] === 4) {
        straightHigh = uniqueRanks[i];
        break;
      }
    }
    
    // Check wheel straight (A-2-3-4-5)
    if (!straightHigh && 
        uniqueRanks.includes(14) && 
        uniqueRanks.includes(2) && 
        uniqueRanks.includes(3) && 
        uniqueRanks.includes(4) && 
        uniqueRanks.includes(5)) {
      straightHigh = 5;
    }

    // Check for straight flush
    let straightFlushHigh = null;
    let isRoyalFlush = false;
    
    if (isFlush && flushCards.length >= 5) {
      const flushRanks = flushCards.map(c => RANKS[c[0]]).sort((a,b) => b - a);
      const flushUniqueRanks = [...new Set(flushRanks)];
      
      // Check regular straight flush
      for (let i = 0; i <= flushUniqueRanks.length - 5; i++) {
        if (flushUniqueRanks[i] - flushUniqueRanks[i+4] === 4) {
          straightFlushHigh = flushUniqueRanks[i];
          
          // Check if it's a royal flush (A-K-Q-J-T of same suit)
          if (straightFlushHigh === 14) {
            isRoyalFlush = true;
          }
          break;
        }
      }
      
      // Check wheel straight flush (A-2-3-4-5)
      if (!straightFlushHigh && 
          flushUniqueRanks.includes(14) && 
          flushUniqueRanks.includes(2) && 
          flushUniqueRanks.includes(3) && 
          flushUniqueRanks.includes(4) && 
          flushUniqueRanks.includes(5)) {
        straightFlushHigh = 5;
      }
    }

    // Count cards by rank for pairs, sets, etc.
    const counts = Object.entries(ranksCount).map(([rank, count]) => {
      const numericRank = RANKS[rank];
      if (!numericRank) {
        console.warn(`[WARNING] Unknown rank in evaluateHand: ${rank}`);
        return { rank: 0, count: 0 }; // Invalid rank
      }
      return { rank: numericRank, count };
    }).filter(entry => entry.count > 0);
    
    // Sort by count (high to low), then by rank (high to low)
    counts.sort((a,b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });

    // Safety check for empty counts after filtering
    if (counts.length === 0) {
      console.error("[ERROR] No valid rank counts in evaluateHand");
      return [0, 0]; // Return high card with lowest possible value
    }

    // Evaluate hand value from strongest to weakest
    
    // 0. Royal flush - special case of straight flush
    if (isRoyalFlush) {
      return [9, 14]; // Royal flush with Ace high
    }
    
    // 1. Straight flush
    if (straightFlushHigh) {
      return [8, straightFlushHigh];
    }
    
    // 2. Four of a kind
    if (counts[0] && counts[0].count === 4) {
      // Find highest kicker that isn't the quad rank
      const kickers = ranks.filter(r => r !== counts[0].rank);
      const kicker = kickers.length > 0 ? kickers[0] : 0;
      return [7, counts[0].rank, kicker];
    }
    
    // 3. Full house
    if (counts[0] && counts[0].count === 3 && counts[1] && counts[1].count >= 2) {
      return [6, counts[0].rank, counts[1].rank];
    }
    
    // 4. Flush (5+ cards of same suit)
    if (isFlush) {
      // Get the 5 highest flush cards for kickers
      const flushRanksSorted = flushCards
          .map(c => RANKS[c[0]])
          .sort((a,b) => b - a)
          .slice(0, 5);
      
      // Pad with zeros if needed
      while (flushRanksSorted.length < 5) flushRanksSorted.push(0);
      
      return [5, ...flushRanksSorted];
    }
    
    // 5. Straight
    if (straightHigh) {
      return [4, straightHigh];
    }
    
    // 6. Three of a kind
    if (counts[0] && counts[0].count === 3) {
      // Find 2 highest kickers that aren't the trip rank
      const kickers = ranks.filter(r => r !== counts[0].rank).slice(0, 2);
      
      // Pad with zeros if needed
      while (kickers.length < 2) kickers.push(0);
      
      return [3, counts[0].rank, ...kickers];
    }
    
    // 7. Two pair
    if (counts[0] && counts[0].count === 2 && counts[1] && counts[1].count === 2) {
      // Sort pair ranks high to low
      const pairRanks = [counts[0].rank, counts[1].rank].sort((a,b) => b - a);
      
      // Find highest kicker that isn't in either pair
      const kickers = ranks.filter(r => r !== pairRanks[0] && r !== pairRanks[1]).slice(0, 1);
      const kicker = kickers.length > 0 ? kickers[0] : 0;
      
      return [2, pairRanks[0], pairRanks[1], kicker];
    }
    
    // 8. One pair
    if (counts[0] && counts[0].count === 2) {
      // Find 3 highest kickers that aren't the pair rank
      const kickers = ranks.filter(r => r !== counts[0].rank).slice(0, 3);
      
      // Pad with zeros if needed
      while (kickers.length < 3) kickers.push(0);
      
      return [1, counts[0].rank, ...kickers];
    }
    
    // 9. High card
    const highCardKickers = ranks.slice(0, 5);
    
    // Pad with zeros if needed
    while (highCardKickers.length < 5) highCardKickers.push(0);
    
    return [0, ...highCardKickers];
    
  } catch (error) {
    console.error("[ERROR] Exception in evaluateHand:", error);
    return [0, 0]; // Return high card with lowest possible value on error
  }
}

/**
 * Compares two poker hands to determine which is stronger
 * @param {number[]} handA - First hand evaluation array from evaluateHand
 * @param {number[]} handB - Second hand evaluation array from evaluateHand
 * @returns {number} - 1 if handA wins, -1 if handB wins, 0 if tie
 */
function compareHands(handA, handB) {
  try {
    // Handle invalid inputs
    if (!handA || !handB || !Array.isArray(handA) || !Array.isArray(handB)) {
      console.error("[ERROR] Invalid hands in comparison:", handA, handB);
      return 0; // Default to tie if we have invalid data
    }
    
    if (handA.length === 0 || handB.length === 0) {
      console.error("[ERROR] Empty hand arrays in comparison:", handA, handB);
      return 0; // Default to tie for empty arrays
    }
    
    console.log(`[GAME] Comparing hands: ${handA.join(',')} vs ${handB.join(',')}`);
    
    // Log hand types for better debugging
    const handTypeNames = [
      "High Card", "One Pair", "Two Pair", "Three of a Kind", 
      "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush"
    ];
    const handAType = handTypeNames[handA[0]] || "Unknown";
    const handBType = handTypeNames[handB[0]] || "Unknown";
    
    console.log(`[GAME] Hand types: ${handAType} vs ${handBType}`);
    
    // Compare each element of the hand score in order
    // First element is hand type (royal flush=9, straight flush=8, four of a kind=7, etc.)
    // Subsequent elements are card ranks in order of importance
    const maxLength = Math.max(handA.length, handB.length);
    
    for (let i = 0; i < maxLength; i++) {
      // Use 0 as default value if element is undefined
      const valA = i < handA.length ? handA[i] : 0;
      const valB = i < handB.length ? handB[i] : 0;
      
      // Validate values are numbers
      const numA = typeof valA === 'number' && !isNaN(valA) ? valA : 0;
      const numB = typeof valB === 'number' && !isNaN(valB) ? valB : 0;
      
      if (numA > numB) {
        console.log(`[GAME] Hand A wins at position ${i}: ${numA} > ${numB}`);
        return 1;  // handA wins
      }
      if (numA < numB) {
        console.log(`[GAME] Hand B wins at position ${i}: ${numA} < ${numB}`);
        return -1; // handB wins
      }
    }
    
    // If we've compared all elements and found no differences
    console.log("[GAME] Hands are exactly tied");
    return 0; // Tie
  } catch (error) {
    console.error("[ERROR] Exception in compareHands:", error);
    return 0; // Default to tie on error
  }
}

function newGame() {
  // Create and shuffle a new deck
  deck = createDeck();
  shuffle(deck);
  
  // Reset core game state
  players = [[], [], [], []];
  
  // Do not reset chips here
  if (!chips || chips.length !== 4) {
        chips = [100, 100, 100, 100];  // Or some other starting value
  }

  currentBets = [0, 0, 0, 0];
  pot = 0;
  communityCards = [];
  
  // Reset award tracking
  potHasBeenAwarded = false;
  lastAwardedPotTransactionId = 0;
  currentAwardTransactionId = 0;
  
  // Reset player states
  for (let i = 0; i < 4; i++) {
    playerStates[i].folded = false;
    playerHasActed[i] = false;
    
    // Remove folded visual indication
    document.getElementById(`player-${i + 1}`).classList.remove('folded');
    
    // Clear card containers
    const cardContainer = document.getElementById(`player-${i + 1}-cards`);
    cardContainer.innerHTML = '';
  }

  // Clear pot chips
  const potChipDisplay = document.getElementById('pot-chips');
  if (potChipDisplay) {
    potChipDisplay.innerHTML = '';
  }
  
  // Reset all-in status
  for (let i = 0; i < 4; i++) {
    try {
      const playerElement = document.getElementById(`player-${i + 1}`);
      if (playerElement) {
        playerElement.classList.remove('all-in');
        const indicator = playerElement.querySelector('.all-in-indicator');
        if (indicator) indicator.remove();
      }
    } catch (e) {
      console.error(`[ERROR] Failed to clear all-in status for player ${i+1}:`, e);
    }
  }

  // Reset cards revealed status
  for (let i = 0; i < 4; i++) {
    if (playerStates[i]) {
      playerStates[i].cardsRevealed = false;
    }
    
    try {
      const playerElement = document.getElementById(`player-${i + 1}`);
      if (playerElement) {
        playerElement.classList.remove('cards-revealed');
      }
    } catch (e) {
      console.error(`[ERROR] Failed to clear revealed status for player ${i+1}:`, e);
    }
  }

  // Instead of resetting chips, only ensure each player has some chips
  setTimeout(() => {
    ensureMinimumChips();
  }, 500);
  
  // Clear raise input field
  const raiseInput = document.getElementById('raise-input');
  if (raiseInput) {
    raiseInput.value = '';
  }
  
  // Reset betting state
  currentBet = 0;
  lastRaiseAmount = 0;
  lastToAct = -1;
  isStartOfBettingRound = true;
  bettingRoundActive = true;
  
  // Set up initial game - player 1 (index 0) goes first
  currentPlayer = 0; // Changed from 3 to 0
  roundStage = 0;
  document.getElementById('next-round-btn').disabled = true;
  
  // Deal cards and update UI
  dealInitialCards();
  showCards();
  updateChipsAndBets();
  updateInfo(0, 'newgame'); // Updated to show player 1's turn

  if (window.updateBettingSlider) {
    window.updateBettingSlider();
  }
  
  // Disable action buttons since it's not the user's turn
  disableActionButtons(true);
  
  // Reset bluff counts for AIs
  for (let i = 0; i < 3; i++) {
    bluffCount[i] = 0;
  }
  
  // Start AI turn for player 1
  setTimeout(() => {
    aiTakeTurn(0);
  }, 1000);
}

/**
 * Ensures all players have a minimum number of chips to play with,
 * both in game state and visually
 * @param {number} [minimumAmount=20] - Minimum chips each player should have
 */
function ensureMinimumChips(minimumAmount = 20) {
  try {
    console.log("[GAME] Checking if players need minimum chip top-up");
    
    // Colors for variety in chip display
    const chipColors = ['white', 'red', 'blue', 'green', 'black'];
    let playersGivenChips = 0;
    
    // Check each player's chips
    for (let i = 0; i < 4; i++) {
      const playerIndex = i + 1;
      
      // Validate chip value
      if (typeof chips[i] !== 'number' || isNaN(chips[i])) {
        console.error(`[ERROR] Invalid chip value for Player ${playerIndex}: ${chips[i]}, resetting to ${minimumAmount}`);
        chips[i] = minimumAmount;
        playersGivenChips++;
      }
      
      // If player has fewer than minimum chips, top them up
      if (chips[i] < minimumAmount) {
        console.log(`[GAME] Player ${playerIndex} needs chips - has $${chips[i]}, giving $${minimumAmount - chips[i]} more`);
        chips[i] = minimumAmount;
        playersGivenChips++;
      }
      
      // Update visual chip display
      try {
        const chipDisplay = document.querySelector(`#player-${playerIndex} .chip-display`);
        if (!chipDisplay) {
          console.warn(`[WARNING] Could not find chip display for Player ${playerIndex}`);
          continue;
        }
        
        // Check if visual chip count matches actual chip count (roughly)
        const visualChipCount = chipDisplay.querySelectorAll('.chip').length;
        const desiredChipCount = Math.min(12, Math.max(4, Math.ceil(chips[i] / 20)));
        
        // Only update visuals if there's a significant difference
        if (Math.abs(visualChipCount - desiredChipCount) > 3 || visualChipCount < 2) {
          console.log(`[UI] Updating visual chips for Player ${playerIndex}: ${visualChipCount} → ${desiredChipCount}`);
          
          // Clear existing chips first if needed
          if (visualChipCount > 0 && visualChipCount > desiredChipCount + 5) {
            chipDisplay.innerHTML = '';
          }
          
          // Add chips until we reach desired count
          while (chipDisplay.querySelectorAll('.chip').length < desiredChipCount) {
            const chip = document.createElement('div');
            const colorIndex = Math.floor(Math.random() * chipColors.length);
            chip.className = `chip ${chipColors[colorIndex]}`;
            chipDisplay.appendChild(chip);
          }
          
          // If we have too many, remove some
          while (chipDisplay.querySelectorAll('.chip').length > desiredChipCount + 2) {
            if (chipDisplay.firstChild) {
              chipDisplay.removeChild(chipDisplay.firstChild);
            } else {
              break;
            }
          }
        }
      } catch (displayError) {
        console.error(`[ERROR] Failed to update chip display for Player ${playerIndex}:`, displayError);
        // Continue with other players despite display errors
      }
    }
    
    // Update chip displays after ensuring minimums
    if (playersGivenChips > 0) {
      console.log(`[GAME] Gave minimum chips to ${playersGivenChips} players`);
      updateChipsAndBets();
    }
    
    return playersGivenChips;
  } catch (error) {
    console.error("[ERROR] Failed to ensure minimum chips:", error);
    return 0;
  }
}

/**
 * Places a bet for a player, updating chip counts and bet amounts
 * @param {number} playerIndex - Index of the player placing the bet (0-3)
 * @param {number} amount - Amount to bet
 * @returns {number} - The actual amount bet (may be less if player doesn't have enough)
 */
function placeBet(playerIndex, amount) {
  try {
    // Validate player index
    if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex > 3) {
      console.error(`[ERROR] Invalid player index in placeBet: ${playerIndex}`);
      return 0;
    }
    
    // Validate bet amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      console.error(`[ERROR] Invalid bet amount in placeBet: ${amount}`);
      return 0;
    }
    
    // Validate player chips
    if (typeof chips[playerIndex] !== 'number' || isNaN(chips[playerIndex])) {
      console.error(`[ERROR] Invalid chip value for Player ${playerIndex + 1}: ${chips[playerIndex]}, resetting to 0`);
      chips[playerIndex] = 0;
      return 0; // Can't bet if you have invalid chips
    }
    
    // Log the intended bet
    console.log(`[GAME] Player ${playerIndex + 1} placing bet of $${amount}`);
    
    // Safety check - can't bet more than you have
    const actualAmount = Math.min(amount, chips[playerIndex]);
    
    // If amount is reduced, log the adjustment
    if (actualAmount < amount) {
      console.log(`[GAME] Bet reduced from $${amount} to $${actualAmount} due to insufficient chips`);
    }
    
    // No need to continue if bet is zero
    if (actualAmount <= 0) {
      console.log(`[GAME] Player ${playerIndex + 1} has no chips to bet`);
      return 0;
    }
    
    // Record original values for logging
    const originalChips = chips[playerIndex];
    const originalBet = currentBets[playerIndex];
    
    // Validate current bet status
    if (typeof currentBets[playerIndex] !== 'number' || isNaN(currentBets[playerIndex])) {
      console.error(`[ERROR] Invalid current bet for Player ${playerIndex + 1}: ${currentBets[playerIndex]}, resetting to 0`);
      currentBets[playerIndex] = 0;
    }
    
    // Deduct chips from player
    chips[playerIndex] -= actualAmount;
    
    // Add to player's current bet
    currentBets[playerIndex] += actualAmount;
    
    console.log(`[GAME] Player ${playerIndex + 1} bet $${actualAmount}, new values: bet: $${currentBets[playerIndex]} (was $${originalBet}), chips: $${chips[playerIndex]} (was $${originalChips})`);
    
    // Return the actual amount bet
    return actualAmount;
  } catch (error) {
    console.error(`[ERROR] Failed to place bet for Player ${playerIndex + 1}:`, error);
    return 0; // Return zero on error
  }
}

function handleBet(playerIndex, amount) {
  if (playerStates[playerIndex].folded) return false;

  // Check if player has enough chips
  if (amount > chips[playerIndex]) {
    updateInfo(`Player ${playerIndex + 1} doesn't have enough chips!`); 
    return false;
  }

  console.log(`Player ${playerIndex + 1} betting ${amount}`);
  
  // Place the bet
  const amountBet = placeBet(playerIndex, amount);

  // Update current bet if this is now the highest bet
  if (currentBets[playerIndex] > currentBet) {
    currentBet = currentBets[playerIndex];
    lastToAct = playerIndex; // This player becomes the last to act
  }

  // This is the key line that shows the specific bet action
  updateInfo(playerIndex, 'bet', amountBet);

  moveChipsToPot(playerIndex, amountBet);

  // Update UI ONCE at the end
  updateChipsAndBets();

  return true;
}

/**
 * Gets a simplified score for a poker hand (used by AI for decision making)
 * @param {string[]} cards - Array of card strings (e.g. ["AH", "KS", "QH"])
 * @returns {number} - Hand score from 0 (high card) to 9 (royal flush)
 */
function getHandScore(cards) {
  try {
    // Validate input
    if (!cards || !Array.isArray(cards)) {
      console.error("[ERROR] Invalid cards input to getHandScore:", cards);
      return 0; // Default to high card
    }
    
    // Filter valid cards
    const validCards = cards.filter(card => {
      if (!card || typeof card !== 'string' || card.length < 2) {
        console.warn(`[WARNING] Skipping invalid card in getHandScore: ${card}`);
        return false;
      }
      return true;
    });
    
    if (validCards.length < 5) {
      console.error(`[ERROR] Not enough valid cards to evaluate in getHandScore: ${validCards.length}`);
      return 0; // Default to high card
    }
    
    const values = '23456789TJQKA';
    const counts = {};
    const suits = {};
    const vals = [];

    // Count card values and suits
    for (const card of validCards) {
      try {
        const val = card[0];
        const suit = card[1];
        
        // Validate value is recognized
        if (values.indexOf(val) === -1) {
          console.warn(`[WARNING] Unknown card value in getHandScore: ${val}`);
          continue; // Skip this card
        }
        
        vals.push(val);
        counts[val] = (counts[val] || 0) + 1;
        suits[suit] = (suits[suit] || 0) + 1;
      } catch (cardError) {
        console.error(`[ERROR] Failed to process card in getHandScore: ${card}`, cardError);
        // Continue with other cards
      }
    }
    
    // Make sure we have enough valid values
    if (vals.length < 5) {
      console.error(`[ERROR] Not enough valid values after processing: ${vals.length}`);
      return 0; // Default to high card
    }

    // Determine if there's a flush
    const isFlush = Object.values(suits).some(count => count >= 5);
    
    // Get the flush suit if there is one
    const flushSuit = isFlush ? 
                      Object.entries(suits).find(([_, count]) => count >= 5)?.[0] : 
                      null;

    // Find unique sorted card values (low to high)
    const sortedVals = [...new Set(vals.map(v => values.indexOf(v)).sort((a, b) => a - b))];

    // Determine if there's a straight
    let isStraight = false;
    let straightHighIndex = -1;
    
    // Regular straight
    for (let i = 0; i <= sortedVals.length - 5; i++) {
      if (sortedVals[i + 4] - sortedVals[i] === 4) {
        isStraight = true;
        straightHighIndex = sortedVals[i + 4];
        break;
      }
    }
    
    // Special case: A-2-3-4-5 wheel straight
    // Check for A (12) and 2-5 (indices 0-3)
    if (!isStraight && 
        sortedVals.includes(0) && 
        sortedVals.includes(1) && 
        sortedVals.includes(2) && 
        sortedVals.includes(3) && 
        sortedVals.includes(12)) {
      isStraight = true;
      straightHighIndex = 3; // 5 is the high card in this straight
    }
    
    // Check for straight flush
    let isStraightFlush = false;
    
    if (isFlush && isStraight) {
      // Extract values of the flush cards
      const flushCards = validCards.filter(card => card[1] === flushSuit);
      const flushVals = [...new Set(flushCards.map(card => values.indexOf(card[0])))].sort((a, b) => a - b);
      
      // Check for straight in the flush cards - regular straight
      for (let i = 0; i <= flushVals.length - 5; i++) {
        if (flushVals[i + 4] - flushVals[i] === 4) {
          isStraightFlush = true;
          break;
        }
      }
      
      // Check for wheel straight in flush cards
      if (!isStraightFlush && 
          flushVals.includes(0) && 
          flushVals.includes(1) && 
          flushVals.includes(2) && 
          flushVals.includes(3) && 
          flushVals.includes(12)) {
        isStraightFlush = true;
      }
    }
    
    // Check for royal flush
    let isRoyalFlush = false;
    
    if (isStraightFlush) {
      // A royal flush has A, K, Q, J, T in the same suit
      const royalValues = [values.indexOf('T'), values.indexOf('J'), values.indexOf('Q'), values.indexOf('K'), values.indexOf('A')];
      const flushCards = validCards.filter(card => card[1] === flushSuit);
      const flushVals = flushCards.map(card => values.indexOf(card[0]));
      
      isRoyalFlush = royalValues.every(val => flushVals.includes(val));
    }

    // Sort card counts for ranking
    const countsArray = Object.values(counts).sort((a, b) => b - a);

    // Rank the hand from highest to lowest
    if (isRoyalFlush) return 9;               // Royal flush
    if (isStraightFlush) return 8;            // Straight flush
    if (countsArray[0] === 4) return 7;       // Four of a kind
    if (countsArray[0] === 3 && countsArray[1] >= 2) return 6; // Full house
    if (isFlush) return 5;                    // Flush
    if (isStraight) return 4;                 // Straight
    if (countsArray[0] === 3) return 3;       // Three of a kind
    if (countsArray[0] === 2 && countsArray[1] === 2) return 2; // Two pair
    if (countsArray[0] === 2) return 1;       // One pair

    return 0; // High card
  } catch (error) {
    console.error("[ERROR] Exception in getHandScore:", error);
    return 0; // Default to high card on error
  }
}

function aiTakeTurn(aiIndex) {
    // === Memory & Personality System ===
    // Create AI personality if it doesn't exist yet
    if (!window.aiPersonalities) {
        window.aiPersonalities = {};
    }
    
    if (!window.aiPersonalities[aiIndex]) {
        window.aiPersonalities[aiIndex] = {
            // Core personality traits (0-1 scale)
            aggression: 0.3 + Math.random() * 0.4,  // How aggressive overall
            bluffFrequency: 0.2 + Math.random() * 0.3,  // How often they bluff
            tiltFactor: 0.1 + Math.random() * 0.4,      // How easily tilted
            adaptability: 0.4 + Math.random() * 0.4,    // How quickly they adapt
            
            // Emotional state
            tiltLevel: 0,           // Current tilt level (0-1)
            confidence: 0.5,        // Current confidence (0-1)
            
            // Play history
            handsLost: 0,
            handsWon: 0,
            bluffsSuccessful: 0,
            bluffsCaught: 0,
            
            // Behavioral patterns
            preferredActions: {     // Track frequency of actions
                check: 0,
                call: 0,
                bet: 0,
                raise: 0,
                fold: 0
            },
            
            // Memory of other players
            playerMemory: {0:[], 1:[], 2:[], 3:[]},
            
            // Playing style (emerges from other traits)
            playStyle: ['balanced'],  // Will be dynamic based on gameplay
            
            // NEW: Decision consistency (how consistently they make optimal decisions)
            consistency: 0.7 + Math.random() * 0.2,
            
            // NEW: Position awareness (how much they adjust play based on position)
            positionAwareness: 0.4 + Math.random() * 0.4,
            
            // NEW: Stack sensitivity (how much they consider stack sizes)
            stackSensitivity: 0.3 + Math.random() * 0.5,
            
            // NEW: Pattern recognition (ability to detect patterns in opponents)
            patternRecognition: 0.2 + Math.random() * 0.6,
            
            // NEW: Risk aversion (increases as stack gets lower)
            baseRiskAversion: 0.2 + Math.random() * 0.4,
            
            // NEW: Timing patterns - how fast they tend to act
            decisionSpeed: 0.3 + Math.random() * 0.7
        };
        
        // Assign a dominant play style based on personality
        const personality = window.aiPersonalities[aiIndex];
        if (personality.aggression > 0.6) {
            personality.playStyle.push('aggressive');
        } else if (personality.aggression < 0.4) {
            personality.playStyle.push('passive');
        }
        
        if (personality.bluffFrequency > 0.5) {
            personality.playStyle.push('bluffer');
        }
        
        if (personality.adaptability > 0.6) {
            personality.playStyle.push('adaptive');
        } else if (personality.adaptability < 0.3) {
            personality.playStyle.push('rigid');
        }
        
        // NEW: Add more nuanced play styles
        if (personality.consistency > 0.8) personality.playStyle.push('solid');
        if (personality.stackSensitivity > 0.7) personality.playStyle.push('stack-conscious');
        if (personality.patternRecognition > 0.7) personality.playStyle.push('observant');
        
        console.log(`AI ${aiIndex + 1} personality created:`, personality);
    }
    
    // Get this AI's personality
    const personality = window.aiPersonalities[aiIndex];
    
    // === Current Game State Analysis ===
    // Mark AI as having acted
    playerHasActed[aiIndex] = true;

    // Extract state variables for easier access
    const maxBet = Math.max(...currentBets);
    const aiBet = currentBets[aiIndex];
    const toCall = currentBet - aiBet;
    const aiChips = chips[aiIndex];
    
    // Early exit if AI has folded or the game has ended
    if (playerStates[aiIndex].folded || playerStates.filter(p => !p.folded).length <= 1) return;
    
    // Calculate pot size including current bets
    const potSize = pot + currentBets.reduce((sum, bet) => sum + bet, 0);
    
    // Calculate pot odds (ratio of potential win to cost of call)
    const potOdds = toCall > 0 ? (potSize / toCall) : Infinity;
    
    // Count active players
    const activePlayers = playerStates.filter(p => !p.folded).length;
    
    // NEW: Determine player's position (early, middle, late)
    const positions = ['early', 'middle', 'late'];
    let playerPosition = 'middle';
    
    // Simple position calculation based on active players
    const nextPlayerActive = !playerStates[findNextActivePlayer(aiIndex)].folded;
    const prevPlayerActive = !playerStates[findPreviousActivePlayer(aiIndex)].folded;
    
    if (nextPlayerActive && !prevPlayerActive) playerPosition = 'early';
    if (!nextPlayerActive && prevPlayerActive) playerPosition = 'late';
    
    // NEW: Calculate risk aversion based on chip stack
    // Players become more risk-averse as their chips decrease
    const averageChips = chips.reduce((sum, c) => sum + c, 0) / 4;
    const stackRatio = aiChips / averageChips;
    const effectiveRiskAversion = personality.baseRiskAversion * (1.5 - Math.min(1, stackRatio));
    
    // === Hand Strength & Potential Analysis ===
    // Get hand strength (0-1 scale)
    let handStrength = 0;
    let perceivedHandStrength = 0;
    
    try {
        // Pre-flop evaluation
        if (communityCards.length === 0) {
            if (players[aiIndex].length < 2) {
                console.error(`AI ${aiIndex + 1} has invalid hand:`, players[aiIndex]);
                handStrength = 0;
            } else {
                // Evaluate starting hand
                const [card1, card2] = players[aiIndex];
                const [val1, val2] = [card1[0], card2[0]];
                const [suit1, suit2] = [card1[1], card2[1]];
                const isPair = val1 === val2;
                const isSuited = suit1 === suit2;
                const highCard = Math.max(RANKS[val1], RANKS[val2]);
                const lowCard = Math.min(RANKS[val1], RANKS[val2]);
                
                // Premium pairs (AA, KK, QQ, JJ)
                if (isPair && highCard >= 11) {
                    handStrength = 0.9 + ((highCard - 11) * 0.025);
                }
                // Premium unpaired (AK, AQ, AJ suited)
                else if (highCard === 14) { // Ace
                    if (lowCard === 13) handStrength = isSuited ? 0.85 : 0.8; // AK
                    else if (lowCard === 12) handStrength = isSuited ? 0.75 : 0.7; // AQ
                    else if (lowCard === 11) handStrength = isSuited ? 0.65 : 0.55; // AJ
                    else handStrength = isSuited ? 0.45 : 0.35; // Ax
                }
                // Medium pairs (TT through 77)
                else if (isPair && highCard >= 7 && highCard <= 10) {
                    handStrength = 0.65 + ((highCard - 7) * 0.05);
                }
                // Strong broadway (KQ, KJ, QJ)
                else if (highCard >= 11 && lowCard >= 10) {
                    handStrength = isSuited ? 0.65 : 0.55;
                }
                // Small pairs (66 through 22) 
                else if (isPair) {
                    handStrength = 0.5 + ((highCard - 2) * 0.02);
                }
                // Suited connectors
                else if (isSuited && Math.abs(highCard - lowCard) === 1) {
                    handStrength = 0.45 + (Math.min(highCard, 10) * 0.01);
                }
                // Face cards
                else if (highCard >= 11) {
                    handStrength = isSuited ? 0.4 : 0.3;
                }
                // Suited cards
                else if (isSuited) {
                    handStrength = 0.25 + (Math.min(highCard, 10) * 0.01);
                }
                // Unsuited connectors
                else if (Math.abs(highCard - lowCard) === 1) {
                    handStrength = 0.25;
                }
                // Everything else
                else {
                    handStrength = 0.1 + (Math.min(highCard, 10) * 0.01);
                }
                
                // NEW: Adjust hand strength based on position
                // Good players value position more
                if (personality.positionAwareness > 0.5) {
                    if (playerPosition === 'early') {
                        // Tighter in early position
                        handStrength *= 0.85;
                    } else if (playerPosition === 'late') {
                        // More aggressive in late position
                        handStrength *= 1.2;
                    }
                }
            }
        }
        // Post-flop evaluation
        else {
            const fullHand = [...players[aiIndex], ...communityCards];
            const handScore = getHandScore(fullHand);
            
            // Convert relative hand score to a strength value (0-1)
            // Higher scores = better hands
            handStrength = Math.min(handScore / 8, 1);
            
            // Adjust for board texture and number of players
            // (Strong hands are worth more in multiway pots)
            if (activePlayers > 2) {
                handStrength = Math.pow(handStrength, 0.9);
            }
            
            // NEW: Consider board texture more carefully
            const boardValues = communityCards.map(card => card[0]);
            const boardSuits = communityCards.map(card => card[1]);
            
            // Check for draws that might improve
            const hasFlushDraw = boardSuits.filter(s => s === players[aiIndex][0][1]).length >= 2 || 
                                 boardSuits.filter(s => s === players[aiIndex][1][1]).length >= 2;
            
            // Add draw potential to hand strength
            if (hasFlushDraw && handStrength < 0.6) {
                handStrength += 0.15; // Flush draws have significant value
            }
        }
    } catch (error) {
        console.error(`Error evaluating AI ${aiIndex + 1} hand:`, error);
        handStrength = 0.2; // Default to a weak hand on error
    }
    
    // === Emotional Adjustments to Perceived Hand Strength ===
    // Update emotional state based on game history
    if (window.lastHandResult) {
        const result = window.lastHandResult;
        if (result.winner === aiIndex) {
            // Won last hand
            personality.handsWon++;
            personality.confidence = Math.min(1, personality.confidence + 0.1);
            personality.tiltLevel = Math.max(0, personality.tiltLevel - 0.2);
            
            // If the win was with a bluff, become more likely to bluff
            if (result.wasBluff) {
                personality.bluffsSuccessful++;
                personality.bluffFrequency = Math.min(0.8, personality.bluffFrequency + 0.05);
            }
        } 
        else if (result.participants.includes(aiIndex)) {
            // Lost a hand they were involved in
            personality.handsLost++;
            personality.tiltLevel = Math.min(1, personality.tiltLevel + 
                                            (personality.tiltFactor * 0.5));
            personality.confidence = Math.max(0.2, personality.confidence - 0.05);
            
            // If they lost after bluffing, become less likely to bluff
            if (result.caughtBluffer === aiIndex) {
                personality.bluffsCaught++;
                personality.bluffFrequency = Math.max(0.1, personality.bluffFrequency - 0.1);
            }
        }
    }
    
    // Natural tilt recovery over time
    personality.tiltLevel = Math.max(0, personality.tiltLevel - 0.05);
    
    // Apply emotional filter to hand strength (key human element!)
    perceivedHandStrength = handStrength;
    
    // When tilted: overvalue hands when winning, undervalue when losing
    const tiltAdjustment = personality.tiltLevel * 
                          (personality.handsWon > personality.handsLost ? 0.2 : -0.2);
    perceivedHandStrength *= (1 + tiltAdjustment);
    
    // Confidence affects perception
    perceivedHandStrength *= (0.8 + personality.confidence * 0.4);
    
    // NEW: Anchoring bias - hand strength perception influenced by previous hands
    if (personality.lastHandStrength !== undefined) {
        // If previous hand was strong, slightly overvalue current hand
        const anchoringEffect = (personality.lastHandStrength - 0.5) * 0.1;
        perceivedHandStrength += anchoringEffect;
    }
    
    // NEW: Confirmation bias - players tend to see what confirms their beliefs
    if (personality.playStyle.includes('aggressive') && perceivedHandStrength > 0.4) {
        // Aggressive players tend to see their hands as stronger
        perceivedHandStrength *= 1.1;
    } else if (personality.playStyle.includes('passive') && perceivedHandStrength < 0.6) {
        // Passive players tend to see their hands as weaker
        perceivedHandStrength *= 0.9;
    }
    
    // Store current hand strength for future anchoring
    personality.lastHandStrength = handStrength;
    
    // === Strategic Decision Making ===
    let decision;
    let betAmount = 0;
    const minRaiseAmount = Math.max(lastRaiseAmount, 1);
    
    // Apply human-like variance to decision
    const varianceFactor = 0.8 + Math.random() * 0.4;
    
    // Use dynamic aggression (changes based on table dynamics and tilt)
    const aggression = personality.dynamicAggression || 
                      (personality.aggression * (1 + personality.tiltLevel * 0.3) * 
                       (playerPosition === 'late' ? 1.2 : 1.0)); // More aggressive in late position
    
    // NEW: Apply consistency factor - how consistently they make optimal decisions
    // Lower consistency = more random decisions
    const consistencyFactor = personality.consistency * (1 - personality.tiltLevel * 0.5);
    
    // Make occasional mistakes (more when tilted)
    const mistakeChance = 0.05 + (personality.tiltLevel * 0.2) + ((1 - consistencyFactor) * 0.3);
    const makingMistake = Math.random() < mistakeChance;
    
    if (makingMistake) {
        const reason = personality.tiltLevel > 0.5 ? 'tilt' : 
                      (consistencyFactor < 0.5 ? 'inconsistent play' : 'momentary lapse');
        console.log(`AI ${aiIndex + 1} making a human error due to ${reason}`);
    }
    
    // NEW: Apply risk aversion based on stack size and tournament situation
    const riskAversion = effectiveRiskAversion * (1 + (activePlayers > 2 ? 0.2 : 0));
    
    // === Decision Logic Tree ===
    // No bet to call - we can check or bet
    if (toCall === 0) {
        // With strong hand, almost always bet
        if (perceivedHandStrength > 0.7 && !makingMistake) {
            decision = 'bet';
            betAmount = determineBetSize();
        }
        // With medium hand, mix between bet and check based on aggression and position
        else if (perceivedHandStrength > 0.4) {
            // More likely to bet in late position or with fewer players
            const positionBonus = playerPosition === 'late' ? 0.2 : 
                                (playerPosition === 'early' ? -0.1 : 0);
                                
            const betThreshold = (aggression * varianceFactor) + positionBonus;
            decision = Math.random() < betThreshold ? 'bet' : 'check';
            
            if (decision === 'bet') {
                betAmount = determineBetSize();
            }
        }
        // With weak hand, occasionally bluff based on bluff tendency and table dynamics
        else {
            // Factors that affect bluffing
            const bluffFactors = [
                personality.bluffFrequency * 1.2,      // Base bluff tendency
                personality.tiltLevel * 0.5,          // More bluffs when tilted
                playerPosition === 'late' ? 0.2 : 0,  // Position bonus
                activePlayers > 2 ? -0.2 : 0,         // Fewer bluffs against multiple players
                personality.confidence * 0.3          // More bluffs when confident
            ];
            
            const bluffProbability = bluffFactors.reduce((sum, factor) => sum + factor, 0);
            
            if (Math.random() < bluffProbability) {
                decision = 'bet'; // Bluff
                betAmount = determineBetSize();
                
                // Track this as a bluff attempt
                personality.isBluffing = true;
                console.log(`AI ${aiIndex + 1} is BLUFFING with hand strength ${handStrength.toFixed(2)}`);
            }
            // Otherwise check
            else {
                decision = 'check';
            }
        }
        
        // Override with mistake if applicable
        if (makingMistake) {
            if (decision === 'check' && perceivedHandStrength < 0.3) {
                decision = 'bet';
                betAmount = determineBetSize();
                console.log(`AI ${aiIndex + 1} mistake: betting with weak hand when should check`);
            } else if (decision === 'bet' && perceivedHandStrength > 0.6) {
                decision = 'check';
                console.log(`AI ${aiIndex + 1} mistake: checking with strong hand when should bet`);
            }
        }
    } 
    // There's a bet to call - we can call, raise, or fold
    else {
        // Calculate call threshold based on personality, pot odds, and risk aversion
        const callThresholdBase = 0.3 - (0.1 * aggression) + (potOdds > 3 ? 0.1 : 0);
        const callThreshold = callThresholdBase + (riskAversion * 0.2);
        
        // Strong hand - raise or call
        if (perceivedHandStrength > 0.7 && !makingMistake) {
            // Usually raise with strong hands, but sometimes call to trap
            const raiseThreshold = 0.7 + (0.2 * aggression) - (0.1 * personality.tiltLevel);
            
            // NEW: Sometimes call to trap with very strong hands (more in early position)
            const trapThreshold = 0.2 + (perceivedHandStrength > 0.85 ? 0.3 : 0) + 
                               (playerPosition === 'early' ? 0.1 : 0);
                               
            if (Math.random() < trapThreshold && perceivedHandStrength > 0.8) {
                decision = 'call';
                console.log(`AI ${aiIndex + 1} is TRAPPING with strong hand: ${handStrength.toFixed(2)}`);
            }
            else if (Math.random() < raiseThreshold) {
                decision = 'raise';
                betAmount = determineBetSize();
            } else {
                decision = 'call';
            }
        }
        // Medium hand - mix between call and raise
        else if (perceivedHandStrength > callThreshold || makingMistake) {
            const raiseThreshold = aggression * 0.8 * perceivedHandStrength;
            
            // Consider stack ratio for raise decisions
            const effectiveStack = Math.min(aiChips, chips.filter((c, i) => !playerStates[i].folded && i !== aiIndex)
                                                        .reduce((min, c) => Math.min(min, c), Infinity));
            
            // More likely to raise with deep stacks
            const stackFactor = (effectiveStack / Math.max(...chips)) * 0.2;
            
            if (!makingMistake && Math.random() < (raiseThreshold + stackFactor) && toCall < aiChips * 0.5) {
                decision = 'raise';
                betAmount = determineBetSize();
            } else {
                decision = 'call';
            }
        }
        // Weak hand - occasional bluff raise, call with good pot odds, or fold
        else {
            // Bluff raise (more likely when not caught recently)
            const canBluff = personality.bluffsCaught === 0 || 
                            personality.bluffsSuccessful > personality.bluffsCaught;
            
            // Calculate bluff raise probability - more likely in position
            const bluffRaiseProbability = personality.bluffFrequency * 0.5 * 
                                      (playerPosition === 'late' ? 1.3 : 1.0) *
                                      (activePlayers > 2 ? 0.5 : 1.0);
            
            if (canBluff && Math.random() < bluffRaiseProbability) {
                decision = 'raise'; // Bluff raise
                betAmount = determineBetSize();
                personality.isBluffing = true;
                console.log(`AI ${aiIndex + 1} is BLUFF RAISING with hand strength ${handStrength.toFixed(2)}`);
            }
            // Call with good pot odds
            else if (potOdds > 4 && toCall < aiChips * 0.15) {
                decision = 'call';
                console.log(`AI ${aiIndex + 1} calling with pot odds ${potOdds.toFixed(1)}`);
            }
            // Call with a draw sometimes (if implied odds are good)
            else if (communityCards.length >= 3 && handStrength > 0.3 && toCall < aiChips * 0.1) {
                decision = 'call';
                console.log(`AI ${aiIndex + 1} calling with potential draw`);
            }
            // Otherwise fold
            else {
                decision = 'fold';
            }
        }
        
        // Override with mistake if applicable
        if (makingMistake) {
            if (decision === 'fold' && Math.random() < 0.5) {
                decision = 'call';
                console.log(`AI ${aiIndex + 1} mistake: calling with hand that should fold`);
            } else if (decision === 'raise' && perceivedHandStrength < 0.5) {
                decision = 'call';
                console.log(`AI ${aiIndex + 1} mistake: calling instead of raising with medium hand`);
            } else if (decision === 'call' && perceivedHandStrength > 0.8) {
                decision = 'fold';
                console.log(`AI ${aiIndex + 1} mistake: folding with strong hand`);
            }
        }
    }
    
    // Apply streak-based adjustments (humans get affected by win/loss streaks)
    if (personality.handsWon > personality.handsLost + 2 && !makingMistake) {
        // On a winning streak - might get more aggressive or overconfident
        if (decision === 'check' && Math.random() < 0.3) {
            decision = 'bet';
            betAmount = determineBetSize();
            console.log(`AI ${aiIndex + 1} being aggressive due to winning streak`);
        } else if (decision === 'call' && Math.random() < 0.3) {
            decision = 'raise';
            betAmount = determineBetSize();
            console.log(`AI ${aiIndex + 1} raising due to winning streak confidence`);
        }
    } else if (personality.handsLost > personality.handsWon + 2 && !makingMistake) {
        // On a losing streak - might get more cautious or desperate
        if (personality.tiltLevel > 0.5) {
            // Desperate play when tilted
            if ((decision === 'check' || decision === 'fold') && Math.random() < 0.3) {
                decision = decision === 'check' ? 'bet' : 'call';
                if (decision === 'bet') betAmount = determineBetSize();
                console.log(`AI ${aiIndex + 1} making desperate play while on tilt`);
            }
        } else {
            // Cautious play when not tilted
            if (decision === 'bet' && Math.random() < 0.3) {
                decision = 'check';
                console.log(`AI ${aiIndex + 1} being cautious due to losing streak`);
            } else if (decision === 'call' && Math.random() < 0.2) {
                decision = 'fold';
                console.log(`AI ${aiIndex + 1} folding due to cautiousness from losing streak`);
            }
        }
    }
    
    // NEW: Pattern-based adjustments - respond to player tendencies
    if (personality.patternRecognition > 0.5 && window.lastPlayerAction) {
        const humanMemory = personality.playerMemory[3].filter(m => m.action);
        
        // If we have enough data on human player
        if (humanMemory.length > 3) {
            const humanAggressiveActions = humanMemory.filter(a => 
                a.action === 'bet' || a.action === 'raise').length;
            
            const humanAggressionLevel = humanAggressiveActions / humanMemory.length;
            
            // Against aggressive players, tighten up or re-raise
            if (humanAggressionLevel > 0.7) {
                if (decision === 'call' && perceivedHandStrength > 0.6 && Math.random() < 0.4) {
                    decision = 'raise';
                    betAmount = determineBetSize() * 1.2; // Bigger raise against aggressive players
                    console.log(`AI ${aiIndex + 1} counter-raising aggressive human`);
                }
                else if (decision === 'call' && perceivedHandStrength < 0.5 && Math.random() < 0.7) {
                    decision = 'fold';
                    console.log(`AI ${aiIndex + 1} tightening against aggressive human`);
                }
            }
            
            // Against passive players, bet more
            if (humanAggressionLevel < 0.3 && playerPosition === 'late') {
                if (decision === 'check' && Math.random() < 0.5) {
                    decision = 'bet';
                    betAmount = determineBetSize();
                    console.log(`AI ${aiIndex + 1} exploiting passive human`);
                }
            }
        }
    }
    
    // Increment action counter in personality
    personality.preferredActions[decision]++;
    
    // Log decision process
    console.log(`AI ${aiIndex + 1} [${personality.playStyle.join(', ')}]:`);
    console.log(`  Hand strength: ${handStrength.toFixed(2)}, Perceived: ${perceivedHandStrength.toFixed(2)}`);
    console.log(`  Position: ${playerPosition}, Active players: ${activePlayers}`);
    console.log(`  Decision: ${decision}${betAmount ? ' Amount: $' + betAmount : ''}`);
    console.log(`  Emotional state: ${personality.tiltLevel > 0.5 ? 'Tilted' : (personality.confidence > 0.7 ? 'Confident' : 'Balanced')}`);
    
    // Helper function to determine realistic human-like bet sizes
    function determineBetSize() {
        // Base bet sizing on hand strength and pot size
        let baseBetSize;
        
        if (toCall > 0) {
            // This is a raise - size it based on current bet and hand strength
            const raiseMultiplier = personality.isBluffing ? 
                                    1 + (Math.random() * 0.5) : // Smaller raises when bluffing
                                    1.5 + (perceivedHandStrength * 1.5); // Bigger raises with stronger hands
            
            baseBetSize = toCall + Math.max(
                minRaiseAmount,
                Math.ceil(toCall * raiseMultiplier)
            );
        } else {
            // This is a bet - size it based on pot and hand strength
            let potBetRatio;
            
            if (personality.isBluffing) {
                // Bluffs tend to be standard sizing to look strong
                potBetRatio = 0.5 + (Math.random() * 0.2);
            } else {
                // Value bets scale with hand strength
                potBetRatio = 0.3 + (perceivedHandStrength * 0.7);
            }
            
            // NEW: Considering board texture for bet sizing
            if (communityCards.length >= 3) {
                // More coordinated boards (potential flush/straight draws) get bigger bets
                const uniqueSuits = new Set(communityCards.map(c => c[1])).size;
                const uniqueValues = new Set(communityCards.map(c => c[0])).size;
                
                // If board has flush or straight potential, bet bigger with strong hands
                if ((uniqueSuits === 1 || uniqueValues <= 3) && perceivedHandStrength > 0.7) {
                    potBetRatio += 0.2;
                }
            }
            
            baseBetSize = Math.max(5, Math.min(Math.ceil(potSize * potBetRatio), aiChips * 0.7));
        }
        
        // NEW: Consider player-specific bet sizing tells
        if (Math.random() < 0.7 && personality.preferredBetSizes) {
            // Establish preferred sizing if unset
            if (!personality.preferredBetSizes) {
                personality.preferredBetSizes = {
                    tendsToBetRound: Math.random() < 0.7,  // Round to nearest 5 or 10
                    preferredSizings: [0.5, 0.75, 1.0]     // Typical sizings as pot ratios
                };
                
                // Some players prefer specific sizings
                if (Math.random() < 0.3) {
                    personality.preferredBetSizes.preferredSizings = 
                        [0.33, 0.67, 1.0]; // Common "pro" sizings
                }
                
                if (Math.random() < 0.2) {
                    // Some players have unusual sizings they favor
                    personality.preferredBetSizes.preferredSizings.push(
                        0.4 + Math.random() * 1.2
                    );
                }
            }
            
            // Apply preferred sizing patterns when not bluffing (bluffs use standard sizing)
            if (!personality.isBluffing && Math.random() < 0.7) {
                const preferredSizings = personality.preferredBetSizes.preferredSizings;
                const chosenSizing = preferredSizings[Math.floor(Math.random() * preferredSizings.length)];
                
                // Use a preferred pot % sizing
                baseBetSize = Math.min(Math.ceil(potSize * chosenSizing), aiChips * 0.8);
                
                // Sometimes do minimum raise when in position as a pattern
                if (playerPosition === 'late' && toCall > 0 && Math.random() < 0.3) {
                    baseBetSize = toCall + minRaiseAmount;
                }
            }
        }
        
        // Human-like bet sizing adjustments
        
        // 1. Round to "pretty" numbers (humans like betting 10, 25, 50, etc.)
        if (baseBetSize > 20) {
            if (personality.preferredBetSizes && personality.preferredBetSizes.tendsToBetRound) {
                // Some players habitually bet round numbers
                const roundTo = baseBetSize > 100 ? 10 : 5;
                baseBetSize = Math.ceil(baseBetSize / roundTo) * roundTo;
            } else {
                // Occasionally use odd numbers to look less predictable
                if (Math.random() < 0.3) {
                    baseBetSize = Math.ceil(baseBetSize) + (Math.random() < 0.5 ? 1 : -1);
                }
            }
        }
        
        // 2. Add slight randomness to bet sizing
        const varianceFactor = 0.9 + (Math.random() * 0.2);
        baseBetSize = Math.ceil(baseBetSize * varianceFactor);
        
        // 3. Adjust based on tilt/confidence
        if (personality.tiltLevel > 0.6) {
            // Larger bets when tilted
            baseBetSize = Math.ceil(baseBetSize * 1.2);
        } else if (personality.confidence > 0.7) {
            // More precise bets when confident
            baseBetSize = baseBetSize;
        }
        
        // 4. Consider stack sizes
        const effectiveStackSize = Math.min(aiChips, Math.max(...chips.filter((_, i) => !playerStates[i].folded)));
        if (baseBetSize > effectiveStackSize * 0.7 && baseBetSize < effectiveStackSize) {
            // If betting most of stack, sometimes just go all-in
            if (Math.random() < 0.4) {
                return aiChips;
            }
        }
        
        // 5. Occasionally use a bet size as a "tell" when bluffing
        if (personality.isBluffing && Math.random() < 0.3) {
            // Leave a small amount behind (classic "tell")
            if (aiChips - baseBetSize < 10 && aiChips - baseBetSize > 0) {
                return Math.floor(aiChips * 0.9);
            }
            
            // Bet an oddly precise amount when bluffing
            if (Math.random() < 0.5) {
                return baseBetSize + (Math.random() < 0.5 ? 3 : 7);
            }
        }
        
        // Don't bet more than you have
        return Math.min(Math.ceil(baseBetSize), aiChips);
    }
    
    // === Execute the AI Decision with Human-like Timing ===
    // Vary thinking time based on decision difficulty and situation
    const baseThinkingTime = personality.decisionSpeed < 0.5 ? 1200 : 800;
    let thinkingTime = baseThinkingTime;
    
    // Take longer on tougher decisions
    if (perceivedHandStrength > 0.4 && perceivedHandStrength < 0.7) {
        thinkingTime += 500; // Medium hand takes longer to decide
    }
    
    // Take longer when pot is big
    if (potSize > 50) {
        thinkingTime += 300;
    }
    
    // Take longer when there's a significant bet to call
    if (toCall > aiChips * 0.2) {
        thinkingTime += 400;
    }
    
    // NEW: Pause longer when making big decisions
    if (decision === 'fold' && toCall > aiChips * 0.3) {
        thinkingTime += 700; // Big fold decisions take longer
    }
    
    if (decision === 'raise' && perceivedHandStrength > 0.8) {
        thinkingTime += 400; // Raising with big hand - dramatic pause
    }
    
    // Add human-like variance to timing
    thinkingTime += Math.random() * 1000;
    
    // NEW: Each AI develops a "timing tell" pattern based on hand strength
    if (!personality.timingTell) {
        // 33% chance of having a timing tell
        personality.timingTell = Math.random() < 0.33 ? 
            (Math.random() < 0.5 ? 'fast-strong' : 'slow-strong') : null;
    }
    
    // Apply timing tell if this AI has one
    if (personality.timingTell) {
        if (personality.timingTell === 'fast-strong' && perceivedHandStrength > 0.7) {
            thinkingTime *= 0.6; // Act quickly with strong hands
        }
        else if (personality.timingTell === 'slow-strong' && perceivedHandStrength > 0.7) {
            thinkingTime *= 1.5; // Dramatic pause with strong hands
        }
        
        // When bluffing, sometimes use the opposite timing to disguise
        if (personality.isBluffing && Math.random() < 0.5) {
            thinkingTime = baseThinkingTime * (personality.timingTell === 'fast-strong' ? 
                        1.5 : 0.6);
        }
    }
    
    // Cap thinking time
    thinkingTime = Math.min(thinkingTime, 4000);
    
    console.log(`AI ${aiIndex + 1} thinking for ${Math.round(thinkingTime)}ms...`);
    
    // Actually execute the decision after the "thinking time"
    setTimeout(() => {
        try {
            // Clear the 'isBluffing' flag if present
            if (personality.isBluffing) {
                personality.isBluffing = false;
            }
            
            if (decision === 'check') {
                updateInfo(aiIndex, 'check');
                checkBettingRoundEnd(aiIndex);
            }
            else if (decision === 'bet') {
                if (handleBet(aiIndex, betAmount)) {
                    lastRaiseAmount = betAmount;
                    lastToAct = aiIndex;
                    
                    // Record this action for other AIs to respond to
                    window.lastPlayerAction = {
                        player: aiIndex,
                        action: 'bet',
                        amount: betAmount,
                        isBluff: (handStrength < 0.3)
                    };
                    
                    checkBettingRoundEnd(aiIndex);
                } else {
                    // Fallback to check if bet fails
                    console.log(`AI ${aiIndex + 1} bet failed, checking instead`);
                    updateInfo(aiIndex, 'check');
                    checkBettingRoundEnd(aiIndex);
                }
            }
            else if (decision === 'call') {
                if (handleCall(aiIndex)) {
                    // Record this action
                    window.lastPlayerAction = {
                        player: aiIndex,
                        action: 'call', 
                        amount: currentBet - currentBets[aiIndex],
                        isBluff: false
                    };
                    
                    checkBettingRoundEnd(aiIndex);
                } else {
                    console.log(`AI ${aiIndex + 1} call failed, folding instead`);
                    handleFold(aiIndex);
                }
            }
            else if (decision === 'raise') {
                if (handleRaise(aiIndex, betAmount)) {
                    // Record this action for other AIs to respond to
                    window.lastPlayerAction = {
                        player: aiIndex,
                        action: 'raise',
                        amount: betAmount,
                        isBluff: (handStrength < 0.3)
                    };
                    
                    checkBettingRoundEnd(aiIndex);
                } else {
                    // Fallback to call if raise fails
                    console.log(`AI ${aiIndex + 1} raise failed, trying to call instead`);
                    if (handleCall(aiIndex)) {
                        checkBettingRoundEnd(aiIndex);
                    } else {
                        handleFold(aiIndex);
                    }
                }
            }
            else if (decision === 'fold') {
                // Record this action
                window.lastPlayerAction = {
                    player: aiIndex,
                    action: 'fold'
                };
                
                handleFold(aiIndex);
            }
        } catch (error) {
            console.error(`Error executing AI ${aiIndex + 1} decision:`, error);
            // Emergency fallback - just check or fold
            if (toCall === 0) {
                updateInfo(aiIndex, 'check');
                checkBettingRoundEnd(aiIndex);
            } else {
                handleFold(aiIndex);
            }
        }
    }, thinkingTime);
}

/**
 * Evaluates the relative strength of a poker hand on a 0-1 scale
 * @param {string[]} playerCards - Array of player's hole cards
 * @param {string[]} communityCards - Array of community cards
 * @returns {number} - Hand strength from 0 (weakest) to 1 (strongest)
 */
function evaluateHandStrength(playerCards, communityCards) {
  try {
    // Validate player cards
    if (!playerCards || !Array.isArray(playerCards) || playerCards.length < 2) {
      console.error("[ERROR] Invalid player cards in evaluateHandStrength:", playerCards);
      return 0;
    }
    
    // Make sure community cards is at least an empty array
    const commCards = communityCards || [];
    if (!Array.isArray(commCards)) {
      console.error("[ERROR] Invalid community cards in evaluateHandStrength:", commCards);
      return 0;
    }
    
    // Pre-flop evaluation based on starting hand quality
    if (commCards.length === 0) {
      try {
        return evaluatePreFlopHand(playerCards);
      } catch (preflopError) {
        console.error("[ERROR] Error in pre-flop evaluation:", preflopError);
        // Fall back to basic estimation
        return estimatePreFlopStrength(playerCards);
      }
    }
    
    // Post-flop evaluation
    const fullHand = [...playerCards, ...commCards];
    
    try {
      // Get score from 0-9 using getHandScore function
      const score = getHandScore(fullHand);
      
      // Convert score to a 0-1 scale (0 = High card, 1 = Royal flush)
      // Note: Updated divisor to 9 to account for royal flush being 9
      const baseStrength = Math.min(score / 9, 1);
      
      // Adjust strength based on board texture and number of community cards
      let adjustedStrength = baseStrength;
      
      // Stronger hands are more valuable on later streets
      if (commCards.length >= 4) {
        // On turn or river, value made hands more
        adjustedStrength = Math.pow(baseStrength, 0.9);
      } else {
        // On flop, slightly discount made hands (they can be outdrawn)
        adjustedStrength = Math.pow(baseStrength, 1.1);
      }
      
      // Check for draws that might improve strength
      // Most relevant on flop
      if (commCards.length === 3 && baseStrength < 0.5) {
        const drawStrength = evaluateDrawStrength(playerCards, commCards);
        
        // Combine actual hand strength with draw potential
        // This better models real poker thinking - weak made hands with draws
        // are stronger than weak made hands without draws
        adjustedStrength = Math.max(adjustedStrength, drawStrength * 0.7);
      }
      
      console.log(`[GAME] Hand evaluated: base strength ${baseStrength.toFixed(2)}, adjusted ${adjustedStrength.toFixed(2)}`);
      
      return adjustedStrength;
    } catch (scoreError) {
      console.error("[ERROR] Error getting hand score:", scoreError);
      // Emergency hand strength calculation
      return Math.min((getHandScore(fullHand) || 0) / 9, 1);
    }
  } catch (error) {
    console.error("[ERROR] Exception in evaluateHandStrength:", error);
    return 0; // Default to zero strength on error
  }
}

/**
 * Fallback evaluation for pre-flop hands if main evaluation fails
 * @param {string[]} cards - Player's hole cards
 * @returns {number} - Hand strength from 0 to 1
 */
function estimatePreFlopStrength(cards) {
  try {
    if (!cards || cards.length < 2) return 0;
    
    // Try to extract values and suits
    const values = cards.map(card => card[0] || '2');
    const suits = cards.map(card => card[1] || 'C');
    
    // Check for pair
    const isPair = values[0] === values[1];
    
    // Check for suited cards
    const isSuited = suits[0] === suits[1];
    
    const valueMap = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, 
                    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14};
    
    // Get numeric values
    const val1 = valueMap[values[0]] || 2;
    const val2 = valueMap[values[1]] || 2;
    
    // Calculate max and min values
    const maxVal = Math.max(val1, val2);
    const minVal = Math.min(val1, val2);
    
    // Basic strength formula
    let strength = 0;
    
    // Pairs
    if (isPair) {
      // Scale from 0.5 (22) to 1.0 (AA)
      strength = 0.5 + ((maxVal - 2) / 24);
    } 
    // Non-pairs
    else {
      // Base strength on high card and connectedness
      const highCardValue = (maxVal - 2) / 12;  // 0 to 1 scale
      const gap = maxVal - minVal;
      const gapPenalty = Math.min(gap * 0.05, 0.4); // Larger gaps reduce strength
      const suitedBonus = isSuited ? 0.1 : 0;
      
      // Combined formula
      strength = Math.min((highCardValue * 0.6) + (minVal / 28) - gapPenalty + suitedBonus, 0.95);
    }
    
    return Math.min(Math.max(strength, 0.05), 1);  // Ensure result is between 0.05 and 1
  } catch (error) {
    console.error("[ERROR] Exception in estimatePreFlopStrength:", error);
    return 0.1; // Return low but non-zero strength as fallback
  }
}

/**
 * Evaluates potential draw strength (straight/flush draws)
 * @param {string[]} playerCards - Player's hole cards
 * @param {string[]} communityCards - Community cards
 * @returns {number} - Draw strength from 0 to 1
 */
function evaluateDrawStrength(playerCards, communityCards) {
  try {
    // Combine all cards
    const allCards = [...playerCards, ...communityCards];
    
    // Count suits
    const suitCount = {};
    allCards.forEach(card => {
      if (card && card.length >= 2) {
        const suit = card[1];
        suitCount[suit] = (suitCount[suit] || 0) + 1;
      }
    });
    
    // Check for flush draw - 4 cards of the same suit means we need just one more
    const hasFlushDraw = Object.values(suitCount).some(count => count === 4);
    
    // Check for open-ended straight draw
    const values = '23456789TJQKA';
    const cardValues = allCards.map(card => card && card.length >= 1 ? values.indexOf(card[0]) : -1)
                              .filter(idx => idx !== -1);
    const uniqueValues = [...new Set(cardValues)].sort((a, b) => a - b);
    
    // Look for 4 consecutive cards (open-ended straight draw)
    let hasOpenStraightDraw = false;
    for (let i = 0; i <= uniqueValues.length - 4; i++) {
      if (uniqueValues[i+3] - uniqueValues[i] === 3) {
        hasOpenStraightDraw = true;
        break;
      }
    }
    
    // Look for gutshot straight draw (4 cards with one gap)
    let hasGutshot = false;
    for (let i = 0; i <= uniqueValues.length - 4; i++) {
      if (uniqueValues[i+3] - uniqueValues[i] === 4) {
        hasGutshot = true;
        break;
      }
    }
    
    // Assign strength based on draws
    if (hasFlushDraw && hasOpenStraightDraw) {
      return 0.7; // Combo draw is very strong
    } else if (hasFlushDraw) {
      return 0.5; // Flush draw
    } else if (hasOpenStraightDraw) {
      return 0.4; // Open-ended straight draw
    } else if (hasGutshot) {
      return 0.25; // Gutshot straight draw
    }
    
    return 0; // No significant draws
  } catch (error) {
    console.error("[ERROR] Exception in evaluateDrawStrength:", error);
    return 0;
  }
}

/**
 * Evaluates the strength of pre-flop hole cards on a 0-1 scale
 * @param {string[]} cards - Player's hole cards (e.g. ["AH", "KS"])
 * @returns {number} - Hand strength from 0 (weakest) to 1 (strongest)
 */
function evaluatePreFlopHand(cards) {
  try {
    // Validate input
    if (!cards || !Array.isArray(cards) || cards.length !== 2) {
      console.error("[ERROR] Invalid cards in evaluatePreFlopHand:", cards);
      return 0.1; // Return low default value
    }
    
    // Validate card format
    const validCards = cards.filter(card => card && typeof card === 'string' && card.length >= 2);
    if (validCards.length !== 2) {
      console.error("[ERROR] Invalid card format in evaluatePreFlopHand:", cards);
      return 0.1; // Return low default value
    }
    
    // Extract card values and suits
    const values = validCards.map(card => card[0]);
    const suits = validCards.map(card => card[1]);
    
    // Check card properties
    const isPair = values[0] === values[1];
    const isSuited = suits[0] === suits[1];
    
    // Get numeric ranks
    const ranks = [];
    for (const v of values) {
      const rank = RANKS[v];
      if (typeof rank !== 'number') {
        console.warn(`[WARNING] Unknown card value in evaluatePreFlopHand: ${v}`);
        ranks.push(2); // Default to lowest rank
      } else {
        ranks.push(rank);
      }
    }
    
    // Sort high to low
    ranks.sort((a, b) => b - a);
    
    // Calculate gap between cards
    const gap = Math.abs(ranks[0] - ranks[1]);
    const isConnected = gap === 1;
    const isOneGap = gap === 2;
    
    // Premium pairs (AA, KK, QQ, JJ)
    if (isPair && ranks[0] >= 11) {
      const strength = 0.9 + ((ranks[0] - 11) * 0.025);
      console.log(`[GAME] Evaluated premium pair: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Premium unpaired (AK, AQ, AJ)
    if (ranks[0] === 14) { // Ace
      if (ranks[1] === 13) {
        const strength = isSuited ? 0.85 : 0.8; // AK
        console.log(`[GAME] Evaluated AK: ${cards.join(',')} = ${strength.toFixed(2)}${isSuited ? ' (suited)' : ''}`);
        return strength;
      }
      
      if (ranks[1] === 12) {
        const strength = isSuited ? 0.75 : 0.7; // AQ
        console.log(`[GAME] Evaluated AQ: ${cards.join(',')} = ${strength.toFixed(2)}${isSuited ? ' (suited)' : ''}`);
        return strength;
      }
      
      if (ranks[1] === 11) {
        const strength = isSuited ? 0.65 : 0.55; // AJ
        console.log(`[GAME] Evaluated AJ: ${cards.join(',')} = ${strength.toFixed(2)}${isSuited ? ' (suited)' : ''}`);
        return strength;
      }
    }
    
    // Medium pairs (TT, 99, 88, 77)
    if (isPair && ranks[0] >= 7 && ranks[0] <= 10) {
      const strength = 0.65 + ((ranks[0] - 7) * 0.05);
      console.log(`[GAME] Evaluated medium pair: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Strong broadway (KQ, KJ, QJ)
    if (ranks[0] >= 11 && ranks[1] >= 10) {
      const strength = isSuited ? 0.65 : 0.55;
      console.log(`[GAME] Evaluated broadway: ${cards.join(',')} = ${strength.toFixed(2)}${isSuited ? ' (suited)' : ''}`);
      return strength;
    }
    
    // Small pairs (66, 55, 44, 33, 22)
    if (isPair) {
      const strength = 0.5 + ((ranks[0] - 2) * 0.02);
      console.log(`[GAME] Evaluated small pair: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Suited connectors (incl. JT, T9, 98, etc)
    if (isSuited && isConnected) {
      const strength = 0.45 + (Math.min(ranks[0], 10) * 0.01);
      console.log(`[GAME] Evaluated suited connector: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Suited one-gappers (e.g. J9s, T8s)
    if (isSuited && isOneGap) {
      const strength = 0.4 + (Math.min(ranks[0], 10) * 0.01);
      console.log(`[GAME] Evaluated suited one-gapper: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Ace with low kicker
    if (ranks[0] === 14 && ranks[1] < 11) {
      const strength = isSuited ? 0.45 : 0.35;
      console.log(`[GAME] Evaluated Ax: ${cards.join(',')} = ${strength.toFixed(2)}${isSuited ? ' (suited)' : ''}`);
      return strength;
    }
    
    // Face cards with low kicker
    if (ranks[0] >= 11 && ranks[1] < 10) {
      const strength = isSuited ? 0.4 : 0.3;
      console.log(`[GAME] Evaluated face card: ${cards.join(',')} = ${strength.toFixed(2)}${isSuited ? ' (suited)' : ''}`);
      return strength;
    }
    
    // Other suited cards
    if (isSuited) {
      const strength = 0.25 + (Math.min(ranks[0], 10) * 0.01);
      console.log(`[GAME] Evaluated suited cards: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Unsuited connectors
    if (isConnected) {
      const strength = 0.25;
      console.log(`[GAME] Evaluated unsuited connector: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Unsuited one-gappers
    if (isOneGap) {
      const strength = 0.2;
      console.log(`[GAME] Evaluated unsuited one-gapper: ${cards.join(',')} = ${strength.toFixed(2)}`);
      return strength;
    }
    
    // Everything else
    const strength = 0.1 + (Math.min(ranks[0], 10) * 0.01);
    console.log(`[GAME] Evaluated misc hand: ${cards.join(',')} = ${strength.toFixed(2)}`);
    return strength;
  } catch (error) {
    console.error("[ERROR] Exception in evaluatePreFlopHand:", error);
    return 0.1; // Return low default value on error
  }
}

/**
 * Updates an AI's memory and emotional state based on game events
 * @param {number} aiIndex - Index of the AI player to update (0-2)
 */
function updateAIMemory(aiIndex) {
  try {
    // Validate AI index
    if (typeof aiIndex !== 'number' || aiIndex < 0 || aiIndex > 2) {
      console.error(`[ERROR] Invalid AI index in updateAIMemory: ${aiIndex}`);
      return;
    }
    
    // Ensure AI personalities exist
    if (!window.aiPersonalities) {
      console.error("[ERROR] AI personalities not initialized");
      window.aiPersonalities = {};
      return;
    }
    
    // Get this AI's personality
    const personality = window.aiPersonalities[aiIndex];
    if (!personality) {
      console.error(`[ERROR] No personality found for AI ${aiIndex}`);
      return;
    }
    
    // Initialize missing personality properties if needed
    if (typeof personality.handsWon !== 'number') personality.handsWon = 0;
    if (typeof personality.handsLost !== 'number') personality.handsLost = 0;
    if (typeof personality.confidence !== 'number') personality.confidence = 0.5;
    if (typeof personality.tiltLevel !== 'number') personality.tiltLevel = 0;
    if (typeof personality.tiltFactor !== 'number') personality.tiltFactor = 0.2;
    if (!personality.playerMemory) personality.playerMemory = {0:[], 1:[], 2:[], 3:[]};
    
    // Count active players
    const activePlayers = playerStates.filter(p => !p.folded).length;
    
    console.log(`[AI] Updating memory for AI ${aiIndex + 1} - Current tilt: ${personality.tiltLevel.toFixed(2)}, confidence: ${personality.confidence.toFixed(2)}`);
    
    // Update emotional state based on recent events
    try {
      if (window.lastHandResult) {
        const result = window.lastHandResult;
        
        console.log(`[AI] Processing hand result for AI ${aiIndex + 1}: ${JSON.stringify(result)}`);
        
        // AI won the hand
        if (result.winner === aiIndex) {
          personality.handsWon++;
          
          // Confidence boost
          const prevConfidence = personality.confidence;
          personality.confidence = Math.min(1, personality.confidence + 0.1);
          
          // Tilt reduction
          const prevTilt = personality.tiltLevel;
          personality.tiltLevel = Math.max(0, personality.tiltLevel - 0.2);
          
          console.log(`[AI] AI ${aiIndex + 1} won hand - confidence: ${prevConfidence.toFixed(2)} → ${personality.confidence.toFixed(2)}, tilt: ${prevTilt.toFixed(2)} → ${personality.tiltLevel.toFixed(2)}`);
          
          // If the win was with a bluff, become more likely to bluff
          if (result.wasBluff && result.wasBluff === aiIndex) {
            if (!personality.bluffsSuccessful) personality.bluffsSuccessful = 0;
            personality.bluffsSuccessful++;
            
            if (!personality.bluffFrequency) personality.bluffFrequency = 0.3;
            const prevBluffFreq = personality.bluffFrequency;
            personality.bluffFrequency = Math.min(0.8, personality.bluffFrequency + 0.05);
            
            console.log(`[AI] AI ${aiIndex + 1} successful bluff - bluff frequency: ${prevBluffFreq.toFixed(2)} → ${personality.bluffFrequency.toFixed(2)}`);
          }
        } 
        // AI lost a hand they were involved in
        else if (result.participants && result.participants.includes(aiIndex)) {
          personality.handsLost++;
          
          // Increase tilt based on personality
          const prevTilt = personality.tiltLevel;
          personality.tiltLevel = Math.min(1, personality.tiltLevel + (personality.tiltFactor * 0.5));
          
          // Reduce confidence
          const prevConfidence = personality.confidence;
          personality.confidence = Math.max(0.2, personality.confidence - 0.05);
          
          console.log(`[AI] AI ${aiIndex + 1} lost hand - confidence: ${prevConfidence.toFixed(2)} → ${personality.confidence.toFixed(2)}, tilt: ${prevTilt.toFixed(2)} → ${personality.tiltLevel.toFixed(2)}`);
          
          // If they lost after bluffing, become less likely to bluff
          if (result.caughtBluffer === aiIndex) {
            if (!personality.bluffsCaught) personality.bluffsCaught = 0;
            personality.bluffsCaught++;
            
            if (!personality.bluffFrequency) personality.bluffFrequency = 0.3;
            const prevBluffFreq = personality.bluffFrequency;
            personality.bluffFrequency = Math.max(0.1, personality.bluffFrequency - 0.1);
            
            console.log(`[AI] AI ${aiIndex + 1} caught bluffing - bluff frequency: ${prevBluffFreq.toFixed(2)} → ${personality.bluffFrequency.toFixed(2)}`);
          }
        }
        
        // Process result for all AIs before clearing it
        if (aiIndex === 0) {
          // Only clear the result after all AIs have processed it
          setTimeout(() => {
            console.log("[AI] Clearing lastHandResult after all AIs have processed it");
            window.lastHandResult = null;
          }, 100);
        }
      }
    } catch (resultError) {
      console.error(`[ERROR] Failed to process last hand result for AI ${aiIndex + 1}:`, resultError);
    }
    
    // Natural tilt recovery over time
    const prevTilt = personality.tiltLevel;
    personality.tiltLevel = Math.max(0, personality.tiltLevel - 0.05);
    if (prevTilt !== personality.tiltLevel) {
      console.log(`[AI] AI ${aiIndex + 1} natural tilt recovery: ${prevTilt.toFixed(2)} → ${personality.tiltLevel.toFixed(2)}`);
    }
    
    // Analyze play patterns of opponents
    try {
      for (let i = 0; i < 4; i++) {
        if (i === aiIndex) continue;
        
        // If we have a recent action from this player, remember it
        if (window.lastPlayerAction && window.lastPlayerAction.player === i) {
          // Initialize memory for this player if needed
          if (!personality.playerMemory[i]) {
            personality.playerMemory[i] = [];
          }
          
          const memory = personality.playerMemory[i];
          
          // Clone the action to avoid reference issues
          const actionToRemember = {...window.lastPlayerAction, timestamp: Date.now()};
          memory.push(actionToRemember);
          
          console.log(`[AI] AI ${aiIndex + 1} remembers: Player ${i + 1} ${actionToRemember.action}${actionToRemember.amount ? ' $' + actionToRemember.amount : ''}`);
          
          // Keep memory to a reasonable size
          if (memory.length > 10) {
            memory.shift();
          }
          
          // We'll clear the action after all AIs have had a chance to process it
          if (aiIndex === 2) { // Last AI
            setTimeout(() => {
              console.log("[AI] Clearing lastPlayerAction after all AIs have processed it");
              window.lastPlayerAction = null;
            }, 100);
          }
        }
      }
    } catch (memoryError) {
      console.error(`[ERROR] Failed to update player memory for AI ${aiIndex + 1}:`, memoryError);
    }
    
    // Analyze table dynamics
    try {
      analyzeTableDynamics(aiIndex);
    } catch (dynamicsError) {
      console.error(`[ERROR] Failed to analyze table dynamics for AI ${aiIndex + 1}:`, dynamicsError);
    }
    
    // Log updated state
    console.log(`[AI] AI ${aiIndex + 1} memory updated - W:${personality.handsWon} L:${personality.handsLost}, Tilt:${personality.tiltLevel.toFixed(2)}, Confidence:${personality.confidence.toFixed(2)}`);
  } catch (error) {
    console.error(`[ERROR] Exception in updateAIMemory for AI ${aiIndex + 1}:`, error);
  }
}

/**
 * Determines the base poker action for an AI based on hand strength and game situation
 * @param {number} aiIndex - Index of the AI player (0-2)
 * @param {number} handStrength - Evaluated hand strength (0-1)
 * @param {number} potOdds - Ratio of pot size to call amount
 * @param {number} toCall - Amount needed to call
 * @returns {string} - Recommended action: 'check', 'bet', 'call', 'raise', or 'fold'
 */
function determineBaseAction(aiIndex, handStrength, potOdds, toCall) {
  try {
    // Validate AI index
    if (typeof aiIndex !== 'number' || aiIndex < 0 || aiIndex > 2) {
      console.error(`[ERROR] Invalid AI index in determineBaseAction: ${aiIndex}`);
      return 'check'; // Default to check as safest action
    }
    
    // Validate hand strength
    if (typeof handStrength !== 'number' || isNaN(handStrength)) {
      console.error(`[ERROR] Invalid hand strength in determineBaseAction: ${handStrength}`);
      handStrength = 0.3; // Use moderate-weak default
    }
    
    // Validate pot odds
    if (typeof potOdds !== 'number' || isNaN(potOdds) || potOdds < 0) {
      console.error(`[ERROR] Invalid pot odds in determineBaseAction: ${potOdds}`);
      potOdds = 1; // Use neutral default
    }
    
    // Validate toCall
    if (typeof toCall !== 'number' || isNaN(toCall) || toCall < 0) {
      console.error(`[ERROR] Invalid toCall in determineBaseAction: ${toCall}`);
      toCall = 0; // Assume no bet to call
    }
    
    // Ensure AI personalities exist
    if (!window.aiPersonalities || !window.aiPersonalities[aiIndex]) {
      console.error(`[ERROR] AI personality not found for index ${aiIndex}`);
      // Return a balanced default action
      return toCall === 0 ? (handStrength > 0.6 ? 'bet' : 'check') : 
                           (handStrength > 0.5 ? 'call' : 'fold');
    }
    
    // Get this AI's personality
    const personality = window.aiPersonalities[aiIndex];
    
    // Ensure essential personality traits exist
    if (typeof personality.aggression !== 'number') personality.aggression = 0.5;
    if (typeof personality.bluffFrequency !== 'number') personality.bluffFrequency = 0.3;
    if (typeof personality.tiltLevel !== 'number') personality.tiltLevel = 0;
    if (typeof personality.bluffsCaught !== 'number') personality.bluffsCaught = 0;
    
    // Get adjusted aggression (dynamic or base)
    const aggression = typeof personality.dynamicAggression === 'number' ? 
                      personality.dynamicAggression : personality.aggression;
    
    // Get player chip count
    const aiChips = chips[aiIndex];
    if (typeof aiChips !== 'number' || aiChips <= 0) {
      console.error(`[ERROR] Invalid chip count for AI ${aiIndex}: ${aiChips}`);
      return 'fold'; // Can't play without chips
    }
    
    // Get active player count for strategic adjustments
    const activePlayers = playerStates.filter(p => !p.folded).length;
    
    // Log initial decision factors
    console.log(`[AI] AI ${aiIndex + 1} considering action - Hand: ${handStrength.toFixed(2)}, Pot odds: ${potOdds.toFixed(1)}, To call: $${toCall}`);
    console.log(`[AI] AI ${aiIndex + 1} personality - Aggression: ${aggression.toFixed(2)}, Bluff freq: ${personality.bluffFrequency.toFixed(2)}, Tilt: ${personality.tiltLevel.toFixed(2)}`);
    
    // Adjust strategy based on stack depth
    const stackRatio = aiChips / (pot + currentBets.reduce((sum, bet) => sum + bet, 0));
    const isShortStacked = stackRatio < 2;
    
    // No bet to call - we can check or bet
    if (toCall === 0) {
        // With strong hand, almost always bet
        if (handStrength > 0.7) {
            // Very strong hands always bet
            if (handStrength > 0.85) {
                console.log(`[AI] AI ${aiIndex + 1} has very strong hand, betting`);
                return 'bet';
            }
            
            // Strong hands usually bet, but sometimes check (trapping)
            const trapChance = Math.max(0, 0.1 - (aggression * 0.05));
            const decision = Math.random() < trapChance ? 'check' : 'bet';
            console.log(`[AI] AI ${aiIndex + 1} has strong hand, ${decision === 'check' ? 'trapping (checking)' : 'betting'}`);
            return decision;
        }
        
        // Medium-strong hand with many active players - more likely to bet for protection
        if (handStrength > 0.55 && activePlayers > 2) {
            const betChance = Math.min(0.95, aggression + 0.3);
            const decision = Math.random() < betChance ? 'bet' : 'check';
            console.log(`[AI] AI ${aiIndex + 1} has medium-strong hand with ${activePlayers} players, ${decision}`);
            return decision;
        }
        
        // With medium hand, mix between bet and check based on aggression
        if (handStrength > 0.4) {
            // Adjust bet frequency based on active players
            const playerAdjustment = activePlayers > 2 ? -0.1 : 0.05; // Less likely to bet into many players
            const betFrequency = Math.min(0.9, Math.max(0.1, aggression + playerAdjustment));
            
            const decision = Math.random() < betFrequency ? 'bet' : 'check';
            console.log(`[AI] AI ${aiIndex + 1} has medium hand, ${decision} (bet frequency: ${betFrequency.toFixed(2)})`);
            return decision;
        }
        
        // With weak hand, occasionally bluff based on bluff tendency
        const bluffMultiplier = 1 + (personality.tiltLevel * 0.5) + 
                             (isShortStacked ? 0.5 : 0) + // More aggressive when short
                             (activePlayers <= 2 ? 0.3 : -0.3); // More likely to bluff against fewer players
        
        const bluffFrequency = personality.bluffFrequency * bluffMultiplier;
        
        if (Math.random() < bluffFrequency) {
            console.log(`[AI] AI ${aiIndex + 1} bluffing with weak hand (freq: ${bluffFrequency.toFixed(2)})`);
            return 'bet'; // Bluff
        }
        
        // Otherwise check
        console.log(`[AI] AI ${aiIndex + 1} checking with weak hand`);
        return 'check';
    } 
    // There's a bet to call - we can call, raise, or fold
    else {
        // Calculate call threshold based on personality, pot odds, and other factors
        let callThresholdBase = 0.3 - (0.1 * aggression);
        
        // Adjust for pot odds (better odds = can call with weaker hands)
        const potOddsAdjustment = potOdds > 3 ? 0.1 : (potOdds > 2 ? 0.05 : 0);
        callThresholdBase -= potOddsAdjustment;
        
        // Adjust for short stack (more willing to gamble)
        if (isShortStacked) callThresholdBase -= 0.05;
        
        // Adjust for player count (tighter with more players)
        if (activePlayers > 2) callThresholdBase += 0.05;
        
        const callThreshold = Math.max(0.1, callThresholdBase);
        
        // Strong hand - raise or call
        if (handStrength > 0.7) {
            // Very strong hands almost always raise
            if (handStrength > 0.85) {
                console.log(`[AI] AI ${aiIndex + 1} has very strong hand, raising`);
                return 'raise';
            }
            
            // Strong hands usually raise, but sometimes call (slow-play)
            const raiseFrequency = 0.7 + (0.2 * aggression) - (0.1 * personality.tiltLevel);
            const decision = Math.random() < raiseFrequency ? 'raise' : 'call';
            console.log(`[AI] AI ${aiIndex + 1} has strong hand, ${decision} (raise freq: ${raiseFrequency.toFixed(2)})`);
            return decision;
        }
        
        // Medium hand - mix between call and raise
        if (handStrength > callThreshold) {
            // Calculate raise frequency based on hand strength and aggression
            let raiseFrequency = aggression * 0.8 * handStrength;
            
            // Reduce raise frequency if call is expensive
            if (toCall > aiChips * 0.3) raiseFrequency *= 0.7;
            
            // Consider pot size when raising
            if (potOdds > 4) raiseFrequency *= 0.8; // Less incentive to raise with good pot odds
            
            // Decide whether to raise or call
            if (Math.random() < raiseFrequency && toCall < aiChips * 0.5) {
                console.log(`[AI] AI ${aiIndex + 1} raising with medium hand (freq: ${raiseFrequency.toFixed(2)})`);
                return 'raise';
            }
            
            console.log(`[AI] AI ${aiIndex + 1} calling with medium hand`);
            return 'call';
        }
        
        // Weak hand - occasional bluff raise, call with good pot odds, or fold
        
        // Bluff less if caught recently
        const recentlyBusted = personality.bluffsCaught > (personality.bluffsSuccessful || 0);
        const bluffRaiseFreq = recentlyBusted ? 
                             personality.bluffFrequency * 0.2 : 
                             personality.bluffFrequency * 0.5;
        
        // More likely to bluff with fewer players
        const playerBluffMultiplier = activePlayers <= 2 ? 1.3 : 0.7;
        
        if (Math.random() < bluffRaiseFreq * playerBluffMultiplier) {
            console.log(`[AI] AI ${aiIndex + 1} bluff raising (freq: ${(bluffRaiseFreq * playerBluffMultiplier).toFixed(2)})`);
            return 'raise'; // Bluff raise
        }
        
        // Call with good pot odds and reasonable call size
        if (potOdds > 4 && toCall < aiChips * 0.15) {
            console.log(`[AI] AI ${aiIndex + 1} calling with weak hand - good pot odds: ${potOdds.toFixed(1)}`);
            return 'call'; // Call with good pot odds
        }
        
        // Call with marginal pot odds if short stacked and desperate
        if (isShortStacked && potOdds > 2.5 && toCall < aiChips * 0.3 && personality.tiltLevel > 0.3) {
            console.log(`[AI] AI ${aiIndex + 1} desperate call when short stacked`);
            return 'call';
        }
        
        console.log(`[AI] AI ${aiIndex + 1} folding weak hand`);
        return 'fold';
    }
  } catch (error) {
    console.error(`[ERROR] Exception in determineBaseAction for AI ${aiIndex}:`, error);
    // Default to safest action based on whether there's a bet to call
    return toCall === 0 ? 'check' : 'fold';
  }
}

/**
 * Applies human-like adjustments to an AI's base poker action
 * @param {number} aiIndex - Index of the AI player (0-2)
 * @param {string} baseDecision - Base action determined by strategy ('check', 'bet', etc)
 * @param {number} handStrength - Evaluated hand strength (0-1)
 * @returns {string} - Potentially modified action after human-like adjustments
 */
function applyHumanLikeAdjustments(aiIndex, baseDecision, handStrength) {
  try {
    // Validate AI index
    if (typeof aiIndex !== 'number' || aiIndex < 0 || aiIndex > 2) {
      console.error(`[ERROR] Invalid AI index in applyHumanLikeAdjustments: ${aiIndex}`);
      return baseDecision; // Return original decision as fallback
    }
    
    // Validate base decision
    if (typeof baseDecision !== 'string' || !['check', 'call', 'bet', 'raise', 'fold'].includes(baseDecision)) {
      console.error(`[ERROR] Invalid base decision in applyHumanLikeAdjustments: ${baseDecision}`);
      return baseDecision === 'fold' ? 'fold' : 'check'; // Safe fallback
    }
    
    // Validate hand strength
    if (typeof handStrength !== 'number' || isNaN(handStrength)) {
      console.error(`[ERROR] Invalid hand strength in applyHumanLikeAdjustments: ${handStrength}`);
      handStrength = 0.3; // Use moderate-weak default
    }
    
    // Ensure AI personalities exist
    if (!window.aiPersonalities || !window.aiPersonalities[aiIndex]) {
      console.error(`[ERROR] AI personality not found for index ${aiIndex}`);
      return baseDecision; // Return original decision
    }
    
    const personality = window.aiPersonalities[aiIndex];
    
    // Ensure necessary properties exist
    if (typeof personality.tiltLevel !== 'number') personality.tiltLevel = 0;
    if (typeof personality.handsWon !== 'number') personality.handsWon = 0;
    if (typeof personality.handsLost !== 'number') personality.handsLost = 0;
    if (!personality.preferredActions) personality.preferredActions = { check: 0, call: 0, bet: 0, raise: 0, fold: 0 };
    
    // Track original decision for logging
    const originalDecision = baseDecision;
    let adjustedDecision = baseDecision;
    let adjustmentReason = null;

    // =================================================================
    // 1. MISTAKES - Humans make inconsistent decisions, especially when tilted
    // =================================================================
    const consistencyFactor = personality.consistency || 0.7; // Default to 0.7 if not defined
    const baseMistakeChance = 0.05 * (1 - consistencyFactor);
    const tiltMistakeMultiplier = 1 + (personality.tiltLevel * 3);
    const mistakeChance = baseMistakeChance + (personality.tiltLevel * 0.2);
    
    // Log significant tilt effects
    if (personality.tiltLevel > 0.3) {
      console.log(`[AI] AI ${aiIndex + 1} is tilted (${personality.tiltLevel.toFixed(2)}), mistake chance: ${mistakeChance.toFixed(2)}`);
    }
    
    // Mistakes are more likely with borderline hands (not very strong or very weak)
    const handAdjustment = (handStrength > 0.3 && handStrength < 0.7) ? 0.05 : 0;
    
    if (Math.random() < (mistakeChance + handAdjustment)) {
      // Make a "mistake" - pick a different action
      // But weight the mistake towards reasonable alternatives
      const actionWeights = {
        check: baseDecision === 'bet' ? 0.6 : 0.1, // More likely to mistakenly check when should bet
        call: baseDecision === 'fold' ? 0.4 : (baseDecision === 'raise' ? 0.5 : 0.1),
        bet: baseDecision === 'check' ? 0.4 : 0.1,
        raise: baseDecision === 'call' ? 0.4 : 0.1,
        fold: baseDecision === 'call' ? 0.3 : 0.1
      };
      
      // Remove the current action frm options
      delete actionWeights[baseDecision];
      
      // Convert to weighted selection array
      const weightedActions = [];
      for (const [action, weight] of Object.entries(actionWeights)) {
        // Add action to array multiple times based on weight
        const count = Math.round(weight * 10);
        for (let i = 0; i < count; i++) {
          weightedActions.push(action);
        }
      }
      
      // Pick a random weighted action
      if (weightedActions.length > 0) {
        adjustedDecision = weightedActions[Math.floor(Math.random() * weightedActions.length)];
        adjustmentReason = `mistake (${personality.tiltLevel > 0.5 ? "tilt" : "inconsistency"})`;
        
        console.log(`[AI] AI ${aiIndex + 1} making a mistake: ${baseDecision} → ${adjustedDecision}`);
      }
    }
    
    // =================================================================
    // 2. STREAK EFFECTS - Humans get affected by winning/losing streaks
    // =================================================================
    const winStreak = personality.handsWon > personality.handsLost + 2;
    const loseStreak = personality.handsLost > personality.handsWon + 2;
    
    if (winStreak || loseStreak) {
      const streakType = winStreak ? "winning" : "losing";
      console.log(`[AI] AI ${aiIndex + 1} on ${streakType} streak (W:${personality.handsWon}, L:${personality.handsLost})`);
      
      if (winStreak) {
        // On a winning streak - might get more aggressive or overconfident
        if (adjustedDecision === 'check' && Math.random() < 0.3) {
          adjustedDecision = 'bet';
          adjustmentReason = "winning streak confidence";
        }
        else if (adjustedDecision === 'call' && Math.random() < 0.3) {
          adjustedDecision = 'raise';
          adjustmentReason = "winning streak confidence";
        }
        else if (adjustedDecision === 'fold' && Math.random() < 0.2 && handStrength > 0.2) {
          adjustedDecision = 'call';
          adjustmentReason = "winning streak confidence";
        }
      } else {
        // On a losing streak - behavior depends on tilt level
        if (personality.tiltLevel > 0.5) {
          // Desperate play when tilted
          if (adjustedDecision === 'check' && Math.random() < 0.3) {
            adjustedDecision = 'bet';
            adjustmentReason = "desperate tilt";
          }
          else if (adjustedDecision === 'fold' && Math.random() < 0.3) {
            adjustedDecision = 'call';
            adjustmentReason = "desperate tilt";
          }
          else if (adjustedDecision === 'call' && Math.random() < 0.3) {
            adjustedDecision = 'raise';
            adjustmentReason = "desperate tilt";
          }
        } else {
          // Cautious play when not tilted
          if (adjustedDecision === 'bet' && Math.random() < 0.3) {
            adjustedDecision = 'check';
            adjustmentReason = "cautious due to losing";
          }
          else if (adjustedDecision === 'call' && Math.random() < 0.2) {
            adjustedDecision = 'fold';
            adjustmentReason = "cautious due to losing";
          }
          else if (adjustedDecision === 'raise' && Math.random() < 0.3) {
            adjustedDecision = 'call';
            adjustmentReason = "cautious due to losing";
          }
        }
      }
    }
    
    // =================================================================
    // 3. POSITION EFFECTS - Humans adjust play based on table position
    // =================================================================
    const activePlayerCount = playerStates.filter(p => !p.folded).length;
    
    // Determine if player is in late position
    let playerPosition = 'middle';
    try {
      // We're in late position if the next active player is the first to act next round
      const nextActive = findNextActivePlayer(aiIndex);
      const nextNextActive = findNextActivePlayer(nextActive);
      
      // If next next active is the first active player from the button, we're in late position
      if (nextNextActive === findNextActivePlayer(-1)) {
        playerPosition = 'late';
      } 
      // If we're the first active player from the button, we're in early position
      else if (aiIndex === findNextActivePlayer(-1)) {
        playerPosition = 'early';
      }
    } catch (positionError) {
      console.error(`[ERROR] Failed to determine position for AI ${aiIndex + 1}:`, positionError);
    }
    
    // Apply position awareness if the AI has this trait
    const positionAwareness = personality.positionAwareness || 0.5; // Default to moderate awareness
    
    if (Math.random() < positionAwareness) {
      if (playerPosition === 'late' && activePlayerCount > 2) {
        // More likely to be aggressive in late position
        if (adjustedDecision === 'check' && Math.random() < 0.3) {
          adjustedDecision = 'bet';
          adjustmentReason = "late position aggression";
        }
        else if (adjustedDecision === 'call' && Math.random() < 0.2) {
          adjustedDecision = 'raise';
          adjustmentReason = "late position aggression";
        }
      } 
      else if (playerPosition === 'early' && activePlayerCount > 2) {
        // More likely to be cautious in early position
        if (adjustedDecision === 'bet' && Math.random() < 0.3 && handStrength < 0.6) {
          adjustedDecision = 'check';
          adjustmentReason = "early position caution";
        }
        else if (adjustedDecision === 'raise' && Math.random() < 0.3 && handStrength < 0.7) {
          adjustedDecision = 'call';
          adjustmentReason = "early position caution";
        }
      }
    }
    
    // =================================================================
    // 4. HABIT PATTERNS - Humans develop predictable patterns
    // =================================================================
    
    // Make sure preferred actions are initialized
    for (const action of ['check', 'call', 'bet', 'raise', 'fold']) {
      if (typeof personality.preferredActions[action] !== 'number') {
        personality.preferredActions[action] = 0;
      }
    }
    
    // Only apply habits if we have enough history
    const totalActions = Object.values(personality.preferredActions).reduce((a, b) => a + b, 0);
    
    if (totalActions > 10) {
      // Find most common action
      let mostCommonAction = null;
      let mostCommonCount = 0;
      
      for (const [action, count] of Object.entries(personality.preferredActions)) {
        if (count > mostCommonCount) {
          mostCommonAction = action;
          mostCommonCount = count;
        }
      }
      
      // Calculate how dominant this action is in their history
      const actionDominance = mostCommonCount / totalActions;
      
      // People with strong habits tend to default to them despite strategy
      // More likely to fall into habits when tilted
      const habitChance = 0.1 + (actionDominance * 0.2) + (personality.tiltLevel * 0.2);
      
      if (mostCommonAction && mostCommonAction !== adjustedDecision && Math.random() < habitChance) {
        adjustedDecision = mostCommonAction;
        adjustmentReason = "habitual play pattern";
        
        console.log(`[AI] AI ${aiIndex + 1} defaulting to habitual ${mostCommonAction} (freq: ${actionDominance.toFixed(2)})`);
      }
    }
    
    // =================================================================
    // 5. TIME OF DAY - Some players play differently late at night
    // =================================================================
    const now = new Date();
    const hour = now.getHours();
    
    // Late night play is looser and more erratic (more common after midnight)
    if (hour < 6 || hour >= 23) {
      // Generate a "night owl" personality trait if it doesn't exist
      if (typeof personality.nightOwl === 'undefined') {
        personality.nightOwl = Math.random() > 0.7; // 30% of players are night owls
      }
      
      // Night owls get looser late at night
      if (personality.nightOwl && Math.random() < 0.3) {
        if (adjustedDecision === 'fold' && handStrength > 0.15) {
          adjustedDecision = 'call';
          adjustmentReason = "loose late night play";
        }
        else if (adjustedDecision === 'check' && Math.random() < 0.4) {
          adjustedDecision = 'bet';
          adjustmentReason = "loose late night play";
        }
      }
    }
    
    // Log the adjustment if decision was changed
    if (adjustedDecision !== originalDecision && adjustmentReason) {
      console.log(`[AI] AI ${aiIndex + 1} adjusted action: ${originalDecision} → ${adjustedDecision} (${adjustmentReason})`);
    }
    
    return adjustedDecision;
  } catch (error) {
    console.error(`[ERROR] Exception in applyHumanLikeAdjustments for AI ${aiIndex}:`, error);
    return baseDecision; // Return original decision if error occurs
  }
}

/**
 * Determines a human-like bet size for an AI player
 * @param {number} aiIndex - Index of the AI player (0-2)
 * @param {number} handStrength - Evaluated hand strength (0-1)
 * @param {number} potSize - Current size of the pot
 * @param {number} toCall - Amount needed to call current bet
 * @returns {number} - Suggested bet amount
 */
function determineBetSize(aiIndex, handStrength, potSize, toCall) {
  try {
    // Validate AI index
    if (typeof aiIndex !== 'number' || aiIndex < 0 || aiIndex > 2) {
      console.error(`[ERROR] Invalid AI index in determineBetSize: ${aiIndex}`);
      return toCall > 0 ? toCall + 1 : Math.ceil(potSize * 0.5); // Safe fallback
    }
    
    // Validate hand strength
    if (typeof handStrength !== 'number' || isNaN(handStrength)) {
      console.error(`[ERROR] Invalid hand strength in determineBetSize: ${handStrength}`);
      handStrength = 0.5; // Use moderate default
    }
    
    // Validate pot size
    if (typeof potSize !== 'number' || isNaN(potSize) || potSize < 0) {
      console.error(`[ERROR] Invalid pot size in determineBetSize: ${potSize}`);
      potSize = 10; // Use minimal default
    }
    
    // Validate toCall
    if (typeof toCall !== 'number' || isNaN(toCall) || toCall < 0) {
      console.error(`[ERROR] Invalid toCall in determineBetSize: ${toCall}`);
      toCall = 0; // Assume no bet to call
    }
    
    // Ensure AI personalities exist
    if (!window.aiPersonalities || !window.aiPersonalities[aiIndex]) {
      console.error(`[ERROR] AI personality not found for index ${aiIndex}`);
      return toCall > 0 ? toCall * 2 : Math.ceil(potSize * 0.5); // Safe fallback
    }
    
    const personality = window.aiPersonalities[aiIndex];
    
    // Ensure necessary properties exist
    if (typeof personality.tiltLevel !== 'number') personality.tiltLevel = 0;
    if (typeof personality.confidence !== 'number') personality.confidence = 0.5;
    if (typeof personality.bettingVariance !== 'number') personality.bettingVariance = Math.random() * 0.4 + 0.3; // 0.3-0.7
    
    // Get AI's chip stack
    const aiChips = chips[aiIndex];
    if (typeof aiChips !== 'number' || aiChips <= 0) {
      console.error(`[ERROR] Invalid chip count for AI ${aiIndex}: ${aiChips}`);
      return 1; // Minimum possible bet
    }
    
    // Get minimum raise amount (used for raises)
    const minRaiseAmount = Math.max(lastRaiseAmount, 1);
    
    // Count active players for bet sizing adjustment
    const activePlayers = playerStates.filter(p => !p.folded).length;
    
    // Create/access AI's betting style if it doesn't exist
    if (!personality.bettingStyle) {
      // Generate a consistent betting style for this AI
      personality.bettingStyle = {
        prefersRoundNumbers: Math.random() < 0.7, // 70% prefer round numbers
        sizingTendency: Math.random(),  // 0 = small bets, 1 = large bets
        preferredSizings: [],           // Will populate with preferred bet sizings
        hasUniqueTell: Math.random() < 0.3  // 30% have a unique betting tell
      };
      
      // Generate some preferred sizings
      if (Math.random() < 0.4) {
        // Standard pot % bettor (e.g., 1/2 pot, 2/3 pot, pot)
        personality.bettingStyle.preferredSizings = [0.5, 0.67, 1.0];
      } else if (Math.random() < 0.5) {
        // Unusual pot % bettor (e.g., 0.55, 0.75)
        const unusual1 = Math.floor(Math.random() * 40 + 40) / 100; // 0.4-0.8
        const unusual2 = Math.floor(Math.random() * 40 + 60) / 100; // 0.6-1.0
        personality.bettingStyle.preferredSizings = [unusual1, unusual2, 1.0];
      } else {
        // Chip-focused bettor (bets in round chip amounts)
        personality.bettingStyle.prefersRoundNumbers = true;
        personality.bettingStyle.preferredSizings = []; // Will default to round numbers
      }
      
      // Generate unique betting tell if they have one
      if (personality.bettingStyle.hasUniqueTell) {
        const tellOptions = [
          'bigWithNuts',      // Bets big with very strong hands
          'smallWithNuts',    // Bets small with very strong hands (trappy)
          'bigBluffs',        // Bets big when bluffing
          'smallBluffs',      // Bets small when bluffing
          'preciseBets',      // Uses very precise bet amounts (e.g., 37 not 40)
          'delayThenRaise',   // Pauses before raising with strong hands
        ];
        
        personality.bettingStyle.uniqueTell = tellOptions[Math.floor(Math.random() * tellOptions.length)];
        console.log(`[AI] AI ${aiIndex + 1} has unique betting tell: ${personality.bettingStyle.uniqueTell}`);
      }
    }
    
    // Base bet sizing on hand strength and pot size
    let baseBetSize;
    
    // Log decision context
    console.log(`[AI] AI ${aiIndex + 1} calculating bet size - Hand: ${handStrength.toFixed(2)}, Pot: $${potSize}, To call: $${toCall}`);
    
    // Track if this is a bluff for tell purposes
    const isBluff = handStrength < 0.3;
    const isNuts = handStrength > 0.85;
    
    if (toCall > 0) {
        // This is a raise - size it based on current bet and hand strength
        
        // Base multiplier starts at 1 (min raise) and increases with hand strength
        let raiseMultiplier;
        
        // Apply betting style and tells for raise sizing
        if (isNuts && personality.bettingStyle.hasUniqueTell) {
            if (personality.bettingStyle.uniqueTell === 'bigWithNuts') {
                raiseMultiplier = 2.5 + Math.random() * 1; // Big raise with nuts
            } else if (personality.bettingStyle.uniqueTell === 'smallWithNuts') {
                raiseMultiplier = 1 + Math.random() * 0.5; // Small raise with nuts (trappy)
            } else {
                raiseMultiplier = 1.5 + (handStrength * 1.5); // Standard sizing
            }
        } else if (isBluff && personality.bettingStyle.hasUniqueTell) {
            if (personality.bettingStyle.uniqueTell === 'bigBluffs') {
                raiseMultiplier = 2 + Math.random() * 1; // Big raise when bluffing
            } else if (personality.bettingStyle.uniqueTell === 'smallBluffs') {
                raiseMultiplier = 1 + Math.random() * 0.3; // Small raise when bluffing
            } else {
                raiseMultiplier = 1.2 + Math.random() * 0.5; // Standard bluff sizing
            }
        } else {
            // Standard raise sizing based on hand strength
            raiseMultiplier = 1 + (handStrength * 1.5);
            
            // Adjust for sizing tendency in personality
            raiseMultiplier *= 0.7 + (personality.bettingStyle.sizingTendency * 0.6);
            
            // Adjust for multiway pots - bigger raises heads-up, smaller multiway
            if (activePlayers > 2) {
                raiseMultiplier *= 0.8;
            }
        }
        
        // Calculate raise amount
        const raiseAmount = Math.max(
            minRaiseAmount,
            Math.ceil(toCall * raiseMultiplier)
        );
        
        baseBetSize = toCall + raiseAmount;
        
        console.log(`[AI] AI ${aiIndex + 1} raise calculation: $${toCall} to call + $${raiseAmount} raise = $${baseBetSize}`);
    } else {
        // This is a bet - size it based on pot and hand strength
        
        // Choose a pot percentage based on preferences and hand
        let potPercentage;
        
        // If AI has preferred sizings, use one of those
        if (personality.bettingStyle.preferredSizings && 
            personality.bettingStyle.preferredSizings.length > 0 && 
            Math.random() < 0.7) {
                
            const sizings = personality.bettingStyle.preferredSizings;
            let chosenSizing;
            
            // Select sizing based on hand strength
            if (handStrength > 0.8) {
                // Strong hands - select larger sizing if available
                chosenSizing = sizings[Math.min(sizings.length - 1, Math.floor(Math.random() * sizings.length * 1.5))];
            } else if (handStrength < 0.3) {
                // Bluffs - select smaller sizing if available
                chosenSizing = sizings[Math.floor(Math.random() * sizings.length * 0.7)];
            } else {
                // Medium hands - select random sizing
                chosenSizing = sizings[Math.floor(Math.random() * sizings.length)];
            }
            
            potPercentage = chosenSizing;
            console.log(`[AI] AI ${aiIndex + 1} using preferred sizing: ${potPercentage.toFixed(2)}x pot`);
        } else {
            // Apply betting tells for initial bet sizing
            if (isNuts && personality.bettingStyle.hasUniqueTell) {
                if (personality.bettingStyle.uniqueTell === 'bigWithNuts') {
                    potPercentage = 1.0 + Math.random() * 0.5; // Big bet with nuts
                } else if (personality.bettingStyle.uniqueTell === 'smallWithNuts') {
                    potPercentage = 0.3 + Math.random() * 0.3; // Small bet with nuts (trappy)
                } else {
                    potPercentage = 0.5 + (handStrength * 0.7); // Standard sizing
                }
            } else if (isBluff && personality.bettingStyle.hasUniqueTell) {
                if (personality.bettingStyle.uniqueTell === 'bigBluffs') {
                    potPercentage = 0.8 + Math.random() * 0.4; // Big bet when bluffing
                } else if (personality.bettingStyle.uniqueTell === 'smallBluffs') {
                    potPercentage = 0.3 + Math.random() * 0.2; // Small bet when bluffing
                } else {
                    potPercentage = 0.5 + Math.random() * 0.3; // Standard bluff sizing
                }
            } else {
                // Standard sizing based on hand strength
                potPercentage = 0.4 + (handStrength * 0.6);
                
                // Adjust for sizing tendency in personality
                potPercentage *= 0.7 + (personality.bettingStyle.sizingTendency * 0.6);
            }
            
            // Adjust for multiway pots - smaller bets with more players
            if (activePlayers > 2) {
                potPercentage *= 0.9;
            }
        }
        
        // Calculate the actual bet amount
        const potBet = Math.ceil(potSize * potPercentage);
        baseBetSize = Math.max(5, Math.min(potBet, aiChips * 0.7));
        
        console.log(`[AI] AI ${aiIndex + 1} bet calculation: ${potPercentage.toFixed(2)}x pot = $${baseBetSize}`);
    }
    
    // Apply human-like bet sizing adjustments
    
    // 1. Round to "pretty" numbers (humans like betting 10, 25, 50, etc.)
    let prettyBetSize = baseBetSize;
    
    if (personality.bettingStyle.prefersRoundNumbers && baseBetSize > 20) {
        if (baseBetSize > 100) {
            // Round to nearest 10 for larger bets
            prettyBetSize = Math.ceil(baseBetSize / 10) * 10;
        } else {
            // Round to nearest 5 for medium bets
            prettyBetSize = Math.ceil(baseBetSize / 5) * 5;
        }
        
        console.log(`[AI] AI ${aiIndex + 1} rounding bet: $${baseBetSize} → $${prettyBetSize}`);
        baseBetSize = prettyBetSize;
    } 
    // Some players use precise "odd" numbers as a style
    else if (!personality.bettingStyle.prefersRoundNumbers && 
             personality.bettingStyle.uniqueTell === 'preciseBets' && 
             baseBetSize > 20) {
        // Create a precise but odd-looking bet amount
        const roundedBase = Math.floor(baseBetSize / 5) * 5;
        const precision = Math.floor(Math.random() * 4) + 1; // 1-4
        
        prettyBetSize = roundedBase + precision;
        
        console.log(`[AI] AI ${aiIndex + 1} using precise bet: $${baseBetSize} → $${prettyBetSize}`);
        baseBetSize = prettyBetSize;
    }
    
    // 2. Add slight randomness to bet sizing based on variance trait
    const varianceFactor = 0.95 + (Math.random() * personality.bettingVariance);
    const randomizedBetSize = Math.ceil(baseBetSize * varianceFactor);
    
    if (randomizedBetSize !== baseBetSize) {
        console.log(`[AI] AI ${aiIndex + 1} adding variance: $${baseBetSize} → $${randomizedBetSize}`);
        baseBetSize = randomizedBetSize;
    }
    
    // 3. Adjust based on tilt/confidence
    let emotionalBetSize = baseBetSize;
    
    if (personality.tiltLevel > 0.6) {
        // Larger bets when tilted
        const tiltMultiplier = 1.1 + (personality.tiltLevel * 0.3);
        emotionalBetSize = Math.ceil(baseBetSize * tiltMultiplier);
        
        console.log(`[AI] AI ${aiIndex + 1} increasing bet due to tilt: $${baseBetSize} → $${emotionalBetSize}`);
        baseBetSize = emotionalBetSize;
    } 
    else if (personality.confidence > 0.7 && (handStrength > 0.6 || isBluff)) {
        // More polarized bets when confident - bigger value bets and bluffs
        const confidenceMultiplier = 1 + ((personality.confidence - 0.7) * 0.5);
        emotionalBetSize = Math.ceil(baseBetSize * confidenceMultiplier);
        
        console.log(`[AI] AI ${aiIndex + 1} adjusting bet due to confidence: $${baseBetSize} → $${emotionalBetSize}`);
        baseBetSize = emotionalBetSize;
    }
    
    // 4. Consider stack sizes
    const effectiveStackSize = Math.min(aiChips, Math.max(...chips.filter((c, i) => !playerStates[i].folded && i !== aiIndex)));
    
    // If bet is large compared to stack but not quite all-in
    if (baseBetSize > effectiveStackSize * 0.7 && baseBetSize < effectiveStackSize) {
        // If betting most of stack, sometimes just go all-in
        const allInThreshold = 0.3 + (personality.agression || 0.5) * 0.2;
        
        if (Math.random() < allInThreshold || baseBetSize > effectiveStackSize * 0.9) {
            console.log(`[AI] AI ${aiIndex + 1} converting to all-in: $${baseBetSize} → $${aiChips}`);
            return aiChips;
        }
        
        // Or sometimes bet a bit less to leave some chips behind
        else if (Math.random() < 0.4) {
            const reducedBet = Math.floor(effectiveStackSize * 0.75);
            
            console.log(`[AI] AI ${aiIndex + 1} reducing big bet: $${baseBetSize} → $${reducedBet}`);
            baseBetSize = reducedBet;
        }
    }
    
    // 5. Add bluff "tells" in the bet sizing
    if (isBluff && personality.bettingStyle.hasUniqueTell && Math.random() < 0.3) {
        // Some classic "tell" bet sizes that players use when bluffing
        
        // Sometimes make bluffs look like value by using a precise number
        if (!personality.bettingStyle.prefersRoundNumbers && Math.random() < 0.5) {
            const preciseBluff = Math.floor(baseBetSize * 0.9) + Math.floor(Math.random() * 4) + 1;
            
            console.log(`[AI] AI ${aiIndex + 1} using precise bluff size: $${baseBetSize} → $${preciseBluff}`);
            baseBetSize = preciseBluff;
        }
        // Sometimes bet exactly half pot as a tell
        else if (Math.random() < 0.4 && potSize > 20) {
            const halfPot = Math.ceil(potSize / 2);
            
            console.log(`[AI] AI ${aiIndex + 1} using half-pot bluff: $${baseBetSize} → $${halfPot}`);
            baseBetSize = halfPot;
        }
    }
    
    // Ensure bet is not more than available chips
    const finalBet = Math.min(Math.max(1, baseBetSize), aiChips);
    
    console.log(`[AI] AI ${aiIndex + 1} final bet size: $${finalBet}`);
    return finalBet;
  } catch (error) {
    console.error(`[ERROR] Exception in determineBetSize for AI ${aiIndex}:`, error);
    // Safe fallback - min raise or half pot
    return toCall > 0 ? toCall + Math.max(lastRaiseAmount, 1) : Math.ceil(potSize * 0.5);
  }
}

/**
 * Executes a poker action for an AI player after a delay
 * @param {number} aiIndex - Index of the AI player (0-2)
 * @param {string} decision - Action to take ('check', 'bet', 'call', 'raise', 'fold')
 * @param {number} betAmount - Amount to bet or raise (if applicable)
 * @param {number} delay - Milliseconds to wait before executing the action
 */
function executeAIAction(aiIndex, decision, betAmount, delay) {
  try {
    // Validate AI index
    if (typeof aiIndex !== 'number' || aiIndex < 0 || aiIndex > 2) {
      console.error(`[ERROR] Invalid AI index in executeAIAction: ${aiIndex}`);
      return;
    }
    
    // Validate decision
    if (typeof decision !== 'string' || !['check', 'bet', 'call', 'raise', 'fold'].includes(decision)) {
      console.error(`[ERROR] Invalid decision in executeAIAction: ${decision}`);
      return;
    }
    
    // Validate bet amount for bet/raise actions
    if ((decision === 'bet' || decision === 'raise') && 
        (typeof betAmount !== 'number' || isNaN(betAmount) || betAmount <= 0)) {
      console.error(`[ERROR] Invalid bet amount in executeAIAction: ${betAmount}`);
      betAmount = decision === 'raise' ? (currentBet + 1) : 5; // Safe fallback
    }
    
    // Validate delay
    if (typeof delay !== 'number' || isNaN(delay) || delay < 0) {
      console.error(`[ERROR] Invalid delay in executeAIAction: ${delay}`);
      delay = 1000; // Default to 1 second
    }
    
    // Get AI personality for timing tells
    const personality = window.aiPersonalities && window.aiPersonalities[aiIndex];
    
    // Apply timing tells if personality exists
    if (personality) {
      try {
        // Get hand strength for timing tells
        const handStrength = evaluateHandStrength(players[aiIndex], communityCards);
        const isBluff = handStrength < 0.3;
        const isStrong = handStrength > 0.7;
        
        // Generate a timing tell if not already present
        if (!personality.timingTell) {
          personality.timingTell = Math.random() < 0.4 ? 
                                  (Math.random() < 0.5 ? 'fast-strong' : 'slow-strong') : 
                                  null;
        }
        
        // Apply timing tell
        if (personality.timingTell) {
          if ((personality.timingTell === 'fast-strong' && isStrong) ||
              (personality.timingTell === 'slow-strong' && isBluff && Math.random() < 0.7)) {
            // Act quickly with strong hands (or occasionally quickly when bluffing)
            delay = Math.max(300, delay * 0.6);
            console.log(`[AI] AI ${aiIndex + 1} acting quickly (timing tell)`);
          }
          else if ((personality.timingTell === 'slow-strong' && isStrong) ||
                   (personality.timingTell === 'fast-strong' && isBluff && Math.random() < 0.7)) {
            // Pause with strong hands (or occasionally pause when bluffing)
            delay = delay * 1.5;
            console.log(`[AI] AI ${aiIndex + 1} acting slowly (timing tell)`);
          }
        }
        
        // Add more variance to timing based on decision difficulty
        if (handStrength > 0.4 && handStrength < 0.6) {
          // Medium strength hands take longer to think about
          delay *= (1 + Math.random() * 0.5);
        }
        
        // Big decisions take longer
        if ((decision === 'fold' && currentBet > 20) || 
            (decision === 'call' && currentBet > chips[aiIndex] * 0.3) ||
            (decision === 'raise' && betAmount > chips[aiIndex] * 0.5)) {
          delay *= (1 + Math.random() * 0.7);
          console.log(`[AI] AI ${aiIndex + 1} taking extra time for big decision`);
        }
      } catch (timingError) {
        console.error(`[ERROR] Failed to apply timing tells:`, timingError);
        // Continue with original delay
      }
    }
    
    // Set a timeout ID so it can be cleared if needed
    window.pendingAITurn = setTimeout(() => {
      try {
        // Clear the timeout reference
        window.pendingAITurn = null;
        
        // Make sure game is still active and it's still this AI's turn
        if (!bettingRoundActive || currentPlayer !== aiIndex || playerStates[aiIndex].folded) {
          console.log(`[AI] AI ${aiIndex + 1} action canceled - no longer valid`);
          return;
        }
        
        console.log(`[AI] AI ${aiIndex + 1} executing ${decision}${(decision === 'bet' || decision === 'raise') ? ' $' + betAmount : ''}`);
        
        // Execute the appropriate action
        if (decision === 'check') {
          updateInfo(aiIndex, 'check');
          
          // Record this action for other AIs to respond to
          window.lastPlayerAction = {
            player: aiIndex,
            action: 'check'
          };
          
          checkBettingRoundEnd(aiIndex);
        }
        else if (decision === 'bet') {
          // Validate that a bet is possible (no existing bet)
          if (currentBet > 0) {
            console.warn(`[WARNING] AI ${aiIndex + 1} tried to bet when there's already a bet - switching to raise`);
            decision = 'raise';
            
            // Handle as raise instead
            if (handleRaise(aiIndex, betAmount)) {
              // Record action
              window.lastPlayerAction = {
                player: aiIndex,
                action: 'raise',
                amount: betAmount,
                isBluff: (evaluateHandStrength(players[aiIndex], communityCards) < 0.3)
              };
              
              checkBettingRoundEnd(aiIndex);
            } else {
              // Fallbacks
              if (handleCall(aiIndex)) {
                checkBettingRoundEnd(aiIndex);
              } else {
                handleFold(aiIndex);
              }
            }
            return;
          }
          
          // Handle normal bet
          if (handleBet(aiIndex, betAmount)) {
            // When betting, this sets the lastRaiseAmount for minimum raise calculations
            lastRaiseAmount = betAmount;
            lastToAct = aiIndex;
            
            // Record this action for other AIs to respond to
            window.lastPlayerAction = {
              player: aiIndex,
              action: 'bet',
              amount: betAmount,
              isBluff: (evaluateHandStrength(players[aiIndex], communityCards) < 0.3)
            };
            
            checkBettingRoundEnd(aiIndex);
          } else {
            console.warn(`[WARNING] AI ${aiIndex + 1} bet failed, checking instead`);
            
            // Fallback to check if bet fails
            updateInfo(aiIndex, 'check');
            
            // Record fallback action
            window.lastPlayerAction = {
              player: aiIndex,
              action: 'check'
            };
            
            checkBettingRoundEnd(aiIndex);
          }
        }
        else if (decision === 'call') {
          // Handle call with fallback to fold
          if (handleCall(aiIndex)) {
            // Record this action
            window.lastPlayerAction = {
              player: aiIndex,
              action: 'call', 
              amount: currentBet - currentBets[aiIndex],
              isBluff: false
            };
            
            checkBettingRoundEnd(aiIndex);
          } else {
            console.warn(`[WARNING] AI ${aiIndex + 1} call failed, folding instead`);
            
            handleFold(aiIndex);
          }
        }
        else if (decision === 'raise') {
          // Validate that a raise is possible (existing bet)
          if (currentBet === 0) {
            console.warn(`[WARNING] AI ${aiIndex + 1} tried to raise when there's no bet - switching to bet`);
            decision = 'bet';
            
            // Handle as bet instead
            if (handleBet(aiIndex, betAmount)) {
              lastRaiseAmount = betAmount;
              lastToAct = aiIndex;
              
              // Record action
              window.lastPlayerAction = {
                player: aiIndex,
                action: 'bet',
                amount: betAmount,
                isBluff: (evaluateHandStrength(players[aiIndex], communityCards) < 0.3)
              };
              
              checkBettingRoundEnd(aiIndex);
            } else {
              // Fallback to check
              updateInfo(aiIndex, 'check');
              checkBettingRoundEnd(aiIndex);
            }
            return;
          }
          
          // Handle normal raise
          if (handleRaise(aiIndex, betAmount)) {
            // Record this action for other AIs to respond to
            window.lastPlayerAction = {
              player: aiIndex,
              action: 'raise',
              amount: betAmount,
              totalBet: currentBets[aiIndex],
              isBluff: (evaluateHandStrength(players[aiIndex], communityCards) < 0.3)
            };
            
            checkBettingRoundEnd(aiIndex);
          } else {
            console.warn(`[WARNING] AI ${aiIndex + 1} raise failed, trying to call instead`);
            
            // Fallback to call if raise fails
            if (handleCall(aiIndex)) {
              // Record fallback action
              window.lastPlayerAction = {
                player: aiIndex,
                action: 'call',
                amount: currentBet - currentBets[aiIndex],
                isBluff: false
              };
              
              checkBettingRoundEnd(aiIndex);
            } else {
              console.warn(`[WARNING] AI ${aiIndex + 1} call also failed, folding`);
              handleFold(aiIndex);
            }
          }
        }
        else if (decision === 'fold') {
          // Record this action
          window.lastPlayerAction = {
            player: aiIndex,
            action: 'fold'
          };
          
          // Handle fold (this includes its own check for betting round end)
          handleFold(aiIndex);
        }
      } catch (actionError) {
        console.error(`[ERROR] Failed to execute AI ${aiIndex + 1} action:`, actionError);
        
        // Emergency recovery - just fold if something goes wrong
        try {
          handleFold(aiIndex);
        } catch (e) {
          console.error(`[ERROR] Even emergency fold failed:`, e);
          // Try to move to next player at least
          goToNextPlayer(aiIndex);
        }
      }
    }, delay);
    
    // Log that action is scheduled
    console.log(`[AI] AI ${aiIndex + 1} will ${decision}${(decision === 'bet' || decision === 'raise') ? ' $' + betAmount : ''} after ${delay}ms`);
    
  } catch (error) {
    console.error(`[ERROR] Exception in executeAIAction for AI ${aiIndex}:`, error);
    
    // Emergency recovery - try to execute action with minimal delay
    try {
      setTimeout(() => {
        // Just fold as safest option on critical error
        handleFold(aiIndex);
      }, 500);
    } catch (finalError) {
      console.error(`[ERROR] Critical failure - could not schedule emergency action:`, finalError);
    }
  }
}

/**
 * Enables or disables the player action buttons
 * @param {boolean} disabled - Whether buttons should be disabled
 */
function disableActionButtons(disabled) {
  try {
    console.log(`[UI] ${disabled ? 'Disabling' : 'Enabling'} action buttons`);
    
    // List of button IDs to update
    const buttonIds = [
      'check-btn', 
      'bet-btn', 
      'call-btn', 
      'fold-btn', 
      'confirm-bet-btn'
    ];
    
    // Track any missing buttons
    const missingButtons = [];
    
    // Update each button
    for (const id of buttonIds) {
      const button = document.getElementById(id);
      
      if (button) {
        button.disabled = disabled;
        
        // Also update visual appearance for better feedback
        if (disabled) {
          button.classList.add('disabled');
        } else {
          button.classList.remove('disabled');
        }
      } else {
        // Only log missing for confirm-bet-btn if it's actually used
        if (id !== 'confirm-bet-btn' || document.getElementById('bet-slider')) {
          missingButtons.push(id);
        }
      }
    }
    
    // Log any missing buttons (except confirm-bet-btn which is optional)
    if (missingButtons.length > 0 && missingButtons.some(id => id !== 'confirm-bet-btn')) {
      console.warn(`[WARNING] Could not find action buttons: ${missingButtons.join(', ')}`);
    }
    
    // Also update the betting slider if it exists
    const betSlider = document.getElementById('bet-slider');
    if (betSlider) {
      betSlider.disabled = disabled;
      
      // Update the slider's visual appearance
      if (disabled) {
        betSlider.classList.add('disabled');
      } else {
        betSlider.classList.remove('disabled');
      }
    }
    
    // If enabling buttons, update button states based on valid actions
    if (!disabled) {
      try {
        updateActionButtons();
      } catch (updateError) {
        console.error('[ERROR] Failed to update action button states:', updateError);
      }
    }
    
    return true;
  } catch (error) {
    console.error('[ERROR] Failed to update button states:', error);
    
    // Try direct approach as fallback
    try {
      const buttons = ['check-btn', 'bet-btn', 'call-btn', 'fold-btn'];
      for (const id of buttons) {
        const element = document.getElementById(id);
        if (element) element.disabled = disabled;
      }
      
      const confirmBtn = document.getElementById('confirm-bet-btn');
      if (confirmBtn) confirmBtn.disabled = disabled;
      
      const slider = document.getElementById('bet-slider');
      if (slider) slider.disabled = disabled;
      
      return true;
    } catch (fallbackError) {
      console.error('[ERROR] Even fallback button update failed:', fallbackError);
      return false;
    }
  }
}

/**
 * Initializes the visual chip stacks for all players
 * @param {number} [minChips=8] - Minimum number of chips per player
 */
function initializeChipStacks(minChips = 8) {
  try {
    console.log('[UI] Initializing player chip stacks');
    
    // Colors for variety (standard poker colors)
    const chipColors = ['white', 'red', 'blue', 'green', 'black'];
    
    // Track success/failure for each player
    const results = { success: 0, failure: 0 };
    
    // Add chips to each player
    for (let i = 1; i <= 4; i++) {
      try {
        const chipDisplay = document.querySelector(`#player-${i} .chip-display`);
        if (!chipDisplay) {
          console.error(`[ERROR] Could not find chip display for player ${i}`);
          results.failure++;
          continue;
        }
        
        // Check if the player has chips in the game state
        const playerChips = chips[i-1];
        const hasValidChips = typeof playerChips === 'number' && playerChips > 0;
        
        // Only initialize if the display is empty or has very few chips
        if (chipDisplay.children.length < 4 || !hasValidChips) {
          // Clear existing chips first
          chipDisplay.innerHTML = '';
          
          // Determine number of chips based on chip count
          // More chips for players with more money (visual indication)
          let numChips;
          
          if (hasValidChips) {
            // Scale number of chips based on value (between min and 12)
            numChips = Math.min(12, Math.max(minChips, Math.ceil(playerChips / 20)));
          } else {
            numChips = minChips;
          }
          
          // Create a balanced distribution of colors
          const colors = [];
          
          // Use weighted distribution - more high value chips for wealthy players
          if (hasValidChips && playerChips > 150) {
            // More black and green chips for wealthy players
            for (let j = 0; j < numChips; j++) {
              const weightedIndex = Math.min(4, Math.floor(Math.random() * 5.5));
              colors.push(chipColors[weightedIndex]);
            }
          } else {
            // Regular distribution for normal stacks
            for (let j = 0; j < numChips; j++) {
              colors.push(chipColors[j % chipColors.length]);
            }
          }
          
          // Shuffle colors for randomness
          for (let j = colors.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [colors[j], colors[k]] = [colors[k], colors[j]];
          }
          
          // Create chip elements with staggered animation
          const fragment = document.createDocumentFragment();
          
          // Add chips in reverse order (bottom to top)
          for (let j = 0; j < numChips; j++) {
            const chip = document.createElement('div');
            chip.className = `chip ${colors[j]}`;
            
            // Add subtle animation delay for a stacking effect
            chip.style.animationDelay = `${j * 50}ms`;
            chip.style.opacity = '0';
            chip.style.transform = 'translateY(10px)';
            chip.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            
            // Add to fragment for better performance
            fragment.appendChild(chip);
          }
          
          // Add all chips at once
          chipDisplay.appendChild(fragment);
          
          // Trigger animations after a short delay (for DOM to update)
          setTimeout(() => {
            const newChips = chipDisplay.querySelectorAll('.chip');
            newChips.forEach(chipElem => {
              chipElem.style.opacity = '1';
              chipElem.style.transform = 'translateY(0)';
            });
          }, 50);
          
          console.log(`[UI] Added ${numChips} chips to player ${i}`);
          results.success++;
        } else {
          console.log(`[UI] Player ${i} already has sufficient chips`);
          results.success++;
        }
      } catch (playerError) {
        console.error(`[ERROR] Failed to initialize chips for player ${i}:`, playerError);
        results.failure++;
      }
    }
    
    // Clear pot chips if not empty
    try {
      const potChips = document.getElementById('pot-chips');
      if (potChips && potChips.children.length > 0) {
        potChips.innerHTML = '';
        console.log('[UI] Cleared pot chips');
      }
    } catch (potError) {
      console.error('[ERROR] Failed to clear pot chips:', potError);
    }
    
    console.log(`[UI] Chip stack initialization complete - ${results.success} successful, ${results.failure} failed`);
    return results.failure === 0;
  } catch (error) {
    console.error('[ERROR] Failed to initialize chip stacks:', error);
    return false;
  }
}

/**
 * Animates moving chips from pot to winning player
 * @param {number} playerIndex - Index of the winning player (0-3)
 * @returns {boolean} - Whether the move was successfully initiated
 */
function moveChipsFromPotToPlayer(playerIndex) {
  try {
    console.log(`[ANIMATION] Moving chips from pot to player ${playerIndex + 1}`);
    
    // Validate player index
    if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex > 3) {
      console.error(`[ERROR] Invalid player index in moveChipsFromPotToPlayer: ${playerIndex}`);
      return false;
    }
    
    // Get DOM elements
    const potChipDisplay = document.getElementById('pot-chips');
    const playerChipDisplay = document.querySelector(`#player-${playerIndex + 1} .chip-display`);
    
    if (!potChipDisplay) {
      console.error(`[ERROR] Pot chip display not found`);
      return false;
    }
    
    if (!playerChipDisplay) {
      console.error(`[ERROR] Chip display for player ${playerIndex + 1} not found`);
      return false;
    }
    
    // Get pot chips
    const potChips = Array.from(potChipDisplay.querySelectorAll('.chip'));
    console.log(`[ANIMATION] Found ${potChips.length} chips in pot to move`);
    
    // Create a container for the animations
    const animationContainer = document.createElement('div');
    animationContainer.id = `chip-animations-${Date.now()}`;
    animationContainer.style.position = 'fixed';
    animationContainer.style.top = '0';
    animationContainer.style.left = '0';
    animationContainer.style.width = '100%';
    animationContainer.style.height = '100%';
    animationContainer.style.pointerEvents = 'none';
    animationContainer.style.zIndex = '9999';
    document.body.appendChild(animationContainer);
    
    // Store animation elements for cleanup
    const animationElements = [];
    
    // Skip if no chips and add fallbacks
    if (potChips.length === 0) {
      console.log('[ANIMATION] No chips in pot to move. Adding fallback chips to winner.');
      
      // If pot is empty but should have chips based on pot value, add visual chips
      const potValue = pot || 0;
      if (potValue > 0) {
        // Add fallback chips to winner proportional to pot value
        const chipCount = Math.min(8, Math.max(3, Math.ceil(potValue / 20)));
        const colors = ['red', 'blue', 'green', 'black', 'white'];
        
        // Create the chips with a staggered animation
        for (let i = 0; i < chipCount; i++) {
          try {
            setTimeout(() => {
              // Only add if player display is still in DOM
              if (playerChipDisplay.isConnected) {
                const chip = document.createElement('div');
                chip.className = `chip ${colors[Math.floor(Math.random() * colors.length)]} win-chip`;
                chip.style.opacity = '0';
                chip.style.transform = 'scale(0.8)';
                chip.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                playerChipDisplay.appendChild(chip);
                
                // Trigger animation after a short delay
                setTimeout(() => {
                  chip.style.opacity = '1';
                  chip.style.transform = 'scale(1)';
                }, 50);
              }
            }, i * 150);
          } catch (fallbackError) {
            console.error('[ERROR] Failed to create fallback chip:', fallbackError);
          }
        }
      }
      
      // Clear pot display
      potChipDisplay.innerHTML = '';
      return true;
    }
    
    // Get positions for animation
    let potRect, playerRect;
    
    try {
      potRect = potChipDisplay.getBoundingClientRect();
      playerRect = playerChipDisplay.getBoundingClientRect();
    } catch (rectError) {
      console.error('[ERROR] Failed to get element positions:', rectError);
      return false;
    }
    
    // Before animation, create visual copies in pot that fade out gradually
    try {
      potChips.forEach((chip, i) => {
        if (!chip || !chip.parentNode) return;
        
        const staticCopy = chip.cloneNode(true);
        staticCopy.style.opacity = '0.5';
        staticCopy.classList.add('static-chip');
        potChipDisplay.appendChild(staticCopy);
        animationElements.push(staticCopy);
        
        // Remove static copies gradually
        setTimeout(() => {
          if (staticCopy.parentNode) {
            staticCopy.style.transition = 'opacity 0.5s ease-out';
            staticCopy.style.opacity = '0';
            
            setTimeout(() => {
              if (staticCopy.parentNode) {
                staticCopy.remove();
              }
            }, 500);
          }
        }, 300 + i * 30);
      });
    } catch (copyError) {
      console.error('[ERROR] Failed to create static copies:', copyError);
      // Continue with animation anyway
    }
    
    // Count successful animations
    let animatedChips = 0;
    
    // Animate chips moving to player with improved physics and staggering
    potChips.forEach((chip, i) => {
      try {
        if (!chip || !chip.getBoundingClientRect) {
          console.warn(`[WARNING] Invalid chip at index ${i}`);
          return;
        }
        
        // Get original chip position
        const chipRect = chip.getBoundingClientRect();
        
        // Create a visual clone for animation
        const chipClone = document.createElement('div');
        chipClone.className = chip.className + ' moving-chip';
        chipClone.style.position = 'fixed';
        chipClone.style.left = `${chipRect.left}px`;
        chipClone.style.top = `${chipRect.top}px`;
        chipClone.style.width = `${chipRect.width}px`;
        chipClone.style.height = `${chipRect.height}px`;
        chipClone.style.zIndex = '1000';
        chipClone.style.borderRadius = '50%';
        chipClone.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        
        // Add to animation container (not body)
        animationContainer.appendChild(chipClone);
        animationElements.push(chipClone);
        
        // Remove the original chip with slight delay
        setTimeout(() => {
          try {
            if (chip.parentNode) {
              chip.remove();
            }
          } catch (removeError) {
            console.warn(`[WARNING] Failed to remove original chip:`, removeError);
          }
        }, i * 20);
        
        // Animate to player position with staggered timing and slight arc
        setTimeout(() => {
          try {
            // More natural animation with easing and slight arc
            chipClone.style.transition = 'all 0.8s cubic-bezier(0.25, 0.1, 0.25, 1)';
            
            // Calculate offsets for chip distribution
            const offsetX = ((i % 4) - 1.5) * 6;
            const offsetY = Math.floor(i / 4) * 6;
            
            // Set target position with slight randomization
            const targetX = playerRect.left + (playerRect.width/2) - (chipRect.width/2) + offsetX;
            const targetY = playerRect.top + offsetY;
            
            // Add slight randomness to final position
            const finalX = targetX + (Math.random() * 6 - 3);
            const finalY = targetY + (Math.random() * 4 - 2);
            
            // Move with slight arc effect using transform
            chipClone.style.transform = 'translateY(-20px)';
            setTimeout(() => {
              chipClone.style.transform = 'translateY(0)';
            }, 400);
            
            chipClone.style.left = `${finalX}px`;
            chipClone.style.top = `${finalY}px`;
            
            // Track successful animation
            animatedChips++;
            
            // After animation completes
            setTimeout(() => {
              try {
                // Remove animation clone
                if (chipClone.parentNode) {
                  chipClone.remove();
                }
                
                // Add a new chip to the player if display still exists
                if (playerChipDisplay.isConnected) {
                  // Extract color class from original chip class
                  const colorClass = chip.className.match(/chip\s+(\w+)/);
                  const chipColor = colorClass && colorClass[1] ? colorClass[1] : 'red';
                  
                  const newPlayerChip = document.createElement('div');
                  newPlayerChip.className = `chip ${chipColor} won-chip`;
                  
                  // Add subtle appearance animation
                  newPlayerChip.style.opacity = '0.7';
                  newPlayerChip.style.transform = 'scale(0.9)';
                  newPlayerChip.style.transition = 'all 0.3s ease-out';
                  
                  playerChipDisplay.appendChild(newPlayerChip);
                  
                  // Trigger animation
                  setTimeout(() => {
                    newPlayerChip.style.opacity = '1';
                    newPlayerChip.style.transform = 'scale(1)';
                  }, 30);
                  
                  // Limit player chips to avoid overflow
                  const playerChips = playerChipDisplay.querySelectorAll('.chip');
                  if (playerChips.length > 12) {
                    if (playerChipDisplay.firstChild) {
                      playerChipDisplay.removeChild(playerChipDisplay.firstChild);
                    }
                  }
                }
              } catch (finalError) {
                console.error('[ERROR] Failed in final stage of chip animation:', finalError);
              }
            }, 800);
          } catch (animateError) {
            console.error('[ERROR] Failed to animate chip:', animateError);
          }
        }, 100 + i * 50);
      } catch (chipError) {
        console.error(`[ERROR] Failed to process chip ${i}:`, chipError);
      }
    });
    
    // Clear pot display after animations complete and remove container
    setTimeout(() => {
      try {
        if (potChipDisplay.isConnected) {
          potChipDisplay.innerHTML = '';
        }
        
        // Remove animation container
        if (animationContainer.parentNode) {
          // First remove any remaining animation elements
          animationElements.forEach(el => {
            if (el && el.parentNode) {
              el.remove();
            }
          });
          
          // Then remove container
          animationContainer.remove();
        }
        
        console.log(`[ANIMATION] Successfully animated ${animatedChips} of ${potChips.length} chips`);
      } catch (cleanupError) {
        console.error('[ERROR] Failed during animation cleanup:', cleanupError);
      }
    }, Math.max(1000, potChips.length * 60 + 900));
    
    return true;
  } catch (error) {
    console.error('[ERROR] Critical failure in moveChipsFromPotToPlayer:', error);
    
    // Emergency recovery - try to clear pot and add some chips to player
    try {
      // Find elements
      const potDisplay = document.getElementById('pot-chips');
      const playerDisplay = document.querySelector(`#player-${playerIndex + 1} .chip-display`);
      
      // Clear pot
      if (potDisplay) potDisplay.innerHTML = '';
      
      // Add some chips to player as fallback
      if (playerDisplay) {
        const colors = ['red', 'blue', 'green', 'black', 'white'];
        for (let i = 0; i < 3; i++) {
          const chip = document.createElement('div');
          chip.className = `chip ${colors[Math.floor(Math.random() * colors.length)]}`;
          playerDisplay.appendChild(chip);
        }
      }
    } catch (recoveryError) {
      console.error('[ERROR] Even emergency recovery failed:', recoveryError);
    }
    
    return false;
  }
}

/**
 * Animates moving chips from player to the pot when placing bets
 * @param {number} playerIndex - Index of the betting player (0-3)
 * @param {number} amount - Amount of the bet
 * @returns {boolean} - Whether the move was successfully initiated
 */
function moveChipsToPot(playerIndex, amount) {
  try {
    // Validate inputs
    if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex > 3) {
      console.error(`[ERROR] Invalid player index in moveChipsToPot: ${playerIndex}`);
      return false;
    }
    
    if (typeof amount !== 'number' || isNaN(amount)) {
      console.error(`[ERROR] Invalid bet amount in moveChipsToPot: ${amount}`);
      return false;
    }
    
    // Skip if amount is 0 or negative
    if (amount <= 0) {
      console.log('[ANIMATION] Skipping chip movement for zero amount');
      return false;
    }
    
    console.log(`[ANIMATION] Moving chips for Player ${playerIndex + 1}'s bet of $${amount}`);
    
    // Create a container for the animations
    const animationContainer = document.createElement('div');
    animationContainer.id = `bet-animations-${Date.now()}`;
    animationContainer.style.position = 'fixed';
    animationContainer.style.top = '0';
    animationContainer.style.left = '0';
    animationContainer.style.width = '100%';
    animationContainer.style.height = '100%';
    animationContainer.style.pointerEvents = 'none';
    animationContainer.style.zIndex = '9999';
    document.body.appendChild(animationContainer);
    
    // Get DOM elements
    const playerChipDisplay = document.querySelector(`#player-${playerIndex + 1} .chip-display`);
    const potChipDisplay = document.getElementById('pot-chips');
    
    if (!playerChipDisplay) {
      console.error(`[ERROR] Chip display for player ${playerIndex + 1} not found`);
      if (animationContainer.parentNode) animationContainer.remove();
      return false;
    }
    
    if (!potChipDisplay) {
      console.error(`[ERROR] Pot chip display not found`);
      if (animationContainer.parentNode) animationContainer.remove();
      return false;
    }
    
    // Get player chips
    const playerChips = Array.from(playerChipDisplay.querySelectorAll('.chip'));
    
    // Skip if no chips and add fallbacks
    if (playerChips.length === 0) {
      console.log('[ANIMATION] No player chips to animate, adding fallbacks');
      
      // Add a fallback chip to the pot anyway
      try {
        // Use timeout to separate from main execution
        setTimeout(() => {
          if (potChipDisplay.isConnected) {
            const colors = ['red', 'blue', 'green', 'black', 'white'];
            const newPotChip = document.createElement('div');
            newPotChip.className = `chip ${colors[Math.floor(Math.random() * colors.length)]}`;
            newPotChip.style.opacity = '0';
            newPotChip.style.transform = 'scale(0.8)';
            newPotChip.style.transition = 'all 0.3s ease-out';
            potChipDisplay.appendChild(newPotChip);
            
            // Trigger animation
            setTimeout(() => {
              newPotChip.style.opacity = '1';
              newPotChip.style.transform = 'scale(1)';
            }, 50);
          }
        }, 100);
      } catch (fallbackError) {
        console.error('[ERROR] Failed to create fallback chips:', fallbackError);
      }
      
      if (animationContainer.parentNode) animationContainer.remove();
      return false;
    }
    
    // Calculate how many chips to move based on bet size and current chip count
    // More chips moved for larger bets, scaled by player's total chips
    const chipRatio = amount / Math.max(1, chips[playerIndex]);
    const baseChipsToMove = Math.floor(amount / 20) + 1; // 1 chip per $20 plus 1
    
    const chipsToMove = Math.min(
      playerChips.length - 1, // Leave at least one chip
      Math.max(1, Math.min(5, Math.ceil(baseChipsToMove * (0.5 + chipRatio))))
    );
    
    console.log(`[ANIMATION] Moving ${chipsToMove} chips for bet of $${amount}`);
    
    try {
      // Get the position of the pot and player for animation
      const potRect = potChipDisplay.getBoundingClientRect();
      const playerRect = playerChipDisplay.getBoundingClientRect();
      
      // Store animation promises for cleanup
      const animationPromises = [];
      
      // Animate chips moving to pot with slight delays
      for (let i = 0; i < chipsToMove; i++) {
        // Create a promise for this animation
        const animationPromise = new Promise((resolve) => {
          // Always take the last chip (from the top of the stack)
          const chipIndex = playerChips.length - 1 - i;
          if (chipIndex < 0) {
            resolve();
            return;
          }
          
          const chip = playerChips[chipIndex];
          
          // Extract color from chip
          const colorClass = chip.className.match(/chip\s+(\w+)/);
          const chipColor = colorClass && colorClass[1] ? colorClass[1] : 'red';
          
          try {
            // Create a visual clone for animation
            const chipClone = document.createElement('div');
            chipClone.className = `chip ${chipColor} moving-chip`;
            chipClone.style.position = 'fixed';
            
            // Get chip position
            const chipRect = chip.getBoundingClientRect();
            
            // Set starting position
            chipClone.style.left = `${chipRect.left}px`;
            chipClone.style.top = `${chipRect.top}px`;
            chipClone.style.width = `${chipRect.width}px`;
            chipClone.style.height = `${chipRect.height}px`;
            chipClone.style.borderRadius = '50%';
            chipClone.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            
            // Add to animation container
            animationContainer.appendChild(chipClone);
            
            // Remove the original chip with delay
            setTimeout(() => {
              try {
                if (chip.parentNode) {
                  chip.remove();
                }
              } catch (removeError) {
                console.warn(`[WARNING] Failed to remove original chip:`, removeError);
              }
            }, Math.random() * 100);
            
            // Animate to pot position with slight delay and randomness
            setTimeout(() => {
              try {
                // Add smooth transition
                chipClone.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1.2)';
                
                // Add slight randomness to target position
                const targetX = potRect.left + (potRect.width/2) - (chipRect.width/2) + (Math.random() * 10 - 5);
                const targetY = potRect.top + (i * 3) + (Math.random() * 6 - 3); // Slightly varied stacking
                
                // Apply target position
                chipClone.style.left = `${targetX}px`;
                chipClone.style.top = `${targetY}px`;
                
                // After animation completes
                setTimeout(() => {
                  try {
                    // Remove animation clone
                    if (chipClone.parentNode) {
                      chipClone.remove();
                    }
                    
                    // Add a new chip to the pot if it still exists
                    if (potChipDisplay.isConnected) {
                      const newPotChip = document.createElement('div');
                      newPotChip.className = `chip ${chipColor}`;
                      
                      // Add appearance animation
                      newPotChip.style.opacity = '0.8';
                      newPotChip.style.transform = 'scale(0.9)';
                      newPotChip.style.transition = 'all 0.2s ease-out';
                      
                      potChipDisplay.appendChild(newPotChip);
                      
                      // Trigger animation
                      setTimeout(() => {
                        newPotChip.style.opacity = '1';
                        newPotChip.style.transform = 'scale(1)';
                      }, 30);
                      
                      // Limit pot chips for performance
                      if (potChipDisplay.children.length > 20) {
                        if (potChipDisplay.firstChild) {
                          potChipDisplay.removeChild(potChipDisplay.firstChild);
                        }
                      }
                    }
                    
                    // Resolve this animation
                    resolve();
                  } catch (finalError) {
                    console.error('[ERROR] Failed in final stage of chip animation:', finalError);
                    resolve(); // Still resolve to continue
                  }
                }, 500);
              } catch (animateError) {
                console.error('[ERROR] Failed to animate chip:', animateError);
                resolve(); // Resolve even on error
              }
            }, 100 + (i * 80) + (Math.random() * 50));
          } catch (chipError) {
            console.error(`[ERROR] Failed to process chip ${i}:`, chipError);
            resolve(); // Resolve even on error
          }
        });
        
        animationPromises.push(animationPromise);
      }
      
      // Clean up animation container when all animations complete
      Promise.all(animationPromises).then(() => {
        setTimeout(() => {
          try {
            if (animationContainer.parentNode) {
              animationContainer.remove();
            }
            console.log(`[ANIMATION] Completed bet animation for Player ${playerIndex + 1}`);
          } catch (cleanupError) {
            console.error('[ERROR] Failed to clean up animation container:', cleanupError);
          }
        }, 200);
      }).catch(error => {
        console.error('[ERROR] Animation promise error:', error);
        // Attempt cleanup anyway
        if (animationContainer.parentNode) {
          animationContainer.remove();
        }
      });
      
      return true;
    } catch (positionError) {
      console.error('[ERROR] Failed to calculate positions for animation:', positionError);
      
      // Fallback - just add a chip to pot without animation
      try {
        if (potChipDisplay.isConnected) {
          for (let i = 0; i < Math.min(3, chipsToMove); i++) {
            const fallbackChip = document.createElement('div');
            fallbackChip.className = 'chip red';
            potChipDisplay.appendChild(fallbackChip);
          }
        }
      } catch (fallbackError) {
        console.error('[ERROR] Even fallback failed:', fallbackError);
      }
      
      // Clean up
      if (animationContainer.parentNode) {
        animationContainer.remove();
      }
      
      return false;
    }
  } catch (error) {
    console.error('[ERROR] Critical failure in moveChipsToPot:', error);
    return false;
  }
}

/**
 * Updates the betting slider with the correct minimum and maximum values
 * @returns {boolean} - Whether the update was successful
 */
function updateSliderMin() {
  try {
    console.log("[UI] Updating betting slider constraints");
    
    // Get the slider elements
    const slider = document.getElementById('bet-slider');
    const valueDisplay = document.getElementById('bet-value-display');
    
    if (!slider || !valueDisplay) {
      console.error("[ERROR] Betting slider elements not found");
      return false;
    }
    
    // Get human player chip count
    const playerChips = chips[3];
    
    // Validate player chips
    if (typeof playerChips !== 'number' || isNaN(playerChips) || playerChips <= 0) {
      console.error(`[ERROR] Invalid chip value for human player: ${playerChips}`);
      
      // Set minimum values and disable
      slider.min = 1;
      slider.max = 1;
      slider.value = 1;
      slider.disabled = true;
      valueDisplay.textContent = "Bet: $1";
      
      // Disable confirmation button
      const confirmButton = document.getElementById('confirm-bet-btn');
      if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = "No chips to bet";
      }
      
      return false;
    }
    
    // Determine if player can act based on game state
    const canAct = currentPlayer === 3 && !playerStates[3].folded;
    
    // Calculate the minimum raise amount
    let minRaiseAmount = 1; // Default for first bet
    let sliderMode = "bet"; // Default mode
    
    if (currentBet > 0) {
      // If there's an active bet, calculate minimum raise
      const toCall = currentBet - currentBets[3]; // Amount needed to call
      const minRaise = Math.max(lastRaiseAmount, 1); // The raise must be at least the last raise
      minRaiseAmount = toCall + minRaise;
      sliderMode = "raise";
      
      console.log(`[UI] Setting minimum raise: toCall $${toCall} + minRaise $${minRaise} = $${minRaiseAmount}`);
    }
    
    // Safety check for negative or NaN values
    if (isNaN(minRaiseAmount) || minRaiseAmount < 1) {
      console.warn(`[WARNING] Invalid minimum raise amount: ${minRaiseAmount}, resetting to 1`);
      minRaiseAmount = 1;
    }
    
    // Set the slider's minimum value
    slider.min = minRaiseAmount;
    
    // Calculate appropriate maximum value
    let maxBet = Math.max(playerChips, minRaiseAmount);
    
    // Ensure max is not more than player's chips
    if (maxBet > playerChips) {
      maxBet = playerChips;
    }
    
    // Set max value
    slider.max = maxBet;
    
    // Choose an appropriate default value
    let defaultValue;
    
    if (sliderMode === "raise") {
      // Default raise to minimum + 40% of pot where possible
      const potSize = pot + currentBets.reduce((sum, bet) => sum + bet, 0);
      const potBased = minRaiseAmount + Math.ceil(potSize * 0.4);
      defaultValue = Math.min(potBased, maxBet);
    } else {
      // Default bet to 50% of pot for initial bets
      const potSize = pot + currentBets.reduce((sum, bet) => sum + bet, 0);
      defaultValue = Math.min(Math.max(Math.ceil(potSize * 0.5), 5), maxBet);
    }
    
    // Ensure current value is not less than minimum or more than maximum
    slider.value = Math.min(Math.max(defaultValue, minRaiseAmount), maxBet);
    
    // Update display text
    valueDisplay.textContent = `Bet: $${slider.value}`;
    
    // Update confirm button text and state
    const confirmButton = document.getElementById('confirm-bet-btn');
    if (confirmButton) {
      if (sliderMode === "raise") {
        // Show final amount after raise
        const finalAmount = parseInt(currentBets[3]) + parseInt(slider.value);
        confirmButton.textContent = `Raise to $${finalAmount}`;
      } else {
        confirmButton.textContent = `Bet $${slider.value}`;
      }
      
      // Enable/disable based on turn
      confirmButton.disabled = !canAct || playerChips <= 0;
    }
    
    // Enable/disable slider based on turn
    slider.disabled = !canAct || playerChips <= 0;
    
    // Add visual indication of disabled state
    if (!canAct || playerChips <= 0) {
      slider.classList.add('disabled');
      if (confirmButton) confirmButton.classList.add('disabled');
    } else {
      slider.classList.remove('disabled');
      if (confirmButton) confirmButton.classList.remove('disabled');
    }
    
    console.log(`[UI] Slider updated: min=$${slider.min}, max=$${slider.max}, value=$${slider.value}, mode=${sliderMode}`);
    return true;
  } catch (error) {
    console.error("[ERROR] Failed to update betting slider:", error);
    
    // Try minimal fallback update
    try {
      const slider = document.getElementById('bet-slider');
      const valueDisplay = document.getElementById('bet-value-display');
      const confirmButton = document.getElementById('confirm-bet-btn');
      
      if (slider) slider.disabled = true;
      if (confirmButton) confirmButton.disabled = true;
      if (valueDisplay) valueDisplay.textContent = "Bet unavailable";
    } catch (fallbackError) {
      console.error("[ERROR] Even slider fallback failed:", fallbackError);
    }
    
    return false;
  }
}

/**
 * Processes player's poker action (check, call, fold, bet, or raise)
 * @param {string} action - Action to take
 * @returns {boolean} - Whether the action was successful
 */
function playerAction(action) {
  try {
    // Validate action type
    if (!action || (action !== 'bet-slider' && action !== 'call' && 
                    action !== 'fold' && action !== 'check')) {
      console.error(`[ERROR] Invalid action in playerAction: ${action}`);
      return false;
    }
    
    console.log(`[PLAYER] Attempting action: ${action}`);
    
    // Check if it's the player's turn
    if (currentPlayer !== 3) {
      updateInfo("It's not your turn!");
      console.warn(`[WARNING] Player tried to act when it's not their turn. Current player: ${currentPlayer + 1}`);
      return false;
    }
    
    // Check if player is folded
    if (playerStates[3].folded) {
      updateInfo("You can't act - you've folded!");
      console.warn(`[WARNING] Player tried to act after folding`);
      return false;
    }
    
    // Check if betting round is active
    if (!bettingRoundActive) {
      updateInfo("Waiting for next round...");
      console.warn(`[WARNING] Player tried to act when betting round is not active`);
      return false;
    }
    
    // Player has acted regardless of action
    playerHasActed[currentPlayer] = true;
    
    // Process specific action
    if (action === 'bet-slider') {
      return handlePlayerBetSlider();
    } else if (action === 'call') {
      return handlePlayerCall();
    } else if (action === 'fold') {
      return handlePlayerFold();
    } else if (action === 'check') {
      return handlePlayerCheck();
    }
    
    return false; // Shouldn't reach here due to validation
  } catch (error) {
    console.error(`[ERROR] Error processing player action:`, error);
    
    // If possible, show error to player
    try {
      updateInfo("An error occurred. Please try again.");
    } catch (e) {}
    
    return false;
  }
  
  // Individual action handlers for better organization
  function handlePlayerBetSlider() {
    try {
      // Get value from slider
      const slider = document.getElementById('bet-slider');
      if (!slider) {
        console.error("[ERROR] Bet slider not found");
        updateInfo("Betting error - slider not found!");
        return false;
      }
      
      const betAmount = parseInt(slider.value, 10);
      
      // Validate bet amount
      if (isNaN(betAmount) || betAmount <= 0) {
        console.error(`[ERROR] Invalid bet amount: ${betAmount}`);
        updateInfo("Invalid bet amount!");
        return false;
      }
      
      console.log(`[PLAYER] Player using bet slider with amount: $${betAmount}`);
      
      // Determine if this is a bet or raise based on current game state
      const actionType = currentBet > 0 ? 'raise' : 'bet';
      
      // Store action for tracking before execution
      window.lastPlayerAction = {
        player: 3, // human player
        action: actionType,
        amount: betAmount,
        timestamp: Date.now()
      };
      
      if (actionType === 'bet') {
        // This is a bet (no existing bet)
        console.log(`[PLAYER] Handling as bet of $${betAmount}`);
        
        // Check minimum bet if needed
        if (betAmount < 1) {
          updateInfo("Minimum bet is $1!");
          return false;
        }
        
        // Check if player has enough chips
        if (betAmount > chips[3]) {
          updateInfo(`You only have $${chips[3]} chips!`);
          return false;
        }
        
        if (handleBet(currentPlayer, betAmount)) {
          // Set lastToAct and lastRaiseAmount
          lastToAct = currentPlayer;
          lastRaiseAmount = betAmount;
          
          // Update isStartOfBettingRound flag
          if (isStartOfBettingRound) {
            isStartOfBettingRound = false;
            console.log(`[GAME] No longer start of betting round after player bet`);
          }
          
          checkBettingRoundEnd(currentPlayer);
          return true;
        } else {
          console.error(`[ERROR] handleBet failed for player`);
          updateInfo("Error placing bet!");
          return false;
        }
      } else {
        // This is a raise (existing bet)
        console.log(`[PLAYER] Handling as raise of $${betAmount}`);
        
        // Calculate minimum raise amount
        const toCall = currentBet - currentBets[3]; 
        const minRaiseAmount = Math.max(lastRaiseAmount, 1);
        const totalRequired = toCall + minRaiseAmount;
        
        // Validate raise meets minimum requirements
        if (betAmount < minRaiseAmount) {
          updateInfo(`Raise must be at least $${minRaiseAmount}!`);
          console.warn(`[WARNING] Player tried to raise less than minimum: $${betAmount} < $${minRaiseAmount}`);
          return false;
        }
        
        // Check if player has enough chips for raise
        const totalBet = toCall + betAmount;
        if (totalBet > chips[3]) {
          updateInfo(`You don't have enough chips to raise that much!`);
          return false;
        }
        
        if (handleRaise(currentPlayer, betAmount)) {
          // lastToAct and lastRaiseAmount are set in handleRaise
          
          // Update isStartOfBettingRound flag
          if (isStartOfBettingRound) {
            isStartOfBettingRound = false;
            console.log(`[GAME] No longer start of betting round after player raise`);
          }
          
          checkBettingRoundEnd(currentPlayer);
          return true;
        } else {
          console.error(`[ERROR] handleRaise failed for player`);
          updateInfo("Error placing raise!");
          return false;
        }
      }
    } catch (betSliderError) {
      console.error(`[ERROR] Error in handlePlayerBetSlider:`, betSliderError);
      updateInfo("Error processing bet!");
      return false;
    }
  }
  
  function handlePlayerCall() {
    try {
      console.log(`[PLAYER] Player calling`);
      
      // Check if there's anything to call
      const toCall = currentBet - currentBets[3];
      if (toCall <= 0) {
        // Nothing to call, treat as check
        console.log(`[PLAYER] Converting call to check as there's nothing to call`);
        return handlePlayerCheck();
      }
      
      // Store action for tracking
      window.lastPlayerAction = {
        player: 3, // human player
        action: 'call',
        amount: toCall,
        timestamp: Date.now()
      };
      
      // Process the call
      if (handleCall(currentPlayer)) {
        // Don't update lastToAct - call doesn't set a new bet level
        
        // Update isStartOfBettingRound flag
        if (isStartOfBettingRound) {
          isStartOfBettingRound = false;
          console.log(`[GAME] No longer start of betting round after player call`);
        }
        
        checkBettingRoundEnd(currentPlayer);
        return true;
      } else {
        console.error(`[ERROR] handleCall failed for player`);
        updateInfo("Error calling bet!");
        return false;
      }
    } catch (callError) {
      console.error(`[ERROR] Error in handlePlayerCall:`, callError);
      updateInfo("Error processing call!");
      return false;
    }
  }
  
  function handlePlayerFold() {
    try {
      console.log(`[PLAYER] Player folding`);
      
      // Store action for tracking
      window.lastPlayerAction = {
        player: 3, // human player
        action: 'fold',
        timestamp: Date.now()
      };
      
      // Process the fold - no need to check return value as handleFold
      // takes care of transitioning game state
      handleFold(currentPlayer);
      return true;
    } catch (foldError) {
      console.error(`[ERROR] Error in handlePlayerFold:`, foldError);
      updateInfo("Error processing fold!");
      return false;
    }
  }
  
  function handlePlayerCheck() {
    try {
      console.log(`[PLAYER] Player checking`);
      
      // Special handling for start of betting round
      if (isStartOfBettingRound) {
        console.log(`[GAME] Start of betting round - forcing check to work`);
        currentBet = 0; // Force reset
        
        // Store action for tracking
        window.lastPlayerAction = {
          player: 3, // human player
          action: 'check',
          timestamp: Date.now()
        };

        // Process the check
        updateInfo(currentPlayer, 'check');
        isStartOfBettingRound = false; // No longer start of round
        checkBettingRoundEnd(currentPlayer);
        return true;
      }

      // Normal check logic - validate there's no bet to call
      if (currentBets[currentPlayer] < currentBet) {
        const toCall = currentBet - currentBets[currentPlayer];
        updateInfo(`You can't check - there's a bet of $${toCall} to call!`);
        console.warn(`[WARNING] Player tried to check when there's a bet to call: $${toCall}`);
        return false;
      }
      
      // Store action for tracking
      window.lastPlayerAction = {
        player: 3, // human player
        action: 'check',
        timestamp: Date.now()
      };

      // Process the check
      updateInfo(currentPlayer, 'check');
      checkBettingRoundEnd(currentPlayer);
      return true;
    } catch (checkError) {
      console.error(`[ERROR] Error in handlePlayerCheck:`, checkError);
      updateInfo("Error processing check!");
      return false;
    }
  }
}

/**
 * Initialize the game UI and state when the document is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log("[INIT] Document loaded, initializing game");
  
  // Define initialization phases with delays and functions
  const initPhases = [
    { delay: 100, fn: setupBasicUI, name: "basic UI" },
    { delay: 500, fn: initializeChipStacks, name: "chip stacks" },
    { delay: 800, fn: setupGameControls, name: "game controls" },
    { delay: 1000, fn: () => updatePositionIndicators(3, 2, 1), name: "position indicators" },
    { delay: 1200, fn: startNewGame, name: "new game" }
  ];
  
  // Schedule all initialization phases
  initPhases.forEach(phase => {
    setTimeout(() => {
      try {
        phase.fn();
      } catch (e) {
        console.error(`[ERROR] Failed to initialize ${phase.name}:`, e);
        
        // Special handling for game start failure
        if (phase.name === "new game") {
          try {
            console.warn("[RECOVERY] Attempting emergency game start");
            forceResetBettingState();
            startBettingRound();
          } catch (emergencyError) {
            console.error("[ERROR] Emergency game start failed:", emergencyError);
          }
        }
      }
    }, phase.delay);
  });
  
  /**
   * Start a new game
   */
  function startNewGame() {
    console.log("[INIT] Starting new game");
    newGame();
  }
});

/**
 * Updates the position indicators (dealer, small blind, big blind) for the players
 * @param {number} dealerIndex - Index of the dealer (0-3)
 * @param {number} smallBlindIndex - Index of the small blind (0-3)
 * @param {number} bigBlindIndex - Index of the big blind (0-3)
 */
function updatePositionIndicators(dealerIndex, smallBlindIndex, bigBlindIndex) {
  console.log(`[UI] Updating position indicators - Dealer: ${dealerIndex + 1}, SB: ${smallBlindIndex + 1}, BB: ${bigBlindIndex + 1}`);
  
  // Reset all position indicators first
  for (let i = 0; i < 4; i++) {
    const playerElement = document.getElementById(`player-${i + 1}`);
    if (playerElement) {
      const dealerBtn = playerElement.querySelector('.dealer-button');
      const smallBlindBtn = playerElement.querySelector('.small-blind');
      const bigBlindBtn = playerElement.querySelector('.big-blind');
      
      if (dealerBtn) dealerBtn.classList.remove('active');
      if (smallBlindBtn) smallBlindBtn.classList.remove('active');
      if (bigBlindBtn) bigBlindBtn.classList.remove('active');
    }
  }
  
  // Set active positions
  const dealerElement = document.getElementById(`player-${dealerIndex + 1}`);
  const smallBlindElement = document.getElementById(`player-${smallBlindIndex + 1}`);
  const bigBlindElement = document.getElementById(`player-${bigBlindIndex + 1}`);
  
  if (dealerElement) {
    const dealerBtn = dealerElement.querySelector('.dealer-button');
    if (dealerBtn) dealerBtn.classList.add('active');
  }
  
  if (smallBlindElement) {
    const smallBlindBtn = smallBlindElement.querySelector('.small-blind');
    if (smallBlindBtn) smallBlindBtn.classList.add('active');
  }
  
  if (bigBlindElement) {
    const bigBlindBtn = bigBlindElement.querySelector('.big-blind');
    if (bigBlindBtn) bigBlindBtn.classList.add('active');
  }
}

/**
 * Set up basic UI elements
 */
function setupBasicUI() {
  console.log("[INIT] Setting up basic UI");
    
  // Hide unnecessary elements
  const elementsToHide = [
    // Automated buttons
    'next-round-btn', 'new-game-btn',
    // Deprecated controls
    'raise-input', 'raise-btn', 'bet-btn'
  ];
    
  elementsToHide.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
  });
    
  // Add emergency fix function
  window.fixCheckIssue = function() {
    console.log("[GAME] Manual fix applied to betting state");
    currentBet = 0;
    for (let i = 0; i < 4; i++) {
      currentBets[i] = 0;
    }
    updateChipsAndBets();
    updateInfo("Betting state has been manually fixed. You can now check.");
  };
    
  // Add keyboard shortcuts
  setupKeyboardShortcuts();
    
  // Add chip displays if available
  if (typeof addChipDisplays === 'function') {
    try {
      addChipDisplays();
    } catch (e) {
      console.warn("[WARNING] Failed to add chip displays:", e);
    }
  }
}
  
/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(event) {
    try {
      // Fix is always available
      if (event.key === 'f' || event.key === 'F') {
        window.fixCheckIssue();
        return;
      }
      
      // Only process game action shortcuts if it's player's turn
      const isPlayerTurn = currentPlayer === 3 && !playerStates[3].folded;
      if (!isPlayerTurn) return;
      
      const key = event.key.toLowerCase();
      
      switch (key) {
        case 'c':
          // Check or call based on current state
          playerAction(currentBet > currentBets[3] ? 'call' : 'check');
          break;
        case 'b':
          // Bet using slider
          playerAction('bet-slider');
          break;
        case 'x':
          // Fold
          playerAction('fold');
          break;
      }
    } catch (e) {
      console.error("[ERROR] Keyboard shortcut failed:", e);
    }
  });
}
  
/**
 * Set up game controls and action buttons
 */
function setupGameControls() {
  console.log("[INIT] Setting up game controls");
    
  // Setup action buttons with consistent pattern
  const actionButtons = [
    { id: 'check-btn', action: 'check', tooltip: 'Check (C)' },
    { id: 'call-btn', action: 'call', tooltip: 'Call (C)' },
    { id: 'fold-btn', action: 'fold', tooltip: 'Fold (X)' }
  ];
    
  actionButtons.forEach(button => {
    const element = document.getElementById(button.id);
    if (!element) {
      console.warn(`[WARNING] ${button.id} not found`);
      return;
    }
    
    // Clone to remove old listeners
    const newButton = element.cloneNode(true);
    element.parentNode?.replaceChild(newButton, element);
    
    // Add click handler and tooltip
    newButton.addEventListener('click', () => {
      console.log(`[UI] ${button.id} clicked`);
      playerAction(button.action);
    });
    
    newButton.title = button.tooltip;
  });
    
  // Add tooltip for bet button
  const betButton = document.getElementById('confirm-bet-btn');
  if (betButton) betButton.title = 'Bet/Raise (B)';
    
  // Initialize betting slider
  try {
    if (typeof initializeBettingSlider === 'function') {
      initializeBettingSlider();
    }
  } catch (sliderError) {
    console.error("[ERROR] Failed to initialize betting slider:", sliderError);
  }
}