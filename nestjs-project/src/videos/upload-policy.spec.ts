import { partSize, validateParts } from './upload-policy';

describe('multipart upload policy', () => {
  it('supports the inclusive 10 GB boundary with a partial last part', () => {
    expect(partSize(10_000_000_000, 1)).toBe(16_777_216);
    expect(partSize(10_000_000_000, 597)).toBe(779_264);
  });
  it.each([0, -1, 10_000_000_001, 1.1, Number.NaN])(
    'rejects invalid total %s',
    (size) => {
      expect(() => partSize(size, 1)).toThrow();
    },
  );
  it.each([0, -1, 2, 1.5])(
    'rejects invalid part %s for a small file',
    (part) => {
      expect(() => partSize(100, part)).toThrow();
    },
  );
  it('requires exactly the expected ordered parts and actual lengths', () => {
    expect(() =>
      validateParts(100, [{ part_number: 1, size: 100, etag: 'abc' }]),
    ).not.toThrow();
    expect(() => validateParts(100, [])).toThrow();
    expect(() =>
      validateParts(100, [{ part_number: 1, size: 99, etag: 'abc' }]),
    ).toThrow();
    expect(() =>
      validateParts(100, [{ part_number: 2, size: 100, etag: 'abc' }]),
    ).toThrow();
    expect(() =>
      validateParts(100, [{ part_number: 1, size: 100, etag: '' }]),
    ).toThrow();
  });
});
