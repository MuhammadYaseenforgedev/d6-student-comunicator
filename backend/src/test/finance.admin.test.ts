import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("admin finance management", () => {
  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("admin can manage a student finance account and the parent view reflects it", async () => {
    const admin = await createUser("ADMIN", undefined, "Passw0rd!", "FINANCE");
    const parent = await createUser("PARENT");
    const student = await createUser("STUDENT");

    await pool.query(
      `
        UPDATE users
        SET first_name = 'Demo',
            last_name = 'Student',
            course_name = 'Computer Science',
            public_student_id = 'FIN-1001'
        WHERE id = $1
      `,
      [student.id]
    );

    await pool.query(
      `
        INSERT INTO parent_links (parent_user_id, student_user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [parent.id, student.id]
    );

    const adminToken = signJwt(admin);
    const parentToken = signJwt(parent);

    const listRes = await request(app).get("/api/finance/admin/accounts").set(auth(adminToken));
    expect(listRes.status).toBe(200);
    const financeAccount = Array.isArray(listRes.body?.value)
      ? listRes.body.value.find((row: { studentId?: string }) => row.studentId === student.id)
      : null;
    expect(financeAccount).toBeTruthy();

    const updateRes = await request(app)
      .patch(`/api/finance/admin/accounts/${student.id}`)
      .set(auth(adminToken))
      .send({
        balance: 1250,
        currency: "zar",
        status: "OVERDUE",
        statusNote: "Payment due before month end.",
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body?.summary?.status).toBe("OVERDUE");
    expect(updateRes.body?.summary?.statusNote).toBe("Payment due before month end.");

    const transactionRes = await request(app)
      .post(`/api/finance/admin/accounts/${student.id}/transactions`)
      .set(auth(adminToken))
      .send({
        amount: -250,
        description: "Card payment received",
        occurredAt: "2026-03-16T08:30:00.000Z",
      });
    expect(transactionRes.status).toBe(201);
    expect(transactionRes.body?.transaction?.amount).toBe(-250);

    const documentRes = await request(app)
      .post(`/api/finance/admin/accounts/${student.id}/documents`)
      .set(auth(adminToken))
      .send({
        type: "STATEMENT",
        title: "March fee statement",
        description: "Outstanding fees for March 2026.",
        amount: 1000,
      });
    expect(documentRes.status).toBe(201);
    expect(documentRes.body?.document?.title).toBe("March fee statement");

    const notificationRes = await request(app)
      .post(`/api/finance/admin/accounts/${student.id}/notifications`)
      .set(auth(adminToken))
      .send({
        title: "Payment reminder",
        body: "Please settle the outstanding balance before month end.",
        severity: "WARNING",
      });
    expect(notificationRes.status).toBe(201);
    expect(notificationRes.body?.notification?.title).toBe("Payment reminder");

    const parentFinanceRes = await request(app)
      .get(`/api/parent/finance?childId=${encodeURIComponent(student.id)}`)
      .set(auth(parentToken));
    expect(parentFinanceRes.status).toBe(200);
    expect(parentFinanceRes.body?.status).toBe("OVERDUE");
    expect(parentFinanceRes.body?.statusNote).toBe("Payment due before month end.");
    expect(parentFinanceRes.body?.lastPayment).toBe("2026-03-16T08:30:00.000Z");
    expect(Array.isArray(parentFinanceRes.body?.documents)).toBe(true);
    expect(parentFinanceRes.body.documents.some((doc: { title?: string }) => doc.title === "March fee statement")).toBe(
      true
    );
    expect(
      parentFinanceRes.body.notifications.some((item: { title?: string }) => item.title === "Payment reminder")
    ).toBe(true);
  });

  test("non-admin users cannot access admin finance routes", async () => {
    const parent = await createUser("PARENT");
    const parentToken = signJwt(parent);

    const res = await request(app).get("/api/finance/admin/accounts").set(auth(parentToken));
    expect(res.status).toBe(403);
  });

  test("non-finance admins cannot access admin finance routes", async () => {
    const academicAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const academicToken = signJwt(academicAdmin);

    const res = await request(app).get("/api/finance/admin/accounts").set(auth(academicToken));
    expect(res.status).toBe(403);
  });
});
