import * as THREE from 'three';
import { TextureAtlas } from './TextureAtlas';
import { VoxelWorld } from './VoxelWorld';
import { Player } from './Player';
import { Controls } from './Controls';
import { Multiplayer } from './Multiplayer';

export class GameEngine {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  
  public textureAtlas!: TextureAtlas;
  public world!: VoxelWorld;
  public player!: Player;
  public controls!: Controls;
  public multiplayer!: Multiplayer;

  private clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private netTickTime = 0;
  private netTickRate = 0.05; // 50ms send rate (20 ticks per second)
  
  private sunLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initThree();
    this.initGame();
    this.setupEvents();
  }

  private initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB'); // Sky Blue
    this.scene.fog = new THREE.FogExp2('#87CEEB', 0.02);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for mobile performance
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Add canvas to container
    this.container.appendChild(this.renderer.domElement);

    // Setup Lighting
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.6);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#fff8e7', 1.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 80;
    
    const d = 30;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;

    this.scene.add(this.sunLight);
    
    // Light target moves with player
    this.sunLight.target = new THREE.Object3D();
    this.scene.add(this.sunLight.target);
  }

  private initGame() {
    this.textureAtlas = new TextureAtlas();
    this.world = new VoxelWorld(this.scene, this.textureAtlas);
    this.player = new Player(this.camera, this.scene);
    this.controls = new Controls(this.player, this.renderer.domElement);
    this.multiplayer = new Multiplayer(this.scene, this.world);

    // Initial world generation around starting player position (8, 30, 8)
    this.world.generateWorldAround(this.player.position.x, this.player.position.z, 2);
  }

  private setupEvents() {
    // Break Block & Place Block Events
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === this.renderer.domElement) {
        if (e.button === 0) {
          this.player.breakBlock(this.world);
        } else if (e.button === 2) {
          this.player.placeBlock(this.world);
        }
      }
    });

    // Mobile Action Button triggers
    const mineBtn = document.getElementById('btn-mine')!;
    const placeBtn = document.getElementById('btn-place')!;

    if (mineBtn) {
      mineBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.player.breakBlock(this.world);
      });
    }

    if (placeBtn) {
      placeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.player.placeBlock(this.world);
      });
    }

    // Resize handler
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public start() {
    this.clock.getDelta(); // Reset clock
    this.animate();
  }

  public stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    let dt = this.clock.getDelta();
    // Clamp delta time to avoid huge physics steps during lag spikes
    if (dt > 0.1) dt = 0.1;

    // Update systems
    this.controls.update();
    this.player.update(dt, this.world, this.controls.moveDir);
    this.multiplayer.update(dt);

    // Dynamic chunks generation around player
    this.world.generateWorldAround(this.player.position.x, this.player.position.z, 2);

    // Sun movement (shadow camera follows player position)
    this.sunLight.position.set(
      this.player.position.x + 20,
      this.player.position.y + 40,
      this.player.position.z + 10
    );
    this.sunLight.target.position.copy(this.player.position);

    // Network tick: sync position to WebSocket server
    if (this.multiplayer.isConnected()) {
      this.netTickTime += dt;
      if (this.netTickTime >= this.netTickRate) {
        this.multiplayer.sendMove(this.player.position, this.player.yaw);
        this.netTickTime = 0;
      }
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  };

  public cleanup() {
    this.stop();
    this.world.cleanup();
    this.player.cleanup();
    this.multiplayer.disconnect();
    
    this.container.removeChild(this.renderer.domElement);
    this.renderer.dispose();
    
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}
