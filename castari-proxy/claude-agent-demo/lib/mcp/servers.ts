import { createSdkMcpServer, tool, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export type McpServerMap = Record<string, McpServerConfig>;

export function buildMcpServers(): McpServerMap {
  const servers: McpServerMap = {};

  const echoTool = tool(
    'echo_upper',
    'Echo text back in uppercase form',
    { text: z.string().min(1) },
    async ({ text }) => ({
      content: [{ type: 'text', text: text.toUpperCase() }]
    })
  );

  const echoServer = createSdkMcpServer({
    name: 'sdk_echo',
    version: '1.0.0',
    tools: [echoTool]
  });

  servers.sdk_echo = {
    type: 'sdk',
    name: 'sdk_echo',
    instance: echoServer.instance
  };

  return servers;
}
