import { DomainException } from '../common/exceptions/domain.exception';

export class VideoNotFound extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}
export class VideoStateConflict extends DomainException {
  constructor() {
    super(
      'VIDEO_STATE_CONFLICT',
      409,
      'Operation is not available in the current video state',
    );
  }
}
export class InvalidUpload extends DomainException {
  constructor() {
    super(
      'INVALID_UPLOAD',
      400,
      'Upload parts or size are invalid or incomplete',
    );
  }
}
export class StorageUnavailable extends DomainException {
  constructor() {
    super('STORAGE_UNAVAILABLE', 503, 'Storage is temporarily unavailable');
  }
}
