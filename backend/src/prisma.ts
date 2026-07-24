import { PrismaClient } from "@prisma/client";

// En la app de escritorio, Tauri define ARINA_DB con la ruta absoluta de la base
// (en el directorio de datos del usuario). Sin la variable se usa la de prisma/arina.db.
const dbPath = process.env.ARINA_DB;

export const prisma = dbPath
  ? new PrismaClient({ datasourceUrl: `file:${dbPath}` })
  : new PrismaClient();
