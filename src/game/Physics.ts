import * as THREE from 'three';
import { VoxelWorld, BlockType } from './VoxelWorld';

export class Physics {
  public gravity = -26.0;
  public terminalVelocity = -50.0;
  public playerWidth = 0.3; // Half-width (radius)
  public playerHeight = 1.8;

  constructor() {}

  // Check if player bounding box intersects a block
  private checkCollision(
    pos: THREE.Vector3,
    bx: number,
    by: number,
    bz: number,
    world: VoxelWorld
  ): boolean {
    const blockType = world.getBlock(bx, by, bz);
    if (blockType === BlockType.AIR) return false;

    // Player AABB
    const pMinX = pos.x - this.playerWidth;
    const pMaxX = pos.x + this.playerWidth;
    const pMinY = pos.y;
    const pMaxY = pos.y + this.playerHeight;
    const pMinZ = pos.z - this.playerWidth;
    const pMaxZ = pos.z + this.playerWidth;

    // Block AABB
    const bMinX = bx;
    const bMaxX = bx + 1;
    const bMinY = by;
    const bMaxY = by + 1;
    const bMinZ = bz;
    const bMaxZ = bz + 1;

    // Intersect check
    return (
      pMinX < bMaxX &&
      pMaxX > bMinX &&
      pMinY < bMaxY &&
      pMaxY > bMinY &&
      pMinZ < bMaxZ &&
      pMaxZ > bMinZ
    );
  }

  // Update position and resolve collisions axis by axis
  public update(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    dt: number,
    world: VoxelWorld
  ): { grounded: boolean } {
    // Apply gravity
    velocity.y += this.gravity * dt;
    if (velocity.y < this.terminalVelocity) {
      velocity.y = this.terminalVelocity;
    }

    let grounded = false;

    // --- Resolve X Axis ---
    position.x += velocity.x * dt;
    let minX = Math.floor(position.x - this.playerWidth);
    let maxX = Math.floor(position.x + this.playerWidth);
    let minY = Math.floor(position.y);
    let maxY = Math.floor(position.y + this.playerHeight);
    let minZ = Math.floor(position.z - this.playerWidth);
    let maxZ = Math.floor(position.z + this.playerWidth);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.checkCollision(position, x, y, z, world)) {
            // Push player out of block
            if (velocity.x > 0) {
              position.x = x - this.playerWidth - 0.0001;
            } else if (velocity.x < 0) {
              position.x = x + 1 + this.playerWidth + 0.0001;
            }
            velocity.x = 0;
            break;
          }
        }
      }
    }

    // --- Resolve Z Axis ---
    position.z += velocity.z * dt;
    minX = Math.floor(position.x - this.playerWidth);
    maxX = Math.floor(position.x + this.playerWidth);
    minY = Math.floor(position.y);
    maxY = Math.floor(position.y + this.playerHeight);
    minZ = Math.floor(position.z - this.playerWidth);
    maxZ = Math.floor(position.z + this.playerWidth);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.checkCollision(position, x, y, z, world)) {
            if (velocity.z > 0) {
              position.z = z - this.playerWidth - 0.0001;
            } else if (velocity.z < 0) {
              position.z = z + 1 + this.playerWidth + 0.0001;
            }
            velocity.z = 0;
            break;
          }
        }
      }
    }

    // --- Resolve Y Axis ---
    position.y += velocity.y * dt;
    minX = Math.floor(position.x - this.playerWidth);
    maxX = Math.floor(position.x + this.playerWidth);
    minY = Math.floor(position.y);
    maxY = Math.floor(position.y + this.playerHeight);
    minZ = Math.floor(position.z - this.playerWidth);
    maxZ = Math.floor(position.z + this.playerWidth);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.checkCollision(position, x, y, z, world)) {
            if (velocity.y > 0) {
              // Hit head
              position.y = y - this.playerHeight - 0.0001;
              velocity.y = 0;
            } else if (velocity.y < 0) {
              // Landed on block
              position.y = y + 1 + 0.0001;
              velocity.y = 0;
              grounded = true;
            }
            break;
          }
        }
      }
    }

    // Double check if player is standing on block (grounded check)
    // by testing a tiny bit down
    if (!grounded) {
      const testPos = position.clone();
      testPos.y -= 0.01;
      minX = Math.floor(testPos.x - this.playerWidth);
      maxX = Math.floor(testPos.x + this.playerWidth);
      minY = Math.floor(testPos.y); // only check block directly below feet
      minZ = Math.floor(testPos.z - this.playerWidth);
      maxZ = Math.floor(testPos.z + this.playerWidth);

      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.checkCollision(testPos, x, minY, z, world)) {
            grounded = true;
            break;
          }
        }
        if (grounded) break;
      }
    }

    return { grounded };
  }
}
