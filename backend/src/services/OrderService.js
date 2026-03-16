/**
 * 订单服务层
 * 
 * 处理订单业务逻辑，包括创建、查询、更新、删除等操作
 * 集成状态机、队列和 Agent 进行订单管理
 */

const Order = require('../models/Order');
const Device = require('../models/Device');
const Material = require('../models/Material');
const { OrderStates, getStateLabel } = require('../constants/orderStates');
const { createOrderStateMachine } = require('../states/OrderStateMachine');
const { addOrderToQueue } = require('../queues/orderQueue');
const { AgentRegistry } = require('../agents/registry');
const { NotFoundError, ValidationError, AppError } = require('../middleware/errorHandler');
const mongoose = require('mongoose');

/**
 * 订单服务类
 */
class OrderService {
  /**
   * 创建订单服务实例
   */
  constructor() {
    // Agent 注册中心（延迟初始化）
    this.agentRegistry = null;
    // 低库存预警阈值：当库存低于此比例时触发预警（20%）
    this.lowStockThresholdRatio = 0.2;
  }

  /**
   * 初始化服务（设置 Agent 注册中心）
   * @param {AgentRegistry} agentRegistry - Agent 注册中心实例
   */
  setAgentRegistry(agentRegistry) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * 创建新订单
   * 
   * @param {Object} orderData - 订单数据
   * @param {string} orderData.userId - 用户 ID
   * @param {Array} orderData.photos - 照片 URL 数组
   * @param {string} orderData.deviceType - 设备类型（如 "sla"）
   * @param {string} orderData.material - 材料类型（如 "resin-standard"）
   * @param {number} orderData.quantity - 数量
   * @param {Object} orderData.specifications - 规格参数
   * @param {Array} orderData.items - 订单项（可选，如果不提供则根据上述参数创建）
   * @param {number} orderData.totalPrice - 总价格
   * @returns {Promise<Object>} 创建的订单
   */
  async createOrder(orderData) {
    const {
      userId,
      photos,
      deviceType,
      material,
      quantity,
      specifications,
      items,
      totalPrice
    } = orderData;

    // 验证必填字段
    if (!userId) {
      throw new ValidationError('userId 是必填字段');
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ValidationError('无效的 userId 格式');
    }

    // 如果没有提供 items，则根据参数创建
    let orderItems = items;
    if (!orderItems) {
      if (!deviceType || !quantity || totalPrice === undefined) {
        throw new ValidationError('必须提供 items 或 deviceType、quantity、totalPrice 参数');
      }

      orderItems = [
        {
          // 注意：deviceId 和 materialId 应该是 ObjectId 或留空等待后续分配
          // 这里暂时使用占位符，实际应用中需要根据 deviceType 和 material 查询对应的 ID
          quantity: quantity,
          unitPrice: totalPrice / quantity,
          specifications: specifications || {
            deviceType,
            materialType: material
          }
        }
      ];
    }

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      throw new ValidationError('订单至少需要包含一个项目');
    }

    // 验证每个订单项
    orderItems.forEach((item, index) => {
      if (!item.quantity || item.quantity < 1) {
        throw new ValidationError(`第 ${index + 1} 个项目的数量必须至少为 1`);
      }
      if (item.unitPrice === undefined || item.unitPrice < 0) {
        throw new ValidationError(`第 ${index + 1} 个项目的单价不能为负数`);
      }
    });

    // 创建订单
    const order = new Order({
      userId,
      items: orderItems,
      totalPrice: totalPrice !== undefined ? totalPrice : orderItems.reduce((sum, item) => {
        return sum + (item.unitPrice * item.quantity);
      }, 0),
      status: OrderStates.PENDING_REVIEW, // 初始状态：待审核
      metadata: {
        sourcePhotos: photos || [],
        deviceType,
        materialType: material,
        createdAt: new Date().toISOString()
      }
    });

    await order.save();
    console.log(`[OrderService] 订单创建成功：${order._id}, 状态：${getStateLabel(order.status)}`);

    // 创建订单状态机并记录初始状态
    const stateMachine = createOrderStateMachine(order._id.toString(), order.status);
    
    // 将订单加入处理队列，异步处理
    try {
      await addOrderToQueue(order._id.toString(), {
        orderId: order._id.toString(),
        orderData: order.toObject()
      });
      console.log(`[OrderService] 订单已加入处理队列：${order._id}`);
    } catch (queueError) {
      console.warn(`[OrderService] 加入队列失败，但订单已创建：${order._id}`, queueError.message);
    }

