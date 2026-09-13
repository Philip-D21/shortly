"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../models/user"));
/**
 * POST /api/auth/signup
 *
 * Registers a new user with hashed password.
 */
const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            res.status(400).json({
                status: 'failed',
                message: 'Please provide username, email, and password',
            });
            return;
        }
        if (password.length < 6) {
            res.status(400).json({
                status: 'failed',
                message: 'Password must be at least 6 characters',
            });
            return;
        }
        const userExist = await user_1.default.findOne({ email: email.toLowerCase() });
        if (userExist) {
            res.status(409).json({
                status: 'failed',
                message: 'Email already exists',
            });
            return;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const newUser = await user_1.default.create({
            username,
            email: email.toLowerCase(),
            password: hashedPassword,
        });
        res.status(201).json({
            status: 'success',
            data: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                plan: newUser.plan,
            },
        });
    }
    catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            status: 'failed',
            message: err.message || 'Internal Server Error',
        });
    }
};
exports.register = register;
/**
 * POST /api/auth/login
 *
 * Authenticates a user and returns a JWT token.
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({
                message: 'Please provide email and password',
            });
            return;
        }
        const user = await user_1.default.findOne({ email: email.toLowerCase() });
        if (!user) {
            res.status(401).json({
                message: 'Invalid credentials',
            });
            return;
        }
        const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            res.status(401).json({
                message: 'Invalid credentials',
            });
            return;
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('JWT_SECRET is not configured');
            res.status(500).json({ message: 'Server configuration error' });
            return;
        }
        // Secure payload — no password or sensitive data
        const token = jsonwebtoken_1.default.sign({ id: user._id, email: user.email }, jwtSecret, { expiresIn: '1d' });
        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                plan: user.plan,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: 'failed',
            message: error.message || 'Internal Server Error',
        });
    }
};
exports.login = login;
