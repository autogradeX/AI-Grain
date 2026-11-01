import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  refreshCookie,
  register,
  tokenFromMail,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

const login = (email: string, password: string) =>
  t.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });

const refresh = (cookie: string) =>
  t.app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    cookies: { ag_rt: cookie },
  });

describe("registration and sessions", () => {
  it("creates an organisation with an admin and a working session", async () => {
    const { token } = await register(t);
    const me = await t.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: bearer(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: "admin@farm.test",
      role: "admin",
      emailVerified: false,
      org: { name: "Farm" },
    });
    expect(t.mailer.sent[0]?.subject).toMatch(/Confirm/);
  });

  it("rejects a duplicate email in any letter case and weak passwords", async () => {
    await register(t);
    const dup = await t.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        orgName: "X",
        name: "X",
        email: "ADMIN@farm.test",
        password: "another long password",
      },
    });
    expect(dup.statusCode).toBe(409);
    const weak = await t.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        orgName: "X",
        name: "X",
        email: "new@farm.test",
        password: "short",
      },
    });
    expect(weak.statusCode).toBe(400);
  });

  it("refuses requests without a valid token", async () => {
    const none = await t.app.inject({ method: "GET", url: "/api/samples" });
    expect(none.statusCode).toBe(401);
    const bad = await t.app.inject({
      method: "GET",
      url: "/api/samples",
      headers: bearer("nope"),
    });
    expect(bad.json()).toMatchObject({ code: "token_expired" });
  });

  it("rotates refresh tokens and revokes the family when an old one is reused", async () => {
    const { cookie } = await register(t);
    const first = await refresh(cookie);
    expect(first.statusCode).toBe(200);
    const next = refreshCookie(first);
    expect(next).not.toBe(cookie);

    // Within the grace window the old token still works: the response that
    // carried the new cookie may have been lost (dropped signal, page change).
    const retry = await refresh(cookie);
    expect(retry.statusCode).toBe(200);
    expect(refreshCookie(retry)).not.toBe(next);

    // Outside it, reuse signals theft: the whole family is revoked.
    await t.ctx.db.execute(
      "update refresh_tokens set rotated_at = now() - interval '5 minutes' where rotated_at is not null",
    );
    expect((await refresh(cookie)).json()).toMatchObject({
      code: "refresh_invalid",
    });
    expect((await refresh(next)).statusCode).toBe(401);
  });

  it("logs out by revoking the session", async () => {
    const { cookie } = await register(t);
    const out = await t.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { ag_rt: cookie },
    });
    expect(out.statusCode).toBe(200);
    expect((await refresh(cookie)).statusCode).toBe(401);
  });
});

describe("sign-in", () => {
  it("signs in with the right password in any email case", async () => {
    await register(t);
    const res = await login("Admin@Farm.test", "correct horse battery");
    expect(res.statusCode).toBe(200);
    expect(res.json<{ accessToken: string }>().accessToken).toBeTruthy();
  });

  it("gives the same error for an unknown email and a wrong password", async () => {
    await register(t);
    const unknown = await login("nobody@farm.test", "whatever password");
    const wrong = await login("admin@farm.test", "wrong password!!");
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it("locks the account after ten failed attempts", async () => {
    await register(t);
    for (let i = 0; i < 10; i++)
      await login("admin@farm.test", "wrong password!!");
    const locked = await login("admin@farm.test", "correct horse battery");
    expect(locked.statusCode).toBe(423);
  });
});

describe("password and email flows", () => {
  it("resets a password by emailed link and signs out other sessions", async () => {
    const { cookie } = await register(t);
    const forgot = await t.app.inject({
      method: "POST",
      url: "/api/auth/password/forgot",
      payload: { email: "admin@farm.test" },
    });
    expect(forgot.statusCode).toBe(200);
    const token = tokenFromMail(t.mailer, "admin@farm.test");
    const reset = await t.app.inject({
      method: "POST",
      url: "/api/auth/password/reset",
      payload: { token, password: "a brand new password" },
    });
    expect(reset.statusCode).toBe(200);
    expect(
      (await login("admin@farm.test", "correct horse battery")).statusCode,
    ).toBe(401);
    expect(
      (await login("admin@farm.test", "a brand new password")).statusCode,
    ).toBe(200);
    expect((await refresh(cookie)).statusCode).toBe(401);

    // The link works once.
    const again = await t.app.inject({
      method: "POST",
      url: "/api/auth/password/reset",
      payload: { token, password: "yet another password" },
    });
    expect(again.statusCode).toBe(400);
  });

  it("answers forgot-password the same way for unknown emails", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/password/forgot",
      payload: { email: "ghost@farm.test" },
    });
    expect(res.statusCode).toBe(200);
    expect(t.mailer.sent).toHaveLength(0);
  });

  it("asks to confirm the email only when the server can send email", async () => {
    const reg = await t.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        orgName: "No Mail",
        name: "Nia",
        email: "nia@nomail.test",
        password: "correct horse battery",
      },
    });
    expect(reg.json<{ user: { emailEnabled: boolean } }>().user).toMatchObject({
      emailVerified: false,
      emailEnabled: false,
    });

    // With verification required but no mail server, signing in still works.
    const strict = await createTestApp({ REQUIRE_EMAIL_VERIFICATION: "true" });
    const payload = {
      orgName: "Strict",
      name: "Sam",
      email: "sam@strict.test",
      password: "correct horse battery",
    };
    await strict.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload,
    });
    const login = await strict.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: payload.email, password: payload.password },
    });
    expect(login.statusCode).toBe(200);
    await strict.close();

    // With a mail server, it is asked for.
    const mail = await createTestApp({ SMTP_URL: "smtp://localhost:2525" });
    const withMail = await mail.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload,
    });
    expect(
      withMail.json<{ user: { emailEnabled: boolean } }>().user.emailEnabled,
    ).toBe(true);
    await mail.close();
    const strictMail = await createTestApp({
      SMTP_URL: "smtp://localhost:2525",
      REQUIRE_EMAIL_VERIFICATION: "true",
    });
    await strictMail.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload,
    });
    const blocked = await strictMail.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: payload.email, password: payload.password },
    });
    expect(blocked.statusCode).toBe(403);
    await strictMail.close();
  });

  it("verifies an email address", async () => {
    const { token: access } = await register(t);
    const token = tokenFromMail(t.mailer, "admin@farm.test");
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/email/verify",
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    const me = await t.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: bearer(access),
    });
    expect(me.json()).toMatchObject({ emailVerified: true });
  });

  it("changes the password with the current one", async () => {
    const { token } = await register(t);
    const wrong = await t.app.inject({
      method: "POST",
      url: "/api/auth/password/change",
      headers: bearer(token),
      payload: {
        currentPassword: "nope nope nope",
        newPassword: "fresh password 123",
      },
    });
    expect(wrong.statusCode).toBe(400);
    const ok = await t.app.inject({
      method: "POST",
      url: "/api/auth/password/change",
      headers: bearer(token),
      payload: {
        currentPassword: "correct horse battery",
        newPassword: "fresh password 123",
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (await login("admin@farm.test", "fresh password 123")).statusCode,
    ).toBe(200);
  });
});

