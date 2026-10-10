import {
  useState,
} from "react";

import {
  createModerationReport,
} from "../services/moderationService";

import { auth } from "../firebase/firebase";

import "./ModerationReportButton.css";
import { notify } from "../utils/notify";

function ModerationReportButton({
  incidentId,
}) {
  const [
    showModal,
    setShowModal,
  ] = useState(false);

  const [
    reason,
    setReason,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const handleOpen = () => {
    if (!incidentId) {
      notify(
        "Incident ID is missing."
      );
      return;
    }

    if (!auth.currentUser) {
      notify(
        "Please login to report this incident."
      );
      return;
    }

    setShowModal(true);
  };

  const handleClose = () => {
    if (submitting) {
      return;
    }

    setShowModal(false);
  };

  const handleSubmit = async () => {
    const user = auth.currentUser;

    if (!user) {
      notify(
        "Please login to report this incident."
      );
      return;
    }

    if (!incidentId) {
      notify(
        "Incident ID is missing."
      );
      return;
    }

    if (!reason) {
      notify(
        "Please select a reason."
      );
      return;
    }

    try {
      setSubmitting(true);

      await createModerationReport({
        incidentId,
        reason,
        description:
          description.trim(),
      });

      notify(
        "Thank you. Your moderation report has been submitted."
      );

      setReason("");
      setDescription("");
      setShowModal(false);

    } catch (error) {
      console.error(
        "Moderation report error:",
        error
      );

      notify(
        error?.message ||
        "Failed to submit moderation report."
      );

    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* =================================================
          MODERATION REPORT BUTTON
      ================================================= */}

      <button
        type="button"
        className="moderation-report-trigger"
        onClick={handleOpen}
        style={{
          display: "block",
          width: "100%",
          marginTop: "10px",
          padding: "10px 12px",
          cursor: "pointer",
          position: "relative",
          zIndex: 10,
        }}
      >
        🚩 Report Incident
      </button>


      {/* =================================================
          MODERATION MODAL
      ================================================= */}

      {showModal && (
        <div
          className="moderation-modal-overlay"
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
          }}
        >
          <div
            className="moderation-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="moderation-modal-header">

              <div>
                <h3>
                  Report Incident
                </h3>

                <p>
                  Help us keep SafeRoute BD
                  accurate and safe.
                </p>
              </div>

              <button
                type="button"
                className="moderation-close"
                disabled={submitting}
                onClick={handleClose}
              >
                ×
              </button>

            </div>


            {/* REASON */}

            <label htmlFor="moderation-reason">
              Reason
            </label>

            <select
              id="moderation-reason"
              value={reason}
              onChange={(event) =>
                setReason(
                  event.target.value
                )
              }
              disabled={submitting}
            >
              <option value="">
                Select reason
              </option>

              <option value="False Information">
                False Information
              </option>

              <option value="Spam">
                Spam
              </option>

              <option value="Duplicate">
                Duplicate
              </option>

              <option value="Inappropriate Content">
                Inappropriate Content
              </option>

            </select>


            {/* DESCRIPTION */}

            <label htmlFor="moderation-description">
              Additional details
            </label>

            <textarea
              id="moderation-description"
              rows="4"
              placeholder="Explain why this incident should be reviewed..."
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value
                )
              }
              disabled={submitting}
            />


            {/* ACTIONS */}

            <div className="moderation-modal-actions">

              <button
                type="button"
                className="moderation-cancel"
                disabled={submitting}
                onClick={handleClose}
              >
                Cancel
              </button>

              <button
                type="button"
                className="moderation-submit"
                disabled={
                  submitting ||
                  !reason
                }
                onClick={handleSubmit}
              >
                {submitting
                  ? "Submitting..."
                  : "Submit Report"}
              </button>

            </div>

          </div>
        </div>
      )}
    </>
  );
}

export default ModerationReportButton;
