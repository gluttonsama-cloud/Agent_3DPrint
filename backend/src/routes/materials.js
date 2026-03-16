/**
 * 材料管理 API 路由
 * 
 * 提供材料库存的 CRUD 操作、低库存预警、补货建议等 API 端点
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { MaterialService } = require('../services/MaterialService');
const Material = require('../models/Material');
const { asyncHandler, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { responseMiddleware } = require('../utils/response');

const materialService = new MaterialService();

router.use(responseMiddleware());

/**
 * @route   GET /api/materials
 * @desc    查询材料列表
 * @access  Public
 * 
 * @query   {string} type - 材料类型（resin/filament/powder/liquid）
 * @query   {string} name - 材料名称（模糊搜索）
 * @query   {boolean} lowStock - 是否只查询低库存材料
 * @query   {number} page - 页码（默认 1）
 * @query   {number} limit - 每页数量（默认 20）
 */
router.get('/', asyncHandler(async (req, res) => {
  const { type, name, lowStock, page = 1, limit = 20 } = req.query;

  const filters = {};
  if (type) filters.type = type;
  if (name) filters.name = name;
  if (lowStock === 'true') filters.lowStock = true;

  const result = await materialService.getMaterials(filters, { page, limit });

  res.paginated(result.data.materials, result.data.pagination, '材料列表获取成功');
}));

/**
 * @route   GET /api/materials/low-stock
 * @desc    获取低库存材料列表
 * @access  Public
 * 
 * @query   {boolean} includeCritical - 是否包含严重不足的材料（默认 true）
 */
router.get('/low-stock', asyncHandler(async (req, res) => {
  const { includeCritical } = req.query;
  const include = includeCritical !== 'false'; // 默认包含

  const result = await materialService.getLowStockMaterials(include);

  res.success(result.data.materials, '低库存材料列表获取成功', {
    total: result.data.total,
    critical: result.data.critical
  });
}));

/**
 * @route   GET /api/materials/reorder-suggestions
 * @desc    获取补货建议
 * @access  Public
 */
router.get('/reorder-suggestions', asyncHandler(async (req, res) => {
  const result = await materialService.getReorderSuggestions();

  res.success(result.data.suggestions, '补货建议获取成功', {
    totalMaterials: result.data.totalMaterials,
    needReorder: result.data.needReorder
  });
}));

/**
 * @route   GET /api/materials/:id
 * @desc    查询材料详情
 * @access  Public
 * 
 * @param   {string} id - 材料 ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('无效的材料 ID 格式');
  }

  const result = await materialService.getMaterialById(id);

  res.success(result.data, '材料详情获取成功');
}));

/**
 * @route   PATCH /api/materials/:id/stock
 * @desc    更新库存
 * @access  Public
 * 
 * @param   {string} id - 材料 ID
 * @body    {number} quantityChange - 库存变化量（正数增加，负数减少）
 * @body    {string} reason - 变化原因
 * @body    {string} [orderId] - 关联订单 ID（可选）
 */
router.patch('/:id/stock', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantityChange, reason, orderId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('无效的材料 ID 格式');
  }

  // 验证必填字段
  if (quantityChange === undefined || quantityChange === null) {
    throw new ValidationError('quantityChange 是必填字段');
  }

  if (typeof quantityChange !== 'number') {
    throw new ValidationError('quantityChange 必须是数字');
  }

  const result = await materialService.updateStock(id, quantityChange, {
    reason: reason || '手动更新',
    orderId
  });

  res.success(result.data, result.message);
}));

/**
 * @route   POST /api/materials/bulk-stock-update
 * @desc    批量更新库存
 * @access  Public
 * 
 * @body    {Array} updates - 更新数组
 * @body    {string} updates[].materialId - 材料 ID
 * @body    {number} updates[].quantityChange - 库存变化量
 * @body    {string} [updates[].orderId] - 关联订单 ID（可选）
 */
