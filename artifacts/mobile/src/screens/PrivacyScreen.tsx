import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  acknowledgePrivacyPolicy,
  deleteMyAccount,
  exportMyData,
  getPrivacyPolicyStatus,
  setContentPersonalizationConsent,
  setTrainingConsent,
  type PrivacyPolicyStatus,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Button,
  Card,
  CheckRow,
  Input,
  Label,
  SectionNote,
} from "../components/ui";
import { colors, fonts } from "../theme";
import { PRIVACY_POLICY_URL, PRIVACY_POLICY_VERSION } from "../config";

// Privacy policy sections 11 and 13 on mobile, using the same endpoints as the web app's
// Security Settings: see and acknowledge the policy, change the optional consents, download a
// copy of your data, and delete the account.

function PolicyCard({
  status,
  onAcknowledged,
}: Readonly<{
  status: PrivacyPolicyStatus | null;
  onAcknowledged: (s: PrivacyPolicyStatus) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = status?.acknowledgedVersion === PRIVACY_POLICY_VERSION;

  const acknowledge = async () => {
    setBusy(true);
    setError("");
    try {
      onAcknowledged(await acknowledgePrivacyPolicy(PRIVACY_POLICY_VERSION));
    } catch (err: any) {
      setError(err?.message || "Could not record that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card} topAccent>
      <Label>Privacy Policy</Label>
      <Text style={styles.body}>
        Version {PRIVACY_POLICY_VERSION}: what SecureAI collects, where it is
        stored, and how to download or delete it.
      </Text>
      {status && !current ? (
        <SectionNote>
          {status.acknowledgedVersion
            ? "We've updated our Privacy Policy since you last read it."
            : "Please read our Privacy Policy."}
        </SectionNote>
      ) : null}
      {status && current && status.acknowledgedAt ? (
        <Text style={styles.muted} testID="privacy-acknowledged">
          You acknowledged this version on{" "}
          {new Date(status.acknowledgedAt).toLocaleDateString()}.
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          variant="outline"
          size="sm"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          style={styles.flex}
        >
          Read it
        </Button>
        {status && !current ? (
          <Button
            size="sm"
            onPress={acknowledge}
            isLoading={busy}
            style={styles.flex}
            testID="privacy-ack"
          >
            I've read it
          </Button>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function ConsentCard() {
  const { user, refetchUser } = useAuth();
  const [busy, setBusy] = useState<"training" | "content" | null>(null);
  const [error, setError] = useState("");
  if (!user) return null;

  const change = async (which: "training" | "content", consent: boolean) => {
    setBusy(which);
    setError("");
    try {
      if (which === "training") await setTrainingConsent(consent);
      else await setContentPersonalizationConsent(consent);
      await refetchUser();
    } catch (err: any) {
      setError(err?.message || "Could not change that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <Label>Optional Consents</Label>
      <Text style={styles.body}>
        Each is separate from the others and from using the app. Untick one to
        withdraw it; it takes effect immediately.
      </Text>
      <View style={styles.consents}>
        <CheckRow
          checked={user.trainingConsentGiven}
          onChange={(v) => busy === null && void change("training", v)}
          testID="toggle-training-consent"
        >
          Let my activity (which actions I take, never what I upload) contribute
          to the behaviour-suggestion model.
        </CheckRow>
        <CheckRow
          checked={user.contentPersonalizationConsentGiven}
          onChange={(v) => busy === null && void change("content", v)}
          testID="toggle-content-consent"
        >
          Let the app read the text files I upload to build a private
          personalisation profile that only I can see.
        </CheckRow>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    const dest = `${FileSystem.cacheDirectory}secureai-data-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    try {
      await FileSystem.writeAsStringAsync(dest, await exportMyData());
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, { mimeType: "application/json" });
      } else {
        setError("This device can't share files.");
      }
    } catch (err: any) {
      setError(err?.message || "The download failed. Try again in a moment.");
    } finally {
      // The share sheet has closed; don't leave a plaintext copy in the app's cache.
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Label>Download My Data</Label>
      <Text style={styles.body}>
        A JSON file with your account, consents, devices, uploads, payments and
        security events. Your face template and password hash are not included.
      </Text>
      <Button
        variant="outline"
        onPress={download}
        isLoading={busy}
        testID="button-download-my-data"
      >
        Download my data
      </Button>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function DeleteCard() {
  const { user, refetchUser } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user) return null;

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteMyAccount(user.id, password);
      await refetchUser();
    } catch (err: any) {
      setError(err?.message || "Deletion failed.");
      setBusy(false);
    }
  };

  const confirm = () =>
    Alert.alert(
      "Delete your account?",
      "This removes your account, face template, passkeys, device keys and uploads. Payment and security records are kept as the Privacy Policy describes. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void remove() },
      ],
    );

  return (
    <Card style={[styles.card, styles.danger]}>
      <Label style={{ color: colors.destructive }}>Delete Account</Label>
      <Text style={styles.body}>Enter your password to confirm.</Text>
      <Input
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        testID="input-delete-password"
      />
      <Button
        variant="destructive"
        onPress={confirm}
        isLoading={busy}
        disabled={!password}
        style={styles.gapTop}
        testID="button-delete-account"
      >
        Delete my account
      </Button>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

export function PrivacyScreen() {
  const [status, setStatus] = useState<PrivacyPolicyStatus | null>(null);
  const load = useCallback(() => {
    getPrivacyPolicyStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  useEffect(load, [load]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PolicyCard status={status} onAcknowledged={setStatus} />
      <ConsentCard />
      <ExportCard />
      <DeleteCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  card: { gap: 12 },
  danger: { borderColor: `${colors.destructive}66` },
  body: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19 },
  muted: {
    fontFamily: fonts.mono,
    color: colors.mutedForeground,
    fontSize: 11,
  },
  consents: { gap: 14 },
  row: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  gapTop: { marginTop: 4 },
  error: { fontFamily: fonts.mono, color: colors.destructive, fontSize: 11 },
});
