import { describe, expect, it } from 'vitest';
import { classifySeverity } from './severity.js';

describe('classifySeverity', () => {
  it('maps scores to CVSS v3 bands at their boundaries', () => {
    expect(classifySeverity(10)).toBe('critical');
    expect(classifySeverity(9.0)).toBe('critical');
    expect(classifySeverity(8.9)).toBe('high');
    expect(classifySeverity(7.0)).toBe('high');
    expect(classifySeverity(6.9)).toBe('medium');
    expect(classifySeverity(4.0)).toBe('medium');
    expect(classifySeverity(3.9)).toBe('low');
    expect(classifySeverity(0.1)).toBe('low');
  });

  it('reports unknown instead of guessing when there is no usable score', () => {
    expect(classifySeverity(null)).toBe('unknown');
    expect(classifySeverity(undefined)).toBe('unknown');
    expect(classifySeverity(Number.NaN)).toBe('unknown');
    // A finding with no severity data must never look like a harmless "low".
    expect(classifySeverity(0)).toBe('unknown');
  });
});
