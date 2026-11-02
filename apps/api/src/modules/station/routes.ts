import { networkInterfaces } from "node:os";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import type { AppContext } from "../../context.js";
import { authenticate } from "../auth/guard.js";

/** This machine's addresses on the local network (Wi-Fi or cable), IPv4. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

/** Station mode: where phones on the mandi's Wi-Fi open the app. */
export function stationRoutes(ctx: AppContext) {
  return (app: FastifyInstance) => {
    app.addHook("preHandler", authenticate(ctx));

    app.get("/station", async () => {
      if (!ctx.config.STATION_MODE) return { station: false, addresses: [] };
      // Behind docker the container's own address isn't the one phones use:
      // STATION_ADDRESS (set at install) wins.
      const fixed = ctx.config.STATION_ADDRESS?.trim();
      const addresses = fixed
        ? [fixed]
        : lanAddresses().map((ip) => `http://${ip}:${ctx.config.PORT}`);
      return {
        station: true,
        addresses,
        qr: addresses[0]
          ? await QRCode.toDataURL(addresses[0], { margin: 1, width: 240 })
          : null,
      };
    });
  };
}
