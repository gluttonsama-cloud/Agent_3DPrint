/**
 * 设备管理服务层
 * 
 * 处理设备的业务逻辑，包括创建、查询、更新、删除等操作
 * 集成 AgentEventEmitter 发射设备状态变更事件
 */

const Device = require('../models/Device');
const { agentEventEmitter } = require('../utils/AgentEventEmitter');
const { NotFoundError, ValidationError, AppError } = require('../middleware/errorHandler');
const mongoose = require('mongoose');

/**
 * 设备服务类
 */
class DeviceService {
  /**
   * 创建设备
   * 
   * @param {Object} deviceData - 设备数据
   * @param {string} deviceData.deviceId - 设备唯一标识
   * @param {string} deviceData.type - 设备类型（sla/fdm/sls/mjf）
   * @param {string} deviceData.location - 设备位置
   * @param {Object} deviceData.capacity - 容量信息
   * @param {Object} deviceData.specifications - 规格参数
   * @param {string} deviceData.status - 初始状态（可选，默认 idle）
   * @returns {Promise<Object>} 创建的设备
   */
  async createDevice(deviceData) {
    const {
      deviceId,
      type,
      status = 'idle',
      capacity,
      specifications,
      location
    } = deviceData;

    // 验证必填字段
    if (!deviceId) {
      throw new ValidationError('deviceId 是必填字段');
    }

    if (!type) {
      throw new ValidationError('type 是必填字段');
    }

    // 验证设备类型
    const validTypes = ['sla', 'fdm', 'sls', 'mjf'];
    if (!validTypes.includes(type)) {
      throw new ValidationError(`无效的设备类型，必须是以下之一：${validTypes.join(', ')}`);
    }

    // 验证设备状态
    const validStatuses = ['idle', 'busy', 'maintenance', 'offline'];
    if (status && !validStatuses.includes(status)) {
      throw new ValidationError(`无效的设备状态，必须是以下之一：${validStatuses.join(', ')}`);
    }

    // 检查设备 ID 是否已存在
    const existingDevice = await Device.findOne({ deviceId });
    if (existingDevice) {
      throw new AppError('设备 ID 已存在', 'DEVICE_ID_EXISTS', 409);
    }

    // 创建设备
    const device = new Device({
      deviceId,
      type,
      status,
      capacity: capacity || {},
      specifications: specifications || {},
      location
    });

    await device.save();

    // 发射设备创建事件
    agentEventEmitter.emitEvent('device_created', {
      deviceId: device.deviceId,
      type: device.type,
      status: device.status,
      location: device.location
    });

    return device;
  }

  /**
   * 查询设备列表（支持筛选、分页）
   * 
   * @param {Object} filters - 筛选条件
   * @param {string} filters.status - 设备状态
   * @param {string} filters.type - 设备类型
   * @param {Object} pagination - 分页参数
   * @param {number} pagination.page - 页码（从 1 开始）
   * @param {number} pagination.limit - 每页数量
   * @param {string} pagination.sortBy - 排序字段
   * @param {string} pagination.sortOrder - 排序方向（asc/desc）
   * @returns {Promise<Object>} 设备列表和分页信息
   */
  async getDevices(filters = {}, pagination = {}) {
    const {
      status,
      type
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = pagination;

    // 构建查询条件
    const query = {};
    if (status) {
      query.status = status;
    }
    if (type) {
      query.type = type;
    }

    // 构建排序
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // 计算跳过数量
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 查询设备列表
    const devices = await Device.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('currentTask.orderId');

    // 查询总数
    const total = await Device.countDocuments(query);

    return {
      devices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    };
  }

  /**
   * 查询设备详情
   * 
   * @param {string} deviceId - 设备 ID（MongoDB ObjectId）
   * @returns {Promise<Object>} 设备详情
   */
  async getDeviceById(deviceId) {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new ValidationError('无效的设备 ID 格式');
    }

    const device = await Device.findById(deviceId)
      .populate('currentTask.orderId');

    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    return device;
  }

