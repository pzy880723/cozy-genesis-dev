import { mockAutomationTasks } from "@/mocks/data";
import type { AutomationTask } from "@/types";
import { mock } from "./client";

export const automationApi = {
  list: (): Promise<AutomationTask[]> => mock(mockAutomationTasks),
  create: async (input: Partial<AutomationTask>) =>
    mock({ ok: true, id: `auto_${Date.now()}`, ...input }, 300),
  update: async (id: string, patch: Partial<AutomationTask>) =>
    mock({ ok: true, id, ...patch }, 200),
  runNow: async (id: string) => mock({ ok: true, id }, 200),
};