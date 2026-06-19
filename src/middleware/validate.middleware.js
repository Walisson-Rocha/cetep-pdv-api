const { validationResult } = require('express-validator')

const validate = (req, res, next) => {
  const erros = validationResult(req)
  if (!erros.isEmpty()) {
    return res.status(400).json({ mensagem: erros.array()[0].msg, erros: erros.array() })
  }
  next()
}

module.exports = validate
