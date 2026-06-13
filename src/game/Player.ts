import * as THREE from 'three';
import { VoxelWorld, BlockType } from './VoxelWorld';
import { Physics } from './Physics';

export class Player {
  public position = new THREE.Vector3(8, 30, 8); // Start above terrain
  public velocity = new THREE.Vector3();
  public yaw = 0;   // Left/Right rotation
  public pitch = 0; // Up/Down rotation
  
  public speed = 6.0;
  public jumpStrength = 8.5;
  public grounded = false;
  
  public selectedBlock: BlockType = BlockType.STONE;
  
  private physics: Physics;
  private camera: THREE.Camera;
  
  // Hand/Tool animation
  private handGroup = new THREE.Group();
  private handMesh!: THREE.Mesh;
  private swinging = false;
  private swingTime = 0;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera;
    this.physics = new Physics();
    
    // Set camera rotation order for FPS controls
    this.camera.rotation.order = 'YXZ';
    
    this.setupHand(scene);
  }

  private setupHand(scene: THREE.Scene) {
    // A simple 3D hand/arm mesh (represented as a stylized wooden tool block)
    const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.4);
    const handMat = new THREE.MeshStandardMaterial({
      color: '#bc8f8f', // skin/wood tone
      roughness: 0.9,
    });
    this.handMesh = new THREE.Mesh(handGeo, handMat);
    this.handMesh.position.set(0.2, -0.25, -0.4); // Bottom right of viewport
    this.handMesh.rotation.set(-0.2, 0.1, 0);
    this.handMesh.castShadow = true;
    
    // Add hand to handGroup, and handGroup to camera
    this.handGroup.add(this.handMesh);
    scene.add(this.handGroup);
  }

  public swing() {
    if (this.swinging) return;
    this.swinging = true;
    this.swingTime = 0;

    // Trigger visual feedback for multiplayer
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
      
      // Can't break bedrock (Y = 0)
      if (y > 0) {
        world.setBlock(x, y, z, BlockType.AIR);
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

      // Don't place block on player's own body
      const pMinX = Math.floor(this.position.x - this.physics.playerWidth);
      const pMaxX = Math.floor(this.position.x + this.physics.playerWidth);
      const pMinY = Math.floor(this.position.y);
      const pMaxY = Math.floor(this.position.y + this.physics.playerHeight);
      const pMinZ = Math.floor(this.position.z - this.physics.playerWidth);
      const pMaxZ = Math.floor(this.position.z + this.physics.playerWidth);

      if (x >= pMinX && x <= pMaxX && y >= pMinY && y <= pMaxY && z >= pMinZ && z <= pMaxZ) {
        return; // Intersects player, cancel placement
      }

      world.setBlock(x, y, z, this.selectedBlock);
    }
  }

  public jump() {
    if (this.grounded) {
      this.velocity.y = this.jumpStrength;
      this.grounded = false;
    }
  }

  public update(dt: number, world: VoxelWorld, moveDir: THREE.Vector3) {
    // Calculate movement relative to camera yaw
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();

    // Map input direction to speed
    const velocityX = (forward.x * moveDir.z + right.x * moveDir.x) * this.speed;
    const velocityZ = (forward.z * moveDir.z + right.z * moveDir.x) * this.speed;

    this.velocity.x = velocityX;
    this.velocity.z = velocityZ;

    // Apply physics
    const physicsResult = this.physics.update(this.position, this.velocity, dt, world);
    this.grounded = physicsResult.grounded;

    // If player falls below world, respawn them
    if (this.position.y < -10) {
      this.position.set(8, 30, 8);
      this.velocity.set(0, 0, 0);
    }

    // Sync camera position
    this.camera.position.set(this.position.x, this.position.y + 1.5, this.position.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Sync hand group to camera position and rotation
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
