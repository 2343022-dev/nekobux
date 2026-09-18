import { config } from "./config.js";
import {
  getLinkByRoblox,
  listLinks,
  refreshEligibilityForUser,
  updateCommunityStatus,
  type RobloxLink
} from "./db.js";
import { isCommunityMember } from "./roblox.js";
import { errorMessage } from "./utils.js";

export async function refreshMembership(link: RobloxLink): Promise<RobloxLink> {
  const member = await isCommunityMember(link.robloxUserId, config.robloxGroupId);
  const updated = await updateCommunityStatus(link, member);
  await refreshEligibilityForUser(link.robloxUserId);
  return updated;
}

export async function refreshMembershipByRobloxId(robloxUserId: number): Promise<RobloxLink | null> {
  const link = await getLinkByRoblox(robloxUserId);
  return link ? refreshMembership(link) : null;
}

export function startMembershipScheduler(): NodeJS.Timeout {
  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const links = await listLinks();
      for (const link of links) {
        try {
          await refreshMembership(link);
        } catch (error) {
          console.error(`[community] ${link.robloxUsername}: ${errorMessage(error)}`);
        }
      }
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(() => void run(), config.membershipCheckMinutes * 60_000);
}
