import { renderNekobuxLogCard } from "./logCard.js";

export interface ClaimLogCardInput {
  variant: "payout" | "failed";
  claimId: number;
  discordUserId: string;
  robloxUserId: number;
  robloxUsername: string;
  amountRobux: number;
  purchaseCount: number;
  avatarUrl: string | null;
  actorName?: string;
  reason?: string;
  createdAt: Date;
}

export function renderClaimLogCard(input: ClaimLogCardInput): Promise<Buffer> {
  const failed = input.variant === "failed";

  return renderNekobuxLogCard({
    section: failed ? "GAGAL CLAIM" : "PAYOUT LOG",
    title: failed
      ? `Klaim #${input.claimId} Dibatalkan`
      : `Klaim #${input.claimId} Berhasil Dibayar`,
    badge: failed ? "CLAIM DIBATALKAN" : "PAYOUT BERHASIL",
    profileName: `@${input.robloxUsername}`,
    profileId: `Roblox ID ${input.robloxUserId}`,
    profileAvatarUrl: input.avatarUrl,
    accent: failed ? "#b9646b" : "#708f78",
    fields: [
      { label: "Discord User", value: `ID ${input.discordUserId}` },
      { label: "Username Roblox", value: `@${input.robloxUsername}` },
      { label: "Roblox User ID", value: String(input.robloxUserId) },
      { label: "Jumlah Pembelian", value: `${input.purchaseCount} item` },
      {
        label: failed ? "Status Saldo" : "Diproses Oleh",
        value: failed ? "Dikembalikan ke saldo" : input.actorName ?? "Admin"
      },
      {
        label: failed ? "Alasan" : "Status",
        value: failed ? input.reason ?? "Tidak diketahui" : "Selesai dibayar"
      }
    ],
    bottomLabel: failed ? "SALDO CASHBACK" : "STATUS PAYOUT",
    bottomValue: failed ? "BISA DIKLAIM ULANG" : "BERHASIL DIBAYAR",
    bottomRightLabel: failed ? "DIKEMBALIKAN" : "TOTAL PAYOUT",
    bottomRightValue: `R$ ${input.amountRobux.toLocaleString("id-ID")}`,
    createdAt: input.createdAt
  });
}
