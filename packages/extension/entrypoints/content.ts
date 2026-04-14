export default defineContentScript({
  matches: ['http://localhost:*/*'],
  main() {
    console.log('[Inspatch] Content script loaded');
  },
});
