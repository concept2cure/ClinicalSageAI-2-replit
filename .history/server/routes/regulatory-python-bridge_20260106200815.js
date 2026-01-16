"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var child_process_1 = require("child_process");
var path_1 = __importDefault(require("path"));
var router = (0, express_1.Router)();
// CommonJS fix for __dirname if needed (simplified for TS/JS mix)
var __dirname = path_1.default.resolve();
router.post('/validate-section', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, content, section, moduleId, ruleset, scriptPath, pythonProcess, dataString_1, errorString_1, inputPayload;
    return __generator(this, function (_b) {
        try {
            _a = req.body, content = _a.content, section = _a.section, moduleId = _a.moduleId, ruleset = _a.ruleset;
            if (!content) {
                return [2 /*return*/, res.status(400).json({ error: 'Content is required' })];
            }
            scriptPath = path_1.default.join(__dirname, 'server/scripts/validate_ectd_section.py');
            pythonProcess = (0, child_process_1.spawn)('python3', [scriptPath]);
            dataString_1 = '';
            errorString_1 = '';
            // Collect data from script stdout
            pythonProcess.stdout.on('data', function (data) {
                dataString_1 += data.toString();
            });
            // Collect error from script stderr
            pythonProcess.stderr.on('data', function (data) {
                errorString_1 += data.toString();
            });
            inputPayload = JSON.stringify({
                content: content,
                section: section,
                moduleId: moduleId
            });
            pythonProcess.stdin.write(inputPayload);
            pythonProcess.stdin.end();
            pythonProcess.on('close', function (code) {
                if (code !== 0) {
                    console.error("Python script exited with code ".concat(code));
                    console.error("Script stderr: ".concat(errorString_1));
                    // Even if status code is non-zero, check if we got a valid JSON error response
                    try {
                        var jsonResponse = JSON.parse(dataString_1);
                        return res.json(jsonResponse);
                    }
                    catch (e) {
                        return res.status(500).json({
                            success: false,
                            error: 'Regulatory Scan process failed',
                            details: errorString_1
                        });
                    }
                }
                try {
                    var jsonResponse = JSON.parse(dataString_1);
                    res.json(jsonResponse);
                }
                catch (error) {
                    console.error('Failed to parse Python response:', dataString_1);
                    res.status(500).json({
                        success: false,
                        error: 'Invalid response from Regulatory Brain',
                        raw: dataString_1
                    });
                }
            });
        }
        catch (error) {
            console.error('API Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
        return [2 /*return*/];
    });
}); });
exports.default = router;
