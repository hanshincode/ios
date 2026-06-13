import * as THREE from 'three';
import { Player } from './Player';

export class Controls {
  private player: Player;
  private canvas: HTMLCanvasElement;

  // Keyboard state
  private keys: Record<string, boolean> = {};
  
  // Touch state
  private joystickActive = false;
  private joystickStart = new THREE.Vector2();
  private joystickCurrent = new THREE.Vector2();
  private joystickMaxDist = 60; // Max pixels to drag
  
  private lookTouchId: number | null = null;
  private lookLastPos = new THREE.Vector2();
  
  // Public movement vector (x = right/left, z = forward/back)
  public moveDir = new THREE.Vector3();
  
  // DOM Elements for mobile UI
  private joystickKnob!: HTMLElement;
  private joystickBase!: HTMLElement;

  constructor(player: Player, canvas: HTMLCanvasElement) {
    this.player = player;
    this.canvas = canvas;

    this.setupKeyboard();
    this.setupMouse();
    this.setupTouch();
  }

  private setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      
      // Jump
      if (e.code === 'Space') {
        this.player.jump();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  private setupMouse() {
    // Pointer lock for desktop debugging
    this.canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        const sensitivity = 0.002;
        this.player.yaw -= e.movementX * sensitivity;
        this.player.pitch -= e.movementY * sensitivity;

        // Clamp pitch to avoid flipping upside down (-85 to +85 degrees)
        this.player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.player.pitch));
      }
    });
  }

  private setupTouch() {
    this.joystickBase = document.getElementById('joystick-base')!;
    this.joystickKnob = document.getElementById('joystick-knob')!;

    if (!this.joystickBase) return;

    // Joystick Touch Events
    this.joystickBase.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.targetTouches[0];
      this.joystickActive = true;
      this.joystickStart.set(touch.clientX, touch.clientY);
      this.joystickCurrent.set(touch.clientX, touch.clientY);
      this.joystickKnob.style.transition = 'none';
    }, { passive: false });

    // Look Touch Events (Right side of screen)
    window.addEventListener('touchstart', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        
        // If touch is on right 60% of the screen and we aren't tracking a look touch yet
        if (touch.clientX > window.innerWidth * 0.4 && this.lookTouchId === null) {
          // Exclude buttons
          const target = touch.target as HTMLElement;
          if (target && (target.closest('.btn-action') || target.closest('#hotbar') || target.closest('#chat-btn'))) {
            continue;
          }
          
          this.lookTouchId = touch.identifier;
          this.lookLastPos.set(touch.clientX, touch.clientY);
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Handle Joystick move
        if (this.joystickActive && touch.target === this.joystickBase) {
          this.joystickCurrent.set(touch.clientX, touch.clientY);
          const diff = new THREE.Vector2().subVectors(this.joystickCurrent, this.joystickStart);
          const dist = diff.length();

          if (dist > this.joystickMaxDist) {
            diff.normalize().multiplyScalar(this.joystickMaxDist);
          }

          // Move visual knob
          this.joystickKnob.style.transform = `translate(${diff.x}px, ${diff.y}px)`;

          // Calculate normalized move directions
          this.moveDir.x = diff.x / this.joystickMaxDist;
          this.moveDir.z = -diff.y / this.joystickMaxDist; // Inverted Z because dragging down moves player backward
        }

        // Handle Look move
        if (this.lookTouchId !== null && touch.identifier === this.lookTouchId) {
          const deltaX = touch.clientX - this.lookLastPos.x;
          const deltaY = touch.clientY - this.lookLastPos.y;
          this.lookLastPos.set(touch.clientX, touch.clientY);

          const sensitivity = 0.005;
          this.player.yaw -= deltaX * sensitivity;
          this.player.pitch -= deltaY * sensitivity;
          this.player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.player.pitch));
        }
      }
    }, { passive: false });

    const endTouch = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (this.joystickActive && (touch.target === this.joystickBase || e.touches.length === 0)) {
          this.joystickActive = false;
          this.moveDir.set(0, 0, 0);
          this.joystickKnob.style.transition = 'transform 0.15s ease-out';
          this.joystickKnob.style.transform = 'translate(0px, 0px)';
        }

        if (this.lookTouchId !== null && touch.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };

    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    // Jump button
    const jumpBtn = document.getElementById('btn-jump')!;
    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.player.jump();
      });
    }
  }

  public update() {
    // If joystick is active, it handles moveDir directly.
    // If not, fall back to keyboard controls.
    if (!this.joystickActive) {
      this.moveDir.set(0, 0, 0);
      
      // Keyboard WASD / Arrows
      if (this.keys['KeyW'] || this.keys['ArrowUp']) {
        this.moveDir.z = 1.0;
      }
      if (this.keys['KeyS'] || this.keys['ArrowDown']) {
        this.moveDir.z = -1.0;
      }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
        this.moveDir.x = -1.0;
      }
      if (this.keys['KeyD'] || this.keys['ArrowRight']) {
        this.moveDir.x = 1.0;
      }

      this.moveDir.normalize();
    }
  }
}
