import "./ReportList.css";

function ReportList({ reports }) {

  return (

    <div className="report-list">

      <h2>
        📋 Recent Reports
      </h2>


      {reports.length === 0 ? (

        <p>
          No reports yet.
        </p>

      ) : (

        reports.map(
          (report, index) => (

            <div
              className="report-card"
              key={
                report.id ||
                index
              }
            >

              <h3>
                {report.area ||
                  "Unknown Area"}
              </h3>


              <p>
                <strong>
                  District:
                </strong>{" "}
                {report.district ||
                  "N/A"}
              </p>


              <p>
                <strong>
                  Danger:
                </strong>{" "}
                {report.dangerType ||
                  report.incidentType ||
                  "N/A"}
              </p>


              <p>
                <strong>
                  Severity:
                </strong>{" "}
                {report.severity ||
                  "N/A"}
              </p>


              <p>
                <strong>
                  Status:
                </strong>{" "}

                <span
                  className={
                    `status-${(
                      report.status ||
                      "Unverified"
                    )
                      .toLowerCase()
                      .replace(
                        /\s+/g,
                        "-"
                      )}`
                  }
                >
                  {report.status ||
                    "Unverified"}
                </span>

              </p>


              <p>
                <strong>
                  Reports:
                </strong>{" "}

                {report.reportCount ||
                  1}

              </p>


              <p>
                <strong>
                  Description:
                </strong>{" "}

                {report.description ||
                  "No description"}
              </p>


              <p>
                📍{" "}

                {Number(
                  report.lat
                ).toFixed(5)}

                ,{" "}

                {Number(
                  report.lng
                ).toFixed(5)}

              </p>


              {/* =================================
                  EVIDENCE
                  ================================= */}

              {Array.isArray(
                report.evidence
              ) &&
                report.evidence.length >
                  0 && (

                  <div
                    className="report-evidence"
                  >

                    <h4>
                      📎 Evidence
                    </h4>


                    {report.evidence.map(
                      (
                        file,
                        fileIndex
                      ) => {

                        const isVideo =
                          file.resourceType ===
                            "video" ||
                          file.type?.startsWith(
                            "video/"
                          );


                        return (

                          <div
                            className="evidence-item"
                            key={
                              `${file.url}-${fileIndex}`
                            }
                          >

                            {isVideo ? (

                              <video
                                src={
                                  file.url
                                }
                                controls
                                preload="metadata"
                              />

                            ) : (

                              <img
                                src={
                                  file.url
                                }
                                alt={
                                  file.originalName ||
                                  "Incident evidence"
                                }
                              />

                            )}

                          </div>

                        );
                      }
                    )}

                  </div>

                )}


              <hr />

            </div>
          )
        )

      )}

    </div>
  );
}

export default ReportList;