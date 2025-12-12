import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Create user
    const user = this.userRepository.create({
      email: createUserDto.email,
      password: hashedPassword,
      credits: 1000, // Free credits on signup
    });

    const savedUser = await this.userRepository.save(user);

    return new UserResponseDto({
      id: savedUser.id,
      email: savedUser.email,
      credits: savedUser.credits,
      createdAt: savedUser.createdAt,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async deductCredits(userId: string, amount: number): Promise<void> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.credits < amount) {
      throw new ConflictException('Insufficient credits');
    }

    user.credits -= amount;
    await this.userRepository.save(user);
  }

  async getCredits(userId: string): Promise<number> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.credits;
  }
}