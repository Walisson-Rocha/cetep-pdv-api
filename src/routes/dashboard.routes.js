const express = require('express')
const router = express.Router()
const { resumo } = require('../controllers/dashboard.controller')
const { protect } = require('../middleware/auth.middleware')

router.get('/', protect, resumo)

module.exports = router