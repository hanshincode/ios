import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voxelcraft.game',
  appName: 'VoxelCraft',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
