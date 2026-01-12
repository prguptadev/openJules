"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const agent_core_1 = require("@open-jules/agent-core");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3000;
// Mock Approval Callback (Always approves for MVP testing)
const autoApprover = async (cmd, reason) => {
    console.log(`[APPROVAL REQ] Command: "${cmd}" | Reason: ${reason}`);
    console.log(`[AUTO-APPROVER] Approving...`);
    return true;
};
const guardrail = new agent_core_1.Guardrail(autoApprover);
const shellTool = new agent_core_1.ShellTool(guardrail);
const fileTool = new agent_core_1.FileTool();
app.post('/execute', async (req, res) => {
    const { command, cwd } = req.body;
    try {
        const result = await shellTool.execute(command, cwd);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/read-file', async (req, res) => {
    const { path } = req.body;
    try {
        const content = await fileTool.readFile(path);
        res.json({ content });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(PORT, () => {
    console.log(`OpenJules Server running on http://localhost:${PORT}`);
});
