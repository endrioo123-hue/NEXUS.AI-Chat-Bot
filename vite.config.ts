import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente com fallback para objeto vazio
  // process.cwd() agora funciona pois adicionamos @types/node
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Reduz warnings de chunks grandes que as vezes falham o build
      chunkSizeWarningLimit: 1000,
    },
    define: {
      // Garante que a chave nunca seja undefined para evitar crash do JSON.stringify
      'process.env.API_KEY': JSON.stringify(env.API_KEY || "")
    }
  }
})