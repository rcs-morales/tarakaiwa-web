import { describe, it, expect, beforeEach } from 'vitest';
import { getIsChecking, setIsChecking } from '../src/sessionFlags.js';

describe('sessionFlags.js', () => {
  beforeEach(() => {
    setIsChecking(false);
  });

  it('starts false', () => {
    expect(getIsChecking()).toBe(false);
  });

  it('setIsChecking updates getIsChecking', () => {
    setIsChecking(true);
    expect(getIsChecking()).toBe(true);
    setIsChecking(false);
    expect(getIsChecking()).toBe(false);
  });
});
