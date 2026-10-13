const mockDevice = {
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn()
};

mockDevice.findById.mockImplementation((id) => ({
  _id: id,
  name: 'Test Printer',
  status: 'idle',
  save: jest.fn().mockResolvedValue(true)
}));

mockDevice.find.mockImplementation(() => ({
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([])
}));

mockDevice.create.mockImplementation((data) => ({
  _id: 'new-device-id',
  ...data,
  save: jest.fn().mockResolvedValue(true)
}));

module.exports = {
  Device: mockDevice
};