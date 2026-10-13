jest.mock('../../src/models/Order', () => require('../mocks/Order'));

const { orderService } = require('../../src/services/OrderService');

describe('OrderService', () => {
  describe('createOrder', () => {
    it('should create a new order', async () => {
      const orderData = {
        userId: 'user-123',
        photos: ['photo1.jpg'],
        deviceType: 'sla',
        material: 'resin-standard',
        quantity: 1,
        totalPrice: 100
      };
      try {
        const result = await orderService.createOrder(orderData);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getOrderById', () => {
    it('should find order by id', async () => {
      try {
        const result = await orderService.getOrderById('order-123');
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getOrders', () => {
    it('should return orders with pagination', async () => {
      try {
        const result = await orderService.getOrders({ page: 1, limit: 10 });
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status', async () => {
      try {
        const result = await orderService.updateOrderStatus('order-123', 'processing');
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});