import { useEffect } from "react";

import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

function NotificationListener() {
  useEffect(() => {
    const user = auth.currentUser;

    if (!user) return;

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {

          // Only react to NEW notifications
          if (change.type === "added") {

            const notification =
              change.doc.data();

            // Avoid showing old notifications
            const notificationTime =
              notification.createdAt?.toDate?.();

            if (!notificationTime) return;

            const now = new Date();

            const difference =
              now.getTime() -
              notificationTime.getTime();

            // Only show notifications created
            // within the last 10 seconds
            if (difference <= 10000) {

              if (
                notification.type === "SOS"
              ) {
                alert(
                  `🚨 EMERGENCY SOS\n\n${notification.message}\n\n📍 ${
                    notification.displayName ||
                    notification.area ||
                    "Location available"
                  }`
                );
              }
            }
          }
        });
      },
      (error) => {
        console.error(
          "Notification listener error:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  return null;
}

export default NotificationListener;
