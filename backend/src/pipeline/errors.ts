export type ValidationFailureReason =
  | 'not_a_pdf'
  | 'too_large'
  | 'too_many_pages'
  | 'encrypted'
  | 'corrupt';

// Thrown for untrusted-input problems the caller should show the user directly
// (docs/studysheet-milestones.md invariant 9: validate before spending a token).
// Never thrown for infrastructure failures — those are real bugs/outages, not this.
export class DocumentValidationError extends Error {
  reason: ValidationFailureReason;

  constructor(reason: ValidationFailureReason, message: string) {
    super(message);
    this.name = 'DocumentValidationError';
    this.reason = reason;
  }
}
