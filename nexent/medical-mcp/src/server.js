import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registerLiteratureTools } from './literature.js';
import { registerMedicalTools } from './medical.js';
import { registerDocumentTools } from './documents.js';

try { process.loadEnvFile(); } catch {}

const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || '0.0.0.0';
const MCP_PATH = process.env.MCP_PATH || '/mcp';
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const app = express();
const transports = {};

app.use(express.json({ limit: '20mb' }));

function auth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  if (req.get('authorization') !== `Bearer ${AUTH_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function createServer() {
  const server = new McpServer({ name: 'fundus-medical-toolkit', version: '0.1.0' });
  registerMedicalTools(server);
  registerDocumentTools(server);
  registerLiteratureTools(server);
  return server;
}

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }));

app.post(MCP_PATH, auth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  try {
    let transport;
    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { transports[id] = transport; }
      });
      transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
      await createServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid MCP session' }, id: null });
    }
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: error.message }, id: null });
  }
});

app.get(MCP_PATH, auth, async (req, res) => {
  const transport = transports[req.headers['mcp-session-id']];
  if (!transport) return res.status(400).send('Invalid or missing session ID');
  await transport.handleRequest(req, res);
});

app.delete(MCP_PATH, auth, async (req, res) => {
  const transport = transports[req.headers['mcp-session-id']];
  if (!transport) return res.status(400).send('Invalid or missing session ID');
  await transport.handleRequest(req, res);
});

app.listen(PORT, HOST, () => console.log(`fundus-medical-toolkit listening on http://${HOST}:${PORT}${MCP_PATH}`));
