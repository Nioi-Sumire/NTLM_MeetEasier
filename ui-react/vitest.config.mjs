import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    fileParallelism: false,
    globals: true,
    include: ['src/**/*.test.jsx'],
    setupFiles: ['./src/setupTests.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/index.jsx',
        'src/**/*Container.{js,jsx}',
        'src/components/single-room/RoomStatusBlockALT.js'
      ]
    }
  }
});
