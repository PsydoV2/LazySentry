import { describe, expect, it } from 'vitest';
import { classifyUpdate, matchesVersionRange } from './semver.js';

describe('classifyUpdate', () => {
  it('classifies a major version bump', () => {
    expect(classifyUpdate('4.17.4', '5.0.0')).toBe('major');
  });

  it('classifies a minor version bump', () => {
    expect(classifyUpdate('4.17.4', '4.18.0')).toBe('minor');
  });

  it('classifies a patch version bump', () => {
    expect(classifyUpdate('4.17.4', '4.17.21')).toBe('patch');
  });

  it('classifies an up-to-date package as none', () => {
    expect(classifyUpdate('4.17.21', '4.17.21')).toBe('none');
  });

  it('classifies an installed version ahead of the registry as none', () => {
    // Can happen with a git-pinned or prerelease dependency.
    expect(classifyUpdate('5.0.0', '4.17.21')).toBe('none');
  });

  it('tolerates a leading "v" as used by many git tags', () => {
    expect(classifyUpdate('v1.2.3', 'v2.0.0')).toBe('major');
  });

  it('returns unknown when no latest version could be resolved', () => {
    expect(classifyUpdate('4.17.4', null)).toBe('unknown');
  });

  it('returns unknown for a non-semver installed version rather than guessing', () => {
    expect(classifyUpdate('not-a-version', '1.0.0')).toBe('unknown');
  });
});

describe('matchesVersionRange', () => {
  it('matches a "less than" comparator, straight off an advisory', () => {
    expect(matchesVersionRange('4.17.15', '< 4.17.21')).toBe(true);
    expect(matchesVersionRange('4.17.21', '< 4.17.21')).toBe(false);
  });

  it('matches a caret range', () => {
    expect(matchesVersionRange('2.4.0', '^2.0.0')).toBe(true);
    expect(matchesVersionRange('3.0.0', '^2.0.0')).toBe(false);
  });

  it('matches an exact version with no operator', () => {
    expect(matchesVersionRange('1.2.3', '1.2.3')).toBe(true);
    expect(matchesVersionRange('1.2.4', '1.2.3')).toBe(false);
  });

  it('tolerates a leading "v" on the installed version', () => {
    expect(matchesVersionRange('v4.17.15', '< 4.17.21')).toBe(true);
  });

  it('returns null for a non-semver installed version rather than guessing', () => {
    expect(matchesVersionRange('not-a-version', '< 1.0.0')).toBeNull();
  });

  it('returns null for a range string that is not valid semver syntax', () => {
    expect(matchesVersionRange('1.0.0', 'not a range')).toBeNull();
  });
});
