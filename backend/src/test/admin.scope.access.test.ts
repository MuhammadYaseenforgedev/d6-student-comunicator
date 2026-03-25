import request from "supertest";
import { app } from "../app";
import { createUser, signJwt, cleanupTestUsers } from "./helpers";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("admin scope access control", () => {
  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("finance admins cannot access academic admin account tools", async () => {
    const financeAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "FINANCE");
    const financeToken = signJwt(financeAdmin);

    const res = await request(app).get("/api/users/admin/accounts").set(auth(financeToken));
    expect(res.status).toBe(403);
  });

  test("academic admins can access academic admin account tools", async () => {
    const academicAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const academicToken = signJwt(academicAdmin);

    const res = await request(app).get("/api/users/admin/accounts").set(auth(academicToken));
    expect(res.status).toBe(200);
  });

  test("super admins can access support admin tickets while other admins cannot", async () => {
    const financeAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "FINANCE");
    const academicAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const superAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "SUPER");

    await request(app).post("/api/support/tickets").send({
      email: "test_support_scope@co.za",
      issueType: "ACCOUNT_ACCESS",
      message: "Please help me log in to the portal.",
    });

    const financeRes = await request(app)
      .get("/api/support/admin/tickets")
      .set(auth(signJwt(financeAdmin)));
    const academicRes = await request(app)
      .get("/api/support/admin/tickets")
      .set(auth(signJwt(academicAdmin)));
    const superRes = await request(app)
      .get("/api/support/admin/tickets")
      .set(auth(signJwt(superAdmin)));

    expect(financeRes.status).toBe(403);
    expect(academicRes.status).toBe(403);
    expect(superRes.status).toBe(200);
    expect(Array.isArray(superRes.body?.value)).toBe(true);
  });
});
