import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePropertyCompsRequest } from './api/property-comps-server.js'

function propertyCompsDevProxy(env) {
  return {
    name: "property-comps-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/property-comps", async (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }
          const raw = Buffer.concat(chunks).toString("utf8");
          const body = raw ? JSON.parse(raw) : {};
          const result = await handlePropertyCompsRequest(body, env);
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.payload));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "dev_property_comps_proxy_failed",
              message: error?.message || "Local property comps proxy failed.",
            })
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), propertyCompsDevProxy(env)],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("pdfjs-dist")) {
              return "pdfjs";
            }
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "react-vendor";
            }
            if (id.includes("node_modules/@supabase")) {
              return "supabase-vendor";
            }
            if (id.includes("node_modules/tesseract.js")) {
              return "ocr-vendor";
            }
            if (id.includes("node_modules")) {
              return "vendor";
            }
            return undefined;
          },
        },
      },
    },
  };
})
