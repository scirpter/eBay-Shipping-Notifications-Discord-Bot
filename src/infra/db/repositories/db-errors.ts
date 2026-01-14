export type DbError = {
  type: 'db_error';
  message: string;
  cause: unknown;
};

export function dbError(message: string, cause: unknown): DbError {
  return { type: 'db_error', message, cause };
}

