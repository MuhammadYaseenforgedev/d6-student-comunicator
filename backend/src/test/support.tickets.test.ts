import request from "supertest";
import { app } from "../app";
import { env } from "../config/env";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("support tickets", () => {
  const originalFetch = global.fetch;
  const originalPulseSyncEnabled = env.PULSE_SYNC_ENABLED;
  const originalPulseTicketFormUrl = env.PULSE_TICKET_FORM_URL;
  const originalPulseSyncTimeoutMs = env.PULSE_SYNC_TIMEOUT_MS;

  beforeEach(() => {
    env.PULSE_SYNC_ENABLED = false;
    env.PULSE_TICKET_FORM_URL = originalPulseTicketFormUrl;
    env.PULSE_SYNC_TIMEOUT_MS = originalPulseSyncTimeoutMs;
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    env.PULSE_SYNC_ENABLED = originalPulseSyncEnabled;
    env.PULSE_TICKET_FORM_URL = originalPulseTicketFormUrl;
    env.PULSE_SYNC_TIMEOUT_MS = originalPulseSyncTimeoutMs;
    global.fetch = originalFetch;
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

  test("student can create an incorrect-details ticket and academic admin can filter it", async () => {
    const academicAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const student = await createUser("STUDENT");
    const academicToken = signJwt(academicAdmin);
    const studentToken = signJwt(student);

    const createRes = await request(app)
      .post("/api/support/tickets/incorrect-details")
      .set(auth(studentToken))
      .send({
        subject: "Surname is incorrect",
        description: "My surname is misspelled in the imported learner details and needs correction.",
      });

    expect(createRes.status).toBe(201);
    expect(String(createRes.body?.ticket?.category ?? "")).toBe("INCORRECT_DETAILS");
    expect(String(createRes.body?.ticket?.targetUserId ?? "")).toBe(student.id);

    const listRes = await request(app)
      .get("/api/support/admin/tickets")
      .set(auth(academicToken))
      .query({ category: "INCORRECT_DETAILS" });

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body?.value)).toBe(true);
    expect(
      listRes.body.value.some(
        (ticket: { category?: string; targetUserId?: string; subject?: string }) =>
          ticket.category === "INCORRECT_DETAILS" &&
          ticket.targetUserId === student.id &&
          ticket.subject === "Surname is incorrect"
      )
    ).toBe(true);
  });

  test("student cannot create an incorrect-details ticket for another learner", async () => {
    const student = await createUser("STUDENT");
    const otherStudent = await createUser("STUDENT");
    const studentToken = signJwt(student);

    const createRes = await request(app)
      .post("/api/support/tickets/incorrect-details")
      .set(auth(studentToken))
      .send({
        subject: "Wrong ID number",
        description: "The ID number on my learner profile does not match the official record.",
        targetUserId: otherStudent.id,
      });

    expect(createRes.status).toBe(403);
    expect(String(createRes.body?.error?.message ?? "")).toMatch(/only create incorrect-details tickets for themselves/i);
  });

  test("configured Pulse sync posts the ticket through the Pulse form", async () => {
    env.PULSE_SYNC_ENABLED = true;
    env.PULSE_TICKET_FORM_URL = "https://pulse.example/ticket.php";
    env.PULSE_SYNC_TIMEOUT_MS = 2000;

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          `
            <html>
              <form method="post">
                <input type="hidden" name="csrf_token" value="csrf-123">
                <select id="laptop_number" name="laptop_number">
                  <option value="">-- Select Laptop --</option>
                  <option value="FAL-01">FAL-01</option>
                </select>
              </form>
            </html>
          `,
          {
            status: 200,
            headers: { "set-cookie": "PHPSESSID=test-cookie; Path=/; HttpOnly" },
          }
        )
      )
      .mockResolvedValueOnce(new Response("<html><body>ok</body></html>", { status: 200 }));

    global.fetch = fetchMock as typeof fetch;

    const createRes = await request(app).post("/api/support/tickets").send({
      email: "test_support_sync@co.za",
      name: "Pulse Sync Demo",
      deviceNumber: "FAL-01",
      issueType: "ACCOUNT_ACCESS",
      message: "I cannot access the Forge portal from my account at the moment.",
    });

    expect(createRes.status).toBe(201);
    expect(String(createRes.body?.pulseSyncStatus ?? "")).toBe("SYNCED");
    expect(String(createRes.body?.ticket?.pulseSyncStatus ?? "")).toBe("SYNCED");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const postCall = fetchMock.mock.calls[1];
    expect(String(postCall?.[0] ?? "")).toBe("https://pulse.example/ticket.php");
    const init = postCall?.[1] as RequestInit;
    const body = String(init?.body ?? "");

    expect(body).toContain("csrf_token=csrf-123");
    expect(body).toContain("email=test_support_sync%40co.za");
    expect(body).toContain("laptop_number=FAL-01");
    expect(body).toContain("issue_type=Login+Problems");
    expect(body).toContain("submit_request=1");
    expect(body).toContain("Forge+ticket+ID");
  });

  test("ticket creation stays successful when Pulse sync fails", async () => {
    env.PULSE_SYNC_ENABLED = true;
    env.PULSE_TICKET_FORM_URL = "https://pulse.example/ticket.php";

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          `
            <html>
              <form method="post">
                <input type="hidden" name="csrf_token" value="csrf-456">
              </form>
            </html>
          `,
          {
            status: 200,
            headers: { "set-cookie": "PHPSESSID=test-cookie; Path=/; HttpOnly" },
          }
        )
      )
      .mockResolvedValueOnce(new Response("<html><body>error</body></html>", { status: 500 }));

    global.fetch = fetchMock as typeof fetch;

    const createRes = await request(app).post("/api/support/tickets").send({
      email: "test_support_sync_fail@co.za",
      issueType: "SOFTWARE",
      message: "The learning portal throws an error every time I open the upload area.",
    });

    expect(createRes.status).toBe(201);
    expect(String(createRes.body?.pulseSyncStatus ?? "")).toBe("FAILED");
    expect(String(createRes.body?.ticket?.pulseSyncStatus ?? "")).toBe("FAILED");
    expect(String(createRes.body?.message ?? "")).toContain("Pulse handoff needs a retry");
  });
});
