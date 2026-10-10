import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { notify } from "../utils/notify";

import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaShieldAlt,
} from "react-icons/fa";

import "./Register.css";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

function Register() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [agree, setAgree] = useState(false);

  // =========================================
  // REGISTER
  // =========================================

  const handleRegister = async (e) => {
    e.preventDefault();

    // -----------------------------------------
    // VALIDATION
    // -----------------------------------------

    if (!fullName.trim()) {
      notify("Please enter your full name.", "error");
      return;
    }

    if (!email.trim()) {
      notify("Please enter your email address.", "error");
      return;
    }

    if (password.length < 6) {
      notify("Password must be at least 6 characters.", "error");
      return;
    }

    if (password !== confirmPassword) {
      notify("Passwords do not match.", "error");
      return;
    }

    if (!agree) {
      notify("Please accept the Terms & Conditions.", "error");
      return;
    }

    setLoading(true);
    notify("Creating account...", "info");

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();

      // -----------------------------------------
      // 1. CREATE FIREBASE AUTH ACCOUNT
      // -----------------------------------------

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      const firebaseUser = userCredential.user;

      // -----------------------------------------
      // 2. CREATE USER DOCUMENT
      // -----------------------------------------

      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        fullName: cleanName,
        name: cleanName,
        email: cleanEmail,
        accountType: "user",
        role: "user",
        emailVerified: firebaseUser.emailVerified || false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // -----------------------------------------
      // 3. SEND EMAIL VERIFICATION
      // -----------------------------------------

      await sendEmailVerification(firebaseUser);

      // -----------------------------------------
      // SUCCESS
      // -----------------------------------------

      notify("🎉 Account created successfully!", "success");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1000);

    } catch (error) {
      console.error("Registration error:", error);

      switch (error.code) {
        case "auth/email-already-in-use":
          notify("This email is already registered. Please login instead.", "error");
          break;
        case "auth/invalid-email":
          notify("Please enter a valid email address.", "error");
          break;
        case "auth/weak-password":
          notify("Password is too weak. Please use at least 6 characters.", "error");
          break;
        case "auth/network-request-failed":
          notify("Network error. Please check your internet connection.", "error");
          break;
        case "auth/operation-not-allowed":
          notify("Email/password authentication is not enabled in Firebase.", "error");
          break;
        default:
          notify(error.message || "Registration failed. Please try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  // =========================================
  // UI
  // =========================================

  return (
    <div className="register-page">
      <div className="register-card">
        
        {/* LOGO */}
        <div className="register-logo">
          <FaShieldAlt />
          <h1>SafeRoute BD</h1>
        </div>

        {/* TITLE */}
        <h2>Create Account</h2>
        <p>Join our community and help make Bangladesh safer.</p>

        {/* FORM */}
        <form onSubmit={handleRegister}>

          {/* FULL NAME */}
          <div className="input-group">
            <FaUser className="icon" />
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              disabled={loading}
            />
          </div>

          {/* EMAIL */}
          <div className="input-group">
            <FaEnvelope className="icon" />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          {/* PASSWORD */}
          <div className="input-group">
            <FaLock className="icon" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
            />
            <span
              className="eye"
              onClick={() => !loading && setShowPassword(!showPassword)}
              role="button"
              tabIndex={0}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </span>
          </div>

          {/* CONFIRM PASSWORD */}
          <div className="input-group">
            <FaLock className="icon" />
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
            />
            <span
              className="eye"
              onClick={() => !loading && setShowConfirm(!showConfirm)}
              role="button"
              tabIndex={0}
            >
              {showConfirm ? <FaEyeSlash /> : <FaEye />}
            </span>
          </div>

          {/* TERMS */}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              disabled={loading}
            />
            <span>I agree to the Terms & Conditions</span>
          </label>

          {/* REGISTER BUTTON */}
          <button
            type="submit"
            className="register-button"
            disabled={loading}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        {/* FOOTER */}
        <div className="register-footer">
          Already have an account?
          <Link to="/login"> Login</Link>
        </div>
      </div>
    </div>
  );
}

export default Register;