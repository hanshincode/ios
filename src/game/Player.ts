import * as THREE from 'three';
import { VoxelWorld, BlockType } from './VoxelWorld';
import { Physics } from './Physics';
import { gameAudio } from './Sound';

export class Player {
  public position = new THREE.Vector3(8, 30, 8); // Start above terrain
  public velocity = new THREE.Vector3();
  public yaw = 0;   // Left/Right rotation
  public pitch = 0; // Up/Down rotation
  
  public speed = 6.0;
  public jumpStrength = 8.5;
  public grounded = false;
  
  public selectedBlock: BlockType = BlockType.STONE;
  
  // Survival Stats
  public health = 20; // 10 Hearts (each represents 2 points)
  public maxHealth = 20;
  public hunger = 20; // 10 Drumsticks
  public maxHunger = 20;

  // Callbacks for UI
  public onHealthChange?: (h: number) => void;
  public onHungerChange?: (h: number) => void;
  public onTakeDamage?: () => void; // For damage red vignette flash

  private physics: Physics;
  private camera: THREE.Camera;
  
  // Hand/Tool animation
  private handGroup = new THREE.Group();
  private handMesh!: THREE.Mesh;
  private swinging = false;
  private swingTime = 0;

  // Bobbing and Falling
  private bobTime = 0;
  private lastYVelocity = 0;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera;
    this.physics = new Physics();
    
    // Set camera rotation order for FPS controls
    this.camera.rotation.order = 'YXZ';
    
    this.setupHand(scene);

