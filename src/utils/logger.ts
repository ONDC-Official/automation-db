import { createLogger, format, transports } from "winston";
const { combine, timestamp, printf, colorize } = format;


// Custom log format
const customFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

// Create a logger instance
export const logger = createLogger({
  level: "info", // Default log level
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    colorize(), // Adds color to log levels (e.g., error in red, info in green)
    customFormat
  ),
  transports: [
    new transports.Console(), // Log to the console
    new transports.File({ filename: "logs/application.log" }), // Log to a file
  ],
});

// Example usage:
// logger.info('This is an info message');
// logger.error('This is an error message');
