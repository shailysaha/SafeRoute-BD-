import { useEffect, useState } from "react";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";
import { notify } from "../../utils/notify";

import "./EmergencyContacts.css";

function EmergencyContacts() {
  const [contacts, setContacts] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const [loading, setLoading] = useState(false);

  // Custom delete confirmation
  const [deleteId, setDeleteId] = useState(null);

  const currentUser = auth.currentUser;

  // ==========================================
  // LOAD EMERGENCY CONTACTS
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    loadContacts();
  }, [currentUser]);

  const loadContacts = async () => {
    if (!currentUser) return;

    try {
      const contactQuery = query(
        collection(db, "emergencyContacts"),
        where("ownerId", "==", currentUser.uid)
      );

      const snapshot = await getDocs(contactQuery);

      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      }));

      setContacts(data);
    } catch (error) {
      console.error(
        "Failed to load emergency contacts:",
        error
      );
    }
  };

  // ==========================================
  // FIND REGISTERED SAFEROUTE BD USER
  // ==========================================
  const findLinkedUser = async (contactEmail) => {
    const normalizedEmail = contactEmail
      .trim()
      .toLowerCase();

    try {
      const userQuery = query(
        collection(db, "users"),
        where("email", "==", normalizedEmail)
      );

      const snapshot = await getDocs(userQuery);

      if (snapshot.empty) {
        return null;
      }

      const userDoc = snapshot.docs[0];

      return {
        id: userDoc.id,
        ...userDoc.data(),
      };
    } catch (error) {
      console.error(
        "Failed to find registered SafeRoute BD user:",
        error
      );

      throw error;
    }
  };

  // ==========================================
  // ADD EMERGENCY CONTACT
  // ==========================================
  const handleAddContact = async () => {
    const user = auth.currentUser;

    // LOGIN CHECK
    if (!user) {
      notify("Please login first.", "error");
      return;
    }

    // CLEAN INPUTS
    const trimmedName = name.trim();

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    const trimmedMobile = mobile.trim();

    // REQUIRED FIELD VALIDATION
    if (
      !trimmedName ||
      !normalizedEmail ||
      !trimmedMobile
    ) {
      notify(
        "Please enter contact name, registered SafeRoute BD email and mobile number.",
        "error"
      );
      return;
    }

    // EMAIL FORMAT VALIDATION
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      notify(
        "Please enter a valid email address.",
        "error"
      );
      return;
    }

    // BANGLADESH MOBILE NUMBER VALIDATION
    const mobileRegex =
      /^(?:\+8801|01)[3-9]\d{8}$/;

    if (!mobileRegex.test(trimmedMobile)) {
      notify(
        "Please enter a valid Bangladesh mobile number.\n\nExample: 01712345678",
        "error"
      );
      return;
    }

    // PREVENT ADDING YOURSELF
    if (
      normalizedEmail ===
      user.email?.trim().toLowerCase()
    ) {
      notify(
        "You cannot add yourself as an emergency contact.",
        "error"
      );
      return;
    }

    try {
      setLoading(true);

      // ==========================================
      // 1. VERIFY REGISTERED SAFEROUTE USER
      // ==========================================
      const linkedUser =
        await findLinkedUser(normalizedEmail);

      if (!linkedUser) {
        notify(
          "❌ This email is not registered in SafeRoute BD.\n\nOnly registered SafeRoute BD users can be added as emergency contacts.",
          "error"
        );

        return;
      }

      // ==========================================
      // 2. CHECK DUPLICATE CONTACT
      // ==========================================
      const duplicateQuery = query(
        collection(db, "emergencyContacts"),
        where("ownerId", "==", user.uid),
        where("email", "==", normalizedEmail)
      );

      const duplicateSnapshot =
        await getDocs(duplicateQuery);

      if (!duplicateSnapshot.empty) {
        notify(
          "This emergency contact has already been added.",
          "error"
        );

        return;
      }

      // ==========================================
      // 3. SAVE VERIFIED CONTACT
      // ==========================================
      await addDoc(
        collection(db, "emergencyContacts"),
        {
          ownerId: user.uid,

          name: trimmedName,

          email: normalizedEmail,

          mobile: trimmedMobile,

          linkedUserId: linkedUser.id,

          isRegisteredUser: true,

          smsEnabled: true,

          createdAt: serverTimestamp(),
        }
      );

      // ==========================================
      // 4. CLEAR FORM
      // ==========================================
      setName("");
      setEmail("");
      setMobile("");

      // ==========================================
      // 5. RELOAD CONTACTS
      // ==========================================
      await loadContacts();

      // ==========================================
      // 6. SUCCESS MESSAGE
      // ==========================================
      notify(
        `✅ ${trimmedName} added successfully!\n\n✓ Registered SafeRoute BD user\n✓ Real-time SOS notification enabled\n✓ SMS notification enabled`,
        "success"
      );
    } catch (error) {
      console.error(
        "Add emergency contact error:",
        error
      );

      notify(
        "❌ Failed to add emergency contact.\n\nPlease check your Firebase connection and permissions.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // OPEN DELETE CONFIRMATION
  // ==========================================
  const handleDeleteContact = (id) => {
    setDeleteId(id);
  };

  // ==========================================
  // CONFIRM DELETE
  // ==========================================
  const confirmDeleteContact = async () => {
    if (!deleteId) return;

    try {
      await deleteDoc(
        doc(db, "emergencyContacts", deleteId)
      );

      setContacts((previous) =>
        previous.filter(
          (contact) => contact.id !== deleteId
        )
      );

      setDeleteId(null);

      notify(
        "Emergency contact removed successfully.",
        "success"
      );
    } catch (error) {
      console.error(
        "Delete emergency contact error:",
        error
      );

      setDeleteId(null);

      notify(
        "❌ Failed to remove emergency contact.",
        "error"
      );
    }
  };

  // ==========================================
  // CANCEL DELETE
  // ==========================================
  const cancelDeleteContact = () => {
    setDeleteId(null);
  };

  return (
    <div className="emergency-contacts-card">

      {/* =====================================
          HEADER
      ====================================== */}
      <div className="emergency-contacts-heading">
        <div>
          <h2>👥 Emergency Contacts</h2>

          <p>
            Add trusted SafeRoute BD users who
            should receive your SOS alerts.
          </p>
        </div>
      </div>

      {/* =====================================
          ADD CONTACT FORM
      ====================================== */}
      <div className="emergency-contact-form">

        {/* NAME */}
        <input
          type="text"
          placeholder="Contact name"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
        />

        {/* REGISTERED EMAIL */}
        <input
          type="email"
          placeholder="Registered SafeRoute BD email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        {/* MOBILE */}
        <input
          type="tel"
          placeholder="Mobile number (017XXXXXXXX)"
          value={mobile}
          onChange={(e) =>
            setMobile(e.target.value)
          }
        />

        {/* ADD BUTTON */}
        <button
          type="button"
          onClick={handleAddContact}
          disabled={loading}
        >
          {loading
            ? "Verifying..."
            : "+ Add Contact"}
        </button>

      </div>

      {/* =====================================
          CONTACT LIST
      ====================================== */}
      <div className="emergency-contact-list">

        {contacts.length === 0 ? (
          <div className="no-emergency-contacts">
            No emergency contacts added yet.
          </div>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="emergency-contact-item"
            >

              {/* CONTACT DETAILS */}
              <div>

                <h3>
                  {contact.name}
                </h3>

                <p>
                  📧 {contact.email}
                </p>

                <p>
                  📱 {contact.mobile}
                </p>

                <span className="contact-status registered">
                  ✓ SafeRoute BD User
                </span>

              </div>

              {/* REMOVE */}
              <button
                type="button"
                className="remove-contact-btn"
                onClick={() =>
                  handleDeleteContact(
                    contact.id
                  )
                }
              >
                Remove
              </button>

            </div>
          ))
        )}

      </div>

      {/* =====================================
          CUSTOM DELETE CONFIRMATION
      ====================================== */}
      {deleteId && (
        <div className="delete-confirm">
          <div className="delete-confirm-content">

            <div className="delete-confirm-icon">
              ⚠️
            </div>

            <div>
              <h3>
                Remove Emergency Contact?
              </h3>

              <p>
                Are you sure you want to remove
                this emergency contact?
              </p>
            </div>

          </div>

          <div className="delete-confirm-actions">

            <button
              type="button"
              className="delete-cancel-btn"
              onClick={cancelDeleteContact}
            >
              Cancel
            </button>

            <button
              type="button"
              className="delete-confirm-btn"
              onClick={confirmDeleteContact}
            >
              Remove
            </button>

          </div>
        </div>
      )}

    </div>
  );
}

export default EmergencyContacts;