const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

app.get('/api/orders', (req, res) => {
  res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 10 } });
});

app.post('/api/orders', (req, res) => {
  res.status(201).json({ success: true, data: { _id: 'new-order-id', ...req.body } });
});

app.get('/api/orders/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, status: 'pending' } });
});

app.put('/api/orders/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, ...req.body } });
});

app.delete('/api/orders/:id', (req, res) => {
  res.json({ success: true, message: 'Order deleted' });
});

describe('Orders API', () => {
  describe('GET /api/orders', () => {
    it('should return list of orders', async () => {
      const response = await request(app).get('/api/orders');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const orderData = {
        customerName: 'Test Customer',
        items: [{ productId: 'prod-1', quantity: 1, price: 100 }],
        totalPrice: 100
      };
      const response = await request(app)
        .post('/api/orders')
        .send(orderData);
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBeDefined();
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should return order by id', async () => {
      const response = await request(app).get('/api/orders/order-123');
      expect(response.status).toBe(200);
      expect(response.body.data._id).toBe('order-123');
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('should update order', async () => {
      const response = await request(app)
        .put('/api/orders/order-123')
        .send({ status: 'processing' });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/orders/:id', () => {
    it('should delete order', async () => {
      const response = await request(app).delete('/api/orders/order-123');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});