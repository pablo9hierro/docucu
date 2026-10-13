import type { CapacitorConfig } from '@capacitor/cli';

/** App Android: empacota a mesma interface React rodando 100% local. */
const config: CapacitorConfig = {
  appId: 'br.com.primeirasnoticias.studio',
  appName: 'PN Studio',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#111316',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
