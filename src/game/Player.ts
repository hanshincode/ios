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
  public health = 20;
  public maxHealth = 20;
  public hunger = 20;
  public maxHunger = 20;

  // Callbacks for UI
  public onHealthChange?: (h: number) => void;
  public onHungerChange?: (h: number) => void;
  public onTakeDamage?: () => void;

  private physics: Physics;
  private camera: THREE.Camera;
  
  // Hand/Tool Group & Mesh
  private handGroup = new THREE.Group();
  private handMesh!: THREE.Mesh;
  private swinging = false;
  private swingTime = 0;

  // Advanced Animation states
  private bobTime = 0;
  private breathTime = 0;
  private lastYVelocity = 0;
  
  // Camera Leans
  private tiltRoll = 0;
  private tiltPitch = 0;

  // Hand Inertial Sway
  private lastYaw = 0;
  private lastPitch = 0;
  private handSwayX = 0;
  private handSwayY = 0;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera;
    this.physics = new Physics();
    this.camera.rotation.order = 'YXZ';
    
    this.setupHand(scene);

    // Hunger depletion interval
    setInterval(() => {
      if (this.hunger > 0) {
        this.setHunger(this.hunger - 1);
      } else if (this.health > 2) {
        this.takeDamage(1);
      }
    }, 25000);
  }

  private setupHand(scene: THREE.Scene) {
    const handGeo = new THREE.BoxGeometry(0.1, 0.1, 0.38);
    const handMat = new THREE.MeshStandardMaterial({
      color: '#bc8f8f', // skin/wood tone
      roughness: 0.95,
      metalness: 0.05
    });
    this.handMesh = new THREE.Mesh(handGeo, handMat);
    
    // Set neutral local position and rotation relative to camera
    this.handMesh.position.set(0.2, -0.24, -0.38); 
    this.handMesh.rotation.set(-0.2, 0.12, -0.05);
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
    rayOrigin.y += 1.5;
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
        gameAudio.playBreak();

        if ((window as any).gameParticles) {
          (window as any).gameParticles.spawnBlockBreakParticles(x, y, z, brokenBlockType);
        }
      }
    }
  }

  public placeBlock(world: VoxelWorld) {
    this.swing();

    const rayOrigin = new THREE.Vector3().copy(this.position);
    rayOrigin.y += 1.5;
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
      gameAudio.playPlace();
    }
  }

  public jump() {
    if (this.grounded) {
      this.velocity.y = this.jumpStrength;
      this.grounded = false;
      gameAudio.playJump();
    }
  }

  public takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
    if (this.onHealthChange) this.onHealthChange(this.health);
    if (this.onTakeDamage) this.onTakeDamage();
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
    this.position.set(8, 30, 8);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;

    if (this.onHealthChange) this.onHealthChange(this.health);
    if (this.onHungerChange) this.onHungerChange(this.hunger);
    
    if ((window as any).gameWorld) {
      const spawnY = (window as any).gameWorld.getTerrainHeight(8, 8);
      this.position.y = spawnY + 0.5;
    }
  }

  public update(dt: number, world: VoxelWorld, moveDir: THREE.Vector3, isCinematic = false) {
    if (isCinematic) {
      // In cinematic menu mode, we only update hand breathing, no physics/controls
      this.breathTime += dt * 1.2;
      const breathY = Math.sin(this.breathTime) * 0.006;
      const breathX = Math.cos(this.breathTime * 0.6) * 0.004;

      this.handMesh.position.set(0.2 + breathX, -0.24 + breathY, -0.38);
      this.handMesh.rotation.set(-0.2, 0.12, -0.05);

      this.handGroup.position.copy(this.camera.position);
      this.handGroup.rotation.copy(this.camera.rotation);
      return;
    }

    // --- standard gameplay updates ---

    // Calculate movement directions relative to camera yaw
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();

    const velocityX = (forward.x * moveDir.z + right.x * moveDir.x) * this.speed;
    const velocityZ = (forward.z * moveDir.z + right.z * moveDir.x) * this.speed;

    this.velocity.x = velocityX;
    this.velocity.z = velocityZ;

    const wasGrounded = this.grounded;

    // Apply physics
    const physicsResult = this.physics.update(this.position, this.velocity, dt, world);
    this.grounded = physicsResult.grounded;

    // Fall damage checks
    if (this.grounded && !wasGrounded && this.lastYVelocity < -12.5) {
      const damage = Math.floor((Math.abs(this.lastYVelocity) - 11.5) * 1.5);
      if (damage > 0) {
        this.takeDamage(damage);
      }
    }
    this.lastYVelocity = this.velocity.y;

    if (this.position.y < -10) {
      this.respawn();
    }

    // 1. Figure-8 View Bobbing and Strafing Leans
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    
    let bobX = 0;
    let bobY = 0;
    let bobRoll = 0;

    if (this.grounded && speed2D > 0.1) {
      this.bobTime += dt * (speed2D * 2.1);
      bobX = Math.cos(this.bobTime) * 0.045; // Side sway
      bobY = Math.sin(this.bobTime * 2.0) * 0.032; // Vertical dip
      bobRoll = bobX * 0.12; // Roll wiggle
    } else {
      // Decay bobTime smoothly
      this.bobTime = THREE.MathUtils.lerp(this.bobTime, 0, 0.1);
    }

    // Camera lean based on strafing inputs
    const targetRoll = -moveDir.x * 0.024 + bobRoll;
    const targetPitch = -moveDir.z * 0.016;

    this.tiltRoll = THREE.MathUtils.lerp(this.tiltRoll, targetRoll, 0.15);
    this.tiltPitch = THREE.MathUtils.lerp(this.tiltPitch, targetPitch, 0.15);

    // Sync camera position and apply leans
    this.camera.position.set(
      this.position.x + bobX,
      this.position.y + 1.5 + bobY,
      this.position.z
    );

    // Rotate camera: yaw, pitch + apply lean roll/pitch offsets
    this.camera.rotation.set(0, 0, 0); // Reset
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.tiltPitch;
    this.camera.rotation.z = this.tiltRoll;

    // 2. Hand Breathing & Inertial Sway
    this.breathTime += dt * (speed2D > 0.1 ? 3.0 : 1.2);
    
    let breathX = 0;
    let breathY = 0;

    if (speed2D < 0.1) {
      // Idle Breathing
      breathX = Math.cos(this.breathTime * 0.5) * 0.004;
      breathY = Math.sin(this.breathTime) * 0.007;
    } else {
      // Walking Sway (Figure-8 secondary offset)
      breathX = bobX * 0.25;
      breathY = bobY * 0.25;
    }

    // Calculate rotation delta for Inertial Hand Sway
    let deltaYaw = this.yaw - this.lastYaw;
    let deltaPitch = this.pitch - this.lastPitch;

    // Normalize wrap
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;

    this.lastYaw = this.yaw;
    this.lastPitch = this.pitch;

    // Smoothly lerp sway offsets
    const targetSwayX = -deltaYaw * 0.8;
    const targetSwayY = deltaPitch * 0.8;

    this.handSwayX = THREE.MathUtils.lerp(this.handSwayX, targetSwayX, 0.08);
    this.handSwayY = THREE.MathUtils.lerp(this.handSwayY, targetSwayY, 0.08);

    // Clamp sway values
    const maxSway = 0.06;
    this.handSwayX = Math.max(-maxSway, Math.min(maxSway, this.handSwayX));
    this.handSwayY = Math.max(-maxSway, Math.min(maxSway, this.handSwayY));

    // 3. Multi-Axis Swing Recoil
    let recoilX = 0, recoilY = 0, recoilZ = 0;
    let rotX = 0, rotY = 0, rotZ = 0;

    if (this.swinging) {
      this.swingTime += dt * 16;
      if (this.swingTime > Math.PI) {
        this.swinging = false;
        this.swingTime = 0;
      } else {
        const sin = Math.sin(this.swingTime);
        // Multi-axis spatial offset (Recoil backwards & down)
        recoilZ = sin * 0.12; 
        recoilY = -sin * 0.06;
        recoilX = -sin * 0.03;

        // Rotational offset (arc slash path)
        rotX = -sin * 0.95; // Slash forward
        rotY = sin * 0.45;  // Slash inwards
        rotZ = -sin * 0.25; // Roll twist
      }
    }

    // Apply combined offsets to hand mesh
    this.handMesh.position.set(
      0.2 + this.handSwayX + breathX + recoilX,
      -0.24 + this.handSwayY + breathY + recoilY,
      -0.38 + recoilZ
    );
    this.handMesh.rotation.set(
      -0.2 + rotX,
      0.12 + rotY,
      -0.05 + rotZ
    );

    // Sync hand group to camera position and rotation
    this.handGroup.position.copy(this.camera.position);
    this.handGroup.rotation.copy(this.camera.rotation);
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
