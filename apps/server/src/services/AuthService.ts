import prisma from './PrismaService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-me';

export const authService = {
  async register(email: string, password: string, name?: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=random`,
      },
    });

    return this.generateToken(user);
  },

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    return this.generateToken(user);
  },

  generateToken(user: any) {
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return { user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }, token };
  },

  async verifyToken(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return decoded;
    } catch (e) {
      return null;
    }
  }
};
