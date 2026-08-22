import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { UserResponseDto } from '../user/dto/user-response.dto';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const mockUserService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userService = module.get(UserService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('should register a new user and return token with user data', async () => {
      const createUserDto = { email: 'test@example.com', password: 'password123' };
      const createdUser = new UserResponseDto({
        id: 'user-uuid-1',
        email: 'test@example.com',
        credits: 1000,
        createdAt: new Date(),
      });

      userService.create.mockResolvedValue(createdUser);
      jwtService.sign.mockReturnValue('jwt-token-xyz');

      const result = await authService.register(createUserDto);

      expect(userService.create).toHaveBeenCalledWith(createUserDto);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-uuid-1',
        email: 'test@example.com',
      });
      expect(result.accessToken).toBe('jwt-token-xyz');
      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('login', () => {
    it('should authenticate valid user and return JWT token', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const hashedPassword = await bcrypt.hash('password123', 10);
      const user = {
        id: 'user-uuid-1',
        email: 'test@example.com',
        password: hashedPassword,
        credits: 1000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userService.findByEmail.mockResolvedValue(user as any);
      jwtService.sign.mockReturnValue('jwt-token-xyz');

      const result = await authService.login(loginDto);

      expect(result.accessToken).toBe('jwt-token-xyz');
      expect(result.user.id).toBe('user-uuid-1');
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'unknown@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 10);
      const user = {
        id: 'user-uuid-1',
        email: 'test@example.com',
        password: hashedPassword,
        credits: 1000,
        isActive: true,
      };

      userService.findByEmail.mockResolvedValue(user as any);

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
