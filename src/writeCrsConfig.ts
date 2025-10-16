import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SafetyStrategy } from "./runCodexExec";
import { checkOutput } from "./checkOutput";

const MODEL_PROVIDER = "crs";

export async function writeCrsConfig(
  codexHome: string,
  baseUrl: string,
  model: string,
  reasoningEffort: string,
  safetyStrategy: SafetyStrategy
): Promise<void> {
  // Write config.toml
  await writeConfigToml(codexHome, baseUrl, model, reasoningEffort, safetyStrategy);
  
  // Write auth.json
  await writeAuthJson(codexHome, safetyStrategy);
}

async function writeConfigToml(
  codexHome: string,
  baseUrl: string,
  model: string,
  reasoningEffort: string,
  safetyStrategy: SafetyStrategy
): Promise<void> {
  const configPath = path.join(codexHome, "config.toml");

  let existing = "";
  try {
    existing = await fs.readFile(configPath, "utf8");
  } catch {
    existing = "";
  }

  const header = `# Added by codex-action for CRS support.
model_provider = "${MODEL_PROVIDER}"
model = "${model}"
model_reasoning_effort = "${reasoningEffort}"
disable_response_storage = true
preferred_auth_method = "apikey"


`;
  const table = `

# Added by codex-action for CRS support.
[model_providers.${MODEL_PROVIDER}]
name = "${MODEL_PROVIDER}"
base_url = "${baseUrl}"
wire_api = "responses"
requires_openai_auth = true
env_key = "CRS_OAI_KEY"
`;

  // Prepend model_provider at the very top.
  let output = `${header}${existing}${table}`;

  if (safetyStrategy === "unprivileged-user") {
    // We know we have already created the CODEX_HOME directory, but it is owned
    // by another user, so we need to use sudo to write the file.
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-config"));
    try {
      const tempConfigPath = path.join(tempDir, "config.toml");
      await fs.writeFile(tempConfigPath, output, "utf8");
      await checkOutput(["sudo", "mv", tempConfigPath, configPath]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } else {
    await fs.mkdir(codexHome, { recursive: true });
    await fs.writeFile(configPath, output, "utf8");
  }
}

async function writeAuthJson(
  codexHome: string,
  safetyStrategy: SafetyStrategy
): Promise<void> {
  const authPath = path.join(codexHome, "auth.json");

  // Create auth.json with OPENAI_API_KEY set to null
  const authContent = {
    OPENAI_API_KEY: null,
  };

  const output = JSON.stringify(authContent, null, 2);

  if (safetyStrategy === "unprivileged-user") {
    // We know we have already created the CODEX_HOME directory, but it is owned
    // by another user, so we need to use sudo to write the file.
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-auth"));
    try {
      const tempAuthPath = path.join(tempDir, "auth.json");
      await fs.writeFile(tempAuthPath, output, "utf8");
      await checkOutput(["sudo", "mv", tempAuthPath, authPath]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } else {
    await fs.mkdir(codexHome, { recursive: true });
    await fs.writeFile(authPath, output, "utf8");
  }
}
