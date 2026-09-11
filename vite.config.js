import { defineConfig } from "vite";
import { readdirSync, existsSync } from "node:fs";

// Serve the Vercel functions in api/ during `vite dev` so /api/* works
// locally. Minimal shim of the (req, res) helpers the handlers use.
function vercelApi() {
  return {
    name: "vercel-api",
    configureServer(server) {
      if (existsSync(".env")) process.loadEnvFile(".env");
      server.middlewares.use(async (req, res, next) => {
        const m = req.url.match(/^\/api\/(\w+)/);
        if (!m || !readdirSync("api").includes(`${m[1]}.js`)) return next();
        const { default: handler } = await server.ssrLoadModule(`/api/${m[1]}.js`);

        let raw = "";
        for await (const chunk of req) raw += chunk;
        req.body = raw && req.headers["content-type"]?.includes("json") ? JSON.parse(raw) : raw;

        res.status = (code) => ((res.statusCode = code), res);
        res.json = (data) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(data));
        };
        try {
          await handler(req, res);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });
    },
  };
}

export default defineConfig({ plugins: [vercelApi()] });
