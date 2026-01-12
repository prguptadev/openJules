import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.openjules');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

export interface AppSettings {
  activeModel: string;
  enabledSkills: {
    git: boolean;
    terminal: boolean;
    filesystem: boolean;
  };
  mcpServers: Record<string, any>;
}

const DEFAULT_SETTINGS: AppSettings = {
  activeModel: 'gemini-2.0-flash',
  enabledSkills: {
    git: true,
    terminal: true,
    filesystem: true
  },
  mcpServers: {}
};

export function loadSettings(): AppSettings {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    } catch (e) {
      console.error("Failed to read settings file", e);
    }
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<AppSettings>) {
  const current = loadSettings();
  const updated = { ...current, ...settings };
  
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
