const AIGC_ALLOWED_ROLES = new Set(["super_admin", "hq_operator", "store_manager", "store_staff"]);

const AIGC_ACCESS_PERMISSION = "aigc_access";
const ERP_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hasErpAigcAccess(roles: string[], permissions: string[]): boolean {
  return (
    permissions.includes(AIGC_ACCESS_PERMISSION) ||
    roles.some((role) => AIGC_ALLOWED_ROLES.has(role))
  );
}

export function validateErpTicket(ticket: string): string {
  const value = ticket.trim();
  if (!ERP_TICKET_PATTERN.test(value)) throw new Error("ticket_invalid");
  return value;
}

export function normalizeInternalRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
