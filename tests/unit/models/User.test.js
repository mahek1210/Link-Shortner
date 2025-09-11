// tests/unit/models/User.test.js - Unit tests for User model
const User = require('../../../src/models/User');
const bcrypt = require('bcryptjs');

describe('User Model', () => {
  describe('Schema Validation', () => {
    it('should create a valid user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.username).toBe(userData.username);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.password).not.toBe(userData.password); // Should be hashed
      expect(savedUser.role).toBe('user'); // Default role
      expect(savedUser.isActive).toBe(true); // Default active
    });

    it('should require username', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/username.*required/i);
    });

    it('should require email', async () => {
      const userData = {
        username: 'testuser',
        password: 'TestPassword123!'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/email.*required/i);
    });

    it('should require password for non-OAuth users', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/password.*required/i);
    });

    it('should validate email format', async () => {
      const userData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'TestPassword123!'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/email.*valid/i);
    });

    it('should enforce unique email', async () => {
      const userData1 = {
        username: 'user1',
        email: 'duplicate@example.com',
        password: 'TestPassword123!'
      };

      const userData2 = {
        username: 'user2',
        email: 'duplicate@example.com',
        password: 'AnotherPassword123!'
      };

      const user1 = new User(userData1);
      await user1.save();

      const user2 = new User(userData2);
      await expect(user2.save()).rejects.toThrow(/duplicate key error/i);
    });

    it('should enforce unique username', async () => {
      const userData1 = {
        username: 'duplicateuser',
        email: 'user1@example.com',
        password: 'TestPassword123!'
      };

      const userData2 = {
        username: 'duplicateuser',
        email: 'user2@example.com',
        password: 'AnotherPassword123!'
      };

      const user1 = new User(userData1);
      await user1.save();

      const user2 = new User(userData2);
      await expect(user2.save()).rejects.toThrow(/duplicate key error/i);
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'PlainTextPassword123!'
      };

      const user = new User(userData);
      await user.save();

      expect(user.password).not.toBe(userData.password);
      expect(user.password).toMatch(/^\$2[ayb]\$.{56}$/); // bcrypt hash pattern
    });

    it('should not rehash password if not modified', async () => {
      const user = await global.testUtils.createTestUser();
      const originalHash = user.password;

      user.username = 'updatedusername';
      await user.save();

      expect(user.password).toBe(originalHash);
    });

    it('should rehash password if modified', async () => {
      const user = await global.testUtils.createTestUser();
      const originalHash = user.password;

      user.password = 'NewPassword123!';
      await user.save();

      expect(user.password).not.toBe(originalHash);
      expect(user.password).toMatch(/^\$2[ayb]\$.{56}$/);
    });
  });

  describe('Instance Methods', () => {
    let user;

    beforeEach(async () => {
      user = await global.testUtils.createTestUser();
    });

    describe('comparePassword', () => {
      it('should return true for correct password', async () => {
        const isMatch = await user.comparePassword('TestPassword123!');
        expect(isMatch).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const isMatch = await user.comparePassword('WrongPassword123!');
        expect(isMatch).toBe(false);
      });

      it('should handle empty password', async () => {
        const isMatch = await user.comparePassword('');
        expect(isMatch).toBe(false);
      });

      it('should handle null password', async () => {
        const isMatch = await user.comparePassword(null);
        expect(isMatch).toBe(false);
      });
    });

    describe('toJSON', () => {
      it('should exclude password from JSON output', () => {
        const json = user.toJSON();
        
        expect(json).toHaveProperty('id');
        expect(json).toHaveProperty('username');
        expect(json).toHaveProperty('email');
        expect(json).toHaveProperty('role');
        expect(json).not.toHaveProperty('password');
        expect(json).not.toHaveProperty('__v');
      });

      it('should include virtual id field', () => {
        const json = user.toJSON();
        
        expect(json.id).toBe(user._id.toString());
      });
    });
  });

  describe('Google OAuth Fields', () => {
    it('should save user with Google OAuth data', async () => {
      const userData = {
        username: 'googleuser',
        email: 'google@example.com',
        googleId: '1234567890',
        avatar: 'https://example.com/avatar.jpg',
        provider: 'google'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.googleId).toBe(userData.googleId);
      expect(savedUser.avatar).toBe(userData.avatar);
      expect(savedUser.provider).toBe(userData.provider);
      expect(savedUser.password).toBeUndefined(); // No password for OAuth users
    });

    it('should allow OAuth user without password', async () => {
      const userData = {
        username: 'oauthuser',
        email: 'oauth@example.com',
        googleId: '1234567890',
        provider: 'google'
      };

      const user = new User(userData);
      await expect(user.save()).resolves.toBeTruthy();
    });
  });

  describe('User Roles', () => {
    it('should default to user role', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const user = new User(userData);
      await user.save();

      expect(user.role).toBe('user');
    });

    it('should allow admin role', async () => {
      const userData = {
        username: 'adminuser',
        email: 'admin@example.com',
        password: 'AdminPassword123!',
        role: 'admin'
      };

      const user = new User(userData);
      await user.save();

      expect(user.role).toBe('admin');
    });

    it('should reject invalid role', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
        role: 'invalid-role'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow(/role.*enum/i);
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt on creation', async () => {
      const user = await global.testUtils.createTestUser();

      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(user.updatedAt.getTime());
    });

    it('should update updatedAt on modification', async () => {
      const user = await global.testUtils.createTestUser();
      const originalUpdatedAt = user.updatedAt;

      // Wait a bit to ensure timestamp difference
      await global.testUtils.wait(10);

      user.username = 'updatedusername';
      await user.save();

      expect(user.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Indexing', () => {
    it('should have email index', async () => {
      const indexes = await User.collection.getIndexes();
      const emailIndex = Object.keys(indexes).find(key => key.includes('email'));
      expect(emailIndex).toBeTruthy();
    });

    it('should have username index', async () => {
      const indexes = await User.collection.getIndexes();
      const usernameIndex = Object.keys(indexes).find(key => key.includes('username'));
      expect(usernameIndex).toBeTruthy();
    });
  });

  describe('Static Methods', () => {
    describe('findByEmail', () => {
      it('should find user by email', async () => {
        const testUser = await global.testUtils.createTestUser();
        
        const foundUser = await User.findOne({ email: 'test@example.com' });
        
        expect(foundUser).toBeTruthy();
        expect(foundUser._id.toString()).toBe(testUser._id.toString());
      });

      it('should return null for non-existent email', async () => {
        const foundUser = await User.findOne({ email: 'nonexistent@example.com' });
        expect(foundUser).toBeNull();
      });
    });
  });
});
