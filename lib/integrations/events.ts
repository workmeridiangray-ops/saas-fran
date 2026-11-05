export const EVENTS: { id: string; label: string }[] = [
  { id: "branch.created", label: "A branch is created" }, { id: "branch.status_changed", label: "A branch changes status" }, { id: "ticket.created", label: "A ticket is raised" },
  { id: "finding.created", label: "An inspection finding is raised" }, { id: "purchase_order.created", label: "A purchase order is placed" }, { id: "approval.decided", label: "An approval is decided" },
  { id: "statement.issued", label: "A royalty statement is issued" }, { id: "applicant.created", label: "A franchise applicant is added" }, { id: "agreement.activated", label: "A franchise agreement becomes active" },
];
export const SCOPES = [["read:branches", "Branches"], ["read:tasks", "Tasks"], ["read:tickets", "Tickets"], ["read:requisitions", "Requisitions"]] as const;
