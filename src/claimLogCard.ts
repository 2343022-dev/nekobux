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
  discordName?: string;
  actorName?: string;
  reason?: string;
  createdAt: Date;
}

export function renderClaimLogCard(input: ClaimLogCardInput): Promise<Buffer> {
  const failed = input.variant === "failed";
  const discordName = input.discordName ?? input.discordUserId;
  const formattedAmount = input.amountRobux.toLocaleString("id-ID");

  return renderNekobuxLogCard({
    section: failed ? "GAGAL CLAIM" : "PAYOUT LOG",
    title: failed
      ? "Klaim Cashback Dibatalkan"
      : "Cashback Berhasil Dibayarkan",
    badge: failed ? "DIBATALKAN" : "BERHASIL",
    profileName: `@${input.robloxUsername}`,
    profileId: `Roblox ID ${input.robloxUserId}`,
    profileAvatarUrl: input.avatarUrl,
    accent: failed ? "#b9646b" : "#708f78",
    fields: failed
      ? [
          { label: "Penerima Discord", value: `@${discordName}` },
          { label: "Claim ID", value: `#${input.claimId}` },
          { label: "Jumlah Cashback", value: `R$ ${formattedAmount}` },
          { label: "Jumlah Pembelian", value: `${input.purchaseCount} item` },
          { label: "Status Saldo", value: "Dikembalikan ke saldo" },
          { label: "Alasan", value: input.reason ?? "Tidak diketahui" }
        ]
      : [
          { label: "Penerima Discord", value: `@${discordName}` },
          { label: "Claim ID", value: `#${input.claimId}` },
          { label: "Jumlah Dicairkan", value: `R$ ${formattedAmount}` },
          { label: "Jumlah Pembelian", value: `${input.purchaseCount} item` },
          { label: "Diproses Oleh", value: input.actorName ?? "Admin" },
          { label: "Status", value: "Berhasil dibayarkan" }
        ],
    bottomLabel: failed ? "SALDO CASHBACK" : "PENERIMA ROBLOX",
    bottomValue: failed ? "BISA DIKLAIM ULANG" : `@${input.robloxUsername}`,
    bottomRightLabel: failed ? "DIKEMBALIKAN" : "TOTAL DICAIRKAN",
    bottomRightValue: `R$ ${formattedAmount}`,
    createdAt: input.createdAt
  });
}
