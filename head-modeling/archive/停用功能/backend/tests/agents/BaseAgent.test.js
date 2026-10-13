const { BaseAgent, AgentState } = require('../../src/agents/BaseAgent');

jest.mock('../../src/config/llm', () => ({
  createLLM: jest.fn(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'test response' })
  }))
}));

describe('BaseAgent', () => {
  let agent;

  beforeEach(() => {
    agent = new BaseAgent({
      id: 'test_agent',
      name: 'Test Agent',
      description: 'A test agent'
    });
  });

  afterEach(async () => {
    if (agent) {
      await agent.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create agent with correct properties', () => {
      expect(agent.id).toBe('test_agent');
      expect(agent.name).toBe('Test Agent');
      expect(agent.description).toBe('A test agent');
      expect(agent.state).toBe(AgentState.IDLE);
    });

    it('should throw error if id is missing', () => {
      expect(() => new BaseAgent({ name: 'Test' })).toThrow('id');
    });

    it('should throw error if name is missing', () => {
      expect(() => new BaseAgent({ id: 'test' })).toThrow('name');
    });
  });

  describe('initialize', () => {
    it('should initialize agent and set state to READY', async () => {
      const result = await agent.initialize();
      expect(result).toBe(true);
      expect(agent.state).toBe(AgentState.READY);
    });

    it('should create LLM instance', async () => {
      await agent.initialize();
      expect(agent.llm).toBeDefined();
    });
  });

  describe('registerTool', () => {
    it('should register a tool', async () => {
      await agent.initialize();
      agent.registerTool('testTool', { execute: jest.fn() });
      expect(agent.listTools()).toContain('testTool');
    });
  });

  describe('getTool', () => {
    it('should return registered tool', async () => {
      await agent.initialize();
      const tool = { execute: jest.fn() };
      agent.registerTool('testTool', tool);
      expect(agent.getTool('testTool')).toBe(tool);
    });

    it('should return null for unregistered tool', async () => {
      expect(agent.getTool('nonExistent')).toBeNull();
    });
  });

  describe('setState', () => {
    it('should update agent state', async () => {
      await agent.initialize();
      agent.setState(AgentState.BUSY);
      expect(agent.state).toBe(AgentState.BUSY);
    });
  });

  describe('getState', () => {
    it('should return current state info', async () => {
      await agent.initialize();
      const state = agent.getState();
      expect(state.id).toBe('test_agent');
      expect(state.name).toBe('Test Agent');
      expect(state.state).toBe(AgentState.READY);
    });
  });

  describe('shutdown', () => {
    it('should set state to SHUTDOWN', async () => {
      await agent.initialize();
      await agent.shutdown();
      expect(agent.state).toBe(AgentState.SHUTDOWN);
    });

    it('should clear tools', async () => {
      await agent.initialize();
      agent.registerTool('testTool', {});
      await agent.shutdown();
      expect(agent.listTools()).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('should throw error if not implemented', async () => {
      await agent.initialize();
      await expect(agent.execute({})).rejects.toThrow('execute');
    });
  });
});