describe("invites, roles and organisation isolation", () => {
  it("invites a viewer who can read but not write", async () => {
    const { token: admin } = await register(t);
    const invite = await t.app.inject({
      method: "POST",
      url: "/api/users/invites",
      headers: bearer(admin),
      payload: { email: "vic@farm.test", role: "viewer" },
    });
    expect(invite.statusCode).toBe(201);
    const inviteToken = tokenFromMail(t.mailer, "vic@farm.test");

    const peek = await t.app.inject({
      method: "GET",
      url: `/api/auth/invite/${inviteToken}`,
    });
    expect(peek.json()).toMatchObject({
      email: "vic@farm.test",
      role: "viewer",
      orgName: "Farm",
    });

    const accept = await t.app.inject({
      method: "POST",
      url: "/api/auth/invite/accept",
      payload: {
        token: inviteToken,
        name: "Vic Viewer",
        password: "viewer password 1",
      },
    });
    expect(accept.statusCode).toBe(201);
    const viewer = accept.json<{ accessToken: string }>().accessToken;

    expect(
      (
        await t.app.inject({
          method: "GET",
          url: "/api/samples",
          headers: bearer(viewer),
        })
      ).statusCode,
    ).toBe(200);
    const create = await t.app.inject({
      method: "POST",
      url: "/api/samples",
      headers: bearer(viewer),
      payload: { crop: "wheat" },
    });
    expect(create.statusCode).toBe(403);
    const users = await t.app.inject({
      method: "GET",
      url: "/api/users",
      headers: bearer(viewer),
    });
    expect(users.statusCode).toBe(403);

    // An invite can't be accepted twice.
    const twice = await t.app.inject({
      method: "POST",
      url: "/api/auth/invite/accept",
      payload: {
        token: inviteToken,
        name: "Again",
        password: "viewer password 2",
      },
    });
    expect(twice.statusCode).toBe(400);
  });

  it("keeps the last admin and blocks deactivated users at once", async () => {
    const { token: admin, userId } = await register(t);
    const demote = await t.app.inject({
      method: "PATCH",
      url: `/api/users/${userId}`,
      headers: bearer(admin),
      payload: { role: "grader" },
    });
    expect(demote.statusCode).toBe(400);

    await t.app.inject({
      method: "POST",
      url: "/api/users/invites",
      headers: bearer(admin),
      payload: { email: "gil@farm.test", role: "grader" },
    });
    const accept = await t.app.inject({
      method: "POST",
      url: "/api/auth/invite/accept",
      payload: {
        token: tokenFromMail(t.mailer, "gil@farm.test"),
        name: "Gil",
        password: "grader password 1",
      },
    });
    const { accessToken: grader, user } = accept.json<{
      accessToken: string;
      user: { id: string };
    }>();
    await t.app.inject({
      method: "PATCH",
      url: `/api/users/${user.id}`,
      headers: bearer(admin),
      payload: { active: false },
    });
    const blocked = await t.app.inject({
      method: "GET",
      url: "/api/samples",
      headers: bearer(grader),
    });
    expect(blocked.statusCode).toBe(401);
  });

  it("hides one organisation's samples from another", async () => {
    const a = await register(t, "a@one.test", "One");
    const b = await register(t, "b@two.test", "Two");
    const created = await t.app.inject({
      method: "POST",
      url: "/api/samples",
      headers: bearer(a.token),
      payload: { crop: "wheat" },
    });
    const { id } = created.json<{ id: string }>();
    const peek = await t.app.inject({
      method: "GET",
      url: `/api/samples/${id}`,
      headers: bearer(b.token),
    });
    expect(peek.statusCode).toBe(404);
    const list = await t.app.inject({
      method: "GET",
      url: "/api/samples",
      headers: bearer(b.token),
    });
    expect(list.json()).toMatchObject({ total: 0 });
  });
});
