import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pantrysync.app',
  appName: 'PantrySync',
  webDir: 'dist',
  server: {
    url: 'https://476afb28-ffc7-47df-b3d1-45c8b13771c6.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
