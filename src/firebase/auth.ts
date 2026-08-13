import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword,
  updateProfile,
  deleteUser as fbDeleteUser,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  isSignInWithEmailLink,
  type User,
} from 'firebase/auth'
import { app } from './config'
import { isNativePlatform } from '@/utils/platform'

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export type AuthErrorCode =
  | 'invalid-email'
  | 'wrong-password'
  | 'user-not-found'
  | 'email-already-in-use'
  | 'weak-password'
  | 'too-many-requests'
  | 'network-request-failed'
  | 'operation-not-allowed'
  | 'invalid-credential'
  | 'user-disabled'
  | 'unknown'

export function mapAuthError(code: string): AuthErrorCode {
  switch (code) {
    case 'auth/invalid-email':
      return 'invalid-email'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'wrong-password'
    case 'auth/user-not-found':
      return 'user-not-found'
    case 'auth/email-already-in-use':
      return 'email-already-in-use'
    case 'auth/weak-password':
      return 'weak-password'
    case 'auth/too-many-requests':
      return 'too-many-requests'
    case 'auth/network-request-failed':
      return 'network-request-failed'
    case 'auth/operation-not-allowed':
      return 'operation-not-allowed'
    case 'auth/user-disabled':
      return 'user-disabled'
    default:
      return 'unknown'
  }
}

export function authErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case 'invalid-email':
      return 'That email address is not valid.'
    case 'wrong-password':
      return 'Incorrect email or password.'
    case 'user-not-found':
      return 'No account found with that email.'
    case 'email-already-in-use':
      return 'An account with that email already exists.'
    case 'weak-password':
      return 'Password must be at least 6 characters.'
    case 'too-many-requests':
      return 'Too many attempts. Please try again later.'
    case 'network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'operation-not-allowed':
      return 'This sign-in method is not enabled. Enable it in the Firebase console.'
    case 'user-disabled':
      return 'This account has been disabled.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider)
  return cred.user
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

export async function logout(): Promise<void> {
  await fbSignOut(auth)
}

export async function updateUserProfile(
  user: User,
  data: { displayName?: string; photoURL?: string | null },
): Promise<void> {
  await updateProfile(user, data)
}

export async function changeUserEmail(user: User, email: string): Promise<void> {
  await updateEmail(user, email)
}

export async function changeUserPassword(user: User, password: string): Promise<void> {
  await updatePassword(user, password)
}

export async function deleteFirebaseUser(user: User): Promise<void> {
  await fbDeleteUser(user)
}

export async function sendEmailLink(email: string): Promise<void> {
  // Reserved for future magic-link sign-in.
  await Promise.resolve(email)
}

export function isEmailLinkAuth(signInEmail: string): boolean {
  return isSignInWithEmailLink(auth, signInEmail)
}

export { isNativePlatform }
