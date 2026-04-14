import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Inspatch',
    description: 'Visual code editing for locally-served web pages',
    permissions: ['activeTab', 'sidePanel', 'scripting', 'storage'],
    host_permissions: ['http://localhost:*/*'],
    action: {},
  },
});
