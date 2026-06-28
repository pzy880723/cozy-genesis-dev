import { mockShops } from "@/mocks/data";
import type { Shop } from "@/types";
import { mock } from "./client";

export const shopsApi = {
  list: (): Promise<Shop[]> => mock(mockShops),
};