/**
 * main.ts
 *
 * Application bootstrap.
 */

import { LookingGlassApp } from './app/LookingGlassApp';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element #render-canvas not found');
  }

  const app = new LookingGlassApp(canvas);
  app.start();

  // Cleanup on window unload
  window.addEventListener('beforeunload', () => {
    app.dispose();
  });
});

