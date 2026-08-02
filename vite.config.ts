/// <reference types="node" />
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// GitHub Pages serves from /<repo>/, so the deploy script sets BASE_PATH.
// Local dev and `vite preview` stay at the root.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [svelte()],

  // Pinned, and strict on purpose.
  //
  // Review progress lives in localStorage, which is scoped to the *origin* —
  // localhost:5173 and localhost:5174 are different origins with separate
  // storage. Vite's default is to silently pick the next free port when one is
  // busy, which quietly hands you an empty deck and loses your history.
  // strictPort turns that into a loud failure instead.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
