import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

const config = loadConfig();
const handle = createDb(config.DATABASE_URL, config.DATA_DIR, { poolMax: 1 });
await handle.ready();
await handle.migrate();
await handle.close();
console.log("Migrations applied.");
