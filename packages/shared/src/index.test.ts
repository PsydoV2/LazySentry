import { describe, expect, it } from 'vitest';
import { sustainabilityStatusFor } from './index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-01-01T00:00:00Z').getTime();

describe('sustainabilityStatusFor', () => {
  it('is unknown before any successful clone captured a commit date', () => {
    expect(sustainabilityStatusFor(null, NOW)).toBe('unknown');
  });

  it('is active within 180 days of the last commit', () => {
    expect(sustainabilityStatusFor(NOW - 10 * DAY_MS, NOW)).toBe('active');
    expect(sustainabilityStatusFor(NOW - 180 * DAY_MS, NOW)).toBe('active');
  });

  it('is aging between 180 and 365 days', () => {
    expect(sustainabilityStatusFor(NOW - 200 * DAY_MS, NOW)).toBe('aging');
    expect(sustainabilityStatusFor(NOW - 365 * DAY_MS, NOW)).toBe('aging');
  });

  it('is stale between 365 and 730 days', () => {
    expect(sustainabilityStatusFor(NOW - 400 * DAY_MS, NOW)).toBe('stale');
    expect(sustainabilityStatusFor(NOW - 730 * DAY_MS, NOW)).toBe('stale');
  });

  it('is dead beyond 730 days', () => {
    expect(sustainabilityStatusFor(NOW - 731 * DAY_MS, NOW)).toBe('dead');
    expect(sustainabilityStatusFor(NOW - 3650 * DAY_MS, NOW)).toBe('dead');
  });
});
