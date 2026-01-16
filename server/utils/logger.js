"use strict";
/**
 * Simple logger utility for the application
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContextLogger = void 0;
exports.createScopedLogger = createScopedLogger;
// Create a simple logger that outputs to console
var baseLogger = {
    info: function (message, context) {
        if (context === void 0) { context = {}; }
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: message,
            context: context,
        }, null, 2));
    },
    error: function (message, context) {
        if (context === void 0) { context = {}; }
        console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: message,
            context: context,
        }, null, 2));
    },
    warn: function (message, context) {
        if (context === void 0) { context = {}; }
        console.warn(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: message,
            context: context,
        }, null, 2));
    },
    debug: function (message, context) {
        if (context === void 0) { context = {}; }
        if (process.env.DEBUG) {
            console.debug(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'debug',
                message: message,
                context: context,
            }, null, 2));
        }
    },
};
/**
 * Creates a scoped logger for a specific module or component
 *
 * @param scope The scope/name of the module using the logger
 * @returns A logger instance that includes the scope in all messages
 */
function createScopedLogger(scope) {
    return {
        info: function (message, context) {
            if (context === void 0) { context = {}; }
            baseLogger.info("[".concat(scope, "] ").concat(message), context);
        },
        error: function (message, context) {
            if (context === void 0) { context = {}; }
            baseLogger.error("[".concat(scope, "] ").concat(message), context);
        },
        warn: function (message, context) {
            if (context === void 0) { context = {}; }
            baseLogger.warn("[".concat(scope, "] ").concat(message), context);
        },
        debug: function (message, context) {
            if (context === void 0) { context = {}; }
            baseLogger.debug("[".concat(scope, "] ").concat(message), context);
        },
    };
}
// Alias for createScopedLogger to support different naming conventions
exports.createContextLogger = createScopedLogger;
// Default logger instance for backward compatibility
var logger = baseLogger;
exports.default = logger;
