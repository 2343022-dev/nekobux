import type { RobloxUser } from "./types.js";

const REQUEST_TIMEOUT_MS = 10_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) {
    throw new Error(`Roblox API gagal (${response.status}). Coba lagi sebentar.`);
  }
  return (await response.json()) as T;
}

export async function resolveRobloxUsername(username: string): Promise<RobloxUser | null> {
  const result = await fetchJson<{ data: RobloxUser[] }>(
    "https://users.roblox.com/v1/usernames/users",
    {
      method: "POST",
      body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: false })
    }
  );
  return result.data[0] ?? null;
}

export async function getRobloxUser(userId: number): Promise<RobloxUser> {
  return fetchJson<RobloxUser>(`https://users.roblox.com/v1/users/${userId}`);
}

export async function isCommunityMember(userId: number, groupId: number): Promise<boolean> {
  const result = await fetchJson<{
    data: Array<{ group: { id: number; name: string }; role: { id: number; name: string } }>;
  }>(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  return result.data.some((membership) => membership.group.id === groupId);
}

async function getThumbnail(url: string): Promise<string | null> {
  const result = await fetchJson<{
    data: Array<{ state: string; imageUrl?: string }>;
  }>(url);
  const thumbnail = result.data[0];
  return thumbnail?.state === "Completed" && thumbnail.imageUrl ? thumbnail.imageUrl : null;
}

export async function getAvatarThumbnail(userId: number): Promise<string | null> {
  return getThumbnail(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
  );
}

export async function getAssetThumbnail(assetId: number): Promise<string | null> {
  return getThumbnail(
    `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png&isCircular=false`
  );
}
