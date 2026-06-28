import { mockAccounts } from "@/mocks/data";
import type { Platform, SocialAccount } from "@/types";
import { mock } from "./client";

export const accountsApi = {
  list: (): Promise<SocialAccount[]> => mock(mockAccounts),
  startLogin: async (input: {
    ownerId: string;
    platform: Platform;
    displayName: string;
  }) => {
    return mock(
      { sessionId: `login_${Date.now()}`, qrCodeUrl: "", ...input },
      300,
    );
  },
};