"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../controller/auth");
const userController_1 = require("../controller/userController");
const authentication_1 = require("../middleware/authentication");
const router = (0, express_1.Router)();
// Render auth pages
router.get('/signup', (_req, res) => {
    res.render('signup');
});
router.get('/login', (_req, res) => {
    res.render('login');
});
// Render dashboard view
router.get('/dashboard', (_req, res) => {
    res.render('dashboard');
});
// Auth endpoints
router.post('/signup', auth_1.register);
router.post('/login', auth_1.login);
// Dashboard stats endpoint (JSON)
router.get('/dashboard-stats', authentication_1.authenticate, userController_1.getDashboardStats);
router.put('/profile', authentication_1.authenticate, userController_1.updateProfile);
// Render link history page
router.get('/history', authentication_1.authenticate, (_req, res) => {
    res.render('history');
});
// Get link history for a user
router.get('/link-history/:userId', authentication_1.authenticate, userController_1.getLinkHistory);
// Get a user by ID
router.get('/user/:userId', authentication_1.authenticate, userController_1.getUserById);
// Get all users
router.get('/users', authentication_1.authenticate, userController_1.getAllUsers);
exports.default = router;
