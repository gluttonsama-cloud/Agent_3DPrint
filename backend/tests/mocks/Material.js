const mockMaterial = {
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn()
};

mockMaterial.find.mockImplementation(() => ({
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([])
}));

mockMaterial.create.mockImplementation((data) => ({
  _id: 'new-material-id',
  ...data,
  save: jest.fn().mockResolvedValue(true)
}));

module.exports = {
  Material: mockMaterial
};