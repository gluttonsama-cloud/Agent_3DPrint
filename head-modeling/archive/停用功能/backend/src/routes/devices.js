/**
 * 设备管理 API 路由
 * 
 * 提供设备的 CRUD 操作和状态管理
 * 集成 DeviceService 处理业务逻辑
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const DeviceService = require('../services/DeviceService');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { responseMiddleware } = require('../utils/response');

// 创建设备服务实例
const deviceService = new DeviceService();

router.use(responseMiddleware());

/**
 * GET /api/devices
 * 获取设备列表（支持筛选和分页）
 * 
 * 查询参数：
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20）
 * - status: 设备状态筛选（idle/busy/maintenance/offline）
 * - type: 设备类型筛选（sla/fdm/sls/mjf）
 * - sortBy: 排序字段（默认 createdAt）
 * - sortOrder: 排序方向（asc/desc，默认 desc）
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    status,
    type,
    sortBy,
    sortOrder
  } = req.query;

  const filters = {};
  if (status) {
    filters.status = status;
  }
  if (type) {
    filters.type = type;
  }

  const pagination = {};
  if (page) {
    pagination.page = page;
  }
  if (limit) {
    pagination.limit = limit;
  }
  if (sortBy) {
    pagination.sortBy = sortBy;
  }
  if (sortOrder) {
    pagination.sortOrder = sortOrder;
  }

  const result = await deviceService.getDevices(filters, pagination);

  res.paginated(
    result.devices,
    result.pagination,
    '设备列表获取成功'
  );
}));

/**
 * GET /api/devices/available
 * 获取可用设备列表
 * 
 * 查询参数：
 * - type: 设备类型筛选（可选）
 */
router.get('/available', asyncHandler(async (req, res) => {
  const { type } = req.query;

  const devices = await deviceService.getAvailableDevices(type);

  res.success(
    devices,
    `找到 ${devices.length} 个可用设备`
  );
}));

/**
 * GET /api/devices/:id
 * 获取设备详情
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const device = await deviceService.getDeviceById(id);

  res.success(device, '设备详情获取成功');
}));

/**
 * POST /api/devices
 * 创建设备
 * 
 * 请求体：
 * - deviceId: 设备唯一标识（必填）
 * - type: 设备类型（必填，sla/fdm/sls/mjf）
 * - location: 设备位置（可选）
 * - status: 初始状态（可选，默认 idle）
 * - capacity: 容量信息（可选）
 * - specifications: 规格参数（可选）
 */
router.post('/', asyncHandler(async (req, res) => {
  const deviceData = req.body;

  const device = await deviceService.createDevice(deviceData);

  res.success(device, '设备创建成功', 201);
}));

/**
 * PATCH /api/devices/:id
 * 更新设备信息
 * 
 * 请求体：
 * - status: 设备状态（可选）
 * - currentTask: 当前任务信息（可选）
 * - capacity: 容量信息（可选）
 * - location: 设备位置（可选）
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const device = await deviceService.updateDevice(id, updateData);

  res.success(device, '设备信息更新成功');
}));

/**
 * PUT /api/devices/:id/status
 * 更新设备状态（专用端点）
 * 
 * 请求体：
 * - status: 新状态（必填）
 * - currentTask: 当前任务信息（可选）
 */
router.put('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, currentTask } = req.body;

  if (!status) {
    throw new ValidationError('status 是必填字段');
  }

  // 支持 deviceId 字符串（如 PRINTER-001）或 MongoDB ObjectId
  let device;
  if (mongoose.Types.ObjectId.isValid(id)) {
    device = await deviceService.updateDeviceStatus(id, status, currentTask);
  } else {
    device = await deviceService.updateDeviceStatusByDeviceId(id, status, currentTask);
  }

  res.success(device, '设备状态更新成功');
}));

/**
 * POST /api/devices/:id/assign-task
 * 分配任务到设备
 * 
 * 请求体：
 * - orderId: 订单 ID（必填）
 * - estimatedCompletion: 预计完成时间（必填）
 */
router.post('/:id/assign-task', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { orderId, estimatedCompletion } = req.body;

  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }

  if (!estimatedCompletion) {
    throw new ValidationError('estimatedCompletion 是必填字段');
  }

  const device = await deviceService.assignTask(id, orderId, estimatedCompletion);

  res.success(device, '任务分配成功');
}));

/**
 * POST /api/devices/:id/complete-task
 * 完成当前任务
 */
router.post('/:id/complete-task', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const device = await deviceService.completeTask(id);

  res.success(device, '任务已完成');
}));

/**
 * DELETE /api/devices/:id
 * 删除设备
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  await deviceService.deleteDevice(id);

  res.success(null, '设备已删除');
}));

module.exports = router;