    // 调用协调 Agent 进行订单审核（如果 Agent 系统可用）
    if (this.agentRegistry) {
      try {
        const coordinator = this.agentRegistry.get('coordinator_agent');
        if (coordinator) {
          // 异步调用，不阻塞订单创建
          coordinator.execute({
            type: 'process_order',
            orderId: order._id.toString()
          }).catch(err => {
            console.error('[OrderService] Agent 处理订单失败:', err.message);
          });
        }
      } catch (agentError) {
        console.warn('[OrderService] Agent 系统未就绪，订单将等待手动处理:', agentError.message);
      }
    }

    return await this.getOrderById(order._id.toString());
  }

  /**
   * 查询订单列表（支持筛选、分页、排序）
   * 
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.status] - 状态筛选
   * @param {string} [filters.userId] - 用户 ID 筛选
   * @param {string} [filters.deviceType] - 设备类型筛选
   * @param {Object} pagination - 分页参数
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.limit=20] - 每页数量
   * @param {Object} sorting - 排序参数
   * @param {string} [sorting.sortBy='createdAt'] - 排序字段
   * @param {string} [sorting.sortOrder='desc'] - 排序方向（asc/desc）
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  async getOrders(filters = {}, pagination = {}, sorting = {}) {
    const {
      status,
      userId,
      deviceType
    } = filters;

    const {
      page = 1,
      limit = 20
    } = pagination;

    const {
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = sorting;

    // 构建查询条件
    const query = {};
    if (status) {
      query.status = status;
    }
    if (userId) {
      query.userId = userId;
    }
    if (deviceType) {
      query['metadata.deviceType'] = deviceType;
    }

    // 构建排序
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // 计算分页
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // 执行查询
    const orders = await Order.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('items.deviceId')
      .populate('items.materialId')
      .populate('agentDecisions')
      .lean();

    // 获取总数
    const total = await Order.countDocuments(query);

    return {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * 查询订单详情
   * 
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 订单详情
   */
  async getOrderById(orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const order = await Order.findById(orderId)
      .populate('items.deviceId')
      .populate('items.materialId')
      .populate('agentDecisions')
      .lean();

    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    // 获取订单状态机状态
    let stateMachineStatus = null;
    try {
      const stateMachine = createOrderStateMachine(orderId, order.status);
      stateMachineStatus = stateMachine.getSnapshot();
    } catch (error) {
      console.warn('[OrderService] 无法获取状态机状态:', error.message);
    }

    return {
      ...order,
      stateMachineStatus
    };
  }

  /**
   * 更新订单状态（使用状态机）
   * 
   * @param {string} orderId - 订单 ID
   * @param {string} newStatus - 新状态
   * @param {Object} context - 状态转换上下文
   * @param {string} [context.reason] - 转换原因
   * @param {string} [context.operator] - 操作者（user/admin/agent_system）
   * @returns {Promise<Object>} 更新结果
   */
  async updateOrderStatus(orderId, newStatus, context = {}) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    // 验证状态值
    if (!OrderStates[newStatus.toUpperCase().replace('-', '_')]) {
      // 尝试直接匹配值
      const validStates = Object.values(OrderStates);
      if (!validStates.includes(newStatus)) {
        throw new ValidationError(`无效的状态值，必须是以下之一：${validStates.join(', ')}`);
      }
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    const previousStatus = order.status;

    // 创建状态机并执行状态转换
    const stateMachine = createOrderStateMachine(orderId, order.status);
    
    if (!stateMachine.canTransition(newStatus)) {
      throw new AppError(
        `订单状态不能从 ${getStateLabel(previousStatus)} 变更为 ${getStateLabel(newStatus)}`,
        'INVALID_STATUS_TRANSITION',
        400
      );
    }

    // 执行状态转换
    await stateMachine.transition(newStatus, {
      reason: context.reason || '',
      operator: context.operator || 'system'
    });

    // 同步更新数据库
    order.status = newStatus;
    
    // 记录状态变更历史
    if (!order.metadata.statusHistory) {
      order.metadata.statusHistory = [];
    }
    order.metadata.statusHistory.push({
      from: previousStatus,
      to: newStatus,
      reason: context.reason || '',
      operator: context.operator || 'system',
      timestamp: new Date().toISOString()
    });

    await order.save();
    console.log(`[OrderService] 订单状态已更新：${orderId}, ${getStateLabel(previousStatus)} -> ${getStateLabel(newStatus)}`);

    return {
      orderId,
      previousStatus,
      currentStatus: newStatus,
      previousStatusLabel: getStateLabel(previousStatus),
      currentStatusLabel: getStateLabel(newStatus),
      stateMachine: stateMachine.getSnapshot()
    };
  }

  /**
   * 取消订单
   * 
   * @param {string} orderId - 订单 ID
   * @param {string} reason - 取消原因
   * @returns {Promise<Object>} 取消结果
   */
  async cancelOrder(orderId, reason = '用户取消订单') {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    // 检查是否可以取消
    if (order.status === OrderStates.COMPLETED) {
      throw new AppError('已完成的订单无法取消', 'CANNOT_CANCEL_COMPLETED_ORDER', 400);
    }

    if (order.status === OrderStates.CANCELLED) {
      throw new AppError('订单已取消', 'ORDER_ALREADY_CANCELLED', 400);
    }

    if (order.status === OrderStates.SHIPPED) {
      throw new AppError('已发货的订单无法取消', 'CANNOT_CANCEL_SHIPPED_ORDER', 400);
    }

    // 使用状态机取消订单
    const stateMachine = createOrderStateMachine(orderId, order.status);
    
    if (!stateMachine.canTransition(OrderStates.CANCELLED)) {
      throw new AppError(
        `当前状态无法取消订单：${getStateLabel(order.status)}`,
        'CANNOT_CANCEL_CURRENT_STATE',
        400
      );
    }

    // 执行状态转换
    await stateMachine.transition(OrderStates.CANCELLED, {
      reason,
      operator: 'user'
    });

    // 更新数据库
    order.status = OrderStates.CANCELLED;
    if (!order.metadata) {
      order.metadata = {};
    }
    order.metadata.cancelledAt = new Date().toISOString();
    order.metadata.cancelReason = reason;

    await order.save();
    console.log(`[OrderService] 订单已取消：${orderId}, 原因：${reason}`);

    // 从处理队列中移除（如果存在）
    try {
      const { orderQueue } = require('../queues/orderQueue');
      const job = await orderQueue.getJob(orderId);
      if (job) {
        await job.remove();
        console.log(`[OrderService] 订单已从队列中移除：${orderId}`);
      }
    } catch (queueError) {
      console.warn('[OrderService] 移除队列失败，但订单已取消:', queueError.message);
    }

    return {
      orderId,
      status: OrderStates.CANCELLED,
      statusLabel: getStateLabel(OrderStates.CANCELLED),
      reason,
      cancelledAt: order.metadata.cancelledAt
    };
  }

  /**
   * 触发订单处理（加入队列）
   * 
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 队列作业信息
   */
  async processOrder(orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const order = await this.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    // 检查订单状态是否允许处理
    if (order.status === OrderStates.CANCELLED || order.status === OrderStates.COMPLETED) {
      throw new AppError(
        `当前状态的订单无法处理：${getStateLabel(order.status)}`,
        'CANNOT_PROCESS_CURRENT_STATE',
        400
      );
    }

    // 加入处理队列
    const job = await addOrderToQueue(orderId, {
      orderId,
      orderData: order
    });

    console.log(`[OrderService] 订单已加入处理队列：${orderId}, 作业 ID: ${job.id}`);

    return {
      orderId,
      jobId: job.id,
      status: 'queued',
      queuedAt: new Date().toISOString()
    };
  }

  /**
   * 批量查询订单（按 ID 列表）
   * 
   * @param {Array<string>} orderIds - 订单 ID 数组
   * @returns {Promise<Array>} 订单数组
   */
  async getOrdersByIds(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return [];
    }

    // 验证所有 ID 格式
    const validIds = orderIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return [];
    }

    const orders = await Order.find({ _id: { $in: validIds } })
      .populate('items.deviceId')
      .populate('items.materialId')
      .populate('agentDecisions')
      .lean();

    return orders;
  }

  /**
   * 查询用户的所有订单
   * 
   * @param {string} userId - 用户 ID
   * @param {Object} pagination - 分页参数
   * @param {Object} sorting - 排序参数
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  async getUserOrders(userId, pagination = {}, sorting = {}) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ValidationError('无效的 userId 格式');
    }

    return this.getOrders(
      { userId },
      pagination,
      sorting
    );
  }

  /**
   * 扣减库存（订单状态变为 processing 时调用）
   * 
   * @param {string} materialId - 材料 ID
   * @param {number} volumeGrams - 需要扣减的体积（克）
   * @returns {Promise<Object>} 扣减后的材料信息
   */
  async deductMaterial(materialId, volumeGrams) {
    if (!mongoose.Types.ObjectId.isValid(materialId)) {
      throw new ValidationError('无效的材料 ID 格式');
    }

    const material = await Material.findById(materialId);
    
    if (!material) {
      throw new NotFoundError(`材料不存在：${materialId}`);
    }

    if (material.stock.quantity < volumeGrams) {
      throw new AppError(
        `库存不足：${material.name} 当前库存 ${material.stock.quantity}${material.stock.unit}，需要 ${volumeGrams}g`,
        'INSUFFICIENT_MATERIAL_STOCK',
        400
      );
    }

    // 扣减库存
    material.stock.quantity -= volumeGrams;
    
    // 检查是否需要补货预警
    if (material.stock.quantity <= material.threshold) {
      material.stock.needsReorder = true;
      console.log(`[OrderService] 低库存预警：${material.name} 需要补货`);
    }

    await material.save();
    
    // 检查是否触发低库存预警（基于比例）
    const stockRatio = material.stock.quantity / (material.threshold / this.lowStockThresholdRatio);
    if (stockRatio <= this.lowStockThresholdRatio && !material.stock.needsReorder) {
      material.stock.needsReorder = true;
      await material.save();
      console.log(`[OrderService] 低库存预警触发：${material.name} 库存比例 ${Math.round(stockRatio * 100)}%`);
    }

    return {
      materialId: material._id,
      name: material.name,
      remainingStock: material.stock.quantity,
      unit: material.stock.unit,
      needsReorder: material.stock.needsReorder
    };
  }

  /**
   * 分配订单到设备
   * 
   * @param {string} orderId - 订单 ID
   * @param {string} [deviceId] - 可选的设备 ID，不提供则自动选择
   * @param {string} [deviceType] - 设备类型（自动选择时使用）
   * @returns {Promise<Object>} 分配结果
   */
  async assignOrderToDevice(orderId, deviceId = null, deviceType = null) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    let device;
    
    if (deviceId) {
      // 指定设备
      if (!mongoose.Types.ObjectId.isValid(deviceId)) {
        throw new ValidationError('无效的设备 ID 格式');
      }
      
      device = await Device.findById(deviceId);
      
      if (!device) {
        throw new NotFoundError('指定的设备不存在');
      }

      if (device.status !== 'idle') {
        throw new AppError(
          `设备当前不可用：${device.deviceId} 状态为 ${device.status}`,
          'DEVICE_NOT_AVAILABLE',
          400
        );
      }
    } else {
      // 自动选择设备
      const query = { status: 'idle' };
      if (deviceType) {
        query.type = deviceType;
      }
      
      device = await Device.findOne(query).sort({ 'capacity.currentLoad': 1 });
      
      if (!device) {
        throw new AppError(
          deviceType 
            ? `当前没有可用的 ${deviceType} 类型设备`
            : '当前没有可用的设备',
          'NO_AVAILABLE_DEVICE',
          400
        );
      }
    }

    // 计算预计完成时间（简化：假设每个订单 24 小时）
    const estimatedCompletion = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 更新订单
    if (!order.items || order.items.length === 0) {
      order.items = [{ deviceId: device._id }];
    } else {
      order.items[0].deviceId = device._id;
    }
    order.status = OrderStates.PRINTING;
    await order.save();

    // 更新设备
    await device.assignTask(order._id, estimatedCompletion);

    console.log(
      `[OrderService] 订单 ${orderId} 已分配到设备 ${device.deviceId}, ` +
      `预计完成：${estimatedCompletion.toISOString()}`
    );

    return {
      orderId: order._id,
      deviceId: device._id,
      deviceName: device.deviceId,
      estimatedCompletion: estimatedCompletion.toISOString(),
      orderStatus: order.status
    };
  }

  /**
   * 完成订单（释放设备）
   * 
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 完成结果
   */
  async completeOrder(orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    if (order.status !== OrderStates.POST_PROCESSING && order.status !== OrderStates.PRINTING) {
      throw new AppError(
        `只有 printing 或 post_processing 状态的订单才能完成，当前状态：${getStateLabel(order.status)}`,
        'INVALID_ORDER_STATUS_FOR_COMPLETION',
        400
      );
    }

    order.status = OrderStates.COMPLETED;
    await order.save();

    // 释放设备
    if (order.items && order.items.length > 0 && order.items[0].deviceId) {
      const device = await Device.findById(order.items[0].deviceId);
      if (device) {
        await device.completeTask();
        console.log(`[OrderService] 设备 ${device.deviceId} 已释放`);
      }
    }

    console.log(`[OrderService] 订单 ${orderId} 已完成`);

    return {
      orderId,
      status: OrderStates.COMPLETED,
      statusLabel: getStateLabel(OrderStates.COMPLETED),
      completedAt: new Date().toISOString()
    };
  }

  /**
   * 取消订单（释放设备和库存）
   * 
   * @param {string} orderId - 订单 ID
   * @param {string} reason - 取消原因
   * @returns {Promise<Object>} 取消结果
   */
  async cancelOrderWithRelease(orderId, reason = '用户取消订单') {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ValidationError('无效的订单 ID 格式');
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new NotFoundError('订单不存在');
    }

    // 检查是否可以取消
    if (order.status === OrderStates.COMPLETED || order.status === OrderStates.SHIPPED) {
      throw new AppError(
        `已${getStateLabel(order.status)}的订单无法取消`,
        'CANNOT_CANCEL_COMPLETED_ORDER',
        400
      );
    }

    if (order.status === OrderStates.CANCELLED) {
      throw new AppError('订单已取消', 'ORDER_ALREADY_CANCELLED', 400);
    }

    // 如果订单正在打印，释放设备
    if (order.status === OrderStates.PRINTING && order.items && order.items.length > 0) {
      const deviceId = order.items[0].deviceId;
      if (deviceId) {
        const device = await Device.findById(deviceId);
        if (device && device.status === 'busy') {
          await device.completeTask();
          console.log(`[OrderService] 订单取消，设备 ${device.deviceId} 已释放`);
        }
      }
    }

    order.status = OrderStates.CANCELLED;
    if (!order.metadata) {
      order.metadata = {};
    }
    order.metadata.cancelledAt = new Date().toISOString();
    order.metadata.cancelReason = reason;
    await order.save();

    console.log(`[OrderService] 订单已取消：${orderId}, 原因：${reason}`);

    return {
      orderId,
      status: OrderStates.CANCELLED,
      statusLabel: getStateLabel(OrderStates.CANCELLED),
      reason,
      cancelledAt: order.metadata.cancelledAt
    };
  }

  /**
   * 获取低库存材料列表
   * 
   * @returns {Promise<Array>} 低库存材料列表
   */
  async getLowStockMaterials() {
    const materials = await Material.find()
      .select('name type stock threshold supplier')
      .lean();

    const lowStockMaterials = materials
      .filter(material => material.stock.quantity <= material.threshold)
      .map(material => ({
        materialId: material._id,
        name: material.name,
        type: material.type,
        currentStock: material.stock.quantity,
        unit: material.stock.unit,
        threshold: material.threshold,
        needsReorder: true,
        shortage: material.threshold - material.stock.quantity,
        supplier: material.supplier
      }));

    return lowStockMaterials;
  }

  /**
   * 检查材料充足性
   * 
   * @param {string} materialId - 材料 ID
   * @param {number} requiredAmount - 需要的数量（克）
   * @returns {Promise<Object>} 检查结果
   */
  async checkMaterialSufficiency(materialId, requiredAmount) {
    if (!mongoose.Types.ObjectId.isValid(materialId)) {
      throw new ValidationError('无效的材料 ID 格式');
    }

    const material = await Material.findById(materialId);
    
    if (!material) {
      return { 
        sufficient: false, 
        reason: '材料不存在',
        materialId 
      };
    }

    const sufficient = material.stock.quantity >= requiredAmount;
    
    return {
      sufficient,
      materialId: material._id,
      materialName: material.name,
      available: material.stock.quantity,
      unit: material.stock.unit,
      required: requiredAmount,
      shortage: sufficient ? 0 : requiredAmount - material.stock.quantity
    };
  }

  /**
   * 获取订单统计信息
   * 
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Object>} 统计信息
   */
  async getOrderStats(filters = {}) {
    const { startDate, endDate } = filters;

    // 构建时间筛选
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    const matchQuery = {};
    if (Object.keys(dateFilter).length > 0) {
      matchQuery.createdAt = dateFilter;
    }

    // 按状态分组统计
    const stats = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' }
        }
      }
    ]);

    // 总数统计
    const totalOrders = await Order.countDocuments(matchQuery);
    const totalRevenue = await Order.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);

    // 格式化结果
    const statsByStatus = {};
    stats.forEach(item => {
      statsByStatus[item._id] = {
        count: item.count,
        totalRevenue: item.totalRevenue || 0,
        label: getStateLabel(item._id)
      };
    });

    return {
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      byStatus: statsByStatus,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    };
  }
}

// 导出单例
const orderService = new OrderService();

module.exports = {
  OrderService,
  orderService
};
