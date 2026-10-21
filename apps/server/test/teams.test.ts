import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  csrfHeader,
  milestoneDates,
  type LoggedInAgent,
  type TestContext,
} from './helpers';

interface RegisteredAgent extends LoggedInAgent {
  password: string;
}

async function register(
  app: TestContext['app'],
  suffix: string,
  options: { inviteCode?: string } = {},
): Promise<RegisteredAgent> {
  const agent = request.agent(app);
  const password = 'Registration-Password!2026';
  const response = await agent
    .post('/api/auth/register')
    .send({
      name: `User ${suffix}`,
      email: `user.${suffix}@example.com`,
      password,
      inviteCode: options.inviteCode ?? '',
    })
    .expect(201);
  return {
    agent,
    csrf: response.body.csrfToken as string,
    user: response.body.user as LoggedInAgent['user'],
    password,
  };
}

function createTeam(actor: LoggedInAgent, name: string) {
  return actor.agent.post('/api/teams').set(csrfHeader(actor.csrf)).send({ name });
}

describe('registration, teams, and tenant isolation', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it('registers accounts, creates teams, and prevents cross-team access', async () => {
    const owner = await register(ctx.app, 'owner');
    const member = await register(ctx.app, 'member');
    const outsider = await register(ctx.app, 'outsider');

    const created = await createTeam(owner, 'Platform Team').expect(201);
    const team = created.body.team;
    expect(team.role).toBe('owner');
    expect(team.joinCode).toHaveLength(10);
    expect(team.members).toHaveLength(1);

    await member.agent.get(`/api/teams/${team.id}`).expect(404);
    await outsider.agent.get(`/api/teams/${team.id}`).expect(404);

    const joined = await member.agent
      .post('/api/teams/join')
      .set(csrfHeader(member.csrf))
      .send({ code: team.joinCode.toLowerCase() })
      .expect(201);
    expect(joined.body.team.role).toBe('member');
    expect(joined.body.alreadyMember).toBe(false);

    const dates = milestoneDates();
    const projectResponse = await owner.agent
      .post('/api/projects')
      .set(csrfHeader(owner.csrf))
      .send({
        teamId: team.id,
        code: `TEAM-${Date.now()}`,
        name: 'Shared Delivery Map',
        client: 'Internal',
        kickoff: dates.kickoff,
        deadline: dates.deadline,
        scope: '',
      })
      .expect(201);
    const projectId = projectResponse.body.project.id as string;
    expect(projectResponse.body.project.teamId).toBe(team.id);

    const memberView = await member.agent.get(`/api/projects/${projectId}`).expect(200);
    expect(memberView.body.project.myRole).toBeNull();
    expect(memberView.body.project.permissions.createItem).toBe(false);
    await member.agent
      .post(`/api/projects/${projectId}/items`)
      .set(csrfHeader(member.csrf))
      .send({
        module: 'API',
        title: 'Cross-team write attempt',
        priority: 'medium',
        dueDate: dates.deadline,
        rule: '',
        coreRequired: false,
        businessRequired: false,
      })
      .expect(403);

    await outsider.agent.get(`/api/projects/${projectId}`).expect(404);
    const outsiderTeams = await outsider.agent.get('/api/teams').expect(200);
    expect(outsiderTeams.body.teams).toHaveLength(0);
    await outsider.agent
      .post('/api/projects')
      .set(csrfHeader(outsider.csrf))
      .send({
        teamId: team.id,
        code: `NOPE-${Date.now()}`,
        name: 'Unauthorized project',
        kickoff: dates.kickoff,
        deadline: dates.deadline,
        scope: '',
      })
      .expect(403);

    const outsideCandidates = await owner.agent
      .get(`/api/projects/${projectId}/member-candidates?q=outsider`)
      .expect(200);
    expect(outsideCandidates.body.users).toHaveLength(0);
    const teamCandidates = await owner.agent
      .get(`/api/projects/${projectId}/member-candidates?q=member`)
      .expect(200);
    expect(teamCandidates.body.users.some((entry: { email: string }) => entry.email === member.user.email)).toBe(true);

    await member.agent
      .post('/api/teams')
      .set(csrfHeader(member.csrf))
      .send({ name: 'Member Side Project' })
      .expect(201);
    const memberTeams = await member.agent.get('/api/teams').expect(200);
    expect(memberTeams.body.teams).toHaveLength(2);

    await member.agent
      .patch(`/api/teams/${team.id}`)
      .set(csrfHeader(member.csrf))
      .send({ name: 'Not allowed' })
      .expect(403);

    await owner.agent
      .post(`/api/projects/${projectId}/members`)
      .set(csrfHeader(owner.csrf))
      .send({ email: member.user.email, role: 'delivery' })
      .expect(201);

    const removed = await owner.agent
      .delete(`/api/teams/${team.id}/members/${member.user.id}`)
      .set(csrfHeader(owner.csrf))
      .expect(200);
    expect(removed.body.team.memberCount).toBe(1);

    await member.agent.get(`/api/projects/${projectId}`).expect(404);
    const projectMembers = ctx.db
      .prepare('SELECT COUNT(*) AS count FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(projectId, member.user.id) as { count: number };
    expect(Number(projectMembers.count)).toBe(0);

    await owner.agent
      .delete(`/api/teams/${team.id}/members/${owner.user.id}`)
      .set(csrfHeader(owner.csrf))
      .expect(409);
  });

  it('supports invite codes, direct invitations, and code rotation', async () => {
    const owner = await register(ctx.app, 'invite-owner');
    const invited = await register(ctx.app, 'invited');
    const direct = await register(ctx.app, 'direct');
    const late = await register(ctx.app, 'late');
    const created = await createTeam(owner, 'Invite Team').expect(201);
    const team = created.body.team;
    const teamId = team.id as string;
    const joinCode = team.joinCode as string;

    await invited.agent
      .post('/api/teams/join')
      .set(csrfHeader(invited.csrf))
      .send({ code: joinCode })
      .expect(201);

    const withCode = await register(ctx.app, 'code-registration', { inviteCode: joinCode });
    const withCodeTeams = await withCode.agent.get('/api/teams').expect(200);
    expect(withCodeTeams.body.teams).toHaveLength(1);
    expect(withCodeTeams.body.teams[0].role).toBe('member');

    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate',
        email: withCode.user.email,
        password: 'Registration-Password!2026',
      })
      .expect(409);

    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Bad Code',
        email: `bad.code.${Date.now()}@example.com`,
        password: 'Registration-Password!2026',
        inviteCode: 'NOPE1234',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body.error.fields.inviteCode).toBeTruthy();
      });

    await owner.agent
      .post(`/api/teams/${teamId}/members`)
      .set(csrfHeader(owner.csrf))
      .send({ email: direct.user.email })
      .expect(201);
    await owner.agent
      .post(`/api/teams/${teamId}/members`)
      .set(csrfHeader(owner.csrf))
      .send({ email: direct.user.email })
      .expect(409);

    await invited.agent
      .post(`/api/teams/${teamId}/join-code/rotate`)
      .set(csrfHeader(invited.csrf))
      .expect(403);

    const rotated = await owner.agent
      .post(`/api/teams/${teamId}/join-code/rotate`)
      .set(csrfHeader(owner.csrf))
      .expect(200);
    const newCode = rotated.body.team.joinCode as string;
    expect(newCode).not.toBe(joinCode);

    await late.agent
      .post('/api/teams/join')
      .set(csrfHeader(late.csrf))
      .send({ code: joinCode })
      .expect(404);
    await late.agent
      .post('/api/teams/join')
      .set(csrfHeader(late.csrf))
      .send({ code: newCode })
      .expect(201);

    await owner.agent
      .patch(`/api/teams/${teamId}`)
      .set(csrfHeader(owner.csrf))
      .send({ name: 'Renamed Invite Team' })
      .expect(200);
    const detail = await owner.agent.get(`/api/teams/${teamId}`).expect(200);
    expect(detail.body.team.name).toBe('Renamed Invite Team');
    expect(detail.body.team.memberCount).toBe(5);

    await late.agent
      .post(`/api/teams/${teamId}/leave`)
      .set(csrfHeader(late.csrf))
      .expect(204);
    const lateTeams = await late.agent.get('/api/teams').expect(200);
    expect(lateTeams.body.teams).toHaveLength(0);
  });
});
