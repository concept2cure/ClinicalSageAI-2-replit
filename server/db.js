"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = exports.db = void 0;
exports.runMigrations = runMigrations;
exports.query = query;
exports.transaction = transaction;
exports.healthCheck = healthCheck;
/**
 * Database Configuration for TrialSage
 *
 * Provides a centralized database connection with Drizzle ORM
 * integration for type-safe database operations.
 */
var pg_1 = require("pg");
var node_postgres_1 = require("drizzle-orm/node-postgres");
var migrator_1 = require("drizzle-orm/node-postgres/migrator");
var logger_1 = require("./utils/logger");
var schema = __importStar(require("../shared/schema"));
var path_1 = __importDefault(require("path"));
var logger = (0, logger_1.createScopedLogger)('database');
// Database connection pool
var pool = null;
exports.pool = pool;
// Initialize database connection
try {
    // Check if DATABASE_URL is available
    if (process.env.DATABASE_URL) {
        logger.info('Initializing PostgreSQL connection pool');
        exports.pool = pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: ((_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.includes('postgresql://')) ||
                ((_b = process.env.DATABASE_URL) === null || _b === void 0 ? void 0 : _b.includes('neondb'))
                ? { rejectUnauthorized: false }
                : false,
            max: 20, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
            connectionTimeoutMillis: 5000, // How long to wait for a connection to become available
        });
        // Test connection with retry mechanism
        var testConnection_1 = function (retries, delay) {
            if (retries === void 0) { retries = 3; }
            if (delay === void 0) { delay = 3000; }
            pool.query('SELECT NOW()', function (err, res) {
                if (err) {
                    logger.error('Database connection test failed', {
                        error: err.message,
                        retriesLeft: retries,
                    });
                    if (retries > 0) {
                        logger.info("Retrying database connection in ".concat(delay / 1000, " seconds..."));
                        setTimeout(function () { return testConnection_1(retries - 1, delay); }, delay);
                    }
                    else {
                        logger.error('All database connection attempts failed');
                    }
                }
                else {
                    logger.info('Database connection successful', {
                        timestamp: res.rows[0].now,
                        poolSize: (pool === null || pool === void 0 ? void 0 : pool.totalCount) || 0,
                    });
                }
            });
        };
        // Start the connection test with retries
        testConnection_1();
        // Log database errors
        pool.on('error', function (err) {
            logger.error('Unexpected database error', { error: err.message });
        });
    }
    else {
        logger.warn('DATABASE_URL not found, database features will be unavailable');
    }
}
catch (error) {
    logger.error('Failed to initialize database', { error: error.message });
    exports.pool = pool = null;
}
// Initialize Drizzle ORM
exports.db = pool ? (0, node_postgres_1.drizzle)(pool, { schema: schema }) : null;
/**
 * Run database migrations
 */
function runMigrations() {
    return __awaiter(this, void 0, void 0, function () {
        var migrationsFolder, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!exports.db || !pool) {
                        logger.warn('Cannot run migrations: database connection not available');
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    logger.info('Running database migrations...');
                    migrationsFolder = path_1.default.resolve(__dirname, '../migrations');
                    // Run migrations
                    return [4 /*yield*/, (0, migrator_1.migrate)(exports.db, { migrationsFolder: migrationsFolder })];
                case 2:
                    // Run migrations
                    _a.sent();
                    logger.info('Database migrations completed successfully');
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    logger.error('Failed to run migrations', error_1);
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Execute a raw database query with error handling
 */
function query(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var start, result, duration, error_2;
        if (params === void 0) { params = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!pool) {
                        throw new Error('Database connection not available');
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    start = Date.now();
                    return [4 /*yield*/, pool.query(text, params)];
                case 2:
                    result = _a.sent();
                    duration = Date.now() - start;
                    // Log slow queries (>100ms)
                    if (duration > 100) {
                        logger.warn('Slow query detected', {
                            duration: duration,
                            query: text,
                            params: params,
                            rows: result.rowCount,
                        });
                    }
                    return [2 /*return*/, result];
                case 3:
                    error_2 = _a.sent();
                    logger.error('Database query error', {
                        error: error_2.message,
                        query: text,
                        params: params,
                    });
                    throw error_2;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Execute a transaction with error handling
 */
function transaction(callback) {
    return __awaiter(this, void 0, void 0, function () {
        var client, result, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!pool) {
                        throw new Error('Database connection not available');
                    }
                    return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, 8, 9]);
                    return [4 /*yield*/, client.query('BEGIN')];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, callback(client)];
                case 4:
                    result = _a.sent();
                    return [4 /*yield*/, client.query('COMMIT')];
                case 5:
                    _a.sent();
                    return [2 /*return*/, result];
                case 6:
                    error_3 = _a.sent();
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 7:
                    _a.sent();
                    throw error_3;
                case 8:
                    client.release();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Check database health
 */
function healthCheck() {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!pool) {
                        return [2 /*return*/, false];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, pool.query('SELECT 1')];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.rows.length > 0];
                case 3:
                    error_4 = _a.sent();
                    logger.error('Database health check failed', { error: error_4.message || error_4 });
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
