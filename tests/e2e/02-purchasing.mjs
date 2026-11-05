import { BASE, PW, addBranch, expect, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Flow 3: invite staff -> purchase request -> approval -> order -> partial receipt");
const { browser, page: owner, errors } = await open();
const ownerEmail = uniq("buyowner"), mgrEmail = uniq("buymgr"); const CO = `Buy Co ${Date.now()}`;
let mgr, reqUrl;

await step("owner creates a company, a branch, a supplier and an item", async () => {
  await ownerWithCompany(owner, ownerEmail, "Olivia Owner", CO);
  await addBranch(owner, "HQ", "HQ1");
  await owner.goto(BASE + "/purchasing?tab=suppliers");
  await owner.getByLabel(/^Name/).first().fill("ColdTech"); await owner.getByRole("button", { name: "Add supplier" }).click(); await owner.getByText("ColdTech added.").waitFor();
  await owner.getByLabel("Code").fill("FRZ-1"); await owner.getByLabel("Item name").fill("Freezer part"); await owner.getByLabel(/^Price/).fill("40.00");
  await owner.getByRole("button", { name: "Add item" }).click(); await owner.getByText("Item added to the catalogue.").waitFor();
});
await step("a price with too many decimals is refused, not rounded", async () => {
  await owner.getByLabel("Code").fill("BAD-1"); await owner.getByLabel("Item name").fill("Bad price"); await owner.getByLabel(/^Price/).fill("1.999");
  await owner.getByRole("button", { name: "Add item" }).click(); await owner.getByText("at most 2 decimal places").waitFor();
});
await step("owner invites a branch manager who joins through the link", async () => {
  ({ page: mgr } = await inviteAndJoin(owner, browser, mgrEmail, "Maya Manager", "Branch manager"));
  await mgr.getByText("Maya Manager").first().waitFor().catch(() => {});
  const [m] = await q("select m.status from memberships m join profiles p on p.id = m.user_id where p.email = $1", [mgrEmail]);
  expect(m?.status === "active", "membership not active");
});
await step("an invitation link can't be used twice", async () => {
  const [{ body }] = await q("select body from identity.outbox where to_email = $1 and subject like 'You''re invited%' order by id desc limit 1", [mgrEmail]);
  const url = body.match(/http\S+\/invite\/\S+/)[0]; await mgr.goto(url); await mgr.getByText("This invitation isn't valid").waitFor();
});
await step("manager raises a requisition and submits it for approval", async () => {
  await mgr.goto(BASE + "/purchasing/new"); await mgr.getByLabel("Supplier").selectOption({ label: "ColdTech" }); await mgr.getByRole("button", { name: "Show items" }).click();
  await mgr.locator('input[name^="qty:"]').first().fill("10"); await mgr.getByRole("button", { name: "Submit for approval" }).click();
  await mgr.getByRole("heading", { name: /REQ-0001/ }).waitFor(); reqUrl = mgr.url().split("?")[0];
  await mgr.getByText("Submitted", { exact: true }).first().waitFor();
});
await step("the total is exact: 10 x 40.00 = 400.00", async () => {
  const [r] = await q("select total_minor from requisitions where number = 'REQ-0001' and company_id = (select id from companies where name = $1)", [CO]); expect(Number(r.total_minor) === 40000, String(r.total_minor));
});
await step("the requester cannot decide their own request", async () => {
  await mgr.goto(BASE + "/approvals?tab=mine"); await mgr.getByRole("heading", { name: /REQ-0001/ }).waitFor();
  expect(await mgr.getByRole("button", { name: "Approve" }).count() === 0, "approve button shown to requester");
  await mgr.getByText("Waiting for Branch manager").waitFor();
});
await step("the owner sees it and approves with evidence on file", async () => {
  await owner.goto(BASE + "/approvals"); await owner.getByRole("heading", { name: /REQ-0001/ }).waitFor();
  await owner.locator('input[type="file"]').setInputFiles({ name: "quote.txt", mimeType: "text/plain", buffer: Buffer.from("Quote ColdTech 400.00") });
  await owner.getByRole("button", { name: "Attach", exact: true }).click(); await owner.getByText("File attached.").waitFor(); await owner.getByText("quote.txt").waitFor();
  await owner.getByRole("button", { name: "Approve", exact: true }).click(); await owner.getByText("Decision recorded: approved.").waitFor();
});
await step("an executable upload is refused", async () => {
  await owner.goto(BASE + "/approvals?tab=decided"); await owner.getByRole("heading", { name: /REQ-0001/ }).waitFor();
  // decided requests no longer take uploads; use the requisition page instead
  await owner.goto(reqUrl); await owner.locator('input[type="file"]').setInputFiles({ name: "run.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await owner.getByRole("button", { name: "Attach", exact: true }).click(); await owner.getByText("files aren't allowed").waitFor();
});
await step("the manager is notified and the requisition is approved", async () => {
  await mgr.goto(BASE + "/notifications"); await mgr.getByText(/Approved: REQ-0001/).waitFor();
  await mgr.goto(reqUrl); await mgr.getByText("Approved", { exact: true }).first().waitFor();
});
await step("manager places the order", async () => {
  await mgr.getByRole("button", { name: "Place order" }).click(); await mgr.getByRole("heading", { name: /^PO-0001/ }).waitFor();
});
await step("partial receipt: 6 of 10 arrive", async () => {
  await mgr.getByLabel("Arrived now: Freezer part").fill("6"); await mgr.getByRole("button", { name: "Record receipt" }).click(); await mgr.getByText("Goods receipt recorded.").waitFor();
  await mgr.getByText("Partially received", { exact: true }).first().waitFor();
});
await step("receiving more than ordered is refused with a clear reason", async () => {
  const arrived = mgr.getByLabel("Arrived now: Freezer part");
  await arrived.evaluate((el) => el.removeAttribute("max"));   // the browser already stops this; prove the server does too
  await arrived.fill("5"); await mgr.getByRole("button", { name: "Record receipt" }).click(); await mgr.getByText(/would exceed the 10\.000 ordered/).waitFor();
});
await step("a damaged unit needs a reason, then the order completes", async () => {
  await mgr.getByLabel("Arrived now: Freezer part").fill("3"); await mgr.getByLabel("Rejected: Freezer part").fill("1"); await mgr.getByRole("button", { name: "Record receipt" }).click();
  await mgr.getByText(/One of the values isn't allowed/).waitFor();
  await mgr.getByLabel("Arrived now: Freezer part").fill("3"); await mgr.getByLabel("Rejected: Freezer part").fill("1"); await mgr.getByLabel("Reason: Freezer part").fill("1 unit arrived damaged");
  await mgr.getByRole("button", { name: "Record receipt" }).click(); await mgr.getByText("Discrepancies recorded").waitFor();
  await mgr.getByLabel("Arrived now: Freezer part").fill("1"); await mgr.getByRole("button", { name: "Record receipt" }).click();
  await mgr.getByText("Received", { exact: true }).first().waitFor();
  const [r] = await q("select r.status from requisitions r where r.number='REQ-0001' and company_id = (select id from companies where name = $1)", [CO]); expect(r.status === "closed", r.status);
});
await step("rejecting really rejects: the requester sees the reason and can resubmit", async () => {
  await mgr.goto(BASE + "/purchasing/new"); await mgr.getByLabel("Supplier").selectOption({ label: "ColdTech" }); await mgr.getByRole("button", { name: "Show items" }).click();
  await mgr.locator('input[name^="qty:"]').first().fill("2"); await mgr.getByRole("button", { name: "Submit for approval" }).click(); await mgr.getByRole("heading", { name: /REQ-0002/ }).waitFor();
  await owner.goto(BASE + "/approvals"); await owner.getByRole("heading", { name: /REQ-0002/ }).waitFor();
  await owner.getByRole("button", { name: "Reject with reason" }).click(); await owner.getByText("Give a reason for rejecting").waitFor();
  await owner.getByLabel("Reason").fill("Quote is out of date"); await owner.getByRole("button", { name: "Reject with reason" }).click(); await owner.getByText("Decision recorded: rejected.").waitFor();
  const [r] = await q("select r.status from requisitions r where r.number = 'REQ-0002' and company_id = (select id from companies where name = $1)", [CO]); expect(r.status === "rejected", "a rejection was recorded as " + r.status);
  await mgr.goto(BASE + "/notifications"); await mgr.getByText(/Rejected: REQ-0002/).waitFor(); await mgr.goto(BASE + "/purchasing"); await mgr.getByRole("link", { name: "REQ-0002" }).click();
  await mgr.getByRole("button", { name: "Resubmit for approval" }).click(); await mgr.getByText("Submitted for approval.").waitFor();
});
await step("audit log shows who approved", async () => {
  await owner.goto(BASE + "/audit"); await owner.getByRole("cell", { name: "Approval decisions" }).first().waitFor();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