    // Dynamic hunger depletion (1 hunger point lost every 25 seconds)
    setInterval(() => {
      if (this.hunger > 0) {
        this.setHunger(this.hunger - 1);
      } else if (this.health > 2) {
        // Starving damage
        this.takeDamage(1);
      }
    }, 25000);
  }

  private setupHand(scene: THREE.Scene) {
    const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.4);
    const handMat = new THREE.MeshStandardMaterial({
      color: '#bc8f8f', // skin/wood tone
      roughness: 0.9,
    });
    this.handMesh = new THREE.Mesh(handGeo, handMat);
    this.handMesh.position.set(0.2, -0.25, -0.4); // Bottom right of viewport
    this.handMesh.rotation.set(-0.2, 0.1, 0);
    this.handMesh.castShadow = true;
    
    this.handGroup.add(this.handMesh);
    scene.add(this.handGroup);
  }

  public swing() {
    if (this.swinging) return;
    this.swinging = true;
    this.swingTime = 0;

    if ((window as any).gameMultiplayer) {
      (window as any).gameMultiplayer.sendSwing();
    }
  }

  public breakBlock(world: VoxelWorld) {
    this.swing();
    
    const rayOrigin = new THREE.Vector3().copy(this.position);
    rayOrigin.y += 1.5; // Eye height
    const rayDir = new THREE.Vector3();
    this.camera.getWorldDirection(rayDir);

    const hitResult = world.raycast(rayOrigin, rayDir, 6);
    if (hitResult.hit && hitResult.blockPos) {
      const x = hitResult.blockPos.x;
      const y = hitResult.blockPos.y;
      const z = hitResult.blockPos.z;
      
      if (y > 0) {
        const brokenBlockType = world.getBlock(x, y, z);
        world.setBlock(x, y, z, BlockType.AIR);
        
        // Play synthesized sound
        gameAudio.playBreak();

        // Spawn visual dust particles
        if ((window as any).gameParticles) {
          (window as any).gameParticles.spawnBlockBreakParticles(x, y, z, brokenBlockType);
        }
      }
    }
  }

  public placeBlock(world: VoxelWorld) {
    this.swing();

    const rayOrigin = new THREE.Vector3().copy(this.position);
    rayOrigin.y += 1.5; // Eye height
    const rayDir = new THREE.Vector3();
    this.camera.getWorldDirection(rayDir);

    const hitResult = world.raycast(rayOrigin, rayDir, 6);
    if (hitResult.hit && hitResult.placePos) {
      const x = hitResult.placePos.x;
      const y = hitResult.placePos.y;
      const z = hitResult.placePos.z;

      const pMinX = Math.floor(this.position.x - this.physics.playerWidth);
      const pMaxX = Math.floor(this.position.x + this.physics.playerWidth);
      const pMinY = Math.floor(this.position.y);
      const pMaxY = Math.floor(this.position.y + this.physics.playerHeight);
      const pMinZ = Math.floor(this.position.z - this.physics.playerWidth);
      const pMaxZ = Math.floor(this.position.z + this.physics.playerWidth);

      if (x >= pMinX && x <= pMaxX && y >= pMinY && y <= pMaxY && z >= pMinZ && z <= pMaxZ) {
        return; 
      }

      world.setBlock(x, y, z, this.selectedBlock);

      // Play synthesized place sound
      gameAudio.playPlace();
    }
  }

  public jump() {
    if (this.grounded) {
      this.velocity.y = this.jumpStrength;
      this.grounded = false;

      // Play synthesized jump sound
      gameAudio.playJump();
    }
  }

  public takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
    if (this.onHealthChange) this.onHealthChange(this.health);
    if (this.onTakeDamage) this.onTakeDamage();

    // Play synthesized damage sound
    gameAudio.playDamage();

    if (this.health <= 0) {
      this.respawn();
    }
  }

  public heal(amount: number) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (this.onHealthChange) this.onHealthChange(this.health);
  }

  public setHunger(amount: number) {
    this.hunger = Math.max(0, Math.min(this.maxHunger, amount));
    if (this.onHungerChange) this.onHungerChange(this.hunger);
  }

  private respawn() {
    // Reset positions and stats
    this.position.set(8, 30, 8);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;

    if (this.onHealthChange) this.onHealthChange(this.health);
    if (this.onHungerChange) this.onHungerChange(this.hunger);
    
    // Safety check terrain height
    if ((window as any).gameWorld) {
      const spawnY = (window as any).gameWorld.getTerrainHeight(8, 8);
      this.position.y = spawnY + 0.5;
    }
  }

  public update(dt: number, world: VoxelWorld, moveDir: THREE.Vector3) {
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();

    const velocityX = (forward.x * moveDir.z + right.x * moveDir.x) * this.speed;
    const velocityZ = (forward.z * moveDir.z + right.z * moveDir.x) * this.speed;

    this.velocity.x = velocityX;
    this.velocity.z = velocityZ;

    // Save previous grounded state and Y velocity for fall damage calculation
    const wasGrounded = this.grounded;

    // Apply physics
    const physicsResult = this.physics.update(this.position, this.velocity, dt, world);
    this.grounded = physicsResult.grounded;

    // Fall Damage Check: triggers when landing after falling quickly
    if (this.grounded && !wasGrounded && this.lastYVelocity < -12.5) {
      const damage = Math.floor((Math.abs(this.lastYVelocity) - 11.5) * 1.5);
      if (damage > 0) {
        this.takeDamage(damage);
      }
    }

    // Save current velocity for the next frame
    this.lastYVelocity = this.velocity.y;

    // If player falls below world, respawn them
    if (this.position.y < -10) {
      this.respawn();
    }

    // Camera Bobbing Logic (adds motion weight when moving)
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    let bobOffset = 0;
    
    if (this.grounded && speed2D > 0.1) {
      this.bobTime += dt * (speed2D * 2.0); // Frequency matches movement speed
      bobOffset = Math.sin(this.bobTime) * 0.05; // amplitude
    } else {
      // Return bobOffset back to zero smoothly when still
      this.bobTime = 0;
    }

    // Sync camera position
    this.camera.position.set(this.position.x, this.position.y + 1.5 + bobOffset, this.position.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Sync hand group
    this.handGroup.position.copy(this.camera.position);
    this.handGroup.rotation.copy(this.camera.rotation);

    // Hand swinging animation
    if (this.swinging) {
      this.swingTime += dt * 15;
      if (this.swingTime > Math.PI) {
        this.swinging = false;
        this.swingTime = 0;
        this.handMesh.rotation.x = -0.2;
        this.handMesh.position.y = -0.25;
        this.handMesh.position.z = -0.4;
      } else {
        const sin = Math.sin(this.swingTime);
        this.handMesh.rotation.x = -0.2 - sin * 0.8;
        this.handMesh.position.y = -0.25 + sin * 0.05;
        this.handMesh.position.z = -0.4 + sin * 0.1;
      }
    }
  }

  public cleanup() {
    this.handGroup.clear();
    this.handMesh.geometry.dispose();
    if (Array.isArray(this.handMesh.material)) {
      this.handMesh.material.forEach(m => m.dispose());
    } else {
      this.handMesh.material.dispose();
    }
  }
}
