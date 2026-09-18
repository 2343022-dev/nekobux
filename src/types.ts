export type PurchaseStatus = "pending" | "available" | "locked" | "paid" | "rejected";
export type ClaimStatus = "open" | "verified" | "rejected" | "paid";

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  isBanned?: boolean;
}

export interface PurchaseInput {
  eventId: string;
  robloxUserId: number;
  robloxUsername: string;
  assetId: number;
  assetName: string;
  priceRobux: number;
  purchasedAt: Date;
}

export interface PurchaseRecord extends PurchaseInput {
  id: number;
  cashbackRobux: number;
  status: PurchaseStatus;
  fundsAvailableAt: Date;
}

export interface BalanceSummary {
  pending: number;
  available: number;
  locked: number;
  paid: number;
  totalSpent: number;
  totalCashback: number;
}
