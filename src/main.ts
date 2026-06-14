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

// Update Heart Hearts HUD
function updateHealthHUD(health: number) {
  let html = '';
  for (let i = 0; i < 10; i++) {
    const hp = health - i * 2;
    if (hp >= 2) {
      html += '❤️';
    } else if (hp === 1) {
      html += '💔';
    } else {
      html += '🖤';
    }
  }
  healthBar.innerHTML = html;
}

// Update Hunger HUD
function updateHungerHUD(hunger: number) {
  let html = '';
  for (let i = 0; i < 10; i++) {
    const hg = hunger - i * 2;
    if (hg >= 2) {
      html += '🍗';
    } else if (hg === 1) {
      html += '🍖';
    } else {
      html += '🦴';
    }
  }
  hungerBar.innerHTML = html;
}

// Flash Screen Red Vignette on Damage
function triggerDamageFlash() {
  vignette.classList.add('damage');
  setTimeout(() => {
    vignette.classList.remove('damage');
  }, 350);
}

// Start Game Mode with Orbit Camera Glide Transition
function startGame(isOnline: boolean) {
  if (!engine) return;

  // Play button click sound (jump synth)
  gameAudio.playJump();

  // Lock screen orientation to landscape on mobile devices
  try {
    ScreenOrientation.lock({ orientation: 'landscape' });
  } catch (err) {
    console.warn("Screen orientation lock is not supported on this platform:", err);
  }

  const nickname = nicknameInput.value.trim() || 'Guest';
  const serverUrl = serverUrlInput.value.trim();

  // Start smooth camera glide transition in 3D engine
  engine.startTransition();

  // Smoothly fade out the lobby card
  lobbyMenu.classList.add('fade-out');
  setTimeout(() => {
    lobbyMenu.classList.add('hidden');
  }, 800);

  // Fade in the gameplay HUD
  hudElement.classList.remove('hidden');
  setTimeout(() => {
    hudElement.classList.add('visible');
  }, 50);

  // Wire up survival listeners
  engine.player.onHealthChange = (health) => updateHealthHUD(health);
  engine.player.onHungerChange = (hunger) => updateHungerHUD(hunger);
  engine.player.onTakeDamage = () => triggerDamageFlash();

  // Initial HUD stats
  updateHealthHUD(engine.player.health);
  updateHungerHUD(engine.player.hunger);

  if (isOnline) {
    engine.multiplayer.onConnectionState = (connected, msg) => {
      connectionBanner.innerText = msg;
      if (connected) {
        connectionBanner.classList.add('hidden');
        statusIndicator.className = 'online';
        statusText.innerText = `Online (${nickname})`;
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

    engine.multiplayer.connect(serverUrl);
  } else {
    statusIndicator.className = 'offline';
    statusText.innerText = 'Offline';
    connectionBanner.classList.add('hidden');
  }
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

// Initialize game on page load (starts orbiting background rendering)
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container')!;
  
  // Create engine and start the orbit rendering loop
  engine = new GameEngine(container);
  engine.start();

  // Pre-load UI configurations
  initHotbar();
  setupAudioHandlers();
  setupChatHandlers();

  // Default block
  engine.player.selectedBlock = HOTBAR_ITEMS[0].type;
});

// Event Listeners for play buttons
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
