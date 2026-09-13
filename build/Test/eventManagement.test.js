"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const eventManagementController_1 = require("../controller/eventManagementController");
(0, node_test_1.default)('guest CSV export neutralizes spreadsheet formulas', () => {
    strict_1.default.equal((0, eventManagementController_1.csvCell)('=HYPERLINK("https://bad.example")'), `"'=HYPERLINK(""https://bad.example"")"`);
    strict_1.default.equal((0, eventManagementController_1.csvCell)('+cmd'), `"'+cmd"`);
    strict_1.default.equal((0, eventManagementController_1.csvCell)('normal, guest'), `"normal, guest"`);
});
