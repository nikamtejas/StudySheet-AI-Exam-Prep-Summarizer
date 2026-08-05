// docs/studysheet-build-prompt.md §12: "Verify student status (SheerID or
// .edu/.ac.* email) for the discounted tiers, or the discount becomes your
// only tier." Only the email-domain check is real here — SheerID needs a
// paid account/API key this environment doesn't have (same "optional,
// degrades cleanly, wire in real credentials later" pattern as M8's Google
// OAuth). Anchored with `$` deliberately — a bare `.includes('.edu')` would
// also match a domain like `notedu.com` or `edu.fakeuniversity.com`.
const STUDENT_EMAIL_PATTERN = /(\.edu|\.ac\.[a-z]{2,})$/i;

export function isStudentEmail(email: string): boolean {
  const domain = email.split('@')[1];
  if (!domain) return false;
  return STUDENT_EMAIL_PATTERN.test(domain);
}
