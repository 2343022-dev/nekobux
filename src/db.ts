import pg from "pg";
import { config } from "./config.js";
import type { BalanceSummary, PurchaseInput, PurchaseRecord } from "./types.js";
import { addDays, calculateCashback } from "./utils.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined
});

export interface RobloxLink {
  discordUserId: string;
  robloxUserId: number;
  robloxUsername: string;
  robloxDisplayName: string;
  communityMember: boolean;
  communitySince: Date | null;
  communityLastCheckedAt: Date | null;
}

export interface ClaimRecord {
  id: number;
  discordUserId: string;
  robloxUserId: number;
  amountRobux: number;
  status: string;
  channelId: string | null;
  createdAt: Date;
}

export async function initDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roblox_links (
      discord_user_id TEXT PRIMARY KEY,
      roblox_user_id BIGINT UNIQUE NOT NULL,
      roblox_username TEXT NOT NULL,
      roblox_display_name TEXT NOT NULL,
      community_member BOOLEAN NOT NULL DEFAULT FALSE,
      community_since TIMESTAMPTZ,
      community_last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id BIGSERIAL PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      roblox_user_id BIGINT NOT NULL,
      roblox_username TEXT NOT NULL,
      asset_id BIGINT NOT NULL,
      asset_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'asset',
      price_robux INTEGER NOT NULL CHECK (price_robux > 0),
      cashback_robux INTEGER NOT NULL CHECK (cashback_robux >= 0),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'available', 'locked', 'paid', 'rejected')),
      purchased_at TIMESTAMPTZ NOT NULL,
      funds_available_at TIMESTAMPTZ NOT NULL,
      discord_channel_id TEXT,
      discord_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS purchases_roblox_user_id_idx
      ON purchases (roblox_user_id);
    CREATE INDEX IF NOT EXISTS purchases_status_idx
      ON purchases (status);

    ALTER TABLE purchases
      ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'asset';

    CREATE TABLE IF NOT EXISTS claims (
      id BIGSERIAL PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      roblox_user_id BIGINT NOT NULL,
      amount_robux INTEGER NOT NULL CHECK (amount_robux > 0),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'verified', 'rejected', 'paid')),
      channel_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS one_active_claim_per_discord
      ON claims (discord_user_id)
      WHERE status IN ('open', 'verified');

    CREATE TABLE IF NOT EXISTS claim_items (
      claim_id BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      purchase_id BIGINT NOT NULL UNIQUE REFERENCES purchases(id),
      PRIMARY KEY (claim_id, purchase_id)
    );
  `);
}

function mapLink(row: Record<string, unknown>): RobloxLink {
  return {
    discordUserId: String(row.discord_user_id),
    robloxUserId: Number(row.roblox_user_id),
    robloxUsername: String(row.roblox_username),
    robloxDisplayName: String(row.roblox_display_name),
    communityMember: Boolean(row.community_member),
    communitySince: row.community_since ? new Date(String(row.community_since)) : null,
    communityLastCheckedAt: row.community_last_checked_at
      ? new Date(String(row.community_last_checked_at))
      : null
  };
}

export async function getLinkByDiscord(discordUserId: string): Promise<RobloxLink | null> {
  const result = await pool.query("SELECT * FROM roblox_links WHERE discord_user_id = $1", [
    discordUserId
  ]);
  return result.rows[0] ? mapLink(result.rows[0]) : null;
}

export async function getLinkByRoblox(robloxUserId: number): Promise<RobloxLink | null> {
  const result = await pool.query("SELECT * FROM roblox_links WHERE roblox_user_id = $1", [
    robloxUserId
  ]);
  return result.rows[0] ? mapLink(result.rows[0]) : null;
}

export async function listLinks(): Promise<RobloxLink[]> {
  const result = await pool.query("SELECT * FROM roblox_links ORDER BY created_at ASC");
  return result.rows.map(mapLink);
}

export async function createLink(input: {
  discordUserId: string;
  robloxUserId: number;
  robloxUsername: string;
  robloxDisplayName: string;
  communityMember: boolean;
}): Promise<RobloxLink> {
  const communitySince = input.communityMember ? new Date() : null;
  const result = await pool.query(
    `INSERT INTO roblox_links (
       discord_user_id, roblox_user_id, roblox_username, roblox_display_name,
       community_member, community_since, community_last_checked_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [
      input.discordUserId,
      input.robloxUserId,
      input.robloxUsername,
      input.robloxDisplayName,
      input.communityMember,
      communitySince
    ]
  );
  return mapLink(result.rows[0]);
}

