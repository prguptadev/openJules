import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.openjules');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

export function saveApiKey(apiKey: string) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({ apiKey }), 'utf8');
}

export function loadApiKey(): string | null {
  // 1. Check Env
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  // 2. Check OpenJules Config
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      if (data.apiKey) return data.apiKey;
    } catch (e) {
      console.error("Failed to read credentials file");
    }
  }
  
  return null;
}
