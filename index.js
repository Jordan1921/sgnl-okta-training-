require('dotenv').config();
const axios = require('axios');

const OKTA_DOMAIN = process.env.OKTA_DOMAIN;
const OKTA_API_TOKEN = process.env.OKTA_API_TOKEN; //  Token from Okta starts with 00
const GROUP_NAME = process.env.GROUP_NAME || 'Remediation'; 

const TARGET_LOGINS = [
  'sgnl-training+1@sgnl.ai',
  'sgnl-training+2@sgnl.ai',
  'sgnl-training+3@sgnl.ai',
  'sgnl-training+4@sgnl.ai',
  'sgnl-training+5@sgnl.ai',
];

const http = axios.create({
  baseURL: `${OKTA_DOMAIN}/api/v1`,
  headers: {
    Authorization: `SSWS ${OKTA_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

async function findOrCreateGroupByName(name) {
  const resp = await http.get(`/groups`, { params: { q: name, limit: 200 } });
  let group = (resp.data || []).find(g => g.profile && g.profile.name === name);
  if (group) return group;
  const create = await http.post(`/groups`, { profile: { name } });
  return create.data;
}

async function getUserByLogin(login) {
  const resp = await http.get(`/users`, {
    params: { filter: `profile.login eq "${login}"` },
  });
  return (resp.data || [])[0] || null;
}

async function addUserToGroup(groupId, userId) {
  await http.put(`/groups/${groupId}/users/${userId}`);
}

async function removeUserFromGroup(groupId, userId) {
  await http.delete(`/groups/${groupId}/users/${userId}`);
}

async function main() {
  const mode = (process.argv[2] || '').toLowerCase(); // add or remove
  if (!['add', 'remove'].includes(mode)) {
    console.error('Usage: node index.js add|remove');
    process.exit(1);
  }

  const group = await findOrCreateGroupByName(GROUP_NAME);
  const groupId = group.id;

  const users = await Promise.all(TARGET_LOGINS.map(async (login) => {
    const u = await getUserByLogin(login);
    if (!u) console.warn(`WARN: user not found: ${login}`);
    return u;
  }));

  for (const u of users.filter(Boolean)) {
    try {
      if (mode === 'add') {
        await addUserToGroup(groupId, u.id);
        console.log(`ADDED ${u.profile.login} -> ${GROUP_NAME}`);
      } else {
        await removeUserFromGroup(groupId, u.id);
        console.log(`REMOVED ${u.profile.login} <- ${GROUP_NAME}`);
      }
    } catch (e) {
      console.error(`ERROR ${u?.profile?.login}: ${e.response?.status} ${e.response?.data?.errorSummary || e.message}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
