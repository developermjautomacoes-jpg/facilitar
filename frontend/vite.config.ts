import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// base "./": o mesmo build funciona na raiz do domínio e em /memorandos/
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      // janelas.css: tema das páginas embutidas (memorando e planejamento), com nome fixo para elas carregarem
      input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), janelas: fileURLToPath(new URL("./src/styles/janelas.css", import.meta.url)) },
      output: { assetFileNames: (a) => (a.name === "janelas.css" ? "assets/janelas.css" : "assets/[name]-[hash][extname]") },
    },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    // em desenvolvimento, encaminha o api.php e o módulo legado para um PHP local (php -S 127.0.0.1:8099)
    proxy: { "/api.php": "http://127.0.0.1:8099", "/legado": "http://127.0.0.1:8099" },
  },
});
