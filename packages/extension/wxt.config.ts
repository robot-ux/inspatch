import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: {
      port: 3737,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    server: {
      cors: true,
    },
  }),
  manifest: {
    name: 'Inspatch',
    description: 'Visual code editing for locally-served web pages',
    permissions: ['activeTab', 'sidePanel', 'scripting', 'storage'],
    host_permissions: ['http://localhost/*'],
    web_accessible_resources: [
      {
        resources: ['fiber-main-world.js', 'console-main-world.js'],
        matches: ['http://localhost/*'],
      },
    ],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {},
  },
});
