"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * Requires a valid JWT token. Rejects unauthenticated requests.
 */
const authenticate = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            res.status(500).json({ message: 'Server configuration error' });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        req.user = decoded;
        next();
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({ message: 'Token has expired' });
            return;
        }
        res.status(401).json({ message: 'Invalid token' });
    }
};
exports.authenticate = authenticate;
/**
 * Attaches user info if a valid JWT is present, but does NOT reject
 * unauthenticated requests. Enables guest-mode functionality.
 */
const optionalAuth = async (req, _res, next) => {
    const token = extractToken(req);
    if (!token) {
        next();
        return;
    }
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            next();
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        req.user = decoded;
    }
    catch {
        // Token is invalid or expired — proceed as guest
    }
    next();
};
exports.optionalAuth = optionalAuth;
/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.split(' ')[1] || null;
}
