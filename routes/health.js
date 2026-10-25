'use strict';

const express = require('express');
const router = express.Router();
const { sendOk } = require('../lib/errors');

router.get('/', (req, res) => {
  return sendOk(res, 'OK', {
    status: 'ok',
    database: 'none',
    maintenance: String(process.env.MAINTENANCE).toLowerCase() === 'true',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
