import * as THREE from 'three';
import { TextureAtlas } from './TextureAtlas';
import { VoxelWorld } from './VoxelWorld';
import { Player } from './Player';
import { Controls } from './Controls';
import { Multiplayer } from './Multiplayer';
import { ParticleSystem } from './Particles';

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
  public particles!: ParticleSystem;

  private clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private netTickTime = 0;
  private netTickRate = 0.05; // 50ms send rate
  
  private sunLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

  // Day/Night Cycle variables
  private dayCycleTime = Math.PI / 4; // Start at mid-morning
  private dayDuration = 240; // 4 minutes per full day/night cycle
  private starfield!: THREE.Points;

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
    this.scene.fog = new THREE.FogExp2('#87CEEB', 0.015);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);

    // Setup Lighting
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.6);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#fff8e7', 1.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 512; // Moderate shadow map for mobile performance
    this.sunLight.shadow.mapSize.height = 512;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 100;
    
    const d = 25;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.001;

    this.scene.add(this.sunLight);
    
    this.sunLight.target = new THREE.Object3D();
    this.scene.add(this.sunLight.target);

    // Starfield for Night
    this.initStarfield();
  }

  private initStarfield() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = 250 * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(250 * Math.sin(phi) * Math.sin(theta)); // upper dome only
      positions[i * 3 + 2] = 250 * Math.cos(phi);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 1.0,
      transparent: true,
      opacity: 0.0,
      sizeAttenuation: true
    });
    this.starfield = new THREE.Points(geom, mat);
    this.scene.add(this.starfield);
  }

  private initGame() {
    this.textureAtlas = new TextureAtlas();
    this.world = new VoxelWorld(this.scene, this.textureAtlas);
    this.player = new Player(this.camera, this.scene);
    this.controls = new Controls(this.player, this.renderer.domElement);
    this.multiplayer = new Multiplayer(this.scene, this.world);
    this.particles = new ParticleSystem(this.scene);

    // Expose globally for references between classes
    (window as any).gameParticles = this.particles;
    (window as any).gameWorld = this.world;

    // Initial world generation around starting player position (8, 8)
    const spawnX = 8;
    const spawnZ = 8;
    this.world.generateWorldAround(spawnX, spawnZ, 2);

    // Safely position player on top of the ground
    const spawnY = this.world.getTerrainHeight(spawnX, spawnZ);
    this.player.position.set(spawnX, spawnY + 0.5, spawnZ);
  }

  private setupEvents() {
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === this.renderer.domElement) {
        if (e.button === 0) {
          this.player.breakBlock(this.world);
        } else if (e.button === 2) {
          this.player.placeBlock(this.world);
        }
      }
    });

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
    this.clock.getDelta();
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
    if (dt > 0.1) dt = 0.1;

    // Update systems
    this.controls.update();
    this.player.update(dt, this.world, this.controls.moveDir);
    this.multiplayer.update(dt);
    this.particles.update(dt);

    // Dynamic chunks generation around player
    this.world.generateWorldAround(this.player.position.x, this.player.position.z, 2);

    // Update Day/Night Cycle values
    this.dayCycleTime += dt * (Math.PI * 2 / this.dayDuration);
    if (this.dayCycleTime > Math.PI * 2) this.dayCycleTime -= Math.PI * 2;

    const sunSin = Math.sin(this.dayCycleTime);
    const sunCos = Math.cos(this.dayCycleTime);

    // Update sun position and target relative to player
    this.sunLight.position.set(
      this.player.position.x + sunCos * 50,
      this.player.position.y + sunSin * 50,
      this.player.position.z + 10
    );
    this.sunLight.target.position.copy(this.player.position);

    // Smooth sky color and lighting transitions based on sun angle height
    let skyColor: THREE.Color;
    let ambientIntensity = 0.6;
    let sunIntensity = 1.0;
    let starsOpacity = 0;

    if (sunSin > 0.1) {
      // Day time (Bright Blue)
      skyColor = new THREE.Color('#87CEEB');
      ambientIntensity = 0.6;
      sunIntensity = 1.0;
      starsOpacity = 0.0;
    } else if (sunSin > -0.1) {
      // Sunset / Sunrise transition (Warm orange-red)
      const t = (sunSin + 0.1) / 0.2; // 0 to 1
      skyColor = new THREE.Color().lerpColors(new THREE.Color('#FF7F50'), new THREE.Color('#87CEEB'), t);
      ambientIntensity = 0.3 + t * 0.3;
      sunIntensity = 0.2 + t * 0.8;
      starsOpacity = (1.0 - t) * 0.3;
    } else {
      // Night time (Dark space blue)
      skyColor = new THREE.Color('#0B1D3A');
      ambientIntensity = 0.15; // Moonlight
      sunIntensity = 0.0; // Sun below horizon
      starsOpacity = 1.0;
    }

    // Apply lighting and environment settings
    this.scene.background = skyColor;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color = skyColor;
    }
    this.ambientLight.color = new THREE.Color('#ffffff');
    this.ambientLight.intensity = ambientIntensity;
    this.sunLight.intensity = sunIntensity;
    
    // Starfield opacity change
    if (this.starfield.material instanceof THREE.PointsMaterial) {
      this.starfield.material.opacity = starsOpacity;
    }
    this.starfield.position.copy(this.player.position); // keeps stars centered around player

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
    this.particles.cleanup();
    
    this.container.removeChild(this.renderer.domElement);
    this.renderer.dispose();

    this.scene.remove(this.starfield);
    this.starfield.geometry.dispose();
    if (this.starfield.material instanceof THREE.Material) {
      this.starfield.material.dispose();
    }
    
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}
