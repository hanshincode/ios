import * as THREE from 'three';
import { VoxelWorld, BlockType } from './VoxelWorld';

interface RemotePlayer {
  id: string;
  mesh: THREE.Group;
  hand: THREE.Mesh;
  targetPos: THREE.Vector3;
  targetYaw: number;
  swinging: boolean;
  swingTime: number;
}

export class Multiplayer {
  private socket: WebSocket | null = null;
  private scene: THREE.Scene;
  private world: VoxelWorld;
  private myId: string | null = null;
  private remotePlayers = new Map<string, RemotePlayer>();
  
  // Handlers for UI communication
  public onChatMessage?: (sender: string, msg: string) => void;
  public onConnectionState?: (connected: boolean, msg: string) => void;

  constructor(scene: THREE.Scene, world: VoxelWorld) {
    this.scene = scene;
    this.world = world;
    (window as any).gameMultiplayer = this; // Expose globally to let Player class trigger events
  }

  public connect(url: string) {
    if (this.socket) {
      this.socket.close();
    }

    if (this.onConnectionState) this.onConnectionState(false, 'Connecting to server...');

    try {
      this.socket = new WebSocket(url);
      
      this.socket.onopen = () => {
        if (this.onConnectionState) this.onConnectionState(true, 'Connected!');
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.socket.onclose = () => {
        if (this.onConnectionState) this.onConnectionState(false, 'Disconnected from server.');
        this.cleanupPlayers();
      };

      this.socket.onerror = () => {
        if (this.onConnectionState) this.onConnectionState(false, 'Connection error.');
        this.cleanupPlayers();
      };
    } catch (err) {
      if (this.onConnectionState) this.onConnectionState(false, `Failed to connect: ${err}`);
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.cleanupPlayers();
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'init':
        this.myId = msg.id;
        // Spawn existing players
        if (msg.players) {
          Object.keys(msg.players).forEach(id => {
            if (id !== this.myId) {
              const p = msg.players[id];
              this.spawnPlayer(id, p.x, p.y, p.z);
            }
          });
        }
        break;

      case 'player_join':
        if (msg.id !== this.myId) {
          this.spawnPlayer(msg.id, msg.x, msg.y, msg.z);
          this.addChatSystemMessage(`Player ${msg.id.substring(0, 4)} joined`);
        }
        break;

      case 'player_leave':
        this.despawnPlayer(msg.id);
        this.addChatSystemMessage(`Player ${msg.id.substring(0, 4)} left`);
        break;

      case 'player_move':
        if (msg.id !== this.myId) {
          const rp = this.remotePlayers.get(msg.id);
          if (rp) {
            rp.targetPos.set(msg.x, msg.y, msg.z);
            rp.targetYaw = msg.yaw;
          }
        }
        break;

      case 'player_swing':
        if (msg.id !== this.myId) {
          const rp = this.remotePlayers.get(msg.id);
          if (rp) {
            rp.swinging = true;
            rp.swingTime = 0;
          }
        }
        break;

      case 'block_update':
        // Update local block without re-triggering network broadcast
        this.world.setBlock(msg.x, msg.y, msg.z, msg.blockType, false);
        break;

      case 'chat_message':
        if (this.onChatMessage) {
          this.onChatMessage(msg.sender, msg.message);
        }
        break;
    }
  }

  private spawnPlayer(id: string, x: number, y: number, z: number) {
    // Voxel-style character group
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Body (Blue block)
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.9, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#324ab2', roughness: 0.9 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.45;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Head (Skin tone block)
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshStandardMaterial({ color: '#ffdbac', roughness: 0.9 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.1;
    head.castShadow = true;
    group.add(head);

    // Arm/Hand (Blocky appendage)
    const handGeo = new THREE.BoxGeometry(0.15, 0.15, 0.4);
    const handMat = new THREE.MeshStandardMaterial({ color: '#ffdbac', roughness: 0.9 });
    const hand = new THREE.Mesh(handGeo, handMat);
    hand.position.set(0.35, 0.6, 0.1); // Shoulder side position
    hand.rotation.set(-0.1, 0, 0);
    hand.castShadow = true;
    group.add(hand);

    this.scene.add(group);

    this.remotePlayers.set(id, {
      id,
      mesh: group,
      hand,
      targetPos: new THREE.Vector3(x, y, z),
      targetYaw: 0,
      swinging: false,
      swingTime: 0
    });
  }

  private despawnPlayer(id: string) {
    const rp = this.remotePlayers.get(id);
    if (rp) {
      this.scene.remove(rp.mesh);
      rp.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.remotePlayers.delete(id);
    }
  }

  private cleanupPlayers() {
    this.remotePlayers.forEach((_, id) => {
      this.despawnPlayer(id);
    });
    this.remotePlayers.clear();
    this.myId = null;
  }

  public sendMove(position: THREE.Vector3, yaw: number) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'move',
        x: position.x,
        y: position.y,
        z: position.z,
        yaw: yaw
      }));
    }
  }

  public sendSwing() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'swing'
      }));
    }
  }

  public sendBlockUpdate(x: number, y: number, z: number, blockType: BlockType) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'block_update',
        x,
        y,
        z,
        blockType
      }));
    }
  }

  public sendChat(msg: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'chat',
        message: msg
      }));
    }
  }

  private addChatSystemMessage(msg: string) {
    if (this.onChatMessage) {
      this.onChatMessage('SYSTEM', msg);
    }
  }

  public update(dt: number) {
    // Interpolate remote players position & rotation for smooth rendering
    this.remotePlayers.forEach(rp => {
      // Position lerp
      rp.mesh.position.lerp(rp.targetPos, 0.15);

      // Rotation yaw lerp
      // We want to wrap rotation to avoid spinning glitches
      let diff = rp.targetYaw - rp.mesh.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      rp.mesh.rotation.y += diff * 0.15;

      // Handle hand swinging animation
      if (rp.swinging) {
        rp.swingTime += dt * 15;
        if (rp.swingTime > Math.PI) {
          rp.swinging = false;
          rp.swingTime = 0;
          rp.hand.rotation.x = -0.1;
          rp.hand.position.z = 0.1;
        } else {
          const sin = Math.sin(rp.swingTime);
          rp.hand.rotation.x = -0.1 - sin * 1.2;
          rp.hand.position.z = 0.1 + sin * 0.1;
        }
      }
    });
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}
