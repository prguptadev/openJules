import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import path from 'path';

// Ensure env vars are loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || "file:./dev.db"
});

export default prisma;
