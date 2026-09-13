"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const urlController_1 = require("../controller/urlController");
const router = (0, express_1.Router)();
// Landing page
router.get('/', (_req, res) => {
    res.render('landing');
});
// Short URL redirect — must be LAST to avoid catching other routes
router.get('/:shortId', urlController_1.redirectToLongUrl);
exports.default = router;
