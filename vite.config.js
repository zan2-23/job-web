import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const react = require('/home/node/.npm-global/lib/node_modules/@vitejs/plugin-react/dist/index.js')

export default {
  plugins: [react.default()],
}
