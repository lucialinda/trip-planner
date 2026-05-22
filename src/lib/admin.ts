export const ADMIN_UIDS = [
  // Local emulator admin user. Add production Firebase Auth UIDs here before deploy.
  "xdiqN6R92NbFXjf2zB8y0xdTB0Ky",
  "PTKwn2IQngeI1PFhuwx2t6Uv5iu2",
] as const;

export function isAdminUid(uid?: string | null) {
  return !!uid && (ADMIN_UIDS as readonly string[]).includes(uid);
}
