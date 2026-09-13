/**
 * main.ts
 *
 * Application bootstrap.
 */

import { LookingGlassApp } from './app/LookingGlassApp';

function init(): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #render-canvas not found');
    return;
  }

  try {
    const app = new LookingGlassApp(canvas);
    app.start();

    // Cleanup on window unload
    window.addEventListener('beforeunload', () => {
      app.dispose();
    });
  } catch (err) {
    console.error('Fatal error initializing LookingGlassApp:', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

