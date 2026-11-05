"use server";
import { asService, asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { issueToken } from "@/lib/auth/tokens";
import { link, sendMail } from "@/lib/mail";
import { ACTIONS, RESOURCES } from "@/lib/rules/permissions";

export async function inviteMember(f: FormData) {
  const ctx = await requireCtx(); const email = str(f, "email").toLowerCase(); const roleId = uuid(f, "role_id");
  const branches = f.getAll("branch_ids").map(String).filter((b) => /^[0-9a-f-]{36}$/i.test(b));
  return run("/people", "/people", `Invitation sent to ${email}.`, async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Enter a valid email address.");
    const inv = await asUser(ctx.user.id, async (db) => {
      const plan = await db.one<{ max_users: number | null }>("select max_users from app.current_plan($1)", [ctx.companyId]);
      if (plan?.max_users !== null && plan?.max_users !== undefined) {
        const used = Number((await db.one<{ n: string }>("select (select count(*) from memberships where company_id=$1 and status in ('active','invited')) + (select count(*) from invitations where company_id=$1 and status='pending') n", [ctx.companyId]))!.n);
        if (used >= plan.max_users) fail(`Your plan includes ${plan.max_users} users and you've reached it. Upgrade the plan to invite more people.`);
      }
      await db.q("update invitations set status = 'expired' where company_id = $1 and email = $2 and status = 'pending' and expires_at < now()", [ctx.companyId, email]);
      return (await db.one<{ id: string }>("insert into invitations(company_id, email, role_id, branch_ids, invited_by) values ($1,$2,$3,$4,$5) returning id", [ctx.companyId, email, roleId, branches, ctx.user.id]))!.id;
    });
    const token = await issueToken("invitation", null, "7 days", { invitation_id: inv, company_id: ctx.companyId });
    await sendMail(email, `You're invited to ${ctx.company.name}`, `${ctx.user.displayName || ctx.user.email} invited you to join ${ctx.company.name}.\n\nAccept the invitation: ${link(`/invite/${token}`)}\n\nThis link works for 7 days.`);
  });
}

export async function revokeInvitation(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/people", "/people", "Invitation withdrawn.", async () => {
    await asUser(ctx.user.id, (db) => db.q("update invitations set status = 'revoked' where id = $1 and status = 'pending'", [id]));
    await asService((db) => db.q("update identity.tokens set used_at = now() where kind = 'invitation' and payload->>'invitation_id' = $1 and used_at is null", [id]));
  });
}

export async function updateMember(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const roleId = uuid(f, "role_id");
  const branches = f.getAll("branch_ids").map(String).filter((b) => /^[0-9a-f-]{36}$/i.test(b));
  const limit = str(f, "limit"); const status = str(f, "status") === "suspended" ? "suspended" : "active";
  return run("/people", "/people", "Access updated.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const m = await db.one<{ user_id: string }>("select user_id from memberships where id = $1 and company_id = $2", [id, ctx.companyId]);
      if (!m) fail("That person wasn't found.");
      if (m!.user_id === ctx.user.id && (status === "suspended")) fail("You can't suspend your own access.");
      if (m!.user_id === ctx.user.id) { const cur = await db.one("select 1 from membership_roles where membership_id = $1 and role_id = $2", [id, roleId]); if (!cur) fail("You can't change your own role. Ask another administrator."); }
      let lim: number | null = null;
      if (limit !== "") { const n = Number(limit); if (!Number.isFinite(n) || n < 0) fail("Approval limit must be a positive amount."); lim = Math.round(n * 100); }
      await db.q("update memberships set branch_ids = $2, approval_limit_minor = $3, status = $4 where id = $1", [id, branches, lim, status]);
      await db.q("delete from membership_roles where membership_id = $1 and company_id = $2", [id, ctx.companyId]);
      await db.q("insert into membership_roles(membership_id, role_id, company_id) values ($1,$2,$3)", [id, roleId, ctx.companyId]);
    });
  });
}

export async function saveRole(f: FormData) {
  const ctx = await requireCtx(); const id = str(f, "id"); const name = str(f, "name");
  return run("/people/roles", "/people/roles", `Role “${name}” saved.`, async () => {
    if (name.length < 2) fail("Give the role a name.");
    const grants = RESOURCES.map((r) => ({ resource: r, actions: ACTIONS.filter((a) => f.get(`g:${r}:${a}`) === "on"), ...(f.get(`own:${r}`) === "on" ? { ownOnly: true } : {}) }))
      .filter((g) => g.actions.length > 0);
    if (grants.length === 0) fail("Pick at least one permission.");
    await asUser(ctx.user.id, async (db) => {
      if (id) {
        const cur = await db.one<{ name: string }>("select name from roles where id = $1 and company_id = $2", [id, ctx.companyId]);
        if (!cur) fail("That role wasn't found.");
        if (cur!.name === "Company owner") fail("The owner role always has full access and can't be edited.");
        await db.q("update roles set name = $3, grants = $4 where id = $1 and company_id = $2", [id, ctx.companyId, name, JSON.stringify(grants)]);
      } else await db.q("insert into roles(company_id, name, grants) values ($1,$2,$3)", [ctx.companyId, name, JSON.stringify(grants)]);
    });
  });
}
