import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import categories from "./routes/categories";
import items from "./routes/items";
import clients from "./routes/clients";
import sales from "./routes/sales";
import cash from "./routes/cash";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/categories", categories);
app.use("/api/items", items);
app.use("/api/clients", clients);
app.use("/api/sales", sales);
app.use("/api/cash", cash);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// PWA: si el frontend está compilado, servirlo desde acá (misma origin, un solo puerto)
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(frontendDist, "index.html"));
    }
    next();
  });
}

// Manejador de errores central
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error(err);
    res.status(400).json({ error: message });
  }
);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Arina backend en http://localhost:${PORT}`);
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal);
  for (const i of lan) console.log(`  en red local: http://${i!.address}:${PORT}`);
});
