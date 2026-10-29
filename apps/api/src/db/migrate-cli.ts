import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

const config = loadConfig();
const handle = createDb(config.DATABASE_URL, config.DATA_DIR);
await handle.migrate();
await handle.close();
console.log("Migrations applied.");
