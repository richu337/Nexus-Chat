import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import * as crypto from "crypto";

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// ── Gmail SMTP config ─────────────────────────────────────────────────────
// Set via: firebase functions:config:set gmail.email="..." gmail.password="..."
const config = functions.config();
const GMAIL_EMAIL = config?.gmail?.email ?? "nexuschat.dev@gmail.com";
const GMAIL_APP_PASSWORD = config?.gmail?.password ?? "";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_EMAIL,
    pass: GMAIL_APP_PASSWORD,
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// ── sendOtp ────────────────────────────────────────────────────────────────
export const sendOtp = functions.https.onCall(async (data, context) => {
    const { email, name } = data as { email?: string; name?: string };

    if (!email || typeof email !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Email is required.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limiting: max 3 OTPs per email per 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentOtps = await db
      .collection("otps")
      .where("email", "==", normalizedEmail)
      .where("createdAt", ">", tenMinAgo)
      .get();

    if (recentOtps.size >= 3) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many OTP requests. Please wait a few minutes and try again."
      );
    }

    // Generate and store OTP
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.collection("otps").add({
      email: normalizedEmail,
      otpHash: hashedOtp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false,
    });

    // Send email
    const displayName = name?.trim() || "there";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 24px; color: #1e1b4b; margin: 0;">Nexus Chat</h1>
        </div>
        <p style="font-size: 16px; color: #334155; margin: 0 0 16px;">Hi ${displayName},</p>
        <p style="font-size: 16px; color: #334155; margin: 0 0 24px;">Use the following code to verify your email address:</p>
        <div style="text-align: center; margin: 0 0 24px;">
          <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; background: #eef2ff; padding: 16px 32px; border-radius: 12px;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #94a3b8; margin: 0 0 8px;">This code expires in 5 minutes.</p>
        <p style="font-size: 14px; color: #94a3b8; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"Nexus Chat" <${GMAIL_EMAIL}>`,
        to: normalizedEmail,
        subject: "Your Nexus Chat verification code",
        html,
      });
    } catch (err) {
      console.error("Failed to send OTP email:", err);
      throw new functions.https.HttpsError("internal", "Failed to send verification email.");
    }

    return { success: true };
});

// ── verifyOtp ──────────────────────────────────────────────────────────────
export const verifyOtp = functions.https.onCall(async (data, context) => {
    const { email, otp, password, name, username } = data as {
      email?: string;
      otp?: string;
      password?: string;
      name?: string;
      username?: string;
    };

    if (!email || !otp || !password || !name || !username) {
      throw new functions.https.HttpsError("invalid-argument", "All fields are required.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();
    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (normalizedOtp.length !== 6 || !/^\d{6}$/.test(normalizedOtp)) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid OTP format.");
    }

    // Find the OTP document
    const otpQuery = await db
      .collection("otps")
      .where("email", "==", normalizedEmail)
      .where("used", "==", false)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (otpQuery.empty) {
      throw new functions.https.HttpsError("not-found", "No verification code found. Please request a new one.");
    }

    const otpDoc = otpQuery.docs[0];
    const otpData = otpDoc.data();

    // Check expiry
    const expiresAt = otpData.expiresAt as admin.firestore.Timestamp;
    if (expiresAt.toDate() < new Date()) {
      throw new functions.https.HttpsError("deadline-exceeded", "This code has expired. Please request a new one.");
    }

    // Verify hash
    const inputHash = hashOtp(normalizedOtp);
    if (inputHash !== otpData.otpHash) {
      throw new functions.https.HttpsError("invalid-argument", "Incorrect code. Please try again.");
    }

    // Mark OTP as used
    await otpDoc.ref.update({ used: true });

    // Check if username is already taken
    const usernameDoc = await db.collection("usernames").doc(trimmedUsername).get();
    if (usernameDoc.exists) {
      throw new functions.https.HttpsError("already-exists", "This username is already taken.");
    }

    // Create Firebase Auth account
    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.createUser({
        email: normalizedEmail,
        password: password,
        displayName: trimmedName,
        emailVerified: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("EMAIL_EXISTS")) {
        throw new functions.https.HttpsError("already-exists", "An account with this email already exists.");
      }
      throw new functions.https.HttpsError("internal", "Failed to create account.");
    }

    const uid = userRecord.uid;

    // Create user profile in Firestore
    await db.collection("users").doc(uid).set({
      uid,
      name: trimmedName,
      username: trimmedUsername,
      usernameLowercase: trimmedUsername,
      email: normalizedEmail,
      photoURL: null,
      bio: null,
      online: false,
      lastSeen: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      settings: {
        messageNotifications: true,
        friendRequestNotifications: true,
        showOnlineStatus: true,
        showLastSeen: true,
        profileDiscoverable: true,
      },
    });

    // Reserve username
    await db.collection("usernames").doc(trimmedUsername).set({
      uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create custom token for the client to sign in with
    const customToken = await auth.createCustomToken(uid);

    return { customToken, uid };
});
