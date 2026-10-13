const mockOrder = {
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn()
};

mockOrder.findById.mockImplementation((id) => ({
  _id: id,
  status: 'pending',
  items: [],
  customerName: 'Test Customer',
  totalPrice: 100,
  save: jest.fn().mockResolvedValue(true),
  populate: jest.fn().mockReturnThis()
}));

mockOrder.find.mockImplementation(() => ({
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([])
}));

mockOrder.create.mockImplementation((data) => ({
  _id: 'new-order-id',
  ...data,
  save: jest.fn().mockResolvedValue(true)
}));

mockOrder.countDocuments.mockResolvedValue(0);

module.exports = {
  Order: mockOrder
};