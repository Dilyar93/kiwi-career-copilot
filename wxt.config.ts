import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'storage', 'geolocation', 'scripting'],
    host_permissions: [
      'http://127.0.0.1/*',
      'https://www.seek.co.nz/*',
      'https://nz.seek.com/*',
    ],
    action: {
      default_title: '__MSG_openSidePanel__',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
      },
    },
  },
});
