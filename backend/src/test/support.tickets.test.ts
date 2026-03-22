import request from "supertest";
import { app } from "../app";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("support tickets", () => {
  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("public users can submit and list their support tickets", async () => {
    const createRes = await request(app).post("/api/support/tickets").send({
      email: "test_support_public@co.za",
      name: "Demo Requester",
      deviceNumber: "LAP-1001",
      issueType: "SOFTWARE",
      message: "The portal keeps failing when I try to upload a document.",
    });

    expect(createRes.status).toBe(201);
    expect(String(createRes.body?.ticket?.requesterEmail ?? "")).toBe("test_support_public@co.za");

    const listRes = await request(app).get("/api/support/tickets").query({ email: "test_support_public@co.za" });
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body?.value)).toBe(true);
    expect(listRes.body.value.some((ticket: { requesterEmail?: string }) => ticket.requesterEmail === "test_support_public@co.za")).toBe(true);
  });

  test("super admin can update ticket status and note", async () => {
    const superAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "SUPER");
    const superToken = signJwt(superAdmin);

    const createRes = await request(app).post("/api/support/tickets").send({
      email: "test_support_admin@co.za",
      issueType: "DEVICE",
      message: "My laptop number is not linked correctly in the system.",
    });

    const ticketId = String(createRes.body?.ticket?.id ?? "");
    expect(ticketId).toBeTruthy();

    const updateRes = await request(app)
      .patch(`/api/support/admin/tickets/${ticketId}`)
      .set(auth(superToken))
      .send({
        status: "IN_PROGRESS",
        adminNote: "Assigned to the infrastructure queue.",
      });

    expect(updateRes.status).toBe(200);
    expect(String(updateRes.body?.ticket?.status ?? "")).toBe("IN_PROGRESS");
    expect(String(updateRes.body?.ticket?.adminNote ?? "")).toBe("Assigned to the infrastructure queue.");
  });
});
