import type { APIEmbedField } from "discord.js";
import { renderNekobuxLogCard } from "./logCard.js";

function plain(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, "")
    .replace(/<@!?(\d+)>/g, "Discord ID $1")
    .replace(/<#(\d+)>/g, "Channel ID $1")
    .replace(/<@&(\d+)>/g, "Role ID $1")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderAdminAuditCard(input: {
  title: string;
  command: string;
  adminName: string;
  adminDiscordId: string;
  adminAvatarUrl: string | null;
  color: number;
  fields: APIEmbedField[];
  createdAt: Date;
}): Promise<Buffer> {
  const accent = `#${input.color.toString(16).padStart(6, "0").slice(-6)}`;

  return renderNekobuxLogCard({
    section: "PAYOUT LOG",
    title: plain(input.title),
    badge: `/${input.command}`,
    profileName: input.adminName,
    profileId: `Discord ID ${input.adminDiscordId}`,
    profileAvatarUrl: input.adminAvatarUrl,
    accent,
    fields: input.fields.map((field) => ({
      label: plain(field.name),
      value: plain(field.value)
    })),
    bottomLabel: "DIPROSES OLEH",
    bottomValue: input.adminName,
    bottomRightLabel: "LOG STATUS",
    bottomRightValue: "TERCATAT",
    createdAt: input.createdAt
  });
}
