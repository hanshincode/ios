import { GameEngine } from './game/GameEngine';
import { BlockType } from './game/VoxelWorld';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { gameAudio } from './game/Sound';

// List of blocks in hotbar
const HOTBAR_ITEMS = [
  { type: BlockType.GRASS, icon: '🟩', name: 'Cỏ' },
  { type: BlockType.DIRT, icon: '🟫', name: 'Đất' },
  { type: BlockType.STONE, icon: '🩶', name: 'Đá' },
  { type: BlockType.WOOD, icon: '🪵', name: 'Gỗ' },
  { type: BlockType.LEAVES, icon: '🍃', name: 'Lá' },
  { type: BlockType.BRICK, icon: '🧱', name: 'Gạch' },
  { type: BlockType.GLASS, icon: '🪟', name: 'Kính' },
];

let engine: GameEngine | null = null;

// DOM Elements
const lobbyMenu = document.getElementById('lobby-menu')!;
const hudElement = document.getElementById('hud')!;
const btnPlayOnline = document.getElementById('btn-play-online')!;
const btnPlayOffline = document.getElementById('btn-play-offline')!;
const nicknameInput = (document.getElementById('nickname') as HTMLInputElement);
const serverUrlInput = (document.getElementById('server-url') as HTMLInputElement);
const connectionBanner = document.getElementById('connection-banner')!;

const statusIndicator = document.getElementById('status-indicator')!;
const statusText = document.getElementById('status-text')!;

const chatMessages = document.getElementById('chat-messages')!;
const chatInputWrapper = document.getElementById('chat-input-wrapper')!;
const chatInput = (document.getElementById('chat-input') as HTMLInputElement);
const chatSend = document.getElementById('chat-send')!;
const chatToggleBtn = document.getElementById('chat-toggle-btn')!;

// Audio and Survival HUD Elements
const audioToggleBtn = document.getElementById('audio-toggle-btn')!;
const healthBar = document.getElementById('health-bar')!;
const hungerBar = document.getElementById('hunger-bar')!;
const vignette = document.getElementById('vignette')!;

// Initialize Hotbar UI
function initHotbar() {
  const hotbar = document.getElementById('hotbar')!;
  hotbar.innerHTML = '';

  HOTBAR_ITEMS.forEach((item, index) => {
    const slot = document.createElement('div');
    slot.className = `hotbar-slot ${index === 0 ? 'active' : ''}`;
    slot.dataset.blockType = item.type.toString();
    slot.innerHTML = `
      <span class="slot-icon">${item.icon}</span>
      <span class="slot-name">${item.name}</span>
    `;

    slot.addEventListener('touchstart', (e) => {
      e.preventDefault();
      selectHotbarSlot(slot, item.type);
    });

    slot.addEventListener('click', () => {
      selectHotbarSlot(slot, item.type);
    });

    hotbar.appendChild(slot);
  });
}

function selectHotbarSlot(slot: HTMLElement, type: BlockType) {
  document.querySelectorAll('.hotbar-slot').forEach(s => s.classList.remove('active'));
  slot.classList.add('active');
  if (engine) {
    engine.player.selectedBlock = type;
  }
}

// Update Heart Hearts HUD (max 20 health points = 10 hearts)
function updateHealthHUD(health: number) {
  let html = '';
  for (let i = 0; i < 10; i++) {
    const hp = health - i * 2;
    if (hp >= 2) {
      html += '❤️'; // Full Heart
    } else if (hp === 1) {
      html += '💔'; // Half Heart
    } else {
      html += '🖤'; // Empty Heart
    }
  }
  healthBar.innerHTML = html;
}

// Update Hunger HUD (max 20 points = 10 drumsticks)
function updateHungerHUD(hunger: number) {
  let html = '';
  for (let i = 0; i < 10; i++) {
    const hg = hunger - i * 2;
    if (hg >= 2) {
      html += '🍗'; // Full Drumstick
    } else if (hg === 1) {
      html += '🍖'; // Half Drumstick
    } else {
      html += '🦴'; // Empty/Bone
    }
  }
  hungerBar.innerHTML = html;
}

// Flash Screen Red Vignette on Damage
function triggerDamageFlash() {
  vignette.classList.add('damage');
  setTimeout(() => {
    vignette.classList.remove('damage');
  }, 350); // Match animation duration in CSS
}

