import type { ConfigContext, ExpoConfig } from 'expo/config';

// Estende app.json. EXPO_BASE_URL serve quando il sito non sta alla radice del dominio,
// ad esempio su GitHub Pages: https://iltipo.github.io/Gatu/  →  EXPO_BASE_URL=/Gatu
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL || undefined,
  },
});
