import express from 'express';
import { ShellTool, Guardrail, FileTool } from '@open-jules/agent-core';

const app = express();
app.use(express.json());

const PORT = 3000;

// Mock Approval Callback (Always approves for MVP testing)
const autoApprover = async (cmd: string, reason: string) => {
  console.log(`[APPROVAL REQ] Command: "${cmd}" | Reason: ${reason}`);
  console.log(`[AUTO-APPROVER] Approving...`);
  return true;
};

const guardrail = new Guardrail(autoApprover);
const shellTool = new ShellTool(guardrail);
const fileTool = new FileTool();

app.post('/execute', async (req, res) => {
  const { command, cwd } = req.body;
  try {
    const result = await shellTool.execute(command, cwd);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/read-file', async (req, res) => {
  const { path } = req.body;
  try {
    const content = await fileTool.readFile(path);
    res.json({ content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`OpenJules Server running on http://localhost:${PORT}`);
});
