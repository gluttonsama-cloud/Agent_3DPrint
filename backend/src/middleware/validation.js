const { validationResult, body, param, query } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '输入验证失败',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

const uploadValidation = [
  body('mode')
    .optional()
    .isIn(['single', 'multiview'])
    .withMessage('mode 必须是 single 或 multiview'),
  body('enableBackgroundRemoval')
    .optional()
    .isBoolean()
    .withMessage('enableBackgroundRemoval 必须是布尔值'),
  validate
];

const statusValidation = [
  param('taskId')
    .notEmpty()
    .withMessage('taskId 不能为空')
    .matches(/^task-\d+-[a-f0-9]{8}$/)
    .withMessage('taskId 格式无效'),
  validate
];

const orderValidation = [
  body('userId')
    .notEmpty()
    .withMessage('userId 不能为空'),
  body('totalPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('totalPrice 必须是非负数'),
  validate
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page 必须是正整数'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit 必须是 1-100 之间的整数'),
  validate
];

module.exports = {
  validate,
  uploadValidation,
  statusValidation,
  orderValidation,
  paginationValidation
};