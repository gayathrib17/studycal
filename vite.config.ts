/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the same build works at a domain root or under a sub-path
  // such as GitLab/GitHub Pages' https://<user>.gitlab.io/studycal/. The app has no client-side routes.
  base: './',
  test: {
    environment: 'node',
  },
});
