/**
 * Silent stand-in for `@ondc/automation-logger`, wired in via
 * `resolve.alias` in vitest.config.ts.
 *
 * The real package throws on import when NODE_ENV is unset and pushes to Loki,
 * so tests would be both fragile and noisy without this.
 *
 * Only the three methods the codebase actually calls are implemented — note
 * `warning`, not `warn`.
 */
const logger = {
    info: (..._args: unknown[]): void => {},
    error: (..._args: unknown[]): void => {},
    warning: (..._args: unknown[]): void => {},
};

export default logger;
