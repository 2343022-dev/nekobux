import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Environment variable ${name} wajib diisi.`);
  return value;
}

function numberValue(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} harus berupa angka.`);
  return value;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  guildId: required("GUILD_ID"),
  verifiedRoleId: required("VERIFIED_ROLE_ID"),
  adminRoleId: required("ADMIN_ROLE_ID"),
  purchaseLogChannelId: required("PURCHASE_LOG_CHANNEL_ID"),
  ticketCategoryId: required("TICKET_CATEGORY_ID"),
  payoutLogChannelId: process.env.PAYOUT_LOG_CHANNEL_ID?.trim() || "",
  robloxGroupId: numberValue("ROBLOX_GROUP_ID", 90169160),
  minimumItemPrice: numberValue("MIN_ITEM_PRICE", 30),
  cashbackPercent: numberValue("CASHBACK_PERCENT", 20),
  communityWaitDays: numberValue("COMMUNITY_WAIT_DAYS", 14),
  fundsHoldDays: numberValue("FUNDS_HOLD_DAYS", 30),
  membershipCheckMinutes: numberValue("MEMBERSHIP_CHECK_MINUTES", 60),
  apiSecret: required("API_SECRET"),
  port: numberValue("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
  databaseSsl: process.env.DATABASE_SSL?.toLowerCase() === "true"
} as const;
