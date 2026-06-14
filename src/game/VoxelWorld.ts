import * as THREE from 'three';
import { TextureAtlas } from './TextureAtlas';

export enum BlockType {
  AIR = 0,
  DIRT = 1,
  GRASS = 2,
  STONE = 3,
  WOOD = 4,
  LEAVES = 5,
  BRICK = 6,
  GLASS = 7
}

// Map block types to texture index in atlas
export const BlockTextures: Record<BlockType, {
  top: number;
  bottom: number;
  sides: number;
}> = {
  [BlockType.AIR]: { top: 0, bottom: 0, sides: 0 },
  [BlockType.DIRT]: { top: 0, bottom: 0, sides: 0 },
  [BlockType.GRASS]: { top: 1, bottom: 0, sides: 2 },
  [BlockType.STONE]: { top: 3, bottom: 3, sides: 3 },
  [BlockType.WOOD]: { top: 5, bottom: 5, sides: 4 },
  [BlockType.LEAVES]: { top: 6, bottom: 6, sides: 6 },
  [BlockType.BRICK]: { top: 7, bottom: 7, sides: 7 },
  [BlockType.GLASS]: { top: 8, bottom: 8, sides: 8 }
};

export class VoxelWorld {
  public chunkSize = 16;
  public chunkHeight = 64;
  private chunks = new Map<string, Uint8Array>();
  private chunkMeshes = new Map<string, THREE.Mesh>();
  private scene: THREE.Scene;
  private textureAtlas: TextureAtlas;
  private material: THREE.Material;

  constructor(scene: THREE.Scene, textureAtlas: TextureAtlas) {
    this.scene = scene;
    this.textureAtlas = textureAtlas;

    // Create material for voxel rendering
    this.material = new THREE.MeshStandardMaterial({
      map: this.textureAtlas.texture,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      alphaTest: 0.1, // Discards transparent pixels in textures (e.g., leaves, glass)
    });
  }

  // Noise function for terrain generation
  private noise2D(x: number, z: number): number {
    const xInt = Math.floor(x);
    const zInt = Math.floor(z);
    const xFrac = x - xInt;
    const zFrac = z - zInt;

    const hash = (u: number, v: number) => {
      const dot = u * 12.9898 + v * 78.233;
      const val = Math.sin(dot) * 43758.5453123;
      return val - Math.floor(val);
    };

    // Smoothstep
    const u = xFrac * xFrac * (3 - 2 * xFrac);
    const v = zFrac * zFrac * (3 - 2 * zFrac);

    const r00 = hash(xInt, zInt);
    const r10 = hash(xInt + 1, zInt);
    const r01 = hash(xInt, zInt + 1);
    const r11 = hash(xInt + 1, zInt + 1);

    const r0 = r00 * (1 - u) + r10 * u;
    const r1 = r01 * (1 - u) + r11 * u;
    return r0 * (1 - v) + r1 * v;
  }

