"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var db_1 = require("../db");
var schema_1 = require("../../shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var nanoid_1 = require("nanoid");
var router = (0, express_1.Router)();
// Get all facts, optionally filtered by type
router.get('/', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var type, query, results, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                type = req.query.type;
                query = db_1.db.select().from(schema_1.facts);
                if (type) {
                    // @ts-ignore
                    query = query.where((0, drizzle_orm_1.eq)(schema_1.facts.type, type));
                }
                return [4 /*yield*/, query.orderBy((0, drizzle_orm_1.desc)(schema_1.facts.updatedAt))];
            case 1:
                results = _a.sent();
                res.json(results);
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error('Error fetching facts:', error_1);
                res.status(500).json({ error: 'Internal Server Error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Create a new fact
router.post('/', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var factId, result, newFact, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                factId = "fact-".concat((0, nanoid_1.nanoid)(8));
                result = schema_1.insertFactSchema.parse(__assign(__assign({}, req.body), { factId: factId }));
                return [4 /*yield*/, db_1.db.insert(schema_1.facts).values(result).returning()];
            case 1:
                newFact = _a.sent();
                res.json(newFact[0]);
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                console.error('Error creating fact:', error_2);
                res.status(400).json({ error: 'Invalid input' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Seed demo facts if empty
router.post('/seed-demo', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var count, demoFacts, _i, demoFacts_1, fact, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                return [4 /*yield*/, db_1.db.select({ count: schema_1.facts.id }).from(schema_1.facts)];
            case 1:
                count = _a.sent();
                if (count.length > 0 && count.length > 5) {
                    return [2 /*return*/, res.json({ message: 'Facts already seeded' })];
                }
                demoFacts = [
                    {
                        factId: "fact-".concat((0, nanoid_1.nanoid)(8)),
                        type: 'clinical',
                        key: 'primary_endpoint_p_value',
                        value: '0.0012',
                        source: 'CSR-2023-001 table 14.2',
                        metadata: { study: 'MD-2023-001', domain: 'efficacy' }
                    },
                    {
                        factId: "fact-".concat((0, nanoid_1.nanoid)(8)),
                        type: 'clinical',
                        key: 'total_subjects_randomized',
                        value: '450',
                        source: 'Protocol V2.0',
                        metadata: { study: 'MD-2023-001' }
                    },
                    {
                        factId: "fact-".concat((0, nanoid_1.nanoid)(8)),
                        type: 'drug_substance',
                        key: 'molecular_weight',
                        value: '452.3 g/mol',
                        source: 'Manufacture Report',
                        metadata: { compound: 'C2H4O2' }
                    },
                    {
                        factId: "fact-".concat((0, nanoid_1.nanoid)(8)),
                        type: 'safety',
                        key: 'sae_incidence_rate',
                        value: '2.4%',
                        source: 'Safety Database Export',
                        metadata: { study: 'MD-2023-001', arm: 'active' }
                    }
                ];
                _i = 0, demoFacts_1 = demoFacts;
                _a.label = 2;
            case 2:
                if (!(_i < demoFacts_1.length)) return [3 /*break*/, 5];
                fact = demoFacts_1[_i];
                return [4 /*yield*/, db_1.db.insert(schema_1.facts).values(fact).onConflictDoNothing()];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5:
                res.json({ message: 'Demo facts seeded', count: demoFacts.length });
                return [3 /*break*/, 7];
            case 6:
                error_3 = _a.sent();
                console.error('Error seeding facts:', error_3);
                res.status(500).json({ error: 'Seeding failed' });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
exports.default = router;
