export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, code = 'bad_request') =>
  new ApiError(400, code, message);
export const unauthorized = (message = 'Please sign in', code = 'unauthorized') =>
  new ApiError(401, code, message);
export const forbidden = (
  message = 'You do not have permission to perform this action',
  code = 'forbidden',
) => new ApiError(403, code, message);
export const notFound = (message = 'Resource not found', code = 'not_found') =>
  new ApiError(404, code, message);
export const conflict = (message: string, code = 'conflict') => new ApiError(409, code, message);
export const unprocessable = (
  message: string,
  fields?: Record<string, string>,
  code = 'validation_failed',
) => new ApiError(422, code, message, fields);
