import { randomBytes } from "node:crypto";

export function calculateCashback(price: number, percent: number): number {
  return Math.floor((price * percent) / 100);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function discordTimestamp(date: Date, style: "R" | "F" = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function safeChannelName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return normalized || `user-${randomBytes(3).toString("hex")}`;
}

export function randomId(prefix: string): string {
  return `${prefix}:${Date.now()}:${randomBytes(5).toString("hex")}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
