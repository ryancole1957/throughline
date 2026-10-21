import pino, { type Logger } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'throughline-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'password',
        '*.password',
      ],
      censor: '[redacted]',
    },
  });
}
