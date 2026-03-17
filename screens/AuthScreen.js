// screens/AuthScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { auth } from '../firebase/firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  sendPasswordResetEmail,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

/**
 * IMPORTANT SETUP NOTE (Google Console)
 * ------------------------------------
 * If you use Expo Go + AuthSession proxy, your Google "Web application" OAuth client MUST allow:
 *   https://auth.expo.io/@<expo_username>/<app_slug>
 *
 * For your app.json (owner: "gregparky", slug: "closet-ai"), that is:
 *   https://auth.expo.io/@gregparky/closet-ai
 */

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  // ---- Read Expo config extras safely across SDK versions ----
  const extra =
    Constants.expoConfig?.extra ??
    Constants.manifest?.extra ??
    Constants.manifest2?.extra ??
    {};

  // Your app.json uses nested extra.google.{webClientId, iosClientId, androidClientId}
  const googleCfg = extra.google ?? {};
  const webClientId = googleCfg.webClientId ?? extra.googleWebClientId;
  const iosClientId = googleCfg.iosClientId ?? extra.googleIosClientId;
  const androidClientId = googleCfg.androidClientId ?? extra.googleAndroidClientId;
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient';
  const useExpoProxy = isExpoGo;
  const googleSupportedHere = !isExpoGo;

  const iosGoogleScheme = iosClientId
    ? `com.googleusercontent.apps.${String(iosClientId).replace('.apps.googleusercontent.com', '')}`
    : null;

  // Redirect handling:
  // - Expo Go requires the AuthSession proxy (useProxy: true)
  // - Dev builds / standalone use your scheme (useProxy: false)
  const redirectUri = useExpoProxy
    ? AuthSession.makeRedirectUri({
        useProxy: true,
        projectNameForProxy: '@gregparky/closet-ai',
      })
    : AuthSession.makeRedirectUri({
        native: iosGoogleScheme ? `${iosGoogleScheme}:/oauthredirect` : undefined,
        scheme: 'closetai',
        path: 'oauthredirect',
      });

  const REMEMBER_KEY = 'closetai_remember_login';
  const SAVED_EMAIL_KEY = 'closetai_saved_email';
  const [rememberLogin, setRememberLogin] = useState(false);
  const toggleRememberLogin = async (value) => {
    setRememberLogin(value);
    try {
      await AsyncStorage.setItem(REMEMBER_KEY, value ? 'true' : 'false');
      if (!value) {
        await AsyncStorage.removeItem(SAVED_EMAIL_KEY);
      } else if (email.trim()) {
        await AsyncStorage.setItem(SAVED_EMAIL_KEY, email.trim());
      }
    } catch (e) {
      console.log('Remember login save error:', e);
    }
  };


  function firebaseErrorToMessage(err) {
    const code = err?.code || '';
    if (code === 'auth/invalid-email') return 'That email address is not valid.';
    if (code === 'auth/user-not-found') return 'No account found for that email.';
    if (code === 'auth/wrong-password') return 'Incorrect password.';
    if (code === 'auth/email-already-in-use') return 'An account already exists with that email.';
    if (code === 'auth/weak-password') return 'Password is too weak.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
    return err?.message || 'Something went wrong. Please try again.';
  }

  const clearServerError = () => setServerError('');
  const markAllTouched = () => setTouched({ email: true, password: true });

  // Helpful logs for debugging
  useEffect(() => {
    console.log('GOOGLE: isExpoGo:', isExpoGo);
    console.log('GOOGLE: redirectUri:', redirectUri);
    console.log('GOOGLE: has webClientId?', !!webClientId);
    console.log('GOOGLE: has iosClientId?', !!iosClientId);
    console.log('GOOGLE: has androidClientId?', !!androidClientId);
  }, [isExpoGo, redirectUri, webClientId, iosClientId, androidClientId]);

  useEffect(() => {
    (async () => {
      try {
        const remember = await AsyncStorage.getItem(REMEMBER_KEY);
        const rememberBool = remember === 'true';
        setRememberLogin(rememberBool);

        if (rememberBool) {
          const savedEmail = await AsyncStorage.getItem(SAVED_EMAIL_KEY);
          if (savedEmail) setEmail(savedEmail);
        }
      } catch (e) {
        console.log('Remember login load error:', e);
      }
    })();
  }, []);

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
  const canSubmit =
    !loading && !googleLoading && !resetLoading && !hasClientErrors && email.trim() && password;

  // ----------------------------
  // Email/password auth
  // ----------------------------
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
    } catch (err) {
      setServerError(firebaseErrorToMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------
  // Forgot password
  // ----------------------------
  const handleForgotPassword = async () => {
    clearServerError();

    const trimmedEmail = email.trim();
    console.log('FORGOT PASSWORD pressed. email=', trimmedEmail);

    if (!trimmedEmail) {
      setServerError('Enter your email above, then tap “Forgot password?”.');
      return;
    }

    try {
      setResetLoading(true);
      await sendPasswordResetEmail(auth, trimmedEmail);

      Alert.alert(
        'Password reset sent',
        `If an account exists for ${trimmedEmail}, you’ll receive an email with reset instructions.`
      );
    } catch (err) {
      console.log('FORGOT PASSWORD error:', err);
      setServerError(firebaseErrorToMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  // ----------------------------
  // Google auth (Expo AuthSession -> Firebase)
  // ----------------------------
  const googleRequestConfig = useMemo(() => {
    if (useExpoProxy) {
      return {
        clientId: webClientId,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
      };
    }

    return {
      iosClientId,
      androidClientId,
      webClientId,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    };
  }, [androidClientId, iosClientId, redirectUri, useExpoProxy, webClientId]);

  const [request, response, promptAsync] = Google.useAuthRequest(googleRequestConfig);

  const handleGoogle = async () => {
    clearServerError();

    if (!googleSupportedHere) {
      setServerError(
        'Google sign-in is unavailable in Expo Go for this project. Use email/password here, or use an iOS development build for Google login testing.'
      );
      return;
    }

    if (!webClientId) {
      setServerError('Missing google webClientId in app.json (expo.extra.google.webClientId).');
      return;
    }

    if (!request) {
      setServerError('Google sign-in is still initializing. Try again in a second.');
      return;
    }

    try {
      setGoogleLoading(true);

      const result = await promptAsync({
        useProxy: useExpoProxy,
        showInRecents: true,
      });

      console.log('GOOGLE: promptAsync result:', JSON.stringify(result, null, 2));

      if (result?.type === 'dismiss') {
        setServerError('Google sign-in was dismissed.');
        return;
      }

      if (result?.type === 'error') {
        setServerError(result?.params?.error_description || 'Google sign-in failed.');
      }
    } catch (err) {
      console.log('GOOGLE: promptAsync exception:', err);
      setServerError(firebaseErrorToMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  // Inspect full response
  useEffect(() => {
    if (!response) return;
    console.log('GOOGLE RESPONSE (hook):', JSON.stringify(response, null, 2));
  }, [response]);

  // Exchange Google tokens -> Firebase credential
  useEffect(() => {
    if (response?.type !== 'success') return;

    const finish = async () => {
      try {
        setGoogleLoading(true);

        const idToken =
          response.authentication?.idToken ||
          response.params?.id_token ||
          response?.id_token;

        if (!idToken) {
          setServerError(
            'Google sign-in succeeded but no ID token was returned. ' +
              'Review the terminal logs for the full response and confirm your OAuth clients.'
          );
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

    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const switchMode = () => {
    clearServerError();
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
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
          {mode === 'login' ? 'Log in to access your closet.' : 'Sign up to start building your closet.'}
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, emailError ? styles.inputError : null]}
          placeholder="you@example.com"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={async (t) => {
            setEmail(t);
            if (serverError) clearServerError();
            if (rememberLogin) {
              try {
                await AsyncStorage.setItem(SAVED_EMAIL_KEY, t.trim());
              } catch (e) {}
            }
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          editable={!loading && !googleLoading && !resetLoading}
        />
        {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}

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
            editable={!loading && !googleLoading && !resetLoading}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((p) => !p)}
            disabled={loading || googleLoading || resetLoading}
            style={styles.showHideBtn}
          >
            <Text style={[styles.showHideText, (loading || googleLoading || resetLoading) && styles.disabledText]}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rememberRow}>
          <TouchableOpacity
            onPress={() => toggleRememberLogin(!rememberLogin)}
            disabled={loading || googleLoading || resetLoading}
            style={[
              styles.checkbox,
              rememberLogin ? styles.checkboxChecked : null,
              (loading || googleLoading || resetLoading) ? styles.checkboxDisabled : null,
            ]}
          />
          <TouchableOpacity
            onPress={() => toggleRememberLogin(!rememberLogin)}
            disabled={loading || googleLoading || resetLoading}
            style={{ flex: 1 }}
          >
            <Text style={styles.rememberText}>Remember login info</Text>
          </TouchableOpacity>
        </View>

        {mode === 'login' && (
          <TouchableOpacity
            onPress={handleForgotPassword}
            disabled={loading || googleLoading || resetLoading}
            style={{ marginTop: 10, alignItems: 'center' }}
          >
            {resetLoading ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.switchText, (loading || googleLoading) && styles.disabledText]}>
                Forgot password?
              </Text>
            )}
          </TouchableOpacity>
        )}

        {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
        {!!serverError && <Text style={styles.serverError}>{serverError}</Text>}

        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit ? styles.btnDisabled : null]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.primaryBtnText}>{mode === 'login' ? 'Log In' : 'Sign Up'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            loading || googleLoading || resetLoading || !request || !googleSupportedHere
              ? styles.btnDisabled
              : null,
          ]}
          onPress={handleGoogle}
          disabled={loading || googleLoading || resetLoading || !request || !googleSupportedHere}
        >
          {googleLoading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.secondaryBtnText}>
              {googleSupportedHere ? 'Continue with Google' : 'Google Login (Dev Build Only)'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={switchMode} disabled={loading || googleLoading || resetLoading}>
          <Text style={[styles.switchText, (loading || googleLoading || resetLoading) && styles.disabledText]}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </TouchableOpacity>

        {/* Optional: debug redirect */}
        {/* <Text style={{ marginTop: 10, fontSize: 11, color: '#999' }}>{redirectUri}</Text> */}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#fff' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 18, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 10 },

  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },

  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff' },
  passwordInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  showHideBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  showHideText: { fontSize: 14, fontWeight: '600' },

  errorText: { color: '#b00020', marginTop: 6, fontSize: 13 },
  serverError: { color: '#b00020', marginTop: 10, fontSize: 13 },

  inputError: { borderColor: '#b00020' },
  inputErrorBorder: { borderColor: '#b00020' },

  primaryBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#111' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  secondaryBtn: { marginTop: 10, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f2f2f2' },
  secondaryBtnText: { color: '#111', fontSize: 16, fontWeight: '700' },

  btnDisabled: { opacity: 0.55 },
  disabledText: { opacity: 0.6 },

  switchText: { marginTop: 12, textAlign: 'center', color: '#333', fontWeight: '600' },

  rememberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#111' },
  checkboxDisabled: { opacity: 0.5 },
  rememberText: { color: '#333', fontWeight: '600' },
});
