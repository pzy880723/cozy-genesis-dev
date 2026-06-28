/**
 * Lightweight mock API client. All page-level fetching MUST go through the
 * api/* modules — never call fetch() directly from a component.
 * Real backend endpoints will replace `mock()` later.
 */
export async function mock<T>(data: T, delay = 200): Promise<T> {
  await new Promise((r) => setTimeout(r, delay));
  return JSON.parse(JSON.stringify(data));
}

export class ApiError extends Error {
  constructor(public userMessage: string, public detail?: string) {
    super(userMessage);
  }
}