router.post('/bulk-stock-update', asyncHandler(async (req, res) => {
  const { updates } = req.body;

  // 验证必填字段
  if (!updates || !Array.isArray(updates)) {
    throw new ValidationError('updates 必须是数组');
  }

  if (updates.length === 0) {
    throw new ValidationError('updates 不能为空');
  }

  const result = await materialService.bulkUpdateStock(updates);

  // 如果有部分失败，返回 207 Multi-Status
  if (result.data.failCount > 0) {
    res.status(207).success(result.data, '批量更新完成，部分失败', {
      successCount: result.data.successCount,
      failCount: result.data.failCount
    });
    return;
  }

  res.success(result.data.results, '批量更新成功');
}));

/**
 * @route   POST /api/materials/:id/check-sufficiency
 * @desc    检查材料是否充足
 * @access  Public
 * 
 * @param   {string} id - 材料 ID
 * @body    {number} requiredAmount - 需求量
 */
router.post('/:id/check-sufficiency', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { requiredAmount } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('无效的材料 ID 格式');
  }

  // 验证必填字段
  if (!requiredAmount || typeof requiredAmount !== 'number') {
    throw new ValidationError('requiredAmount 是必填的数字字段');
  }

  if (requiredAmount < 0) {
    throw new ValidationError('requiredAmount 必须大于等于 0');
  }

  const result = await materialService.checkMaterialSufficiency(id, requiredAmount);

  res.success(result.data, '材料充足性检查完成');
}));

/**
 * @route   POST /api/materials
 * @desc    创建新材料
 * @access  Public
 * 
 * @body    {string} name - 材料名称
 * @body    {string} type - 材料类型（resin/filament/powder/liquid）
 * @body    {Object} stock - 库存信息
 * @body    {number} stock.quantity - 库存数量
 * @body    {string} stock.unit - 单位（kg/g/L/mL/spool/cartridge）
 * @body    {number} threshold - 补货阈值
 * @body    {number} costPerUnit - 单位成本
 * @body    {Object} [properties] - 材料属性（可选）
 * @body    {Object} [supplier] - 供应商信息（可选）
 */
router.post('/', asyncHandler(async (req, res) => {
  const {
    name,
    type,
    stock,
    threshold,
    costPerUnit,
    properties,
    supplier
  } = req.body;

  // 验证必填字段
  if (!name) {
    throw new ValidationError('材料名称是必填的');
  }

  if (!type) {
    throw new ValidationError('材料类型是必填的');
  }

  if (!stock) {
    throw new ValidationError('库存信息是必填的');
  }

  if (threshold === undefined || threshold === null) {
    throw new ValidationError('补货阈值是必填的');
  }

  if (costPerUnit === undefined || costPerUnit === null) {
    throw new ValidationError('单位成本是必填的');
  }

  // 创建材料
  const material = new Material({
    name,
    type,
    stock: {
      quantity: stock.quantity || 0,
      unit: stock.unit || 'kg'
    },
    threshold,
    costPerUnit,
    properties,
    supplier
  });

  await material.save();

  res.status(201).success(material.toObject(), '材料创建成功');
}));

/**
 * @route   PUT /api/materials/:id
 * @desc    更新材料信息（完整更新）
 * @access  Public
 * 
 * @param   {string} id - 材料 ID
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('无效的材料 ID 格式');
  }

  const material = await Material.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  );

  if (!material) {
    throw new NotFoundError('材料不存在');
  }

  res.success(material.toObject(), '材料更新成功');
}));

/**
 * @route   PATCH /api/materials/:id
 * @desc    部分更新材料信息
 * @access  Public
 * 
 * @param   {string} id - 材料 ID
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('无效的材料 ID 格式');
  }

  const material = await Material.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  );

  if (!material) {
    throw new NotFoundError('材料不存在');
  }

  res.success(material.toObject(), '材料更新成功');
}));

/**
 * @route   DELETE /api/materials/:id
 * @desc    删除材料
 * @access  Public
 * 
 * @param   {string} id - 材料 ID
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('无效的材料 ID 格式');
  }

  const material = await Material.findByIdAndDelete(id);

  if (!material) {
    throw new NotFoundError('材料不存在');
  }

  res.success(null, '材料已删除');
}));

module.exports = router;
