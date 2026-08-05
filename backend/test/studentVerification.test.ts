import { describe, it, expect } from 'vitest';
import { isStudentEmail } from '../src/pipeline/studentVerification';

describe('isStudentEmail', () => {
  it('accepts a .edu address', () => {
    expect(isStudentEmail('student@mit.edu')).toBe(true);
  });

  it('accepts a .ac.<country> address', () => {
    expect(isStudentEmail('student@ox.ac.uk')).toBe(true);
    expect(isStudentEmail('student@iitb.ac.in')).toBe(true);
  });

  it('rejects a regular email domain', () => {
    expect(isStudentEmail('student@gmail.com')).toBe(false);
  });

  it('rejects a domain that merely contains "edu" as a substring, not a real .edu TLD', () => {
    expect(isStudentEmail('person@fakeedu.com')).toBe(false);
    expect(isStudentEmail('person@edu.fakeuniversity.com')).toBe(false);
  });

  it('rejects a malformed address with no domain', () => {
    expect(isStudentEmail('not-an-email')).toBe(false);
  });
});