// Start Game Mode
function startGame(isOnline: boolean) {
  // Lock screen orientation to landscape on mobile devices
  try {
    ScreenOrientation.lock({ orientation: 'landscape' });
  } catch (err) {
    console.warn("Screen orientation lock is not supported on this platform:", err);
  }

  const nickname = nicknameInput.value.trim() || 'Guest';
  const serverUrl = serverUrlInput.value.trim();

  // Hide Lobby, Show HUD
  lobbyMenu.classList.add('hidden');
  hudElement.classList.remove('hidden');

  // Initialize Game Engine
  const container = document.getElementById('game-container')!;
  engine = new GameEngine(container);
  
  // Set default selected block to the first item (Grass)
  engine.player.selectedBlock = HOTBAR_ITEMS[0].type;

  // Setup HUD and hotbars
  initHotbar();
  updateHealthHUD(engine.player.health);
  updateHungerHUD(engine.player.hunger);

  // Wire up survival listeners
  engine.player.onHealthChange = (health) => updateHealthHUD(health);
  engine.player.onHungerChange = (hunger) => updateHungerHUD(hunger);
  engine.player.onTakeDamage = () => triggerDamageFlash();

  // Setup Chat toggles
  setupChatHandlers();

  // Setup Audio controls
  setupAudioHandlers();

  if (isOnline) {
    // Setup Multiplayer Callbacks
    engine.multiplayer.onConnectionState = (connected, msg) => {
      connectionBanner.innerText = msg;
      if (connected) {
        connectionBanner.classList.add('hidden');
        statusIndicator.className = 'online';
        statusText.innerText = `Online (${nickname})`;
        
        // Let server know our name
        engine?.multiplayer.sendChat(`/name ${nickname}`);
      } else {
        connectionBanner.classList.remove('hidden');
        statusIndicator.className = 'offline';
        statusText.innerText = 'Connecting...';
      }
    };

    engine.multiplayer.onChatMessage = (sender, msg) => {
      addChatMessage(sender, msg);
    };

    // Connect to server
    engine.multiplayer.connect(serverUrl);
  } else {
    // Offline mode
    statusIndicator.className = 'offline';
    statusText.innerText = 'Offline';
    connectionBanner.classList.add('hidden');
  }

  // Start engine loop
  engine.start();
}

// Chat UI Controls
function setupChatHandlers() {
  chatToggleBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleChatInput();
  });

  chatToggleBtn.addEventListener('click', () => {
    toggleChatInput();
  });

  chatSend.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}

function toggleChatInput() {
  if (chatInputWrapper.classList.contains('hidden')) {
    chatInputWrapper.classList.remove('hidden');
    chatInput.focus();
  } else {
    chatInputWrapper.classList.add('hidden');
    chatInput.blur();
  }
}

function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (msg && engine) {
    if (engine.multiplayer.isConnected()) {
      engine.multiplayer.sendChat(msg);
    } else {
      addChatMessage('Me (Offline)', msg);
    }
    chatInput.value = '';
    toggleChatInput();
  }
}

function addChatMessage(sender: string, message: string) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg';
  
  const isSystem = sender === 'SYSTEM';
  msgDiv.innerHTML = `
    <span class="sender ${isSystem ? 'system' : ''}">${sender}:</span>
    <span class="text">${escapeHtml(message)}</span>
  `;
  
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Setup audio mute toggle button
function setupAudioHandlers() {
  const toggleMute = () => {
    const isMuted = gameAudio.toggleMute();
    audioToggleBtn.innerText = isMuted ? '🔇' : '🔊';
  };
  
  audioToggleBtn.addEventListener('click', toggleMute);
  audioToggleBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleMute();
  });
}

// Event Listeners for menu entry
btnPlayOnline.addEventListener('click', () => startGame(true));
btnPlayOffline.addEventListener('click', () => startGame(false));

// Listen to keyboard digits 1-7 for hotbar select
window.addEventListener('keydown', (e) => {
  const num = parseInt(e.key);
  if (num >= 1 && num <= HOTBAR_ITEMS.length) {
    const targetIndex = num - 1;
    const slots = document.querySelectorAll('.hotbar-slot');
    if (slots[targetIndex]) {
      const slot = slots[targetIndex] as HTMLElement;
      selectHotbarSlot(slot, HOTBAR_ITEMS[targetIndex].type);
    }
  }
});
