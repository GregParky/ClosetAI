// screens/AuthScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig'; // adjust if your path differs
// If you already have Google sign-in wired, import it here and call it in handleGoogle()
/*
import { signInWithGoogle } from '../firebase/authService';
*/
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  const [touched, setTouched] = useState({ email: false, password: false });

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [serverError, setServerError] = useState(''); // firebase / auth errors (inline)

  // ----------------------------
  // Validation
  // ----------------------------
  const emailError = useMemo(() => {
    if (!touched.email) return '';
    if (!email.trim()) return 'Email is required.';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email.trim())) return 'Please enter a valid email address.';
    return '';
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return '';
    if (!password) return 'Password is required.';
    if (mode === 'signup' && password.length < 6) return 'Password must be at least 6 characters.';
    return '';
  }, [password, touched.password, mode]);

  const hasClientErrors = Boolean(emailError || passwordError);

  const canSubmit = !loading && !googleLoading && !hasClientErrors && email.trim() && password;

  const clearServerError = () => setServerError('');

  const firebaseErrorToMessage = (err) => {
    const code = err?.code || '';

    // Common helpful mappings
    if (code === 'auth/invalid-email') return 'That email address is not valid.';
    if (code === 'auth/user-not-found') return 'No account found for that email.';
    if (code === 'auth/wrong-password') return 'Incorrect password.';
    if (code === 'auth/email-already-in-use') return 'An account already exists with that email.';
    if (code === 'auth/weak-password') return 'Password is too weak.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';

    // Fallback
    return err?.message || 'Something went wrong. Please try again.';
  };

  // ----------------------------
  // Handlers
  // ----------------------------
  const markAllTouched = () => setTouched({ email: true, password: true });

  const handleSubmit = async () => {
    clearServerError();
    markAllTouched();

    if (!canSubmit) return;

    try {
      setLoading(true);

      const trimmedEmail = email.trim();

      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }

      // Navigation should auto-switch based on auth state via AuthProvider
    } catch (err) {
      setServerError(firebaseErrorToMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const extra =
    Constants.expoConfig?.extra ??
    Constants.manifest?.extra ??
    Constants.manifest2?.extra ??
    {};

  const isExpoGo = Constants.appOwnership === 'expo';

  // ✅ Expo Go on iOS requires iosClientId to be set,
  // and proxy flow works best with webClientId also present.
  const googleConfig = {
    webClientId: extra.googleWebClientId,
    iosClientId: extra.googleIosClientId,
    // androidClientId is optional for Expo Go on iOS; you can add it later if testing Android
    // androidClientId: extra.googleAndroidClientId,
    scopes: ['profile', 'email'],
  };

  console.log('googleWebClientId?', !!extra.googleWebClientId);
  console.log('googleIosClientId?', !!extra.googleIosClientId);
  console.log('slug/owner:', Constants.expoConfig?.slug, Constants.expoConfig?.owner);

  const [request, response, promptAsync] = Google.useAuthRequest(googleConfig);



  const handleGoogle = async () => {
    clearServerError();

    try {
      setGoogleLoading(true);
      await promptAsync({ useProxy: isExpoGo });
    } catch (err) {
      setServerError(firebaseErrorToMessage(err));
      setGoogleLoading(false);
    }
  };

  React.useEffect(() => {
    if (!response) return;
    console.log('GOOGLE RESPONSE:', JSON.stringify(response, null, 2));
  }, [response]);

  React.useEffect(() => {
    if (response?.type !== 'success') return;

    const finishGoogleSignIn = async () => {
      try {
        setServerError('');
        setGoogleLoading(true);

        const idToken =
          response.authentication?.idToken ||
          response.params?.id_token;

        if (!idToken) {
          setServerError('Google sign-in failed to return an ID token.');
          return;
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } catch (err) {
        setServerError(firebaseErrorToMessage(err));
      } finally {
        setGoogleLoading(false);
      }
    };

    finishGoogleSignIn();
  }, [response]);


  const switchMode = () => {
    clearServerError();
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
    // Keep inputs; but reset touched so errors don’t flash instantly
    setTouched({ email: false, password: false });
  };

  // ----------------------------
  // UI
  // ----------------------------
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.subtitle}>
          {mode === 'login'
            ? 'Log in to access your closet.'
            : 'Sign up to start building your closet.'}
        </Text>

        {/* Email */}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, emailError ? styles.inputError : null]}
          placeholder="you@example.com"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (serverError) clearServerError();
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          editable={!loading && !googleLoading}
        />
        {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}

        {/* Password */}
        <Text style={styles.label}>Password</Text>
        <View style={[styles.passwordRow, passwordError ? styles.inputErrorBorder : null]}>
          <TextInput
            style={styles.passwordInput}
            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (serverError) clearServerError();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
            editable={!loading && !googleLoading}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((p) => !p)}
            disabled={loading || googleLoading}
            style={styles.showHideBtn}
          >
            <Text style={[styles.showHideText, (loading || googleLoading) && styles.disabledText]}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>
        {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}

        {/* Server/Firebase error */}
        {!!serverError && <Text style={styles.serverError}>{serverError}</Text>}

        {/* Primary button */}
        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit ? styles.btnDisabled : null]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === 'login' ? 'Log In' : 'Sign Up'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Google button */}
        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            (loading || googleLoading || !request) ? styles.btnDisabled : null,
          ]}
          onPress={handleGoogle}
          disabled={loading || googleLoading || !request}
        >
          {googleLoading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.secondaryBtnText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        {/* Switch mode */}
        <TouchableOpacity onPress={switchMode} disabled={loading || googleLoading}>
          <Text style={[styles.switchText, (loading || googleLoading) && styles.disabledText]}>
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Log in'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#fff' },

  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 18,
    backgroundColor: '#fff',
  },

  title: { fontSize: 26, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },

  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 10 },

  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },

  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  showHideBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  showHideText: { fontSize: 14, fontWeight: '600' },

  errorText: { color: '#b00020', marginTop: 6, fontSize: 13 },
  serverError: { color: '#b00020', marginTop: 10, fontSize: 13 },

  inputError: { borderColor: '#b00020' },
  inputErrorBorder: { borderColor: '#b00020' },

  primaryBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#111',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  secondaryBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
  },
  secondaryBtnText: { color: '#111', fontSize: 16, fontWeight: '700' },

  btnDisabled: { opacity: 0.55 },
  disabledText: { opacity: 0.6 },

  switchText: { marginTop: 12, textAlign: 'center', color: '#333', fontWeight: '600' },
});
