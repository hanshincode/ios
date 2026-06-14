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

  // Day/Night Cycle
  private dayCycleTime = Math.PI / 4; 
  private dayDuration = 240; // 4 minutes
  private starfield!: THREE.Points;

  // Game Cinematic States
  public gameState: 'MENU' | 'TRANSITION' | 'PLAYING' = 'MENU';
  private transitionTimer = 0;
  private transitionDuration = 1.5; // 1.5 seconds
  private transitionStartPos = new THREE.Vector3();
  private transitionStartQuat = new THREE.Quaternion();

  constructor(container: HTMLElement) {
    this.container = container;
    this.initThree();
    this.initGame();
    this.setupEvents();
  }

  private initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB'); 
    this.scene.fog = new THREE.FogExp2('#87CEEB', 0.015);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);

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
    this.sunLight.shadow.mapSize.width = 512;
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

    this.initStarfield();
  }

  private initStarfield() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = 250 * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(250 * Math.sin(phi) * Math.sin(theta)); 
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

    (window as any).gameParticles = this.particles;
    (window as any).gameWorld = this.world;

    // Load starting area
    const spawnX = 8;
    const spawnZ = 8;
    this.world.generateWorldAround(spawnX, spawnZ, 2);

    // Find safe spawn Y coordinate (above terrain)
    const spawnY = this.world.getTerrainHeight(spawnX, spawnZ);
    this.player.position.set(spawnX, spawnY + 0.5, spawnZ);
  }

  public startTransition() {
    this.gameState = 'TRANSITION';
    this.transitionTimer = 0;
    this.transitionStartPos.copy(this.camera.position);
    this.transitionStartQuat.copy(this.camera.quaternion);
  }

  private setupEvents() {
    window.addEventListener('mousedown', (e) => {
      if (this.gameState === 'PLAYING' && document.pointerLockElement === this.renderer.domElement) {
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
        if (this.gameState === 'PLAYING') this.player.breakBlock(this.world);
      });
    }

    if (placeBtn) {
      placeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.gameState === 'PLAYING') this.player.placeBlock(this.world);
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

    // --- State-based Camera & Controls Updating ---
    if (this.gameState === 'MENU') {
      // 1. Slow orbit camera mode around hòn đảo trung tâm
      const orbitAngle = Date.now() * 0.00015; // orbit speed
      const orbitHeight = 22 + Math.sin(orbitAngle * 0.6) * 3;
      
      this.camera.position.set(
        8 + Math.cos(orbitAngle) * 17,
        orbitHeight,
        8 + Math.sin(orbitAngle) * 17
      );
      this.camera.lookAt(new THREE.Vector3(8, 17, 8));

      // Keep hand group synched to camera viewport
      this.player.update(dt, this.world, this.controls.moveDir, true);
    } 
    else if (this.gameState === 'TRANSITION') {
      // 2. Cinematic Lerp Glide from orbit path to player's face
      this.transitionTimer += dt;
      const progress = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      
      // Smooth step ease curve
      const t = progress * progress * (3 - 2 * progress);

      // Target player position
      const targetPos = new THREE.Vector3(
        this.player.position.x,
        this.player.position.y + 1.5, // Eye height
        this.player.position.z
      );

      // Target orientation quaternion based on player yaw/pitch
      const tempCam = new THREE.Object3D();
      tempCam.rotation.set(0, 0, 0);
      tempCam.rotation.y = this.player.yaw;
      tempCam.rotation.x = this.player.pitch;
      const targetQuat = tempCam.quaternion;

      // Lerp position & slerp rotation
      this.camera.position.lerpVectors(this.transitionStartPos, targetPos, t);
      this.camera.quaternion.slerpQuaternions(this.transitionStartQuat, targetQuat, t);

      // Update hand in menu sync mode
      this.player.update(dt, this.world, this.controls.moveDir, true);

      if (progress >= 1.0) {
        this.gameState = 'PLAYING';
      }
    } 
    else {
      // 3. Gameplay active mode
      this.controls.update();
      this.player.update(dt, this.world, this.controls.moveDir, false);
      this.multiplayer.update(dt);
      this.particles.update(dt);

      // Sun movement following player (shadow updates)
      const sunSin = Math.sin(this.dayCycleTime);
      const sunCos = Math.cos(this.dayCycleTime);
      this.sunLight.position.set(
        this.player.position.x + sunCos * 50,
        this.player.position.y + sunSin * 50,
        this.player.position.z + 10
      );
      this.sunLight.target.position.copy(this.player.position);
    }

    // Dynamic chunks generation around player
    this.world.generateWorldAround(this.player.position.x, this.player.position.z, 2);

    // Update Day/Night Cycles (runs regardless of state)
    this.dayCycleTime += dt * (Math.PI * 2 / this.dayDuration);
    if (this.dayCycleTime > Math.PI * 2) this.dayCycleTime -= Math.PI * 2;

    const sunSin = Math.sin(this.dayCycleTime);

    let skyColor: THREE.Color;
    let ambientIntensity = 0.6;
    let sunIntensity = 1.0;
    let starsOpacity = 0;

    if (sunSin > 0.1) {
      skyColor = new THREE.Color('#87CEEB');
      ambientIntensity = 0.6;
      sunIntensity = 1.0;
      starsOpacity = 0.0;
    } else if (sunSin > -0.1) {
      const lerpProgress = (sunSin + 0.1) / 0.2;
      skyColor = new THREE.Color().lerpColors(new THREE.Color('#FF7F50'), new THREE.Color('#87CEEB'), lerpProgress);
      ambientIntensity = 0.3 + lerpProgress * 0.3;
      sunIntensity = 0.2 + lerpProgress * 0.8;
      starsOpacity = (1.0 - lerpProgress) * 0.3;
    } else {
      skyColor = new THREE.Color('#0B1D3A');
      ambientIntensity = 0.15;
      sunIntensity = 0.0;
      starsOpacity = 1.0;
    }

    this.scene.background = skyColor;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color = skyColor;
    }
    this.ambientLight.intensity = ambientIntensity;
    this.sunLight.intensity = sunIntensity;
    
    if (this.starfield.material instanceof THREE.PointsMaterial) {
      this.starfield.material.opacity = starsOpacity;
    }
    
    // Starfield tracks camera position to make stars feel infinite
    this.starfield.position.copy(this.camera.position);

    // Sync position in background if playing online
    if (this.gameState === 'PLAYING' && this.multiplayer.isConnected()) {
      this.netTickTime += dt;
      if (this.netTickTime >= this.netTickRate) {
        this.multiplayer.sendMove(this.player.position, this.player.yaw);
        this.netTickTime = 0;
      }
    }

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