export async function unlinkDiscord(discordUserId: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM roblox_links WHERE discord_user_id = $1", [
    discordUserId
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateCommunityStatus(
  link: RobloxLink,
  isMember: boolean
): Promise<RobloxLink> {
  let communitySince = link.communitySince;
  if (!isMember) communitySince = null;
  if (isMember && !link.communityMember) communitySince = new Date();

  const result = await pool.query(
    `UPDATE roblox_links
     SET community_member = $2,
         community_since = $3,
         community_last_checked_at = NOW(),
         updated_at = NOW()
     WHERE discord_user_id = $1
     RETURNING *`,
    [link.discordUserId, isMember, communitySince]
  );

  if (!isMember) {
    await pool.query(
      "UPDATE purchases SET status = 'pending' WHERE roblox_user_id = $1 AND status = 'available'",
      [link.robloxUserId]
    );
  }

  return mapLink(result.rows[0]);
}

export async function setCommunityAge(
  robloxUserId: number,
  days: number
): Promise<RobloxLink | null> {
  const result = await pool.query(
    `UPDATE roblox_links
     SET community_member = TRUE,
         community_since = NOW() - ($2 * INTERVAL '1 day'),
         community_last_checked_at = NOW(),
         updated_at = NOW()
     WHERE roblox_user_id = $1
     RETURNING *`,
    [robloxUserId, days]
  );
  if (!result.rows[0]) return null;
  await refreshEligibilityForUser(robloxUserId);
  return mapLink(result.rows[0]);
}

function mapPurchase(row: Record<string, unknown>): PurchaseRecord {
  return {
    id: Number(row.id),
    eventId: String(row.event_id),
    robloxUserId: Number(row.roblox_user_id),
    robloxUsername: String(row.roblox_username),
    assetId: Number(row.asset_id),
    assetName: String(row.asset_name),
    itemType: row.item_type === "bundle" ? "bundle" : "asset",
    priceRobux: Number(row.price_robux),
    cashbackRobux: Number(row.cashback_robux),
    status: row.status as PurchaseRecord["status"],
    purchasedAt: new Date(String(row.purchased_at)),
    fundsAvailableAt: new Date(String(row.funds_available_at))
  };
}

export async function insertPurchase(input: PurchaseInput): Promise<PurchaseRecord | null> {
  const cashback = calculateCashback(input.priceRobux, config.cashbackPercent);
  const fundsAvailableAt = addDays(input.purchasedAt, config.fundsHoldDays);
  const result = await pool.query(
    `INSERT INTO purchases (
       event_id, roblox_user_id, roblox_username, asset_id, asset_name, item_type,
       price_robux, cashback_robux, status, purchased_at, funds_available_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING *`,
    [
      input.eventId,
      input.robloxUserId,
      input.robloxUsername,
      input.assetId,
      input.assetName,
      input.itemType,
      input.priceRobux,
      cashback,
      input.purchasedAt,
      fundsAvailableAt
    ]
  );
  return result.rows[0] ? mapPurchase(result.rows[0]) : null;
}

export async function savePurchaseMessage(
  purchaseId: number,
  channelId: string,
  messageId: string
): Promise<void> {
  await pool.query(
    "UPDATE purchases SET discord_channel_id = $2, discord_message_id = $3 WHERE id = $1",
    [purchaseId, channelId, messageId]
  );
}

export async function refreshEligibilityForUser(robloxUserId: number): Promise<number> {
  const result = await pool.query(
    `UPDATE purchases p
     SET status = 'available'
     FROM roblox_links l
     WHERE p.roblox_user_id = $1
       AND l.roblox_user_id = p.roblox_user_id
       AND p.status = 'pending'
       AND p.funds_available_at <= NOW()
       AND l.community_member = TRUE
       AND l.community_since IS NOT NULL
       AND l.community_since <= NOW() - ($2 * INTERVAL '1 day')`,
    [robloxUserId, config.communityWaitDays]
  );
  return result.rowCount ?? 0;
}

export async function getBalance(robloxUserId: number): Promise<BalanceSummary> {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(cashback_robux) FILTER (WHERE status = 'pending'), 0)::int AS pending,
       COALESCE(SUM(cashback_robux) FILTER (WHERE status = 'available'), 0)::int AS available,
       COALESCE(SUM(cashback_robux) FILTER (WHERE status = 'locked'), 0)::int AS locked,
       COALESCE(SUM(cashback_robux) FILTER (WHERE status = 'paid'), 0)::int AS paid,
       COALESCE(SUM(price_robux) FILTER (WHERE status <> 'rejected'), 0)::int AS total_spent,
       COALESCE(SUM(cashback_robux) FILTER (WHERE status <> 'rejected'), 0)::int AS total_cashback
     FROM purchases WHERE roblox_user_id = $1`,
    [robloxUserId]
  );
  const row = result.rows[0];
  return {
    pending: Number(row.pending),
    available: Number(row.available),
    locked: Number(row.locked),
    paid: Number(row.paid),
    totalSpent: Number(row.total_spent),
    totalCashback: Number(row.total_cashback)
  };
}

export async function getActiveClaim(discordUserId: string): Promise<ClaimRecord | null> {
  const result = await pool.query(
    "SELECT * FROM claims WHERE discord_user_id = $1 AND status IN ('open', 'verified') LIMIT 1",
    [discordUserId]
  );
  return result.rows[0] ? mapClaim(result.rows[0]) : null;
}

function mapClaim(row: Record<string, unknown>): ClaimRecord {
  return {
    id: Number(row.id),
    discordUserId: String(row.discord_user_id),
    robloxUserId: Number(row.roblox_user_id),
    amountRobux: Number(row.amount_robux),
    status: String(row.status),
    channelId: row.channel_id ? String(row.channel_id) : null,
    createdAt: new Date(String(row.created_at))
  };
}

export async function lockAvailablePurchases(
  discordUserId: string,
  robloxUserId: number
): Promise<{ claim: ClaimRecord; purchases: PurchaseRecord[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const purchaseResult = await client.query(
      `SELECT * FROM purchases
       WHERE roblox_user_id = $1 AND status = 'available'
       ORDER BY purchased_at ASC
       FOR UPDATE`,
      [robloxUserId]
    );
    const purchases = purchaseResult.rows.map(mapPurchase);
    const amount = purchases.reduce((sum, purchase) => sum + purchase.cashbackRobux, 0);
    if (amount <= 0) throw new Error("Tidak ada saldo yang dapat dicairkan.");

    const claimResult = await client.query(
      `INSERT INTO claims (discord_user_id, roblox_user_id, amount_robux)
       VALUES ($1, $2, $3) RETURNING *`,
      [discordUserId, robloxUserId, amount]
    );
    const claim = mapClaim(claimResult.rows[0]);

    for (const purchase of purchases) {
      await client.query(
        "INSERT INTO claim_items (claim_id, purchase_id) VALUES ($1, $2)",
        [claim.id, purchase.id]
      );
    }
    await client.query(
      "UPDATE purchases SET status = 'locked' WHERE id = ANY($1::bigint[])",
      [purchases.map((purchase) => purchase.id)]
    );
    await client.query("COMMIT");
    return { claim, purchases };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setClaimChannel(claimId: number, channelId: string): Promise<void> {
  await pool.query("UPDATE claims SET channel_id = $2 WHERE id = $1", [claimId, channelId]);
}

export async function getClaimById(claimId: number): Promise<ClaimRecord | null> {
  const result = await pool.query("SELECT * FROM claims WHERE id = $1", [claimId]);
  return result.rows[0] ? mapClaim(result.rows[0]) : null;
}

export async function getClaimPurchases(claimId: number): Promise<PurchaseRecord[]> {
  const result = await pool.query(
    `SELECT p.* FROM purchases p
     JOIN claim_items ci ON ci.purchase_id = p.id
     WHERE ci.claim_id = $1 ORDER BY p.purchased_at ASC`,
    [claimId]
  );
  return result.rows.map(mapPurchase);
}

export async function verifyClaim(claimId: number): Promise<void> {
  await pool.query(
    "UPDATE claims SET status = 'verified', verified_at = NOW() WHERE id = $1 AND status = 'open'",
    [claimId]
  );
}

export async function rejectClaim(claimId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE purchases SET status = 'available'
       WHERE id IN (SELECT purchase_id FROM claim_items WHERE claim_id = $1)
         AND status = 'locked'`,
      [claimId]
    );
    await client.query(
      "UPDATE claims SET status = 'rejected', closed_at = NOW() WHERE id = $1 AND status IN ('open', 'verified')",
      [claimId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markClaimPaid(claimId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE purchases SET status = 'paid'
       WHERE id IN (SELECT purchase_id FROM claim_items WHERE claim_id = $1)
         AND status = 'locked'`,
      [claimId]
    );
    const result = await client.query(
      `UPDATE claims SET status = 'paid', paid_at = NOW(), closed_at = NOW()
       WHERE id = $1 AND status = 'verified'`,
      [claimId]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("Claim harus diverifikasi sebelum ditandai dibayar.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
