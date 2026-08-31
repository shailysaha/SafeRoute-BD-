import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

/* =========================================================
   CREATE COMMUNITY MODERATION REPORT
========================================================= */

export async function createModerationReport({
  incidentId,
  reason,
  description = "",
}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "You must login before reporting an incident."
    );
  }

  if (!incidentId) {
    throw new Error(
      "Incident ID is required."
    );
  }

  if (!reason) {
    throw new Error(
      "Please select a moderation reason."
    );
  }

  const moderationReport = {
    incidentId,

    reportedBy: user.uid,

    reporterEmail:
      user.email || "",

    reason,

    description:
      description.trim(),

    status: "Pending",

    createdAt:
      serverTimestamp(),

    updatedAt:
      serverTimestamp(),
  };

  const reportRef =
    await addDoc(
      collection(
        db,
        "moderationReports"
      ),
      moderationReport
    );

  return reportRef.id;
}

/* =========================================================
   CREATE ADMIN AUDIT LOG
========================================================= */

export async function createModerationAuditLog({
  action,
  incidentId,
  moderationReportId = null,
  previousStatus = null,
  newStatus = null,
  reason = "",
  notes = "",
}) {
  const admin = auth.currentUser;

  if (!admin) {
    throw new Error(
      "Admin authentication required."
    );
  }

  const auditData = {
    action,

    incidentId:
      incidentId || null,

    moderationReportId:
      moderationReportId || null,

    adminId: admin.uid,

    adminEmail:
      admin.email || "",

    previousStatus,

    newStatus,

    reason,

    notes,

    createdAt:
      serverTimestamp(),
  };

  const logRef =
    await addDoc(
      collection(
        db,
        "moderationLogs"
      ),
      auditData
    );

  return logRef.id;
}