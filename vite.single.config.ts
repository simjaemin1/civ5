import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** 단일 HTML(아티팩트·오프라인 실행용) 빌드: 스크립트를 IIFE로 묶고 CSS를 한 파일로 만든다. */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
})
