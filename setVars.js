import fetch from "node-fetch";

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT = process.env.RAILWAY_PROJECT || "lopesul-wifi";
const ENVIRONMENT = process.env.RAILWAY_ENVIRONMENT || "production";
const SERVICE = process.env.RAILWAY_SERVICE || "lopesul-dashboard";

const vars = {
  RELAY_URL: process.env.RELAY_URL,
  MIKROTIK_HOST: process.env.MIKROTIK_HOST,
  MIKROTIK_USER: process.env.MIKROTIK_USER,
  MIKROTIK_PASS: process.env.MIKROTIK_PASS,
};

for (const [k, v] of Object.entries(vars)) {
  if (!v) {
    throw new Error(`Variável ${k} ausente. Defina no ambiente/.env antes de rodar setVars.js.`);
  }
}

async function setVariable(key, value) {
  const query = `
    mutation UpsertVariable($input: VariableUpsertInput!) {
      variableUpsert(input: $input) {
        id
        key
        value
      }
    }
  `;

  const body = {
    query,
    variables: {
      input: {
        projectId: PROJECT,
        environmentName: ENVIRONMENT,
        serviceName: SERVICE,
        key,
        value,
      },
    },
  };

  try {
    const response = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.errors) {
      console.error(`❌ Erro ao setar ${key}:`, data.errors);
    } else {
      console.log(`✅ ${key} definido com sucesso!`);
    }
  } catch (err) {
    console.error(`💥 Falha geral ao definir ${key}:`, err.message);
  }
}

async function run() {
  for (const [key, value] of Object.entries(vars)) {
    console.log(`🔧 Setando ${key}=${value}`);
    await setVariable(key, value);
  }
}

run();
