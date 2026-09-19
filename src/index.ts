import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction
} from "discord.js";
import type { FastifyInstance } from "fastify";
import { registerCommands } from "./commands.js";
import { processClaimQueue } from "./claimQueue.js";
import { closePool, initDatabase } from "./db.js";
import { handleInteraction } from "./interactions.js";
import { startMembershipScheduler } from "./membership.js";
import { recordPurchase } from "./purchases.js";
import { startApiServer } from "./server.js";
import { config } from "./config.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let api: FastifyInstance | null = null;
let scheduler: NodeJS.Timeout | null = null;

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await registerCommands();
    api = await startApiServer((purchase) => recordPurchase(client, purchase));
    scheduler = startMembershipScheduler(() => processClaimQueue(client));
    console.log(`Nekobuxx aktif sebagai ${readyClient.user.tag}.`);
  } catch (error) {
    console.error("Gagal menyiapkan bot:", error);
    await shutdown();
    process.exit(1);
  }
});

client.on(Events.InteractionCreate, (interaction: Interaction) => {
  void handleInteraction(interaction, client);
});

async function shutdown(): Promise<void> {
  if (scheduler) clearInterval(scheduler);
  if (api) await api.close();
  client.destroy();
  await closePool();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

await initDatabase();
await client.login(config.discordToken);
