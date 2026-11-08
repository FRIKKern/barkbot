import {defineConfig, loadEnv} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig(({mode}) => {
  // Server-only settings from the repo-root .env. Not VITE_-prefixed, so they never reach the
  // browser bundle: the Barkpark token lives only in server functions (D1, T1).
  Object.assign(process.env, loadEnv(mode, '..', ['BARKPARK_']))
  return {
    server: {port: 3170, strictPort: true},
    // Server-only modules imported into browser code fail the build instead of leaking.
    plugins: [tanstackStart({importProtection: {behavior: 'error', client: {files: ['**/src/server/**']}}}), viteReact()],
  }
})