  /**
   * 根据 deviceId 查询设备
   * 
   * @param {string} deviceId - 设备唯一标识（字符串）
   * @returns {Promise<Object>} 设备详情
   */
  async getDeviceByDeviceId(deviceId) {
    const device = await Device.findOne({ deviceId })
      .populate('currentTask.orderId');

    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    return device;
  }

  /**
   * 更新设备状态
   * 
   * @param {string} deviceId - 设备 ID（MongoDB ObjectId）
   * @param {string} status - 新状态
   * @param {Object} currentTask - 当前任务信息（可选）
   * @returns {Promise<Object>} 更新后的设备
   */
  async updateDeviceStatus(deviceId, status, currentTask = null) {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new ValidationError('无效的设备 ID 格式');
    }

    // 验证状态
    const validStatuses = ['idle', 'busy', 'maintenance', 'offline'];
    if (status && !validStatuses.includes(status)) {
      throw new ValidationError(`无效的设备状态，必须是以下之一：${validStatuses.join(', ')}`);
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    // 记录之前的状态
    const previousStatus = device.status;

    // 更新状态
    if (status) {
      device.status = status;
    }

    // 更新当前任务
    if (currentTask) {
      device.currentTask = currentTask;
    }

    await device.save();

    // 获取更新后的设备（包含关联的订单信息）
    const updatedDevice = await Device.findById(deviceId)
      .populate('currentTask.orderId');

    // 发射设备状态变更事件
    agentEventEmitter.emitDeviceChanged({
      deviceId: device.deviceId,
      previousStatus,
      currentStatus: device.status,
      currentTask: device.currentTask
    });

    return updatedDevice;
  }

  /**
   * 通过 deviceId 字符串更新设备状态
   * 
   * @param {string} deviceIdStr - 设备唯一标识（字符串，如 PRINTER-001）
   * @param {string} status - 新状态
   * @param {Object} currentTask - 当前任务信息（可选）
   * @returns {Promise<Object>} 更新后的设备
   */
  async updateDeviceStatusByDeviceId(deviceIdStr, status, currentTask = null) {
    const validStatuses = ['idle', 'busy', 'maintenance', 'offline'];
    if (status && !validStatuses.includes(status)) {
      throw new ValidationError(`无效的设备状态，必须是以下之一：${validStatuses.join(', ')}`);
    }

    const device = await Device.findOne({ deviceId: deviceIdStr });
    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    const previousStatus = device.status;

    // 使用 updateOne 而非 save（兼容 Mock 模式）
    const updateData = { status };
    if (currentTask) {
      updateData.currentTask = currentTask;
    }
    await Device.updateOne({ deviceId: deviceIdStr }, { $set: updateData });

    const updatedDevice = await Device.findOne({ deviceId: deviceIdStr })
      .populate('currentTask.orderId');

    agentEventEmitter.emitDeviceChanged({
      deviceId: device.deviceId,
      previousStatus,
      currentStatus: status,
      currentTask: currentTask || device.currentTask
    });

    return updatedDevice;
  }

  /**
   * 更新设备信息（通用更新方法）
   * 
   * @param {string} deviceId - 设备 ID（MongoDB ObjectId）
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object>} 更新后的设备
   */
  async updateDevice(deviceId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new ValidationError('无效的设备 ID 格式');
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    const { status, currentTask, capacity, location } = updateData;

    // 记录之前的状态
    const previousStatus = device.status;

    // 更新状态
    if (status !== undefined) {
      const validStatuses = ['idle', 'busy', 'maintenance', 'offline'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError(`无效的设备状态，必须是以下之一：${validStatuses.join(', ')}`);
      }
      device.status = status;
    }

    // 更新当前任务
    if (currentTask !== undefined) {
      device.currentTask = currentTask;
    }

    // 更新容量
    if (capacity !== undefined) {
      if (capacity.maxVolume !== undefined) {
        device.capacity.maxVolume = capacity.maxVolume;
      }
      if (capacity.currentLoad !== undefined) {
        if (capacity.currentLoad < 0 || capacity.currentLoad > 100) {
          throw new ValidationError('currentLoad 必须在 0-100 之间');
        }
        device.capacity.currentLoad = capacity.currentLoad;
      }
    }

    // 更新位置
    if (location !== undefined) {
      device.location = location;
    }

    await device.save();

    // 获取更新后的设备（包含关联的订单信息）
    const updatedDevice = await Device.findById(deviceId)
      .populate('currentTask.orderId');

    // 如果状态发生变化，发射事件
    if (previousStatus !== updatedDevice.status) {
      agentEventEmitter.emitDeviceChanged({
        deviceId: device.deviceId,
        previousStatus,
        currentStatus: updatedDevice.status,
        currentTask: updatedDevice.currentTask
      });
    }

    return updatedDevice;
  }

