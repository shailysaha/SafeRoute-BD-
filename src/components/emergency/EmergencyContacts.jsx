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

import "./EmergencyContacts.css";

function EmergencyContacts() {
  const [contacts, setContacts] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const [loading, setLoading] = useState(false);

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

      // User does not exist
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

    // ------------------------------------------
    // LOGIN CHECK
    // ------------------------------------------
    if (!user) {
      alert("Please login first.");
      return;
    }

    // ------------------------------------------
    // CLEAN INPUTS
    // ------------------------------------------
    const trimmedName = name.trim();

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    const trimmedMobile = mobile.trim();

    // ------------------------------------------
    // REQUIRED FIELD VALIDATION
    // ------------------------------------------
    if (
      !trimmedName ||
      !normalizedEmail ||
      !trimmedMobile
    ) {
      alert(
        "Please enter contact name, registered SafeRoute BD email and mobile number."
      );
      return;
    }

    // ------------------------------------------
    // EMAIL FORMAT VALIDATION
    // ------------------------------------------
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      alert("Please enter a valid email address.");
      return;
    }

    // ------------------------------------------
    // BANGLADESH MOBILE NUMBER VALIDATION
    // ------------------------------------------
    //
    // Accepted:
    // 01712345678
    // 01812345678
    // 01912345678
    // +8801712345678
    //
    const mobileRegex =
      /^(?:\+8801|01)[3-9]\d{8}$/;

    if (!mobileRegex.test(trimmedMobile)) {
      alert(
        "Please enter a valid Bangladesh mobile number.\n\n" +
        "Example: 01712345678"
      );
      return;
    }

    // ------------------------------------------
    // PREVENT ADDING YOURSELF
    // ------------------------------------------
    if (
      normalizedEmail ===
      user.email?.trim().toLowerCase()
    ) {
      alert(
        "You cannot add yourself as an emergency contact."
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

      // ==========================================
      // ❌ EMAIL NOT REGISTERED
      // ==========================================
      if (!linkedUser) {
        alert(
          "❌ This email is not registered in SafeRoute BD.\n\n" +
          "Only registered SafeRoute BD users can be added as emergency contacts."
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
        alert(
          "This emergency contact has already been added."
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

          // Mobile number for SMS
          mobile: trimmedMobile,

          // Registered SafeRoute user's UID
          linkedUserId: linkedUser.id,

          // Always true because verification
          // happened above
          isRegisteredUser: true,

          // SMS enabled
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
      alert(
        `✅ ${trimmedName} added successfully!\n\n` +
        "✓ Registered SafeRoute BD user\n" +
        "✓ Real-time SOS notification enabled\n" +
        "✓ SMS notification enabled"
      );
    } catch (error) {
      console.error(
        "Add emergency contact error:",
        error
      );

      alert(
        "❌ Failed to add emergency contact.\n\n" +
        "Please check your Firebase connection and permissions."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // DELETE EMERGENCY CONTACT
  // ==========================================
  const handleDeleteContact = async (id) => {
    const confirmDelete = window.confirm(
      "Remove this emergency contact?"
    );

    if (!confirmDelete) return;

    try {
      await deleteDoc(
        doc(db, "emergencyContacts", id)
      );

      setContacts((previous) =>
        previous.filter(
          (contact) => contact.id !== id
        )
      );

      alert(
        "Emergency contact removed successfully."
      );
    } catch (error) {
      console.error(
        "Delete emergency contact error:",
        error
      );

      alert(
        "❌ Failed to remove emergency contact."
      );
    }
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

    </div>
  );
}

export default EmergencyContacts;