  private fbm(x: number, z: number): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 0.03;
    for (let i = 0; i < 3; i++) {
      value += amplitude * this.noise2D(x * frequency, z * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  public getChunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public getBlock(x: number, y: number, z: number): BlockType {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    
    if (iy < 0 || iy >= this.chunkHeight) return BlockType.AIR;

    const cx = Math.floor(ix / this.chunkSize);
    const cz = Math.floor(iz / this.chunkSize);
    const key = this.getChunkKey(cx, cz);

    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generateChunkData(cx, cz);
    }

    const bx = ((ix % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const bz = ((iz % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const index = bx + bz * this.chunkSize + iy * this.chunkSize * this.chunkSize;

    return chunk[index] as BlockType;
  }

  public getTerrainHeight(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let y = this.chunkHeight - 1; y >= 0; y--) {
      if (this.getBlock(ix, y, iz) !== BlockType.AIR) {
        return y + 1;
      }
    }
    return 16; // default height
  }

  public setBlock(x: number, y: number, z: number, type: BlockType, sync = true): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    if (iy < 0 || iy >= this.chunkHeight) return;

    const cx = Math.floor(ix / this.chunkSize);
    const cz = Math.floor(iz / this.chunkSize);
    const key = this.getChunkKey(cx, cz);

    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generateChunkData(cx, cz);
    }

    const bx = ((ix % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const bz = ((iz % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const index = bx + bz * this.chunkSize + iy * this.chunkSize * this.chunkSize;

    chunk[index] = type;

    // Rebuild current chunk mesh
    this.rebuildChunkMesh(cx, cz);

    // Also rebuild adjacent chunks if modification was on the edge
    if (bx === 0) this.rebuildChunkMesh(cx - 1, cz);
    if (bx === this.chunkSize - 1) this.rebuildChunkMesh(cx + 1, cz);
    if (bz === 0) this.rebuildChunkMesh(cx, cz - 1);
    if (bz === this.chunkSize - 1) this.rebuildChunkMesh(cx, cz + 1);

    // Broadcast update if required (will be wired up in Multiplayer class)
    if (sync && (window as any).gameMultiplayer) {
      (window as any).gameMultiplayer.sendBlockUpdate(x, y, z, type);
    }
  }

  private generateChunkData(cx: number, cz: number): Uint8Array {
    const key = this.getChunkKey(cx, cz);
    const size = this.chunkSize * this.chunkSize * this.chunkHeight;
    const data = new Uint8Array(size);
    this.chunks.set(key, data);

    const startX = cx * this.chunkSize;
    const startZ = cz * this.chunkSize;

    // Heightmap terrain generation
    for (let bx = 0; bx < this.chunkSize; bx++) {
      for (let bz = 0; bz < this.chunkSize; bz++) {
        const wx = startX + bx;
        const wz = startZ + bz;

        // Base ground level height
        const heightFactor = this.fbm(wx, wz);
        const terrainHeight = Math.floor(15 + heightFactor * 18);

        for (let y = 0; y < this.chunkHeight; y++) {
          const index = bx + bz * this.chunkSize + y * this.chunkSize * this.chunkSize;
          if (y === 0) {
            data[index] = BlockType.STONE; // Bedrock
          } else if (y < terrainHeight - 4) {
            data[index] = BlockType.STONE;
          } else if (y < terrainHeight - 1) {
            data[index] = BlockType.DIRT;
          } else if (y === terrainHeight - 1) {
            data[index] = BlockType.GRASS;
          } else {
            data[index] = BlockType.AIR;
          }
        }

        // Programmatic trees (very basic Chance-based generation)
        if (bx > 1 && bx < this.chunkSize - 2 && bz > 1 && bz < this.chunkSize - 2) {
          const treeNoise = this.noise2D(wx * 2.3 + 99, wz * 1.7 - 55);
          if (treeNoise > 0.82) {
            const trunkY = terrainHeight;
            const treeHeight = 4 + Math.floor(treeNoise * 3);

            // Create trunk
            for (let ty = 0; ty < treeHeight; ty++) {
              const idx = bx + bz * this.chunkSize + (trunkY + ty) * this.chunkSize * this.chunkSize;
              data[idx] = BlockType.WOOD;
            }

            // Create leaves canopy
            const leafTop = trunkY + treeHeight;
            for (let ly = -2; ly <= 1; ly++) {
              const radius = ly === 1 ? 1 : 2;
              for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                  // Skip corners for round shape
                  if (Math.abs(lx) === radius && Math.abs(lz) === radius && radius > 1) continue;
                  
                  const targetY = leafTop + ly;
                  const idx = (bx + lx) + (bz + lz) * this.chunkSize + targetY * this.chunkSize * this.chunkSize;
                  
                  // Don't overwrite wood log
                  if (data[idx] === BlockType.AIR || data[idx] === BlockType.LEAVES) {
                    data[idx] = BlockType.LEAVES;
                  }
                }
              }
            }
          }
        }
      }
    }

    return data;
  }

  public generateWorldAround(playerX: number, playerZ: number, viewDistance = 3): void {
    const pcx = Math.floor(playerX / this.chunkSize);
    const pcz = Math.floor(playerZ / this.chunkSize);

    // Load and build chunk meshes in radius
    for (let dx = -viewDistance; dx <= viewDistance; dx++) {
      for (let dz = -viewDistance; dz <= viewDistance; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this.getChunkKey(cx, cz);

        if (!this.chunks.has(key)) {
          this.generateChunkData(cx, cz);
        }
        if (!this.chunkMeshes.has(key)) {
          this.rebuildChunkMesh(cx, cz);
        }
      }
    }
  }

  public rebuildChunkMesh(cx: number, cz: number): void {
    const key = this.getChunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    // Remove existing mesh
    const existing = this.chunkMeshes.get(key);
    if (existing) {
      this.scene.remove(existing);
      existing.geometry.dispose();
      this.chunkMeshes.delete(key);
    }

    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];

    const startX = cx * this.chunkSize;
    const startZ = cz * this.chunkSize;

    // Directions for face checks
    // +X (0), -X (1), +Y (2), -Y (3), +Z (4), -Z (5)
    const neighbors = [
      { dir: [1, 0, 0], verts: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], norm: [1, 0, 0], face: 'sides' },
      { dir: [-1, 0, 0], verts: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], norm: [-1, 0, 0], face: 'sides' },
      { dir: [0, 1, 0], verts: [[0, 1, 1], [0, 1, 0], [1, 1, 0], [1, 1, 1]], norm: [0, 1, 0], face: 'top' },
      { dir: [0, -1, 0], verts: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], norm: [0, -1, 0], face: 'bottom' },
      { dir: [0, 0, 1], verts: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], norm: [0, 0, 1], face: 'sides' },
      { dir: [0, 0, -1], verts: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], norm: [0, 0, -1], face: 'sides' }
    ];

    let vertexCount = 0;

    for (let x = 0; x < this.chunkSize; x++) {
      for (let z = 0; z < this.chunkSize; z++) {
        for (let y = 0; y < this.chunkHeight; y++) {
          const index = x + z * this.chunkSize + y * this.chunkSize * this.chunkSize;
          const blockType = chunk[index] as BlockType;

          if (blockType === BlockType.AIR) continue;

          const wx = startX + x;
          const wy = y;
          const wz = startZ + z;

          for (const n of neighbors) {
            const nx = wx + n.dir[0];
            const ny = wy + n.dir[1];
            const nz = wz + n.dir[2];

            const neighborBlock = this.getBlock(nx, ny, nz);
            
            // Render face if neighbor is transparent (Air, Glass, or Out of Bounds top/bottom)
            const isNeighborTransparent = 
              neighborBlock === BlockType.AIR || 
              neighborBlock === BlockType.GLASS ||
              (blockType !== BlockType.GLASS && neighborBlock === BlockType.LEAVES); // Glass doesn't mesh against leaves

            if (isNeighborTransparent) {
              // Add vertices
              for (const v of n.verts) {
                vertices.push(wx + v[0], wy + v[1], wz + v[2]);
                normals.push(n.norm[0], n.norm[1], n.norm[2]);
              }

              // Add UVs
              const texConfig = BlockTextures[blockType];
              let texIndex = texConfig.sides;
              if (n.face === 'top') texIndex = texConfig.top;
              if (n.face === 'bottom') texIndex = texConfig.bottom;

              const uvConfig = this.textureAtlas.getUV(texIndex);
              uvs.push(
                uvConfig.uMin, uvConfig.vMin,
                uvConfig.uMin, uvConfig.vMax,
                uvConfig.uMax, uvConfig.vMax,
                uvConfig.uMax, uvConfig.vMin
              );

              // Add Indices
              indices.push(
                vertexCount, vertexCount + 1, vertexCount + 2,
                vertexCount, vertexCount + 2, vertexCount + 3
              );

              vertexCount += 4;
            }
          }
        }
      }
    }

    if (vertices.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.scene.add(mesh);
    this.chunkMeshes.set(key, mesh);
  }

  // Simple voxel-based raycasting to find block under crosshair
  // returns block position and normal
  public raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 6) {
    const step = 0.05;
    const ray = origin.clone();
    const dir = direction.clone().normalize().multiplyScalar(step);

    let lastPos = new THREE.Vector3().copy(origin);
    const currentPos = new THREE.Vector3();

    for (let d = 0; d < maxDistance; d += step) {
      ray.add(dir);
      currentPos.set(Math.floor(ray.x), Math.floor(ray.y), Math.floor(ray.z));

      const block = this.getBlock(currentPos.x, currentPos.y, currentPos.z);
      if (block !== BlockType.AIR) {
        // Find hit face normal by checking difference
        const hitBlock = currentPos.clone();
        const faceNormal = new THREE.Vector3();
        
        const prevBlock = new THREE.Vector3(Math.floor(lastPos.x), Math.floor(lastPos.y), Math.floor(lastPos.z));
        faceNormal.subVectors(prevBlock, hitBlock);

        // Clamp normal elements to -1, 0, 1
        faceNormal.x = Math.max(-1, Math.min(1, faceNormal.x));
        faceNormal.y = Math.max(-1, Math.min(1, faceNormal.y));
        faceNormal.z = Math.max(-1, Math.min(1, faceNormal.z));

        // Ensure normal is single-axis
        if (Math.abs(faceNormal.x) + Math.abs(faceNormal.y) + Math.abs(faceNormal.z) > 1) {
          // If diagonal, pick largest difference
          const diff = ray.clone().sub(currentPos).subScalar(0.5);
          const absX = Math.abs(diff.x);
          const absY = Math.abs(diff.y);
          const absZ = Math.abs(diff.z);
          if (absX > absY && absX > absZ) {
            faceNormal.set(diff.x > 0 ? 1 : -1, 0, 0);
          } else if (absY > absX && absY > absZ) {
            faceNormal.set(0, diff.y > 0 ? 1 : -1, 0);
          } else {
            faceNormal.set(0, 0, diff.z > 0 ? 1 : -1);
          }
        }

        return {
          hit: true,
          blockPos: hitBlock,
          placePos: hitBlock.clone().add(faceNormal),
          normal: faceNormal,
          type: block
        };
      }

      lastPos.copy(ray);
    }

    return { hit: false, blockPos: null, placePos: null, normal: null, type: BlockType.AIR };
  }

  public cleanup() {
    this.chunkMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    });
    this.chunks.clear();
    this.chunkMeshes.clear();
    this.material.dispose();
  }
}
