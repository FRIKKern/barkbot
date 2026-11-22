import {defineConfig, loadEnv} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {execFileSync} from 'node:child_process'

// The app's own version for Settings > Updates: BARKBOT_VERSION when set (Gate A and behaviour pin it,
// scripts/lib/pinned-version.mjs, so a record does not move with every commit), else the short commit
// this build is made from. Null when neither says (no repository, no git): the page then shows a
// placeholder, never a made-up number.
const version = (() => {
  if (process.env.BARKBOT_VERSION) return process.env.BARKBOT_VERSION
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null
  } catch {
    return null
  }
})()

export default defineConfig(({mode}) => {
  // Server-only settings from the repo-root .env. Not VITE_-prefixed, so they never reach the
  // browser bundle: the Barkpark token lives only in server functions (D1, T1).
  Object.assign(process.env, loadEnv(mode, '..', ['BARKPARK_']))
  return {
    server: {port: 3170, strictPort: true},
    define: {__BARKBOT_VERSION__: JSON.stringify(version)},
    // Server-only modules imported into browser code fail the build instead of leaking.
    plugins: [tanstackStart({importProtection: {behavior: 'error', client: {files: ['**/src/server/**']}}}), viteReact()],
  }
})
