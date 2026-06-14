import * as THREE from 'three';
import { BlockType } from './VoxelWorld';

// Simple color mapping for each block type
const BlockColors: Record<BlockType, string> = {
  [BlockType.AIR]: '#ffffff',
  [BlockType.DIRT]: '#866043',
  [BlockType.GRASS]: '#5b8731',
  [BlockType.STONE]: '#7a7a7a',
  [BlockType.WOOD]: '#6b4c35',
  [BlockType.LEAVES]: '#305c22',
  [BlockType.BRICK]: '#a84c3e',
  [BlockType.GLASS]: '#ffffff'
};

interface ParticleGroup {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  material: THREE.PointsMaterial;
  age: number;
  maxAge: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private groups: ParticleGroup[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Spawn a particle burst at block position
  public spawnBlockBreakParticles(x: number, y: number, z: number, type: BlockType) {
    const color = BlockColors[type] || '#ffffff';
    const count = 16;
    
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    // Center of block
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;

    for (let i = 0; i < count; i++) {
      // Small random offset within block bounds
      positions[i * 3] = cx + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = cy + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 0.6;

      // Random velocity vector (flying outwards and slightly up)
      velocities[i * 3] = (Math.random() - 0.5) * 4.0;
      velocities[i * 3 + 1] = Math.random() * 4.0 + 1.0; // upwards boost
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 4.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size: 0.14,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    this.groups.push({
      points,
      positions,
      velocities,
      material,
      age: 0,
      maxAge: 0.65 // particles live for 0.65 seconds
    });
  }

  public update(dt: number) {
    const gravity = -12.0;

    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i];
      g.age += dt;

      if (g.age >= g.maxAge) {
        // Remove and cleanup
        this.scene.remove(g.points);
        g.points.geometry.dispose();
        g.material.dispose();
        this.groups.splice(i, 1);
        continue;
      }

      // Update velocities and positions
      const posArr = g.points.geometry.attributes.position.array as Float32Array;

      for (let j = 0; j < posArr.length / 3; j++) {
        // Apply gravity to Y velocity
        g.velocities[j * 3 + 1] += gravity * dt;

        // Apply velocity to position
        posArr[j * 3] += g.velocities[j * 3] * dt;
        posArr[j * 3 + 1] += g.velocities[j * 3 + 1] * dt;
        posArr[j * 3 + 2] += g.velocities[j * 3 + 2] * dt;
      }

      g.points.geometry.attributes.position.needsUpdate = true;

      // Fade out opacity over lifetime
      g.material.opacity = Math.max(0, 1.0 - (g.age / g.maxAge));
    }
  }

  public cleanup() {
    this.groups.forEach(g => {
      this.scene.remove(g.points);
      g.points.geometry.dispose();
      g.material.dispose();
    });
    this.groups = [];
  }
}