  /**
   * 删除设备
   * 
   * @param {string} deviceId - 设备 ID（MongoDB ObjectId）
   * @returns {Promise<void>}
   */
  async deleteDevice(deviceId) {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new ValidationError('无效的设备 ID 格式');
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    // 检查设备是否正在运行任务
    if (device.status === 'busy') {
      throw new AppError('无法删除正在运行任务的设备', 'CANNOT_DELETE_BUSY_DEVICE', 400);
    }

    // 发射设备删除事件
    agentEventEmitter.emitEvent('device_deleted', {
      deviceId: device.deviceId,
      type: device.type,
      location: device.location
    });

    await Device.findByIdAndDelete(deviceId);
  }

  /**
   * 获取可用设备
   * 
   * @param {string} type - 设备类型（可选）
   * @returns {Promise<Array>} 可用设备列表
   */
  async getAvailableDevices(type = null) {
    const query = { status: 'idle' };
    if (type) {
      query.type = type;
    }

    // 使用模型的静态方法查询
    const devices = await Device.findAvailable(type);

    return devices;
  }

  /**
   * 分配任务到设备
   * 
   * @param {string} deviceId - 设备 ID（MongoDB ObjectId）
   * @param {string} orderId - 订单 ID
   * @param {Date} estimatedCompletion - 预计完成时间
   * @returns {Promise<Object>} 更新后的设备
   */
  async assignTask(deviceId, orderId, estimatedCompletion) {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new ValidationError('无效的设备 ID 格式');
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    // 检查设备是否空闲
    if (device.status !== 'idle') {
      throw new AppError(
        `设备当前状态为 ${device.status}，无法分配任务`,
        'DEVICE_NOT_IDLE',
        400
      );
    }

    // 记录之前的状态
    const previousStatus = device.status;

    // 分配任务
    await device.assignTask(orderId, estimatedCompletion);

    // 获取更新后的设备（包含关联的订单信息）
    const updatedDevice = await Device.findById(deviceId)
      .populate('currentTask.orderId');

    // 发射设备状态变更事件
    agentEventEmitter.emitDeviceChanged({
      deviceId: device.deviceId,
      previousStatus,
      currentStatus: 'busy',
      currentTask: updatedDevice.currentTask
    });

    return updatedDevice;
  }

  /**
   * 完成当前任务
   * 
   * @param {string} deviceId - 设备 ID（MongoDB ObjectId）
   * @returns {Promise<Object>} 更新后的设备
   */
  async completeTask(deviceId) {
    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      throw new ValidationError('无效的设备 ID 格式');
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      throw new NotFoundError('设备不存在');
    }

    // 检查设备是否有任务
    if (!device.currentTask || !device.currentTask.orderId) {
      throw new AppError('设备当前没有任务', 'NO_TASK_TO_COMPLETE', 400);
    }

    // 记录之前的状态
    const previousStatus = device.status;

    // 完成任务
    await device.completeTask();

    // 获取更新后的设备
    const updatedDevice = await Device.findById(deviceId);

    // 发射设备状态变更事件
    agentEventEmitter.emitDeviceChanged({
      deviceId: device.deviceId,
      previousStatus,
      currentStatus: 'idle',
      currentTask: null
    });

    return updatedDevice;
  }
}

module.exports = DeviceService;
