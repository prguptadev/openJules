import * as fs from 'fs/promises';
import * as path from 'path';

export class FileTool {
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }
}
