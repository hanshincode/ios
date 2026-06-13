import * as THREE from 'three';

export interface TextureUV {
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

export class TextureAtlas {
  public texture: THREE.CanvasTexture;
  private textureSize = 16;
  private atlasWidth = 256; // Up to 16 textures side-by-side
  private atlasHeight = 16;
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.atlasWidth;
    this.canvas.height = this.atlasHeight;
    this.generateTextures();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  private generateTextures() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, this.atlasWidth, this.atlasHeight);

    // 0: Dirt
    this.drawNoiseBlock(ctx, 0, '#866043', '#5c3e29', '#997151');

    // 1: Grass Top
    this.drawNoiseBlock(ctx, 1, '#5b8731', '#406320', '#6fa63c');

    // 2: Grass Side
    this.drawGrassSide(ctx, 2);

    // 3: Stone
    this.drawNoiseBlock(ctx, 3, '#7a7a7a', '#616161', '#919191');

    // 4: Wood Log Side
    this.drawWoodSide(ctx, 4);

    // 5: Wood Log Top
    this.drawWoodTop(ctx, 5);

    // 6: Leaves
    this.drawLeaves(ctx, 6);

    // 7: Brick
    this.drawBrick(ctx, 7);

    // 8: Glass
    this.drawGlass(ctx, 8);
  }

  private drawNoiseBlock(
    ctx: CanvasRenderingContext2D,
    index: number,
    baseColor: string,
    darkColor: string,
    lightColor: string
  ) {
    const xOffset = index * this.textureSize;
    ctx.fillStyle = baseColor;
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    for (let x = 0; x < this.textureSize; x++) {
      for (let y = 0; y < this.textureSize; y++) {
        const rand = Math.random();
        if (rand < 0.15) {
          ctx.fillStyle = darkColor;
          ctx.fillRect(xOffset + x, y, 1, 1);
        } else if (rand > 0.85) {
          ctx.fillStyle = lightColor;
          ctx.fillRect(xOffset + x, y, 1, 1);
        }
      }
    }
  }

  private drawGrassSide(ctx: CanvasRenderingContext2D, index: number) {
    const xOffset = index * this.textureSize;
    // Base is dirt
    ctx.fillStyle = '#866043';
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    // Dirt noise
    for (let x = 0; x < this.textureSize; x++) {
      for (let y = 0; y < this.textureSize; y++) {
        const rand = Math.random();
        if (rand < 0.15) {
          ctx.fillStyle = '#5c3e29';
          ctx.fillRect(xOffset + x, y, 1, 1);
        } else if (rand > 0.85) {
          ctx.fillStyle = '#997151';
          ctx.fillRect(xOffset + x, y, 1, 1);
        }
      }
    }

    // Grass overhang on top
    ctx.fillStyle = '#5b8731';
    for (let x = 0; x < this.textureSize; x++) {
      // Varying heights of grass hanging down
      const grassHeight = 3 + Math.floor(Math.sin(x * 1.5) * 1.5) + (Math.random() > 0.7 ? 1 : 0);
      for (let y = 0; y < grassHeight; y++) {
        const shade = Math.random() > 0.7 ? '#6fa63c' : (Math.random() > 0.7 ? '#406320' : '#5b8731');
        ctx.fillStyle = shade;
        ctx.fillRect(xOffset + x, y, 1, 1);
      }
    }
  }

  private drawWoodSide(ctx: CanvasRenderingContext2D, index: number) {
    const xOffset = index * this.textureSize;
    // Bark base brown
    ctx.fillStyle = '#6b4c35';
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    // Vertical dark brown bark lines
    ctx.fillStyle = '#422e20';
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(Math.random() * this.textureSize);
      ctx.fillRect(xOffset + x, 0, 1 + Math.floor(Math.random() * 2), this.textureSize);
    }

    // Bark texture highlights
    ctx.fillStyle = '#8f6448';
    for (let x = 0; x < this.textureSize; x++) {
      for (let y = 0; y < this.textureSize; y++) {
        if (Math.random() > 0.85) {
          ctx.fillRect(xOffset + x, y, 1, 1);
        }
      }
    }
  }

  private drawWoodTop(ctx: CanvasRenderingContext2D, index: number) {
    const xOffset = index * this.textureSize;
    // Light inner wood color
    ctx.fillStyle = '#cfad82';
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    // Concentric rings
    ctx.strokeStyle = '#9c7b53';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.strokeRect(xOffset + 2, 2, 12, 12);
    ctx.strokeRect(xOffset + 5, 5, 6, 6);

    // Core
    ctx.fillStyle = '#80613a';
    ctx.fillRect(xOffset + 7, 7, 2, 2);

    // Outer bark border
    ctx.fillStyle = '#422e20';
    ctx.strokeRect(xOffset + 0.5, 0.5, this.textureSize - 1, this.textureSize - 1);
  }

  private drawLeaves(ctx: CanvasRenderingContext2D, index: number) {
    const xOffset = index * this.textureSize;
    ctx.fillStyle = '#305c22';
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    // Leaf pixel clumps
    ctx.fillStyle = '#214016';
    for (let i = 0; i < 20; i++) {
      const rx = Math.floor(Math.random() * (this.textureSize - 1));
      const ry = Math.floor(Math.random() * (this.textureSize - 1));
      ctx.fillRect(xOffset + rx, ry, 2, 1);
      ctx.fillRect(xOffset + rx, ry, 1, 2);
    }

    ctx.fillStyle = '#468034';
    for (let i = 0; i < 15; i++) {
      const rx = Math.floor(Math.random() * this.textureSize);
      const ry = Math.floor(Math.random() * this.textureSize);
      ctx.fillRect(xOffset + rx, ry, 1, 1);
    }
  }

  private drawBrick(ctx: CanvasRenderingContext2D, index: number) {
    const xOffset = index * this.textureSize;
    // Dark red base
    ctx.fillStyle = '#a84c3e';
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    // Mortar lines (grey)
    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(xOffset, 4, this.textureSize, 1);
    ctx.fillRect(xOffset, 9, this.textureSize, 1);
    ctx.fillRect(xOffset, 14, this.textureSize, 1);

    // Vertical separations (alternating)
    ctx.fillRect(xOffset + 4, 0, 1, 4);
    ctx.fillRect(xOffset + 12, 0, 1, 4);

    ctx.fillRect(xOffset + 0, 5, 1, 4);
    ctx.fillRect(xOffset + 8, 5, 1, 4);

    ctx.fillRect(xOffset + 4, 10, 1, 4);
    ctx.fillRect(xOffset + 12, 10, 1, 4);

    // Brick shading (highlights/shadows)
    ctx.fillStyle = '#7a3127';
    ctx.fillRect(xOffset + 1, 3, 3, 1);
    ctx.fillRect(xOffset + 9, 3, 3, 1);
    ctx.fillRect(xOffset + 5, 8, 3, 1);
    ctx.fillRect(xOffset + 13, 8, 3, 1);
  }

  private drawGlass(ctx: CanvasRenderingContext2D, index: number) {
    const xOffset = index * this.textureSize;
    // Translucent light blue border
    ctx.fillStyle = 'rgba(180, 220, 240, 0.4)';
    ctx.fillRect(xOffset, 0, this.textureSize, this.textureSize);

    ctx.fillStyle = '#ffffff';
    // Glass borders
    ctx.fillRect(xOffset, 0, this.textureSize, 1);
    ctx.fillRect(xOffset, this.textureSize - 1, this.textureSize, 1);
    ctx.fillRect(xOffset, 0, 1, this.textureSize);
    ctx.fillRect(xOffset + this.textureSize - 1, 0, 1, this.textureSize);

    // Glass sheen reflections (diagonal lines)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(xOffset + 3, 3, 1, 1);
    ctx.fillRect(xOffset + 4, 2, 1, 1);

    ctx.fillRect(xOffset + 11, 11, 1, 1);
    ctx.fillRect(xOffset + 12, 10, 1, 1);
    ctx.fillRect(xOffset + 10, 12, 1, 1);
  }

  public getUV(index: number): TextureUV {
    const numTextures = this.atlasWidth / this.textureSize;
    const uMin = index / numTextures;
    const uMax = (index + 1) / numTextures;
    const vMin = 0.0;
    const vMax = 1.0;
    return { uMin, vMin, uMax, vMax };
  }
}
