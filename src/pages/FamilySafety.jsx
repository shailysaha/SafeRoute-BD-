import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";
import { notify } from "../utils/notify";

import "./FamilySafety.css";

function FamilySafety() {
  const navigate = useNavigate();

  // =========================================================
  // STATE
  // =========================================================

  const [currentUser, setCurrentUser] = useState(null);
  const [familyGroup, setFamilyGroup] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [savedJourneys, setSavedJourneys] = useState([]);
  const [familyTrips, setFamilyTrips] = useState([]);
  const [receivedInvites, setReceivedInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showShareJourney, setShowShareJourney] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedJourneyId, setSelectedJourneyId] = useState("");
  const [sharingTripId, setSharingTripId] = useState(null);
  const [highRiskAlertsEnabled, setHighRiskAlertsEnabled] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const watchIdRef = useRef(null);
  const lastLocationUpdateRef = useRef(0);
  const lastRiskAlertRef = useRef("");

  // =========================================================
  // HELPER: Generate consistent ID from email
  // =========================================================

  const generateIdFromEmail = (email) => {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `user_${Math.abs(hash)}`;
  };

  // =========================================================
  // CURRENT USER
  // =========================================================

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user || null);
      if (!user) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // =========================================================
  // FIND USER'S FAMILY GROUP
  // =========================================================

  useEffect(() => {
    if (!currentUser) {
      setFamilyGroup(null);
      setFamilyMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const groupsQuery = query(
      collection(db, "familyGroups"),
      where("members", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      groupsQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          setFamilyGroup(null);
          setFamilyMembers([]);
          setHighRiskAlertsEnabled(false);
          setLoading(false);
          return;
        }

        const groupDoc = snapshot.docs[0];
        const groupData = { id: groupDoc.id, ...groupDoc.data() };
        setFamilyGroup(groupData);

        try {
          const membersSnapshot = await getDocs(
            collection(db, "familyGroups", groupDoc.id, "members")
          );

          if (membersSnapshot.empty) {
            const membersFromArray = (groupData.members || []).map((userId) => ({
              id: userId,
              userId: userId,
              email: "",
              displayName: "Family Member",
              role: userId === groupData.ownerId ? "owner" : "member",
              consentHighRiskAlerts: false,
              joinedAt: groupData.createdAt || null,
            }));
            setFamilyMembers(membersFromArray);
          } else {
            const members = membersSnapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));
            setFamilyMembers(members);
          }

          const currentMember = familyMembers.find(
            (member) => member.userId === currentUser.uid
          );
          setHighRiskAlertsEnabled(currentMember?.consentHighRiskAlerts === true);

          // Check for unread messages
          checkUnreadMessages(groupDoc.id);
        } catch (error) {
          console.error("Family member loading error:", error);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Family group loading error:", error);
        setFamilyGroup(null);
        setFamilyMembers([]);
        setHighRiskAlertsEnabled(false);
        setLoading(false);
        notify("Unable to load your family group.");
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // =========================================================
  // CHECK UNREAD MESSAGES
  // =========================================================

  const checkUnreadMessages = (groupId) => {
    if (!currentUser) return;

    const messagesQuery = query(
      collection(db, "familyGroups", groupId, "messages"),
      where("readBy", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        setUnreadMessages(snapshot.size > 0 ? Math.min(snapshot.size, 99) : 0);
      },
      (error) => {
        console.error("Error checking messages:", error);
      }
    );

    return () => unsubscribe();
  };

  // =========================================================
  // LOAD SAVED JOURNEYS
  // =========================================================

  useEffect(() => {
    if (!currentUser) {
      setSavedJourneys([]);
      return;
    }

    const journeyQuery = query(
      collection(db, "savedRoutes"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      journeyQuery,
      (snapshot) => {
        const journeys = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        journeys.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        setSavedJourneys(journeys);
      },
      (error) => {
        console.error("Saved journeys loading error:", error);
        setSavedJourneys([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // =========================================================
  // LOAD FAMILY TRIPS
  // =========================================================

  useEffect(() => {
    if (!familyGroup?.id) {
      setFamilyTrips([]);
      return;
    }

    const tripsQuery = query(
      collection(db, "familyTrips"),
      where("groupId", "==", familyGroup.id)
    );

    const unsubscribe = onSnapshot(
      tripsQuery,
      (snapshot) => {
        const trips = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        trips.sort((a, b) => {
          const aTime = a.startedAt?.seconds || 0;
          const bTime = b.startedAt?.seconds || 0;
          return bTime - aTime;
        });
        setFamilyTrips(trips);

        const myActiveTrip = trips.find(
          (trip) => trip.userId === currentUser?.uid && trip.status === "active"
        );
        setSharingTripId(myActiveTrip?.id || null);
      },
      (error) => {
        console.error("Family trips loading error:", error);
        setFamilyTrips([]);
      }
    );

    return () => unsubscribe();
  }, [familyGroup, currentUser]);

  // =========================================================
  // LOAD INVITATIONS
  // =========================================================

  useEffect(() => {
    if (!currentUser?.email) {
      setReceivedInvites([]);
      return;
    }

    try {
      const inviteQuery = query(
        collection(db, "familyInvites"),
        where("inviteeEmail", "==", currentUser.email.toLowerCase()),
        where("status", "==", "pending")
      );

      const unsubscribe = onSnapshot(
        inviteQuery,
        (snapshot) => {
          const invites = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));
          invites.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });
          setReceivedInvites(invites);
        },
        (error) => {
          console.error("Family invitation loading error:", error);
          setReceivedInvites([]);
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error("Error setting up invitation listener:", error);
      setReceivedInvites([]);
      return () => {};
    }
  }, [currentUser]);

  // =========================================================
  // CREATE FAMILY GROUP
  // =========================================================

  const handleCreateGroup = async (event) => {
    event.preventDefault();

    if (!currentUser?.uid) {
      notify("Please log in first.");
      return;
    }

    const cleanName = groupName.trim();
    if (!cleanName) {
      notify("Please enter a family group name.");
      return;
    }

    if (familyGroup?.id) {
      notify("You are already a member of a family group.");
      return;
    }

    try {
      setSaving(true);

      const groupRef = doc(collection(db, "familyGroups"));
      const memberRef = doc(db, "familyGroups", groupRef.id, "members", currentUser.uid);

      const groupData = {
        name: cleanName,
        ownerId: currentUser.uid,
        ownerEmail: currentUser.email?.trim().toLowerCase() || "",
        members: [currentUser.uid],
        pendingInviteeIds: [],
        messageCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const memberData = {
        userId: currentUser.uid,
        email: currentUser.email?.trim().toLowerCase() || "",
        displayName: currentUser.displayName || currentUser.email || "Family Owner",
        role: "owner",
        consentHighRiskAlerts: false,
        joinedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      batch.set(groupRef, groupData);
      batch.set(memberRef, memberData);
      await batch.commit();

      setGroupName("");
      setShowCreateGroup(false);
      notify("Family group created successfully.");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Create family group error:", error);
      notify(`Error: ${error.message || "Unable to create family group."}`);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // INVITE FAMILY MEMBER
  // =========================================================

  const handleInviteMember = async (event) => {
    event.preventDefault();

    if (!currentUser?.uid) {
      notify("Please log in first.");
      return;
    }

    if (!familyGroup?.id) {
      notify("Create a family group before inviting members.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();

    if (!email) {
      notify("Please enter an email address.");
      return;
    }

    if (email === currentUser.email?.toLowerCase()) {
      notify("You cannot invite yourself.");
      return;
    }

    const alreadyMember = familyMembers.some(
      (member) => member.email?.trim().toLowerCase() === email
    );

    if (alreadyMember) {
      notify("This user is already in your family group.");
      return;
    }

    try {
      setSaving(true);

      const invitedUserId = generateIdFromEmail(email);

      // Check for existing pending invitation
      const pendingInviteQuery = query(
        collection(db, "familyInvites"),
        where("groupId", "==", familyGroup.id),
        where("inviteeEmail", "==", email),
        where("status", "==", "pending")
      );

      const pendingSnapshot = await getDocs(pendingInviteQuery);

      if (!pendingSnapshot.empty) {
        notify("An invitation is already pending for this user.");
        return;
      }

      // Create user document if it doesn't exist
      try {
        const userRef = doc(db, "users", invitedUserId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            email: email,
            displayName: email.split("@")[0] || "Family Member",
            role: "user",
            createdAt: serverTimestamp(),
          });
        }
      } catch (userError) {
        console.error("Error creating user:", userError);
        // Continue anyway
      }

      // Create invitation
      const inviteRef = doc(collection(db, "familyInvites"));
      await setDoc(inviteRef, {
        groupId: familyGroup.id,
        groupName: familyGroup.name || "SafeRoute Family",
        inviterId: currentUser.uid,
        inviterEmail: currentUser.email?.trim().toLowerCase() || "",
        inviteeId: invitedUserId,
        inviteeEmail: email,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // Update group
      await updateDoc(doc(db, "familyGroups", familyGroup.id), {
        pendingInviteeIds: arrayUnion(invitedUserId),
        updatedAt: serverTimestamp(),
      });

      // Create notification
      const notificationRef = doc(collection(db, "notifications"));
      await setDoc(notificationRef, {
        recipientId: invitedUserId,
        recipientEmail: email,
        senderId: currentUser.uid,
        type: "FAMILY_INVITATION",
        title: "Family Group Invitation",
        message: `${currentUser.displayName || "A user"} invited you to join "${familyGroup.name || "SafeRoute Family"}"`,
        inviteId: inviteRef.id,
        groupId: familyGroup.id,
        groupName: familyGroup.name || "SafeRoute Family",
        read: false,
        createdAt: serverTimestamp(),
      });

      setInviteEmail("");
      setShowInvite(false);
      notify("Family invitation sent successfully!");
    } catch (error) {
      console.error("Invite error:", error);
      notify(`Error: ${error.message || "Unable to send invitation"}`);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // ACCEPT FAMILY INVITATION
  // =========================================================

  const handleAcceptInvite = async (invite) => {
    if (!currentUser?.uid) {
      notify("Please log in first.");
      return;
    }

    if (!invite?.id || !invite?.groupId) {
      notify("Invalid family invitation.");
      return;
    }

    try {
      setSaving(true);

      const inviteRef = doc(db, "familyInvites", invite.id);
      const groupRef = doc(db, "familyGroups", invite.groupId);

      const inviteSnapshot = await getDoc(inviteRef);
      if (!inviteSnapshot.exists()) {
        notify("This invitation no longer exists.");
        return;
      }

      const inviteData = inviteSnapshot.data();
      if (inviteData.status !== "pending") {
        notify("This invitation has already been processed.");
        return;
      }

      if (inviteData.inviteeEmail !== currentUser.email?.toLowerCase()) {
        notify("You cannot accept this invitation.");
        return;
      }

      const groupSnapshot = await getDoc(groupRef);
      if (!groupSnapshot.exists()) {
        notify("This family group no longer exists.");
        return;
      }

      const groupData = groupSnapshot.data();
      if (groupData.members?.includes(currentUser.uid)) {
        notify("You are already a member of this family.");
        return;
      }

      if (familyGroup?.id) {
        notify("You are already a member of another family group.");
        return;
      }

      const memberRef = doc(db, "familyGroups", inviteData.groupId, "members", currentUser.uid);
      const notificationRef = doc(collection(db, "notifications"));

      const batch = writeBatch(db);

      batch.update(groupRef, {
        members: arrayUnion(currentUser.uid),
        pendingInviteeIds: arrayRemove(inviteData.inviteeId),
        updatedAt: serverTimestamp(),
      });

      batch.set(memberRef, {
        userId: currentUser.uid,
        email: currentUser.email?.toLowerCase() || "",
        displayName: currentUser.displayName || currentUser.email || "Family Member",
        role: "member",
        consentHighRiskAlerts: false,
        joinedAt: serverTimestamp(),
      });

      batch.update(inviteRef, {
        status: "accepted",
        respondedAt: serverTimestamp(),
      });

      if (inviteData.inviterId) {
        batch.set(notificationRef, {
          recipientId: inviteData.inviterId,
          senderId: currentUser.uid,
          type: "FAMILY_INVITATION_ACCEPTED",
          title: "Family Invitation Accepted",
          message: `${currentUser.displayName || "A user"} accepted your invitation to join "${inviteData.groupName || "SafeRoute Family"}"`,
          inviteId: invite.id,
          groupId: inviteData.groupId,
          groupName: inviteData.groupName || "SafeRoute Family",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      notify("Family invitation accepted successfully!");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error("Accept error:", error);
      notify(`Error: ${error.message || "Unable to accept invitation"}`);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // DECLINE FAMILY INVITATION
  // =========================================================

  const handleDeclineInvite = async (invite) => {
    if (!currentUser) {
      notify("Please log in first.");
      return;
    }

    if (!invite?.id) return;

    try {
      setSaving(true);

      const inviteRef = doc(db, "familyInvites", invite.id);
      const inviteSnapshot = await getDoc(inviteRef);

      if (!inviteSnapshot.exists()) {
        notify("This invitation no longer exists.");
        return;
      }

      const inviteData = inviteSnapshot.data();

      if (inviteData.inviteeEmail !== currentUser.email?.toLowerCase()) {
        notify("You cannot decline this invitation.");
        return;
      }

      if (inviteData.status !== "pending") {
        notify("This invitation has already been processed.");
        return;
      }

      const batch = writeBatch(db);

      batch.update(inviteRef, {
        status: "declined",
        respondedAt: serverTimestamp(),
      });

      if (inviteData.groupId) {
        batch.update(doc(db, "familyGroups", inviteData.groupId), {
          pendingInviteeIds: arrayRemove(inviteData.inviteeId),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      notify("Invitation declined.");
    } catch (error) {
      console.error("Decline error:", error);
      notify(`Error: ${error.message || "Unable to decline invitation"}`);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // HIGH-RISK ALERT CONSENT
  // =========================================================

  const handleConsentChange = async (event) => {
    const enabled = event.target.checked;

    if (!currentUser || !familyGroup?.id) return;

    const currentMember = familyMembers.find(
      (member) => member.userId === currentUser.uid
    );

    if (!currentMember?.id) {
      notify("Your family membership record could not be found.");
      return;
    }

    try {
      setHighRiskAlertsEnabled(enabled);
      await updateDoc(doc(db, "familyGroups", familyGroup.id, "members", currentMember.id), {
        consentHighRiskAlerts: enabled,
        consentUpdatedAt: serverTimestamp(),
      });

      setFamilyMembers((prevMembers) =>
        prevMembers.map((member) =>
          member.id === currentMember.id
            ? { ...member, consentHighRiskAlerts: enabled }
            : member
        )
      );

      notify(enabled ? "High-risk zone alerts enabled." : "High-risk zone alerts disabled.");
    } catch (error) {
      console.error("Consent update error:", error);
      setHighRiskAlertsEnabled(!enabled);
      notify(`Error: ${error.message || "Unable to update privacy settings."}`);
    }
  };

  // =========================================================
  // FORMAT TIME
  // =========================================================

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Just now";
    try {
      let date;
      if (timestamp?.toDate) date = timestamp.toDate();
      else if (timestamp?.seconds) date = new Date(timestamp.seconds * 1000);
      else date = new Date(timestamp);
      if (isNaN(date.getTime())) return "Recently";
      return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Recently";
    }
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="family-loading">
          <div className="family-loading-icon">👨‍👩‍👧</div>
          <h2>Loading Family Safety...</h2>
          <p>Checking your trusted family group and shared journeys.</p>
        </div>
      </DashboardLayout>
    );
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <DashboardLayout>
      <div className="family-safety-page">
        {/* HEADER */}
        <div className="family-header">
          <div>
            <span className="family-label">TRUSTED CONTACTS</span>
            <h1> Family Safety</h1>
            <p>Stay connected with trusted family members while travelling.</p>
          </div>
          <div className="family-header-actions">
            {familyGroup && (
              <>
                <button
                  type="button"
                  className="family-secondary-btn chat-btn"
                  onClick={() => navigate("/family-chat")}
                >
                  💬 Chat
                  {unreadMessages > 0 && (
                    <span className="chat-badge">{unreadMessages}</span>
                  )}
                </button>
                <button
                  type="button"
                  className="family-secondary-btn"
                  onClick={() => setShowInvite(true)}
                >
                  + Invite Member
                </button>
              </>
            )}
            {!familyGroup && (
              <button
                type="button"
                className="family-primary-btn"
                onClick={() => setShowCreateGroup(true)}
              >
                + Create Family Group
              </button>
            )}
          </div>
        </div>

        {/* INVITATIONS */}
        {receivedInvites.length > 0 && (
          <section className="family-section invitation-section">
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">PENDING</span>
                <h2>Family Invitations</h2>
              </div>
              <span className="notification-count">{receivedInvites.length}</span>
            </div>
            <div className="invitation-list">
              {receivedInvites.map((invite) => (
                <div className="invitation-card" key={invite.id}>
                  <div className="invitation-icon">👨‍👩‍👧</div>
                  <div className="invitation-info">
                    <strong>{invite.groupName || "SafeRoute Family"}</strong>
                    <p>Invited by {invite.inviterEmail || "a trusted contact"}</p>
                  </div>
                  <div className="invitation-actions">
                    <button
                      type="button"
                      className="accept-btn"
                      disabled={saving}
                      onClick={() => handleAcceptInvite(invite)}
                    >
                      {saving ? "Processing..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      className="decline-btn"
                      disabled={saving}
                      onClick={() => handleDeclineInvite(invite)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* NO GROUP */}
        {!familyGroup && (
          <section className="family-empty-card">
            <div className="family-empty-icon">👨‍👩‍👧‍👦</div>
            <h2>Create Your Trusted Family Group</h2>
            <p>
              Create a private family group and invite people you trust.
              You control when your journey and safety information is shared.
            </p>
            <button
              type="button"
              className="family-primary-btn"
              onClick={() => setShowCreateGroup(true)}
            >
              Create Family Group
            </button>
          </section>
        )}

        {/* FAMILY GROUP */}
        {familyGroup && (
          <>
            <section className="family-section">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">YOUR FAMILY</span>
                  <h2>{familyGroup.name || "SafeRoute Family"}</h2>
                </div>
                <div className="family-stats">
                  <span className="stat-item">
                    👥 {familyMembers.length} members
                  </span>
                  {familyGroup.messageCount > 0 && (
                    <span className="stat-item">
                      💬 {familyGroup.messageCount} messages
                    </span>
                  )}
                </div>
              </div>
              <div className="family-members-grid">
                {familyMembers.map((member) => {
                  const isYou = member.userId === currentUser?.uid;
                  return (
                    <div className="family-member-card" key={member.id}>
                      <div className="member-avatar">
                        {(member.displayName || member.email || "F")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="member-details">
                        <strong>
                          {member.displayName || "Family Member"}
                          {isYou && " (You)"}
                          {member.role === "admin" && " 👑"}
                        </strong>
                        <span>{member.email || ""}</span>
                      </div>
                      <div className="member-status">
                        <span className="status-dot" />
                        {member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Member"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* PRIVACY */}
            <section className="family-section privacy-section">
              <div className="privacy-icon">🛡️</div>
              <div className="privacy-content">
                <span className="section-eyebrow">PRIVACY CONTROL</span>
                <h2>High-Risk Zone Alerts</h2>
                <p>
                  When enabled, trusted family members who have also opted in can
                  receive a notification if you enter an area with an active
                  high-risk incident.
                </p>
                <div className="privacy-warning">
                  <span>🔐</span>
                  <div>
                    <strong>Your consent is required</strong>
                    <p>
                      This feature is disabled until you explicitly enable it.
                      You can turn it off at any time.
                    </p>
                  </div>
                </div>
                <label className="consent-toggle">
                  <input
                    type="checkbox"
                    checked={highRiskAlertsEnabled}
                    onChange={handleConsentChange}
                  />
                  <span className="toggle-slider" />
                  <span className="toggle-label">
                    Allow high-risk zone notifications
                  </span>
                </label>
                <div className="privacy-status">
                  <span
                    className={
                      highRiskAlertsEnabled
                        ? "privacy-status-dot enabled"
                        : "privacy-status-dot"
                    }
                  />
                  {highRiskAlertsEnabled
                    ? "High-risk alerts are enabled"
                    : "High-risk alerts are disabled"}
                </div>
              </div>
            </section>
          </>
        )}

        {/* CREATE GROUP MODAL */}
        {showCreateGroup && (
          <div className="family-modal-backdrop" onClick={() => setShowCreateGroup(false)}>
            <div className="family-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <span>FAMILY SAFETY</span>
                  <h2>Create Family Group</h2>
                </div>
                <button onClick={() => setShowCreateGroup(false)}>×</button>
              </div>
              <form onSubmit={handleCreateGroup}>
                <label>Family group name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Family"
                  maxLength={60}
                  autoFocus
                />
                <p className="modal-help">
                  You will become the owner of this trusted family group.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setShowCreateGroup(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="family-primary-btn" disabled={saving}>
                    {saving ? "Creating..." : "Create Group"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* INVITE MODAL */}
        {showInvite && (
          <div className="family-modal-backdrop" onClick={() => setShowInvite(false)}>
            <div className="family-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <span>{familyGroup?.name || "FAMILY GROUP"}</span>
                  <h2>Invite Trusted Member</h2>
                </div>
                <button onClick={() => setShowInvite(false)}>×</button>
              </div>
              <form onSubmit={handleInviteMember}>
                <label>Family member email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="family@example.com"
                  autoFocus
                />
                <p className="modal-help">
                  The person must use this email address with their SafeRoute BD
                  account to accept the invitation.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setShowInvite(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="family-primary-btn" disabled={saving}>
                    {saving ? "Sending..." : "Send Invitation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default FamilySafety;