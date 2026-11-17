export interface UploadedPart {
  part_number: number;
  size: number;
  etag: string;
}

export const MAX_VIDEO_BYTES = 10_000_000_000;
export const UPLOAD_PART_BYTES = 16 * 1024 * 1024;

export function partSize(size: number, part: number): number {
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_VIDEO_BYTES ||
    !Number.isInteger(part) ||
    part < 1 ||
    part > Math.ceil(size / UPLOAD_PART_BYTES)
  ) {
    throw new Error('Invalid multipart size or part number');
  }
  return Math.min(UPLOAD_PART_BYTES, size - (part - 1) * UPLOAD_PART_BYTES);
}

export function validateParts(size: number, parts: UploadedPart[]): void {
  partSize(size, 1);
  if (parts.length !== Math.ceil(size / UPLOAD_PART_BYTES)) {
    throw new Error('Upload is incomplete');
  }
  for (const [index, part] of parts.entries()) {
    if (
      part.part_number !== index + 1 ||
      !part.etag ||
      part.size !== partSize(size, index + 1)
    ) {
      throw new Error('Uploaded part does not match the declared size');
    }
  }
}
