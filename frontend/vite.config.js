/**
 * @fileoverview Vite config. Dev server is pinned to port 5175 (not Vite's
 * default 5173) because 5173 is already taken by another local project's
 * container on this machine — see the port map in the repo README.
 * @author Mohit Sharma
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
});
