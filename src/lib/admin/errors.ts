export type AdminErrorCode =
  | "not_found"
  | "validation"
  | "demo_record" // demo data is invented: it can't be verified or edited, only hidden or removed
  | "rejected" // restore it first
  | "conflict";

/** An expected, user-facing failure. The message is safe to show to the admin. */
export class AdminError extends Error {
  constructor(
    public code: AdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export const fail = (code: AdminErrorCode, message: string): never => {
  throw new AdminError(code, message);
};
