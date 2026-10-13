/**
 * 订单查询工具
 * 
 * 为 Agent 提供订单相关的查询和操作能力
 * 包含订单查询、状态更新、历史记录等功能
 */

const Order = require('../../models/Order');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 订单工具集合
 */
const orderTools = {
  /**
   * 根据 ID 查询订单
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.orderId - 订单 ID
   * @returns {Promise<Object|null>} 订单信息
   */
  getOrderById: {
    name: 'getOrderById',
    description: '根据订单 ID 查询订单详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '订单 ID'
        }
      },
      required: ['orderId']
    },
    execute: async (input) => {
      try {
        console.log('[OrderTool] 查询订单:', input.orderId);
        
        const order = await Order.findById(input.orderId)
          .populate('items.deviceId')
          .populate('items.materialId')
          .populate('userId')
          .populate('agentDecisions');
        
        if (!order) {
          return {
            success: false,
            error: '订单不存在',
            orderId: input.orderId
          };
        }
        
        return {
          success: true,
          order: {
            id: order._id,
            orderNumber: order._id,
            userId: order.userId,
            items: order.items,
            totalPrice: order.totalPrice,
            status: order.status,
            agentDecisions: order.agentDecisions,
            metadata: order.metadata,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
          }
        };
      } catch (error) {
        console.error('[OrderTool] 查询订单失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 根据状态查询订单列表
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.status - 订单状态
   * @param {number} input.limit - 返回数量限制
   * @returns {Promise<Array>} 订单列表
   */
  getOrdersByStatus: {
    name: 'getOrdersByStatus',
    description: '根据订单状态查询订单列表',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: '订单状态：pending, processing, printing, completed, cancelled, failed',
          enum: ['pending', 'processing', 'printing', 'completed', 'cancelled', 'failed']
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
          default: 10
        }
      },
      required: ['status']
    },
    execute: async (input) => {
      try {
        console.log('[OrderTool] 查询状态为', input.status, '的订单，限制:', input.limit);
        
        const orders = await Order.find({ status: input.status })
          .sort({ createdAt: -1 })
          .limit(input.limit || 10)
          .populate('items.deviceId');
        
        return {
          success: true,
          orders: orders.map(order => ({
            id: order._id,
            orderNumber: order._id,
            userId: order.userId,
            itemCount: order.items.length,
            totalPrice: order.totalPrice,
            status: order.status,
            createdAt: order.createdAt
          })),
          count: orders.length
        };
      } catch (error) {
        console.error('[OrderTool] 查询订单列表失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 更新订单状态
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.orderId - 订单 ID
   * @param {string} input.status - 新状态
   * @returns {Promise<Object>} 更新结果
   */
  updateOrderStatus: {
    name: 'updateOrderStatus',
    description: '更新订单状态',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '订单 ID'
        },
        status: {
          type: 'string',
          description: '新状态',
          enum: ['pending', 'processing', 'printing', 'completed', 'cancelled', 'failed']
        }
      },
      required: ['orderId', 'status']
    },
    execute: async (input) => {
      try {
        console.log('[OrderTool] 更新订单状态:', input.orderId, '->', input.status);
        
        const order = await Order.findById(input.orderId);
        
        if (!order) {
          return {
            success: false,
            error: '订单不存在'
          };
        }
        
        const previousStatus = order.status;
        order.status = input.status;
        await order.save();
        
        // 发射状态变化事件
        agentEventEmitter.emitOrderProcessingCompleted({
          orderNumber: order._id,
          orderId: order._id,
          status: order.status
        });
        
        return {
          success: true,
          order: {
            id: order._id,
            previousStatus,
            currentStatus: order.status,
            updatedAt: order.updatedAt
          }
        };
      } catch (error) {
        console.error('[OrderTool] 更新订单状态失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 获取待处理订单
   * 
   * @param {Object} input - 输入参数
   * @param {number} input.limit - 返回数量限制
   * @returns {Promise<Array>} 待处理订单列表
   */
  getPendingOrders: {
    name: 'getPendingOrders',
    description: '获取所有待处理的订单',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '返回数量限制',
          default: 10
        }
      }
    },
    execute: async (input) => {
      try {
        console.log('[OrderTool] 获取待处理订单，限制:', input.limit);
        
        const orders = await Order.find({ status: 'pending' })
          .sort({ createdAt: 1 })
          .limit(input.limit || 10)
          .populate('items.deviceId');
        
        return {
          success: true,
          orders: orders.map(order => ({
            id: order._id,
            orderNumber: order._id,
            userId: order.userId,
            itemCount: order.items.length,
            totalPrice: order.totalPrice,
            createdAt: order.createdAt
          })),
          count: orders.length
        };
      } catch (error) {
        console.error('[OrderTool] 获取待处理订单失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 获取用户订单历史
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.userId - 用户 ID
   * @param {number} input.limit - 返回数量限制
   * @returns {Promise<Array>} 用户订单历史
   */
  getUserOrderHistory: {
    name: 'getUserOrderHistory',
    description: '获取指定用户的订单历史',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户 ID'
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
          default: 10
        }
      },
      required: ['userId']
    },
    execute: async (input) => {
      try {
        console.log('[OrderTool] 获取用户订单历史:', input.userId);
        
        const orders = await Order.find({ userId: input.userId })
          .sort({ createdAt: -1 })
          .limit(input.limit || 10);
        
        return {
          success: true,
          orders: orders.map(order => ({
            id: order._id,
            orderNumber: order._id,
            itemCount: order.items.length,
            totalPrice: order.totalPrice,
            status: order.status,
            createdAt: order.createdAt
          })),
          count: orders.length
        };
      } catch (error) {
        console.error('[OrderTool] 获取用户订单历史失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  }
};

module.exports = orderTools;
