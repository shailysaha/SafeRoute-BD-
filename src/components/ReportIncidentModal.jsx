import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import { notify } from "../utils/notify";
import "./ReportIncidentModal.css";

function ReportIncidentModal({
  incident,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
      notify("Please login first.");
      return;
    }

    if (!reason) {
      notify("Please select a reason.");
      return;
    }

    try {
      setSubmitting(true);

      await addDoc(collection(db, "moderationReports"), {
        incidentId: incident.id,

        reporterId: auth.currentUser.uid,

        reason,

        description: description.trim(),

        status: "pending",

        createdAt: serverTimestamp(),
      });

      notify(
        "Thank you. Your report has been submitted for admin review."
      );

      onClose();
    } catch (error) {
      console.error("Moderation report error:", error);

      notify(
        "Failed to submit report. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="moderation-overlay">
      <div className="moderation-modal">

        <div className="moderation-header">
          <div>
            <h2>Report Incident</h2>
            <p>
              Help us keep SafeRoute BD accurate and safe.
            </p>
          </div>

          <button
            className="moderation-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>

          <label>
            Why are you reporting this incident?
          </label>

          <div className="moderation-options">

            <label className="moderation-option">
              <input
                type="radio"
                name="reason"
                value="false_information"
                checked={reason === "false_information"}
                onChange={(e) =>
                  setReason(e.target.value)
                }
              />

              <span>
                <strong>False Information</strong>
                <small>
                  The incident information appears to be false.
                </small>
              </span>
            </label>

            <label className="moderation-option">
              <input
                type="radio"
                name="reason"
                value="spam"
                checked={reason === "spam"}
                onChange={(e) =>
                  setReason(e.target.value)
                }
              />

              <span>
                <strong>Spam</strong>
                <small>
                  Unnecessary or promotional content.
                </small>
              </span>
            </label>

            <label className="moderation-option">
              <input
                type="radio"
                name="reason"
                value="duplicate"
                checked={reason === "duplicate"}
                onChange={(e) =>
                  setReason(e.target.value)
                }
              />

              <span>
                <strong>Duplicate Incident</strong>
                <small>
                  This incident has already been reported.
                </small>
              </span>
            </label>

            <label className="moderation-option">
              <input
                type="radio"
                name="reason"
                value="inappropriate"
                checked={reason === "inappropriate"}
                onChange={(e) =>
                  setReason(e.target.value)
                }
              />

              <span>
                <strong>Inappropriate Content</strong>
                <small>
                  Offensive or inappropriate information.
                </small>
              </span>
            </label>

          </div>

          <label htmlFor="moderation-description">
            Additional details
          </label>

          <textarea
            id="moderation-description"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            placeholder="Explain why you think this incident should be reviewed..."
            rows={4}
            maxLength={500}
          />

          <div className="moderation-actions">

            <button
              type="button"
              className="moderation-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="moderation-submit"
              disabled={submitting}
            >
              {submitting
                ? "Submitting..."
                : "Submit Report"}
            </button>

          </div>

        </form>
      </div>
    </div>
  );
}

export default ReportIncidentModal;