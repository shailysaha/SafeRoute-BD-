import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";
import { notify } from "../utils/notify";
import "./FamilyChat.css";

// =========================================================
// NOTIFICATION HELPER
// =========================================================

const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
};

const sendPushNotification = (title, body, icon) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body: body,
      icon: icon || "/favicon.ico",
      tag: "family-chat",
      requireInteraction: true,
    });
  } catch (error) {
    console.error("Notification error:", error);
  }
};

// =========================================================
// MAIN COMPONENT
// =========================================================

function FamilyChat() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [familyGroup, setFamilyGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showReactions, setShowReactions] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const availableReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  // =========================================================
  // GET CURRENT USER
  // =========================================================

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (!user) {
        setLoading(false);
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // =========================================================
  // REQUEST NOTIFICATION PERMISSION
  // =========================================================

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // =========================================================
  // GET FAMILY GROUP
  // =========================================================

  useEffect(() => {
    if (!currentUser) return;

    const groupsQuery = query(
      collection(db, "familyGroups"),
      where("members", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      groupsQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          setFamilyGroup(null);
          setLoading(false);
          return;
        }

        const groupDoc = snapshot.docs[0];
        const groupData = {
          id: groupDoc.id,
          ...groupDoc.data(),
        };
        setFamilyGroup(groupData);
        setIsOwner(groupData.ownerId === currentUser.uid);

        try {
          const membersSnapshot = await getDocs(
            collection(db, "familyGroups", groupDoc.id, "members")
          );
          const members = membersSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setFamilyMembers(members);
        } catch (error) {
          console.error("Error loading members:", error);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Error loading family group:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // =========================================================
  // LOAD MESSAGES
  // =========================================================

  useEffect(() => {
    if (!familyGroup?.id) return;

    const messagesQuery = query(
      collection(db, "familyGroups", familyGroup.id, "messages"),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const newMessages = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .reverse();

        // Check for new messages for notification
        if (newMessages.length > messages.length) {
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.senderId !== currentUser?.uid) {
            sendPushNotification(
              `💬 ${familyGroup.name || "Family Chat"}`,
              `${lastMessage.senderName || "Someone"}: ${lastMessage.text?.substring(0, 60) || "New message"}`
            );
          }
        }

        setMessages(newMessages);
        scrollToBottom();
      },
      (error) => {
        console.error("Error loading messages:", error);
      }
    );

    return () => unsubscribe();
  }, [familyGroup, currentUser]);

  // =========================================================
  // TYPING INDICATORS
  // =========================================================

  useEffect(() => {
    if (!familyGroup?.id) return;

    const typingQuery = query(
      collection(db, "familyGroups", familyGroup.id, "typing"),
      where("timestamp", ">=", new Date(Date.now() - 5000))
    );

    const unsubscribe = onSnapshot(typingQuery, (snapshot) => {
      const users = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((user) => user.userId !== currentUser?.uid);
      setTypingUsers(users);
    });

    return () => unsubscribe();
  }, [familyGroup, currentUser]);

  const handleTyping = () => {
    if (!currentUser || !familyGroup) return;

    const typingRef = doc(
      db,
      "familyGroups",
      familyGroup.id,
      "typing",
      currentUser.uid
    );

    setDoc(typingRef, {
      userId: currentUser.uid,
      displayName: currentUser.displayName || currentUser.email || "Family Member",
      timestamp: serverTimestamp(),
    }).catch(err => console.error("Typing error:", err));

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      deleteDoc(typingRef).catch(err => console.error("Delete typing error:", err));
    }, 2000);
  };

  // =========================================================
  // MARK MESSAGE AS READ
  // =========================================================

  const markMessageAsRead = async (messageId) => {
    if (!currentUser || !familyGroup) return;

    try {
      const messageRef = doc(
        db,
        "familyGroups",
        familyGroup.id,
        "messages",
        messageId
      );
      await updateDoc(messageRef, {
        readBy: arrayUnion(currentUser.uid),
      });
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  };

  useEffect(() => {
    if (messages.length === 0 || !currentUser) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && !lastMessage.readBy?.includes(currentUser.uid)) {
      markMessageAsRead(lastMessage.id);
    }
  }, [messages, currentUser]);

  // =========================================================
  // SCROLL TO BOTTOM
  // =========================================================

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!currentUser || !familyGroup) {
      notify("Please join a family group first.");
      return;
    }

    const text = newMessage.trim();
    if (!text) {
      notify("Please enter a message.");
      return;
    }

    if (text.length > 500) {
      notify("Message is too long (max 500 characters).");
      return;
    }

    try {
      setSending(true);

      const messageData = {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email || "Family Member",
        senderEmail: currentUser.email || "",
        text: text,
        timestamp: serverTimestamp(),
        readBy: [currentUser.uid],
        type: "text",
      };

      await addDoc(
        collection(db, "familyGroups", familyGroup.id, "messages"),
        messageData
      );

      await updateDoc(doc(db, "familyGroups", familyGroup.id), {
        lastMessage: {
          text: text,
          timestamp: serverTimestamp(),
          senderName: currentUser.displayName || currentUser.email || "Family Member",
        },
        messageCount: (familyGroup.messageCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      notify(`Unable to send message: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  // =========================================================
  // IMAGE SHARING
  // =========================================================

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      notify("Image too large. Max 5MB.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      notify("Please select an image file.");
      return;
    }

    try {
      setUploadingImage(true);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageData = event.target.result;

        await addDoc(
          collection(db, "familyGroups", familyGroup.id, "messages"),
          {
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email || "Family Member",
            senderEmail: currentUser.email || "",
            type: "image",
            image: imageData,
            text: "📷 Image",
            timestamp: serverTimestamp(),
            readBy: [currentUser.uid],
          }
        );

        await updateDoc(doc(db, "familyGroups", familyGroup.id), {
          lastMessage: {
            text: "📷 Image",
            timestamp: serverTimestamp(),
            senderName: currentUser.displayName || currentUser.email || "Family Member",
          },
          messageCount: (familyGroup.messageCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });

        setUploadingImage(false);
        notify("Image sent!");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
      notify("Unable to upload image.");
      setUploadingImage(false);
    }
  };

  // =========================================================
  // LOCATION SHARING
  // =========================================================

  const shareLocation = () => {
    if (!navigator.geolocation) {
      notify("Geolocation not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          await addDoc(
            collection(db, "familyGroups", familyGroup.id, "messages"),
            {
              senderId: currentUser.uid,
              senderName: currentUser.displayName || currentUser.email || "Family Member",
              senderEmail: currentUser.email || "",
              type: "location",
              location: {
                lat: latitude,
                lng: longitude,
              },
              text: `📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              timestamp: serverTimestamp(),
              readBy: [currentUser.uid],
            }
          );

          await updateDoc(doc(db, "familyGroups", familyGroup.id), {
            lastMessage: {
              text: "📍 Shared location",
              timestamp: serverTimestamp(),
              senderName: currentUser.displayName || currentUser.email || "Family Member",
            },
            messageCount: (familyGroup.messageCount || 0) + 1,
            updatedAt: serverTimestamp(),
          });

          notify("Location shared!");
        } catch (error) {
          console.error("Error sharing location:", error);
          notify("Unable to share location.");
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        notify("Unable to get your location.");
      }
    );
  };

  // =========================================================
  // MESSAGE REACTIONS
  // =========================================================

  const addReaction = async (messageId, emoji) => {
    if (!currentUser || !familyGroup) return;

    try {
      const messageRef = doc(
        db,
        "familyGroups",
        familyGroup.id,
        "messages",
        messageId
      );
      await updateDoc(messageRef, {
        [`reactions.${emoji}`]: arrayUnion(currentUser.uid),
      });
    } catch (error) {
      console.error("Error adding reaction:", error);
    }
  };

  const removeReaction = async (messageId, emoji) => {
    if (!currentUser || !familyGroup) return;

    try {
      const messageRef = doc(
        db,
        "familyGroups",
        familyGroup.id,
        "messages",
        messageId
      );
      await updateDoc(messageRef, {
        [`reactions.${emoji}`]: arrayRemove(currentUser.uid),
      });
    } catch (error) {
      console.error("Error removing reaction:", error);
    }
  };

  // =========================================================
  // MESSAGE DELETION
  // =========================================================

  const deleteMessage = async (messageId) => {
    if (!currentUser || !familyGroup) return;

    if (!window.confirm("Delete this message?")) return;

    try {
      const messageRef = doc(
        db,
        "familyGroups",
        familyGroup.id,
        "messages",
        messageId
      );
      await deleteDoc(messageRef);
      notify("Message deleted.");
    } catch (error) {
      console.error("Error deleting message:", error);
      notify("Unable to delete message.");
    }
  };

  // =========================================================
  // GROUP ADMIN FEATURES
  // =========================================================

  const makeAdmin = async (userId) => {
    if (!isOwner) {
      notify("Only the group owner can make admins.");
      return;
    }

    try {
      const memberRef = doc(
        db,
        "familyGroups",
        familyGroup.id,
        "members",
        userId
      );
      await updateDoc(memberRef, {
        role: "admin",
      });
      notify("User is now an admin!");
    } catch (error) {
      console.error("Error making admin:", error);
      notify("Unable to make admin.");
    }
  };

  const removeAdmin = async (userId) => {
    if (!isOwner) {
      notify("Only the group owner can remove admins.");
      return;
    }

    try {
      const memberRef = doc(
        db,
        "familyGroups",
        familyGroup.id,
        "members",
        userId
      );
      await updateDoc(memberRef, {
        role: "member",
      });
      notify("Admin role removed.");
    } catch (error) {
      console.error("Error removing admin:", error);
      notify("Unable to remove admin.");
    }
  };

  const removeMember = async (userId) => {
    if (!isOwner) {
      notify("Only the group owner can remove members.");
      return;
    }

    if (userId === currentUser.uid) {
      notify("You cannot remove yourself.");
      return;
    }

    if (!window.confirm("Remove this member from the group?")) return;

    try {
      await updateDoc(doc(db, "familyGroups", familyGroup.id), {
        members: arrayRemove(userId),
      });

      await deleteDoc(doc(
        db,
        "familyGroups",
        familyGroup.id,
        "members",
        userId
      ));

      notify("Member removed from group.");
    } catch (error) {
      console.error("Error removing member:", error);
      notify("Unable to remove member.");
    }
  };

  // =========================================================
  // GET MEMBER NAME
  // =========================================================

  const getMemberName = (userId) => {
    const member = familyMembers.find((m) => m.userId === userId);
    return member?.displayName || member?.email || "Family Member";
  };

  // =========================================================
  // FORMAT TIME
  // =========================================================

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    try {
      let date;
      if (timestamp?.toDate) {
        date = timestamp.toDate();
      } else if (timestamp?.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }
      if (isNaN(date.getTime())) return "";
      return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="chat-loading">
          <div className="chat-loading-icon">💬</div>
          <h2>Loading Family Chat...</h2>
          <p>Connecting to your family group.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!familyGroup) {
    return (
      <DashboardLayout>
        <div className="chat-empty">
          <div className="chat-empty-icon">👨‍👩‍👧‍👦</div>
          <h2>No Family Group Found</h2>
          <p>
            Create or join a family group to start chatting with your trusted
            contacts.
          </p>
          <button
            className="chat-primary-btn"
            onClick={() => navigate("/family-safety")}
          >
            Go to Family Safety
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <DashboardLayout>
      <div className="family-chat-page">
        {/* HEADER */}
        <div className="chat-header">
          <div className="chat-header-left">
            <button
              className="chat-back-btn"
              onClick={() => navigate("/family-safety")}
            >
              ← Back
            </button>
            <div>
              <span className="chat-group-label">FAMILY CHAT</span>
              <h1>{familyGroup.name || "Family Group"}</h1>
              <span className="chat-member-count">
                {familyMembers.length} members • {messages.length} messages
                {isOwner && " 👑 Owner"}
              </span>
            </div>
          </div>
          <div className="chat-header-right">
            <span className="chat-online-indicator">🟢 Online</span>
          </div>
        </div>

        {/* MEMBERS BAR */}
        <div className="chat-members-bar">
          <div className="members-list">
            {familyMembers.map((member) => (
              <div className="member-chip" key={member.id}>
                <span className="member-avatar-small">
                  {(member.displayName || member.email || "F").charAt(0).toUpperCase()}
                </span>
                <span className="member-name">
                  {member.displayName || member.email || "Family Member"}
                  {member.userId === currentUser?.uid && " (You)"}
                  {member.role === "admin" && " 👑"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* TYPING INDICATOR */}
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.map((user) => (
              <span key={user.id}>
                {user.displayName} is typing...
              </span>
            ))}
          </div>
        )}

        {/* MESSAGES */}
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty-messages">
              <div>💬</div>
              <h3>No messages yet</h3>
              <p>Start the conversation with your family!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.senderId === currentUser?.uid;
              return (
                <div
                  key={message.id}
                  className={`chat-message ${isOwn ? "own-message" : "other-message"}`}
                >
                  {!isOwn && (
                    <span className="message-sender">
                      {message.senderName || getMemberName(message.senderId) || "Family Member"}
                    </span>
                  )}
                  <div className="message-bubble">
                    {message.type === "image" ? (
                      <img
                        src={message.image}
                        alt="Shared image"
                        className="chat-image"
                        onClick={() => window.open(message.image, "_blank")}
                      />
                    ) : message.type === "location" ? (
                      <div className="location-message">
                        <span>📍</span>
                        <a
                          href={`https://www.google.com/maps?q=${message.location.lat},${message.location.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View on Map
                        </a>
                        <small>{message.text}</small>
                      </div>
                    ) : (
                      <p>{message.text}</p>
                    )}
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                    {isOwn && (
                      <span className="read-receipt">
                        {message.readBy?.length > 1 ? "👀 Read" : "✓ Sent"}
                      </span>
                    )}

                    {/* Reactions */}
                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                      <div className="message-reactions">
                        {Object.entries(message.reactions).map(([emoji, users]) => (
                          <span
                            key={emoji}
                            className={`reaction-emoji ${users.includes(currentUser?.uid) ? "my-reaction" : ""}`}
                            onClick={() => {
                              if (users.includes(currentUser?.uid)) {
                                removeReaction(message.id, emoji);
                              } else {
                                addReaction(message.id, emoji);
                              }
                            }}
                          >
                            {emoji} {users.length}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Reaction Picker */}
                    {showReactions === message.id && (
                      <div className="reaction-picker">
                        {availableReactions.map((emoji) => (
                          <span
                            key={emoji}
                            onClick={() => {
                              addReaction(message.id, emoji);
                              setShowReactions(null);
                            }}
                          >
                            {emoji}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="message-actions">
                      <button
                        className="reaction-btn"
                        onClick={() => setShowReactions(showReactions === message.id ? null : message.id)}
                        title="Add reaction"
                      >
                        😊
                      </button>
                      {isOwn && (
                        <button
                          className="delete-message-btn"
                          onClick={() => deleteMessage(message.id)}
                          title="Delete message"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <form className="chat-input-area" onSubmit={handleSendMessage}>
          <button
            type="button"
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            title="Upload image"
          >
            {uploadingImage ? "⏳" : "📎"}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="chat-location-btn"
            onClick={shareLocation}
            title="Share Location"
          >
            📍
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message..."
            maxLength={500}
            disabled={sending}
            className="chat-input"
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="chat-send-btn"
          >
            {sending ? "⏳" : "📤"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}

export default FamilyChat;